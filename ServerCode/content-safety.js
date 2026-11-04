/* Context-specific rendering guards for public JSON. No data normalization or calculations. */
(function () {
  'use strict';
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const escape = value => text(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  function url(value, protocols) {
    const raw = text(value).trim();
    if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return '';
    try {
      const parsed = new URL(raw, document.baseURI);
      return protocols.includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : '';
    } catch (_) { return ''; }
  }
  const link = value => url(value, ['http:', 'https:', 'mailto:', 'tel:']);
  const resource = value => url(value, ['http:', 'https:']);
  // Encode CSS delimiters before embedding a URL in an HTML style attribute.
  const cssImage = value => escape(resource(value).replace(/[\s'"()\\<>`]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase()));

  function isFile(value) {
    return typeof value === 'string' && value.length > 0 && value !== '.' && value !== '..' &&
      !/[\/\\\u0000-\u001f\u007f]/.test(value) && !/%(?:2e|2f|5c)/i.test(value);
  }
  function file(value) {
    if (!isFile(value)) throw new Error('Identificativo contenuto non valido');
    return encodeURIComponent(value);
  }

  function article(target, body) {
    const markup = '<p>' + text(body).replace(/\n/g, '</p><p>').replace(/\.capo\./g, '</p><p>') + '</p>';
    if (!window.DOMPurify || !window.DOMPurify.isSupported) {
      target.textContent = text(body); // Fail closed if the local sanitizer cannot load.
      return;
    }
    const fragment = window.DOMPurify.sanitize(markup, {
      ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','ul','ol','li','blockquote',
        'h2','h3','h4','a','img','code','pre','hr','span','div','table','thead','tbody','tr','th','td'],
      ALLOWED_ATTR: ['href','src','alt','title','width','height','colspan','rowspan'],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      RETURN_DOM_FRAGMENT: true
    });
    fragment.querySelectorAll('[href]').forEach(node => {
      const safe = link(node.getAttribute('href'));
      if (safe) node.setAttribute('href', safe); else node.removeAttribute('href');
    });
    fragment.querySelectorAll('[src]').forEach(node => {
      const safe = resource(node.getAttribute('src'));
      if (safe) node.setAttribute('src', safe); else node.removeAttribute('src');
    });
    target.replaceChildren(fragment);
  }

  window.BrewersSafe = Object.freeze({text, escape, link, resource, cssImage, isFile, file, article,
    linkAttr: value => escape(link(value)), imageAttr: value => escape(resource(value))});
})();
