$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\native-registration.ps1')
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('codearena-registration-'+[guid]::NewGuid().ToString('N'))
$current=Join-Path $fixture 'books\gesp-lab-extension'
$legacy=Join-Path $fixture 'extension'
New-Item -Path (Join-Path $current 'native-host'),(Join-Path $legacy 'native-host') -ItemType Directory -Force | Out-Null
Set-Content -LiteralPath (Join-Path $current 'manifest.json') -Value '{}'
$oldId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
$explicitId='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
@{allowed_origins=@("chrome-extension://$oldId/",'https://untrusted.invalid/','chrome-extension://*/')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $legacy 'native-host\com.codearena.cpp_judge.json')
$expectedId=Get-CodeArenaExtensionId $current
if($expectedId -cnotmatch '^[a-p]{32}$'){throw 'Invalid unpacked extension ID'}
$origins=@(Get-CodeArenaNativeOrigins -ExtensionRoot $current -ExtensionId $explicitId)
if($origins.Count -ne 3 -or "chrome-extension://$expectedId/" -notin $origins -or "chrome-extension://$oldId/" -notin $origins -or "chrome-extension://$explicitId/" -notin $origins){throw 'Migration origins were not preserved or invalid origins accepted'}
$deduplicated=@(Get-CodeArenaNativeOrigins -ExtensionRoot $current -ExtensionId $expectedId)
if($deduplicated.Count -ne 2){throw 'Duplicate extension origins'}
Write-Output 'PASS: current unpacked ID, explicit ID, migration origin, invalid origins and deduplication.'

$physics=Join-Path $fixture 'books\physics-lab-extension'
New-Item -Path $physics -ItemType Directory -Force | Out-Null
Set-Content -LiteralPath (Join-Path $physics 'manifest.json') -Value '{"permissions":["nativeMessaging"]}'
$physicsId=Get-CodeArenaExtensionId $physics
$shared=@(Get-CodeArenaNativeOrigins -ExtensionRoot $current -ExtensionId $expectedId)
if($shared.Count -ne 3 -or "chrome-extension://$physicsId/" -notin $shared){throw 'Sibling physics extension cannot start the shared service'}
Write-Output 'PASS: sibling physics origin added without losing existing registrations.'
