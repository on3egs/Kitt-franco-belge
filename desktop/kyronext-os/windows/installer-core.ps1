#requires -version 5.1
param(
    [Parameter(Mandatory = $true)][string]$PayloadZip,
    [Parameter(Mandatory = $true)][string]$InstallDir,
    [Parameter(Mandatory = $true)][bool]$CreateDesktop,
    [switch]$PortableTest
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $PayloadZip -PathType Leaf)) { throw 'Archive KYRONEXT OS manquante.' }
if ([string]::IsNullOrWhiteSpace($InstallDir)) { throw 'Choisis un dossier d installation.' }
$installDir = [System.IO.Path]::GetFullPath($InstallDir)
$installParent = Split-Path -Parent $installDir

if ($PortableTest) {
    $testPrefix = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) 'KYRONEXT-OS-Install-Test-'))
    if (-not $installDir.StartsWith($testPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Le test portable est limite a un dossier KYRONEXT-OS-Install-Test-* temporaire.'
    }
    New-Item -ItemType Directory -Path $installParent -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $installParent '.kx-install-test-marker') -Value 'KYRONEXT OS isolated package test' -Encoding ASCII
    Expand-Archive -LiteralPath $PayloadZip -DestinationPath $installDir -Force
    if (-not (Test-Path -LiteralPath (Join-Path $installDir 'app\index.html') -PathType Leaf)) { throw 'Cockpit absent de l archive.' }
    if (-not (Test-Path -LiteralPath (Join-Path $installDir 'launch-kx.vbs') -PathType Leaf)) { throw 'Lanceur Edge absent de l archive.' }
    Write-Output ('Installation de test extraite dans : ' + $installDir)
    return
}

$edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edge)) { $edge = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe' }
if (-not (Test-Path -LiteralPath $edge)) { throw 'Microsoft Edge est requis et est introuvable sur ce PC.' }

$installMarker = Join-Path $installDir '.kyronext-install.json'
if ((Test-Path -LiteralPath $installDir -PathType Container) -and
    (Get-ChildItem -LiteralPath $installDir -Force | Select-Object -First 1) -and
    -not (Test-Path -LiteralPath $installMarker -PathType Leaf)) {
    throw 'Le dossier choisi contient des fichiers qui ne sont pas marques comme une installation KYRONEXT OS.'
}

$stateDir = Join-Path $env:LOCALAPPDATA 'KYRONEXT OS'
$startMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\KYRONEXT OS'
$uninstaller = Join-Path $stateDir 'uninstall-kx.ps1'
$shortcutDesktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'KYRONEXT OS.lnk'
$shortcutStart = Join-Path $startMenuDir 'KYRONEXT OS.lnk'
$shortcutUninstall = Join-Path $startMenuDir 'Desinstaller KYRONEXT OS.lnk'

New-Item -ItemType Directory -Path $installParent, $stateDir, $startMenuDir -Force | Out-Null
Expand-Archive -LiteralPath $PayloadZip -DestinationPath $installDir -Force
$appIndex = Join-Path $installDir 'app\index.html'
$launcher = Join-Path $installDir 'launch-kx.vbs'
if (-not (Test-Path -LiteralPath $appIndex -PathType Leaf)) { throw 'Cockpit KYRONEXT OS absent du paquet.' }
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'Lanceur Edge absent du paquet.' }

[ordered]@{ product = 'KYRONEXT OS'; installedBy = 'By Manix' } | ConvertTo-Json | Set-Content -LiteralPath $installMarker -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall-kx.ps1') -Destination $uninstaller -Force
[ordered]@{ installDir = $installDir; createDesktopShortcut = [bool]$CreateDesktop } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDir 'installation.json') -Encoding UTF8

$shell = New-Object -ComObject WScript.Shell
foreach ($shortcutPath in @($shortcutStart, $(if ($CreateDesktop) { $shortcutDesktop } else { $null }))) {
    if (-not $shortcutPath) { continue }
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
    $shortcut.Arguments = '"' + $launcher + '"'
    $shortcut.WorkingDirectory = $installDir
    $shortcut.Description = 'KYRONEXT OS - By Manix - KITT-FRANCO-BELGE'
    $shortcut.IconLocation = $edge + ',0'
    $shortcut.Save()
}
$uninstallShortcut = $shell.CreateShortcut($shortcutUninstall)
$uninstallShortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$uninstallShortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $uninstaller + '"'
$uninstallShortcut.WorkingDirectory = $stateDir
$uninstallShortcut.Description = 'Desinstaller KYRONEXT OS'
$uninstallShortcut.Save()

Write-Output ('KYRONEXT OS installe dans : ' + $installDir)
