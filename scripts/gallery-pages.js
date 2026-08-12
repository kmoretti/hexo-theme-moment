'use strict';

// 将 theme.gallery.albums 的集中 YAML 配置生成为独立、可分享的相册页。
// 相册媒体仍由页面模板渲染；此 generator 只负责路由与最小数据校验。
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const REMOTE_URL = /^https:\/\/[^\s<>]+$/i;
const LOCAL_URL = /^\/?(?:[a-z0-9][a-z0-9._/-]*)$/i;
const MEDIA_TYPES = new Set(['image', 'video']);

function text(value, fallback = '') {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function normalizeMedia(item, index) {
  if (!item || typeof item !== 'object') return null;
  const url = text(item.url);
  if (!url || (!REMOTE_URL.test(url) && !LOCAL_URL.test(url))) return null;
  const type = MEDIA_TYPES.has(item.type) ? item.type : (/\.(?:mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(url) ? 'video' : 'image');
  const poster = text(item.poster);
  const safePoster = poster && (REMOTE_URL.test(poster) || LOCAL_URL.test(poster)) ? poster : '';
  return {
    index,
    url,
    type,
    poster: safePoster,
    alt: text(item.alt, type === 'video' ? '相册视频' : '相册照片'),
    date: text(item.date),
    caption: text(item.caption),
  };
}

function normalizeAttribution(value) {
  if (!value || typeof value !== 'object') return null;
  const url = text(value.url);
  if (!REMOTE_URL.test(url)) return null;
  return {
    name: text(value.name, '样例媒体来源'),
    url,
    notice: text(value.notice),
  };
}

function normalizeAlbum(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const slug = text(raw.slug).toLowerCase();
  if (!SAFE_SLUG.test(slug)) return null;
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map(normalizeMedia)
    .filter(Boolean);
  const cover = text(raw.cover);
  const safeCover = cover && (REMOTE_URL.test(cover) || LOCAL_URL.test(cover)) ? cover : (items[0]?.poster || items[0]?.url || '');
  const access = raw.access === 'password' ? 'password' : 'public';
  return {
    slug,
    title: text(raw.title, slug),
    description: text(raw.description),
    date: text(raw.date),
    cover: safeCover,
    access,
    password_hash: access === 'password' && /^[a-f0-9]{64}$/i.test(text(raw.password_hash)) ? text(raw.password_hash).toLowerCase() : '',
    source_attribution: normalizeAttribution(raw.source_attribution),
    items,
  };
}

hexo.extend.generator.register('paper_moments_gallery_pages', () => {
  const gallery = hexo.theme.config?.gallery || {};
  const seen = new Set();
  const albums = (Array.isArray(gallery.albums) ? gallery.albums : [])
    .map(normalizeAlbum)
    .filter(album => {
      if (!album || seen.has(album.slug)) return false;
      seen.add(album.slug);
      return true;
    });

  return albums.map(album => ({
    path: `gallery/${album.slug}/index.html`,
    layout: 'gallery',
    data: {
      title: album.title,
      description: album.description || gallery.description || '把值得留下的画面，贴进这一页。',
      comments: false,
      page_type: 'gallery-album',
      gallery_album: album,
    },
  }));
});
