# Match Chromium's GenerateIdForPath on Windows (UTF-16 path, uppercase drive).
# https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/crx_file/id_util.cc
. (Join-Path $PSScriptRoot 'service-process.ps1')
function Get-CodeArenaExtensionId([string]$ExtensionRoot) {
    $path=[IO.Path]::GetFullPath($ExtensionRoot).TrimEnd('\','/')
    if($path -match '^[a-zA-Z]:'){$path=$path.Substring(0,1).ToUpperInvariant()+$path.Substring(1)}
    $manifest=Get-Content -LiteralPath (Join-Path $path 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $bytes=if($manifest.key){[Convert]::FromBase64String($manifest.key)}else{[Text.Encoding]::Unicode.GetBytes($path)}
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$digest=$sha.ComputeHash($bytes)}finally{$sha.Dispose()}
    $id=''
    foreach($value in $digest[0..15]){$id+=[char](97+($value -shr 4));$id+=[char](97+($value -band 15))}
    return $id
}

function Get-CodeArenaNativeOrigins([string]$ExtensionRoot,[string]$ExtensionId) {
    $ids=@((Get-CodeArenaExtensionId $ExtensionRoot))
    if($ExtensionId -cmatch '^[a-p]{32}$'){$ids+=$ExtensionId}
    $roots=@(Get-CodeArenaInstallationRoots $ExtensionRoot)
    foreach($root in $roots){
        $physicsRoot=Join-Path (Split-Path -Parent $root) 'physics-lab-extension'
        if(Test-Path -LiteralPath (Join-Path $physicsRoot 'manifest.json')){
            try{
                $physics=Get-Content -LiteralPath (Join-Path $physicsRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
                if($physics.permissions -contains 'nativeMessaging'){$ids+=(Get-CodeArenaExtensionId $physicsRoot)}
            }catch{ Write-Warning 'Could not read the sibling physics extension manifest; its page-start registration was skipped.' }
        }
        $manifest=Join-Path $root 'native-host\com.codearena.cpp_judge.json'
        if(Test-Path -LiteralPath $manifest){
            try{
                $origins=(Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json).allowed_origins
                foreach($origin in $origins){if($origin -cmatch '^chrome-extension://([a-p]{32})/$'){$ids+=$Matches[1]}}
            }catch{}
        }
    }
    $ids | Select-Object -Unique | ForEach-Object {"chrome-extension://$_/"}
}
