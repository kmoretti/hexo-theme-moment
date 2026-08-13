window.paperMomentsPage?.registerModule('comment-board', () => {
  const root = document.querySelector('[data-comment-board]');
  if (!root || root.dataset.commentBoardReady === 'true') return;
  root.dataset.commentBoardReady = 'true';

  const config = window.paperMomentsConfig?.commentBoard || {};
  const danmakuConfig = config.danmaku || {};
  const main = root.querySelector('[data-comment-envelope-main]');
  const wrap = root.querySelector('[data-comment-envelope-wrap]');
  const desktopEnvelope = root.querySelector('.comment-envelope-desktop');
  const surface = root.querySelector('.comment-envelope');
  const toggle = root.querySelector('[data-comment-envelope-toggle]');
  const toggleLabel = root.querySelector('[data-comment-envelope-toggle-label]');
  const stage = root.querySelector('[data-comment-danmaku]');
  const screen = root.querySelector('[data-comment-danmaku-screen]');
  const pauseButton = root.querySelector('[data-comment-danmaku-toggle]');
  const pauseIcon = root.querySelector('[data-comment-danmaku-pause-icon]');
  const playIcon = root.querySelector('[data-comment-danmaku-play-icon]');
  const pauseLabel = root.querySelector('[data-comment-danmaku-toggle-label]');
  const status = root.querySelector('[data-comment-danmaku-status]');
  const desktopQuery = window.matchMedia('(min-width: 601px)');
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const boardPath = String(config.path || '/comment/').trim() || '/comment/';
  const path = boardPath.startsWith('/') ? boardPath : `/${boardPath}`;
  const envelopeConfig = config.envelope || {};
  const closedHeight = `${Math.max(1, Number(envelopeConfig.wrap_height) || 447)}px`;
  const openedHeight = `${Math.max(1, Number(envelopeConfig.open_height) || 1050)}px`;
  const openedOffset = `${Number.isFinite(Number(envelopeConfig.open_offset)) ? Number(envelopeConfig.open_offset) : -200}px`;
  const minSpeed = Math.max(20, Number(danmakuConfig.min_speed) || 55);
  const maxSpeed = Math.max(minSpeed, Number(danmakuConfig.max_speed) || 90);
  const laneCount = Math.max(1, Math.min(5, Number(danmakuConfig.lane_count) || 4));
  const gap = Math.max(8, Number(danmakuConfig.gap) || 14);
  const maxLength = Math.max(12, Number(danmakuConfig.max_text_length) || 42);
  const openBottomTrim = Math.max(0, Number(main?.dataset.danmakuOpenBottomTrim) || Number.parseFloat(getComputedStyle(main || root).getPropertyValue('--comment-danmaku-open-bottom-trim')) || 140);

  const state = {
    disposed: false,
    opened: false,
    explicitlyPaused: false,
    viewportPaused: false,
    networkPaused: navigator.onLine === false,
    visibilityPaused: document.hidden,
    comments: null,
    cursor: 0,
    lanes: [],
    timers: new Set(),
    animations: new Set(),
    observer: null,
    resizeObserver: null,
    scrollRaf: 0,
    danmakuStarted: false,
    abortController: null,
  };

  const on = (target, event, listener, options) => target?.addEventListener(event, listener, options);
  const off = (target, event, listener, options) => target?.removeEventListener(event, listener, options);
  const isDesktop = () => !danmakuConfig.desktop_only || desktopQuery.matches;
  const shouldReduce = () => reducedQuery.matches;
  const setStatus = value => { if (status) status.textContent = value || ''; };
  const setTimer = (fn, delay) => {
    const timer = window.setTimeout(() => { state.timers.delete(timer); fn(); }, delay);
    state.timers.add(timer);
    return timer;
  };
  const clearTimers = () => {
    state.timers.forEach(timer => window.clearTimeout(timer));
    state.timers.clear();
  };
  const random = (min, max) => min + Math.random() * (max - min);
  const text = value => String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stripHtml = value => {
    const parsed = new DOMParser().parseFromString(String(value || ''), 'text/html');
    return text(parsed.body?.textContent || '');
  };
  const truncate = value => {
    const chars = Array.from(value);
    return chars.length > maxLength ? `${chars.slice(0, maxLength).join('')}…` : value;
  };
  const normalizeItem = item => {
    const body = stripHtml(item?.commentText || item?.comment || '');
    if (!body) return null;
    const nick = text(item?.nick || '访客') || '访客';
    let avatar = String(item?.avatar || '').trim();
    try {
      const parsed = new URL(avatar, document.baseURI);
      avatar = ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (_) { avatar = ''; }
    return { nick, body: truncate(body), avatar };
  };
  const flattenComments = list => {
    const output = [];
    const walk = items => {
      if (!Array.isArray(items)) return;
      items.forEach(item => {
        output.push(item);
        if (danmakuConfig.include_replies !== false) walk(item?.replies);
      });
    };
    walk(list);
    return output.map(normalizeItem).filter(Boolean);
  };

  const isOpened = () => wrap?.classList.contains('opened') || false;
  const updateToggle = () => {
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', String(isOpened()));
    toggle.setAttribute('aria-label', isOpened()
      ? (config.close_label || '收起这封便签')
      : (config.open_label || '打开这封便签'));
    if (toggleLabel) toggleLabel.textContent = isOpened()
      ? (config.close_label || '收起这封便签')
      : (config.open_label || '打开这封便签');
  };
  const setOpened = (next, { force = false } = {}) => {
    if (!wrap || (!isDesktop() && !force)) return;
    const opened = Boolean(next);
    wrap.classList.toggle('opened', opened);
    // 保留上游 `.opened` 状态类，同时写入尺寸，避免主题其他布局的高度规则覆盖资源信封。
    wrap.style.height = opened ? openedHeight : closedHeight;
    wrap.style.top = opened ? openedOffset : '0px';
    updateToggle();
    syncDanmakuBounds();
  };
  const getScrollTop = () => window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  const isEnvelopeFullyVisible = () => {
    if (!wrap || isOpened()) return false;
    const rect = wrap.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
  };
  const updateEnvelopeByScroll = () => {
    if (!isDesktop() || state.disposed) return;
    if (isEnvelopeFullyVisible()) setOpened(true);
    else if (isOpened() && getScrollTop() <= 80) setOpened(false);
  };
  const requestEnvelopeSync = () => {
    if (state.scrollRaf) return;
    state.scrollRaf = window.requestAnimationFrame(() => {
      state.scrollRaf = 0;
      updateEnvelopeByScroll();
      syncDanmakuBounds();
    });
  };

  const getTravelWidth = () => screen?.clientWidth || document.documentElement.clientWidth;
  function syncDanmakuBounds() {
    if (!isDesktop() || !wrap || !main || !stage) return;
    const wrapRect = wrap.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    if (!wrapRect.width || !wrapRect.height) return;
    const top = Math.max(wrapRect.top, mainRect.top);
    let height = wrapRect.bottom - top;
    if (isOpened()) height = Math.max(0, height - openBottomTrim);
    stage.style.top = `${top}px`;
    stage.style.height = `${height}px`;
    if (state.comments?.length) startDanmaku();
  }

  const canAnimate = () => Boolean(
    danmakuConfig.enable !== false
    && isDesktop()
    && !shouldReduce()
    && !state.explicitlyPaused
    && !state.viewportPaused
    && !state.networkPaused
    && !state.visibilityPaused
  );
  const syncPauseButton = () => {
    if (!pauseButton) return;
    const available = danmakuConfig.enable !== false && isDesktop() && !shouldReduce();
    pauseButton.hidden = !available;
    pauseButton.setAttribute('aria-pressed', String(state.explicitlyPaused));
    pauseButton.setAttribute('aria-label', state.explicitlyPaused
      ? (danmakuConfig.resume_label || '继续弹幕')
      : (danmakuConfig.pause_label || '暂停弹幕'));
    if (pauseIcon) pauseIcon.hidden = state.explicitlyPaused;
    if (playIcon) playIcon.hidden = !state.explicitlyPaused;
    if (pauseLabel) pauseLabel.textContent = state.explicitlyPaused
      ? (danmakuConfig.resume_label || '继续弹幕')
      : (danmakuConfig.pause_label || '暂停弹幕');
  };
  const pauseAnimations = () => state.animations.forEach(animation => { try { animation.pause(); } catch (_) {} });
  const playAnimations = () => state.animations.forEach(animation => { try { animation.play(); } catch (_) {} });
  const clearDanmaku = () => {
    clearTimers();
    state.animations.forEach(animation => { try { animation.cancel(); } catch (_) {} });
    state.animations.clear();
    screen?.replaceChildren();
    state.lanes = [];
    state.danmakuStarted = false;
  };

  const makeNode = item => {
    const node = document.createElement('div');
    node.className = 'comment-envelope-danmaku__item';
    if (item.avatar) {
      const avatar = document.createElement('img');
      avatar.src = item.avatar;
      avatar.alt = '';
      avatar.loading = 'lazy';
      avatar.decoding = 'async';
      node.appendChild(avatar);
    }
    const body = document.createElement('span');
    body.className = 'comment-envelope-danmaku__body';
    body.textContent = `${item.nick}: ${item.body}`;
    node.appendChild(body);
    return node;
  };
  const measureNode = item => {
    const node = makeNode(item);
    node.style.visibility = 'hidden';
    node.style.pointerEvents = 'none';
    screen?.appendChild(node);
    const width = node.offsetWidth;
    node.remove();
    return width;
  };
  const selectLane = () => {
    const now = performance.now();
    return [...state.lanes].sort((left, right) => left.nextAt - right.nextAt)[0]
      || { index: 0, speed: minSpeed, nextAt: now };
  };
  const getLaneDelay = (lane, width, speed) => {
    if (!lane) return 0;
    const elapsed = Math.max(0, (performance.now() - lane.startedAt) / 1000);
    const right = lane.startX + lane.width + lane.speed * elapsed;
    if (right >= getTravelWidth()) return 0;
    return Math.max(0, (right + gap + width) / lane.speed) * 1000;
  };
  const spawnNext = () => {
    if (!canAnimate() || !screen || !state.comments?.length) return;
    const lane = selectLane();
    const item = state.comments[state.cursor % state.comments.length];
    state.cursor += 1;
    const width = measureNode(item);
    if (!width) return;
    const speed = random(minSpeed, maxSpeed);
    const delay = getLaneDelay(lane, width, speed);
    setTimer(() => {
      if (state.disposed || !canAnimate() || !screen.isConnected) return;
      const node = makeNode(item);
      screen.appendChild(node);
      const laneHeight = screen.clientHeight / Math.max(1, state.lanes.length);
      node.style.top = `${lane.index * laneHeight + Math.max(0, (laneHeight - 24) / 2)}px`;
      const travel = getTravelWidth();
      const itemWidth = node.offsetWidth;
      const duration = ((travel + itemWidth) / speed) * 1000;
      node.style.transform = `translateX(${-itemWidth}px)`;
      const animation = node.animate([
        { transform: `translateX(${-itemWidth}px)` },
        { transform: `translateX(${travel}px)` },
      ], { duration, easing: 'linear', fill: 'forwards' });
      state.animations.add(animation);
      animation.finished.catch(() => {}).finally(() => {
        state.animations.delete(animation);
        node.remove();
      });
      lane.startedAt = performance.now();
      lane.startX = -itemWidth;
      lane.width = itemWidth;
      lane.speed = speed;
      lane.nextAt = performance.now() + ((itemWidth + gap) / speed) * 1000;
      scheduleDanmaku();
    }, delay);
  };
  const scheduleDanmaku = () => {
    if (!canAnimate() || !state.comments?.length) return;
    if (!state.lanes.length) state.lanes = Array.from({ length: Math.min(laneCount, Math.max(1, Math.floor((screen?.clientHeight || 0) / 28))) }, (_, index) => ({ index, nextAt: 0, startedAt: 0, startX: 0, width: 0, speed: minSpeed }));
    spawnNext();
  };
  const startDanmaku = () => {
    if (state.danmakuStarted || !canAnimate() || !screen || !state.comments?.length || screen.clientHeight < 24) return;
    state.danmakuStarted = true;
    scheduleDanmaku();
  };
  const syncDanmaku = () => {
    syncPauseButton();
    if (shouldReduce()) {
      clearDanmaku();
      setStatus(danmakuConfig.reduced_motion_label || '已按系统设置减少动态效果');
      return;
    }
    if (state.networkPaused) {
      clearDanmaku();
      setStatus(danmakuConfig.offline_label || '离线时不播放留言弹幕。');
      return;
    }
    if (!isDesktop() || danmakuConfig.enable === false) {
      clearDanmaku();
      setStatus('');
      return;
    }
    if (!canAnimate()) {
      pauseAnimations();
      return;
    }
    playAnimations();
    startDanmaku();
  };

  const fetchComments = async () => {
    if (danmakuConfig.enable === false || !isDesktop() || shouldReduce() || state.networkPaused) return;
    const envId = String(window.paperMomentsConfig?.twikoo?.envId || '').trim();
    if (!envId) return;
    state.abortController?.abort();
    const controller = new AbortController();
    state.abortController = controller;
    try {
      const twikoo = await window.paperMomentsComments?.loadTwikoo?.();
      if (state.disposed || controller.signal.aborted || state.networkPaused) return;
      let records = [];
      if (twikoo?.getRecentComments) {
        try {
          records = await twikoo.getRecentComments({
            envId,
            urls: [path],
            pageSize: Math.max(1, Math.min(100, Number(danmakuConfig.page_size) || 50)),
            includeReply: danmakuConfig.include_replies !== false,
          });
        } catch (_) { records = []; }
      }
      if ((!Array.isArray(records) || !records.length) && /^https?:\/\//i.test(envId)) {
        const response = await fetch(envId, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'COMMENT_GET', url: path, sort: 'newest' }) });
        if (!response.ok) throw new Error('comment request failed');
        const payload = await response.json();
        records = Array.isArray(payload?.data) ? payload.data : [];
      }
      if (state.disposed || controller.signal.aborted || state.networkPaused) return;
      state.comments = flattenComments(records);
      if (!state.comments.length) {
        setStatus(danmakuConfig.empty_label || '还没有可飘过的留言，等你的第一句。');
        return;
      }
      setStatus('');
      syncDanmakuBounds();
      syncDanmaku();
    } catch (_) {
      if (state.disposed || controller.signal.aborted || state.networkPaused) return;
      setStatus(danmakuConfig.unavailable_label || '留言弹幕暂时无法加载。');
    }
  };

  const onToggle = () => setOpened(!isOpened());
  const onEnvelopeClick = event => {
    if (!isDesktop() || isOpened() || event.target.closest('button, a, input, textarea')) return;
    setOpened(true);
  };
  const onPause = () => { state.explicitlyPaused = !state.explicitlyPaused; syncDanmaku(); };
  const onViewportChange = () => { if (!isDesktop()) setOpened(false, { force: true }); syncDanmaku(); requestEnvelopeSync(); };
  const onVisibility = () => { state.visibilityPaused = document.hidden; syncDanmaku(); };
  const onOffline = () => { state.networkPaused = true; state.abortController?.abort(); syncDanmaku(); };
  const onOnline = () => { state.networkPaused = false; syncDanmaku(); void fetchComments(); };

  on(toggle, 'click', onToggle);
  on(desktopEnvelope, 'click', onEnvelopeClick);
  on(window, 'scroll', requestEnvelopeSync, { passive: true });
  on(window, 'resize', requestEnvelopeSync);
  on(desktopQuery, 'change', onViewportChange);
  on(reducedQuery, 'change', syncDanmaku);
  on(document, 'visibilitychange', onVisibility);
  on(window, 'offline', onOffline);
  on(window, 'online', onOnline);
  on(pauseButton, 'click', onPause);
  on(wrap, 'transitionend', syncDanmakuBounds);

  if ('IntersectionObserver' in window && stage) {
    state.observer = new IntersectionObserver(entries => {
      state.viewportPaused = !entries.some(entry => entry.isIntersecting);
      syncDanmaku();
    }, { threshold: 0.01 });
    state.observer.observe(stage);
  }
  if ('ResizeObserver' in window && wrap) {
    state.resizeObserver = new ResizeObserver(syncDanmakuBounds);
    state.resizeObserver.observe(wrap);
  }

  updateToggle();
  if (!isDesktop()) setOpened(false, { force: true });
  else updateEnvelopeByScroll();
  syncDanmakuBounds();
  syncDanmaku();
  void fetchComments();

  const cleanup = () => {
    state.disposed = true;
    state.abortController?.abort();
    clearTimers();
    state.animations.forEach(animation => { try { animation.cancel(); } catch (_) {} });
    state.animations.clear();
    state.observer?.disconnect();
    state.resizeObserver?.disconnect();
    if (state.scrollRaf) window.cancelAnimationFrame(state.scrollRaf);
    off(toggle, 'click', onToggle);
    off(desktopEnvelope, 'click', onEnvelopeClick);
    off(window, 'scroll', requestEnvelopeSync);
    off(window, 'resize', requestEnvelopeSync);
    off(desktopQuery, 'change', onViewportChange);
    off(reducedQuery, 'change', syncDanmaku);
    off(document, 'visibilitychange', onVisibility);
    off(window, 'offline', onOffline);
    off(window, 'online', onOnline);
    off(pauseButton, 'click', onPause);
    off(wrap, 'transitionend', syncDanmakuBounds);
    screen?.replaceChildren();
    delete root.dataset.commentBoardReady;
  };
  window.paperMomentsPage?.registerCleanup(cleanup);
});
