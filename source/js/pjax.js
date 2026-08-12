(() => {
  if (typeof window.Pjax !== 'function') return;
  const config = window.paperMomentsConfig || {};
  const pjaxConfig = config.pjax || {};
  if (pjaxConfig.enable === false) return;

  // 清理注册表：页面脚本通过 paperMomentsPjax.registerCleanup 注册全局监听清理，
  // PJAX 离开旧页面前统一执行，避免重复绑定与内存泄漏。
  // 首次页面的专属 defer 脚本可能比本文件先执行，因此保留布局中已建立的回调队列。
  const lifecycle = window.paperMomentsPjax || {};
  lifecycle.cleanupFns = Array.isArray(lifecycle.cleanupFns) ? lifecycle.cleanupFns : [];
  lifecycle.registerCleanup = function registerCleanup(fn) {
    if (typeof fn === 'function') this.cleanupFns.push(fn);
  };
  lifecycle.runCleanup = function runCleanup() {
    const fns = this.cleanupFns;
    this.cleanupFns = [];
    fns.forEach(fn => { try { fn(); } catch (_) {} });
  };
  window.paperMomentsPjax = lifecycle;

  // 排除外链（新窗口）、锚点、mailto、下载链接；支持配置排除特定 href。
  const baseElements = 'a[href]:not([target="_blank"]):not([href^="#"]):not([href^="mailto:"]):not([download])';
  const excludes = Array.isArray(pjaxConfig.exclude) ? pjaxConfig.exclude.filter(Boolean) : [];
  const elements = excludes.length
    ? `${baseElements}${excludes.map(href => `:not([href="${href}"])`).join('')}`
    : baseElements;

  const pjax = new Pjax({
    elements,
    selectors: ['head > title', '#main-content', '#pjax-state'],
    cacheBust: false,
    analytics: false,
    scrollRestoration: false,
  });
  window.paperMomentsPjax.instance = pjax;

  const normalizePath = value => {
    let path = String(value || '').split(/[?#]/)[0];
    try {
      if (/^https?:\/\//i.test(path)) path = new URL(path, window.location.origin).pathname;
    } catch (_) {}
    path = path.replace(/\/index\.html$/i, '/').replace(/index\.html$/i, '/');
    return path.length > 1 ? path.replace(/\/+$/, '') : '/';
  };

  // PJAX 完成后更新导航高亮（header 不随 PJAX 替换，需手动同步）。
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

  // 动态补充 Twikoo 样式：从非说说页 PJAX 进入说说页时，head 里的 twikoo.css 未加载。
  const ensureTwikooStyle = () => {
    if (!document.querySelector('[data-twikoo-scope]')) return;
    const currentConfig = window.paperMomentsConfig || config;
    const comments = currentConfig.comments || {};
    const version = String(currentConfig.twikoo?.version || comments.twikoo_version || '1.7.15');
    const safeVersion = /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) ? version : '1.7.15';
    const href = `https://cdn.jsdelivr.net/npm/twikoo@${safeVersion}/dist/twikoo.css`;
    const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .some(link => link.getAttribute('href') === href);
    if (!exists) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
  };

  const closeFloatingUi = () => {
    // 销毁当前 UI 实例（视频、键盘监听与滚动锁），但 destroy 不会删除全局 API；
    // 下一次进入相册/说说时，共用灯箱会按需创建一套新 DOM。
    window.paperMomentsMediaLightbox?.destroy?.();
    document.body.classList.remove('paper-lightbox-open');
    document.querySelectorAll('.paper-lightbox, .about-sponsor-detail').forEach(el => el.remove());
    // 关闭移动端导航菜单与桌面下拉菜单。
    if (window.paperMomentsNavigation?.close) {
      window.paperMomentsNavigation.close();
      return;
    }
    const nav = document.querySelector('[data-site-nav]');
    const toggle = document.querySelector('[data-nav-toggle]');
    if (nav && nav.classList.contains('is-open')) {
      nav.classList.remove('is-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
  };

  document.addEventListener('pjax:send', () => {
    if (window.paperMomentsPjax) window.paperMomentsPjax.runCleanup();
    closeFloatingUi();
  });

  document.addEventListener('pjax:complete', () => {
    updateActiveNav();
    updateCanonical();
    ensureTwikooStyle();
    // comments.js 自己监听 pjax:complete，避免动态页面脚本与共享评论单例竞争挂载。
    window.scrollTo(0, 0);
    const main = document.getElementById('main-content');
    if (main && typeof main.focus === 'function') main.focus({ preventScroll: true });
  });

  // 请求失败（网络/404 等）时退回整页导航，避免停留在错误状态。
  document.addEventListener('pjax:error', () => {
    window.location.reload();
  });
})();
