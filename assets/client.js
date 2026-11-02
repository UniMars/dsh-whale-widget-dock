/*!
 * dsh-whale-widget-dock —— 浏览器侧
 *
 * 让 dsh-whale-widget 的桌宠跟着 DSH 右侧 Sidebar 走：
 *   - 右栏展开：桌宠右缘紧贴右栏左缘（gap 可配，默认 0 = 紧贴）
 *   - 右栏折叠：桌宠右缘紧贴窗口右缘（edgeGap 可配，默认 0 = 紧贴）
 *   - 锁定：在两种状态之间持续右侧吸附，并压制贴左时的整只镜像翻转
 *
 * 开关放在挂件自己的主菜单里（「吸附与翻转」下面一行），不再额外画浮动按钮。
 *
 * 实现要点（与 whale widget 的定位模型对齐）：
 *   1. widget 的 `express()` 只写内联 `style.left/top` + `dshwv-left` 类，
 *      没有 ResizeObserver。作者样式表里的 `!important` 优先级高于内联普通声明，
 *      所以用一个 `.dshwd-anchored { left: var(--dshwd-left) !important }` 规则
 *      做"软接管"：widget 再怎么写内联 left 都压不过它，移除类即完整归还控制权。
 *   2. 同步写 `localStorage['dshw-pos']` 为 `hAnchor: 'right'`，让 widget 自己的
 *      吸附模型在刷新后仍是右侧吸附（翻转判定也据此关闭）。
 *   3. 右栏面板的标记来自 @deepseek-ai/dsh-client-ui-sidebar-right：
 *      `[data-sidebar-right-panel="push"][data-sidebar-right-open]`，
 *      面板 `position:absolute; right:0`，所以它的 rect.left 就是右栏左缘。
 *   4. 菜单行复用挂件自己的 `.dshwv-menu-row` / `.dshwv-check` 样式，保持观感一致；
 *      菜单若被挂件重建，下一次 tick 会把这一行补回去。
 */
(function () {
  'use strict'

  var VERSION = '0.3.0'
  var STORAGE_KEY = 'dsh-whale-widget-dock:v1'
  /* 改名前的键（dsh-pet-sidebar-anchor），用来迁移用户已有配置 */
  var LEGACY_KEYS = ['dsh-pet-sidebar-anchor:v2', 'dsh-pet-sidebar-anchor:v1']
  var POS_KEY = 'dshw-pos'
  var POS_BACKUP_KEY = 'dsh-whale-widget-dock:pos-backup'
  var PET_SELECTOR = '.dshwv-root'
  var MENU_SELECTOR = '.dshwv-menu'
  var PANEL_SELECTOR = '[data-sidebar-right-panel]'
  var CENTER_SELECTOR = '[data-dsh-center-col]'
  var ANCHOR_CLASS = 'dshwd-anchored'
  var STYLE_ID = 'dsh-whale-widget-dock-style'
  var MENU_LABEL = '吸附到右栏'
  var GAP_MIN = -60
  var GAP_MAX = 400
  var DEFAULTS = { locked: true, gap: 0, edgeGap: 0, writeWidgetPos: true }

  /* 脚本可能被重复注入（桌面壳 + web 外壳两条通道并存），只跑一份。 */
  if (window.__dshWhaleDockBooted) return
  window.__dshWhaleDockBooted = true

  var state = {
    cfg: loadConfig(),
    style: null,
    scheduled: false,
    applying: false,
    panelObserver: null,
    rootObserver: null,
    widthObserver: null,
    observedPanel: null,
    observedRoot: null,
    lastLeft: null,
    lastMode: '',
    menu: { box: null, row: null, checkbox: null },
  }

  // ---------------------------------------------------------------- 配置

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value
  }

  function parseStore(key) {
    try {
      var raw = window.localStorage.getItem(key)
      if (!raw) return null
      var value = JSON.parse(raw)
      return value && typeof value === 'object' ? value : null
    } catch (err) {
      return null
    }
  }

  function applyStored(cfg, stored, keepEdgeGap) {
    if (!stored) return
    if (typeof stored.locked === 'boolean') cfg.locked = stored.locked
    if (typeof stored.gap === 'number' && isFinite(stored.gap)) cfg.gap = clamp(stored.gap, GAP_MIN, GAP_MAX)
    if (keepEdgeGap && typeof stored.edgeGap === 'number' && isFinite(stored.edgeGap)) {
      cfg.edgeGap = clamp(stored.edgeGap, GAP_MIN, GAP_MAX)
    }
    if (typeof stored.writeWidgetPos === 'boolean') cfg.writeWidgetPos = stored.writeWidgetPos
  }

  function loadConfig() {
    var cfg = {
      locked: DEFAULTS.locked,
      gap: DEFAULTS.gap,
      edgeGap: DEFAULTS.edgeGap,
      writeWidgetPos: DEFAULTS.writeWidgetPos,
    }
    var current = parseStore(STORAGE_KEY)
    if (current) {
      applyStored(cfg, current, true)
      return cfg
    }
    for (var i = 0; i < LEGACY_KEYS.length; i += 1) {
      var legacy = parseStore(LEGACY_KEYS[i])
      if (!legacy) continue
      // 旧 v1 的 edgeGap 默认值是 24（沿用挂件原本的右边距），折叠时看着"离右边还有点距离"；
      // 迁移时把仍等于旧默认值的 24 丢掉、改用现在的 0，用户自己改过的其它值保留。
      var isOldV1 = LEGACY_KEYS[i].indexOf(':v1') >= 0
      var keepEdgeGap = !(isOldV1 && legacy.edgeGap === 24)
      applyStored(cfg, legacy, keepEdgeGap)
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch (err) { /* ignore */ }
      break
    }
    return cfg
  }

  function saveConfig() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cfg))
    } catch (err) {
      /* ignore */
    }
  }

  // ------------------------------------------------------------ DOM 读取

  /** 布局视口宽度：优先用 clientWidth，排除纵向滚动条，折叠时才能真正贴住内容右缘。 */
  function viewportWidth() {
    return document.documentElement.clientWidth || window.innerWidth || 0
  }

  function viewportHeight() {
    return window.innerHeight || document.documentElement.clientHeight || 0
  }

  function petRoot() {
    var root = null
    try { root = window.__dshWhaleRoot } catch (err) { root = null }
    if (!root || !root.isConnected) root = document.querySelector(PET_SELECTOR)
    return root && root.isConnected ? root : null
  }

  /** 右栏面板：只在普通（push）呈现且展开时返回它的 rect。 */
  function rightPanelRect() {
    var nodes = document.querySelectorAll(PANEL_SELECTOR)
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i]
      if (node.getAttribute('data-sidebar-right-panel') !== 'push') continue
      if (!node.hasAttribute('data-sidebar-right-open')) continue
      var rect = node.getBoundingClientRect()
      if (!rect || !(rect.width > 1)) continue
      return rect
    }
    return null
  }

  /** 兜底锚点：better-sidebar 标记出的会话列右缘（= 右栏左缘）。 */
  function centerColumnRight() {
    var node = document.querySelector(CENTER_SELECTOR)
    if (!node) return null
    var rect = node.getBoundingClientRect()
    if (!rect || !(rect.width > 1)) return null
    return rect.right
  }

  /**
   * 纯函数：给定锚点与桌宠宽度，算桌宠应该贴到的 left（视口坐标）。
   * panelLeft 为 null 表示右栏折叠（锚点 = 窗口右缘）。
   */
  function chooseLeft(input) {
    var hasPanel = typeof input.panelLeft === 'number' && isFinite(input.panelLeft)
    var anchor = hasPanel ? input.panelLeft : input.viewportWidth
    var gap = hasPanel ? input.gap : input.edgeGap
    var left = anchor - input.petWidth - gap
    return Math.max(0, Math.round(left))
  }

  function measureAnchor() {
    var panel = rightPanelRect()
    if (panel) return { edge: panel.left, mode: 'sidebar' }
    var center = centerColumnRight()
    var vw = viewportWidth()
    // 会话列几乎顶到窗口右缘时视为右栏折叠，避免把 1~2px 的误差当成展开。
    if (typeof center === 'number' && vw - center > 40) {
      return { edge: center, mode: 'center-column' }
    }
    return { edge: vw, mode: 'window' }
  }

  // ------------------------------------------------------------ 样式

  function ensureStyle() {
    if (state.style && state.style.isConnected) return
    var css = [
      /* 软接管横向定位：作者 important 压过内联普通声明 */
      '.' + PET_SELECTOR.slice(1) + '.' + ANCHOR_CLASS + '{left:var(--dshwd-left,0px) !important;}',
      /* 锁定右侧吸附时，压制 widget 自己加的整只镜像 */
      '.' + PET_SELECTOR.slice(1) + '.' + ANCHOR_CLASS + '.dshwv-left{transform:scaleX(1) !important;}',
    ].join('')
    var style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = css
    ;(document.head || document.documentElement).appendChild(style)
    state.style = style
  }

  // --------------------------------------------------- 挂件主菜单里的开关项

  /** 主菜单 = 含「吸附与翻转」那行的 .dshwv-menu；避免误选同样带 menu 类的子视图。 */
  function menuElement() {
    var menus = document.querySelectorAll(MENU_SELECTOR)
    for (var i = 0; i < menus.length; i += 1) {
      if (findMenuAnchor(menus[i])) return menus[i]
    }
    return menus.length ? menus[0] : null
  }

  /** 找挂件自己那行「吸附与翻转」，把开关插在它下面。 */
  function findMenuAnchor(menu) {
    var rows = menu.children || []
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i]
      if (!row || !row.classList || !row.classList.contains('dshwv-menu-row')) continue
      var text = String(row.textContent || '').replace(/\s+/g, '')
      if (text.indexOf('吸附与翻转') >= 0) return row
    }
    return null
  }

  function buildMenuRow() {
    var row = document.createElement('div')
    row.className = 'dshwv-menu-row'
    row.setAttribute('data-dsh-whale-dock', 'menu-row')

    var label = document.createElement('span')
    label.textContent = MENU_LABEL
    row.appendChild(label)

    var checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'dshwv-check'
    checkbox.checked = !!state.cfg.locked
    checkbox.title = '勾选后：右栏展开时贴住其左缘、折叠时贴住窗口右缘（右侧吸附，并关闭贴左镜像）'
    checkbox.setAttribute('data-dsh-whale-dock', 'menu-toggle')
    checkbox.addEventListener('change', function () { setLocked(!!checkbox.checked) })
    row.appendChild(checkbox)

    state.menu.checkbox = checkbox
    return row
  }

  function syncMenuCheckbox() {
    if (state.menu.checkbox) state.menu.checkbox.checked = !!state.cfg.locked
  }

  /** 菜单被挂件重建时，把这一行补回去。 */
  function ensureMenuRow() {
    var menu = menuElement()
    if (!menu) {
      state.menu.box = null
      state.menu.row = null
      state.menu.checkbox = null
      return null
    }
    if (state.menu.row && state.menu.row.isConnected && state.menu.box === menu) {
      syncMenuCheckbox()
      return state.menu.row
    }

    var row = state.menu.box === menu ? state.menu.row : null
    if (!row && menu.querySelector) row = menu.querySelector('[data-dsh-whale-dock="menu-row"]')
    if (!row) row = buildMenuRow()

    var anchor = findMenuAnchor(menu)
    if (anchor && anchor.nextSibling) menu.insertBefore(row, anchor.nextSibling)
    else menu.appendChild(row)

    state.menu.box = menu
    state.menu.row = row
    var box = row.querySelector ? row.querySelector('[data-dsh-whale-dock="menu-toggle"]') : null
    if (box) state.menu.checkbox = box
    syncMenuCheckbox()
    return row
  }

  function setMenuChecked(locked) {
    state.cfg.locked = !!locked
    syncMenuCheckbox()
  }

  // ------------------------------------------------------------ 核心同步

  function sync() {
    var root = petRoot()
    if (!root) return false
    var rect = root.getBoundingClientRect()
    var width = rect.width || root.offsetWidth || 0
    if (!width) return false

    if (!state.cfg.locked) {
      release(root)
      return false
    }

    var anchor = measureAnchor()
    var panelLeft = anchor.mode === 'window' ? null : anchor.edge
    var left = chooseLeft({
      viewportWidth: viewportWidth(),
      petWidth: width,
      panelLeft: panelLeft,
      gap: state.cfg.gap,
      edgeGap: state.cfg.edgeGap,
    })

    state.applying = true
    try {
      root.classList.add(ANCHOR_CLASS)
      if (state.lastLeft !== left || !root.style.getPropertyValue('--dshwd-left')) {
        root.style.setProperty('--dshwd-left', left + 'px')
      }
      if (root.classList.contains('dshwv-left')) root.classList.remove('dshwv-left')
    } finally {
      state.applying = false
    }

    if (state.lastMode !== anchor.mode) {
      state.lastMode = anchor.mode
      writeWidgetPos()
    }
    state.lastLeft = left
    return true
  }

  function release(root) {
    if (!root) return
    root.classList.remove(ANCHOR_CLASS)
    root.style.removeProperty('--dshwd-left')
    if (root.classList.contains('dshwv-left')) root.classList.remove('dshwv-left')
  }

  function schedule() {
    if (state.scheduled) return
    state.scheduled = true
    var run = function () {
      state.scheduled = false
      try { sync() } catch (err) { /* 单帧失败不致命 */ }
    }
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run)
    else window.setTimeout(run, 16)
  }

  // -------------------------------------------- 与 widget 自身状态对齐

  function backupWidgetPos() {
    try {
      if (window.localStorage.getItem(POS_BACKUP_KEY)) return
      var raw = window.localStorage.getItem(POS_KEY)
      if (raw) window.localStorage.setItem(POS_BACKUP_KEY, raw)
    } catch (err) {
      /* ignore */
    }
  }

  /** 把 widget 自己的吸附模型也写成"右侧吸附"，刷新后无需重新勾选。 */
  function writeWidgetPos() {
    if (!state.cfg.writeWidgetPos) return
    var root = petRoot()
    if (!root) return
    try {
      var rect = root.getBoundingClientRect()
      var vh = viewportHeight()
      var next = {
        v: 2,
        hAnchor: 'right',
        hDist: Math.round(Math.max(0, state.cfg.edgeGap)),
        vAnchor: 'bottom',
        vDist: Math.max(0, Math.round(vh - rect.bottom)),
      }
      var raw = JSON.stringify(next)
      if (window.localStorage.getItem(POS_KEY) === raw) return
      backupWidgetPos()
      window.localStorage.setItem(POS_KEY, raw)
    } catch (err) {
      /* ignore */
    }
  }

  // ------------------------------------------------------------ 交互

  function setLocked(locked) {
    state.cfg.locked = !!locked
    saveConfig()
    var root = petRoot()
    if (state.cfg.locked) {
      backupWidgetPos()
      writeWidgetPos()
    } else if (root) {
      release(root)
    }
    setMenuChecked(state.cfg.locked)
    schedule()
  }

  function toggle() {
    setLocked(!state.cfg.locked)
  }

  function onKeyDown(event) {
    if (!event.altKey) return
    var key = (event.key || '').toLowerCase()
    if (key !== 'l') return
    if (!(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    event.stopPropagation()
    toggle()
  }

  // ------------------------------------------------------------ 观察器

  function watchPanel(panel) {
    if (state.observedPanel === panel) return
    if (state.panelObserver) { try { state.panelObserver.disconnect() } catch (err) {} state.panelObserver = null }
    if (state.widthObserver) { try { state.widthObserver.disconnect() } catch (err) {} state.widthObserver = null }
    state.observedPanel = panel || null
    if (!panel) return
    if (typeof window.MutationObserver === 'function') {
      state.panelObserver = new MutationObserver(schedule)
      try {
        state.panelObserver.observe(panel, { attributes: true, attributeFilter: ['data-sidebar-right-open'] })
      } catch (err) { /* ignore */ }
    }
    if (typeof window.ResizeObserver === 'function') {
      state.widthObserver = new ResizeObserver(schedule)
      try { state.widthObserver.observe(panel) } catch (err) { /* ignore */ }
    }
  }

  function watchRoot(root) {
    if (state.observedRoot === root) return
    if (state.rootObserver) { try { state.rootObserver.disconnect() } catch (err) {} state.rootObserver = null }
    state.observedRoot = root || null
    if (!root || typeof window.MutationObserver !== 'function') return
    state.rootObserver = new MutationObserver(function () {
      if (state.applying) return
      schedule()
    })
    try {
      state.rootObserver.observe(root, { attributes: true, attributeFilter: ['class', 'style'] })
    } catch (err) { /* ignore */ }
  }

  function refreshObservers() {
    var panel = null
    var nodes = document.querySelectorAll(PANEL_SELECTOR)
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].getAttribute('data-sidebar-right-panel') === 'push') { panel = nodes[i]; break }
    }
    watchPanel(panel)
    watchRoot(petRoot())
    ensureMenuRow()
  }

  /** 合并触发的重扫描：DOM 抖动再密，也最多 120ms 一次全量查找。 */
  var scanTimer = 0
  var scanPending = false
  function requestScan() {
    if (scanPending) return
    scanPending = true
    var run = function () {
      scanPending = false
      scanTimer = 0
      refreshObservers()
      schedule()
    }
    scanTimer = window.setTimeout(run, 120)
  }

  function boot() {
    ensureStyle()
    refreshObservers()
    sync()

    window.addEventListener('resize', schedule, true)
    if (window.visualViewport) {
      try { window.visualViewport.addEventListener('resize', schedule) } catch (err) { /* ignore */ }
    }
    document.addEventListener('keydown', onKeyDown, true)

    /* 面板 / 桌宠 / 菜单都是 SPA 里动态挂载的。全文档 childList 观察只用来"叫醒"一次合并扫描，
       真正的 querySelectorAll 每 120ms 最多跑一次 —— 聊天流式渲染时不会每帧全量找节点。 */
    if (typeof window.MutationObserver === 'function') {
      var domObserver = new MutationObserver(requestScan)
      try { domObserver.observe(document.documentElement, { childList: true, subtree: true }) } catch (err) {}
    }

    /* 兜底轮询：某些布局变化（例如右栏在隐藏容器里切换呈现）不一定触发上面任何事件。 */
    window.setInterval(function () { refreshObservers(); schedule() }, 500)
  }

  // ------------------------------------------------------------ 对外 API

  function apiConfig() {
    return {
      locked: state.cfg.locked,
      gap: state.cfg.gap,
      edgeGap: state.cfg.edgeGap,
      writeWidgetPos: state.cfg.writeWidgetPos,
    }
  }

  window.__dshWhaleDock = {
    version: VERSION,
    get config() { return apiConfig() },
    set: function (patch) {
      if (!patch || typeof patch !== 'object') return apiConfig()
      if (typeof patch.locked === 'boolean') state.cfg.locked = patch.locked
      if (typeof patch.gap === 'number' && isFinite(patch.gap)) state.cfg.gap = clamp(patch.gap, GAP_MIN, GAP_MAX)
      if (typeof patch.edgeGap === 'number' && isFinite(patch.edgeGap)) state.cfg.edgeGap = clamp(patch.edgeGap, GAP_MIN, GAP_MAX)
      if (typeof patch.writeWidgetPos === 'boolean') state.cfg.writeWidgetPos = patch.writeWidgetPos
      saveConfig()
      if (!state.cfg.locked) release(petRoot())
      else { backupWidgetPos(); writeWidgetPos() }
      syncMenuCheckbox()
      ensureMenuRow()
      schedule()
      return apiConfig()
    },
    refresh: function () { refreshObservers(); return sync() },
    toggle: toggle,
    locked: function (value) { setLocked(value); return state.cfg.locked },
    core: { chooseLeft: chooseLeft },
  }

  /* 旧名字（0.2.x 时代的 dsh-pet-sidebar-anchor）的兼容别名，方便沿用旧习惯的调用方。 */
  if (!window.__dshPetAnchor) window.__dshPetAnchor = window.__dshWhaleDock

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
})()
