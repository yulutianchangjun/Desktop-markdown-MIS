# 校验可执行文件的 DLL 依赖是否齐备。
#
# 背景：x86_64-pc-windows-gnu 产物在新机器上报 0xC0000135（找不到 DLL）时，真正缺的往往不是
# MinGW 运行库（libgcc/libwinpthread 在默认配置下是静态链接进去的），而是 wry 动态加载的
# WebView2Loader.dll。这个脚本用 objdump 读导入表，列出所有非系统依赖并逐一确认能否找到。
#
#   pwsh -File tools/check-deps.ps1
param(
    [string]$Exe = 'src-tauri\target\release\Md-Mis.exe',
    [string[]]$SearchDirs = @('src-tauri\target\release', 'extra_bins')
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$objdump = 'E:\DevTools\MinGw64\bin\objdump.exe'
if (-not (Test-Path $objdump)) { throw "未找到 objdump：$objdump" }
if (-not (Test-Path $Exe)) { throw "未找到可执行文件：$Exe（先跑 tools/tauri.ps1 build --no-bundle）" }

# Windows 自带 / 由系统保证存在的 DLL，不需要随包分发。
$systemDlls = @(
    'kernel32.dll', 'ntdll.dll', 'advapi32.dll', 'user32.dll', 'gdi32.dll', 'shell32.dll',
    'shlwapi.dll', 'ole32.dll', 'oleaut32.dll', 'combase.dll', 'comctl32.dll', 'dwmapi.dll',
    'imm32.dll', 'bcryptprimitives.dll', 'ws2_32.dll', 'userenv.dll', 'dbghelp.dll',
    'msvcrt.dll', 'winmm.dll', 'version.dll', 'setupapi.dll', 'crypt32.dll', 'secur32.dll'
)

$imports = & $objdump -p $Exe |
    Select-String 'DLL Name' |
    ForEach-Object { ($_.Line -split ':')[1].Trim() } |
    Sort-Object -Unique

$external = $imports | Where-Object {
    $name = $_.ToLower()
    $name -notlike 'api-ms-win-*' -and $systemDlls -notcontains $name
}

Write-Host "可执行文件：$Exe"
Write-Host "导入表共 $($imports.Count) 个 DLL，其中非系统依赖 $($external.Count) 个。"
Write-Host ''

if (-not $external) {
    Write-Host '结论：没有额外 DLL 依赖，单文件即可运行。' -ForegroundColor Green
    exit 0
}

$missing = @()
foreach ($dll in $external) {
    $found = $null
    foreach ($dir in $SearchDirs) {
        $candidate = Join-Path $dir $dll
        if (Test-Path $candidate) { $found = $candidate; break }
    }
    if (-not $found) {
        $inSystem = Join-Path $env:SystemRoot "System32\$dll"
        if (Test-Path $inSystem) { $found = $inSystem }
    }

    if ($found) {
        Write-Host ("  [OK]   {0,-28} -> {1}" -f $dll, $found) -ForegroundColor Green
    } else {
        Write-Host ("  [缺失] {0,-28} 未在 {1} 中找到" -f $dll, ($SearchDirs -join ', ')) -ForegroundColor Red
        $missing += $dll
    }
}

Write-Host ''
if ($missing.Count) {
    Write-Host "结论：以下 DLL 必须随包分发，否则新机器会报 0xC0000135：$($missing -join ', ')" -ForegroundColor Red
    Write-Host "把它们放进 extra_bins/，并在 tauri.conf.json 的 bundle.resources 中登记。"
    exit 1
}

Write-Host '结论：所有非系统依赖都能随包找到，可以分发。' -ForegroundColor Green
exit 0
