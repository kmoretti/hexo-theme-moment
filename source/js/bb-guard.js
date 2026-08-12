(() => {
  const originalFetch = window.fetch.bind(window);
  const allowedLinkProtocols = new Set(['http:', 'https:', 'mailto:']);
  const allowedImageProtocols = new Set(['http:', 'https:']);
  const allowedTags = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'I', 'LI', 'OL', 'P', 'PRE', 'S', 'SMALL', 'SPAN', 'STRONG', 'U', 'UL']);
  const allowedAttributes = new Set(['class', 'href', 'rel', 'target', 'title', 'aria-label']);

  const safeUrl = (value, protocols) => {
    if (!value) return '';
    try {
      const url = new URL(String(value), document.baseURI);
      return protocols.has(url.protocol) ? url.href : '';
    } catch (error) {
      return '';
    }
  };

  const sanitizeHtml = html => {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    template.content.querySelectorAll('script, style, iframe, object, embed, form, input, button, textarea, select, svg, math').forEach(element => element.remove());
    template.content.querySelectorAll('*').forEach(element => {
      if (!allowedTags.has(element.tagName)) {
        element.replaceWith(...element.childNodes);
        return;
      }
      [...element.attributes].forEach(attribute => {
        if (!allowedAttributes.has(attribute.name.toLowerCase()) || /^on/i.test(attribute.name)) {
          element.removeAttribute(attribute.name);
        }
      });
      if (element.hasAttribute('href')) {
        const href = safeUrl(element.getAttribute('href'), allowedLinkProtocols);
        if (href) {
          element.setAttribute('href', href);
          if (href.startsWith('http:') || href.startsWith('https:')) {
            element.setAttribute('target', '_blank');
            element.setAttribute('rel', 'noopener noreferrer');
          }
        } else element.removeAttribute('href');
      }
    });
    return template.innerHTML;
  };

  const sanitizePost = post => ({
    ...post,
    html: sanitizeHtml(post.html),
    media: Array.isArray(post.media)
      ? post.media.map(item => ({ ...item, src: safeUrl(item.src, allowedImageProtocols) })).filter(item => item.src)
      : [],
    attachments: Array.isArray(post.attachments)
      ? post.attachments.map(item => ({ ...item, url: safeUrl(item.url, allowedLinkProtocols) })).filter(item => item.url)
      : [],
    source: post.source ? { ...post.source, telegramUrl: safeUrl(post.source.telegramUrl, allowedLinkProtocols) } : post.source,
  });

  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    let requestUrl;
    try { requestUrl = new URL(typeof input === 'string' ? input : input.url, document.baseURI); } catch (error) { return response; }
    if (!requestUrl.pathname.endsWith('/api/posts')) return response;
    try {
      const data = await response.clone().json();
      const safeData = { ...data, posts: Array.isArray(data.posts) ? data.posts.map(sanitizePost) : [] };
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json');
      return new Response(JSON.stringify(safeData), { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      return response;
    }
  };
})();
