# 直接调用 cargo（同样使用系统安装的 Rust 工具链）。
#
#   pwsh -File tools/cargo.ps1 build --release
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CargoArgs)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'rust-env.ps1')
$envInfo = Initialize-RustEnv -Root $root

Push-Location (Join-Path $root 'src-tauri')
try {
    & (Join-Path $envInfo.CargoBin 'cargo.exe') @CargoArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
