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

  global.BrewersData = { url };
})(window);
