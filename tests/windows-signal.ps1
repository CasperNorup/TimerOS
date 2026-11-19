param(
    [Parameter(Mandatory)][int] $TargetProcessId,
    [Parameter(Mandatory)][string] $Title,
    [Parameter(Mandatory)][ValidateSet('lock','unlock','sleep','wake','quit','find','inspect','sample','hotkey','shift','maximize','borderless','taskbar')][string] $Signal,
    [int] $Hotkey = 0
)
$ErrorActionPreference = 'Stop'
if (-not ('TimerOSWindows' -as [type])) {
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class TimerOSWindows {
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    public struct Display { public int Size; public Rect Screen, Work; public int Flags; }
    private delegate bool EnumProc(IntPtr window, IntPtr context);
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumProc callback, IntPtr context);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowText(IntPtr window, StringBuilder title, int size);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessage(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    public static extern IntPtr Style(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    public static extern IntPtr StyleTo(IntPtr window, int index, IntPtr value);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")]
    public static extern bool GetLayeredWindowAttributes(IntPtr window, out uint color, out byte opacity, out uint flags);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr window, IntPtr above, int x, int y, int w, int h, uint flags);
    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool GetMonitorInfo(IntPtr monitor, ref Display display);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam,
        uint flags, uint timeout, out IntPtr result);
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
if ($Signal -eq 'sample') {
    $pending = [Diagnostics.Stopwatch]::StartNew()
    while ($window -eq [IntPtr]::Zero -and $pending.ElapsedMilliseconds -lt 5000) {
        Start-Sleep -Milliseconds 15
        $window = [TimerOSWindows]::WindowForProcess($TargetProcessId, $Title)
    }
    if ($window -eq [IntPtr]::Zero) { throw "Could not sample $Title." }
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $levels = [Collections.Generic.HashSet[int]]::new()
    while ($clock.ElapsedMilliseconds -lt 2600) {
        $alpha = [byte]0
        $key = [uint32]0
        $flags = [uint32]0
        if ([TimerOSWindows]::GetLayeredWindowAttributes($window, [ref]$key, [ref]$alpha, [ref]$flags) -and $alpha -gt 0) {
            [void] $levels.Add($alpha)
        }
        Start-Sleep -Milliseconds 7
    }
    return (@{ levels = $levels.Count; elapsedMs = $clock.ElapsedMilliseconds } | ConvertTo-Json -Compress)
}
if ($Signal -eq 'inspect' -and $window -eq [IntPtr]::Zero) {
    return (@{ found = $false; visible = $false } | ConvertTo-Json -Compress)
}
if ($window -eq [IntPtr]::Zero) { throw "No window found with title $Title." }

$rect = [TimerOSWindows+Rect]::new()
$null = [TimerOSWindows]::GetWindowRect($window, [ref]$rect)
$display = [TimerOSWindows+Display]::new()
$display.Size = [Runtime.InteropServices.Marshal]::SizeOf($display)
$null = [TimerOSWindows]::GetMonitorInfo([TimerOSWindows]::MonitorFromWindow($window, 2), [ref]$display)
if ($Signal -eq 'inspect') {
    $style = [TimerOSWindows]::Style($window, -20).ToInt64()
    $point = ((($rect.Top + 5) -band 65535) -shl 16) -bor (($rect.Left + 5) -band 65535)
    $hit = [IntPtr]::Zero
    $null = [TimerOSWindows]::SendMessageTimeout($window, 0x84, [UIntPtr]::Zero, [IntPtr]::new($point), 2, 500, [ref]$hit)
    $key = [uint32]0
    $alpha = [byte]255
    $flags = [uint32]0
    $null = [TimerOSWindows]::GetLayeredWindowAttributes($window,[ref]$key,[ref]$alpha,[ref]$flags)
    return (@{
        found = $true; visible = [TimerOSWindows]::IsWindowVisible($window); minimized = [TimerOSWindows]::IsIconic($window)
        foreground = [TimerOSWindows]::GetForegroundWindow().ToInt64(); handle = $window.ToInt64()
        transparent = ($style -band 32) -ne 0; topmost = ($style -band 8) -ne 0
        noActivate = ($style -band 0x08000000) -ne 0; layered = ($style -band 0x00080000) -ne 0
        hit = $hit.ToInt64(); opacity = $alpha
        left = $rect.Left; top = $rect.Top; right = $rect.Right; bottom = $rect.Bottom
        workLeft = $display.Work.Left; workTop = $display.Work.Top; workRight = $display.Work.Right; workBottom = $display.Work.Bottom
        screenLeft = $display.Screen.Left; screenTop = $display.Screen.Top; screenRight = $display.Screen.Right; screenBottom = $display.Screen.Bottom
    } | ConvertTo-Json -Compress)
}
switch ($Signal) {
    shift {
        $null = [TimerOSWindows]::SetWindowPos($window, [IntPtr]::Zero, ($display.Work.Left + 55), ($display.Work.Top + 80), 0, 0, 0x0015)
        return
    }
    maximize { $null = [TimerOSWindows]::ShowWindow($window, 3); return }
    borderless {
        $style = [TimerOSWindows]::Style($window, -16).ToInt64() -band (-bnot 0x00CF0000)
        $null = [TimerOSWindows]::StyleTo($window, -16, [IntPtr]::new($style))
        $screen = $display.Screen
        $null = [TimerOSWindows]::SetWindowPos($window, [IntPtr]::Zero, $screen.Left, $screen.Top,
            ($screen.Right - $screen.Left), ($screen.Bottom - $screen.Top), 0x0034)
        return
    }
}

$msg = @{
    lock = @(0x02b1, 0x07)
    unlock = @(0x02b1, 0x08)
    sleep = @(0x0218, 0x04)
    wake = @(0x0218, 0x12)
    quit = @(0x0010, 0)
    hotkey = @(0x0312, $Hotkey)
    taskbar = @(0x0112, 0xF120)
}[$Signal]
if (![TimerOSWindows]::PostMessage($window, $msg[0], [UIntPtr]::new([uint64]$msg[1]), [IntPtr]::Zero)) {
    throw "Could not send $Signal to $Title."
}
