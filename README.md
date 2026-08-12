# Paper Moments — 纸张手账风 Hexo 主题

一张纸，一点时间，和一些没有被忘记的事。

Paper Moments 是一个以**纸张手账**为视觉内核的中文 Hexo 主题：揉皱的纸纹、错落的贴纸、歪斜的胶带、手写感标题，把博客做成一本慢慢变厚的私人手账。它围绕 **Telegram 消息流（说说 / microblog）** 设计，配合自研的"便携嵌入"组件，可以让静态博客在浏览器端实时渲染 Telegram 频道的动态，无需每次更新都重新构建。

> 本主题是 `tg-pyq`（纸间日常 / Paper Moments 站点）的自研主题，最初为个人站点定制，代码与配置已尽量参数化，方便他人复用。

---

## ✨ 特性一览

- **纸张手账视觉**：纸张纹理、胶带、贴纸、拍立得相框、手写体标题，全站 CSS 变量驱动，支持明暗模式与强调色（HSL 色相可调）。
- **说说（Microblog）**：基于 `hexo-bb-channel` 插件，客户端模式在浏览器运行时拉取 Telegram 频道消息，无需重新构建即可更新内容。
- **友链 / 朋友圈**：友链页支持申请表单与公开申请记录；朋友圈聚合友邻文章（fcircle）。
- **相册**：集中式 YAML 配置，构建期自动生成为独立相册页；支持本地媒体或远程 HTTPS URL；可选密码门（仅 SHA-256 哈希，静态提示门）。
- **留言板**：信封开合动画 + 弹幕（Danmaku）评论流，配合 Twikoo 评论系统。
- **实时状态面板（Live Panel）**：首页可选展示 `live-dashboard` 的实时设备活动状态，10 秒轮询，失败自动降级。
- **音乐播放器**：左下角悬浮播放器，支持歌词、封面、上一首/下一首。
- **PJAX 无刷新导航**：MoOx/pjax，页面切换不刷新，导航高亮自动同步。
- **PWA 离线适配**：Service Worker 预缓存页面壳（CSS/JS/HTML），远程数据运行时请求。
- **零外部图标 CDN**：构建期 icon registry 只输出实际用到的 SVG symbol 到 `/icons.svg`（Lucide + Font Awesome Brands）。
- **全站中文（zh-CN）**：UI 文案与代码注释均为简体中文。

---

## 🚀 小白部署指南

以下步骤假设你从零开始，依次完成后即可拥有一个带"说说"的 Paper Moments 站点。

### 0. 准备环境

- 安装 [Node.js](https://nodejs.org/)（建议 LTS，18+）
- 安装 [pnpm](https://pnpm.io/installation)（本项目使用 `pnpm@10.30.3`，已写入 `packageManager` 字段）
- 安装 [Git](https://git-scm.com/)

### 1. 创建站点骨架

```bash
npm install hexo-cli -g
hexo init mysite
cd mysite
pnpm install
```

### 2. 安装主题

```bash
pnpm add hexo-bb-channel hexo-offline hexo-renderer-ejs hexo-renderer-marked hexo-server pjax cross-env
```

将本主题目录（`themes/paper-moments`）放入你的站点 `themes/` 下，然后在站点根目录 `_config.yml` 中启用：

```yaml
theme: paper-moments
```

同时把站点根目录 `_config.paper-moments.yml`（主题个性化配置）复制到你的站点根目录，按需修改。

### 3. 配置说说（Telegram 消息流）

说说由两部分组成：**API 后端** + **Hexo 插件**。

1. 先拥有一个**公开** Telegram 频道。频道链接形如 `https://t.me/my_notes`，记下用户名部分（不含 `@`，如 `my_notes`）。
2. 部署 `channel-api` 后端（见下方"联动仓库"），拿到 API 地址，例如 `https://your-channel-api.vercel.app`。
3. 在站点根目录 `_config.yml` 配置插件：

   ```yaml
   bb_channel:
     enable: true
     mode: client        # 浏览器运行时渲染，无需重新构建
     route: shuoshuo/    # 说说页路由
     title: 说说
     description: 把日常写下来，给未来的自己留一页便签。
     api_base: https://your-channel-api.vercel.app
     page_size: 20
   ```

4. 在 `_config.paper-moments.yml` 的 `navigation` 中把"说说"指向 `/shuoshuo/`。

### 4. 本地预览

```bash
pnpm start        # clean + generate + 本地服务 :4100
```

浏览器打开 `http://localhost:4100` 即可看到效果。常用命令：

| 命令 | 作用 |
| --- | --- |
| `pnpm start` | 清理 + 生成 + 启动本地服务（端口 4100） |
| `pnpm run check` | 仅生成 `public/` |
| `pnpm run build` | 清理 + 生成（部署用） |
| `pnpm run dev` | `hexo server --port 4100`（不清理） |

> 端口 4100 被占用时，先结束占用进程再启动。

### 5. 部署上线

`pnpm run build` 生成 `public/` 目录，上传到任意静态托管（GitHub Pages、Vercel、Netlify、Cloudflare Pages、自有 Nginx 等）。

**注意**：PWA（Service Worker / manifest / 弹幕）需要 **HTTPS** 或 localhost 环境；部署前把 `_config.yml` 的 `url` 改为真实 HTTPS 地址。

### 6. 可选：接入评论（Twikoo）

在站点根目录 `_config.yml` 配置：

```yaml
twikoo:
  env_id: https://your-twikoo-env.example.com/
  version: 1.7.15   # 必须是明确的三段版本号，禁用 latest
  lang: zh-CN
```

并在 `_config.paper-moments.yml` 的 `comments` / `comment_board` 中开启对应页面。

---

## 🔗 联动仓库

Paper Moments 的动力来自一组互相配合的开源项目，按"数据从哪来"拆解如下：

### [AweStudioX/hexo-bb-channel](https://github.com/AweStudioX/hexo-bb-channel)

**Hexo 说说渲染插件**。它在构建期生成一个静态的说说页面壳，浏览器运行时从 `channel-api` 拉取 Telegram 消息并渲染。更新 Telegram 频道无需重新构建博客。本主题的"说说"页即基于它，并对其默认 UI 做了纸张风格覆盖（`shuoshuo.js` + `style.css` 中 `.bb-channel-*` 区块）。

### [kmoretti/emaction.backend](https://github.com/kmoretti/emaction.backend)

**Emaction 表情回应后端**（fork 自 eallion 方案）。提供 `GET /reactions`（查询某目标收到的 reactions）与 `PATCH /reaction`（新增/更新计数）两个接口。本主题的说说/页面表情回应（`reactions.js`）即调用它，接口地址在 `reactions:` 配置块。

### [kmoretti/channel-api](https://github.com/kmoretti/channel-api)

**Telegram 频道 → JSON API 后端**（fork 自 AweStudioX/channel-api）。抓取公开 Telegram 频道页面，标准化为 JSON，缓存到 Upstash Redis，为静态博客提供 `/api/posts` 分页接口。支持 Vercel 一键部署与 Docker 部署。`bb_channel.api_base` 指向它。

### [Monika-Dream/live-dashboard](https://github.com/Monika-Dream/live-dashboard)

**实时设备活动仪表盘**。展示正在使用的应用（Windows / macOS / Linux / Android），带隐私分级。本主题首页的"正在做什么"实时面板（`live-panel.js`）通过它的公开接口拉取数据并渲染成本站纸张风格，配置见 `live_dashboard:` 块。

### 其他配套

- **Twikoo**（[imaegoo/twikoo](https://github.com/imaegoo/twikoo)）：评论区服务，版本必须为明确三段号。
- **[kmoretti/hexo-blog-source](https://github.com/kmoretti/hexo-blog-source)**：友链数据源（`links.data_url` 示例）。
- **jsDelivr / jsdmirror**：友链与音乐等远程资源的示例 CDN 源。

> 友情提示：以上接口地址均为示例，部署时请替换为你自己的实例或按需关闭对应功能。

---

## 📁 项目结构

```
themes/paper-moments/
├── _config.yml                  # 主题默认配置（站点级 _config.paper-moments.yml 覆盖）
├── package.json                 # 主题元信息（MIT）
├── layout/                      # EJS 模板
│   ├── layout.ejs               # 全局骨架：head / 主题注入 / PJAX 容器 / 音乐播放器
│   ├── index.ejs                # 首页：hero 手账卡 + Live Panel + 社交链接
│   ├── about.ejs                # 关于页：作者拍立得 + 心路历程 + 赞助贴纸墙
│   ├── gallery.ejs              # 相册页（由 scripts/gallery-pages.js 生成）
│   ├── links.ejs                # 友链页
│   ├── fcircle.ejs              # 朋友圈页
│   ├── comment.ejs              # 留言板页
│   ├── page.ejs                 # 通用页面
│   └── _partial/
│       ├── header.ejs           # 顶栏：品牌 + 导航（含下拉）+ 强调色/主题开关
│       ├── footer.ejs           # 页脚
│       └── twikoo.ejs           # Twikoo 评论注入
├── scripts/                     # 构建期生成器（Node）
│   ├── gallery-pages.js         # 由集中 YAML 配置生成独立相册页
│   └── icon-registry.js         # 图标注册表：只输出实际用到的 SVG symbol
├── source/
│   ├── css/
│   │   └── style.css            # 全部样式（按 /* xxx 页面 */ 区块组织）
│   ├── js/                      # 浏览器端脚本（按功能拆分）
│   │   ├── theme.js             # 主题/强调色/导航菜单/返回顶部
│   │   ├── pjax.js              # PJAX 控制器与导航高亮
│   │   ├── shuoshuo.js          # 说说卡片增强（作者/表情/按钮）
│   │   ├── reactions.js         # Emaction 表情回应
│   │   ├── live-panel.js        # 首页实时状态面板
│   │   ├── gallery.js           # 相册页交互
│   │   ├── media-lightbox.js    # 图片灯箱
│   │   ├── comments.js          # 评论渲染辅助
│   │   ├── comment-board.js     # 留言板信封/弹幕
│   │   ├── fcircle.js           # 朋友圈
│   │   ├── links.js             # 友链
│   │   ├── friendlink-form.js   # 友链申请表单
│   │   ├── friendlink-status.js # 友链申请状态
│   │   ├── about.js             # 关于页赞助贴纸墙
│   │   ├── music-player.js      # 音乐播放器
│   │   ├── site-intro.js        # 站点介绍卡
│   │   ├── bb-guard.js          # 说说流守卫（运行时数据兜底）
│   │   ├── icons.js             # 客户端动态图标 helper
│   │   └── vendor/pjax.min.js   # MoOx/pjax 本地托管
│   └── _data/
│       └── icons/               # 图标 JSON 定义（lucide / fa-solid / fa-regular / fa-brands）
└── README.md                    # 本文件
```

---

## ✅ 静态构建与运行时渲染

```
Hexo 构建（构建期）
  ├─ icon-registry.js → 输出 /icons.svg（仅实际用到的 symbol）
  ├─ gallery-pages.js → 生成相册页
  └─ hexo-bb-channel  → 生成说说页壳
  └─ hexo-offline     → 生成 Service Worker（预缓存页面壳）

浏览器运行时（运行时）
  ├─ hexo-bb-channel  → 从 channel-api 拉取 Telegram 说说
  ├─ emaction.backend → 表情回应计数
  ├─ live-dashboard   → 首页实时状态面板
  ├─ Twikoo           → 评论区
  └─ 友链/朋友圈/赞助  → 远程 JSON 数据
```

**要点**：说说、表情、实时面板、友链、朋友圈、赞助等数据**构建时不抓取**，全部浏览器运行时请求；评论浏览可走 Workbox 缓存，**发布评论必须联网**。

---

## 📜 许可

本主题 `paper-moments` 采用 [MIT](./package.json) 许可。内嵌图标资源版权归各上游项目（Lucide ISC；Font Awesome Free CC BY 4.0 / SIL OFL 1.1 / MIT），详见 `source/_data/icons/NOTICE.md`。