'use strict';

// 本地 SVG 图标 registry：默认使用 Lucide；品牌标识兼容 Font Awesome Free 6。
// 只在生成时输出模板和配置实际引用的 symbol，运行时无需外部 CDN，PJAX/PWA 也可稳定使用。
const fs = require('fs');
const path = require('path');

const ICON_DIR = path.join(hexo.theme_dir, 'source', '_data', 'icons');
const SPRITE_PATH = 'icons.svg';
const PREFIXES = {
  lucide: 'lucide',
  fa: 'fa-solid',
  fas: 'fa-solid',
  solid: 'fa-solid',
  'fa-solid': 'fa-solid',
  far: 'fa-regular',
  regular: 'fa-regular',
  'fa-regular': 'fa-regular',
  fab: 'fa-brands',
  brands: 'fa-brands',
  'fa-brands': 'fa-brands'
};
const ALIASES = {
  home: 'house',
  note: 'file-text',
  book: 'book-open',
  close: 'x',
  email: 'mail'
};
const SOCIAL_ALIASES = {
  github: 'fa-brands:github',
  gitlab: 'fa-brands:gitlab',
  twitter: 'fa-brands:twitter',
  'x-twitter': 'fa-brands:x-twitter',
  x: 'fa-brands:x-twitter',
  telegram: 'fa-brands:telegram',
  instagram: 'fa-brands:instagram',
  facebook: 'fa-brands:facebook',
  youtube: 'fa-brands:youtube',
  bilibili: 'fa-brands:bilibili',
  steam: 'fa-brands:steam',
  weibo: 'fa-brands:weibo',
  discord: 'fa-brands:discord',
  mastodon: 'fa-brands:mastodon',
  email: 'mail',
  mail: 'mail',
  rss: 'rss'
};
const BUILTIN_ICONS = [
  'house', 'file-text', 'link', 'book-open', 'user', 'chevron-down', 'menu',
  'sun-moon', 'palette', 'rotate-ccw', 'arrow-up', 'arrow-right', 'x', 'chevron-left', 'chevron-right',
  'zap', 'external-link', 'circle', 'mail', 'rss', 'search', 'copy', 'check',
  'images', 'image', 'lock-keyhole', 'lock-keyhole-open', 'sticky-note', 'pause', 'play', 'radio', 'zoom-in',
  'skip-back', 'skip-forward', 'music-2', 'volume', 'volume-x', 'file-music'
];

let registries;

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(ICON_DIR, name), 'utf8'));
}

function getRegistries() {
  if (!registries) {
    registries = {
      lucide: loadJson('lucide.json'),
      'fa-solid': loadJson('fa-solid.json'),
      'fa-regular': loadJson('fa-regular.json'),
      'fa-brands': loadJson('fa-brands.json')
    };
  }
  return registries;
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9: -]/g, '');
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeClass(value) {
  return String(value || '').replace(/[^a-z0-9_ -]/gi, '').trim();
}

function safeSize(value) {
  return String(value || '1em').replace(/[^0-9a-z.%]/gi, '') || '1em';
}

function parseIcon(value) {
  const icons = getRegistries();
  const raw = normalize(value);
  if (!raw || /^https?:\/\//.test(raw) || raw.startsWith('data:')) return null;

  const prefixed = raw.match(/^([a-z-]+):([a-z0-9-]+)$/);
  if (prefixed) {
    const library = PREFIXES[prefixed[1]];
    const name = prefixed[2];
    return library && icons[library]?.[name] ? { library, name } : null;
  }

  const name = ALIASES[raw] || raw;
  if (icons.lucide[name]) return { library: 'lucide', name };
  if (icons['fa-brands'][name]) return { library: 'fa-brands', name };
  if (icons['fa-solid'][name]) return { library: 'fa-solid', name };
  if (icons['fa-regular'][name]) return { library: 'fa-regular', name };
  return null;
}

function iconKey(icon) {
  return `${icon.library}:${icon.name}`;
}

function symbolId(icon) {
  return `paper-moments-icon-${icon.library}-${icon.name}`;
}

function paintAttrs(icon) {
  return icon.library === 'lucide'
    ? 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
    : 'fill="currentColor"';
}

function viewBox(icon) {
  if (icon.library === 'lucide') return '0 0 24 24';
  return getRegistries()[icon.library][icon.name].viewBox;
}

function addIcon(value, target) {
  const icon = parseIcon(value);
  if (icon) target.set(iconKey(icon), icon);
}

function collectIcons(value, target) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(item => collectIcons(item, target));
    return;
  }
  Object.entries(value).forEach(([key, item]) => {
    if (key.toLowerCase() === 'icon') addIcon(item, target);
    collectIcons(item, target);
  });
}

function collectSocialIcons(socialLinks, target) {
  if (!Array.isArray(socialLinks)) return;
  socialLinks.forEach(link => {
    if (!link || typeof link !== 'object') return;
    const key = normalize(link.icon || link.name);
    addIcon(link.icon || SOCIAL_ALIASES[key] || 'external-link', target);
  });
}

function usedIcons() {
  const target = new Map();
  BUILTIN_ICONS.forEach(name => addIcon(name, target));
  const theme = hexo.theme.config || {};
  collectIcons(theme, target);
  collectSocialIcons(theme.social_links, target);
  return [...target.values()];
}

function renderSymbol(icon) {
  const data = getRegistries()[icon.library][icon.name];
  const body = icon.library === 'lucide' ? data : data.body;
  return `<symbol id="${escapeAttr(symbolId(icon))}" viewBox="${escapeAttr(viewBox(icon))}" ${paintAttrs(icon)}>${body}</symbol>`;
}

function renderSprite() {
  const symbols = usedIcons().map(renderSymbol).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${symbols}</defs></svg>`;
}

function renderIcon(value, options) {
  const opts = options || {};
  const fallback = parseIcon('circle');
  const icon = parseIcon(value) || fallback;
  const cls = safeClass(opts.cls);
  const classNames = [
    'pm-icon',
    `pm-icon--${icon.library}`,
    `pm-icon--${icon.name}`,
    cls
  ].filter(Boolean).join(' ');
  const root = this && typeof this.url_for === 'function' ? this.url_for('/') : '/';
  const sprite = `${root.replace(/\/$/, '/')}${SPRITE_PATH}`;
  return `<svg class="${escapeAttr(classNames)}" width="${escapeAttr(safeSize(opts.size))}" height="${escapeAttr(safeSize(opts.size))}" viewBox="${escapeAttr(viewBox(icon))}" ${paintAttrs(icon)} aria-hidden="true" focusable="false"><use href="${escapeAttr(sprite)}#${escapeAttr(symbolId(icon))}"></use></svg>`;
}

function renderSocialIcon(value, options) {
  const raw = normalize(value);
  return renderIcon.call(this, SOCIAL_ALIASES[raw] || value || 'external-link', options);
}

hexo.extend.helper.register('paper_moments_icon', renderIcon);
hexo.extend.helper.register('paper_moments_social_icon', renderSocialIcon);
hexo.extend.generator.register('paper_moments_icons', () => ({
  path: SPRITE_PATH,
  data: renderSprite()
}));
