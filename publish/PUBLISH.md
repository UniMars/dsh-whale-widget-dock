# 发布到插件市场

> 本文件在插件目录内。插件目录**本身就是独立 git 仓库**（有自己的 `.git` 与 `origin`），
> 所以提交与推送都在插件目录里做；`cd plugins\dsh-whale-widget-dock` 之后的命令都是相对它。

> **当前状态（2026-11-03）**
>
> | 步骤 | 状态 |
> | --- | --- |
> | npm 发布 | ✅ `dsh-whale-widget-dock@0.3.1`（`latest`），`npm i dsh-whale-widget-dock` 已验证 |
> | GitHub 仓库 | ✅ https://github.com/UniMars/dsh-whale-widget-dock（Public，topic `dsh-plugin`，release v0.3.1） |
> | 收录 PR | ✅ https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/11673（1 文件 / +6 行，MERGEABLE；CI 全绿：`check` 18m47s + `Submission gate`） |
> | 市场可检索 | ⏳ 等维护者合并，合并后约 1 天 |
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

## 2) GitHub 仓库（要求：Public + 建满 ≥1 天 + `dsh-plugin` topic）

仓库已经就绪：https://github.com/UniMars/dsh-whale-widget-dock
插件目录即该仓库的工作副本，`origin` 已配好，提交身份已设为
`UniMars <65664032+UniMars@users.noreply.github.com>`（GitHub 的邮箱隐私策略只接受这个身份）。

日常同步就是一个普通 push：

```powershell
cd plugins\dsh-whale-widget-dock
git add -A
git commit -m "..."
git push
```

首次为新插件建库时（参考）：

```powershell
cd plugins\<包名>
git init -b main
gh repo create UniMars/<包名> --public --description "..."
git remote add origin https://github.com/UniMars/<包名>.git
git push -u origin main
gh repo edit UniMars/<包名> --add-topic dsh-plugin
```

> 若 push 被拒并提示邮箱隐私：确认 `git config user.email` 是上面的 noreply 地址；
> 已有提交若用了别的邮箱，需要重写作者邮箱后再推。

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
