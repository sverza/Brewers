import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import {
  checkServedRelease, downloadTransfer, materialize, recoveryBuildNeeded, verifyServed,
} from './sports-publication.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const currentPath = 'sports/v1/current.json';
const currentText = await fs.readFile(path.join(root, currentPath), 'utf8');
const current = JSON.parse(currentText);
const files = { [currentPath]: currentText };
for (const row of current.files) files[row.path] = await fs.readFile(path.join(root, row.path), 'utf8');
const artifact = { format: 'brewers-public-sports-artifact-v1', current, files };
const wrap = artifact => ({
  format: 'brewers-public-transfer-v1', environment: 'production', projectId: 'brewers-hub', artifact,
});
const hash = value => createHash('sha256').update(value).digest('hex');
const contract = runInNewContext(
  await fs.readFile(path.join(root, 'ServerCode/sports/contract.js'), 'utf8') + '\nBrewersSports;',
);
const { generatedAt, releaseId, files: index, ...semanticFields } = current;
const documents = Object.fromEntries(index.map(({ path: filename }) => {
  const { schemaVersion, releaseId, ...document } = JSON.parse(files[filename]);
  return [filename.split('/').slice(4).join('/'), document];
}));
const newer = contract.packageArtifact({
  ...semanticFields,
  completeness: current.completeness === 'complete' ? 'partial' : 'complete',
  documents,
}, hash, new Date(Date.parse(generatedAt) + 60_000).toISOString());
const date = '2026-11-24';
const drive = {
  pointerId: 'test-pointer-id', folderId: 'test-folder-id', scriptId: 'test-script-id',
  token: 'synthetic', dailyDate: date,
};

function simulateDrive(envelope, marker) {
  const requests = [];
  const raw = JSON.stringify(envelope);
  const artifactId = 'test-artifact-id';
  const fetcher = async url => {
    const parsed = new URL(url);
    const name = parsed.pathname.split('/').at(-1);
    requests.push(name);
    if (parsed.searchParams.has('fields')) {
      return Response.json({
        id: name, parents: [drive.folderId], mimeType: 'application/json',
        properties: {
          scriptId: drive.scriptId, sportsDailyReady: marker,
          brewersSportsProd: name === drive.pointerId ? 'public-pointer' : 'public-artifact',
        },
      });
    }
    if (name === artifactId) return new Response(raw);
    return Response.json({
      format: 'brewers-public-pointer-v1', environment: 'production', projectId: 'brewers-hub',
      releaseId: envelope.artifact.current.releaseId, artifactFileId: artifactId, sha256: hash(raw),
    });
  };
  return { requests, fetcher };
}

const origin = 'https://example.invalid/';
const serve = data => async url => {
  const body = data[new URL(url).pathname.slice(1)];
  return body === undefined ? new Response(null, { status: 404 }) : new Response(body);
};
async function temp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sports-publisher-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('recovery works independently when the primary run was missed', async t => {
  const dest = await temp(t);
  await materialize(wrap(artifact), dest);
  const source = simulateDrive(wrap(newer), date + ':' + newer.current.releaseId);
  const transfer = await downloadTransfer({ ...drive, fetcher: source.fetcher });
  assert.equal(transfer.artifact.current.releaseId, newer.current.releaseId);
  const check = await checkServedRelease(origin, transfer.artifact.current, { fetcher: serve(files) });
  assert.equal(check.status, 'publication-needed');
  assert.equal((await materialize(transfer, dest)).status, 'prepared');
  assert.equal((await verifyServed(origin, check.releaseId, { fetcher: serve(newer.files) })).status, 'served-and-validated');
});

test('missing, stale or mismatched daily markers defer before fetching the artifact', async () => {
  for (const marker of [undefined, '2026-11-23:' + releaseId, date + ':' + newer.current.releaseId]) {
    const source = simulateDrive(wrap(artifact), marker);
    assert.equal(await downloadTransfer({ ...drive, fetcher: source.fetcher }), null);
    assert.deepEqual(source.requests, [drive.pointerId, drive.pointerId]);
  }
});

test('no-change validates all public files and writes nothing locally', async () => {
  const source = simulateDrive(wrap(artifact), date + ':' + releaseId);
  const transfer = await downloadTransfer({ ...drive, fetcher: source.fetcher });
  assert.deepEqual(await materialize(transfer, root), { status: 'unchanged', releaseId, filesWritten: 0 });
  assert.deepEqual(await checkServedRelease(origin, current, { fetcher: serve(files) }), {
    status: 'served-and-validated', releaseId, files: current.files.length,
  });
  await assert.rejects(
    checkServedRelease(origin, current, { fetcher: serve({ ...files, [index[0].path]: 'corrupt' }) }),
    /ARTIFACT_HASH/,
  );
});

test('older or ambiguous releases cannot override Git or the public site', async t => {
  const dest = await temp(t);
  await materialize(wrap(newer), dest);
  await assert.rejects(materialize(wrap(artifact), dest), /STALE_OR_AMBIGUOUS_RELEASE/);
  await assert.rejects(checkServedRelease(origin, current, { fetcher: serve(newer.files) }), /STALE_OR_AMBIGUOUS_RELEASE/);
  const ambiguous = { ...current, generatedAt: newer.current.generatedAt };
  await assert.rejects(checkServedRelease(origin, ambiguous, { fetcher: serve(newer.files) }), /STALE_OR_AMBIGUOUS_RELEASE/);
  assert.equal(await fs.readFile(path.join(dest, currentPath), 'utf8'), newer.files[currentPath]);
});

test('retry a missed or failed Pages request without duplicating queued or completed builds', () => {
  const target = '1'.repeat(40);
  const decide = latest => recoveryBuildNeeded({ target, remoteHead: target, latest });
  assert.equal(decide({ status: 'built', commit: '2'.repeat(40) }), true);
  assert.equal(decide({ status: 'errored', commit: target }), true);
  for (const status of ['queued', 'building', 'built']) assert.equal(decide({ status, commit: target }), false);
  assert.throws(() => decide({ status: 'unknown' }), /PAGES_BUILD_STATUS_UNKNOWN/);
});

test('a concurrent Git writer wins without a force push or stale Pages recovery', async t => {
  const dir = await temp(t);
  const remote = path.join(dir, 'remote.git');
  const primary = path.join(dir, 'primary');
  const other = path.join(dir, 'other');
  const git = (cwd, ...args) => execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const commit = (repo, msg) => git(repo, '-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', msg);
  git(dir, 'init', '--bare', '-b', 'main', remote);
  git(dir, 'clone', remote, primary);
  commit(primary, 'baseline');
  git(primary, 'push', 'origin', 'HEAD:main');
  git(dir, 'clone', remote, other);
  const target = git(primary, 'rev-parse', 'HEAD');
  commit(other, 'concurrent publication');
  git(other, 'push', 'origin', 'HEAD:main');
  const [remoteHead] = git(primary, 'ls-remote', 'origin', 'refs/heads/main').split(/\s/);
  assert.throws(() => recoveryBuildNeeded({ target, remoteHead, latest: { status: 'errored' } }), /MAIN_ADVANCED/);
  commit(primary, 'stale publication');
  assert.throws(() => git(primary, 'push', 'origin', 'HEAD:main'), /rejected/);
  assert.equal(git(primary, 'ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0], remoteHead);
});
