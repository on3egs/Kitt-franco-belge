#requires -Version 5.1
param([switch]$LibraryOnly)
$ErrorActionPreference = 'Stop'
function IPv4Number([string]$Value) {
    $ip = $null
    if ($Value -notmatch '^\d{1,3}(\.\d{1,3}){3}$' -or -not [Net.IPAddress]::TryParse($Value,[ref]$ip)) { throw 'Adresse IPv4 invalide.' }
    $b=$ip.GetAddressBytes()
    return [uint64]$b[0]*16777216+[uint64]$b[1]*65536+[uint64]$b[2]*256+[uint64]$b[3]
}
function ValidatePair([string]$Target,[string]$Local,[int]$Prefix) {
    if ($Prefix -lt 1 -or $Prefix -gt 30) { throw 'Le préfixe doit être compris entre 1 et 30.' }
    $t=IPv4Number $Target; $l=IPv4Number $Local
    $size=[uint64][Math]::Pow(2,32-$Prefix)
    $net=[uint64]([Math]::Floor($t/$size)*$size)
    foreach($n in @($t,$l)) {
        if ($n -le $net -or $n -ge ($net+$size-1)) { throw 'Une adresse réseau ou de diffusion ne peut pas être utilisée.' }
        if ($n -lt 16777216 -or $n -ge 3758096384 -or [Math]::Floor($n/16777216) -eq 127) { throw 'Adresse IPv4 non utilisable pour cette liaison.' }
    }
    if ($t -eq $l) { throw 'Le PC et l''appareil doivent avoir des adresses différentes.' }
}
function SuggestedLocal([string]$Target,[int]$Prefix) {
    $t=IPv4Number $Target; $size=[uint64][Math]::Pow(2,32-$Prefix)
    $net=[uint64]([Math]::Floor($t/$size)*$size)
    $n=$t+1; if($n -ge $net+$size-1){$n=$t-1}
    return '{0}.{1}.{2}.{3}' -f ([Math]::Floor($n/16777216)%256),([Math]::Floor($n/65536)%256),([Math]::Floor($n/256)%256),($n%256)
}
function Adapter([string]$Guid) {
    $a=Get-NetAdapter -Physical | Where-Object { [string]$_.InterfaceGuid -eq $Guid -and $_.InterfaceType -eq 6 }
    if(@($a).Count -ne 1){throw 'La carte Ethernet sauvegardée est absente. Aucun réglage modifié.'}
    return $a
}
function BackupPath([string]$Guid) { Join-Path $script:BackupDir ($Guid.Trim('{}')+'.json') }
function SaveState($Adapter) {
    $path=BackupPath ([string]$Adapter.InterfaceGuid)
    if(Test-Path $path){return Get-Content $path -Raw | ConvertFrom-Json}
    $idx=$Adapter.ifIndex
    $reg=Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\'+$Adapter.InterfaceGuid)
    $state=[pscustomobject]@{
        Version=1; Guid=[string]$Adapter.InterfaceGuid; Name=$Adapter.Name; Mac=$Adapter.MacAddress
        Dhcp=[string](Get-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4).Dhcp
        Addresses=@(Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 | Where-Object PrefixOrigin -eq Manual | Select-Object IPAddress,PrefixLength,SkipAsSource)
        Gateways=@(Get-NetRoute -InterfaceIndex $idx -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Where-Object Protocol -eq NetMgmt | Select-Object NextHop,RouteMetric)
        StaticDns=[string]$reg.NameServer
        Dns=@((Get-DnsClientServerAddress -InterfaceIndex $idx -AddressFamily IPv4).ServerAddresses)
        AppRoutes=@(); Created=(Get-Date).ToString('o')
    }
    WriteState $state
    return $state
}
function WriteState($State) {
    $path=BackupPath $State.Guid
    $State | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ($path+'.tmp') -Encoding UTF8
    Move-Item -LiteralPath ($path+'.tmp') -Destination $path -Force
}
function ClearManual($Idx) {
    Get-NetRoute -InterfaceIndex $Idx -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false
    Get-NetIPAddress -InterfaceIndex $Idx -AddressFamily IPv4 | Where-Object PrefixOrigin -eq Manual | Remove-NetIPAddress -Confirm:$false
}
function RemoveAppRoutes($State,$Idx) {
    foreach($route in @($State.AppRoutes)) {
        Get-NetRoute -InterfaceIndex $Idx -AddressFamily IPv4 -DestinationPrefix $route -ErrorAction SilentlyContinue | Where-Object NextHop -eq '0.0.0.0' | Remove-NetRoute -Confirm:$false
    }
}
function RestoreState($State) {
    $a=Adapter $State.Guid
    if($a.MacAddress -ne $State.Mac){throw 'La carte ne correspond pas à la sauvegarde.'}
    $idx=$a.ifIndex
    RemoveAppRoutes $State $idx
    Set-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -Dhcp Disabled
    ClearManual $idx
    foreach($ip in @($State.Addresses)) {
        New-NetIPAddress -InterfaceIndex $idx -IPAddress $ip.IPAddress -PrefixLength $ip.PrefixLength -SkipAsSource ([bool]$ip.SkipAsSource) | Out-Null
    }
    foreach($gw in @($State.Gateways)) {
        New-NetRoute -InterfaceIndex $idx -DestinationPrefix '0.0.0.0/0' -NextHop $gw.NextHop -RouteMetric $gw.RouteMetric | Out-Null
    }
    if($State.StaticDns -and @($State.Dns).Count){Set-DnsClientServerAddress -InterfaceIndex $idx -ServerAddresses @($State.Dns)}
    else {Set-DnsClientServerAddress -InterfaceIndex $idx -ResetServerAddresses}
    if($State.Dhcp -eq 'Enabled'){Set-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -Dhcp Enabled}
    Remove-Item -LiteralPath (BackupPath $State.Guid)
}
if($LibraryOnly){return}
if($env:OS -ne 'Windows_NT'){throw 'Cet assistant fonctionne sous Windows 10 ou 11.'}
$admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(-not $admin){
    try {Start-Process "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Verb RunAs -ArgumentList ('-NoProfile -STA -ExecutionPolicy Bypass -File "'+$PSCommandPath+'"')}
    catch {Write-Host 'Autorisation administrateur annulée.'}
    exit
}
$script:BackupDir=Join-Path $env:ProgramData 'KITT-Ethernet-Direct'
if(-not(Test-Path $script:BackupDir)){New-Item -Path $script:BackupDir -ItemType Directory | Out-Null}
# Backups can only be changed by administrators and SYSTEM.
$acl=New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @('S-1-5-32-544','S-1-5-18')){
    $identity=New-Object Security.Principal.SecurityIdentifier($sid)
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
}
Set-Acl -LiteralPath $script:BackupDir -AclObject $acl
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$form=New-Object Windows.Forms.Form
$form.Text='Ethernet Direct 1.0 — KITT Franco-Belge';$form.Size=New-Object Drawing.Size(820,770)
$form.MinimumSize=$form.Size;$form.StartPosition='CenterScreen';$form.Font=New-Object Drawing.Font('Segoe UI',10)
$panel=New-Object Windows.Forms.FlowLayoutPanel
$panel.Dock='Fill';$panel.FlowDirection='TopDown';$panel.WrapContents=$false;$panel.AutoScroll=$true;$panel.Padding=New-Object Windows.Forms.Padding(20)
$form.Controls.Add($panel)
function Label([string]$Text){$c=New-Object Windows.Forms.Label;$c.Text=$Text;$c.AutoSize=$true;$c.MaximumSize=New-Object Drawing.Size(740,0);$panel.Controls.Add($c);return $c}
function Field([string]$Text,[string]$Value){$null=Label $Text;$c=New-Object Windows.Forms.TextBox;$c.Width=730;$c.Text=$Value;$panel.Controls.Add($c);return $c}
$null=Label 'Une liaison directe vers une caméra, un mini-PC, un serveur ou un appareil embarqué.'
$null=Label '1. Repérez la carte et entrez l''adresse IPv4 indiquée par le fabricant de votre appareil.'
$cards=New-Object Windows.Forms.ComboBox;$cards.Width=730;$cards.DropDownStyle='DropDownList';$panel.Controls.Add($cards)
$inventory=New-Object Windows.Forms.TextBox;$inventory.Multiline=$true;$inventory.ReadOnly=$true;$inventory.ScrollBars='Vertical';$inventory.Size=New-Object Drawing.Size(730,95);$panel.Controls.Add($inventory)
$target=Field 'Adresse IPv4 de l''appareil à joindre' ''
$prefix=Field 'Préfixe IPv4 (24 = masque 255.255.255.0 ; 23 = 255.255.254.0)' '24'
$local=Field 'Adresse du PC (proposée automatiquement, modifiable)' ''
$url=Field 'Adresse de la page à ouvrir (http:// ou https://, port éventuel)' ''
$null=Label '2. Appliquez uniquement sur la carte Ethernet choisie. Une sauvegarde permet de revenir aux réglages précédents.'
$row=New-Object Windows.Forms.FlowLayoutPanel;$row.Size=New-Object Drawing.Size(740,85);$panel.Controls.Add($row)
function Button([string]$Text){$b=New-Object Windows.Forms.Button;$b.Text=$Text;$b.AutoSize=$true;$b.Height=34;$row.Controls.Add($b);return $b}
$refresh=Button 'Actualiser';$apply=Button 'Configurer la liaison';$test=Button 'Tester / ouvrir';$restore=Button 'Restaurer la carte'
$status=New-Object Windows.Forms.TextBox;$status.Multiline=$true;$status.ReadOnly=$true;$status.ScrollBars='Vertical';$status.Size=New-Object Drawing.Size(730,100);$panel.Controls.Add($status)
function Log([string]$Text){$status.AppendText($Text+[Environment]::NewLine)}
function Selected {
    if($cards.SelectedIndex -lt 0){throw 'Sélectionnez une carte Ethernet.'}
    return Adapter ([string]$script:Adapters[$cards.SelectedIndex].InterfaceGuid)
}
function RefreshCards {
    $keep=$null
    if($cards.SelectedIndex -ge 0 -and $script:Adapters){$keep=[string]$script:Adapters[$cards.SelectedIndex].InterfaceGuid}
    $script:Adapters=@(Get-NetAdapter -Physical | Where-Object InterfaceType -eq 6 | Sort-Object Name)
    $cards.Items.Clear()
    foreach($a in $script:Adapters){$null=$cards.Items.Add(('{0} — {1} — {2}' -f $a.Name,$a.Status,$a.LinkSpeed))}
    if($keep){for($i=0;$i -lt $script:Adapters.Count;$i++){if([string]$script:Adapters[$i].InterfaceGuid -eq $keep){$cards.SelectedIndex=$i;break}}}
    elseif($cards.Items.Count -eq 1){$cards.SelectedIndex=0}
    $inventory.Text=((Get-NetIPConfiguration | ForEach-Object {
        '{0} : {1} | passerelle {2}' -f $_.InterfaceAlias,(@($_.IPv4Address.IPAddress)-join ', '),(@($_.IPv4DefaultGateway.NextHop)-join ', ')
    }) -join [Environment]::NewLine)
    if(-not $cards.Items.Count){Log 'Aucune carte Ethernet physique détectée. Branchez la carte USB/Ethernet, puis actualisez.'}
}
$target.Add_Leave({try{if($target.Text){$local.Text=SuggestedLocal $target.Text ([int]$prefix.Text);if(-not $url.Text){$url.Text='http://'+$target.Text+'/'}}}catch{Log $_.Exception.Message}})
$refresh.Add_Click({try{RefreshCards}catch{Log $_.Exception.Message}})
$apply.Add_Click({
    $state=$null;$started=$false
    try {
        $a=Selected
        ValidatePair $target.Text $local.Text ([int]$prefix.Text)
        if($a.Status -ne 'Up'){throw 'Aucune liaison physique sur cette carte. Vérifiez le câble et l''appareil.'}
        $existing=Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -eq $local.Text -and $_.InterfaceIndex -ne $a.ifIndex}
        if($existing){throw 'Cette adresse du PC est déjà utilisée par une autre carte.'}
        $message="Carte : $($a.Name)`nPC : $($local.Text)/$($prefix.Text)`nAppareil : $($target.Text)`n`nLa carte sélectionnée passera en IPv4 fixe, sans passerelle. Si elle fournit Internet, cette connexion sera interrompue. Continuer ?"
        if([Windows.Forms.MessageBox]::Show($message,'Confirmer la carte','YesNo','Question') -ne 'Yes'){return}
        $state=SaveState $a
        $started=$true
        RemoveAppRoutes $state $a.ifIndex
        $state.AppRoutes=@();WriteState $state
        $started=$true
        Set-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -Dhcp Disabled
        ClearManual $a.ifIndex
        New-NetIPAddress -InterfaceIndex $a.ifIndex -IPAddress $local.Text -PrefixLength ([int]$prefix.Text) | Out-Null
        for($attempt=0;$attempt -lt 10;$attempt++) {
            $current=Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -IPAddress $local.Text
            if($current.AddressState -eq 'Duplicate'){throw 'Adresse du PC déjà utilisée sur la liaison. Choisissez une autre adresse.'}
            if($current.AddressState -eq 'Preferred'){break}
            Start-Sleep -Milliseconds 500
        }
        if($current.AddressState -ne 'Preferred'){throw 'Windows n''a pas validé cette adresse IPv4.'}
        # A specific host route avoids ambiguity when Wi-Fi uses the same subnet.
        $route=$target.Text+'/32'
        $already=Get-NetRoute -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -DestinationPrefix $route -ErrorAction SilentlyContinue
        if(-not $already){$state.AppRoutes=@($route);WriteState $state;New-NetRoute -InterfaceIndex $a.ifIndex -DestinationPrefix $route -NextHop '0.0.0.0' -RouteMetric 1 | Out-Null}
        Log ('Liaison configurée. Sauvegarde conservée : '+(BackupPath $state.Guid))
        RefreshCards
    } catch {
        Log ('Échec : '+$_.Exception.Message)
        if($started -and $state){try{RestoreState $state;Log 'Configuration précédente rétablie.'}catch{Log ('Restauration à relancer : '+$_.Exception.Message)}}
    }
})
$restore.Add_Click({try{
    $a=Selected;$path=BackupPath ([string]$a.InterfaceGuid)
    if(-not(Test-Path $path)){throw 'Aucune sauvegarde pour cette carte.'}
    if([Windows.Forms.MessageBox]::Show(('Restaurer les réglages sauvegardés de '+$a.Name+' ?'),'Restauration','YesNo') -ne 'Yes'){return}
    RestoreState (Get-Content $path -Raw | ConvertFrom-Json)
    Log 'Réglages restaurés. Si DHCP était activé, Windows redemande une adresse au routeur.'
    RefreshCards
}catch{Log $_.Exception.Message}})
$test.Add_Click({try{
    $a=Selected;$n=IPv4Number $target.Text
    $uri=$null
    if(-not[Uri]::TryCreate($url.Text,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -notin @('http','https') -or $uri.Host -ne $target.Text -or $uri.UserInfo){throw 'Entrez une URL HTTP(S) dont l''hôte correspond à l''IPv4 de l''appareil.'}
    $src=Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 | Where-Object {$_.IPAddress -eq $local.Text} | Select-Object -First 1
    if(-not $src){throw 'Configurez d''abord la liaison avec cette adresse du PC.'}
    $client=New-Object Net.Sockets.TcpClient
    try{
        $client.Client.Bind((New-Object Net.IPEndPoint([Net.IPAddress]::Parse($src.IPAddress),0)))
        $pending=$client.BeginConnect($target.Text,$uri.Port,$null,$null)
        if(-not $pending.AsyncWaitHandle.WaitOne(2500)){throw 'Pas de réponse TCP. Vérifiez l''IP, le port, le câble et la configuration de l''appareil.'}
        $client.EndConnect($pending)
    }finally{$client.Close()}
    Log ('Le port '+$uri.Port+' répond sur la liaison sélectionnée. Ouverture du navigateur.')
    Start-Process $uri.AbsoluteUri
}catch{Log $_.Exception.Message}})
RefreshCards
Log 'Aucun réglage modifié au lancement. Les sauvegardes restent disponibles après fermeture.'
$null=$form.ShowDialog()
