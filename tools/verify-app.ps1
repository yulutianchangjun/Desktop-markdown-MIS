# 启动已编译的桌面程序做冒烟校验：建库 → 校验结构 → 截图。
#
# 请在沙箱之外运行——WebView2 需要正常的交互式会话令牌。
#
#   pwsh -File tools/verify-app.ps1
param(
    [string]$Exe = 'src-tauri\target\release\Md-Mis.exe',
    [string]$ShotDir = 'shots\desktop'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$py = 'C:\Users\23678\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$exePath = (Resolve-Path $Exe).Path
$appDir = Split-Path -Parent $exePath
$dataDir = Join-Path $appDir 'data'
$dbFile = Join-Path $dataDir 'data.db'

function Stop-App {
    Get-Process -Name 'Md-Mis', 'msedgewebview2' -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 900
}

$summary = [ordered]@{}

try {
    Write-Host '=== 1. 清空程序同级的 data/，验证首次运行能自建 ===' -ForegroundColor Cyan
    Stop-App
    if (Test-Path $dataDir) { Remove-Item $dataDir -Recurse -Force }
    Write-Host "  已清空：$dataDir"

    Write-Host '=== 2. 启动程序（标准权限） ===' -ForegroundColor Cyan
    Start-Process -FilePath $exePath | Out-Null
    Start-Sleep -Seconds 12

    $proc = Get-Process -Name 'Md-Mis' -ErrorAction SilentlyContinue
    $summary['进程存活'] = if ($proc) { "是（窗口：$($proc.MainWindowTitle)）" } else { '否' }

    if (-not (Test-Path $dbFile)) {
        $log = Join-Path $dataDir 'startup.log'
        $detail = if (Test-Path $log) { Get-Content $log -Raw } else { '（没有 startup.log）' }
        throw "未能创建 $dbFile`n$detail"
    }

    $summary['data/data.db 已生成'] = "$([math]::Round((Get-Item $dbFile).Length/1KB,1)) KB"
    $summary['WAL 日志存在'] = if (Test-Path "$dbFile-wal") { '是' } else { '否' }
    $summary['WebView2 缓存落在 data/'] = if (Test-Path (Join-Path $dataDir 'EBWebView')) { '是' } else { '否' }
    $logFile = Join-Path $dataDir 'startup.log'
    if (Test-Path $logFile) {
        $summary['startup.log'] = ((Get-Content $logFile -Raw).Trim() -replace "`r?`n", ' / ')
    }

    Write-Host '=== 3. 结构校验 ===' -ForegroundColor Cyan
    $schema = & $py 'tools/verify-db.py' --db $dbFile 2>&1
    $failures = ($schema | Select-String -Pattern '^\[FAIL\]').Count
    $summary['结构校验'] = if ($failures -eq 0) { '全部通过' } else { "$failures 项失败" }
    $schema | Where-Object { $_ -match 'journal_mode|表存在|索引存在|字段完整|默认值|行数|分类分布' } |
        ForEach-Object { Write-Host "    $_" }

    Write-Host '=== 4. 截图 ===' -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path (Join-Path $root $ShotDir) | Out-Null
    & pwsh -NoProfile -File 'tools/ui-probe.ps1' -ProcessName 'Md-Mis' `
        -Out (Join-Path $ShotDir 'app-dashboard.png') | ForEach-Object { Write-Host "    $_" }
    $summary['截图'] = (Join-Path $ShotDir 'app-dashboard.png')
}
finally {
    Write-Host '=== 5. 收尾 ===' -ForegroundColor Cyan
    Stop-App
    $summary['应用已关闭'] = '是'
}

Write-Host ''
Write-Host '================ 校验摘要 ================' -ForegroundColor Green
$summary.GetEnumerator() | ForEach-Object { '{0,-26} {1}' -f $_.Key, $_.Value }
