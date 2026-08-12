(() => {
  const root = document.body?.dataset.root || '/';
  const spriteUrl = `${String(root).replace(/\/$/, '/') || '/'}icons.svg`;
  const lucideNames = new Set([
    'house', 'file-text', 'link', 'book-open', 'user', 'chevron-down', 'menu',
    'sun-moon', 'palette', 'rotate-ccw', 'arrow-up', 'arrow-right', 'x', 'chevron-left', 'chevron-right',
    'zap', 'external-link', 'circle', 'mail', 'rss', 'search', 'copy', 'check',
    'images', 'image', 'lock-keyhole', 'lock-keyhole-open', 'sticky-note', 'pause', 'play', 'radio', 'zoom-in',
    'skip-back', 'skip-forward', 'music-2', 'volume', 'volume-x', 'file-music'
  ]);
  const aliases = { home: 'house', note: 'file-text', book: 'book-open', close: 'x', email: 'mail' };

  const nameFor = value => {
    const candidate = String(value || '').trim().toLowerCase().replace(/_/g, '-');
    const name = aliases[candidate] || candidate;
    return lucideNames.has(name) ? name : 'circle';
  };
  const create = (value, className = '') => {
    const name = nameFor(value);
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.8');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    icon.setAttribute('class', ['pm-icon', 'pm-icon--lucide', `pm-icon--${name}`, className].filter(Boolean).join(' '));
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `${spriteUrl}#paper-moments-icon-lucide-${name}`);
    icon.appendChild(use);
    return icon;
  };

  window.paperMomentsIcons = { create, nameFor, spriteUrl };
})();
