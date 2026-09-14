# Record a Chrome tab's viewport to mp4 with ffmpeg gdigrab (used for the promo video).
#   tools\promo-rec.ps1 -Title "Kicktro" -Seconds 20 -Out clip1.mp4 [-ChromeH 87] [-W 1920 -H 1080]
# Title = substring of the window title; ChromeH = outerHeight - innerHeight measured in the page.
param(
  [string]$Title = "Kicktro",
  [int]$Seconds = 20,
  [string]$Out = "clip.mp4",
  [int]$ChromeH = 38,
  [int]$W = 1920,
  [int]$H = 1080,
  [int]$Fps = 30
)
$ffmpeg = "C:\Program Files\ImageMagick-7.1.0-Q16-HDRI\ffmpeg.exe"
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Win32 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
}
"@
$p = Get-Process | Where-Object { $_.MainWindowTitle -like "*$Title*" } | Select-Object -First 1
if (-not $p) { throw "no window titled *$Title*" }
$r = New-Object Win32+RECT
[Win32]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
# Measured on Chrome app-mode windows: 9px side border, ChromeH = title bar height (38px at 125%).
$x = $r.L + 9; $y = $r.T + $ChromeH
# libx264 ultrafast: the bundled ffmpeg 4.2's nvenc rejects current drivers ("unsupported param").
& $ffmpeg -y -hide_banner -loglevel error -f gdigrab -framerate $Fps -offset_x $x -offset_y $y `
  -video_size "${W}x${H}" -draw_mouse 1 -i desktop -t $Seconds `
  -c:v libx264 -preset ultrafast -crf 18 -pix_fmt yuv420p $Out
