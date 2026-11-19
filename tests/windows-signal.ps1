param(
    [Parameter(Mandatory)][string] $Title,
    [Parameter(Mandatory)][ValidateSet('lock','unlock','sleep','wake','quit','find')][string] $Signal
)
$ErrorActionPreference = 'Stop'
if (-not ('TimerOSWindows' -as [type])) {
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TimerOSWindows {
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr FindWindow(string className, string windowName);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessage(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);
}
'@
}

$window = [TimerOSWindows]::FindWindow($null, $Title)
if ($Signal -eq 'find') { return $window -ne [IntPtr]::Zero }
if ($window -eq [IntPtr]::Zero) { throw "No window found with title $Title." }

$msg = @{
    lock = @(0x02b1, 0x07)
    unlock = @(0x02b1, 0x08)
    sleep = @(0x0218, 0x04)
    wake = @(0x0218, 0x12)
    quit = @(0x0010, 0)
}[$Signal]
if (![TimerOSWindows]::PostMessage($window, $msg[0], [UIntPtr]::new([uint64]$msg[1]), [IntPtr]::Zero)) {
    throw "Could not send $Signal to $Title."
}
