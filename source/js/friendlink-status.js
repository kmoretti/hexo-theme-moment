window.paperMomentsPage?.registerModule('friendlink-status', () => {
  const root = document.querySelector('[data-friendlink-status-root]');
  if (!root) return;

  const filter = root.querySelector('[data-friendlink-status-filter]');
  const search = root.querySelector('[data-friendlink-status-search]');
  const clear = root.querySelector('[data-friendlink-status-clear]');
  const count = root.querySelector('[data-friendlink-status-count]');
  const message = root.querySelector('[data-friendlink-status-message]');
  const grid = root.querySelector('[data-friendlink-status-grid]');
  const pagination = root.querySelector('[data-friendlink-status-pagination]');
  const retry = root.querySelector('[data-friendlink-status-retry]');
  const unavailable = root.querySelector('[data-friendlink-status-unavailable]');
  if (!filter || !search || !clear || !count || !message || !grid || !pagination || !retry || !unavailable) return;

  const timeoutMs = 12000;
  const maxRecords = 1000;
  const validStatuses = new Set(['pending', 'approved', 'rejected']);
  const validTypes = new Set(['apply', 'update']);
  const text = value => String(value == null ? '' : value).trim();
  const pageSize = (() => {
    const value = Number.parseInt(root.dataset.pageSize, 10);
    return Number.isFinite(value) ? Math.min(50, Math.max(1, value)) : 12;
  })();
  let page = 1;
  let searchTimer = 0;
  let activeRequest = null;
  let records = [];

  const setText = (element, value) => { element.textContent = value; };
  const safeEndpoint = value => {
    try {
      const url = new URL(text(value));
      return url.protocol === 'https:' ? url : null;
    } catch (_) {
      return null;
    }
  };
  const safeHttpUrl = value => {
    const source = text(value);
    if (!source) return '';
    try {
      const url = new URL(source);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : '';
    } catch (_) {
      return '';
    }
  };
  const create = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value != null) element.textContent = value;
    return element;
  };
  const setMessage = (value, state = '') => {
    message.dataset.state = state;
    setText(message, value);
    message.hidden = !value;
  };
  const setCount = value => setText(count, value || '');
  const clearResults = () => {
    grid.replaceChildren();
    pagination.replaceChildren();
  };
  const clearError = () => {
    retry.hidden = true;
    unavailable.hidden = true;
  };
  const cancelRequest = () => {
    if (!activeRequest) return;
    const request = activeRequest;
    activeRequest = null;
    request.cancelled = true;
    request.controller.abort();
  };
  const statusLabel = value => ({ pending: '待审核', approved: '已通过', rejected: '未通过' }[value] || '未知状态');
  const typeLabel = value => ({ apply: '申请', update: '更新' }[value] || '未知类型');
  const normalizeRecords = data => {
    if (!data || !Array.isArray(data.submissions)) throw new Error('invalid-list');
    if (data.submissions.length > maxRecords) throw new Error('too-many-records');
    return data.submissions.filter(item => item && validStatuses.has(item.status) && validTypes.has(item.type)).map(item => ({

      name: text(item.name) || '未命名站点',
      description: text(item.description),
      friendslink: safeHttpUrl(item.friendslink),
      feeds: safeHttpUrl(item.feeds),
      status: item.status,
      type: item.type,
    }));
  };
  const buildUrl = endpoint => {
    const url = new URL(endpoint);
    url.searchParams.set('public', '1');
    if (validStatuses.has(filter.value)) url.searchParams.set('status', filter.value);
    const keyword = text(search.value);
    if (keyword) url.searchParams.set('search', keyword);
    return url;
  };
  const renderCard = item => {
    const card = create('li', 'friendlink-status-card');
    const top = create('div', 'friendlink-status-card__top');
    const name = create('h3', 'friendlink-status-card__name', item.name);
    const badges = create('div', 'friendlink-status-card__badges');
    badges.append(
      create('span', `friendlink-status-card__badge is-${item.status}`, statusLabel(item.status)),
      create('span', 'friendlink-status-card__type', typeLabel(item.type)),
    );
    top.append(name, badges);
    const description = create('p', 'friendlink-status-card__description', item.description || '暂未填写简介');
    card.append(top, description);
    if (item.friendslink || item.feeds) {
      const actions = create('div', 'friendlink-status-card__actions');
      if (item.friendslink) {
        const link = create('a', 'friendlink-status-card__link', '查看友链页');
        link.href = item.friendslink;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        actions.append(link);
      }
      if (item.feeds) {
        const feed = create('a', 'friendlink-status-card__link', 'RSS');
        feed.href = item.feeds;
        feed.target = '_blank';
        feed.rel = 'noopener noreferrer';
        actions.append(feed);
      }
      card.append(actions);
    }
    return card;
  };
  const button = (label, action, disabled = false, current = false) => {
    const element = create('button', `friendlink-status__page${current ? ' is-current' : ''}`, label);
    element.type = 'button';
    element.disabled = disabled;
    if (current) element.setAttribute('aria-current', 'page');
    element.addEventListener('click', action);
    return element;
  };
  const renderPagination = totalPages => {
    pagination.replaceChildren();
    if (totalPages <= 1) return;
    const fragment = document.createDocumentFragment();
    fragment.append(button('上一页', () => setPage(page - 1), page <= 1));
    const pages = [];
    if (totalPages <= 7) {
      for (let index = 1; index <= totalPages; index += 1) pages.push(index);
    } else {
      pages.push(1);
      if (page > 3) pages.push('…');
      for (let index = Math.max(2, page - 1); index <= Math.min(totalPages - 1, page + 1); index += 1) pages.push(index);
      if (page < totalPages - 2) pages.push('…');
      pages.push(totalPages);
    }
    pages.forEach(value => {
      if (value === '…') fragment.append(create('span', 'friendlink-status__dots', '…'));
      else fragment.append(button(String(value), () => setPage(value), false, value === page));
    });
    fragment.append(button('下一页', () => setPage(page + 1), page >= totalPages));
    pagination.append(fragment);
  };
  const render = ({ focusResults = false } = {}) => {
    clearResults();
    const total = records.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(Math.max(1, page), totalPages);
    setCount(total ? `共 ${total} 条` : '共 0 条');
    if (!total) {
      setMessage('暂时没有符合条件的公开记录。', 'empty');
      return;
    }
    setMessage('', '');
    grid.tabIndex = -1;
    grid.setAttribute('aria-label', `第 ${page} 页，共 ${totalPages} 页的公开申请记录`);
    records.slice((page - 1) * pageSize, page * pageSize).forEach(item => grid.append(renderCard(item)));
    renderPagination(totalPages);
    if (focusResults) grid.focus();
  };
  const setPage = nextPage => {
    page = nextPage;
    render({ focusResults: true });
  };
  const load = async () => {
    const endpoint = safeEndpoint(root.dataset.endpoint);
    if (!endpoint) return;
    cancelRequest();
    clearError();
    clearResults();
    setCount('');
    setMessage('正在翻开申请记录……', 'loading');
    const request = { controller: new AbortController(), cancelled: false, timedOut: false };
    activeRequest = request;
    const timeout = window.setTimeout(() => {
      if (activeRequest === request) {
        request.timedOut = true;
        request.controller.abort();
      }
    }, timeoutMs);
    try {
      const response = await fetch(buildUrl(endpoint), { cache: 'no-store', credentials: 'omit', signal: request.controller.signal });
      if (activeRequest !== request || request.cancelled) return;
      if (!response.ok) throw new Error('http');
      const data = await response.json();
      if (activeRequest !== request || request.cancelled) return;
      const nextRecords = normalizeRecords(data);
      if (activeRequest !== request || request.cancelled) return;
      records = nextRecords;
      render();
    } catch (caught) {
      if (activeRequest !== request || request.cancelled) return;
      records = [];
      clearResults();
      setCount('');
      setMessage(caught && caught.name === 'AbortError' && request.timedOut
        ? '读取记录超时，请稍后重试。'
        : (caught && caught.message === 'too-many-records'
          ? '公开记录过多，请先缩小筛选范围后重试。'
          : '公开申请记录暂时无法加载，请稍后重试。'), 'error');
      retry.hidden = false;
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest === request) activeRequest = null;
    }
  };

  const endpoint = safeEndpoint(root.dataset.endpoint);
  if (!endpoint) {
    filter.disabled = true;
    search.disabled = true;
    clear.disabled = true;
    retry.disabled = true;
    setMessage('', '');
    setText(unavailable, '公开申请记录暂未配置。');
    unavailable.hidden = false;
    return;
  }

  filter.addEventListener('change', () => {
    page = 1;
    load();
  });
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    clear.hidden = !text(search.value);
    searchTimer = window.setTimeout(() => {
      page = 1;
      load();
    }, 250);
  });
  clear.addEventListener('click', () => {
    if (!search.value) return;
    window.clearTimeout(searchTimer);
    search.value = '';
    clear.hidden = true;
    page = 1;
    load();
    search.focus();
  });
  retry.addEventListener('click', load);
  load();
  window.paperMomentsPage?.registerCleanup(() => {
    cancelRequest();
    window.clearTimeout(searchTimer);
  });
});
