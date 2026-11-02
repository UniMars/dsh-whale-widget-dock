# 发布到插件市场

> 本文件在插件目录内，**所有命令都以工作区根目录** `DSH-development\` 为当前目录执行。

> **当前状态（2026-11-02）**
>
> | 步骤 | 状态 |
> | --- | --- |
> | npm 发布 | ✅ `dsh-whale-widget-dock@0.3.1`（`latest`），`npm i dsh-whale-widget-dock` 已验证 |
> | GitHub 仓库 | ✅ https://github.com/UniMars/dsh-whale-widget-dock（Public，topic `dsh-plugin`，release v0.3.1） |
> | 收录分支 | ✅ fork `UniMars/awesome-dsh-plugin` 分支 `add-dsh-whale-widget-dock` 已推送 |
> | 收录 PR | ⏳ 等仓库满 1 天（2026-11-03 18:46 后可提） |
>
> 注：GitHub 账号是 `UniMars`，npm 账号是 `noctboat`，两者不同；所有 URL 以 `UniMars` 为准。
> 另：npm 自动为首次发布创建了 `0.0.0-stage` 占位版本，`latest` 不受影响，用 bypass-2FA token 无法删除。

插件要出现在 DSH 的插件市场（Discover）里，靠两条腿：

1. **npm 发布** —— 市场的一键安装走 npm 包（需要版本号可知）。
2. **收录条目** —— 在 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 加一个 YAML 文件；
   `awesome-dsh-plugin.com/index.json` 与商城抓的就是它，合并后约 1 天生效。

包名 `dsh-whale-widget-dock` 已发布（0.3.1）；本地打包 6 个文件 / 11.2 KB。

索引文件放在 `plugins/dsh-whale-widget-dock/publish/awesome-dsh-plugin/data/plugins/UniMars__dsh-whale-widget-dock.yml`。

---

## 1) 发布 npm 包

```powershell
cd plugins\dsh-whale-widget-dock
npm login          # 浏览器授权，凭据写到 %USERPROFILE%\.npmrc
npm whoami         # 确认身份
npm publish        # publishConfig.access=public，首次即公开
npm view dsh-whale-widget-dock version
```

> 之后每次发版：改 `package.json` 的 `version` → `npm publish`。市场按 npm 版本判断更新。
> 若账号开了 2FA，普通登录 token 不能发布，需要 npm 后台建 **granular token + Bypass 2FA**，再 `npm config set //registry.npmjs.org/:_authToken=npm_xxx`。

## 2) 建 GitHub 仓库（要求：Public + 建满 ≥1 天 + `dsh-plugin` topic）

把插件子目录单独成库（保留提交历史）：

```powershell
# 在 workspace 根目录
git subtree split -P plugins/dsh-whale-widget-dock -b plugin-only
git push https://github.com/UniMars/dsh-whale-widget-dock.git plugin-only:main
```

首次也可以用 `gh`（已在本机安装）：

```powershell
gh repo create UniMars/dsh-whale-widget-dock --public --description "..."
gh repo edit UniMars/dsh-whale-widget-dock --add-topic dsh-plugin
```

> 如果 push 被拒并提示邮箱隐私：把分支上的提交作者改成
> `UniMars <65664032+UniMars@users.noreply.github.com>` 再推。

## 3) 提交收录 PR

**前提**：仓库创建满 1 天（CI 自动检查）。

已准备好的分支：`UniMars/awesome-dsh-plugin` 的 `add-dsh-whale-widget-dock`（含上面的 YAML）。

```powershell
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin --base main `
  --head UniMars:add-dsh-whale-widget-dock `
  --title "Add UniMars/dsh-whale-widget-dock" --body "..."
```

若要重新准备分支：

```powershell
git clone https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
cd awesome-dsh-plugin
git checkout -b add-dsh-whale-widget-dock
copy <workspace>\plugins\dsh-whale-widget-dock\publish\awesome-dsh-plugin\data\plugins\UniMars__dsh-whale-widget-dock.yml data\plugins\
git add data/plugins/UniMars__dsh-whale-widget-dock.yml
git commit -m "Add UniMars/dsh-whale-widget-dock"
git push -u origin add-dsh-whale-widget-dock
```

条目内容：

```yaml
url: https://github.com/UniMars/dsh-whale-widget-dock
name: UniMars/dsh-whale-widget-dock
category: ui
description:
  en: Docks the dsh-whale-widget desktop pet flush against the right sidebar edge, following sidebar width changes and collapse/expand, with a toggle in the widget menu.
  zh: 让 dsh-whale-widget 桌宠紧贴右侧栏边缘：展开时贴其左缘、折叠时贴窗口右缘，右栏改宽时实时跟随，开关在挂件菜单里。
```

## 4) 验证

```powershell
dsh plugin --profile desktop add dsh-whale-widget-dock
```

市场收录后，Discover 里搜 `whale` / `dock` 应能命中；`awesome-dsh-plugin.com/plugins.json` 里也会出现该条目。

## 硬性门槛（来自收录规则）

- `package.json` 声明 `dsh.bundle.patch` —— ✅
- 仓库有真实代码、非占位 —— ✅
- 仓库 ≥ 1 天 —— ⏳ 2026-11-03 18:46 后达标
- 加 `dsh-plugin` topic —— ✅
- 描述属实、不带营销词 —— ✅
