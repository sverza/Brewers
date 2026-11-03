/* Resolve the existing manifest URLs against this copy of the static site. */
(function (global) {
  'use strict';
  const root = new URL('../', document.currentScript.src);
  const rawBase = 'https://raw.githubusercontent.com/sverza/Brewers/main/';

  function url(value) {
    if (typeof value !== 'string' || !value) throw new Error('Percorso dati mancante');
    const path = value.startsWith(rawBase) ? value.slice(rawBase.length) : value;
    if (path.split('/').some(part => decodeURIComponent(part) === '..')) {
      throw new Error('Percorso dati non valido');
    }
    const resolved = new URL(path, root);
    if (resolved.origin !== root.origin || !resolved.pathname.startsWith(root.pathname)) {
      throw new Error('Percorso dati esterno al sito');
    }
    return resolved.href;
  }

  // This is the existing published archive, not a calendar for 2026/27.
  // A later static data feed can replace this path without changing the renderers.
  const calendarUrl = url('partite/Stagione_2025_26/calendario.json');

  async function resolveMatch(slug) {
    const requested = String(slug || '').replace(/^partite\//, '').replace(/\.json$/i, '');
    const response = await fetch(url('partite/manifest.json'));
    if (!response.ok) throw new Error('Elenco partite non disponibile');
    const files = await response.json();
    if (!Array.isArray(files)) throw new Error('Elenco partite non valido');
    const matches = files.filter(file => {
      if (!file || typeof file.name !== 'string' || typeof file.download_url !== 'string') return false;
      const path = decodeURIComponent(new URL(url(file.download_url)).pathname.slice(root.pathname.length));
      if (!path.startsWith('partite/') || !path.endsWith('.json')) return false;
      return file.name.replace(/\.json$/i, '') === requested ||
        path.slice('partite/'.length).replace(/\.json$/i, '') === requested;
    });
    if (matches.length !== 1) throw new Error(matches.length ? 'Collegamento partita ambiguo' : 'Partita non presente in archivio');
    return { ...matches[0], download_url: url(matches[0].download_url) };
  }

  function matchFiles(files) {
    if (!Array.isArray(files)) throw new Error('Elenco partite non valido');
    const seen = new Map();
    return files.filter(file => {
      if (!file || typeof file.name !== 'string' || !file.name.endsWith('.json') ||
          typeof file.season !== 'string' || !file.season) throw new Error('Voce manifest non valida');
      const key = url(file.download_url);
      if (seen.has(key)) {
        const previous = seen.get(key);
        if (previous.name !== file.name || previous.season !== file.season) throw new Error('Manifest incoerente');
        return false;
      }
      seen.set(key, file);
      return true;
    });
  }

  function cacheGet(key, ttl, validate = () => true) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      const age = Date.now() - entry.ts;
      if (entry.version !== 1 || !Number.isFinite(entry.ts) || age < 0 || age > ttl || !validate(entry.data)) {
        throw new Error('Cache scaduta o incompatibile');
      }
      return entry.data;
    } catch (_) {
      try { sessionStorage.removeItem(key); } catch (_) { /* storage unavailable */ }
      return null;
    }
  }

  function cacheSet(key, data) {
    try { sessionStorage.setItem(key, JSON.stringify({version:1, ts:Date.now(), data})); }
    catch (_) { /* The site also works with storage disabled. */ }
  }

  function boxSignature(files) {
    return JSON.stringify(files.map(file => [url(file.download_url), file.season]));
  }

  function readBoxRows(files, ttl) {
    const allowed = new Map(files.map(file => [url(file.download_url), file.season]));
    const entry = cacheGet('statsPage_boxRows_v4', ttl, data => {
      if (!data || data.signature !== boxSignature(files) || !Array.isArray(data.rows) ||
          data.rowCount !== data.rows.length || data.completedFiles !== files.length) return false;
      const seen = new Set();
      return data.rows.every(row => {
        if (!row || typeof row.id !== 'string' || !row.id || typeof row.opponent !== 'string' ||
            typeof row.source !== 'string' || !allowed.has(row.source) || typeof row.season !== 'string' ||
            allowed.get(row.source) !== row.season || !Number.isInteger(row.rowIndex) || row.rowIndex < 0 ||
            typeof row.date !== 'string' || !Number.isFinite(new Date(row.date).getTime()) ||
            !['number','pts','reb','asst','stl','blk','ftm','tpm'].every(k => Number.isFinite(row[k]))) return false;
        const key = row.source + '#' + row.rowIndex;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
    return entry ? entry.rows.map(row => ({...row, date:new Date(row.date)})) : null;
  }

  function saveBoxRows(files, rows) {
    cacheSet('statsPage_boxRows_v4', {signature:boxSignature(files), completedFiles:files.length, rowCount:rows.length, rows});
  }

  global.BrewersData = { url, calendarUrl, resolveMatch, matchFiles, cacheGet, cacheSet, readBoxRows, saveBoxRows };
})(window);
