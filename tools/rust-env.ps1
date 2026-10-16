# 本机受限环境下的 Rust 环境准备（被 tools/cargo.ps1 与 tools/tauri.ps1 复用）。
#
# 开发机上的 Rust 装在 E:\DevTools\Rust_JDK 下（rustup 的 RUSTUP_HOME/CARGO_HOME 都在那里）。
# 受限进程只能写工作区，因此：
#   RUSTUP_HOME 指回系统目录（只读使用，用于定位 toolchain）
#   CARGO_HOME  指向工作区内的 .cargo-home（registry 缓存与 config.toml 都放这里）
# 这样既用上了系统安装的 Rust，又不往工作区外写任何东西。

$script:RustJdk   = 'E:\DevTools\Rust_JDK'
$script:RustupHome = Join-Path $RustJdk '.rustup'
$script:CargoBin  = Join-Path $RustJdk '.cargo\bin'
$script:MinGwBin  = 'E:\DevTools\MinGw64\bin'

function Initialize-RustEnv {
    param([Parameter(Mandatory = $true)][string]$Root)

    if (-not (Test-Path (Join-Path $script:CargoBin 'cargo.exe'))) {
        throw "未找到系统 Rust：$script:CargoBin（期望 rustup 已安装 stable-x86_64-pc-windows-gnu）"
    }
    if (-not (Test-Path $script:RustupHome)) {
        throw "未找到 RUSTUP_HOME：$script:RustupHome"
    }
    if (-not (Test-Path (Join-Path $script:MinGwBin 'gcc.exe'))) {
        throw "未找到 MinGW：$script:MinGwBin（windows-gnu 目标需要它做链接器与资源编译器）"
    }

    $cargoHome = Join-Path $Root '.cargo-home'
    New-Item -ItemType Directory -Force -Path $cargoHome | Out-Null

    $env:RUSTUP_HOME = $script:RustupHome
    $env:CARGO_HOME = $cargoHome
    # MinGW 提供 gcc/ar/ld 与 windres，tauri-build 用它嵌入应用图标。
    $env:PATH = "$script:CargoBin;$script:MinGwBin;$env:PATH"
    $env:CARGO_TERM_COLOR = 'never'

    return @{ CargoBin = $script:CargoBin; CargoHome = $cargoHome }
}
