$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$buildDir = Join-Path $PSScriptRoot 'build'
$publicDir = Join-Path $repoRoot 'client\public\downloads'
$iconPath = Join-Path $buildDir 'manix-voice-studio.ico'
$outputPath = Join-Path $publicDir 'ManixVoiceStudioSetup.exe'
New-Item -ItemType Directory -Force $buildDir, $publicDir | Out-Null
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path $csc)) { throw 'Le compilateur .NET Framework n’est pas installé.' }

$iconSource = @"
using System.Drawing;
class MakeIcon {
 static void Main(string[] a) {
  using (var bmp=new Bitmap(64,64)) using (var g=Graphics.FromImage(bmp)) {
   g.Clear(Color.FromArgb(8,12,19)); g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
   using(var b=new SolidBrush(Color.FromArgb(220,24,45))) g.FillEllipse(b,4,20,56,24);
   using(var b=new SolidBrush(Color.FromArgb(255,90,100))) g.FillEllipse(b,11,25,42,14);
   using(var p=new Pen(Color.FromArgb(255,210,75),2)) { g.DrawLine(p,9,47,55,47); g.DrawLine(p,14,52,50,52); }
   using (var icon=Icon.FromHandle(bmp.GetHicon())) using (var stream=System.IO.File.Create(a[0])) icon.Save(stream);
  }
 }
}
"@
$iconCs = Join-Path $buildDir 'MakeIcon.cs'
$iconExe = Join-Path $buildDir 'MakeIcon.exe'
Set-Content -Path $iconCs -Value $iconSource -Encoding UTF8
& $csc /nologo /target:exe ('/out:' + $iconExe) /r:System.Drawing.dll $iconCs
if ($LASTEXITCODE -ne 0) { throw 'Échec de création de l’icône.' }
& $iconExe $iconPath
if ($LASTEXITCODE -ne 0) { throw 'Échec de création de l’icône.' }
& $csc /nologo /target:winexe /platform:anycpu /optimize+ ('/win32icon:' + $iconPath) ('/out:' + $outputPath) /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:Microsoft.CSharp.dll (Join-Path $PSScriptRoot 'ManixVoiceStudioSetup.cs')
if ($LASTEXITCODE -ne 0) { throw 'Échec de compilation de l’installateur.' }

$testRoot = Join-Path $env:TEMP ('ManixVoiceStudioSmoke-' + [guid]::NewGuid().ToString('N'))
try {
  $process = Start-Process -FilePath $outputPath -ArgumentList @('--smoke-install', ('"' + $testRoot + '"')) -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) { throw "Test d’installation sans registre échoué (code $($process.ExitCode))." }
  $installedExe = Join-Path $testRoot 'ManixVoiceStudio.exe'
  if (!(Test-Path $installedExe)) { throw 'Le fichier installé est manquant.' }
  $hashOriginal = (Get-FileHash $outputPath -Algorithm SHA256).Hash
  $hashInstalled = (Get-FileHash $installedExe -Algorithm SHA256).Hash
  if ($hashOriginal -ne $hashInstalled) { throw 'La copie installée ne correspond pas à l’installateur.' }
  Write-Host "Installateur construit et copie vérifiée. SHA256 $hashOriginal"
} finally {
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
