/**
 * 极简假 DOM：只实现 dsh-whale-widget-dock/client.js 用到的那些接口。
 * 目的是在没有 Electron / 浏览器的环境里验证锚定数学、锁定/解锁、面板切换。
 */

class FakeStyle {
  constructor() { this.props = new Map() }
  setProperty(name, value) { this.props.set(name, String(value)) }
  getPropertyValue(name) { return this.props.get(name) || '' }
  removeProperty(name) { this.props.delete(name) }
  set left(value) { this.props.set('left', value) }
  get left() { return this.props.get('left') || '' }
  set top(value) { this.props.set('top', value) }
  get top() { return this.props.get('top') || '' }
}

class FakeClassList {
  constructor() { this.items = new Set() }
  add(...names) { for (const name of names) if (name) this.items.add(name) }
  remove(...names) { for (const name of names) this.items.delete(name) }
  contains(name) { return this.items.has(name) }
  toggle(name, force) {
    const next = force === undefined ? !this.contains(name) : !!force
    if (next) this.add(name); else this.remove(name)
    return next
  }
}

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase()
    this.style = new FakeStyle()
    this.classList = new FakeClassList()
    this.attrs = new Map()
    this.children = []
    this.parent = null
    this.mounted = false
    this.listeners = new Map()
    this.rect = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }
    this.innerHTML = ''
    this.textContent = ''
    this.title = ''
    this.id = ''
  }

  get isConnected() { return this.mounted }

  get nextSibling() {
    if (!this.parent) return null
    const index = this.parent.children.indexOf(this)
    return index >= 0 && index + 1 < this.parent.children.length ? this.parent.children[index + 1] : null
  }

  appendChild(child) {
    this.children.push(child)
    child.parent = this
    child.mounted = true
    return child
  }

  removeChild(child) {
    this.children = this.children.filter((item) => item !== child)
    child.parent = null
    child.mounted = false
    return child
  }

  insertBefore(child, ref) {
    const index = this.children.indexOf(ref)
    if (index === -1) this.children.push(child)
    else this.children.splice(index, 0, child)
    child.parent = this
    child.mounted = true
    return child
  }

  setAttribute(name, value) { this.attrs.set(name, String(value)) }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null }
  hasAttribute(name) { return this.attrs.has(name) }
  removeAttribute(name) { this.attrs.delete(name) }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type).push(fn)
  }

  dispatch(type, event = {}) {
    for (const fn of this.listeners.get(type) || []) fn({ type, target: this, relatedTarget: null, ...event })
  }

  contains(node) {
    let current = node
    while (current) {
      if (current === this) return true
      current = current.parent
    }
    return false
  }

  matches() { return false }
  querySelector(selector) {
    const match = /^\[([a-z-]+)="([^"]*)"\]$/.exec(selector)
    if (!match) return null
    const stack = [...this.children]
    while (stack.length) {
      const node = stack.shift()
      if (node.attrs.get(match[1]) === match[2]) return node
      stack.push(...node.children)
    }
    return null
  }
  querySelectorAll() { return [] }

  getBoundingClientRect() { return { ...this.rect } }
  get offsetWidth() { return this.rect.width }
  get offsetHeight() { return this.rect.height }

  setRect(left, width, top = 0, height = 100) {
    this.rect = { left, top, width, height, right: left + width, bottom: top + height }
  }
}

class FakeObserver {
  constructor(callback) {
    this.callback = callback
    this.targets = []
    FakeObserver.instances.push(this)
  }
  observe(target) { this.targets.push(target) }
  disconnect() { this.targets = [] }
  trigger(...args) { this.callback(...args) }
}
FakeObserver.instances = []

export const root = {}
export const documentListeners = new Map()

export function createDom() {
  const pet = new FakeElement('div')
  pet.classList.add('dshwv-root')
  pet.setRect(1360, 200, 100, 200)

  const panel = new FakeElement('div')
  panel.setAttribute('data-sidebar-right-panel', 'push')
  panel.setAttribute('data-sidebar-right-open', 'true')
  panel.setRect(1180, 420, 0, 800)

  /* 挂件主菜单：一行「吸附与翻转」，后面再跟一行，用来验证插入位置。 */
  const menu = new FakeElement('div')
  menu.classList.add('dshwv-menu')
  const snapRow = new FakeElement('div')
  snapRow.classList.add('dshwv-menu-row')
  snapRow.textContent = '吸附与翻转'
  const hideRow = new FakeElement('div')
  hideRow.classList.add('dshwv-menu-row')
  hideRow.textContent = '隐藏菜单按钮'
  menu.appendChild(snapRow)
  menu.appendChild(hideRow)

  const dom = {
    pet,
    panel,
    panels: [panel],
    menu,
    snapRow,
    hideRow,
    centerColumn: null,
    styleTags: [],
    chips: [],
    documentElement: new FakeElement('html'),
    head: new FakeElement('head'),
    body: new FakeElement('body'),
  }
  dom.documentElement.appendChild(dom.head)
  dom.documentElement.appendChild(dom.body)
  dom.body.appendChild(pet)
  dom.body.appendChild(panel)
  dom.body.appendChild(menu)

  const document = {
    readyState: 'complete',
    documentElement: dom.documentElement,
    head: dom.head,
    body: dom.body,
    createElement(tag) {
      const node = new FakeElement(tag)
      node.mounted = false
      if (String(tag).toLowerCase() === 'style') dom.styleTags.push(node)
      if (String(tag).toLowerCase() === 'button') dom.chips.push(node)
      return node
    },
    querySelector(selector) {
      if (selector === '.dshwv-root') return dom.pet
      if (selector === '.dshwv-menu') return dom.menu
      if (selector === '[data-dsh-center-col]') return dom.centerColumn
      return null
    },
    querySelectorAll(selector) {
      if (selector === '[data-sidebar-right-panel]') return dom.panels
      if (selector === '.dshwv-menu') return [dom.menu]
      return []
    },
    addEventListener(type, fn) {
      if (!documentListeners.has(type)) documentListeners.set(type, [])
      documentListeners.get(type).push(fn)
    },
  }
  dom.document = document

  const store = new Map()
  const rafQueue = []
  const localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null },
    setItem(key, value) { store.set(key, String(value)) },
    removeItem(key) { store.delete(key) },
  }

  const window = {
    innerWidth: 1600,
    innerHeight: 900,
    devicePixelRatio: 1,
    localStorage,
    document,
    __dshWhaleRoot: pet,
    addEventListener() {},
    setInterval() { return 1 },
    setTimeout(fn) { fn(); return 1 },
    clearTimeout() {},
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length },
    cancelAnimationFrame() {},
    MutationObserver: FakeObserver,
    ResizeObserver: FakeObserver,
    visualViewport: null,
    getComputedStyle() { return { transform: 'none' } },
  }
  window.window = window

  const flushRaf = () => {
    let guard = 0
    while (rafQueue.length && guard < 100) {
      guard += 1
      const fn = rafQueue.shift()
      fn()
    }
  }

  dom.window = window
  dom.localStorage = localStorage
  dom.flushRaf = flushRaf
  dom.rafQueue = rafQueue
  dom.store = store
  return dom
}

export { FakeElement, FakeObserver }
