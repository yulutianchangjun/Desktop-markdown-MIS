# Invokes the workspace-local Rust toolchain with the right environment.
#
#   pwsh -File tools/cargo.ps1 build --release
#
# CARGO_HOME doubles as the toolchain prefix: .rust/bin holds cargo/rustc and
# .rust/config.toml points Cargo at the loopback crates proxy.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CargoArgs)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cargoHome = Join-Path $root '.rust'

if (-not (Test-Path (Join-Path $cargoHome 'bin\cargo.exe'))) {
    throw "Rust toolchain missing at $cargoHome - run tools/fetch-rust.ps1 first."
}

$env:CARGO_HOME = $cargoHome
$env:PATH = "$(Join-Path $cargoHome 'bin');$env:PATH"
# Keep cargo's own build output colour-free so logs stay readable in job output.
$env:CARGO_TERM_COLOR = 'never'

& (Join-Path $cargoHome 'bin\cargo.exe') @CargoArgs
exit $LASTEXITCODE
