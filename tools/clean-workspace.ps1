# Md-Mis 工程瘦身：一键剥离非源码产物与本地缓存。
#
# 目标是把仓库恢复到「只含源码 + 配置 + 锁文件」的纯净状态，便于推送到远端开源仓库。
# 脚本自带安全护栏：
#   * 只在识别到本项目根目录时执行（必须有 package.json 且含 "md-mis"、且存在 src-tauri/）
#   * 所有目标都用 Resolve-Path 解析成绝对路径，并确认落在项目根目录内
#   * 绝不删除 .git / src / src-tauri/src / tools / 任何配置文件
#   * 默认先打印清单并要求确认；-DryRun 只预览，-Force 免确认
#
#   pwsh -File tools/clean-workspace.ps1 -DryRun     # 只看看会删什么
#   pwsh -File tools/clean-workspace.ps1             # 打印清单并确认后删除
#   pwsh -File tools/clean-workspace.ps1 -Force      # 直接删，不确认
param(
    [switch]$DryRun,
    [switch]$Force,
    # 保留 .dsh/（若你还想让当前会话继续使用其中的技能包）
    [switch]$KeepDsh
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

# ---------------------------------------------------------------- 安全护栏
$pkgFile = Join-Path $root 'package.json'
if (-not (Test-Path $pkgFile)) { throw "不是项目根目录（缺少 package.json）：$root" }
if (-not (Test-Path (Join-Path $root 'src-tauri'))) { throw "不是项目根目录（缺少 src-tauri/）：$root" }
$pkg = Get-Content $pkgFile -Raw | ConvertFrom-Json
if ($pkg.name -ne 'md-mis') { throw "package.json 的 name 不是 md-mis，拒绝执行（当前：$($pkg.name)）" }

Write-Host "项目根目录：$root" -ForegroundColor Cyan
Write-Host ''

# ---------------------------------------------------------------- 清理清单
# Kind=dir 表示整目录删除；Kind=file 表示按通配符删除文件。
$targets = @(
    @{ Path = 'node_modules';           Kind = 'dir';  Desc = '前端依赖（可 pnpm install 重建）' }
    @{ Path = '.pnpm-store';            Kind = 'dir';  Desc = 'pnpm 内容寻址存储' }
    @{ Path = '.cargo-home';            Kind = 'dir';  Desc = '受限环境下 Cargo 的 registry 缓存' }
    @{ Path = 'dist';                   Kind = 'dir';  Desc = '前端构建产物' }
    @{ Path = 'src-tauri/target';       Kind = 'dir';  Desc = 'Rust 中间产物 / exe / NSIS 安装包（可 pnpm tauri build 重建）' }
    @{ Path = 'src-tauri/gen';          Kind = 'dir';  Desc = 'Tauri 生成的 schema' }
    @{ Path = 'shots';                  Kind = 'dir';  Desc = '界面截图（验证用快照）' }
    @{ Path = '.scratch';               Kind = 'dir';  Desc = '校验脚本的临时库与浏览器配置' }
    @{ Path = '.rust';                  Kind = 'dir';  Desc = '遗留的工作区私有 Rust 工具链' }
    @{ Path = '.toolchain-dl';          Kind = 'dir';  Desc = 'Rust 发行包下载缓存' }
    @{ Path = 'data';                   Kind = 'dir';  Desc = '应用运行时数据目录（含用户笔记，确认要删再删）' }
    @{ Path = 'src-tauri/data';         Kind = 'dir';  Desc = '开发时在 crate 目录生成的运行时数据目录' }
    @{ Path = '*.log';                  Kind = 'file'; Desc = '日志文件' }
    @{ Path = '*.tsbuildinfo';          Kind = 'file'; Desc = 'TypeScript 增量构建信息' }
    @{ Path = 'pnpm-debug.log';         Kind = 'file'; Desc = 'pnpm 调试日志' }
    @{ Path = '.vscode';                Kind = 'dir';  Desc = '编辑器配置（按需保留）' }
    @{ Path = '.idea';                  Kind = 'dir';  Desc = '编辑器配置（按需保留）' }
)

if (-not $KeepDsh) {
    # .dsh/ 由当前开发会话注入（技能包等），不属于工程本身；保留可用 -KeepDsh。
    $targets += @{ Path = '.dsh'; Kind = 'dir'; Desc = '开发会话注入的私有目录（技能包）' }
}

# ---------------------------------------------------------------- 统计
function Get-SizeMb([string]$p) {
    $item = Get-Item $p -ErrorAction SilentlyContinue
    if (-not $item) { return 0 }
    if ($item.PSIsContainer) {
        $sum = (Get-ChildItem $p -Recurse -File -Force -ErrorAction SilentlyContinue |
            Measure-Object Length -Sum).Sum
        if (-not $sum) { return 0 }
        return [math]::Round($sum / 1MB, 1)
    }
    return [math]::Round($item.Length / 1MB, 2)
}

$found = @()
foreach ($t in $targets) {
    $full = Join-Path $root $t.Path
    if ($t.Kind -eq 'dir') {
        if (-not (Test-Path $full)) { continue }
        # 护栏：解析后的绝对路径必须仍在根目录内
        $resolved = (Resolve-Path $full).Path
        if ($resolved -ne $root -and $resolved.StartsWith($root + [IO.Path]::DirectorySeparatorChar)) {
            $found += [pscustomobject]@{ Path = $t.Path; Full = $resolved; Kind = 'dir'; MB = (Get-SizeMb $resolved); Desc = $t.Desc }
        }
    }
    else {
        Get-ChildItem -Path (Join-Path $root $t.Path) -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
            $found += [pscustomobject]@{ Path = $_.Name; Full = $_.FullName; Kind = 'file'; MB = (Get-SizeMb $_.FullName); Desc = $t.Desc }
        }
    }
}

if (-not $found.Count) {
    Write-Host '工作区已经很干净，没有需要清理的产物。' -ForegroundColor Green
    exit 0
}

$totalMb = ($found | Measure-Object MB -Sum).Sum
Write-Host '将要清理以下内容：' -ForegroundColor Yellow
$found | ForEach-Object { '  {0,-24} {1,9} MB   {2}' -f $_.Path, $_.MB, $_.Desc }
Write-Host ''
Write-Host ("合计约 {0} MB" -f [math]::Round($totalMb, 1)) -ForegroundColor Yellow
Write-Host ''

if ($DryRun) {
    Write-Host '（-DryRun：未删除任何文件）' -ForegroundColor Green
    exit 0
}

if (-not $Force) {
    $answer = Read-Host '确认删除以上内容？请输入 yes 继续'
    if ($answer -ne 'yes') { Write-Host '已取消。' -ForegroundColor Green; exit 1 }
}

# ---------------------------------------------------------------- 执行删除
$failed = @()
foreach ($item in $found) {
    try {
        if ($item.Kind -eq 'dir') { Remove-Item -LiteralPath $item.Full -Recurse -Force }
        else { Remove-Item -LiteralPath $item.Full -Force }
    }
    catch {
        $failed += "$($item.Path)：$($_.Exception.Message)"
    }
}

Write-Host ''
Write-Host '=== 清理结果 ===' -ForegroundColor Cyan
$remaining = ($found | Where-Object { Test-Path $_.Full }).Count
if ($remaining -eq 0) {
    Write-Host "已删除 $($found.Count) 项，释放约 $([math]::Round($totalMb,1)) MB。" -ForegroundColor Green
}
else {
    Write-Host "仍有 $remaining 项未能删除（多半被进程占用）：" -ForegroundColor Yellow
    $found | Where-Object { Test-Path $_.Full } | ForEach-Object { "  $($_.Path)" }
}
if ($failed.Count) {
    Write-Host '错误明细：' -ForegroundColor Red
    $failed | ForEach-Object { "  $_" }
}

Write-Host ''
Write-Host '=== 当前仓库内容 ===' -ForegroundColor Cyan
Get-ChildItem $root -Force | Where-Object { $_.Name -ne '.git' } |
    Select-Object Mode, Name | Format-Table -AutoSize

Write-Host '下一步：' -ForegroundColor Cyan
Write-Host '  pnpm install          # 恢复依赖'
Write-Host '  pnpm tauri dev        # 本地启动'
Write-Host '  pnpm tauri build      # 重新打包（见 docs/PACKAGING.md）'
