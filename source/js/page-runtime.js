(() => {
  const callbacks = { pageView: new Set(), visitStart: new Set() };
  const modules = new Map();
  let activeModules = [];
  let pageReady = false;
  let cleanupFns = [];
  let controller = new AbortController();
  let historyNavigation = false;

  const abortScope = () => controller.abort();
  const createScope = () => {
    abortScope();
    controller = new AbortController();
    return controller.signal;
  };
  const getSignal = () => controller.signal;
  const registerCleanup = fn => {
    if (typeof fn === 'function') cleanupFns.push(fn);
  };
  const runCleanup = () => {
    const fns = cleanupFns;
    cleanupFns = [];
    fns.forEach(fn => {
      try {
        fn();
      } catch (_) {}
    });
  };
  const subscribe = set => fn => {
    if (typeof fn !== 'function') return () => {};
    set.add(fn);
    return () => set.delete(fn);
  };
  const notify = (set, value) => {
    set.forEach(fn => {
      try {
        fn(value);
      } catch (error) {
        console.error('纸间日常页面生命周期回调执行失败：', error);
      }
    });
  };
  const readState = () => {
    const state = document.getElementById('pjax-state');
    const configNode = state?.querySelector('[data-paper-moments-config]');
    try {
      window.paperMomentsConfig = JSON.parse(configNode?.textContent || '{}');
    } catch (_) {
      window.paperMomentsConfig = {};
    }
    return String(state?.dataset.pageModules || '').split(',').filter(Boolean);
  };
  const runModule = (name, init) => {
    if (typeof init !== 'function') return;
    try {
      init({
        main: document.getElementById('main-content'),
        signal: getSignal(),
      });
    } catch (error) {
      console.error(`纸间日常页面模块“${name}”初始化失败：`, error);
    }
  };
  const runModules = () => {
    activeModules = readState();
    activeModules.forEach(name => runModule(name, modules.get(name)));
    notify(callbacks.pageView);
  };
  const normalizePath = value => {
    let path = String(value || '').split(/[?#]/)[0];
    try {
      if (/^https?:\/\//i.test(path)) path = new URL(path, window.location.origin).pathname;
    } catch (_) {}
    path = path.replace(/\/index\.html$/i, '/').replace(/index\.html$/i, '/');
    return path.length > 1 ? path.replace(/\/+$/, '') : '/';
  };
  const updateActiveNav = () => {
    const current = normalizePath(window.location.pathname);
    document.querySelectorAll('[data-nav-path]').forEach(link => {
      const active = normalizePath(link.getAttribute('href')) === current;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-nav-group]').forEach(group => {
      const active = Array.from(group.querySelectorAll('[data-nav-path]'))
        .some(link => normalizePath(link.getAttribute('href')) === current);
      group.classList.toggle('is-active', active);
      group.querySelector('[data-nav-parent]')?.classList.toggle('is-active', active);
    });
  };
  const updateCanonical = () => {
    const link = document.querySelector('link[rel="canonical"]');
    if (link) link.setAttribute('href', window.location.href.split('#')[0]);
  };
  const ensureTwikooStyle = () => {
    if (!document.querySelector('[data-twikoo-scope]')) return;
    const config = window.paperMomentsConfig || {};
    const comments = config.comments || {};
    const version = String(config.twikoo?.version || comments.twikoo_version || '1.7.15');
    const safeVersion = /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) ? version : '1.7.15';
    const href = `https://cdn.jsdelivr.net/npm/twikoo@${safeVersion}/dist/twikoo.css`;
    const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .some(link => link.getAttribute('href') === href);
    if (exists) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  };
  const closeFloatingUi = () => {
    window.paperMomentsMediaLightbox?.destroy?.();
    document.body.classList.remove('paper-lightbox-open');
    document.querySelectorAll('.paper-lightbox, .about-sponsor-detail').forEach(el => el.remove());
    if (window.paperMomentsNavigation?.close) {
      window.paperMomentsNavigation.close();
      return;
    }
    const nav = document.querySelector('[data-site-nav]');
    const toggle = document.querySelector('[data-nav-toggle]');
    if (!nav?.classList.contains('is-open')) return;
    nav.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
  };
  const executeInlineScripts = container => {
    if (!container) return;
    container.querySelectorAll('script').forEach(script => {
      if (script.dataset.paperMomentsExecuted === 'true') return;
      script.dataset.paperMomentsExecuted = 'true';
      const replacement = document.createElement('script');
      Array.from(script.attributes).forEach(attribute => {
        if (attribute.name === 'data-paper-moments-executed') return;
        replacement.setAttribute(attribute.name, attribute.value);
      });
      replacement.textContent = script.textContent;
      script.replaceWith(replacement);
    });
  };
  const shouldSkipVisit = href => {
    const target = String(href || '');
    try {
      const url = new URL(target, window.location.href);
      if (url.hash
        && url.origin === window.location.origin
        && normalizePath(url.pathname) === normalizePath(window.location.pathname)
        && url.search === window.location.search) return true;
    } catch (_) {}
    const excludes = window.paperMomentsConfig?.pjax?.exclude;
    return Array.isArray(excludes) && excludes.some(path => path && target.includes(path));
  };

  const page = {
    abortScope,
    createScope,
    getSignal,
    registerCleanup,
    runCleanup,
    onPageView: subscribe(callbacks.pageView),
    onVisitStart: subscribe(callbacks.visitStart),
    registerModule(name, init) {
      if (typeof name !== 'string' || !name.trim() || typeof init !== 'function') return;
      const normalizedName = name.trim();
      modules.set(normalizedName, init);
      if (pageReady && activeModules.includes(normalizedName)) runModule(normalizedName, init);
    },
  };
  window.paperMomentsPage = page;
  window.paperMomentsPjax = page;

  const initialize = () => {
    createScope();
    pageReady = true;
    runModules();
    if (typeof window.Swup !== 'function') return;

    try {
      const swup = new window.Swup({
        containers: ['#main-content', '#pjax-state'],
        linkSelector: 'a[href]:not([data-no-swup])',
        animateHistoryBrowsing: false,
        animationSelector: false,
        ignoreVisit: shouldSkipVisit,
      });
      page.instance = swup;
      swup.hooks.on('visit:start', visit => {
        historyNavigation = historyNavigation || visit?.history?.popstate === true;
        notify(callbacks.visitStart, visit);
        closeFloatingUi();
      });
      swup.hooks.on('history:popstate', () => {
        historyNavigation = true;
      });
      swup.hooks.before('content:replace', () => {
        abortScope();
        runCleanup();
      });
      swup.hooks.on('content:replace', () => {
        executeInlineScripts(document.getElementById('main-content'));
        executeInlineScripts(document.getElementById('pjax-state'));
        readState();
        updateActiveNav();
        updateCanonical();
        ensureTwikooStyle();
        createScope();
      });
      swup.hooks.on('page:view', () => {
        runModules();
        if (historyNavigation) {
          historyNavigation = false;
          return;
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
        document.getElementById('main-content')?.focus({ preventScroll: true });
      });
    } catch (error) {
      console.error('纸间日常 Swup 初始化失败，已保留原生导航：', error);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
