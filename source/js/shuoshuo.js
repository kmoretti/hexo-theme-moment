window.paperMomentsPage?.registerModule('shuoshuo', () => {
  const settings = window.paperMomentsConfig || {};
  const moments = settings.shuoshuo || {};
  const profile = settings.profile || {};
  let lastFeed = null;
  let lastStatus = '';
  const normalizeTag = value => String(value || '').trim().replace(/^#+/, '');
  const normalizeSearch = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const readUrlFilters = () => {
    try {
      const url = new URL(window.location.href);
      return {
        tag: normalizeTag(url.searchParams.get('tag')) || null,
        search: normalizeSearch(url.searchParams.get('q')) || null,
      };
    } catch (error) {
      return { tag: null, search: null };
    }
  };
  const initialFilters = readUrlFilters();
  let activeTag = initialFilters.tag;
  let activeSearch = initialFilters.search;

  const toast = message => {
    if (window.paperMomentsToast) window.paperMomentsToast(message);
  };
  const getRoot = () => document.querySelector('[data-bb-channel-root]');
  const getComments = () => document.querySelector('#paper-moments-comments');
  const getPostText = card => card.querySelector('.bb-channel-content')?.textContent.trim() || '';
  const formatCardDate = card => {
    const timeLink = card.querySelector('.bb-channel-time');
    if (!timeLink || timeLink.dataset.paperDateFormatted === 'true') return;
    const parsed = new Date(timeLink.textContent.trim());
    if (Number.isNaN(parsed.getTime())) return;
    const pad = value => String(value).padStart(2, '0');
    timeLink.textContent = `${parsed.getFullYear()}年${pad(parsed.getMonth() + 1)}月${pad(parsed.getDate())}日 ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
    timeLink.dataset.paperDateFormatted = 'true';
  };
  const buildQuote = card => {
    const text = getPostText(card) || '（这条说说没有文字内容）';
    return text.split(/\r?\n/).map(line => `> ${line || '>'}`).join('\n');
  };
  const findEditor = () => {
    const comments = getComments();
    if (!comments) return null;
    return comments.querySelector('textarea') || comments.querySelector('[contenteditable="true"]');
  };
  const copyQuote = quote => {
    if (navigator.clipboard?.writeText) {
      const clipboardWrite = navigator.clipboard.writeText(quote).then(() => true).catch(() => false);
      const timeout = new Promise(resolve => window.setTimeout(() => resolve(false), 900));
      return Promise.race([clipboardWrite, timeout]).then(copied => {
        if (copied) return true;
        return copyQuoteFallback(quote);
      });
    }
    return copyQuoteFallback(quote);
  };
  const copyQuoteFallback = quote => {
    const input = document.createElement('textarea');
    input.value = quote;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
    input.remove();
    return Promise.resolve(copied);
  };
  const appendQuoteToEditor = quote => {
    const editor = findEditor();
    if (!editor) return false;
    const current = editor.matches('textarea') ? editor.value.trim() : editor.textContent.trim();
    const nextValue = current ? `${current}\n\n${quote}` : quote;
    if (editor.matches('textarea')) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(editor, nextValue);
      else editor.value = nextValue;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      editor.textContent = nextValue;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: nextValue }));
    }
    editor.focus({ preventScroll: true });
    return true;
  };
  const focusComments = (card, quote) => {
    const comments = getComments();
    if (!comments) return;
    comments.scrollIntoView({ behavior: 'smooth', block: 'start' });
    let attempts = 0;
    const tryFill = () => {
      if (appendQuoteToEditor(quote)) {
        toast(moments.quote_hint || '引用已准备好，可以继续编辑后发布。');
        return;
      }
      attempts += 1;
      if (attempts < 12) window.setTimeout(tryFill, 180);
      else copyQuote(quote).then(copied => toast(copied ? '引用已复制，请粘贴到评论框。' : '请复制引用内容后回复这条说说。'));
    };
    window.setTimeout(tryFill, 260);
    card?.setAttribute('data-paper-quoted', 'true');
  };
  const collectLightboxImages = card => [...card.querySelectorAll('[data-bb-media-index]')]
    .sort((left, right) => Number(left.dataset.bbMediaIndex) - Number(right.dataset.bbMediaIndex))
    .map(thumb => {
      const image = thumb.querySelector('img[data-bb-image-url]');
      const source = image?.dataset.bbImageUrl || image?.currentSrc || image?.src || '';
      try {
        const url = new URL(source, document.baseURI);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        return { url: url.href, type: 'image', alt: image?.alt || '' };
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);

  const installLightbox = root => {
    if (root.dataset.paperLightboxBound === 'true') return;
    root.dataset.paperLightboxBound = 'true';
    root.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      const thumb = target?.closest('[data-bb-media-index]');
      const card = thumb?.closest('.bb-channel-card');
      if (!thumb || !card) return;
      const images = collectLightboxImages(card);
      if (!images.length) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.paperMomentsMediaLightbox?.open(images, Number(thumb.dataset.bbMediaIndex) || 0, thumb);
    }, true);
  };

  const addCardActions = card => {
    if (card.dataset.paperMomentsEnhanced === 'true') return;
    const surface = card.querySelector('.bb-channel-card-surface');
    if (!surface) return;
    card.dataset.paperMomentsEnhanced = 'true';
    sanitizeCardContent(card);
    formatCardDate(card);
    const meta = card.querySelector('.bb-channel-meta');
    if (meta) {
      const author = document.createElement('div');
      author.className = 'paper-card-author';
      const avatar = document.createElement('img');
      avatar.src = profile.avatar || '';
      avatar.alt = `${profile.name || '作者'}的头像`;
      avatar.width = 32;
      avatar.height = 32;
      avatar.loading = 'lazy';
      const name = document.createElement('strong');
      name.textContent = moments.author_label || profile.name || '站点作者';
      const role = document.createElement('span');
      role.textContent = profile.role || '';
      author.append(avatar, document.createElement('span'));
      author.lastElementChild.append(name, role);
      meta.prepend(author);
    }
    const actions = document.createElement('footer');
    actions.className = 'paper-card-actions';
    const actionLinks = document.createElement('span');
    actionLinks.className = 'paper-card-actions__links';
    const commentButton = document.createElement('button');
    commentButton.type = 'button';
    commentButton.className = 'paper-card-action paper-card-action--comment';
    commentButton.setAttribute('aria-controls', 'paper-moments-comments');
    commentButton.textContent = moments.comment_label || '评论这条';
    commentButton.addEventListener('click', () => focusComments(card, buildQuote(card)));
    const source = card.querySelector('.bb-channel-time')?.href;
    if (source && !source.endsWith('#')) {
      const sourceLink = document.createElement('a');
      sourceLink.className = 'paper-card-action';
      sourceLink.href = source;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      sourceLink.textContent = moments.source_label || '查看原文';
      actionLinks.append(commentButton, sourceLink);
    } else actionLinks.append(commentButton);
    actions.append(actionLinks);
    surface.append(actions);
  };
  const sanitizeCardContent = card => {
    const content = card.querySelector('.bb-channel-content');
    if (!content || content.dataset.paperSanitized === 'true') return;
    content.querySelectorAll('script, style, iframe, object, embed, form, input, button').forEach(element => element.remove());
    content.querySelectorAll('*').forEach(element => {
      [...element.attributes].forEach(attribute => {
        if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
      });
      ['href', 'src', 'action'].forEach(name => {
        if (!element.hasAttribute(name)) return;
        try {
          const url = new URL(element.getAttribute(name), document.baseURI);
          const allowed = ['http:', 'https:', 'mailto:'].includes(url.protocol);
          if (!allowed) element.removeAttribute(name);
        } catch (error) {
          element.removeAttribute(name);
        }
      });
    });
    content.dataset.paperSanitized = 'true';
  };
  const removeDuplicateTags = card => {
    const contentText = card.querySelector('.bb-channel-content')?.textContent || '';
    card.querySelectorAll('.bb-channel-tags [data-paper-tag]').forEach(tag => {
      const value = normalizeTag(tag.dataset.paperTag || tag.textContent);
      if (value && contentText.includes(`#${value}`)) tag.remove();
    });
  };
  const sanitizeFeedLinks = feed => {
    feed.querySelectorAll('a').forEach(link => {
      try {
        const url = new URL(link.getAttribute('href') || '', document.baseURI);
        if (!link.getAttribute('href')) {
          const label = document.createElement('span');
          label.className = link.className;
          label.textContent = link.textContent;
          link.replaceWith(label);
          return;
        }
        if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
          link.removeAttribute('href');
          return;
        }
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
      } catch (error) {
        link.removeAttribute('href');
      }
    });
  };
  const getTagButtons = container => [...container.querySelectorAll('[data-paper-tag]')];
  const getCardTags = card => new Set(getTagButtons(card).map(button => normalizeTag(button.dataset.paperTag)).filter(Boolean));
  const getCardSearchText = card => normalizeSearch([
    getPostText(card),
    ...getCardTags(card).values(),
  ].join(' '));
  const ensureTagFilterUi = root => {
    const container = root.parentElement;
    if (!container) return null;
    let toolbar = container.querySelector('.paper-tag-filter-bar[data-paper-tag-filter]');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'paper-tag-filter-bar';
      toolbar.dataset.paperTagFilter = 'true';
      toolbar.setAttribute('role', 'search');
      toolbar.setAttribute('aria-label', '搜索和筛选说说');
      const searchGroup = document.createElement('div');
      searchGroup.className = 'paper-search';
      const searchLabel = document.createElement('label');
      searchLabel.className = 'paper-search__label';
      searchLabel.setAttribute('for', 'paper-moments-search');
      searchLabel.textContent = '搜索说说';
      const search = document.createElement('input');
      search.id = 'paper-moments-search';
      search.className = 'paper-search__input';
      search.type = 'search';
      search.name = 'q';
      search.placeholder = '搜索说说内容';
      search.autocomplete = 'off';
      search.value = activeSearch || '';
      search.setAttribute('aria-label', '搜索说说内容');
      search.addEventListener('input', event => {
        activeSearch = normalizeSearch(event.target.value) || null;
        updateFilterUrl({ replace: true });
        applyTagFilter();
      });
      const searchClear = document.createElement('button');
      searchClear.type = 'button';
      searchClear.className = 'paper-search__clear';
      searchClear.textContent = '清除搜索';
      searchClear.addEventListener('click', () => setSearchFilter(null));
      searchGroup.append(searchLabel, search, searchClear);
      const label = document.createElement('span');
      label.className = 'paper-tag-filter-bar__label';
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'paper-tag-filter-bar__clear';
      clear.textContent = '清除筛选';
      clear.addEventListener('click', () => {
        activeTag = null;
        activeSearch = null;
        updateFilterUrl();
        applyTagFilter();
      });
      toolbar.append(searchGroup, label, clear);
      root.insertAdjacentElement('beforebegin', toolbar);
    }
    let empty = root.querySelector('[data-paper-tag-empty]');
    if (!empty) {
      empty = document.createElement('p');
      empty.className = 'paper-tag-filter-empty';
      empty.dataset.paperTagEmpty = 'true';
      empty.setAttribute('role', 'status');
      root.append(empty);
    }
    return {
      toolbar,
      search: toolbar.querySelector('.paper-search__input'),
      searchClear: toolbar.querySelector('.paper-search__clear'),
      label: toolbar.querySelector('.paper-tag-filter-bar__label'),
      clear: toolbar.querySelector('.paper-tag-filter-bar__clear'),
      empty,
    };
  };
  const updateFilterUrl = (options = {}) => {
    const url = new URL(window.location.href);
    if (activeTag) url.searchParams.set('tag', activeTag);
    else url.searchParams.delete('tag');
    if (activeSearch) url.searchParams.set('q', activeSearch);
    else url.searchParams.delete('q');
    const method = options.replace ? 'replaceState' : 'pushState';
    window.history[method]({ paperTag: activeTag, paperSearch: activeSearch }, '', url.toString());
  };
  const setTagFilter = (tag, options = {}) => {
    const nextTag = normalizeTag(tag) || null;
    const next = options.toggle && activeTag === nextTag ? null : nextTag;
    if (next === activeTag && !options.force) return;
    activeTag = next;
    if (options.updateUrl !== false) updateFilterUrl();
    applyTagFilter();
  };
  const setSearchFilter = search => {
    const nextSearch = normalizeSearch(search) || null;
    if (nextSearch === activeSearch) return;
    activeSearch = nextSearch;
    updateFilterUrl({ replace: true });
    applyTagFilter();
  };
  const enhanceTagFilters = feed => {
    feed.querySelectorAll('.bb-channel-content span, .bb-channel-content a:not([href]), .bb-channel-tags span').forEach(element => {
      if (element.matches('[data-paper-tag]')) return;
      const text = element.textContent.trim();
      if (!/^#[^\s#]+$/.test(text)) return;
      const tag = normalizeTag(text);
      if (!tag) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = element.closest('.bb-channel-content')
        ? 'paper-tag-filter paper-tag-filter--inline'
        : 'paper-tag-filter';
      button.dataset.paperTag = tag;
      button.textContent = `#${tag}`;
      button.addEventListener('click', () => setTagFilter(tag, { toggle: true }));
      element.replaceWith(button);
    });
  };
  const applyTagFilter = () => {
    const root = getRoot();
    const feed = root?.querySelector('[data-bb-channel-feed]');
    if (!root || !feed) return;
    const ui = ensureTagFilterUi(root);
    const cards = [...feed.querySelectorAll('.bb-channel-card')];
    const visibleCards = cards.filter(card => {
      const matchesTag = !activeTag || getCardTags(card).has(activeTag);
      const matchesSearch = !activeSearch || getCardSearchText(card).includes(activeSearch);
      const matches = matchesTag && matchesSearch;
      if (card.hidden !== !matches) card.hidden = !matches;
      card.classList.toggle('is-filtered-out', !matches);
      return matches;
    });
    getTagButtons(feed).forEach(button => {
      const selected = Boolean(activeTag && normalizeTag(button.dataset.paperTag) === activeTag);
      const pressed = String(selected);
      const title = selected ? '取消标签筛选' : `筛选 #${normalizeTag(button.dataset.paperTag)}`;
      button.classList.toggle('is-active', selected);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
      if (button.title !== title) button.title = title;
    });
    if (ui) {
      const filterParts = [];
      if (activeTag) filterParts.push(`#${activeTag}`);
      if (activeSearch) filterParts.push(`“${activeSearch}”`);
      const labelText = filterParts.length ? `正在筛选：${filterParts.join(' + ')}（${visibleCards.length} 条）` : '';
      const emptyText = filterParts.length ? `当前已加载的说说中没有匹配 ${filterParts.join(' + ')} 的内容。` : '';
      const hasFilter = Boolean(activeTag || activeSearch);
      const emptyHidden = !hasFilter || visibleCards.length > 0;
      ui.toolbar.hidden = false;
      const searchValue = activeSearch || '';
      if (ui.search.value !== searchValue) ui.search.value = searchValue;
      ui.searchClear.hidden = !activeSearch;
      ui.clear.hidden = !hasFilter;
      if (ui.label.textContent !== labelText) ui.label.textContent = labelText;
      if (ui.empty.hidden !== emptyHidden) ui.empty.hidden = emptyHidden;
      if (ui.empty.textContent !== emptyText) ui.empty.textContent = emptyText;
    }
    layoutMasonry(feed);
  };
  const layoutMasonry = feed => {
    if (window.getComputedStyle(feed).display !== 'grid') return;
    const rowHeight = 8;
    const rowGap = 20;
    feed.querySelectorAll('.bb-channel-card:not([hidden])').forEach(card => {
      const span = Math.max(1, Math.ceil((card.getBoundingClientRect().height + rowGap) / (rowHeight + rowGap)));
      card.style.gridRowEnd = `span ${span}`;
    });
  };
  const observeCardImages = feed => {
    feed.querySelectorAll('img').forEach(image => {
      const candidate = image.dataset.bbImageUrl || image.getAttribute('src') || '';
      try {
        const url = new URL(candidate, document.baseURI);
        if (!['http:', 'https:'].includes(url.protocol)) {
          image.removeAttribute('src');
          delete image.dataset.bbImageUrl;
          return;
        }
      } catch (error) {
        image.removeAttribute('src');
        delete image.dataset.bbImageUrl;
        return;
      }
      if (image.dataset.paperMasonryObserved === 'true') return;
      image.dataset.paperMasonryObserved = 'true';
      image.addEventListener('load', () => layoutMasonry(feed), { once: true });
      image.addEventListener('error', () => layoutMasonry(feed), { once: true });
    });
  };
  const normalizeStatus = () => {
    const root = getRoot();
    const status = root?.querySelector('[data-bb-channel-status]');
    const feed = root?.querySelector('[data-bb-channel-feed]');
    if (!status || !feed) return;
    const text = status.textContent.trim();
    if (text === 'Loading...') {
      lastStatus = 'loading';
      status.textContent = moments.loading_label || '正在收集最新的便签……';
      return;
    }
    if (/^API responded|Failed to fetch|NetworkError|Load failed/i.test(text)) {
      lastStatus = 'error';
      status.textContent = '';
      const message = document.createElement('span');
      message.textContent = moments.error_label || '暂时无法加载说说，请稍后重试';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'paper-retry';
      retry.textContent = moments.retry_label || '重新加载';
      retry.addEventListener('click', () => window.location.reload());
      status.append(message, retry);
      return;
    }
    if (!status.textContent.trim() && feed.children.length === 0 && lastFeed === feed && lastStatus !== 'error') {
      lastStatus = 'empty';
      status.textContent = moments.empty_label || '还没有公开说说';
    }
  };
  const enhance = () => {
    const root = getRoot();
    const feed = root?.querySelector('[data-bb-channel-feed]');
    if (!feed) return;
    installLightbox(root);
    feed.querySelectorAll('.bb-channel-card').forEach(addCardActions);
    observeCardImages(feed);
    sanitizeFeedLinks(feed);
    enhanceTagFilters(feed);
    feed.querySelectorAll('.bb-channel-card').forEach(removeDuplicateTags);
    normalizeStatus();
    lastFeed = feed;
    applyTagFilter();
  };
  let activeObserver = null;
  const boot = () => {
    const root = getRoot();
    if (!root) return;
    enhance();
    activeObserver = new MutationObserver(enhance);
    activeObserver.observe(root, { childList: true, subtree: true, characterData: true });
    const onResize = () => {
      const currentFeed = root.querySelector('[data-bb-channel-feed]');
      if (currentFeed) layoutMasonry(currentFeed);
    };
    window.addEventListener('resize', onResize, { passive: true });
    const onPopstate = () => {
      const filters = readUrlFilters();
      activeTag = filters.tag;
      activeSearch = filters.search;
      applyTagFilter();
    };
    window.addEventListener('popstate', onPopstate);
    window.paperMomentsPage?.registerCleanup(() => {
      if (activeObserver) activeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('popstate', onPopstate);
    });
  };
  window.paperMomentsShuoshuo = { layoutMasonry, setTagFilter };
  boot();
});
