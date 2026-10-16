# 截取桌面应用窗口，并可选地在窗口内做一次鼠标点击。
#
#   pwsh -File tools/ui-probe.ps1 -ProcessName local-dms -Out shots/app.png
#   pwsh -File tools/ui-probe.ps1 -ProcessName local-dms -Out shots/light.png -ClickRelRight 151 -ClickRelTop 23
#
# -ClickRelRight / -ClickRelTop 用「距窗口右边缘 / 距窗口顶部的像素」定位，避免硬编码屏幕坐标。
param(
    [string]$ProcessName = 'local-dms',
    [Parameter(Mandatory = $true)][string]$Out,
    [int]$ClickRelRight = -1,
    [int]$ClickRelTop = 0,
    [int]$SettleMs = 900
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not ('DmsWin32' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class DmsWin32
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, IntPtr extra);

    public const uint LEFTDOWN = 0x0002;
    public const uint LEFTUP = 0x0004;
    public const int SW_RESTORE = 9;

    public static void Click(int x, int y)
    {
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(120);
        mouse_event(LEFTDOWN, 0, 0, 0, IntPtr.Zero);
        System.Threading.Thread.Sleep(60);
        mouse_event(LEFTUP, 0, 0, 0, IntPtr.Zero);
    }
}
'@
}

$proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { throw "找不到带窗口的进程: $ProcessName" }

$hwnd = $proc.MainWindowHandle
[void][DmsWin32]::ShowWindow($hwnd, [DmsWin32]::SW_RESTORE)
[void][DmsWin32]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds $SettleMs

$rect = New-Object DmsWin32+RECT
[void][DmsWin32]::GetWindowRect($hwnd, [ref]$rect)
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) { throw "窗口尺寸异常: ${width}x${height}" }

if ($ClickRelRight -ge 0) {
    $x = $rect.Right - $ClickRelRight
    $y = $rect.Top + $ClickRelTop
    Write-Host "点击窗口内坐标 ($x, $y)  [右边缘-$ClickRelRight, 顶部+$ClickRelTop]"
    [DmsWin32]::Click($x, $y)
    Start-Sleep -Milliseconds 700
}

$outPath = [System.IO.Path]::GetFullPath($Out)
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($outPath)) | Out-Null

$bmp = New-Object System.Drawing.Bitmap $width, $height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $width, $height))
$gfx.Dispose()
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "已保存: $outPath  (${width}x${height})"
