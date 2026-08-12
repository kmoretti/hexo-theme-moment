(() => {
  const existing = window.paperMomentsComments;
  if (existing?.__paperMomentsCommentsReady) return;

  const state = {
    generation: 0,
    loader: null,
    mounts: new Map(),
    cleanupRegistered: false,
  };

  const getConfig = () => window.paperMomentsConfig || {};
  const validVersion = value => /^[0-9]+\.[0-9]+\.[0-9]+$/.test(String(value || ''))
    ? String(value)
    : '1.7.15';
  const normalizePath = value => {
    const path = String(value || '/').trim().split(/[?#]/)[0] || '/';
    const withoutIndex = path.replace(/\/index\.html$/i, '/').replace(/index\.html$/i, '/');
    return withoutIndex.startsWith('/') ? withoutIndex : `/${withoutIndex}`;
  };
  const createNotice = message => {
    const notice = document.createElement('p');
    notice.className = 'comments-section__notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.textContent = message;
    return notice;
  };

  const cleanupScope = scope => {
    const mounted = state.mounts.get(scope);
    if (mounted) {
      mounted.dispose?.();
      state.mounts.delete(scope);
    }
    // Twikoo 的 Vue 根会接管这个直接子节点；section 本身始终由主题保留。
    [...scope.children].forEach(node => {
      if (node.matches('.twikoo, [data-twikoo-root], [data-paper-moments-twikoo-node]')) node.remove();
    });
    scope.removeAttribute('data-twikoo-mounted');
  };
  const cleanupPage = () => {
    state.generation += 1;
    [...state.mounts.keys()].forEach(cleanupScope);
  };
  const registerCleanup = () => {
    if (state.cleanupRegistered) return;
    const lifecycle = window.paperMomentsPjax;
    if (!lifecycle?.registerCleanup) return;
    state.cleanupRegistered = true;
    lifecycle.registerCleanup(() => {
      state.cleanupRegistered = false;
      cleanupPage();
    });
  };

  const loadTwikoo = () => {
    if (window.twikoo?.init) return Promise.resolve(window.twikoo);
    if (state.loader) return state.loader;
    const config = getConfig();
    const version = validVersion(config.twikoo?.version || config.comments?.twikoo_version);
    const src = `https://cdn.jsdelivr.net/npm/twikoo@${version}/dist/twikoo.all.min.js`;
    state.loader = new Promise((resolve, reject) => {
      const ready = () => window.twikoo?.init ? resolve(window.twikoo) : reject(new Error('Twikoo API unavailable'));
      const previous = document.querySelector('script[data-paper-moments-twikoo]');
      if (previous && previous.dataset.paperMomentsTwikooState !== 'error') {
        previous.addEventListener('load', ready, { once: true });
        previous.addEventListener('error', () => reject(new Error('Twikoo script failed')), { once: true });
        window.setTimeout(() => { if (window.twikoo?.init) ready(); }, 0);
        return;
      }
      previous?.remove();
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.paperMomentsTwikoo = 'true';
      script.dataset.paperMomentsTwikooState = 'loading';
      script.onload = () => { script.dataset.paperMomentsTwikooState = 'loaded'; ready(); };
      script.onerror = () => { script.dataset.paperMomentsTwikooState = 'error'; reject(new Error('Twikoo script failed')); };
      document.head.appendChild(script);
    }).catch(error => {
      state.loader = null;
      throw error;
    });
    return state.loader;
  };

  const enhanceAccessibility = mounted => {
    // Twikoo 会将传入的 id 统一为 `.twikoo`；从稳定 scope 找实际渲染根。
    const liveRoot = mounted.scope?.querySelector('.twikoo');
    if (!liveRoot?.isConnected) return false;
    const editor = liveRoot.querySelector('.tk-input textarea');
    if (editor && !editor.getAttribute('aria-label')) editor.setAttribute('aria-label', mounted.label || '评论内容');
    const markdown = liveRoot.querySelector('a.tk-submit-action-icon.__markdown');
    if (markdown && !markdown.getAttribute('aria-label')) {
      markdown.setAttribute('aria-label', 'Markdown 使用说明');
      markdown.setAttribute('title', 'Markdown 使用说明');
    }
    return Boolean(editor && markdown);
  };
  const createRoot = scope => {
    const root = document.createElement('div');
    root.id = scope.dataset.twikooId || 'twikoo';
    root.dataset.twikooRoot = 'true';
    root.dataset.paperMomentsTwikooNode = 'true';
    root.className = scope.classList.contains('comment-board-comments')
      ? 'comment-board-comments__twikoo'
      : 'comments-section__twikoo';
    root.setAttribute('aria-busy', 'true');
    scope.appendChild(root);
    return root;
  };

  const mountScope = async scope => {
    if (!scope?.isConnected) return false;
    cleanupScope(scope);
    const config = getConfig();
    const envId = String(config.twikoo?.envId || '').trim();
    const lang = String(config.twikoo?.lang || 'zh-CN').trim() || 'zh-CN';
    const path = normalizePath(scope.dataset.twikooPath || '/');
    const generation = state.generation;
    const root = createRoot(scope);
    if (!envId) {
      root.replaceChildren(createNotice(config.comments?.unconfigured_label || '评论区尚未配置。'));
      root.removeAttribute('aria-busy');
      return false;
    }

    root.replaceChildren(createNotice('正在展开留言簿……'));
    const mounted = {
      observer: null,
      timer: 0,
      disposed: false,
      id: root.id,
      label: scope.dataset.twikooLabel || '评论内容',
      scope,
    };
    mounted.dispose = () => {
      mounted.disposed = true;
      mounted.observer?.disconnect();
      if (mounted.timer) window.clearInterval(mounted.timer);
      mounted.timer = 0;
    };

    try {
      const twikoo = await loadTwikoo();
      if (mounted.disposed || generation !== state.generation || !scope.isConnected) return false;
      const initialized = twikoo.init({ envId, el: `#${CSS.escape(root.id)}`, path, lang });
      mounted.observer = new MutationObserver(() => { enhanceAccessibility(mounted); });
      mounted.observer.observe(document.getElementById('main-content') || document.body, { childList: true, subtree: true });
      state.mounts.set(scope, mounted);
      let attempts = 0;
      mounted.timer = window.setInterval(() => {
        attempts += 1;
        const ready = enhanceAccessibility(mounted);
        if (ready || attempts >= 80 || mounted.disposed || !scope.isConnected) {
          if (mounted.timer) window.clearInterval(mounted.timer);
          mounted.timer = 0;
        }
      }, 100);
      await Promise.resolve(initialized);
      if (mounted.disposed || generation !== state.generation || !scope.isConnected) return false;
      root.removeAttribute('aria-busy');
      scope.dataset.twikooMounted = 'true';
      enhanceAccessibility(mounted);
      window.dispatchEvent(new CustomEvent('paper-moments:twikoo-mounted', { detail: { scope, path } }));
      return true;
    } catch (_) {
      cleanupScope(scope);
      if (generation !== state.generation || !scope.isConnected) return false;
      const errorRoot = createRoot(scope);
      errorRoot.replaceChildren(createNotice('评论服务暂时不可用，请稍后再试。'));
      errorRoot.removeAttribute('aria-busy');
      return false;
    }
  };

  const mountPage = () => {
    cleanupPage();
    const scopes = [...document.querySelectorAll('[data-twikoo-scope]')];
    if (!scopes.length) return Promise.resolve([]);
    registerCleanup();
    return Promise.all(scopes.map(mountScope));
  };

  const mountAfterPjax = () => {
    window.requestAnimationFrame(() => { void mountPage(); });
  };
  // comments.js 是全局 defer 模块；不要依赖 PJAX 替换区域里某个页面脚本是否重执行。
  // 这样从移动端或深层页面返回 /comment/ 时，新的 section 也一定会重新挂载 Twikoo。
  document.addEventListener('pjax:complete', mountAfterPjax);

  window.paperMomentsComments = {
    __paperMomentsCommentsReady: true,
    loadTwikoo,
    mountScope,
    mountPage,
    cleanupPage,
    normalizePath,
  };
  const start = () => { void mountPage(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
