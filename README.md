# dsh-whale-widget-dock

`dsh-whale-widget`（小鲸鱼桌宠）的伴生插件：让桌宠**跟着 DSH 右侧 Sidebar 走**。

| 右栏状态 | 桌宠位置 |
| --- | --- |
| 展开 | 右缘紧贴右栏左缘（`gap` 默认 `0`，可配） |
| 折叠 | 右缘紧贴窗口右缘（`edgeGap` 默认 `24`，沿用挂件原来的右边距） |
| 右栏拖动改宽 | 实时跟随，不做过渡跳变 |
| 锁定 | 强制保持"右侧吸附"，并压制挂件贴左时的整只镜像翻转 |

> 只改 `dsh-whale-widget` 的**定位与吸附表现**，不改它的任何文件。卸载本插件后挂件立刻恢复原样。

## 安装

### 方式一：脚本（推荐）

```powershell
pwsh -File .\install.ps1
```

脚本会：

1. 把本目录复制到 `%DSH_HOME%\local-plugins\dsh-whale-widget-dock`
2. 在 `profiles\desktop\node_modules` 里建一个指向它的目录联接
3. 在 `profiles\desktop\package.json` 的 `dependencies` 与 `dsh.profile.bundles` 里登记
4. 改动前自动备份 `package.json`

**装完必须重启 DSH Desktop**（宿主只在启动时收集一次 Web 外壳注入表）。

卸载：

```powershell
pwsh -File .\install.ps1 -Uninstall
```

### 方式二：手动

1. 把本目录放到 `%DSH_HOME%\local-plugins\dsh-whale-widget-dock`
2. 在 `%DSH_HOME%\profiles\desktop\package.json` 里加：

   ```jsonc
   "dependencies": {
     "dsh-whale-widget-dock": "link:../../local-plugins/dsh-whale-widget-dock"
   },
   "dsh": { "profile": { "bundles": [ "…", "dsh-whale-widget-dock" ] } }
   ```

3. 确保 `profiles\desktop\node_modules\dsh-whale-widget-dock` 能解析到该目录（联接或直接复制都行）
4. 重启 DSH Desktop

## 使用

- **菜单开关**：打开挂件主菜单（菜单按钮 / 右键 / 长按小鲸鱼），在「吸附与翻转」下一行勾选 **吸附到右栏**。
  取消勾选即解除接管，位置控制权完整交还给挂件自己。
- **快捷键**：`Ctrl + Alt + L`（macOS 为 `⌘ + Alt + L`）。
- 默认**锁定**（`locked: true`），即开箱就是"永远贴右边缘"。
- 锁定状态存在 `localStorage`，刷新与重启后保持。

### 配置

在开发者工具 Console 里：

```js
// 查看
__dshWhaleDock.config
// 展开时留 6px 间隙、折叠时贴死（0）；负值表示再往里压几个像素
__dshWhaleDock.set({ gap: 6, edgeGap: 0 })
// 解锁 / 上锁
__dshWhaleDock.locked(false)
// 立即重算一次
__dshWhaleDock.refresh()
```

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `locked` | `true` | 锁定右侧吸附；解锁后完全交还给挂件自己 |
| `gap` | `0` | 展开时，桌宠右缘与右栏左缘的间距（px）；允许负值微调 |
| `edgeGap` | `0` | 折叠时，桌宠右缘与窗口右缘的间距（px）；`0` = 贴死，允许负值 |
| `writeWidgetPos` | `true` | 同步把 `localStorage['dshw-pos']` 写成 `hAnchor: "right"`，让挂件自己的吸附模型也一致 |

持久化位置：`localStorage['dsh-whale-widget-dock:v1']`
（改名前 `dsh-pet-sidebar-anchor:v1` / `v2` 的配置会自动迁移：旧 v1 里仍是旧默认值 `24` 的 `edgeGap` 会被改成 `0`，其余字段原样保留）。
挂件原有位置会被备份到 `localStorage['dsh-whale-widget-dock:pos-backup']`（只在第一次写入时备份）。

## 工作原理

- **横向定位软接管**：挂件的 `express()` 只写内联 `style.left/top` 和 `dshwv-left` 类，没有 `ResizeObserver`。
  本插件注入一条 `.dshwv-root.dshwd-anchored { left: var(--dshwd-left) !important }` 规则——
  作者样式表里的 `!important` 优先级高于内联普通声明，所以挂件怎么写内联 `left` 都压不过它；
  移除 `dshwd-anchored` 类即完整归还控制权（解锁走的就是这条路）。
- **右栏左缘从哪来**：`@deepseek-ai/dsh-client-ui-sidebar-right` 的面板带
  `[data-sidebar-right-panel="push"][data-sidebar-right-open]` 标记，且 `position: absolute; right: 0`，
  所以它的 `getBoundingClientRect().left` 就是右栏左缘。
  兜底链条：原生右栏面板 → `[data-dsh-center-col]` 右缘（better-sidebar 的标记）→ 窗口右缘。
- **跟随时机**：右栏面板挂 `ResizeObserver`（拖宽实时）+ `MutationObserver`（展开/折叠属性变化）；
  DOM 级 `MutationObserver` 兜住面板与桌宠的挂载/卸载；另有 500ms 低开销轮询兜底。
- **菜单开关**：复用挂件自己的 `.dshwv-menu-row` / `.dshwv-check` 样式，插在「吸附与翻转」下一行；
  挂件若重建菜单，下一次 tick 会把这一行补回去（`data-dsh-whale-dock="menu-row"` 是它的标记）。

## 排查

- **重启后桌宠没动静**：确认 `profiles\desktop\package.json` 的 `dsh.profile.bundles` 里有
  `dsh-whale-widget-dock`，且 `node_modules\dsh-whale-widget-dock\package.json` 可读；然后完全退出 DSH Desktop 再启动。
- **Console 里 `__dshWhaleDock` 是 undefined**：宿主没把脚本注入进来（注入表只在启动时收集，必须重启）。
- **贴的位置差几个像素**：桌宠的可见图像四周有透明留白，"贴死"是按元素盒子算的；用 `gap` 微调。
- **想完全恢复原状**：`__dshWhaleDock.locked(false)` 立即归还控制权；或卸载插件后
  `localStorage.removeItem('dsh-whale-widget-dock:v1')`，必要时把
  `localStorage['dsh-whale-widget-dock:pos-backup']` 写回 `localStorage['dshw-pos']`。

## 兼容性

- 依赖 `dsh-whale-widget` 的 `.dshwv-root` 根节点（该插件也会把节点暴露为 `window.__dshWhaleRoot`）。
- 依赖右侧 Sidebar 的 `data-sidebar-right-panel` / `data-sidebar-right-open` 标记（DSH 0.2.x）。
  标记缺失时退化为"贴窗口右缘"，不会报错。
