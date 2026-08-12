(() => {
  const config = window.paperMomentsConfig?.reactions || {};
  const DEFAULT_CATALOG = [
    { emoji: '👍', name: 'thumbs-up', label: '赞' },
    { emoji: '❤️', name: 'red-heart', label: '喜欢' },
    { emoji: '😄', name: 'smile-face', label: '开心' },
    { emoji: '🎉', name: 'party-popper', label: '庆祝' },
    { emoji: '👀', name: 'eyes', label: '看过' },
  ];
  const memorySelected = new Map();
  let storage = null;
  let storageAvailable = true;
  let errorToastShown = false;

  const getStorage = () => {
    if (!storageAvailable) return null;
    if (storage) return storage;
    try {
      storage = window.localStorage;
      const probeKey = '__paper_moments_reactions_probe__';
      storage.setItem(probeKey, '1');
      storage.removeItem(probeKey);
      return storage;
    } catch (error) {
      storageAvailable = false;
      storage = null;
      return null;
    }
  };
  const normalizeCatalog = available => {
    const catalog = Array.isArray(available)
      ? available.map(item => ({
        emoji: String(item?.emoji || ''),
        name: String(item?.name || ''),
        label: String(item?.label || item?.name || ''),
      })).filter(item => item.emoji && item.name)
      : [];
    return catalog.length ? catalog : DEFAULT_CATALOG;
  };
  const normalizeCount = value => {
    const count = Number(value);
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  };
  const createAdapter = (options = {}) => {
    const endpoint = String(options.endpoint || '').replace(/\/$/, '');
    const getPath = String(options.getPath || options.get_path || '/reactions');
    const togglePath = String(options.togglePath || options.toggle_path || '/reaction');
    const storagePrefix = String(options.storageKey || options.storage_key || 'paper-moments-reactions');
    const catalog = normalizeCatalog(options.available);
    const enabled = options.enable === true && Boolean(endpoint);
    const request = async (path, init = {}) => {
      if (!enabled) return null;
      const response = await fetch(`${endpoint}${path}`, init);
      const text = response.status === 204 ? '' : await response.text();
      let result = null;
      if (text) {
        try {
          result = JSON.parse(text);
        } catch (error) {
          throw new Error('reactions 返回了无法解析的数据');
        }
      }
      if (!response.ok) throw new Error(`reactions 请求失败：${response.status}`);
      if (result && Number(result.code) !== 0) {
        throw new Error(result.msg || 'reactions 请求失败');
      }
      return result;
    };
    const selectionKey = (targetId, reactionName) => `${storagePrefix}:${targetId}:${reactionName}`;
    const isSelected = (targetId, reactionName) => {
      const key = selectionKey(targetId, reactionName);
      const currentStorage = getStorage();
      if (currentStorage) {
        try { return currentStorage.getItem(key) === '1'; } catch (error) { storageAvailable = false; }
      }
      return memorySelected.get(key) === true;
    };
    const setSelected = (targetId, reactionName, selected) => {
      const key = selectionKey(targetId, reactionName);
      memorySelected.set(key, selected);
      const currentStorage = getStorage();
      if (!currentStorage) return;
      try {
        if (selected) currentStorage.setItem(key, '1');
        else currentStorage.removeItem(key);
      } catch (error) {
        storageAvailable = false;
      }
    };
    return {
      enabled,
      catalog,
      get storageAvailable() { return storageAvailable; },
      isSelected,
      setSelected,
      get(targetId) {
        const query = new URLSearchParams({ targetId: String(targetId) });
        return request(`${getPath}?${query}`, {}).then(result => {
          const reactions = result?.data?.reactionsGot;
          return Array.isArray(reactions)
            ? reactions.map(item => ({
              name: String(item?.reaction_name || ''),
              count: normalizeCount(item?.count),
            })).filter(item => item.name)
            : [];
        });
      },
      toggle(targetId, reactionName, diff) {
        const query = new URLSearchParams({
          targetId: String(targetId),
          reaction_name: String(reactionName),
          diff: diff < 0 ? '-1' : '1',
        });
        return request(`${togglePath}?${query}`, { method: 'PATCH' }).then(() => undefined);
      },
    };
  };

  const adapter = createAdapter(config);
  const getRoot = () => document.querySelector('[data-bb-channel-root]');
  const getPostId = card => {
    const id = String(card.id || '');
    return id.startsWith('bb-') && id.length > 3 ? id.slice(3) : '';
  };
  const getTargetId = card => {
    const postId = getPostId(card);
    return postId ? `shuoshuo:${postId}` : '';
  };
  const layoutMasonry = feed => {
    if (window.paperMomentsShuoshuo?.layoutMasonry) window.paperMomentsShuoshuo.layoutMasonry(feed);
  };
  const showErrorToast = message => {
    if (errorToastShown) return;
    errorToastShown = true;
    if (window.paperMomentsToast) window.paperMomentsToast(message);
  };
  const setButtonState = (button, reaction, state) => {
    const selected = state.selected.get(reaction.name) === true;
    const count = state.counts.get(reaction.name) || 0;
    const busy = state.busy.has(reaction.name);
    button.classList.toggle('is-selected', selected);
    button.classList.toggle('is-busy', busy);
    button.disabled = !state.ready || busy;
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${reaction.label}，${selected ? '已选择' : '未选择'}，当前 ${count} 次，点击${selected ? '取消' : '添加'}`);
    button.title = `${reaction.label} · ${count}`;
    const countElement = button.querySelector('[data-paper-reaction-count]');
    if (countElement) countElement.textContent = String(count);
  };
  const renderButtons = state => {
    state.buttons.forEach((button, name) => {
      const reaction = adapter.catalog.find(item => item.name === name);
      if (reaction) setButtonState(button, reaction, state);
    });
  };
  const createReactionButton = (reaction, state) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'paper-card-reaction';
    button.dataset.paperReactionName = reaction.name;
    button.innerHTML = `<span aria-hidden="true" class="paper-card-reaction__emoji"></span><span data-paper-reaction-count>0</span>`;
    button.querySelector('.paper-card-reaction__emoji').textContent = reaction.emoji;
    button.addEventListener('click', () => toggleReaction(reaction, state));
    state.buttons.set(reaction.name, button);
    return button;
  };
  const toggleReaction = (reaction, state) => {
    if (!state.ready || state.busy.has(reaction.name)) return;
    const previousSelected = state.selected.get(reaction.name) === true;
    const previousCount = state.counts.get(reaction.name) || 0;
    const nextSelected = !previousSelected;
    const nextCount = Math.max(0, previousCount + (nextSelected ? 1 : -1));
    state.busy.add(reaction.name);
    state.selected.set(reaction.name, nextSelected);
    state.counts.set(reaction.name, nextCount);
    renderButtons(state);
    layoutMasonry(state.feed);
    adapter.toggle(state.targetId, reaction.name, nextSelected ? 1 : -1)
      .then(() => adapter.setSelected(state.targetId, reaction.name, nextSelected))
      .catch(error => {
        state.selected.set(reaction.name, previousSelected);
        state.counts.set(reaction.name, previousCount);
        renderButtons(state);
        layoutMasonry(state.feed);
        showErrorToast('反应暂时没有记录，请稍后重试');
      })
      .finally(() => {
        state.busy.delete(reaction.name);
        renderButtons(state);
      });
  };
  const loadReactions = state => {
    adapter.get(state.targetId)
      .then(reactions => {
        if (!state.group.isConnected) return;
        reactions.forEach(item => {
          if (state.counts.has(item.name)) state.counts.set(item.name, item.count);
        });
        state.ready = true;
        renderButtons(state);
        state.group.classList.add('is-ready');
        layoutMasonry(state.feed);
      })
      .catch(error => {
        if (!state.group.isConnected) return;
        state.group.remove();
        layoutMasonry(state.feed);
        showErrorToast('反应暂时无法加载');
      });
  };
  const mountCard = (card, feed) => {
    if (!adapter.enabled || card.dataset.paperReactionsMounted === 'true') return;
    const actions = card.querySelector('.paper-card-actions');
    const targetId = getTargetId(card);
    if (!actions || !targetId) return;
    const group = document.createElement('div');
    group.className = 'paper-card-reactions';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', '说说反应');
    const buttons = document.createElement('div');
    buttons.className = 'paper-card-reactions__buttons';
    const note = document.createElement('span');
    note.className = 'paper-card-reactions__note';
    note.textContent = '无需登录，选择状态保存在当前浏览器。';
    const state = {
      card,
      feed,
      group,
      targetId,
      buttons: new Map(),
      counts: new Map(adapter.catalog.map(reaction => [reaction.name, 0])),
      selected: new Map(adapter.catalog.map(reaction => [reaction.name, adapter.isSelected(targetId, reaction.name)])),
      busy: new Set(),
      ready: false,
    };
    adapter.catalog.forEach(reaction => buttons.append(createReactionButton(reaction, state)));
    group.append(buttons, note);
    actions.prepend(group);
    card.dataset.paperReactionsMounted = 'true';
    renderButtons(state);
    layoutMasonry(feed);
    loadReactions(state);
  };
  const enhance = () => {
    if (!adapter.enabled) return;
    const root = getRoot();
    const feed = root?.querySelector('[data-bb-channel-feed]');
    if (!feed) return;
    feed.querySelectorAll('.bb-channel-card').forEach(card => mountCard(card, feed));
  };
  let activeObserver = null;
  const boot = () => {
    if (!adapter.enabled) return;
    const root = getRoot();
    if (!root) return;
    enhance();
    activeObserver = new MutationObserver(enhance);
    activeObserver.observe(root, { childList: true, subtree: true });
  };

  window.paperMomentsReactions = { adapter, createAdapter };
  if (window.paperMomentsPjax) {
    window.paperMomentsPjax.registerCleanup(() => {
      if (activeObserver) activeObserver.disconnect();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
