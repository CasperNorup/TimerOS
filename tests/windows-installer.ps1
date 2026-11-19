param(
    [Parameter(Mandatory)][string] $Installer,
    [string] $PreviousInstaller
)

$ErrorActionPreference = 'Stop'
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$version = (Get-Content -LiteralPath src-tauri/tauri.conf.json -Raw | ConvertFrom-Json).version
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'TimerOS.lnk'

if ($PreviousInstaller) {
    $previousPath = (Resolve-Path -LiteralPath $PreviousInstaller).Path
    $previous = Start-Process -FilePath $previousPath -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
    if ($previous.ExitCode -ne 0) { throw "TimerOS 0.1.3 fixture installer exited with $($previous.ExitCode)." }
    $fixtureDir = Join-Path $env:APPDATA 'com.caspernorup.timeros'
    New-Item -Path $fixtureDir -ItemType Directory -Force | Out-Null
    $fixture = Join-Path $fixtureDir 'workspace.json'
    $state = '{"version":1,"presets":[{"id":"custom-1","routine":{"name":"Upgrade fixture","kind":"countdown","focus":12,"short":5,"long":15,"longEvery":4,"autoBreak":true,"autoFocus":true,"goal":{"kind":"open"}}}],"nextPreset":2,"lastPreset":"custom-1","policies":{"lock":"continue","sleep":"pause","quit":"continue"},"session":null,"result":null,"transition":null,"checkpoint":0}'
    Set-Content -LiteralPath $fixture -Value $state -Encoding utf8NoBOM
    $originalHash = (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash
}

$install = Start-Process -FilePath $installerPath -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "TimerOS installer exited with $($install.ExitCode)." }

$uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$entries = @(Get-ChildItem -LiteralPath $uninstallRoot |
    Get-ItemProperty | Where-Object DisplayName -eq 'TimerOS')
if ($entries.Count -ne 1 -or $entries[0].DisplayVersion -ne $version) {
    throw "Expected one per-user TimerOS installation at version $version."
}
if (!(Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { throw 'Missing TimerOS Start menu shortcut.' }
if ($PreviousInstaller -and (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash -ne $originalHash) {
    throw 'The upgrade changed the previous workspace data.'
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$executable = $shortcut.TargetPath
if (!(Test-Path -LiteralPath $executable -PathType Leaf) -or (Split-Path -Leaf $executable) -ne 'timeros.exe') {
    throw 'The TimerOS Start menu shortcut does not resolve to the installed executable.'
}

Add-Type -AssemblyName System.Drawing
$actual = [System.Drawing.Icon]::ExtractAssociatedIcon($executable).ToBitmap()
$iconPath = (Resolve-Path -LiteralPath 'src-tauri/icons/icon.ico').Path
$canonicalIcon = [System.Drawing.Icon]::new($iconPath, $actual.Width, $actual.Height)
$expected = $canonicalIcon.ToBitmap()
$matches = 0
for ($y = 0; $y -lt $actual.Height; $y++) {
    for ($x = 0; $x -lt $actual.Width; $x++) {
        $a = $actual.GetPixel($x, $y)
        $b = $expected.GetPixel($x, $y)
        $colorDifference = [Math]::Abs([int]$a.R - $b.R) +
            [Math]::Abs([int]$a.G - $b.G) + [Math]::Abs([int]$a.B - $b.B)
        $alphaDifference = [Math]::Abs([int]$a.A - $b.A)
        if ($alphaDifference -le 32 -and (($a.A -lt 32 -and $b.A -lt 32) -or $colorDifference -le 60)) {
            $matches++
        }
    }
}
$ratio = $matches / ($actual.Width * $actual.Height)
$actual.Dispose()
$canonicalIcon.Dispose()
$expected.Dispose()
if ($ratio -lt .8) { throw "Installed executable icon differs from the official TimerOS icon ($ratio match)." }

$application = Start-Process -FilePath $executable -PassThru -WindowStyle Hidden -WorkingDirectory (Split-Path -Parent $executable)
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        if ($application.HasExited) { throw "Installed TimerOS exited with $($application.ExitCode)." }
        if (./tests/windows-signal.ps1 -TargetProcessId $application.Id -Title 'TimerOS' -Signal find) { break }
        if ([DateTime]::UtcNow -gt $deadline) { throw 'The installed TimerOS window did not open.' }
        Start-Sleep -Milliseconds 300
    } while ($true)
    ./tests/windows-signal.ps1 -TargetProcessId $application.Id -Title 'TimerOS' -Signal quit
    if (!$application.WaitForExit(10000) -or $application.ExitCode -ne 0) {
        throw 'Installed TimerOS did not close cleanly.'
    }
} finally {
    if (!$application.HasExited) { Stop-Process -Id $application.Id }
}

Write-Host "Verified the TimerOS $version per-user install, Start menu shortcut, app icon, and launch."
if ($PreviousInstaller) { Write-Host 'Verified an in-place upgrade from 0.1.3 preserved the previous workspace.' }
Write-Host "SHA-256: $((Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash)"
