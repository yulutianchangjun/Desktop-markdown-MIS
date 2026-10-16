# Runs the Tauri CLI with the workspace-local Rust toolchain and this machine's
# sandbox accommodations. All build entry points should go through here.
#
#   pwsh -File tools/tauri.ps1 build --no-bundle
#   pwsh -File tools/tauri.ps1 dev
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$TauriArgs)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cargoHome = Join-Path $root '.rust'
$mingw = 'E:\DevTools\MinGw64\bin'

if (-not (Test-Path (Join-Path $cargoHome 'bin\cargo.exe'))) {
    throw "Rust toolchain missing at $cargoHome - run tools/fetch-rust.ps1 first."
}
if (-not (Test-Path (Join-Path $mingw 'gcc.exe'))) {
    throw "MinGW not found at $mingw - the windows-gnu target needs it as linker and rc."
}

# Rust toolchain: CARGO_HOME doubles as the toolchain prefix (.rust/config.toml points
# Cargo at the loopback crates proxy, because Schannel is unavailable to confined runs).
$env:CARGO_HOME = $cargoHome
# MinGW supplies gcc/ar/ld and windres, which tauri-build needs to embed the app icon.
$env:PATH = "$(Join-Path $cargoHome 'bin');$mingw;$env:PATH"
$env:CARGO_TERM_COLOR = 'never'

# See tools/dsh-build-shim.mjs: lets Vite skip its `net use` shell probe, which the
# sandbox blocks (piped child stdio -> EPERM).
$shim = 'file:///' + ((Join-Path $root 'tools\dsh-build-shim.mjs') -replace '\\', '/')
$env:NODE_OPTIONS = "--import $shim"

Push-Location $root
try {
    & pnpm tauri @TauriArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
