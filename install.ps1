#Requires -Version 5.1
<#
.SYNOPSIS
    安装 / 卸载 dsh-whale-widget-dock（小鲸鱼桌宠贴右侧栏的伴生插件）。

.DESCRIPTION
    安装会做四件事：
      1. 清理旧名字 dsh-pet-sidebar-anchor 留下的安装副本 / 联接 / 清单登记
      2. 把插件目录复制到 %DSH_HOME%\local-plugins\dsh-whale-widget-dock
      3. 在 profiles\<profile>\node_modules 里建目录联接（失败则复制）
      4. 在 profile 的 package.json 里登记 dependencies + dsh.profile.bundles（先备份）

    装完必须重启 DSH Desktop：宿主只在启动时收集一次 Web 外壳注入表。

.EXAMPLE
    pwsh -File .\install.ps1
.EXAMPLE
    pwsh -File .\install.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [ValidateSet('desktop', 'web')]
    [string]$Profile = 'desktop',
    [switch]$Uninstall,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$PluginName = 'dsh-whale-widget-dock'
# 0.2.x 时代的旧名字：安装时顺手清掉，避免 profile 里残留两条 bundle
$LegacyNames = @('dsh-pet-sidebar-anchor')
$SourceDir = $PSScriptRoot
$DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$ProfileDir = Join-Path $DshHome (Join-Path 'profiles' $Profile)
$ManifestPath = Join-Path $ProfileDir 'package.json'
$LocalPlugins = Join-Path $DshHome 'local-plugins'
$TargetDir = Join-Path $LocalPlugins $PluginName
$NodeModules = Join-Path $ProfileDir 'node_modules'
$LinkPath = Join-Path $NodeModules $PluginName
$LinkSpec = 'link:../../local-plugins/' + $PluginName

function Write-Step($Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Warn2($Message) { Write-Host "!!  $Message" -ForegroundColor Yellow }

function Read-Manifest {
    if (-not (Test-Path -LiteralPath $ManifestPath)) { throw "找不到 profile 清单：$ManifestPath" }
    return Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Save-Manifest($Manifest) {
    $backup = "$ManifestPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    if ($DryRun) { Write-Step "[dry] 备份清单 -> $backup" }
    else {
        Copy-Item -LiteralPath $ManifestPath -Destination $backup -Force
        Write-Step "已备份清单 -> $backup"
    }
    $json = $Manifest | ConvertTo-Json -Depth 20
    if ($DryRun) {
        Write-Host $json
        return
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ManifestPath, $json + "`n", $utf8)
}

function Ensure-Bundle($Manifest, [string]$Name, [bool]$Add) {
    $profileNode = $Manifest.dsh.profile
    if (-not $profileNode) { throw '清单里没有 dsh.profile 节点，无法登记 bundle' }
    $bundles = @($profileNode.bundles | Where-Object { $_ })
    $has = $bundles -contains $Name
    if ($Add -and -not $has) {
        $profileNode | Add-Member -NotePropertyName bundles -NotePropertyValue (@($bundles) + $Name) -Force
    }
    elseif (-not $Add -and $has) {
        $profileNode | Add-Member -NotePropertyName bundles -NotePropertyValue (@($bundles) | Where-Object { $_ -ne $Name }) -Force
    }
}

function Ensure-Dependency($Manifest, [string]$Name, [bool]$Add) {
    if (-not $Manifest.dependencies) {
        $Manifest | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    if ($Add) {
        $Manifest.dependencies | Add-Member -NotePropertyName $Name -NotePropertyValue $LinkSpec -Force
    }
    elseif ($Manifest.dependencies.PSObject.Properties.Name -contains $Name) {
        $Manifest.dependencies.PSObject.Properties.Remove($Name)
    }
}

function Remove-Link([string]$Name) {
    $path = Join-Path $NodeModules $Name
    if (-not (Test-Path -LiteralPath $path)) { return }
    $item = Get-Item -LiteralPath $path -Force
    if ($item.LinkType -in @('Junction', 'SymbolicLink')) {
        if ($DryRun) { Write-Step "[dry] 删除联接 $path" }
        else { Remove-Item -LiteralPath $path -Force -Recurse:$false }
    }
    else {
        Write-Warn2 "$path 是真实目录（不是本脚本建的联接），请手工确认后删除"
    }
}

function Remove-PluginDir([string]$Dir) {
    if (-not (Test-Path -LiteralPath $Dir)) { return }
    if ($DryRun) { Write-Step "[dry] 删除旧副本 $Dir" }
    else {
        Remove-Item -LiteralPath $Dir -Recurse -Force
        Write-Step "已清理旧副本 $Dir"
    }
}

if (-not (Test-Path -LiteralPath $ProfileDir)) { throw "找不到 profile 目录：$ProfileDir" }

if ($Uninstall) {
    Write-Step "卸载 $PluginName（profile: $Profile）"
    Remove-Link $PluginName

    $manifest = Read-Manifest
    Ensure-Bundle $manifest $PluginName $false
    Ensure-Dependency $manifest $PluginName $false
    Save-Manifest $manifest

    if (-not $DryRun) { Remove-PluginDir $TargetDir }
    Write-Host ''
    Write-Host '卸载完成，重启 DSH Desktop 生效。' -ForegroundColor Green
    return
}

Write-Step "安装 $PluginName（profile: $Profile）"
Write-Step "DSH_HOME = $DshHome"

# 0) 旧名字清理
foreach ($legacy in $LegacyNames) {
    Remove-Link $legacy
    Remove-PluginDir (Join-Path $LocalPlugins $legacy)
}
$manifest = Read-Manifest
$manifestChanged = $false
foreach ($legacy in $LegacyNames) {
    if ($manifest.dsh.profile.bundles -contains $legacy) { Ensure-Bundle $manifest $legacy $false; $manifestChanged = $true }
    if ($manifest.dependencies.PSObject.Properties.Name -contains $legacy) { Ensure-Dependency $manifest $legacy $false; $manifestChanged = $true }
}
if ($manifestChanged) {
    Save-Manifest $manifest
    Write-Step '已从清单移除旧名字登记'
}

# 1) 复制到 local-plugins
if ($DryRun) {
    Write-Step "[dry] 复制 $SourceDir -> $TargetDir"
}
else {
    if (Test-Path -LiteralPath $TargetDir) { Remove-Item -LiteralPath $TargetDir -Recurse -Force }
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    $exclude = @('install.ps1')
    Get-ChildItem -LiteralPath $SourceDir -Force | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $TargetDir -Recurse -Force
    }
    Write-Step "已复制到 $TargetDir"
}

# 2) node_modules 联接（失败则回退为复制）
if (-not (Test-Path -LiteralPath $NodeModules)) { New-Item -ItemType Directory -Path $NodeModules -Force | Out-Null }
Remove-Link $PluginName
if (-not $DryRun) {
    $linked = $false
    try {
        New-Item -ItemType Junction -Path $LinkPath -Target $TargetDir -ErrorAction Stop | Out-Null
        $linked = $true
        Write-Step "已建立目录联接 $LinkPath -> $TargetDir"
    }
    catch {
        Write-Warn2 "建立联接失败（$($_.Exception.Message)），回退为复制"
    }
    if (-not $linked) {
        New-Item -ItemType Directory -Path $LinkPath -Force | Out-Null
        Get-ChildItem -LiteralPath $TargetDir -Force | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $LinkPath -Recurse -Force
        }
        Write-Step "已复制到 $LinkPath"
    }
}
else {
    Write-Step "[dry] 建立联接 $LinkPath -> $TargetDir"
}

# 3) 登记清单
$manifest = Read-Manifest
Ensure-Dependency $manifest $PluginName $true
Ensure-Bundle $manifest $PluginName $true
Save-Manifest $manifest

Write-Host ''
Write-Host '安装完成。' -ForegroundColor Green
Write-Host '请完全退出并重新启动 DSH Desktop —— 宿主只在启动时收集一次 Web 外壳注入表。'
Write-Host '启动后打开桌宠菜单，在「吸附与翻转」下面勾选「吸附到右栏」即可；Ctrl+Alt+L 也能切换。'
