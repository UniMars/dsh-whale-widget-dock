/**
 * dsh-whale-widget-dock —— 宿主侧（Cordis 插件）
 *
 * 职责只有一件事：把浏览器脚本注入 DSH Web 外壳。
 *
 * 注入通道复用 `dsh-whale-widget` 在桌面端验证过的那条：
 * `webserver/index-inject` 推一条 `{ kind: 'script', placement: 'body', text }`
 * 结构化行，由页面侧解释器以 `createElement('script') + textContent` 执行。
 * 用内联文本而不是 `script-src`：桌面壳的表在宿主启动时收集一次、没有刷新路径，
 * 一旦路由 404 就会 reject 掉 `__DSH_BOOT_READY__`（whale 的 issue #154）。
 *
 * 本插件不依赖任何服务，`apply()` 立即注册注入行，避免对象级 `inject`
 * 把注册推迟到宿主收集完注入表之后（whale 的 #152/#153 竞态）。
 */
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const SCRIPT_URL = new URL('../assets/client.js', import.meta.url)
const MARKER = 'dsh-whale-widget-dock'

/** 读一次脚本内容；按 mtime 缓存，方便本地开发时改完刷新页面即生效。 */
let cache = { text: '', mtimeMs: -1 }
function readScript() {
  const file = fileURLToPath(SCRIPT_URL)
  try {
    const stat = fs.statSync(file)
    if (cache.text && cache.mtimeMs === stat.mtimeMs) return cache.text
    const text = fs.readFileSync(file, 'utf8')
    cache = { text, mtimeMs: stat.mtimeMs }
    return text
  } catch {
    return ''
  }
}

function isOurRow(row) {
  if (!row || typeof row !== 'object') return false
  if (row.kind === 'script' && typeof row.text === 'string') return row.text.includes(MARKER)
  if (typeof row.src === 'string') return row.src.includes(MARKER)
  return false
}

export default {
  name: 'whale-widget-dock',
  apply(root) {
    const disposers = []
    root.effect(() => () => {
      for (const dispose of disposers) {
        try { dispose() } catch { /* 卸载时忽略 */ }
      }
    })

    const dispose = root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        if (table.some(isOurRow)) return
        const text = readScript()
        if (!text) {
          root.logger?.warn?.('[whale-widget-dock] assets/client.js 缺失，跳过程序注入')
          return
        }
        table.push({ kind: 'script', placement: 'body', text: `/*${MARKER}*/\n${text}` })
      } catch (error) {
        try { root.logger?.warn?.('[whale-widget-dock] 注入失败：' + (error && error.message)) } catch { /* ignore */ }
      }
    })
    disposers.push(dispose)
  },
}
