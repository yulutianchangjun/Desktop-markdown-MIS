# 用系统安装的 Rust 工具链构建桌面端（脚本会准备好沙箱所需的环境变量）。
#
#   pwsh -File tools/tauri.ps1 build --no-bundle      # 只出 exe
#   pwsh -File tools/tauri.ps1 build                  # 出 NSIS 安装包
#   pwsh -File tools/tauri.ps1 dev
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$TauriArgs)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'rust-env.ps1')
Initialize-RustEnv -Root $root | Out-Null

# 见 tools/dsh-build-shim.mjs：让 Vite 跳过它的 `net use` 探测，沙箱禁止管道式子进程。
$shim = 'file:///' + ((Join-Path $root 'tools\dsh-build-shim.mjs') -replace '\\', '/')
$env:NODE_OPTIONS = "--import $shim"

# 打包提示：受限环境下 GitHub 直连容易超时，可以先用镜像再打包：
#   $env:TAURI_BUNDLER_TOOLS_GITHUB_MIRROR = 'https://ghfast.top/https://github.com'
# 另外 Tauri 会把 NSIS 工具链解压到 %LOCALAPPDATA%\tauri，本机沙箱拒绝写工作区之外的路径，
# 因此这台机器上打安装包需要放宽文件访问。

Push-Location $root
try {
    & pnpm tauri @TauriArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
