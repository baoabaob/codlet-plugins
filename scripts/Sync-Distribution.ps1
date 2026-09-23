[CmdletBinding()]
param(
  [string]$Plan,
  [switch]$Apply,
  [switch]$Publish,
  [switch]$AllowPublic
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$script:token=$null
$script:utf8=[Text.UTF8Encoding]::new($false)
if(-not $Plan){$Plan=Join-Path $PSScriptRoot '../dist/distribution-plan.json'}

function Get-Sha256([byte[]]$Bytes){
  $digest=[Security.Cryptography.SHA256]::Create()
  try{[BitConverter]::ToString($digest.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant()}finally{$digest.Dispose()}
}
function Get-GitBlob([byte[]]$Bytes){
  $digest=[Security.Cryptography.SHA1]::Create()
  try{[BitConverter]::ToString($digest.ComputeHash([byte[]]($script:utf8.GetBytes("blob $($Bytes.Length)`0")+$Bytes))).Replace('-','').ToLowerInvariant()}finally{$digest.Dispose()}
}
function Get-OwnedPath([string]$Root,[string]$Relative){
  if(-not $Relative -or $Relative -match '[\\:\x00]' -or $Relative.StartsWith('/') -or @($Relative.Split('/')|Where-Object{$_ -in @('','..','.','.git')}).Count){throw "Unsafe generated path: $Relative"}
  $base=[IO.Path]::GetFullPath($Root).TrimEnd('\','/')
  $path=[IO.Path]::GetFullPath((Join-Path $base $Relative))
  if(-not $path.StartsWith($base+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Generated path escaped its directory'}
  for($part=$path;$part;$part=[IO.Path]::GetDirectoryName($part)){
    if((Test-Path -LiteralPath $part) -and (([IO.File]::GetAttributes($part) -band [IO.FileAttributes]::ReparsePoint) -ne 0)){throw 'Linked distribution paths are not accepted'}
  }
  $path
}
function Read-Plan([string]$Path){
  $resolved=[IO.Path]::GetFullPath($Path)
  $document=[IO.File]::ReadAllText($resolved)|ConvertFrom-Json
  if($document.schema -ne 1 -or $document.kind -ne 'codlet-distribution-plan' -or $document.sourceRepository -notmatch '^[\w-]+/[\w.-]+$' -or $document.sourceCommit -notmatch '^[a-f0-9]{40}$' -or $document.dirty){throw 'Expected a clean, committed distribution plan'}
  $root=[IO.Path]::GetDirectoryName($resolved);$ids=@{};$repositories=@{}
  foreach($plugin in $document.plugins){
    if($plugin.id -notmatch '^[a-z0-9.-]+$' -or $plugin.repository -notmatch '^[\w-]+/[\w.-]+$' -or $ids.ContainsKey($plugin.id) -or $repositories.ContainsKey($plugin.repository) -or $plugin.repository -eq $document.sourceRepository -or $plugin.repository.Split('/')[0] -ne $document.sourceRepository.Split('/')[0]){throw 'Invalid or duplicate distribution destination'}
    if($plugin.version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$' -or $plugin.tag -ne ('v'+$plugin.version)){throw 'Invalid release version'}
    if('codlet-plugin' -notin $plugin.topics -or @($plugin.topics).Count -gt 20 -or @($plugin.topics|Where-Object{$_ -notmatch '^[a-z0-9][a-z0-9-]{0,49}$'}).Count){throw 'Invalid repository topics'}
    $ids[$plugin.id]=$true;$repositories[$plugin.repository]=$true
    $directory=Get-OwnedPath $root $plugin.directory;$paths=@{}
    foreach($file in $plugin.files){
      if($paths.ContainsKey($file.path)){throw 'Duplicate generated file'};$paths[$file.path]=$true
      $bytes=[IO.File]::ReadAllBytes((Get-OwnedPath $directory $file.path))
      if($bytes.Length -ne $file.bytes -or (Get-Sha256 $bytes) -ne $file.sha256 -or (Get-GitBlob $bytes) -ne $file.gitBlob){throw "Generated file changed: $($plugin.id)/$($file.path)"}
    }
    foreach($required in @('codlet.json','codlet-package.json','.codlet-distribution.json','README.md','frontend/build.mjs')){if(-not $paths.ContainsKey($required)){throw "Missing generated file: $required"}}
    $marker=[IO.File]::ReadAllText((Join-Path $directory '.codlet-distribution.json'))|ConvertFrom-Json
    if($marker.pluginId -ne $plugin.id -or $marker.repository -ne $plugin.repository -or $marker.sourceCommit -ne $document.sourceCommit -or $marker.sourceRepository -ne $document.sourceRepository -or $marker.contentDigest -ne $plugin.contentDigest -or $marker.packageSha256 -ne $plugin.archive.sha256){throw 'Snapshot identity mismatch'}
    $bytes=[IO.File]::ReadAllBytes((Get-OwnedPath $root $plugin.archive.path))
    if($bytes.Length -ne $plugin.archive.bytes -or (Get-Sha256 $bytes) -ne $plugin.archive.sha256){throw "Archive changed: $($plugin.id)"}
    if($plugin.releaseAsset.name -cne 'codlet-release.json' -or $plugin.releaseAsset.path -cne ('release-assets/'+$plugin.id+'/codlet-release.json') -or
      [long]$plugin.releaseAsset.bytes -le 0 -or [long]$plugin.releaseAsset.bytes -gt 16KB -or $plugin.releaseAsset.sha256 -notmatch '^[a-f0-9]{64}$'){
      throw 'Invalid release declaration asset record'
    }
    $releaseBytes=[IO.File]::ReadAllBytes((Get-OwnedPath $root $plugin.releaseAsset.path))
    if($releaseBytes.Length -ne [long]$plugin.releaseAsset.bytes -or (Get-Sha256 $releaseBytes) -ne $plugin.releaseAsset.sha256){throw "Release declaration changed: $($plugin.id)"}
    $releaseDeclaration=$script:utf8.GetString($releaseBytes)|ConvertFrom-Json
    $packageManifest=[IO.File]::ReadAllText((Get-OwnedPath $directory 'codlet.json'))|ConvertFrom-Json
    $packageMetadata=[IO.File]::ReadAllText((Get-OwnedPath $directory 'codlet-package.json'))|ConvertFrom-Json
    Assert-ReleaseDeclaration $releaseDeclaration $packageManifest $packageMetadata $plugin
  }
  if($ids.Count -eq 0){throw 'Empty distribution plan'}
  [pscustomobject]@{Document=$document;Root=$root}
}
function Initialize-GitHubCredential {
  if($env:CODLET_DISTRIBUTION_TOKEN){$script:token=$env:CODLET_DISTRIBUTION_TOKEN}
  elseif($env:GH_TOKEN){$script:token=$env:GH_TOKEN}
  else{
    $oldPrompt=$env:GIT_TERMINAL_PROMPT;$oldInteractive=$env:GCM_INTERACTIVE
    try{
      $env:GIT_TERMINAL_PROMPT='0';$env:GCM_INTERACTIVE='Never'
      $credential="protocol=https`nhost=github.com`n`n"|git credential fill
      if($LASTEXITCODE -ne 0){throw 'GitHub credentials are unavailable'}
      foreach($line in $credential){if($line.StartsWith('password=')){$script:token=$line.Substring(9)}}
    }finally{$env:GIT_TERMINAL_PROMPT=$oldPrompt;$env:GCM_INTERACTIVE=$oldInteractive}
  }
  if(-not $script:token){throw 'Use Git Credential Manager or CODLET_DISTRIBUTION_TOKEN with access to the distribution repositories'}
}
function Invoke-GitHub([string]$Method,[string]$Path,$Body=$null,[switch]$Missing,[byte[]]$Upload,[string]$UploadContentType='application/octet-stream'){
  $hostName=if($PSBoundParameters.ContainsKey('Upload')){'uploads.github.com'}else{'api.github.com'}
  if(-not $Path.StartsWith('/') -or $Path.StartsWith('//')){throw 'Expected a GitHub API path'}
  $request=[Net.HttpWebRequest]::Create('https://'+$hostName+$Path)
  $request.Method=$Method;$request.Proxy=[Net.WebRequest]::GetSystemWebProxy();$request.Timeout=60000;$request.ReadWriteTimeout=60000;$request.AllowAutoRedirect=$false
  $request.UserAgent='Codlet-official-plugin-distribution';$request.Accept='application/vnd.github+json'
  $request.Headers['Authorization']='Bearer '+$script:token
  $request.Headers['X-GitHub-Api-Version']='2022-11-28'
  if($PSBoundParameters.ContainsKey('Upload')){$bytes=$Upload;$request.ContentType=$UploadContentType}
  elseif($null -ne $Body){$bytes=$script:utf8.GetBytes(($Body|ConvertTo-Json -Depth 60 -Compress));$request.ContentType='application/json'}
  else{$bytes=$null}
  if($null -ne $bytes){$request.ContentLength=$bytes.Length;$stream=$request.GetRequestStream();try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}}
  try{$response=$request.GetResponse()}catch [Net.WebException]{
    $status=if($_.Exception.Response){[int]$_.Exception.Response.StatusCode}else{0}
    if($_.Exception.Response){$_.Exception.Response.Dispose()}
    if($Missing -and ($status -eq 404 -or ($status -eq 409 -and $Path -match '^/repos/[\w.-]+/[\w.-]+/git/ref/heads/'))){return $null}
    throw "GitHub $Method $Path failed (HTTP $status); rerun to reconcile existing repositories, commits and draft assets"
  }
  try{
    if([int]$response.StatusCode -ge 300){throw 'Unexpected API redirect; credentials were not forwarded'}
    $reader=[IO.StreamReader]::new($response.GetResponseStream(),[Text.Encoding]::UTF8)
    try{$text=$reader.ReadToEnd();if($text){return ($text|ConvertFrom-Json)}}finally{$reader.Dispose()}
  }finally{$response.Dispose()}
}
function Test-RemoteSnapshot($Marker,$Tree,$Plugin,[string]$SourceRepository){
  if($Marker.schema -ne 1 -or $Marker.kind -ne 'codlet-generated-distribution' -or $Marker.pluginId -ne $Plugin.id -or $Marker.repository -ne $Plugin.repository -or $Marker.sourceRepository -ne $SourceRepository -or $Tree.truncated){throw 'Refusing to overwrite a repository without its matching generation marker'}
  $expected=@{};foreach($file in $Marker.files){$expected[$file.path]=$file.gitBlob}
  $actual=@($Tree.tree|Where-Object{$_.type -ne 'tree' -and $_.path -ne '.codlet-distribution.json'})
  if($actual.Count -ne $expected.Count){throw 'Distribution repository was edited directly; merge its changes into the development repository first'}
  foreach($file in $actual){if($file.type -ne 'blob' -or $file.mode -ne '100644' -or -not $expected.ContainsKey($file.path) -or $expected[$file.path] -ne $file.sha){throw 'Distribution repository was edited directly; synchronization stopped without overwriting it'}}
}
function ConvertTo-CompactJson($Value){ConvertTo-Json -InputObject $Value -Depth 60 -Compress}
function Assert-ReleaseDeclaration($Declaration,$Manifest,$Metadata,$Plugin){
  $top=@($Declaration.PSObject.Properties.Name|Sort-Object)-join ','
  $assetFields=@($Declaration.asset.PSObject.Properties.Name|Sort-Object)-join ','
  if($top -cne 'asset,kind,manifest,metadata,schema' -or $assetFields -cne 'bytes,name,sha256' -or
    $Declaration.schema -ne 1 -or $Declaration.kind -ne 'codlet-plugin-release' -or
    $Declaration.manifest.id -ne $Plugin.id -or $Declaration.manifest.version -ne $Plugin.version -or
    (ConvertTo-CompactJson $Declaration.manifest) -cne (ConvertTo-CompactJson $Manifest) -or
    (ConvertTo-CompactJson $Declaration.metadata) -cne (ConvertTo-CompactJson $Metadata) -or
    $Declaration.asset.name -ne [IO.Path]::GetFileName($Plugin.archive.path) -or
    [long]$Declaration.asset.bytes -ne [long]$Plugin.archive.bytes -or
    $Declaration.asset.sha256 -ne $Plugin.archive.sha256){throw 'codlet-release.json does not declare the exact ZIP, manifest and package metadata'}
}
function Assert-RemoteReleaseAsset($Asset,[string]$Name,[long]$Bytes,[string]$Sha256){
  if($Asset.state -ne 'uploaded' -or $Asset.name -cne $Name -or [long]$Asset.size -ne $Bytes -or $Asset.digest -ne ('sha256:'+$Sha256)){
    throw "Release asset differs from the versioned package plan: $Name"
  }
}
function Sync-ReleaseAsset($PlanData,$Plugin,$Release,$RemoteAssets,[string]$Name,[string]$RelativePath,[long]$Bytes,[string]$Sha256,[string]$ContentType){
  $localPath=Get-OwnedPath $PlanData.Root $RelativePath
  $localBytes=[IO.File]::ReadAllBytes($localPath)
  if($localBytes.Length -ne $Bytes -or (Get-Sha256 $localBytes) -ne $Sha256){throw "Release asset changed after preview: $Name"}
  $existing=@($RemoteAssets|Where-Object{$_.name -ceq $Name})
  if($existing.Count -gt 1){throw "Ambiguous release asset: $Name"}
  if($existing.Count){Assert-RemoteReleaseAsset $existing[0] $Name $Bytes $Sha256;return $existing[0]}
  if(-not $Release.draft){throw "Published release is missing $Name; it will not be modified"}
  $uploaded=Invoke-GitHub POST ('/repos/'+$Plugin.repository+'/releases/'+$Release.id+'/assets?name='+[Uri]::EscapeDataString($Name)) -Upload $localBytes -UploadContentType $ContentType
  Assert-RemoteReleaseAsset $uploaded $Name $Bytes $Sha256
  $uploaded
}
function Find-Release([string]$Repository,[string]$Tag){
  for($page=1;$page -le 10;$page++){
    $releases=@(Invoke-GitHub GET ('/repos/'+$Repository+'/releases?per_page=100&page='+$page))
    $match=@($releases|Where-Object{$_.tag_name -eq $Tag})
    if($match.Count -gt 1){throw 'Duplicate release tags'};if($match.Count){return $match[0]}
    if($releases.Count -lt 100){return $null}
  }
  throw 'Release listing exceeded the bounded search; no release was created'
}
function Sync-Plugin($PlanData,$Plugin,[switch]$Publish,[switch]$AllowPublic){
  $repository=$Plugin.repository;$api='/repos/'+$repository
  $repo=Invoke-GitHub GET $api -Missing
  if(-not $repo){
    $user=Invoke-GitHub GET '/user'
    if($user.login -ne $repository.Split('/')[0]){throw 'Create the organization repository privately before synchronizing it'}
    $repo=Invoke-GitHub POST '/user/repos' @{name=$repository.Split('/')[1];description=$Plugin.description;private=$true;auto_init=$false;has_issues=$false;has_wiki=$false;has_projects=$false}
  }
  if($repo.archived -or $repo.fork -or (-not $repo.private -and -not $AllowPublic)){throw "Refusing archived, forked or unapproved public destination: $repository"}
  $branch=[string]$repo.default_branch
  if(-not $branch){$branch='main'}
  $branchPath='/git/ref/heads/'+[Uri]::EscapeDataString($branch)
  $head=Invoke-GitHub GET ($api+$branchPath) -Missing
  if(-not $head){
    $bootstrap=@{schema=1;kind='codlet-generated-distribution';pluginId=$Plugin.id;repository=$repository;sourceRepository=$PlanData.Document.sourceRepository;files=@();initializing=$true}
    $null=Invoke-GitHub PUT ($api+'/contents/.codlet-distribution.json') @{message='Initialize generated Codlet distribution';content=[Convert]::ToBase64String($script:utf8.GetBytes(($bootstrap|ConvertTo-Json -Depth 10)));branch=$branch}
    $head=Invoke-GitHub GET ($api+$branchPath)
  }
  $oldHead=$head.object.sha
  $content=Invoke-GitHub GET ($api+'/contents/.codlet-distribution.json?ref='+$oldHead) -Missing
  if(-not $content){throw "Existing repository is not managed by this publisher: $repository"}
  $marker=$script:utf8.GetString([Convert]::FromBase64String($content.content))|ConvertFrom-Json
  $tree=Invoke-GitHub GET ($api+'/git/trees/'+$oldHead+'?recursive=1')
  Test-RemoteSnapshot $marker $tree $Plugin $PlanData.Document.sourceRepository
  $release=Find-Release $repository $Plugin.tag
  $same=$marker.PSObject.Properties['contentDigest'] -and $marker.contentDigest -eq $Plugin.contentDigest
  if($release -and -not $same){throw "Version $($Plugin.version) already has a release; increment the plugin version before changing its files"}
  $tagPath='/git/ref/tags/'+[Uri]::EscapeDataString($Plugin.tag)
  $tag=Invoke-GitHub GET ($api+$tagPath) -Missing
  if($tag -and -not $same){throw 'The version tag already exists with different content; increment the plugin version'}
  if(-not $same){
    $entries=@();$directory=Get-OwnedPath $PlanData.Root $Plugin.directory
    $known=@{};foreach($item in $tree.tree){if($item.type -eq 'blob'){$known[$item.sha]=$true}}
    foreach($file in $Plugin.files){
      if(-not $known.ContainsKey($file.gitBlob)){
        $bytes=[IO.File]::ReadAllBytes((Get-OwnedPath $directory $file.path))
        $blob=Invoke-GitHub POST ($api+'/git/blobs') @{encoding='base64';content=[Convert]::ToBase64String($bytes)}
        if($blob.sha -ne $file.gitBlob){throw 'Uploaded Git blob identity mismatch'}
      }
      $entries+=@{path=$file.path;mode='100644';type='blob';sha=$file.gitBlob}
    }
    $newTree=Invoke-GitHub POST ($api+'/git/trees') @{tree=$entries}
    $commit=Invoke-GitHub POST ($api+'/git/commits') @{message=('Sync '+$Plugin.id+' '+$Plugin.version+' from '+$PlanData.Document.sourceCommit);tree=$newTree.sha;parents=@($oldHead)}
    $fresh=Invoke-GitHub GET ($api+$branchPath)
    if($fresh.object.sha -ne $oldHead){throw 'Remote branch changed during synchronization; no branch update was submitted'}
    $null=Invoke-GitHub PATCH ($api+'/git/refs/heads/'+[Uri]::EscapeDataString($branch)) @{sha=$commit.sha;force=$false}
    $headSha=$commit.sha
  }else{$headSha=$oldHead}
  if(-not $tag){$null=Invoke-GitHub POST ($api+'/git/refs') @{ref=('refs/tags/'+$Plugin.tag);sha=$headSha}}
  elseif($tag.object.type -ne 'commit' -or $tag.object.sha -ne $headSha){throw 'The existing version tag does not match this generated snapshot'}
  $null=Invoke-GitHub PATCH $api @{description=$Plugin.description;homepage=('https://github.com/'+$PlanData.Document.sourceRepository);has_issues=$false;has_wiki=$false;has_projects=$false}
  $null=Invoke-GitHub PUT ($api+'/topics') @{names=@($Plugin.topics)}
  if(-not $release){
    $body="Install this ZIP through Codlet's GitHub importer. The automatically generated Source code archives are for development.`n`nPlugin: $($Plugin.id)`nDevelopment source: https://github.com/$($PlanData.Document.sourceRepository)/tree/$($PlanData.Document.sourceCommit)`nPackage SHA-256: $($Plugin.archive.sha256)`n"
    $release=Invoke-GitHub POST ($api+'/releases') @{tag_name=$Plugin.tag;target_commitish=$headSha;name=($Plugin.id+' '+$Plugin.version);body=$body;draft=$true;prerelease=($Plugin.version.Contains('-'))}
  }
  $assets=@(Invoke-GitHub GET ($api+'/releases/'+$release.id+'/assets?per_page=100'))
  $assetName=[IO.Path]::GetFileName($Plugin.archive.path)
  foreach($expected in @(
    @{name=$assetName;bytes=[long]$Plugin.archive.bytes;sha256=$Plugin.archive.sha256},
    @{name='codlet-release.json';bytes=[long]$Plugin.releaseAsset.bytes;sha256=$Plugin.releaseAsset.sha256}
  )){
    $matches=@($assets|Where-Object{$_.name -ceq $expected.name})
    if($matches.Count -gt 1){throw "Ambiguous release asset: $($expected.name)"}
    if($matches.Count){Assert-RemoteReleaseAsset $matches[0] $expected.name $expected.bytes $expected.sha256}
    elseif(-not $release.draft){throw "Published release is missing $($expected.name); it will not be modified"}
  }
  $asset=Sync-ReleaseAsset $PlanData $Plugin $release $assets $assetName $Plugin.archive.path ([long]$Plugin.archive.bytes) $Plugin.archive.sha256 'application/zip'
  $releaseAsset=Sync-ReleaseAsset $PlanData $Plugin $release $assets 'codlet-release.json' $Plugin.releaseAsset.path ([long]$Plugin.releaseAsset.bytes) $Plugin.releaseAsset.sha256 'application/json; charset=utf-8'
  if($Publish -and $release.draft){$release=Invoke-GitHub PATCH ($api+'/releases/'+$release.id) @{draft=$false}}
  [pscustomobject]@{id=$Plugin.id;repository=('https://github.com/'+$repository);private=$repo.private;version=$Plugin.version;tag=$Plugin.tag;commit=$headSha;releaseId=$release.id;releaseUrl=$release.html_url;draft=$release.draft;assetId=$asset.id;assetName=$asset.name;assetUrl=$asset.browser_download_url;sha256=$Plugin.archive.sha256;bytes=$asset.size;releaseAssetId=$releaseAsset.id;releaseAssetName=$releaseAsset.name;releaseAssetUrl=$releaseAsset.browser_download_url;releaseAssetSha256=$Plugin.releaseAsset.sha256;releaseAssetBytes=$releaseAsset.size}
}

if($MyInvocation.InvocationName -ne '.'){
  try{
    $data=Read-Plan $Plan
    if(-not $Apply){
      if($Publish){throw '-Publish also requires -Apply'}
      $data.Document.plugins|Select-Object id,repository,tag,@{Name='action';Expression={'sync private repository and verified draft ZIP'}}|ConvertTo-Json -Depth 5
    }else{
      Initialize-GitHubCredential
      $receipts=@()
      foreach($plugin in $data.Document.plugins){
        $receipt=Sync-Plugin $data $plugin -Publish:$Publish -AllowPublic:$AllowPublic
        $receipts+=$receipt
        $receipt|ConvertTo-Json -Compress
        [IO.File]::WriteAllText((Join-Path $data.Root 'release-lock.json'),(@{schema=1;sourceRepository=$data.Document.sourceRepository;sourceCommit=$data.Document.sourceCommit;plugins=$receipts}|ConvertTo-Json -Depth 10),$script:utf8)
      }
    }
  }finally{$script:token=$null}
}
