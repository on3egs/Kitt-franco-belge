#requires -version 5.1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$payloadZip = Join-Path $PSScriptRoot 'payload.zip'
$coreScript = Join-Path $PSScriptRoot 'installer-core.ps1'
$artPath = Join-Path $PSScriptRoot 'kyronext-kitt-installer-art.png'
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\KYRONEXT OS'

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Installation KYRONEXT OS · By Manix'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size(960, 610)
$form.MinimumSize = $form.Size
$form.MaximumSize = $form.Size
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(8, 11, 13)
$form.ForeColor = [System.Drawing.Color]::FromArgb(239, 239, 232)
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$accent = [System.Drawing.Color]::FromArgb(255, 77, 61)
$muted = [System.Drawing.Color]::FromArgb(166, 181, 187)
$line = [System.Drawing.Color]::FromArgb(54, 68, 74)

$top = New-Object System.Windows.Forms.Panel
$top.Location = New-Object System.Drawing.Point(0, 0)
$top.Size = New-Object System.Drawing.Size(960, 68)
$top.BackColor = [System.Drawing.Color]::FromArgb(13, 15, 17)
$top.BorderStyle = 'FixedSingle'
$form.Controls.Add($top)

$brand = New-Object System.Windows.Forms.Label
$brand.Text = 'KYRONEXT OS  ·  BY MANIX'
$brand.Location = New-Object System.Drawing.Point(22, 13)
$brand.Size = New-Object System.Drawing.Size(650, 27)
$brand.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 17, [System.Drawing.FontStyle]::Bold)
$brand.ForeColor = [System.Drawing.Color]::FromArgb(255, 219, 207)
$top.Controls.Add($brand)

$subBrand = New-Object System.Windows.Forms.Label
$subBrand.Text = 'EN COLLABORATION AVEC LE GROUPE FACEBOOK KITT-FRANCO-BELGE'
$subBrand.Location = New-Object System.Drawing.Point(24, 42)
$subBrand.Size = New-Object System.Drawing.Size(790, 18)
$subBrand.Font = New-Object System.Drawing.Font('Segoe UI', 8)
$subBrand.ForeColor = [System.Drawing.Color]::FromArgb(195, 142, 125)
$top.Controls.Add($subBrand)

$picture = New-Object System.Windows.Forms.PictureBox
$picture.Location = New-Object System.Drawing.Point(20, 88)
$picture.Size = New-Object System.Drawing.Size(450, 285)
$picture.SizeMode = 'Zoom'
$picture.BackColor = [System.Drawing.Color]::Black
$picture.BorderStyle = 'FixedSingle'
if (Test-Path -LiteralPath $artPath) { $picture.Image = [System.Drawing.Image]::FromFile($artPath) }
$form.Controls.Add($picture)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Ton cockpit.`r`nTon PC.`r`nPrêt à démarrer."
$title.Location = New-Object System.Drawing.Point(500, 95)
$title.Size = New-Object System.Drawing.Size(420, 124)
$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 24, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = [System.Drawing.Color]::FromArgb(255, 235, 224)
$form.Controls.Add($title)

$description = New-Object System.Windows.Forms.Label
$description.Text = 'Installe KYRONEXT OS pour Windows 11. Le cockpit et ses jeux fonctionnent localement, sans AGX, sans compte et sans serveur distant.'
$description.Location = New-Object System.Drawing.Point(503, 230)
$description.Size = New-Object System.Drawing.Size(410, 66)
$description.Font = New-Object System.Drawing.Font('Segoe UI', 11)
$description.ForeColor = $muted
$form.Controls.Add($description)

$included = New-Object System.Windows.Forms.Label
$included.Text = 'INCLUS  ·  PAC-MAN 3D  ·  TETRIS  ·  SPACE KNIGHT RIDER  ·  TRON KNIGHT RIDER  ·  BREAKOUT  ·  SIMON'
$included.Location = New-Object System.Drawing.Point(503, 304)
$included.Size = New-Object System.Drawing.Size(415, 43)
$included.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 8, [System.Drawing.FontStyle]::Bold)
$included.ForeColor = [System.Drawing.Color]::FromArgb(236, 187, 101)
$form.Controls.Add($included)

$divider = New-Object System.Windows.Forms.Panel
$divider.Location = New-Object System.Drawing.Point(20, 396)
$divider.Size = New-Object System.Drawing.Size(900, 1)
$divider.BackColor = $line
$form.Controls.Add($divider)

$destinationLabel = New-Object System.Windows.Forms.Label
$destinationLabel.Text = 'DOSSIER D''INSTALLATION'
$destinationLabel.Location = New-Object System.Drawing.Point(22, 410)
$destinationLabel.Size = New-Object System.Drawing.Size(260, 18)
$destinationLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 9, [System.Drawing.FontStyle]::Bold)
$destinationLabel.ForeColor = [System.Drawing.Color]::FromArgb(226, 181, 98)
$form.Controls.Add($destinationLabel)

$destination = New-Object System.Windows.Forms.TextBox
$destination.Text = $installDir
$destination.Location = New-Object System.Drawing.Point(22, 435)
$destination.Size = New-Object System.Drawing.Size(690, 27)
$destination.ReadOnly = $true
$destination.BackColor = [System.Drawing.Color]::FromArgb(19, 23, 25)
$destination.ForeColor = [System.Drawing.Color]::FromArgb(222, 231, 230)
$destination.BorderStyle = 'FixedSingle'
$form.Controls.Add($destination)

$browse = New-Object System.Windows.Forms.Button
$browse.Text = 'CHOISIR…'
$browse.Location = New-Object System.Drawing.Point(724, 434)
$browse.Size = New-Object System.Drawing.Size(102, 29)
$browse.FlatStyle = 'Flat'
$browse.FlatAppearance.BorderColor = $line
$browse.BackColor = [System.Drawing.Color]::FromArgb(19, 27, 31)
$browse.ForeColor = [System.Drawing.Color]::FromArgb(208, 236, 241)
$form.Controls.Add($browse)
$browse.Add_Click({
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Choisis le dossier dans lequel créer KYRONEXT OS.'
    $dialog.SelectedPath = [System.IO.Path]::GetDirectoryName($destination.Text)
    $dialog.ShowNewFolderButton = $true
    if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
        $destination.Text = Join-Path $dialog.SelectedPath 'KYRONEXT OS'
    }
    $dialog.Dispose()
})

$desktopShortcut = New-Object System.Windows.Forms.CheckBox
$desktopShortcut.Text = 'Créer un raccourci sur le Bureau'
$desktopShortcut.Checked = $true
$desktopShortcut.AutoSize = $true
$desktopShortcut.Location = New-Object System.Drawing.Point(24, 474)
$desktopShortcut.ForeColor = $muted
$form.Controls.Add($desktopShortcut)

$status = New-Object System.Windows.Forms.Label
$status.Text = 'Installation par utilisateur · aucun droit administrateur requis.'
$status.Location = New-Object System.Drawing.Point(22, 512)
$status.Size = New-Object System.Drawing.Size(580, 24)
$status.ForeColor = $muted
$status.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$form.Controls.Add($status)

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Location = New-Object System.Drawing.Point(622, 513)
$progress.Size = New-Object System.Drawing.Size(296, 18)
$progress.Style = 'Blocks'
$form.Controls.Add($progress)

$install = New-Object System.Windows.Forms.Button
$install.Text = 'INSTALLER KYRONEXT OS'
$install.Location = New-Object System.Drawing.Point(612, 548)
$install.Size = New-Object System.Drawing.Size(206, 40)
$install.FlatStyle = 'Flat'
$install.FlatAppearance.BorderColor = $accent
$install.BackColor = [System.Drawing.Color]::FromArgb(137, 31, 24)
$install.ForeColor = [System.Drawing.Color]::White
$install.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($install)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = 'ANNULER'
$cancel.Location = New-Object System.Drawing.Point(828, 548)
$cancel.Size = New-Object System.Drawing.Size(92, 40)
$cancel.FlatStyle = 'Flat'
$cancel.FlatAppearance.BorderColor = $line
$cancel.BackColor = [System.Drawing.Color]::FromArgb(19, 23, 25)
$cancel.ForeColor = [System.Drawing.Color]::FromArgb(201, 214, 216)
$form.Controls.Add($cancel)
$cancel.Add_Click({ $form.Close() })

$launch = New-Object System.Windows.Forms.Button
$launch.Text = 'OUVRIR KYRONEXT OS'
$launch.Location = New-Object System.Drawing.Point(612, 548)
$launch.Size = New-Object System.Drawing.Size(206, 40)
$launch.FlatStyle = 'Flat'
$launch.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(58, 157, 106)
$launch.BackColor = [System.Drawing.Color]::FromArgb(19, 92, 59)
$launch.ForeColor = [System.Drawing.Color]::White
$launch.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10, [System.Drawing.FontStyle]::Bold)
$launch.Visible = $false
$form.Controls.Add($launch)
$launch.Add_Click({
    $wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
    $launcher = Join-Path $destination.Text 'launch-kx.vbs'
    Start-Process -FilePath $wscript -ArgumentList ('"' + $launcher + '"')
    $form.Close()
})

$install.Add_Click({
    $install.Enabled = $false
    $browse.Enabled = $false
    $cancel.Enabled = $false
    $progress.Style = 'Marquee'
    $progress.MarqueeAnimationSpeed = 24
    $status.Text = 'Copie des fichiers et création des raccourcis…'
    $status.ForeColor = [System.Drawing.Color]::FromArgb(255, 198, 121)
    $form.UseWaitCursor = $true
    $form.Refresh()
    try {
        if (-not (Test-Path -LiteralPath $payloadZip)) { throw 'Le contenu intégré de KYRONEXT OS est introuvable.' }
        if (-not (Test-Path -LiteralPath $coreScript)) { throw 'Le programme d''installation local est introuvable.' }
        & $coreScript -PayloadZip $payloadZip -InstallDir $destination.Text -CreateDesktop:$desktopShortcut.Checked
        $progress.Style = 'Blocks'
        $progress.Value = 100
        $status.Text = 'Installation terminée · raccourci ajouté au menu Démarrer.'
        $status.ForeColor = [System.Drawing.Color]::FromArgb(103, 231, 151)
        $install.Visible = $false
        $launch.Visible = $true
        $cancel.Enabled = $true
        $launch.Focus()
    } catch {
        $progress.Style = 'Blocks'
        $progress.Value = 0
        $status.Text = 'Échec : ' + $_.Exception.Message
        $status.ForeColor = [System.Drawing.Color]::FromArgb(255, 123, 109)
        $install.Enabled = $true
        $browse.Enabled = $true
        $cancel.Enabled = $true
        [System.Windows.Forms.MessageBox]::Show($form, $_.Exception.Message, 'Installation KYRONEXT OS', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    } finally {
        $form.UseWaitCursor = $false
    }
})

$form.Add_FormClosed({ if ($picture.Image) { $picture.Image.Dispose() } })
[System.Windows.Forms.Application]::Run($form)
