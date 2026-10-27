#requires -version 5.1
param([string]$PortableTestInstallDir)
$ErrorActionPreference = 'Stop'

if ($PortableTestInstallDir) {
    $installDir = [System.IO.Path]::GetFullPath($PortableTestInstallDir)
    $testParent = Split-Path -Parent $installDir
    $tempPrefix = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) 'KYRONEXT-OS-Install-Test-'))
    $marker = Join-Path $testParent '.kx-install-test-marker'
    if (-not $testParent.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath $marker -PathType Leaf) -or
        [System.IO.Path]::GetFileName($installDir) -ne 'InstallTest') {
        throw 'Le mode test est limite a son dossier temporaire isole.'
    }
    if (Test-Path -LiteralPath $installDir) { Remove-Item -LiteralPath $installDir -Recurse -Force }
    if (Test-Path -LiteralPath $installDir) { throw 'Le dossier temporaire de test existe encore.' }
    Write-Output 'Desinstallation de test terminee.'
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
$stateDir = Join-Path $env:LOCALAPPDATA 'KYRONEXT OS'
$configPath = Join-Path $stateDir 'installation.json'
$appDir = Join-Path $env:LOCALAPPDATA 'Programs\KYRONEXT OS'
$createDesktop = $true
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    try {
        $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
        if ($config.installDir) { $appDir = [System.IO.Path]::GetFullPath([string]$config.installDir) }
        if ($null -ne $config.createDesktopShortcut) { $createDesktop = [bool]$config.createDesktopShortcut }
    } catch { }
}
$menuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\KYRONEXT OS'
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'KYRONEXT OS.lnk'
$profileDir = Join-Path $stateDir 'BrowserProfile'
$installMarker = Join-Path $appDir '.kyronext-install.json'

if (Test-Path -LiteralPath $appDir -PathType Container) {
    if (-not (Test-Path -LiteralPath $installMarker -PathType Leaf)) {
        [System.Windows.Forms.MessageBox]::Show('Le dossier ne contient pas la marque KYRONEXT OS attendue. Aucun fichier ne sera supprime.', 'Desinstallation KYRONEXT OS', 'OK', 'Error') | Out-Null
        exit 1
    }
    $identity = Get-Content -LiteralPath $installMarker -Raw | ConvertFrom-Json
    if ($identity.product -ne 'KYRONEXT OS') {
        [System.Windows.Forms.MessageBox]::Show('La marque du dossier ne correspond pas a KYRONEXT OS. Aucun fichier ne sera supprime.', 'Desinstallation KYRONEXT OS', 'OK', 'Error') | Out-Null
        exit 1
    }
}

$answer = [System.Windows.Forms.MessageBox]::Show('Supprimer KYRONEXT OS et ses raccourcis ? Les scores et preferences resteront conserves.', 'Desinstallation KYRONEXT OS', 'YesNo', 'Question')
if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) { exit 0 }
try {
    if (Test-Path -LiteralPath $appDir) { Remove-Item -LiteralPath $appDir -Recurse -Force }
    if (Test-Path -LiteralPath $menuDir) { Remove-Item -LiteralPath $menuDir -Recurse -Force }
    if ($createDesktop -and (Test-Path -LiteralPath $desktopShortcut)) { Remove-Item -LiteralPath $desktopShortcut -Force }
    if (Test-Path -LiteralPath $configPath) { Remove-Item -LiteralPath $configPath -Force }
    $uninstaller = Join-Path $stateDir 'uninstall-kx.ps1'
    if (Test-Path -LiteralPath $uninstaller) { Remove-Item -LiteralPath $uninstaller -Force }
    $removeData = [System.Windows.Forms.MessageBox]::Show('Supprimer aussi les scores et reglages enregistres localement ?', 'Donnees KYRONEXT OS', 'YesNo', 'Question')
    if ($removeData -eq [System.Windows.Forms.DialogResult]::Yes -and (Test-Path -LiteralPath $profileDir)) {
        Remove-Item -LiteralPath $profileDir -Recurse -Force
    }
    if ((Test-Path -LiteralPath $stateDir) -and -not (Get-ChildItem -LiteralPath $stateDir -Force | Select-Object -First 1)) {
        Remove-Item -LiteralPath $stateDir -Force
    }
    [System.Windows.Forms.MessageBox]::Show('KYRONEXT OS a ete retire.', 'Desinstallation terminee', 'OK', 'Information') | Out-Null
} catch {
    [System.Windows.Forms.MessageBox]::Show('Ferme KYRONEXT OS puis relance la desinstallation. ' + $_.Exception.Message, 'Desinstallation incomplete', 'OK', 'Error') | Out-Null
}
