(() => {
  'use strict';
  const root = document.querySelector('[data-gallery-page][data-gallery-kind="album"]');
  if (!root) return;
  const configNode = root.querySelector('[data-gallery-config]');
  if (!configNode) return;
  let config;
  try { config = JSON.parse(configNode.textContent || '{}'); } catch (_) { return; }
  const album = config?.album;
  if (!album || !Array.isArray(album.items)) return;

  const text = value => String(value || '').trim();
  const toUrl = value => {
    const raw = text(value);
    if (!raw) return '';
    try {
      const parsed = new URL(raw, document.baseURI);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (_) { return ''; }
  };
  const isVideo = item => item?.type === 'video' || /\.(?:mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(text(item?.url));
  const monthInfo = value => {
    const match = text(value).match(/^(\d{4})[-/](\d{1,2})/);
    if (!match) return { key: 'unknown', label: '未标注日期', order: 0 };
    const year = Number(match[1]);
    const month = Number(match[2]);
    return year && month >= 1 && month <= 12
      ? { key: `${year}-${String(month).padStart(2, '0')}`, label: `${year} 年 ${month} 月`, order: year * 100 + month }
      : { key: 'unknown', label: '未标注日期', order: 0 };
  };
  const icon = (name, className) => window.paperMomentsIcons?.create(name, className) || Object.assign(document.createElement('span'), { className: className || '' });
  const sessionKey = `paper-moments-gallery-unlock:${album.slug}`;

  const mediaItems = album.items.map((item, index) => ({
    ...item,
    index,
    url: toUrl(item.url),
    poster: toUrl(item.poster),
    type: isVideo(item) ? 'video' : 'image',
    alt: text(item.alt) || (isVideo(item) ? '相册视频' : '相册照片'),
    caption: text(item.caption),
  })).filter(item => item.url);

  const openMedia = (index, trigger) => {
    window.paperMomentsMediaLightbox?.open(mediaItems, index, trigger);
  };

  let mediaEventsBound = false;
  const bindMediaButtons = scope => {
    // 静态与密码解锁后动态插入的媒体都走同一个委托入口，避免逐项监听及插入时序差异。
    if (mediaEventsBound) return;
    mediaEventsBound = true;
    scope.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-gallery-media-index]') : null;
      if (!target || !scope.contains(target)) return;
      event.preventDefault();
      openMedia(Number(target.dataset.galleryMediaIndex), target);
    });
  };

  const renderGroup = group => {
    const section = document.createElement('section');
    section.className = 'gallery-media-group';
    const heading = document.createElement('h2');
    heading.textContent = group.label;
    const grid = document.createElement('div');
    grid.className = 'gallery-media-grid';
    group.items.forEach(item => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `gallery-media-card${item.type === 'video' ? ' is-video' : ''}`;
      card.dataset.galleryMediaIndex = String(item.index);
      card.setAttribute('aria-label', `打开${item.alt}`);
      if (item.type === 'video') {
        if (item.poster) {
          const preview = document.createElement('img');
          preview.src = item.poster; preview.alt = item.alt; preview.loading = 'lazy'; preview.decoding = 'async'; card.append(preview);
        } else {
          const video = document.createElement('video');
          video.src = `${item.url}#t=0.1`; video.muted = true; video.playsInline = true; video.preload = 'metadata'; video.setAttribute('aria-label', item.alt); card.append(video);
        }
        const play = document.createElement('span'); play.className = 'gallery-media-card__play'; play.append(icon('play', 'gallery-media-card__play-icon')); card.append(play);
      } else {
        const image = document.createElement('img');
        image.src = item.url; image.alt = item.alt; image.loading = 'lazy'; image.decoding = 'async'; card.append(image);
      }
      if (item.caption) { const caption = document.createElement('span'); caption.className = 'gallery-media-card__caption'; caption.textContent = item.caption; card.append(caption); }
      grid.append(card);
    });
    section.append(heading, grid);
    return section;
  };

  const renderProtectedMedia = target => {
    const groups = mediaItems.reduce((map, item) => {
      const info = monthInfo(item.date);
      const group = map.get(info.key) || { ...info, items: [] };
      group.items.push(item); map.set(info.key, group); return map;
    }, new Map());
    target.replaceChildren(...[...groups.values()].sort((a, b) => b.order - a.order).map(renderGroup));
    target.hidden = false;
    bindMediaButtons(target);
  };

  const digest = async password => {
    if (!window.crypto?.subtle || !window.TextEncoder) throw new Error('unavailable');
    const data = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
  };

  const gate = root.querySelector('[data-gallery-password-gate]');
  const protectedMedia = root.querySelector('[data-gallery-protected-media]');
  const unlock = () => {
    if (!gate || !protectedMedia) return;
    renderProtectedMedia(protectedMedia);
    gate.hidden = true;
  };

  if (album.access === 'password') {
    let unlocked = false;
    try { unlocked = sessionStorage.getItem(sessionKey) === 'true'; } catch (_) {}
    if (unlocked) unlock();
    const form = gate?.querySelector('[data-gallery-password-form]');
    const input = form?.querySelector('input[name="password"]');
    const status = gate?.querySelector('[data-gallery-password-status]');
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const password = text(input?.value);
      if (!password) return;
      if (status) status.textContent = '正在翻开这一页……';
      try {
        const hash = await digest(password);
        if (hash !== text(album.passwordHash).toLowerCase()) {
          if (status) status.textContent = '密码不对，再想想看。';
          input?.select();
          return;
        }
        try { sessionStorage.setItem(sessionKey, 'true'); } catch (_) {}
        if (status) status.textContent = '密码正确。';
        unlock();
        protectedMedia?.querySelector('[data-gallery-media-index]')?.focus({ preventScroll: true });
      } catch (_) {
        if (status) status.textContent = '当前浏览器无法安全验证密码，请使用 HTTPS 或本地地址访问。';
      }
    });
  } else {
    bindMediaButtons(root);
  }
})();
