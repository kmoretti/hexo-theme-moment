(() => {
  const settings = window.paperMomentsConfig || {};
  const linksConfig = settings.links || {};
  const root = document.querySelector('[data-links-root]');
  if (!root) return;

  const status = root.querySelector('[data-links-status]');
  const groups = root.querySelector('[data-links-groups]');
  const summary = root.querySelector('[data-links-summary]');
  const toolbar = root.querySelector('[data-links-toolbar]');
  const message = root.querySelector('[data-links-message]');
  const retry = root.querySelector('[data-links-retry]');
  let loading = false;

  const text = value => String(value == null ? '' : value).trim();
  const setText = (element, value) => { element.textContent = text(value); };
  const unquote = value => {
    const source = text(value);
    if (source.length < 2) return source;
    const first = source[0];
    const last = source[source.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return source.slice(1, -1).replace(first === '"' ? /\\([\\"nrt])/g : /''/g, match => {
        if (match === "''") return "'";
        return ({ '\\n': '\n', '\\r': '\r', '\\t': '\t', '\\\\': '\\', '\\"': '"' }[match] || match);
      });
    }
    return source;
  };
  const scalar = value => unquote(text(value).replace(/\s+#.*$/, ''));

  const parseInlineTags = value => {
    const source = scalar(value);
    if (!source || source === '[]') return [];
    if (!source.startsWith('[') || !source.endsWith(']')) return [];
    return source.slice(1, -1).split(',').map(unquote).map(text).filter(Boolean);
  };

  // 只解析当前 links.yml 使用的列表和字段，避免把远程内容当作可执行 HTML。
  const parseLinksYaml = source => {
    const parsedGroups = [];
    let currentGroup = null;
    let currentLink = null;
    let readingTags = false;

    source.replace(/^\uFEFF/, '').split(/\r?\n/).forEach(line => {
      if (!text(line) || /^\s*#/.test(line)) return;
      const indent = line.match(/^\s*/)[0].length;
      const content = line.trim();
      const property = content.match(/^([A-Za-z_][\w-]*):(?:\s*(.*))?$/);

      if (indent === 0 && content.startsWith('- class_name:')) {
        currentGroup = { class_name: scalar(content.slice('- class_name:'.length)), class_desc: '', link_list: [] };
        parsedGroups.push(currentGroup);
        currentLink = null;
        readingTags = false;
        return;
      }
      if (!currentGroup) return;

      if (indent === 2 && property && property[1] === 'class_desc') {
        currentGroup.class_desc = scalar(property[2]);
        currentLink = null;
        readingTags = false;
        return;
      }
      if (indent === 2 && property && property[1] === 'link_list') {
        currentLink = null;
        readingTags = false;
        return;
      }
      if (indent === 4 && content.startsWith('- name:')) {
        currentLink = { name: scalar(content.slice('- name:'.length)), tags: [] };
        currentGroup.link_list.push(currentLink);
        readingTags = false;
        return;
      }
      if (!currentLink) return;

      if (readingTags && indent >= 8 && content.startsWith('- ')) {
        currentLink.tags.push(scalar(content.slice(2)));
        return;
      }
      if (indent < 6) return;
      if (!property) return;
      const key = property[1];
      const value = property[2] || '';
      if (key === 'tags') {
        currentLink.tags = parseInlineTags(value);
        readingTags = !text(value);
        return;
      }
      readingTags = false;
      if (['name', 'link', 'avatar', 'descr', 'siteshot'].includes(key)) currentLink[key] = scalar(value);
    });

    const validGroups = parsedGroups.map(group => ({
      ...group,
      link_list: group.link_list.filter(item => text(item.name) && safeUrl(item.link)),
    })).filter(group => group.link_list.length);
    if (!validGroups.length) throw new Error('No valid links found');
    return validGroups;
  };

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

  const normalizeUrl = value => {
    const safe = safeUrl(value);
    if (!safe) return '';
    const url = new URL(safe);
    url.hash = '';
    if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) url.port = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
  };

  const getLatencyMap = data => {
    if (!data || !Array.isArray(data.link_data)) throw new Error('Invalid latency data');
    const map = new Map();
    data.link_data.forEach(item => {
      const key = normalizeUrl(item.link);
      if (key) map.set(key, item);
    });
    return map;
  };

  const formatLatency = value => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return '';
    return number < 1 ? `延迟 ${Math.round(number * 1000)} ms` : `延迟 ${number.toFixed(2)} s`;
  };

  const create = (tag, className, content) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content != null) element.textContent = content;
    return element;
  };

  const renderImage = (source, className, alt, fallbackText, loading = 'lazy') => {
    const frame = create('span', className);
    const url = safeUrl(source);
    if (!url) {
      frame.classList.add('is-error');
      frame.append(create('span', `${className}__fallback`, fallbackText));
      return frame;
    }
    const image = document.createElement('img');
    image.src = url;
    image.alt = alt;
    image.loading = loading;
    image.decoding = 'async';
    image.addEventListener('error', () => {
      frame.classList.add('is-error');
      image.remove();
      frame.append(create('span', `${className}__fallback`, fallbackText));
    }, { once: true });
    frame.append(image);
    return frame;
  };

  const renderCard = (item, latencyMap) => {
    const link = safeUrl(item.link);
    const name = text(item.name);
    const description = text(item.descr);
    const domain = (() => {
      try { return new URL(link).host; } catch (_) { return link; }
    })();
    const card = create('article', 'links-card');
    const anchor = create('a', 'links-card__link');
    anchor.href = link;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';

    const shot = renderImage(item.siteshot, 'links-card__shot', `${name}的网站截图`, '网站截图暂不可用');
    const avatar = renderImage(item.avatar, 'links-card__avatar', `${name}的头像`, name.slice(0, 1) || '友');
    const body = create('span', 'links-card__body');
    const identity = create('span', 'links-card__identity');
    identity.append(create('strong', 'links-card__name', name), create('span', 'links-card__domain', domain));
    body.append(identity);
    if (description) {
      const descriptionNode = create('span', 'links-card__description', description);
      descriptionNode.title = description;
      body.append(descriptionNode);
    }

    const footer = create('span', 'links-card__footer');
    const tags = (Array.isArray(item.tags) ? item.tags : []).map(text).filter(Boolean);
    if (tags.length) {
      const tagList = create('span', 'links-card__tags');
      tags.forEach(tag => tagList.append(create('span', 'links-card__tag', tag)));
      footer.append(tagList);
    }
    const detection = latencyMap.get(normalizeUrl(link));
    if (detection) {
      const latencyText = detection.reachable === false ? '' : formatLatency(detection.latency);
      const latency = create('span', `links-card__latency${latencyText ? '' : ' is-unavailable'}`, latencyText || '暂不可用');
      latency.title = latencyText ? '最近一次检测延迟' : '最近一次检测无法访问';
      footer.append(latency);
    }
    if (footer.children.length) body.append(footer);
    shot.append(avatar);
    anchor.append(shot, body);
    card.append(anchor);
    return card;
  };

  const renderGroups = (data, latencyMap) => {
    groups.replaceChildren();
    let total = 0;
    data.forEach((group, index) => {
      const section = create('section', 'links-group');
      section.style.setProperty('--links-group-index', index);
      const heading = create('div', 'links-group__heading');
      const title = create('h2', 'links-group__title', group.class_name || '友链');
      const description = create('p', 'links-group__description', group.class_desc);
      const count = create('span', 'links-group__count', `${group.link_list.length} 个站点`);
      heading.append(title);
      if (group.class_desc) heading.append(description);
      heading.append(count);
      const grid = create('div', 'links-group__grid');
      group.link_list.forEach(item => {
        total += 1;
        grid.append(renderCard(item, latencyMap));
      });
      section.append(heading, grid);
      groups.append(section);
    });
    return total;
  };

  const setToolbar = (visible, textValue = '') => {
    toolbar.hidden = !visible;
    setText(message, textValue);
  };

  const load = async () => {
    if (loading) return;
    loading = true;
    setToolbar(false);
    status.hidden = false;
    setText(status, '正在翻开友链这一页……');
    groups.replaceChildren();
    summary.replaceChildren();
    try {
      const results = await Promise.allSettled([
        fetch(text(linksConfig.data_url), { cache: 'no-store' }).then(response => {
          if (!response.ok) throw new Error(`links.yml ${response.status}`);
          return response.text();
        }),
        fetch(text(linksConfig.latency_url), { cache: 'no-store' }).then(response => {
          if (!response.ok) throw new Error(`link.json ${response.status}`);
          return response.json();
        }),
      ]);
      if (results[0].status === 'rejected') throw results[0].reason;
      const parsedGroups = parseLinksYaml(results[0].value);
      let latencyMap = new Map();
      let latencyData = null;
      let latencyUnavailable = false;
      if (results[1].status === 'fulfilled') {
        try {
          latencyData = results[1].value;
          latencyMap = getLatencyMap(latencyData);
        } catch (_) {
          latencyUnavailable = true;
        }
      } else latencyUnavailable = true;

      const total = renderGroups(parsedGroups, latencyMap);
      const checkedAt = latencyData?.statistical_data?.link_last_checked_time;
      summary.textContent = `共 ${total} 个站点${checkedAt ? ` · 最近检测于 ${checkedAt}` : ''}`;
      status.hidden = true;
      if (latencyUnavailable) setToolbar(true, '检测数据暂不可用，当前仅展示友链信息。');
    } catch (_) {
      groups.replaceChildren();
      summary.replaceChildren();
      setText(status, '友链暂时无法加载，请稍后重试。');
      setToolbar(true, '远程友链数据加载失败。');
    } finally {
      loading = false;
    }
  };

  retry.addEventListener('click', load);
  load();
})();
