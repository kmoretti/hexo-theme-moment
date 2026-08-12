(() => {
  const root = document.documentElement;
  const config = window.paperMomentsConfig || {};
  const appearance = config.appearance || {};
  const themeKey = appearance.themeKey || config.themeKey || 'paper-moments-theme';
  const accentKey = appearance.accentKey || config.accentKey || 'paper-moments-accent';
  const defaultChoice = ['system', 'light', 'dark'].includes(appearance.defaultMode) ? appearance.defaultMode : 'system';
  const defaultAccentHue = clampHue(appearance.defaultAccentHue ?? 136);
  const labels = { system: '跟随系统', light: '浅色模式', dark: '深色模式' };
  const choices = new Set(['system', 'light', 'dark']);
  const transitionDuration = 400;
  let transitionBusy = false;
  let manifestSyncQueued = false;

  function clampHue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 136;
    return Math.max(0, Math.min(360, Math.round(number)));
  }

  const isChoice = value => choices.has(value);

  const readStoredChoice = () => {
    try {
      const stored = window.localStorage.getItem(themeKey);
      return isChoice(stored) ? stored : null;
    } catch (_) {
      return null;
    }
  };

  const writeStoredChoice = choice => {
    try {
      window.localStorage.setItem(themeKey, choice);
    } catch (_) {
      // 隐私模式或禁用存储时保留页面内状态，不阻塞切换。
    }
  };

  const readStoredAccent = () => {
    try {
      return clampHue(window.localStorage.getItem(accentKey));
    } catch (_) {
      return defaultAccentHue;
    }
  };

  const writeStoredAccent = hue => {
    try {
      window.localStorage.setItem(accentKey, String(clampHue(hue)));
    } catch (_) {
      // 忽略不可写存储，保持本次会话中的调色结果。
    }
  };

  const getChoice = () => isChoice(root.dataset.themeChoice)
    ? root.dataset.themeChoice
    : (readStoredChoice() || defaultChoice);

  const systemTheme = () => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const resolve = choice => choice === 'system' ? systemTheme() : choice;
  const nextChoice = choice => ({ system: 'light', light: 'dark', dark: 'system' }[choice] || defaultChoice);

  const currentAccentHue = () => {
    const fromDataset = Number(root.dataset.accentHue);
    if (Number.isFinite(fromDataset)) return clampHue(fromDataset);
    const fromStyle = Number(root.style.getPropertyValue('--paper-accent-hue'));
    if (Number.isFinite(fromStyle)) return clampHue(fromStyle);
    return readStoredAccent();
  };

  const showToast = (message, timeout = 3200) => {
    const toast = document.querySelector('[data-paper-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), timeout);
  };
  window.paperMomentsToast = showToast;

  const updateLabels = choice => {
    document.querySelectorAll('[data-theme-label]').forEach(element => { element.textContent = labels[choice]; });
    document.querySelectorAll('[data-theme-toggle]').forEach(element => {
      element.setAttribute('aria-label', `当前${labels[choice]}，点击切换`);
      element.setAttribute('title', `当前${labels[choice]}，点击切换`);
    });
  };

  const updateAccentUi = hue => {
    const safeHue = clampHue(hue);
    document.querySelectorAll('[data-accent-range]').forEach(input => { input.value = String(safeHue); });
    document.querySelectorAll('[data-accent-value]').forEach(label => { label.textContent = `${safeHue}°`; });
    document.querySelectorAll('[data-accent-toggle]').forEach(button => {
      button.setAttribute('aria-label', `当前强调色 ${safeHue} 度，点击调节`);
      button.setAttribute('title', `当前强调色 ${safeHue}°`);
    });
  };

  const queueManifestSync = () => {
    if (manifestSyncQueued) return;
    manifestSyncQueued = true;
    window.setTimeout(() => {
      manifestSyncQueued = false;
      syncThemeChrome();
    }, 0);
  };

  const syncThemeChrome = () => {
    const computed = getComputedStyle(root);
    const resolvedTheme = root.dataset.theme || resolve(getChoice());
    const themeColor = (resolvedTheme === 'dark'
      ? computed.getPropertyValue('--paper-accent-primary-strong')
      : computed.getPropertyValue('--paper-accent-primary')).trim() || '#6f9274';

    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
      meta.setAttribute('content', themeColor);
    });
  };

  const applyAccent = (hue, options = {}) => {
    const safeHue = clampHue(hue);
    root.dataset.accentHue = String(safeHue);
    root.style.setProperty('--paper-accent-hue', String(safeHue));
    if (options.persist !== false) writeStoredAccent(safeHue);
    updateAccentUi(safeHue);
    if (options.syncChrome !== false) queueManifestSync();
    return safeHue;
  };

  const applyTheme = (choice, options = {}) => {
    const safeChoice = isChoice(choice) ? choice : defaultChoice;
    const resolved = resolve(safeChoice);
    root.dataset.themeChoice = safeChoice;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    if (options.persist !== false) writeStoredChoice(safeChoice);
    updateLabels(safeChoice);
    if (options.syncChrome !== false) queueManifestSync();
    return resolved;
  };

  const setToggleBusy = busy => {
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.disabled = busy;
      button.setAttribute('aria-busy', String(busy));
      button.classList.toggle('is-transitioning', busy);
    });
  };

  const getTransitionOrigin = (event, button) => {
    const rect = button.getBoundingClientRect();
    const fallbackX = rect.left + rect.width / 2;
    const fallbackY = rect.top + rect.height / 2;
    const x = event.detail === 0 || !Number.isFinite(event.clientX) ? fallbackX : event.clientX;
    const y = event.detail === 0 || !Number.isFinite(event.clientY) ? fallbackY : event.clientY;
    return {
      x: Math.min(Math.max(x, 0), window.innerWidth),
      y: Math.min(Math.max(y, 0), window.innerHeight),
    };
  };

  const animateTheme = (event, choice, currentResolved, nextResolved) => {
    if (transitionBusy) return;

    const canAnimate = typeof document.startViewTransition === 'function'
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && currentResolved !== nextResolved;
    if (!canAnimate) {
      applyTheme(choice);
      return;
    }

    const button = event.currentTarget;
    const { x, y } = getTransitionOrigin(event, button);
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    const currentIsDark = currentResolved === 'dark';
    const isGoingDark = nextResolved === 'dark';
    const frames = currentIsDark
      ? [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]
      : [`circle(${radius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`];
    const pseudoElement = currentIsDark ? '::view-transition-new(root)' : '::view-transition-old(root)';
    let transition;

    transitionBusy = true;
    setToggleBusy(true);
    root.dataset.themeTransition = isGoingDark ? 'to-dark' : 'to-light';

    try {
      transition = document.startViewTransition(() => { applyTheme(choice); });
    } catch (_) {
      root.removeAttribute('data-theme-transition');
      applyTheme(choice);
      transitionBusy = false;
      setToggleBusy(false);
      return;
    }

    Promise.resolve(transition.ready)
      .then(() => {
        root.animate(
          { clipPath: frames },
          {
            duration: transitionDuration,
            easing: 'ease-out',
            fill: 'forwards',
            pseudoElement,
          },
        );
      })
      .catch(() => undefined);

    const finish = () => {
      root.removeAttribute('data-theme-transition');
      transitionBusy = false;
      setToggleBusy(false);
      queueManifestSync();
    };
    Promise.resolve(transition.finished).then(finish, finish);
  };

  const accentPicker = () => document.querySelector('[data-accent-picker]');
  const accentToggle = () => document.querySelector('[data-accent-toggle]');
  const accentPanel = () => document.querySelector('[data-accent-panel]');
  const pwaInstallToggle = () => document.querySelector('[data-pwa-install]');
  let deferredInstallPrompt = null;
  const nav = document.querySelector('[data-site-nav]');
  const navToggle = document.querySelector('[data-nav-toggle]');
  const navGroups = () => Array.from(document.querySelectorAll('[data-nav-group]'));

  const setAccentPanelOpen = open => {
    const picker = accentPicker();
    const button = accentToggle();
    const panel = accentPanel();
    if (!picker || !button || !panel) return;
    picker.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
  };

  const closeAccentPanel = () => setAccentPanelOpen(false);

  const setNavGroupOpen = (group, open) => {
    if (!group) return;
    group.classList.toggle('is-open', open);
    group.querySelector('[data-nav-parent]')?.setAttribute('aria-expanded', String(open));
    const submenu = group.querySelector('[data-nav-submenu]');
    if (!submenu) return;
    submenu.setAttribute('aria-hidden', String(!open));
    submenu.inert = !open;
  };

  const closeNavGroups = (except = null) => {
    navGroups().forEach(group => {
      if (group !== except) setNavGroupOpen(group, false);
    });
  };

  const closeNavigation = () => {
    closeNavGroups();
    closeAccentPanel();
    if (!nav || !nav.classList.contains('is-open')) return;
    nav.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
    navToggle?.querySelector('.sr-only')?.replaceChildren('打开导航');
  };

  const openCurrentMobileGroup = () => {
    if (!nav || !nav.classList.contains('is-open')) return;
    const active = navGroups().find(group => group.classList.contains('is-active'));
    if (!active) return;
    closeNavGroups(active);
    setNavGroupOpen(active, true);
  };

  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.addEventListener('click', event => {
      if (transitionBusy) return;
      closeAccentPanel();
      const current = getChoice();
      const next = nextChoice(current);
      animateTheme(event, next, root.dataset.theme || resolve(current), resolve(next));
    });
  });

  const syncPwaInstallToggle = () => {
    const button = pwaInstallToggle();
    if (!button) return;
    button.hidden = !deferredInstallPrompt;
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    syncPwaInstallToggle();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    syncPwaInstallToggle();
  });

  pwaInstallToggle()?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    const button = pwaInstallToggle();
    button?.setAttribute('aria-busy', 'true');
    button && (button.disabled = true);
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    syncPwaInstallToggle();
  });

  document.querySelectorAll('[data-nav-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      if (!nav) return;
      const open = nav.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(open));
      button.querySelector('.sr-only')?.replaceChildren(open ? '关闭导航' : '打开导航');
      if (open) openCurrentMobileGroup();
      else {
        closeNavGroups();
        closeAccentPanel();
      }
    });
  });

  document.querySelectorAll('[data-nav-parent]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      closeAccentPanel();
      const group = button.closest('[data-nav-group]');
      if (!group) return;
      const willOpen = !group.classList.contains('is-open');
      closeNavGroups(group);
      setNavGroupOpen(group, willOpen);
    });
  });

  document.querySelectorAll('[data-accent-toggle]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      closeNavGroups();
      const picker = button.closest('[data-accent-picker]');
      const willOpen = !picker?.classList.contains('is-open');
      setAccentPanelOpen(Boolean(willOpen));
    });
  });

  document.querySelectorAll('[data-accent-range]').forEach(input => {
    input.addEventListener('input', () => { applyAccent(input.value); });
    input.addEventListener('change', () => { updateAccentUi(currentAccentHue()); });
  });

  document.querySelectorAll('[data-accent-reset]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      applyAccent(defaultAccentHue);
      showToast(`强调色已恢复为 ${defaultAccentHue}°`);
    });
  });

  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-nav-group], [data-nav-toggle], [data-accent-picker]')) return;
    closeNavGroups();
    closeAccentPanel();
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const hasOpenGroup = navGroups().some(group => group.classList.contains('is-open'));
    const accentOpen = accentPicker()?.classList.contains('is-open');
    if (!accentOpen && !hasOpenGroup && (!nav || !nav.classList.contains('is-open'))) return;
    event.preventDefault();
    if (accentOpen) {
      closeAccentPanel();
      accentToggle()?.focus();
      return;
    }
    closeNavigation();
    navToggle?.focus();
  });

  window.paperMomentsNavigation = {
    close: closeNavigation,
    closeGroups: closeNavGroups,
    closeAccent: closeAccentPanel,
    openCurrentMobileGroup,
    setGroupOpen: setNavGroupOpen,
  };

  const backToTop = document.querySelector('[data-back-to-top]');
  if (backToTop) {
    const syncBackToTop = () => {
      const shouldShow = window.scrollY > Math.max(320, window.innerHeight * .45);
      backToTop.hidden = !shouldShow;
      backToTop.classList.toggle('is-visible', shouldShow);
    };
    backToTop.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    });
    window.addEventListener('scroll', syncBackToTop, { passive: true });
    syncBackToTop();
  }

  applyAccent(currentAccentHue(), { persist: false, syncChrome: false });
  applyTheme(getChoice(), { persist: false, syncChrome: false });
  queueManifestSync();

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemChange = () => {
    if (getChoice() !== 'system' || transitionBusy) return;
    root.dataset.theme = resolve('system');
    root.style.colorScheme = root.dataset.theme;
    queueManifestSync();
  };
  if (media.addEventListener) media.addEventListener('change', handleSystemChange);
  else media.addListener(handleSystemChange);

  window.paperMomentsAppearance = {
    getThemeChoice: getChoice,
    getAccentHue: currentAccentHue,
    setAccentHue: hue => applyAccent(hue),
    setThemeChoice: choice => applyTheme(choice),
    syncChrome: queueManifestSync,
  };

})();
