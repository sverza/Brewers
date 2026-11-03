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

  global.BrewersData = { url, calendarUrl, resolveMatch };
})(window);
