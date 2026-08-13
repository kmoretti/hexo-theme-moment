window.paperMomentsPage?.registerModule('fcircle', () => {
  const root = document.querySelector('[data-fcircle-root]');
  if (!root) return;

  const state = root.querySelector('[data-fcircle-state]');
  const toolbar = root.querySelector('[data-fcircle-toolbar]');
  const summary = root.querySelector('[data-fcircle-summary]');
  const list = root.querySelector('[data-fcircle-list]');
  const more = root.querySelector('[data-fcircle-more]');
  const retry = root.querySelector('[data-fcircle-retry]');
  if (!state || !toolbar || !summary || !list || !more || !retry) return;

  const settings = window.paperMomentsConfig || {};
  const configured = settings.fcircle || {};
  const labels = {
    loading: configured.loading_label || '正在翻阅友邻们的新文章……',
    empty: configured.empty_label || '最近还没有收到友邻的新文章。',
    error: configured.error_label || '朋友圈暂时无法加载，请检查网络后重试。',
    retry: configured.retry_label || '重新加载',
    more: configured.load_more_label || '再翻几页',
    unknownDate: '时间未知',
  };
  const endpoint = root.dataset.fcircleUrl || configured.data_url || '';
  const pageSizeValue = Number.parseInt(root.dataset.fcirclePageSize || configured.page_size, 10);
  const pageSize = Number.isFinite(pageSizeValue) && pageSizeValue > 0
    ? Math.min(pageSizeValue, 100)
    : 20;
  let controller = null;
  let articles = [];
  let shown = 0;
  let destroyed = false;
  let loading = false;

  const text = value => String(value == null ? '' : value).trim();
  const setText = (element, value) => { element.textContent = text(value); };
  const safeUrl = (value, kind = 'href') => {
    const raw = text(value);
    if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw)) return '';
    try {
      const parsed = new URL(raw, window.location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      if (kind !== 'image') parsed.hash = '';
      return parsed.href;
    } catch (_) {
      return '';
    }
  };
  const dateInfo = value => {
    const label = text(value);
    if (!label) return { label: labels.unknownDate, time: 0 };
    const timestamp = Date.parse(label.replace(/\//g, '-').replace(' ', 'T'));
    return { label, time: Number.isNaN(timestamp) ? 0 : timestamp };
  };
  const normalize = payload => {
    const raw = payload && Array.isArray(payload.article_data) ? payload.article_data : [];
    const seen = new Set();
    return raw.map((item, index) => {
      const link = safeUrl(item && item.link);
      const title = text(item && item.title);
      if (!link || !title) return null;
      const keyUrl = new URL(link);
      keyUrl.hash = '';
      keyUrl.pathname = keyUrl.pathname.replace(/\/+$/, '') || '/';
      const key = keyUrl.href.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      const date = dateInfo(item.created || item.published || item.updated);
      return {
        title,
        link,
        author: text(item && item.author) || '友邻',
        avatar: safeUrl(item && item.avatar, 'image'),
        dateLabel: date.label,
        dateTime: date.time,
        sourceIndex: index,
      };
    }).filter(Boolean).sort((a, b) => b.dateTime - a.dateTime || a.sourceIndex - b.sourceIndex);
  };
  const setState = (message, isError = false) => {
    setText(state, message);
    state.hidden = !message;
    state.classList.toggle('is-error', isError);
  };
  const stat = name => summary.querySelector(`[data-fcircle-stat="${name}"]`);
  const renderStats = payload => {
    const stats = payload && payload.statistical_data || {};
    const friendCount = Number.isFinite(Number(stats.friends_num)) ? Number(stats.friends_num) : null;
    const activeCount = Number.isFinite(Number(stats.active_num)) ? Number(stats.active_num) : null;
    const articleCount = articles.length || (Number.isFinite(Number(stats.article_num)) ? Number(stats.article_num) : 0);
    if (friendCount !== null) setText(stat('friends'), `${friendCount} 位友邻`);
    if (activeCount !== null) setText(stat('active'), `${activeCount} 位活跃`);
    setText(stat('articles'), `${articleCount} 篇文章`);
    if (text(stats.last_updated_time)) setText(stat('updated'), `更新于 ${stats.last_updated_time}`);
    toolbar.hidden = false;
  };
  const fallbackAvatar = author => {
    const element = document.createElement('span');
    element.className = 'fcircle-card__avatar fcircle-card__avatar--fallback';
    element.textContent = text(author).charAt(0) || '友';
    element.setAttribute('aria-hidden', 'true');
    return element;
  };
  const renderCard = article => {
    const item = document.createElement('li');
    item.className = 'fcircle-card';

    const avatarLink = document.createElement('a');
    avatarLink.className = 'fcircle-card__avatar-link';
    avatarLink.href = article.link;
    avatarLink.target = '_blank';
    avatarLink.rel = 'noopener noreferrer';
    avatarLink.setAttribute('aria-label', `访问 ${article.author} 的文章`);
    if (article.avatar) {
      const image = document.createElement('img');
      image.className = 'fcircle-card__avatar';
      image.src = article.avatar;
      image.alt = article.author;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => {
        image.remove();
        avatarLink.appendChild(fallbackAvatar(article.author));
      }, { once: true });
      avatarLink.appendChild(image);
    } else {
      avatarLink.appendChild(fallbackAvatar(article.author));
    }

    const body = document.createElement('div');
    body.className = 'fcircle-card__body';
    const meta = document.createElement('div');
    meta.className = 'fcircle-card__meta';
    const author = document.createElement('span');
    author.className = 'fcircle-card__author';
    author.textContent = article.author;
    const date = document.createElement('time');
    date.className = 'fcircle-card__date';
    date.textContent = article.dateLabel;
    if (article.dateTime) date.dateTime = new Date(article.dateTime).toISOString();
    meta.append(author, date);

    const title = document.createElement('a');
    title.className = 'fcircle-card__title';
    title.href = article.link;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
    title.textContent = article.title;
    body.append(meta, title);
    item.append(avatarLink, body);
    return item;
  };
  const renderNext = () => {
    const next = articles.slice(shown, shown + pageSize);
    next.forEach(article => list.appendChild(renderCard(article)));
    shown += next.length;
    more.hidden = shown >= articles.length;
  };
  const load = async () => {
    if (destroyed || loading) return;
    const validEndpoint = safeUrl(endpoint);
    if (!validEndpoint) {
      setState('朋友圈数据地址未配置或不安全。', true);
      toolbar.hidden = false;
      retry.hidden = false;
      return;
    }
    loading = true;
    retry.hidden = true;
    more.hidden = true;
    setState(labels.loading);
    controller?.abort();
    controller = new AbortController();
    try {
      const response = await fetch(validEndpoint, {
        headers: { Accept: 'application/json,text/plain,*/*' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (destroyed) return;
      articles = normalize(payload);
      shown = 0;
      list.replaceChildren();
      renderStats(payload);
      if (!articles.length) {
        setState(labels.empty);
        return;
      }
      setState('');
      renderNext();
    } catch (error) {
      if (destroyed || error && error.name === 'AbortError') return;
      setState(labels.error, true);
      retry.hidden = false;
      toolbar.hidden = false;
    } finally {
      loading = false;
    }
  };

  const onMore = () => renderNext();
  const onRetry = () => {
    if (loading) return;
    load();
  };
  more.addEventListener('click', onMore);
  retry.addEventListener('click', onRetry);
  more.textContent = labels.more;
  retry.textContent = labels.retry;
  window.paperMomentsPage?.registerCleanup(() => {
    destroyed = true;
    controller?.abort();
    more.removeEventListener('click', onMore);
    retry.removeEventListener('click', onRetry);
  });
  load();
});
