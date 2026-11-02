import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createDom, documentListeners, FakeObserver } from './fake-dom.mjs'

const SOURCE = fs.readFileSync(new URL('../assets/client.js', import.meta.url), 'utf8')

function boot(seed) {
  const dom = createDom()
  if (seed) for (const [key, value] of Object.entries(seed)) dom.localStorage.setItem(key, value)
  const context = vm.createContext({
    window: dom.window,
    document: dom.document,
    MutationObserver: dom.window.MutationObserver,
    ResizeObserver: dom.window.ResizeObserver,
    console,
  })
  vm.runInContext(SOURCE, context, { filename: 'client.js' })
  dom.flushRaf()
  return { dom, api: dom.window.__dshWhaleDock }
}

function anchoredLeft(dom) {
  return dom.pet.style.getPropertyValue('--dshwd-left')
}

test('chooseLeft：展开贴右栏左缘、折叠贴窗口右缘，gap 生效', () => {
  const { api } = boot()
  assert.equal(
    api.core.chooseLeft({ viewportWidth: 1600, petWidth: 200, panelLeft: 1180, gap: 0, edgeGap: 24 }),
    980,
  )
  assert.equal(
    api.core.chooseLeft({ viewportWidth: 1600, petWidth: 200, panelLeft: 1180, gap: 8, edgeGap: 24 }),
    972,
  )
  assert.equal(
    api.core.chooseLeft({ viewportWidth: 1600, petWidth: 200, panelLeft: null, gap: 0, edgeGap: 24 }),
    1376,
  )
  // 面板比桌宠还窄时不能出现负坐标
  assert.equal(
    api.core.chooseLeft({ viewportWidth: 1600, petWidth: 200, panelLeft: 40, gap: 0, edgeGap: 24 }),
    0,
  )
})

test('启动即生效：右栏展开时桌宠右缘贴右栏左缘', () => {
  const { dom, api } = boot()
  assert.equal(api.config.locked, true)
  assert.equal(dom.pet.classList.contains('dshwd-anchored'), true)
  assert.equal(anchoredLeft(dom), '980px')
})

test('同步把 widget 自己的吸附模型写成右侧吸附', () => {
  const { dom } = boot()
  const pos = JSON.parse(dom.store.get('dshw-pos'))
  assert.equal(pos.v, 2)
  assert.equal(pos.hAnchor, 'right')
  assert.equal(pos.hDist, 0)
  assert.equal(pos.vAnchor, 'bottom')
  assert.equal(typeof pos.vDist, 'number')
})

test('解锁归还控制权，重新上锁恢复吸附', () => {
  const { dom, api } = boot()
  api.locked(false)
  dom.flushRaf()
  assert.equal(dom.pet.classList.contains('dshwd-anchored'), false)
  assert.equal(anchoredLeft(dom), '')

  api.locked(true)
  dom.flushRaf()
  assert.equal(dom.pet.classList.contains('dshwd-anchored'), true)
  assert.equal(anchoredLeft(dom), '980px')
})

test('右栏折叠：默认贴死窗口右缘（edgeGap 0）', () => {
  const { dom, api } = boot()
  assert.equal(api.config.edgeGap, 0)
  dom.panel.removeAttribute('data-sidebar-right-open')
  api.refresh()
  dom.flushRaf()
  assert.equal(anchoredLeft(dom), '1400px')
})

test('折叠时 edgeGap 可自定义（含负值微调）', () => {
  const { dom, api } = boot()
  api.set({ edgeGap: 8 })
  dom.panel.removeAttribute('data-sidebar-right-open')
  api.refresh()
  dom.flushRaf()
  assert.equal(anchoredLeft(dom), '1392px')

  api.set({ edgeGap: -6 })
  api.refresh()
  dom.flushRaf()
  assert.equal(anchoredLeft(dom), '1406px')
})

test('旧插件名的 v1 配置迁移：沿用挂件的旧默认 24 变成 0，其余字段保留', () => {
  const { api } = boot({
    'dsh-pet-sidebar-anchor:v1': JSON.stringify({ locked: false, gap: 4, edgeGap: 24, writeWidgetPos: true }),
  })
  const config = api.config
  // 跨 vm 实域的返回值原型不同，逐字段断言而不是 deepEqual
  assert.equal(config.locked, false)
  assert.equal(config.gap, 4)
  assert.equal(config.edgeGap, 0)
  assert.equal(config.writeWidgetPos, true)
})

test('旧插件名的 v2 配置迁移：用户改过的 edgeGap 保留', () => {
  const { api } = boot({
    'dsh-pet-sidebar-anchor:v2': JSON.stringify({ locked: true, gap: 0, edgeGap: 8, writeWidgetPos: true }),
  })
  assert.equal(api.config.edgeGap, 8)
  assert.equal(api.config.locked, true)
})

test('改名前的 v1 里 24 之外的 edgeGap 也保留', () => {
  const { api } = boot({
    'dsh-pet-sidebar-anchor:v1': JSON.stringify({ locked: true, gap: 0, edgeGap: 3, writeWidgetPos: true }),
  })
  assert.equal(api.config.edgeGap, 3)
})

test('新键的配置原样读取，不做 edgeGap 重置', () => {
  const { api } = boot({
    'dsh-whale-widget-dock:v1': JSON.stringify({ locked: true, gap: 2, edgeGap: 24, writeWidgetPos: true }),
  })
  assert.equal(api.config.edgeGap, 24)
  assert.equal(api.config.gap, 2)
})

test('右栏展开且变宽：跟随新的左缘', () => {
  const { dom, api } = boot()
  dom.panel.setRect(1100, 500)
  api.refresh()
  dom.flushRaf()
  assert.equal(anchoredLeft(dom), '900px')
})

test('拖动右栏宽度（ResizeObserver）时持续跟随', () => {
  const { dom } = boot()
  const observer = FakeObserver.instances.find((item) => item.targets.includes(dom.panel))
  assert.ok(observer, '应当对右栏面板挂了 ResizeObserver')

  dom.panel.setRect(1150, 450)
  observer.trigger()
  dom.flushRaf()
  assert.equal(anchoredLeft(dom), '950px')
})

test('Ctrl+Alt+L 切换锁定', () => {
  const { dom, api } = boot()
  const handlers = documentListeners.get('keydown') || []
  assert.ok(handlers.length > 0, '应当注册了 keydown')

  const event = { ctrlKey: true, altKey: true, key: 'l', preventDefault() {}, stopPropagation() {} }
  for (const handler of handlers) handler(event)
  dom.flushRaf()
  assert.equal(api.config.locked, false)

  for (const handler of handlers) handler(event)
  dom.flushRaf()
  assert.equal(api.config.locked, true)
})

test('锁定时压掉 widget 的镜像翻转类', () => {
  const { dom, api } = boot()
  dom.pet.classList.add('dshwv-left')
  api.refresh()
  dom.flushRaf()
  assert.equal(dom.pet.classList.contains('dshwv-left'), false)
  assert.equal(dom.pet.classList.contains('dshwd-anchored'), true)
})

test('不再创建浮动锁按钮', () => {
  const { dom } = boot()
  assert.equal(dom.chips.length, 0)
})

test('开关出现在挂件主菜单里，紧跟在「吸附与翻转」之后', () => {
  const { dom, api } = boot()
  const rows = dom.menu.children
  const index = rows.findIndex((row) => row.getAttribute('data-dsh-whale-dock') === 'menu-row')
  assert.ok(index > 0, '菜单里应该有本插件的一行')
  assert.equal(rows[index - 1], dom.snapRow)
  assert.equal(rows[index + 1], dom.hideRow)

  const label = rows[index].children[0]
  assert.equal(label.textContent, '吸附到右栏')
  const checkbox = rows[index].children[1]
  assert.equal(checkbox.checked, true)
  assert.equal(api.config.locked, true)
})

test('菜单勾选可以解锁 / 重新锁定', () => {
  const { dom, api } = boot()
  const checkbox = dom.menu.querySelector('[data-dsh-whale-dock="menu-toggle"]')
  assert.ok(checkbox)

  checkbox.checked = false
  checkbox.dispatch('change')
  dom.flushRaf()
  assert.equal(api.config.locked, false)
  assert.equal(dom.pet.classList.contains('dshwd-anchored'), false)

  checkbox.checked = true
  checkbox.dispatch('change')
  dom.flushRaf()
  assert.equal(api.config.locked, true)
  assert.equal(dom.pet.classList.contains('dshwd-anchored'), true)
})

test('通过 API 切换时菜单勾选同步', () => {
  const { dom, api } = boot()
  const checkbox = dom.menu.querySelector('[data-dsh-whale-dock="menu-toggle"]')
  api.locked(false)
  dom.flushRaf()
  assert.equal(checkbox.checked, false)
})

test('菜单被重建后开关行会补回去', () => {
  const { dom, api } = boot()
  const first = dom.menu.children.find((row) => row.getAttribute('data-dsh-whale-dock') === 'menu-row')
  dom.menu.removeChild(first)
  api.refresh()
  dom.flushRaf()
  const again = dom.menu.children.find((row) => row.getAttribute('data-dsh-whale-dock') === 'menu-row')
  assert.ok(again, '刷新后应重新插入')
  assert.equal(again, first)
})

test('找到不到桌宠时安静退出，不抛异常', () => {
  const { dom, api } = boot()
  dom.window.__dshWhaleRoot = null
  dom.panels.length = 0
  assert.doesNotThrow(() => api.refresh())
})
