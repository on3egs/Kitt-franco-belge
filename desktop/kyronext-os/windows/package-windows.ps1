#requires -version 5.1
[CmdletBinding()]
param([switch]$Overwrite)
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$sourceDir = Join-Path $repoRoot 'client\public\kyronext-os'
$downloadDir = Join-Path $sourceDir 'downloads'
$installerOut = Join-Path $downloadDir 'KYRONEXT-OS-Windows11-Setup.exe'
$infoOut = Join-Path $sourceDir 'windows\download-info.json'
$artSource = Join-Path $sourceDir 'windows\assets\kyronext-kitt-installer-art.png'
$bootstrapSource = Join-Path $PSScriptRoot 'installer-bootstrap.cs'
$compilerCandidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

if (-not $compiler) { throw 'Le compilateur C# .NET Framework est introuvable.' }
if (-not (Test-Path -LiteralPath $sourceDir -PathType Container)) { throw "Dossier KYRONEXT OS introuvable : $sourceDir" }
if (-not (Test-Path -LiteralPath $artSource -PathType Leaf)) { throw "Image d'installation introuvable : $artSource" }
if (-not (Test-Path -LiteralPath $bootstrapSource -PathType Leaf)) { throw "Source de l'installateur introuvable : $bootstrapSource" }
if ((Test-Path -LiteralPath $installerOut) -and -not $Overwrite) { throw "Installateur déjà présent; utilise -Overwrite après vérification : $installerOut" }

$requiredAppFiles = @('index.html', 'beep.wav', 'kyronext-favicon.svg', 'kyronext-knight-v2.webp', 'kyronext-games.css', 'kyronext-games.js')
foreach ($name in $requiredAppFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourceDir $name) -PathType Leaf)) { throw "Fichier KYRONEXT OS manquant : $name" }
}
if (-not (Test-Path -LiteralPath (Join-Path $sourceDir 'audio\guy-greetings') -PathType Container)) { throw 'Les messages audio Guy sont manquants.' }

$buildRoot = Join-Path $env:TEMP ('KYRONEXT-OS-Windows-' + [guid]::NewGuid().ToString('N'))
$payloadRoot = Join-Path $buildRoot 'payload'
$appRoot = Join-Path $payloadRoot 'app'
$bootstrapRoot = Join-Path $buildRoot 'bootstrap'
New-Item -ItemType Directory -Path $appRoot, $bootstrapRoot, $downloadDir -Force | Out-Null

try {
    foreach ($name in $requiredAppFiles) { Copy-Item -LiteralPath (Join-Path $sourceDir $name) -Destination $appRoot }
    Copy-Item -LiteralPath (Join-Path $sourceDir 'audio') -Destination $appRoot -Recurse
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'launch-kx.vbs') -Destination $payloadRoot

    $appIndex = Join-Path $appRoot 'index.html'
    $html = [System.IO.File]::ReadAllText($appIndex, [System.Text.Encoding]::UTF8)
    $html = [regex]::Replace($html, '(?is)<link\s+rel="stylesheet"\s+href="/site-assets/cockpit\.css[^"]*"\s*/?>\s*', '')
    $html = [regex]::Replace($html, '(?is)<script\s+src="/site-assets/cockpit\.js[^"]*"[^>]*>\s*</script>\s*', '')
    $html = [regex]::Replace($html, '(?is)<a\b[^>]*class="kxDesktopLink"[^>]*>.*?</a>\s*', '')
    if ($html -match '/site-assets/' -or $html -match '(?is)<script[^>]+src="https?://') { throw 'La copie autonome du cockpit contient encore une dépendance externe.' }
    [System.IO.File]::WriteAllText($appIndex, $html, [System.Text.UTF8Encoding]::new($false))

    $readme = @'
KYRONEXT OS - BY MANIX
En collaboration avec le groupe Facebook KITT-FRANCO-BELGE

Application locale pour Windows 11 64 bits.
Microsoft Edge ouvre le cockpit dans une fenêtre dédiée.
Aucun Jetson/AGX, serveur, compte ou accès Internet ne sont requis.
Les scores sont enregistrés dans le profil Edge séparé de KYRONEXT OS.
'@
    [System.IO.File]::WriteAllText((Join-Path $appRoot 'LISEZ-MOI.txt'), $readme, [System.Text.UTF8Encoding]::new($false))

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $payloadZip = Join-Path $bootstrapRoot 'payload.zip'
    [System.IO.Compression.ZipFile]::CreateFromDirectory($payloadRoot, $payloadZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
    foreach ($scriptName in @('installer-gui.ps1', 'installer-core.ps1', 'uninstall-kx.ps1')) {
        $scriptText = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot $scriptName), [System.Text.Encoding]::UTF8)
        [System.IO.File]::WriteAllText((Join-Path $bootstrapRoot $scriptName), $scriptText, [System.Text.UTF8Encoding]::new($true))
    }
    Copy-Item -LiteralPath $artSource -Destination (Join-Path $bootstrapRoot 'kyronext-kitt-installer-art.png')
    $bootstrapZip = Join-Path $buildRoot 'bootstrap.zip'
    [System.IO.Compression.ZipFile]::CreateFromDirectory($bootstrapRoot, $bootstrapZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

    $arguments = @(
        '/nologo', '/target:winexe', '/platform:x64', '/optimize+',
        '/reference:System.Windows.Forms.dll',
        '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll',
        ('/resource:"' + $bootstrapZip + '",KYRONEXT.Bootstrap.zip'),
        ('/out:"' + $installerOut + '"'),
        ('"' + $bootstrapSource + '"')
    ) -join ' '
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $compiler
    $start.Arguments = $arguments
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    if (-not $process.Start()) { throw 'Le compilateur C# n’a pas démarré.' }
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($stdout) { Write-Output $stdout.Trim() }
    if ($stderr) { Write-Output $stderr.Trim() }
    if ($process.ExitCode -ne 0) { throw "La compilation de l’installateur a échoué (code $($process.ExitCode)). Dossier conservé : $buildRoot" }
    if (-not (Test-Path -LiteralPath $installerOut -PathType Leaf)) { throw "L’installateur n’a pas été créé : $installerOut" }

    $item = Get-Item -LiteralPath $installerOut
    if ($item.Length -lt 1000000) { throw "L’installateur paraît incomplet ($($item.Length) octets). Dossier conservé : $buildRoot" }
    $hash = (Get-FileHash -LiteralPath $installerOut -Algorithm SHA256).Hash.ToLowerInvariant()
    $info = [ordered]@{
        file = 'KYRONEXT-OS-Windows11-Setup.exe'
        platform = 'Windows 11 x64'
        sizeBytes = [long]$item.Length
        sizeFormatted = ('{0:N2} Mio' -f ($item.Length / 1MB))
        sha256 = $hash
        signed = $false
    }
    $info | ConvertTo-Json | Set-Content -LiteralPath $infoOut -Encoding UTF8

    Write-Output ('Installateur : ' + $installerOut)
    Write-Output ('Taille : ' + $info.sizeFormatted + ' (' + $info.sizeBytes + ' octets)')
    Write-Output ('SHA-256 : ' + $info.sha256)
    Write-Output 'Signature numérique : absente'
    Remove-Item -LiteralPath $buildRoot -Recurse -Force
}
catch {
    if (Test-Path -LiteralPath $installerOut) { Remove-Item -LiteralPath $installerOut -Force }
    throw
}
