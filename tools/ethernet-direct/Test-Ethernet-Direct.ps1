$ErrorActionPreference='Stop'
. "$PSScriptRoot\Ethernet-Direct.ps1" -LibraryOnly
function Assert($Condition,$Message){if(-not $Condition){throw $Message}}
function Reject([scriptblock]$Action){$failed=$false;try{& $Action}catch{$failed=$true};Assert $failed 'Expected invalid input to be rejected'}
Assert ((IPv4Number '192.168.129.25') -eq 3232268569) 'IPv4 conversion failed'
ValidatePair '192.168.129.25' '192.168.129.26' 23
Assert ((SuggestedLocal '192.168.129.25' 23) -eq '192.168.129.26') 'Suggestion failed'
Assert ((SuggestedLocal '192.168.1.254' 24) -eq '192.168.1.253') 'Broadcast avoidance failed'
Reject {ValidatePair '192.168.1.64' '192.168.2.65' 24}
Reject {ValidatePair '192.168.1.64' '192.168.1.64' 24}
Reject {ValidatePair '192.168.1.0' '192.168.1.2' 24}
Reject {ValidatePair '192.168.1.255' '192.168.1.2' 24}
Reject {ValidatePair '127.0.0.1' '127.0.0.2' 24}
Reject {ValidatePair '192.168.1.1' '192.168.1.2' 31}
Reject {IPv4Number '999.2.3.4'}
Reject {IPv4Number '192.168.1'}
$script:BackupDir=Join-Path $env:TEMP ('ethernet-direct-test-'+[guid]::NewGuid())
New-Item $script:BackupDir -ItemType Directory | Out-Null
$script:Calls=New-Object 'System.Collections.Generic.List[string]'
function Get-NetAdapter {param([switch]$Physical) [pscustomobject]@{InterfaceGuid='test-adapter';InterfaceType=6;MacAddress='AA-BB';ifIndex=777}}
function Set-NetIPInterface {param($InterfaceIndex,$AddressFamily,$Dhcp) $script:Calls.Add("dhcp:$InterfaceIndex`:$Dhcp")}
function Get-NetIPAddress {param($InterfaceIndex,$AddressFamily) [pscustomobject]@{IPAddress='192.168.129.26';PrefixOrigin='Manual'}}
function Remove-NetIPAddress {param([Parameter(ValueFromPipeline=$true)]$InputObject,[switch]$Confirm) process {$script:Calls.Add('remove-ip')}}
function Get-NetRoute {param($InterfaceIndex,$AddressFamily,$DestinationPrefix,$ErrorAction) if($DestinationPrefix -ne '0.0.0.0/0'){[pscustomobject]@{NextHop='0.0.0.0'}}}
function Remove-NetRoute {param([Parameter(ValueFromPipeline=$true)]$InputObject,[switch]$Confirm) process {$script:Calls.Add('remove-app-route')}}
function New-NetIPAddress {param($InterfaceIndex,$IPAddress,$PrefixLength,$SkipAsSource) $script:Calls.Add("ip:$InterfaceIndex`:$IPAddress/$PrefixLength")}
function New-NetRoute {param($InterfaceIndex,$DestinationPrefix,$NextHop,$RouteMetric) $script:Calls.Add("gateway:$InterfaceIndex`:$NextHop")}
function Set-DnsClientServerAddress {param($InterfaceIndex,$ServerAddresses,[switch]$ResetServerAddresses) $script:Calls.Add("dns:$InterfaceIndex`:$ResetServerAddresses")}
try{
 $state=[pscustomobject]@{Guid='test-adapter';Mac='AA-BB';Dhcp='Disabled';Addresses=@([pscustomobject]@{IPAddress='10.5.0.7';PrefixLength=24;SkipAsSource=$false});Gateways=@([pscustomobject]@{NextHop='10.5.0.1';RouteMetric=20});StaticDns='1.1.1.1';Dns=@('1.1.1.1');AppRoutes=@('192.168.129.25/32')}
 WriteState $state
 RestoreState $state
 Assert ($script:Calls.Contains('ip:777:10.5.0.7/24')) 'Static IP not restored'
 Assert ($script:Calls.Contains('gateway:777:10.5.0.1')) 'Gateway not restored'
 Assert ($script:Calls.Contains('remove-app-route')) 'Application route not removed'
 Assert (-not(Test-Path (BackupPath $state.Guid))) 'Backup must be removed only after restoration'
 $state.Dhcp='Enabled';$state.Addresses=@();$state.Gateways=@();$state.StaticDns='';$state.Dns=@()
 WriteState $state;RestoreState $state
 Assert ($script:Calls.Contains('dhcp:777:Enabled')) 'DHCP not restored'
 Assert ($script:Calls.Contains('dns:777:True')) 'Automatic DNS not restored'
 $state.Mac='DIFFERENT';WriteState $state
 Reject {RestoreState $state}
 Assert (Test-Path (BackupPath $state.Guid)) 'Failure must preserve backup'
 Write-Output 'PASS: IPv4 validation, suggestions, selected-interface restoration, DHCP/DNS, backups and identity checks (mocked; no real adapter changed).'
}finally{Remove-Item $script:BackupDir -Recurse -Force}
