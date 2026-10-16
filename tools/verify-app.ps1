# 端到端验证：真实 .exe + 真实 SQLite 文件。
#
# 这个脚本需要在沙箱外运行：应用会把 data.db 写到 %APPDATA%\com.localdms.desktop，
# 而受限进程只能写工作区。脚本自己负责启动、造数、截图、收尾，最后一定会结束并关闭应用，
# 避免 GUI 子进程占住调用方的输出管道。
param(
    [string]$Exe = 'src-tauri\target\release\local-dms.exe',
    [string]$ShotDir = 'shots'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$py = 'C:\Users\23678\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$configDir = Join-Path $env:APPDATA 'com.localdms.desktop'
$dbFile = Join-Path $configDir 'data.db'
$exePath = (Resolve-Path $Exe).Path

function Stop-App {
    Get-Process -Name 'local-dms' -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 800
}

function Start-App {
    Start-Process -FilePath $exePath | Out-Null
    Start-Sleep -Seconds 9
}

$summary = [ordered]@{}

try {
    Write-Host '=== 1. 清空旧状态，首次启动，让应用自己跑 migration ===' -ForegroundColor Cyan
    Stop-App
    if (Test-Path $configDir) { Remove-Item -Recurse -Force $configDir }
    Start-App

    if (-not (Test-Path $dbFile)) { throw "应用未能创建 data.db: $dbFile" }
    $summary['应用创建 data.db'] = "是 ($([math]::Round((Get-Item $dbFile).Length/1KB,1)) KB)"
    $summary['WAL 日志存在'] = if (Test-Path "$dbFile-wal") { '是' } else { '否' }

    # 结构校验：应用自己建的表必须与规范一致。
    $schema = & $py 'tools/verify-db.py' --db $dbFile 2>&1
    $failures = ($schema | Select-String -Pattern '^\[FAIL\]').Count
    $summary['应用建表结构校验'] = if ($failures -eq 0) { '全部通过' } else { "$failures 项失败" }
    $schema | Where-Object { $_ -match 'journal_mode|表存在|索引存在|字段完整|默认值|查询计划' } |
        ForEach-Object { Write-Host "    $_" }

    Write-Host ''
    Write-Host '=== 2. 写入演示数据 ===' -ForegroundColor Cyan
    Stop-App
    & $py 'tools/seed-demo.py' --db $dbFile --force | ForEach-Object { Write-Host "    $_" }
    $summary['演示数据'] = '已写入'

    Write-Host ''
    Write-Host '=== 3. 重新启动并截图 ===' -ForegroundColor Cyan
    Start-App

    New-Item -ItemType Directory -Force -Path (Join-Path $root $ShotDir) | Out-Null
    & pwsh -NoProfile -File 'tools/ui-probe.ps1' -ProcessName 'local-dms' `
        -Out (Join-Path $ShotDir '01-dashboard.png') | ForEach-Object { Write-Host "    $_" }
    $summary['截图 · 仪表盘'] = (Join-Path $ShotDir '01-dashboard.png')

    # 点击顶栏主题按钮（距右边缘 151px、距顶部 23px）→ 浅色模式，并应写回 user_settings。
    & pwsh -NoProfile -File 'tools/ui-probe.ps1' -ProcessName 'local-dms' `
        -Out (Join-Path $ShotDir '02-light-dashboard.png') `
        -ClickRelRight 151 -ClickRelTop 23 | ForEach-Object { Write-Host "    $_" }
    $summary['截图 · 浅色模式'] = (Join-Path $ShotDir '02-light-dashboard.png')

    Write-Host ''
    Write-Host '=== 4. 校验界面写入是否落库 ===' -ForegroundColor Cyan
    $probe = & $py -c @"
import sqlite3, sys
conn = sqlite3.connect(r'$dbFile')
conn.row_factory = sqlite3.Row
rows = {r['key']: r['value'] for r in conn.execute('SELECT key, value FROM user_settings')}
print('user_settings =', rows)
print('active_theme =', rows.get('active_theme', '<未写入>'))
conn.close()
"@ 2>&1
    $probe | ForEach-Object { Write-Host "    $_" }
    $themeLine = $probe | Select-String -Pattern '^active_theme = ' | Select-Object -First 1
    $summary['界面写入落库'] = ($themeLine -replace '^active_theme = ', '')

    Write-Host ''
    Write-Host '=== 5. 收尾 ===' -ForegroundColor Cyan
    Stop-App
    $summary['应用已关闭'] = '是'
}
finally {
    Stop-App
}

Write-Host ''
Write-Host '================ 验证摘要 ================' -ForegroundColor Green
$summary.GetEnumerator() | ForEach-Object { '{0,-22} {1}' -f $_.Key, $_.Value }
