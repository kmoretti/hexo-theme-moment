window.paperMomentsPage?.registerModule('site-intro', () => {
  'use strict';

  // 友链页「本站信息」代码块：JSON/YAML 切换 + 一键复制
  const root = document.querySelector('[data-site-intro-code]');
  if (!root) return;

  const CHECK_HREF = '/icons.svg#paper-moments-icon-lucide-check';

  const tabs = root.querySelector('[data-site-code-tabs]');
  const copyBtn = root.querySelector('[data-site-code-copy]');
  const copyLabel = copyBtn ? copyBtn.querySelector('[data-site-code-copy-label]') : null;
  const copyIconUse = copyBtn ? copyBtn.querySelector('use') : null;
  const copyHref = copyIconUse ? copyIconUse.getAttribute('href') : '';
  const contents = {};
  root.querySelectorAll('[data-site-code-content]').forEach(el => {
    contents[el.getAttribute('data-site-code-content')] = el;
  });

  function getActiveFormat() {
    if (tabs) {
      const active = tabs.querySelector('[aria-selected="true"]');
      if (active) return active.getAttribute('data-site-code-format');
    }
    return 'json';
  }

  function resetCopyState() {
    if (!copyBtn) return;
    copyBtn.classList.remove('is-copied');
    if (copyLabel) copyLabel.textContent = '复制';
    if (copyIconUse) copyIconUse.setAttribute('href', copyHref);
  }

  // Tab 切换
  if (tabs) {
    tabs.addEventListener('click', e => {
      const btn = e.target.closest('[data-site-code-format]');
      if (!btn) return;
      const format = btn.getAttribute('data-site-code-format');
      tabs.querySelectorAll('[data-site-code-format]').forEach(t => {
        t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
      });
      Object.keys(contents).forEach(key => {
        contents[key].hidden = format !== key;
      });
      resetCopyState();
    });
  }

  // 一键复制
  if (copyBtn) {
    let copyTimer = null;

    function flashCopied() {
      if (copyTimer) window.clearTimeout(copyTimer);
      copyBtn.classList.add('is-copied');
      if (copyLabel) copyLabel.textContent = '已复制';
      if (copyIconUse) copyIconUse.setAttribute('href', CHECK_HREF);
      copyTimer = window.setTimeout(() => {
        copyBtn.classList.remove('is-copied');
        if (copyLabel) copyLabel.textContent = '复制';
        if (copyIconUse) copyIconUse.setAttribute('href', copyHref);
        copyTimer = null;
      }, 2500);
    }

    function fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (_) { /* ignore */ }
      document.body.removeChild(ta);
      if (ok) flashCopied();
    }

    copyBtn.addEventListener('click', () => {
      const code = contents[getActiveFormat()];
      if (!code) return;
      const text = code.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(flashCopied)
          .catch(() => fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
    });
  }
});