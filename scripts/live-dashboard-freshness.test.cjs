const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const themeRoot = path.resolve(__dirname, '..')
const siteRoot = path.resolve(themeRoot, '..', '..')
const livePanel = fs.readFileSync(path.join(themeRoot, 'source/js/live-panel.js'), 'utf8')
const swppConfig = fs.readFileSync(path.join(siteRoot, 'swpp.config.ts'), 'utf8')

assert.match(
  livePanel,
  /window\.fetch\(`\$\{apiBase\}\/current`,\s*\{[\s\S]*?cache:\s*'no-store'/,
  'Live Dashboard 的 current 请求必须显式绕过浏览器与 Service Worker 缓存'
)

assert.match(
  livePanel,
  /catch(?: \(\w+\))? \{[\s\S]*?showFallback\(\);[\s\S]*?scheduleRefresh\(\);/,
  'Live Dashboard 的请求失败后必须继续调度下一次刷新，以从临时断连中自动恢复'
)

assert.doesNotMatch(
  swppConfig,
  /host === 'live\.081531\.xyz' && \^\\\/api\\\/\(current\|config\)\$\/.test\(pathname\)\)\s*\{\s*return 60000/,
  'SWPP 不得为 Live Dashboard 的 current 接口设置缓存 TTL'
)

assert.match(
  swppConfig,
  /host === 'live\.081531\.xyz' && pathname === '\/api\/current'\) return false/,
  'SWPP 必须显式排除 Live Dashboard 的 current 接口'
)

assert.match(
  swppConfig,
  /host === 'live\.081531\.xyz' && pathname === '\/api\/config'\) return 60000/,
  'SWPP 可继续短时缓存不随状态变化的 config 接口'
)

const legacyWorkerPath = path.join(siteRoot, 'source/service-worker.js')
assert.ok(
  fs.existsSync(legacyWorkerPath),
  '必须保留旧 service-worker.js 的迁移 Worker，以清理旧 Workbox 缓存'
)

const legacyWorker = fs.readFileSync(legacyWorkerPath, 'utf8')
assert.match(legacyWorker, /self\.skipWaiting\(\)/, '迁移 Worker 必须立即激活')
assert.match(legacyWorker, /caches\.keys\(\)/, '迁移 Worker 必须清理遗留缓存')
assert.match(legacyWorker, /self\.registration\.unregister\(\)/, '迁移 Worker 必须注销旧注册')
assert.match(legacyWorker, /client\.navigate\(client\.url\)/, '迁移 Worker 必须刷新受控页面')
