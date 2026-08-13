window.paperMomentsPage?.registerModule('about', ({ signal }) => {
  const settings = window.paperMomentsConfig || {};
  const aboutConfig = settings.about || {};
  const sponsorsConfig = aboutConfig.sponsors || {};
  const root = document.querySelector('[data-about-root]');
  if (!root) return;

  const sponsorsRoot = root.querySelector('[data-about-sponsors-root]');
  if (!sponsorsRoot) return;

  const status = sponsorsRoot.querySelector('[data-about-sponsors-status]');
  const wall = sponsorsRoot.querySelector('[data-about-sponsors-wall]');
  const toolbar = sponsorsRoot.querySelector('[data-about-sponsors-toolbar]');
  const message = sponsorsRoot.querySelector('[data-about-sponsors-message]');
  const retry = sponsorsRoot.querySelector('[data-about-sponsors-retry]');
  const cta = sponsorsRoot.querySelector('[data-about-sponsors-cta]');
  const ctaLink = cta ? cta.querySelector('a') : null;
  const people = sponsorsRoot.querySelector('[data-about-sponsors-people]');
  const peopleCount = sponsorsRoot.querySelector('[data-about-sponsors-count]');
  const detail = document.querySelector('[data-about-sponsor-detail]');
  const detailClose = detail ? detail.querySelector('[data-about-sponsor-detail-close]') : null;
  let lastFocused = null;

  // tier 徽章：中文标签 + 对应纸张色。
  const TIERS = {
    coffee: { label: '咖啡', emoji: '☕', cls: 'is-coffee' },
    meal: { label: '一顿饭', emoji: '🍚', cls: 'is-meal' },
    rocket: { label: '火箭', emoji: '🚀', cls: 'is-rocket' },
  };
  const FALLBACK_TIER = { label: '支持', emoji: '❤️', cls: 'is-default' };

  // 与站点头像一致的生成器（profile.avatar 使用同一个 API）。
  const AVATAR_API = 'https://api.dicebear.com/9.x/notionists/svg';
  const SPONSOR_WALL_AVATAR_API = 'https://api.dicebear.com/9.x/micah/svg';
  const avatarUrl = seed => `${AVATAR_API}?seed=${encodeURIComponent(seed || 'friend')}`;
  const sponsorWallAvatarUrl = seed => `${SPONSOR_WALL_AVATAR_API}?seed=${encodeURIComponent(seed || 'friend')}`;

  const text = value => String(value == null ? '' : value).trim();
  const setText = (element, value) => { element.textContent = text(value); };
  const safeUrl = value => {
    const source = text(value);
    if (!/^https?:\/\//i.test(source)) return '';
    try {
      const url = new URL(source);
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
    } catch (_) {
      return '';
    }
  };
  const linkLabel = value => {
    const source = text(value);
    return source.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  };
  const formatDate = value => {
    const source = text(value);
    const match = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return source;
    return `${Number(match[1])} 年 ${Number(match[2])} 月 ${Number(match[3])} 日`;
  };

  const create = (tag, className, content) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content != null) element.textContent = content;
    return element;
  };

  const renderAvatar = (sponsor, className, size, source = avatarUrl) => {
    const frame = create('span', className);
    const image = document.createElement('img');
    image.src = source(sponsor.seed || sponsor.name);
    image.alt = `${text(sponsor.name)} 的头像`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = size;
    image.height = size;
    image.addEventListener('error', () => {
      image.remove();
      frame.classList.add('is-error');
      frame.append(create('span', `${className}__fallback`, text(sponsor.name).slice(0, 1) || '友'));
    }, { once: true });
    frame.append(image);
    return frame;
  };

  const tierOf = sponsor => {
    if (!sponsor.tier) return null;
    return TIERS[text(sponsor.tier)] || FALLBACK_TIER;
  };

  const renderStamp = (sponsor, index) => {
    const name = text(sponsor.name) || '匿名朋友';
    const item = create('li', 'about-sponsor-stamp');
    const button = create('button', 'about-sponsor-stamp__button');
    button.type = 'button';
    button.setAttribute('aria-label', `查看 ${name} 的赞助详情`);
    button.style.setProperty('--sponsor-index', index);

    const tilt = create('span', 'about-sponsor-stamp__tilt');
    const card = create('span', 'about-sponsor-stamp__card');
    card.append(renderAvatar(sponsor, 'about-sponsor-stamp__avatar', 88, sponsorWallAvatarUrl));
    tilt.append(card);

    const nameEl = create('span', 'about-sponsor-stamp__name', name);
    button.append(tilt, nameEl);
    const tier = tierOf(sponsor);
    if (tier) {
      const tierEl = create('span', `about-sponsor-stamp__tier ${tier.cls}`, `${tier.emoji} ${tier.label}`);
      button.append(tierEl);
    }
    item.append(button);
    button.addEventListener('click', () => openDetail(sponsor, button));
    return item;
  };

  const renderWall = list => {
    wall.replaceChildren();
    // 超出上限时保留最新一批，避免贴纸墙无限增长。
    list.slice(0, 99).forEach((sponsor, index) => wall.append(renderStamp(sponsor, index)));
  };

  const setToolbar = (visible, value = '') => {
    toolbar.hidden = !visible;
    setText(message, value);
  };

  const load = async () => {
    if (load.busy) return;
    load.busy = true;
    const endpoint = text(sponsorsConfig.data_url) || text(sponsorsRoot.dataset.endpoint || '');
    setToolbar(false);
    status.hidden = false;
    setText(status, text(sponsorsConfig.loading_label) || '正在整理支持者的来信……');
    wall.replaceChildren();

    if (!endpoint) {
      setText(status, text(sponsorsConfig.empty_label) || '尚未配置赞助数据源，去 _config.paper-moments.yml 填写 data_url。');
      setToolbar(true, '未配置赞助数据地址。');
      load.busy = false;
      return;
    }

    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal });
      if (!response.ok) throw new Error(`sponsors.json ${response.status}`);
      const data = await response.json();
      if (signal.aborted || !document.contains(sponsorsRoot)) return;
      const list = Array.isArray(data.sponsors) ? data.sponsors.filter(item => text(item.name)) : [];

      const remoteSupport = safeUrl(data.afdian);
      if (remoteSupport && cta && ctaLink) {
        cta.hidden = false;
        ctaLink.href = remoteSupport;
      }
      if (list.length) {
        renderWall(list);
        status.hidden = true;
        if (people && peopleCount) {
          peopleCount.textContent = String(list.length);
          people.hidden = false;
        }
      } else {
        wall.replaceChildren();
        setText(status, text(sponsorsConfig.empty_label) || '暂时还没有赞助记录，期待你的第一杯咖啡。');
        if (people) people.hidden = true;
      }
    } catch (error) {
      if (!signal.aborted && document.contains(sponsorsRoot)) {
        wall.replaceChildren();
        setText(status, text(sponsorsConfig.error_label) || '赞助名单暂时无法加载，请稍后重试。');
        setToolbar(true, '远程赞助数据加载失败。');
      }
    } finally {
      load.busy = false;
    }
  };

  const openDetail = (sponsor, trigger) => {
    if (!detail) return;
    const name = text(sponsor.name) || '匿名朋友';
    lastFocused = trigger;
    const avatar = detail.querySelector('[data-about-detail-avatar]');
    const nameEl = detail.querySelector('[data-about-detail-name]');
    const tierEl = detail.querySelector('[data-about-detail-tier]');
    const messageEl = detail.querySelector('[data-about-detail-message]');
    const dateEl = detail.querySelector('[data-about-detail-date]');
    const linkEl = detail.querySelector('[data-about-detail-link]');

    avatar.replaceChildren(
      renderAvatar(sponsor, 'about-sponsor-detail__stamp', 112, sponsorWallAvatarUrl)
    );
    setText(nameEl, name);
    const tier = tierOf(sponsor);
    if (tier) {
      tierEl.hidden = false;
      tierEl.className = `about-sponsor-detail__tier ${tier.cls}`;
      setText(tierEl, `${tier.emoji} ${tier.label}`);
    } else {
      tierEl.hidden = true;
    }
    const messageText = text(sponsor.message);
    messageEl.hidden = !messageText;
    setText(messageEl, messageText);
    const dateText = formatDate(sponsor.date);
    dateEl.hidden = !dateText;
    setText(dateEl, dateText);
    const link = safeUrl(sponsor.link);
    if (link) {
      linkEl.hidden = false;
      linkEl.href = link;
      setText(linkEl, linkLabel(link));
    } else {
      linkEl.hidden = true;
      linkEl.removeAttribute('href');
    }

    detail.hidden = false;
    document.body.classList.add('paper-lightbox-open');
    requestAnimationFrame(() => detail.classList.add('is-open'));
    const focusTarget = detail.querySelector('.about-sponsor-detail__close');
    if (focusTarget) focusTarget.focus();
  };

  const closeDetail = () => {
    if (!detail || detail.hidden) return;
    detail.classList.remove('is-open');
    document.body.classList.remove('paper-lightbox-open');
    window.setTimeout(() => { detail.hidden = true; }, 180);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  };

  if (detail) {
    const closeButtons = Array.from(detail.querySelectorAll('[data-about-sponsor-detail-close]'));
    closeButtons.forEach(button => button.addEventListener('click', closeDetail));
    const onKeydown = event => {
      if (event.key === 'Escape' && !detail.hidden) closeDetail();
    };
    document.addEventListener('keydown', onKeydown);
    window.paperMomentsPage?.registerCleanup(() => document.removeEventListener('keydown', onKeydown));
  }

  if (retry) retry.addEventListener('click', load);

  // 初始 CTA：配置了 support_url 就先展示，远程 afdian 数据到达后覆盖。
  const configuredSupport = sponsorsConfig.support_url ? safeUrl(sponsorsConfig.support_url) : '';
  if (configuredSupport && cta && ctaLink) {
    cta.hidden = false;
    ctaLink.href = configuredSupport;
  }

  load();
});
