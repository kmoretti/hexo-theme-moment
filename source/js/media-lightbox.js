(() => {
  'use strict';
  const state = { active: false, items: [], index: 0, previousFocus: null, closeTimer: 0, scale: 1, panX: 0, panY: 0, pointers: new Map(), pinchDistance: 0, dragOrigin: null };
  let ui = null;
  const icon = (name, className) => window.paperMomentsIcons?.create(name, className) || Object.assign(document.createElement('span'), { className: className || '' });
  const text = value => String(value || '').trim();
  const isRemote = value => /^https?:\/\//i.test(value);
  const safeUrl = value => {
    const raw = text(value);
    if (!raw) return '';
    try { const parsed = new URL(raw, document.baseURI); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : ''; } catch (_) { return ''; }
  };
  const normalizeItem = value => {
    if (!value || typeof value !== 'object') return null;
    const src = safeUrl(value.url || value.src);
    if (!src) return null;
    const type = value.type === 'video' || /\.(?:mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(src) ? 'video' : 'image';
    return { src, type, poster: safeUrl(value.poster), alt: text(value.alt) || (type === 'video' ? '相册视频' : '图片'), caption: text(value.caption), original: safeUrl(value.original || src) || src };
  };
  const focusables = root => [...root.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(el => !el.hidden && el.offsetParent !== null);
  const updateTransform = () => { if (ui) ui.image.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`; };
  const resetZoom = () => { state.scale = 1; state.panX = 0; state.panY = 0; state.pinchDistance = 0; state.dragOrigin = null; updateTransform(); ui?.root.classList.remove('is-zoomed'); };
  const setScale = (scale, origin) => {
    state.scale = Math.max(1, Math.min(4, scale));
    if (origin && state.scale > 1) { state.panX += origin.x * .06; state.panY += origin.y * .06; }
    if (state.scale === 1) { state.panX = 0; state.panY = 0; }
    ui?.root.classList.toggle('is-zoomed', state.scale > 1.01);
    updateTransform();
  };
  const pauseVideo = () => { if (ui?.video) { ui.video.pause(); ui.video.removeAttribute('src'); ui.video.load(); } };
  const render = () => {
    if (!ui || !state.items.length) return;
    const item = state.items[state.index];
    resetZoom(); pauseVideo();
    ui.count.textContent = `${state.index + 1} / ${state.items.length}`;
    ui.caption.textContent = item.caption || item.alt || '';
    ui.caption.hidden = !ui.caption.textContent;
    const many = state.items.length > 1;
    ui.previous.hidden = !many; ui.next.hidden = !many; ui.thumbnails.hidden = !many;
    ui.original.href = item.original; ui.original.setAttribute('aria-label', `在新窗口打开${item.type === 'video' ? '原视频' : '原图'}`);
    ui.image.hidden = item.type !== 'image'; ui.video.hidden = item.type !== 'video'; ui.zoom.hidden = item.type !== 'image';
    if (item.type === 'image') { ui.image.dataset.paperLightboxLoaded = 'false'; ui.image.src = item.src; ui.image.alt = item.alt; }
    else { ui.video.poster = item.poster || ''; ui.video.src = item.src; ui.video.setAttribute('aria-label', item.alt); ui.video.load(); }
    ui.thumbnails.replaceChildren(...state.items.map((entry, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'paper-lightbox__thumb'; button.dataset.index = String(index); button.setAttribute('aria-label', `查看第 ${index + 1} 项`); button.setAttribute('aria-current', index === state.index ? 'true' : 'false');
      if (entry.type === 'video' && !entry.poster) {
        button.append(icon('play', 'paper-lightbox__thumb-icon'));
      } else {
        const preview = document.createElement('img');
        preview.loading = 'lazy';
        preview.decoding = 'async';
        preview.alt = '';
        preview.src = entry.type === 'video' ? entry.poster : entry.src;
        button.append(preview);
      }
      button.addEventListener('click', () => { state.index = index; render(); }); return button;
    }));
    ui.thumbnails.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  };
  const move = offset => { if (!state.active || state.items.length < 2) return; state.index = (state.index + offset + state.items.length) % state.items.length; render(); };
  const close = () => {
    if (!ui || !state.active) return;
    state.active = false; pauseVideo(); resetZoom(); ui.root.classList.remove('is-open'); document.body.classList.remove('paper-lightbox-open');
    window.clearTimeout(state.closeTimer); state.closeTimer = window.setTimeout(() => { if (!state.active && ui) ui.root.hidden = true; }, 160);
    const previous = state.previousFocus; state.items = []; state.previousFocus = null; if (previous?.isConnected) previous.focus({ preventScroll: true });
  };
  const onKeydown = event => {
    if (!state.active || !ui) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'ArrowLeft' && state.scale <= 1.01) { event.preventDefault(); move(-1); return; }
    if (event.key === 'ArrowRight' && state.scale <= 1.01) { event.preventDefault(); move(1); return; }
    if (event.key === 'Tab') { const items = focusables(ui.root); if (!items.length) return; const first = items[0]; const last = items.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  };
  const ensure = () => {
    if (ui) return ui;
    const root = document.createElement('div'); root.className = 'paper-lightbox'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '媒体预览');
    const backdrop = document.createElement('button'); backdrop.type = 'button'; backdrop.className = 'paper-lightbox__backdrop'; backdrop.setAttribute('aria-label', '关闭媒体预览');
    const panel = document.createElement('div'); panel.className = 'paper-lightbox__panel';
    const toolbar = document.createElement('div'); toolbar.className = 'paper-lightbox__toolbar'; const count = document.createElement('span'); count.className = 'paper-lightbox__count';
    const actions = document.createElement('div'); actions.className = 'paper-lightbox__actions'; const original = document.createElement('a'); original.className = 'paper-lightbox__original'; original.target = '_blank'; original.rel = 'noopener noreferrer'; original.append(icon('external-link', 'paper-lightbox__action-icon')); original.append(document.createTextNode('原媒体'));
    const zoom = document.createElement('button'); zoom.type = 'button'; zoom.className = 'paper-lightbox__zoom'; zoom.setAttribute('aria-label', '放大图片'); zoom.append(icon('zoom-in', 'paper-lightbox__action-icon'));
    const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.className = 'paper-lightbox__close'; closeButton.setAttribute('aria-label', '关闭媒体预览'); closeButton.append(icon('x', 'paper-lightbox__icon')); actions.append(original, zoom, closeButton); toolbar.append(count, actions);
    const stage = document.createElement('div'); stage.className = 'paper-lightbox__stage'; const previous = document.createElement('button'); previous.type = 'button'; previous.className = 'paper-lightbox__nav paper-lightbox__nav--previous'; previous.setAttribute('aria-label', '上一项'); previous.append(icon('chevron-left', 'paper-lightbox__nav-icon'));
    const media = document.createElement('div'); media.className = 'paper-lightbox__media'; const image = document.createElement('img'); image.className = 'paper-lightbox__image'; image.alt = ''; const video = document.createElement('video'); video.className = 'paper-lightbox__video'; video.controls = true; video.playsInline = true; video.preload = 'metadata'; media.append(image, video);
    const next = document.createElement('button'); next.type = 'button'; next.className = 'paper-lightbox__nav paper-lightbox__nav--next'; next.setAttribute('aria-label', '下一项'); next.append(icon('chevron-right', 'paper-lightbox__nav-icon')); stage.append(previous, media, next);
    const caption = document.createElement('p'); caption.className = 'paper-lightbox__caption'; const thumbnails = document.createElement('div'); thumbnails.className = 'paper-lightbox__thumbnails'; thumbnails.setAttribute('aria-label', '媒体缩略图'); panel.append(toolbar, stage, caption, thumbnails); root.append(backdrop, panel); document.body.append(root);
    backdrop.addEventListener('click', close); closeButton.addEventListener('click', close); previous.addEventListener('click', () => move(-1)); next.addEventListener('click', () => move(1)); zoom.addEventListener('click', () => setScale(state.scale > 1.01 ? 1 : 2)); image.addEventListener('load', () => image.dataset.paperLightboxLoaded = 'true');
    image.addEventListener('dblclick', event => { event.preventDefault(); setScale(state.scale > 1.01 ? 1 : 2); });
    stage.addEventListener('wheel', event => { if (!state.active || state.items[state.index]?.type !== 'image') return; event.preventDefault(); setScale(state.scale + (event.deltaY < 0 ? .2 : -.2), { x: event.offsetX - stage.clientWidth / 2, y: event.offsetY - stage.clientHeight / 2 }); }, { passive: false });
    const distance = () => { const [a, b] = [...state.pointers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
    stage.addEventListener('pointerdown', event => { if (!state.active || event.target.closest('button, a, video')) return; stage.setPointerCapture?.(event.pointerId); state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (state.pointers.size === 1) state.dragOrigin = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY }; if (state.pointers.size === 2) state.pinchDistance = distance(); });
    stage.addEventListener('pointermove', event => { const point = state.pointers.get(event.pointerId); if (!point) return; const previousPoint = { ...point }; point.x = event.clientX; point.y = event.clientY; if (state.pointers.size >= 2) { const nextDistance = distance(); if (state.pinchDistance) setScale(state.scale * (nextDistance / state.pinchDistance)); state.pinchDistance = nextDistance; return; } if (state.scale > 1.01 && state.dragOrigin) { state.panX = state.dragOrigin.panX + event.clientX - state.dragOrigin.x; state.panY = state.dragOrigin.panY + event.clientY - state.dragOrigin.y; updateTransform(); } else { previousPoint; } });
    stage.addEventListener('pointerup', event => { const start = state.dragOrigin; const point = state.pointers.get(event.pointerId); state.pointers.delete(event.pointerId); if (start && point && state.scale <= 1.01 && state.items[state.index]?.type === 'image') { const deltaX = event.clientX - start.x; const deltaY = event.clientY - start.y; if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY)) move(deltaX > 0 ? -1 : 1); } if (!state.pointers.size) { state.dragOrigin = null; state.pinchDistance = 0; } }); stage.addEventListener('pointercancel', () => { state.pointers.clear(); state.dragOrigin = null; state.pinchDistance = 0; });
    document.addEventListener('keydown', onKeydown); ui = { root, image, video, count, caption, thumbnails, previous, next, close: closeButton, original, zoom }; return ui;
  };
  const open = (items, index = 0, trigger = document.activeElement) => {
    const normalized = (Array.isArray(items) ? items : []).map(normalizeItem).filter(Boolean); if (!normalized.length) return false;
    const view = ensure(); window.clearTimeout(state.closeTimer); state.active = true; state.items = normalized; state.index = Math.max(0, Math.min(Number(index) || 0, normalized.length - 1)); state.previousFocus = trigger instanceof HTMLElement ? trigger : null; view.root.hidden = false; document.body.classList.add('paper-lightbox-open'); render(); requestAnimationFrame(() => { if (!state.active) return; view.root.classList.add('is-open'); view.close.focus({ preventScroll: true }); }); return true;
  };
  const destroy = () => {
    close();
    if (ui) {
      document.removeEventListener('keydown', onKeydown);
      ui.root.remove();
      ui = null;
    }
    state.pointers.clear();
  };
  window.paperMomentsMediaLightbox = { open, close, destroy, normalizeItem };
})();
