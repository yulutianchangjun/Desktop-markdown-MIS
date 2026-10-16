# Downloads a standalone Rust toolchain (x86_64-pc-windows-gnu) into the workspace.
# Node's TLS stack works under the sandbox; Schannel (curl/git/rustup) does not.
$ErrorActionPreference = 'Stop'

$root      = Split-Path -Parent $PSScriptRoot
$dl        = Join-Path $root '.toolchain-dl'
$target    = 'x86_64-pc-windows-gnu'
$jobScript = Join-Path $PSScriptRoot 'download-rust.mjs'

New-Item -ItemType Directory -Force -Path $dl | Out-Null

Write-Host "== resolving stable version =="
$ver = (& node $jobScript --resolve --out $dl).Trim()
if ($LASTEXITCODE -ne 0 -or -not $ver) { throw "failed to resolve Rust version" }
Write-Host "stable = $ver"

Write-Host "== downloading components =="
& node $jobScript --download --version $ver --target $target --out $dl
if ($LASTEXITCODE -ne 0) { throw "component download failed" }

Get-ChildItem $dl -Filter *.tar.gz | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}} | Format-Table -AutoSize

Write-Host "== extracting into .rust =="
$prefix = Join-Path $root '.rust'
if (Test-Path $prefix) { Remove-Item -Recurse -Force $prefix }
New-Item -ItemType Directory -Force -Path $prefix | Out-Null

foreach ($f in Get-ChildItem $dl -Filter *.tar.gz) {
    $stage = Join-Path $dl ("x-" + ($f.Name -replace '\.tar\.gz$',''))
    if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    Write-Host "  extracting $($f.Name)"
    & tar.exe -xzf $f.FullName -C $stage
    if ($LASTEXITCODE -ne 0) { throw "tar failed for $($f.Name)" }

    # Layout is <component>-<version>-<target>/<component>/{bin,lib,share}; merge each
    # component root into one shared prefix so rustc/cargo/rust-std find each other.
    $componentDirs = Get-ChildItem $stage -Directory | ForEach-Object { Get-ChildItem $_.FullName -Directory }
    foreach ($c in $componentDirs) {
        foreach ($sub in @('bin','lib','share','etc')) {
            $src = Join-Path $c.FullName $sub
            if (-not (Test-Path $src)) { continue }
            $dst = Join-Path $prefix $sub
            New-Item -ItemType Directory -Force -Path $dst | Out-Null
            Copy-Item -Recurse -Force (Join-Path $src '*') $dst
        }
    }
    Remove-Item -Recurse -Force $stage
}

Write-Host "== verifying =="
& (Join-Path $prefix 'bin\rustc.exe') --version
& (Join-Path $prefix 'bin\cargo.exe') --version
Write-Host "PREFIX=$prefix"
