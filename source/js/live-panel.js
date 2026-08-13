window.paperMomentsPage?.registerModule('live-panel', () => {
  'use strict';

  // 首页 Live Dashboard 面板：通过 live-dashboard 公开接口拉取数据并渲染为本站风格组件。
  const panel = document.querySelector('[data-live-panel]');
  if (!panel) return;

  const loadingEl = panel.querySelector('[data-live-loading]');
  const contentEl = panel.querySelector('[data-live-content]');
  const devicesEl = panel.querySelector('[data-live-devices]');
  const activitiesListEl = panel.querySelector('[data-live-activities-list]');
  const viewersEl = panel.querySelector('[data-live-viewers]');
  const fallbackEl = panel.querySelector('[data-live-fallback]');
  const retryBtn = panel.querySelector('[data-live-retry]');

  const cfg = (window.paperMomentsConfig && window.paperMomentsConfig.live_dashboard) || {};
  const TIMEOUT_MS = 8000;
  const REFRESH_MS = Math.max(5000, Number(cfg.refresh_interval) || 10000);
  const MAX_ACTIVITIES = Math.max(0, Number(cfg.max_activities) || 5);
  const SHOW_ACTIVITIES = cfg.show_activities !== false && activitiesListEl;
  const SHOW_VIEWERS = cfg.show_viewers !== false && viewersEl;

  const pageUrl = cfg.url || '';
  const apiBase = (cfg.api_base || (pageUrl ? pageUrl.replace(/\/$/, '') + '/api' : '')).replace(/\/$/, '');

  let abortCtrl = null;
  let refreshTimer = null;
  let isDestroyed = false;

  const PLATFORM_ICONS = {
    windows: 'monitor',
    macos: 'laptop',
    android: 'smartphone',
    linux: 'terminal',
  };

  function destroy() {
    isDestroyed = true;
    clearRefresh();
    if (abortCtrl) {
      abortCtrl.abort();
      abortCtrl = null;
    }
  }

  function clearRefresh() {
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function setVisible(state) {
    if (loadingEl) loadingEl.hidden = state !== 'loading';
    if (contentEl) contentEl.hidden = state !== 'content';
    if (fallbackEl) fallbackEl.hidden = state !== 'fallback';
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function formatRelativeTime(iso) {
    if (!iso) return '';
    // live-dashboard 的 created_at 为无时区本地格式（如 2026-08-12 02:41:11），
    // 服务器实际按 UTC 生成；统一加 Z 避免被浏览器解析为本地时间而偏差 8 小时。
    const normalized = /Z|[+-]\d{2}:?\d{2}$/.test(String(iso)) ? iso : String(iso).replace(' ', 'T') + 'Z';
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '';
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 10) return '刚刚';
    if (diff < 60) return `${diff} 秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    return `${Math.floor(diff / 86400)} 天前`;
  }

  function renderBattery(extra) {
    if (!extra || typeof extra.battery_percent !== 'number') return '';
    const pct = extra.battery_percent;
    const charging = extra.battery_charging;
    return `<span class="live-panel__device__battery ${charging ? 'is-charging' : ''}" title="电量 ${pct}%${charging ? ' · 充电中' : ''}">
      <span class="live-panel__device__battery__icon" aria-hidden="true"></span>
      <span>${pct}%</span>
    </span>`;
  }

  function renderDevice(device) {
    const platform = String(device.platform || '').toLowerCase();
    const iconName = PLATFORM_ICONS[platform] || 'cpu';
    const online = device.is_online === 1;
    const statusText = device.status_text || (online ? '在线' : '离线');
    const displayTitle = device.display_title ? `「${device.display_title}」` : '';
    const appName = device.app_name || device.app_id || '';
    const battery = renderBattery(device.extra);
    const timeAgo = formatRelativeTime(device.last_seen_at);

    return `<article class="live-panel__device ${online ? 'is-online' : 'is-offline'}" data-device-id="${escapeHtml(device.device_id)}">
      <div class="live-panel__device__head">
        <span class="live-panel__device__platform" aria-hidden="true">
          <svg class="pm-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            ${iconSvgPath(iconName)}
          </svg>
        </span>
        <h3 class="live-panel__device__name">${escapeHtml(device.device_name || device.device_id)}</h3>
        <span class="live-panel__device__status" data-status>${escapeHtml(statusText)}</span>
        ${battery}
      </div>
      <p class="live-panel__device__detail">
        ${escapeHtml(appName)}${displayTitle ? `<span class="live-panel__device__title">${escapeHtml(displayTitle)}</span>` : ''}
      </p>
      <p class="live-panel__device__time">${timeAgo ? `更新于 ${escapeHtml(timeAgo)}` : ''}</p>
    </article>`;
  }

  function iconSvgPath(name) {
    const paths = {
      monitor: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
      laptop: '<path d="M4 4h16v10H4z"/><path d="M2 18h20v2H2z"/>',
      smartphone: '<rect x="6" y="2" width="12" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
      terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
      cpu: '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
    };
    return paths[name] || paths.cpu;
  }

  function renderActivity(activity) {
    const name = activity.device_name || activity.device_id || '设备';
    const text = activity.status_text || activity.app_name || '正在活动';
    const title = activity.display_title ? ` · ${activity.display_title}` : '';
    const time = formatRelativeTime(activity.created_at || activity.started_at);
    return `<li class="live-panel__activity">
      <span class="live-panel__activity__dot" aria-hidden="true"></span>
      <span class="live-panel__activity__text">
        <strong>${escapeHtml(name)}</strong> ${escapeHtml(text)}${escapeHtml(title)}
      </span>
      <time class="live-panel__activity__time" datetime="${escapeHtml(activity.created_at || activity.started_at || '')}">${escapeHtml(time)}</time>
    </li>`;
  }

  function render(data) {
    if (!data || !Array.isArray(data.devices)) {
      showFallback();
      return;
    }

    if (devicesEl) {
      const onlineFirst = data.devices.slice().sort((a, b) => (b.is_online === 1 ? 1 : 0) - (a.is_online === 1 ? 1 : 0));
      devicesEl.innerHTML = onlineFirst.length
        ? onlineFirst.map(renderDevice).join('')
        : '<p class="live-panel__empty">暂无设备在线。</p>';
    }

    if (SHOW_ACTIVITIES && data.recent_activities && data.recent_activities.length) {
      const activities = data.recent_activities.slice(0, MAX_ACTIVITIES);
      activitiesListEl.innerHTML = activities.map(renderActivity).join('');
      activitiesListEl.parentElement.hidden = false;
    } else if (SHOW_ACTIVITIES) {
      activitiesListEl.innerHTML = '';
      activitiesListEl.parentElement.hidden = true;
    }

    if (SHOW_VIEWERS) {
      const count = Number(data.viewer_count) || 0;
      viewersEl.textContent = count > 0 ? `${count} 人正在围观` : '暂无访客';
    }

    setVisible('content');
  }

  function showFallback() {
    clearRefresh();
    setVisible('fallback');
  }

  async function fetchCurrent() {
    if (isDestroyed || !apiBase) return;
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();

    const timeoutId = window.setTimeout(() => abortCtrl && abortCtrl.abort(), TIMEOUT_MS);
    try {
      const res = await window.fetch(`${apiBase}/current`, {
        method: 'GET',
        signal: abortCtrl.signal,
        headers: { Accept: 'application/json' },
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      window.clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (isDestroyed) return;
      render(data);
      scheduleRefresh();
    } catch (err) {
      window.clearTimeout(timeoutId);
      if (isDestroyed || err && err.name === 'AbortError') return;
      showFallback();
    }
  }

  function scheduleRefresh() {
    clearRefresh();
    if (isDestroyed) return;
    refreshTimer = window.setTimeout(fetchCurrent, REFRESH_MS);
  }

  function init() {
    if (!apiBase) {
      showFallback();
      return;
    }
    setVisible('loading');
    fetchCurrent();
  }

  if (retryBtn) retryBtn.addEventListener('click', () => {
    setVisible('loading');
    fetchCurrent();
  });

  init();

  window.paperMomentsPage?.registerCleanup(destroy);
});
