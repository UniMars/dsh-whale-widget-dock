import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function fakeRoot() {
  const listeners = new Map()
  const disposers = []
  return {
    listeners,
    logger: { warn() {}, info() {} },
    on(event, handler) {
      listeners.set(event, handler)
      const dispose = () => listeners.delete(event)
      disposers.push(dispose)
      return dispose
    },
    effect(setup) {
      disposers.push(setup())
    },
  }
}

async function loadPlugin() {
  const module = await import(pathToFileURL(path.join(ROOT, 'lib', 'index.js')).href)
  return module.default
}

test('宿主插件：导出 name/apply，并在 index-inject 表里追加一条内联 script 行', async () => {
  const plugin = await loadPlugin()
  assert.equal(plugin.name, 'whale-widget-dock')
  assert.equal(typeof plugin.apply, 'function')

  const root = fakeRoot()
  plugin.apply(root)

  const handler = root.listeners.get('webserver/index-inject')
  assert.equal(typeof handler, 'function')

  const table = []
  handler(table)

  assert.equal(table.length, 1)
  assert.equal(table[0].kind, 'script')
  assert.equal(table[0].placement, 'body')
  assert.match(table[0].text, /dsh-whale-widget-dock/)
  assert.match(table[0].text, /__dshWhaleDock/)
})

test('宿主插件：重复调用不重复插入', async () => {
  const plugin = await loadPlugin()
  const root = fakeRoot()
  plugin.apply(root)
  const handler = root.listeners.get('webserver/index-inject')

  const table = []
  handler(table)
  handler(table)
  assert.equal(table.length, 1)
})

test('宿主插件：表不是数组时安静跳过', async () => {
  const plugin = await loadPlugin()
  const root = fakeRoot()
  plugin.apply(root)
  const handler = root.listeners.get('webserver/index-inject')
  assert.doesNotThrow(() => handler(undefined))
  assert.doesNotThrow(() => handler(null))
})

test('打出来的脚本本身语法可解析', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'assets', 'client.js'), 'utf8')
  assert.doesNotThrow(() => new Function(source)) // eslint-disable-line no-new-func
})
