param(
    [Parameter(Mandatory)][int] $TargetProcessId,
    [Parameter(Mandatory)][string] $Title,
    [Parameter(Mandatory)][ValidateSet('lock','unlock','sleep','wake','quit','find')][string] $Signal
)
$ErrorActionPreference = 'Stop'
if (-not ('TimerOSWindows' -as [type])) {
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class TimerOSWindows {
    private delegate bool EnumProc(IntPtr window, IntPtr context);
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumProc callback, IntPtr context);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowText(IntPtr window, StringBuilder title, int size);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessage(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);
    public static IntPtr WindowForProcess(int processId, string expectedTitle) {
        IntPtr result = IntPtr.Zero;
        EnumWindows((window, context) => {
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            if (owner != (uint)processId) return true;
            var title = new StringBuilder(256);
            GetWindowText(window, title, title.Capacity);
            if (title.ToString() != expectedTitle) return true;
            result = window;
            return false;
        }, IntPtr.Zero);
        return result;
    }
}
'@
}

$window = [TimerOSWindows]::WindowForProcess($TargetProcessId, $Title)
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
