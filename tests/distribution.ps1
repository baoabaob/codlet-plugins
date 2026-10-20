$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../scripts/Sync-Distribution.ps1')
function Assert-Rejected([scriptblock]$Work){$rejected=$false;try{&$Work|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Expected publisher to reject this input'}}
$plugin=[pscustomobject]@{id='dev.example';repository='owner/example'}
$marker=[pscustomobject]@{schema=1;kind='codlet-generated-distribution';pluginId='dev.example';repository='owner/example';sourceRepository='owner/development';files=@([pscustomobject]@{path='codlet.json';gitBlob='abc'})}
$tree=[pscustomobject]@{truncated=$false;tree=@([pscustomobject]@{path='codlet.json';type='blob';mode='100644';sha='abc'},[pscustomobject]@{path='.codlet-distribution.json';type='blob';mode='100644';sha='marker'})}
Test-RemoteSnapshot $marker $tree $plugin 'owner/development'
$tree.tree[0].sha='edited';Assert-Rejected {Test-RemoteSnapshot $marker $tree $plugin 'owner/development'}
$tree.tree[0].sha='abc';$tree.tree[0].mode='120000';Assert-Rejected {Test-RemoteSnapshot $marker $tree $plugin 'owner/development'}
$tree.tree[0].mode='100644';$tree.truncated=$true;Assert-Rejected {Test-RemoteSnapshot $marker $tree $plugin 'owner/development'}
$tree.truncated=$false;Assert-Rejected {Test-RemoteSnapshot $marker $tree $plugin 'other/development'}
$tree.tree+= [pscustomobject]@{path='manual.txt';type='blob';mode='100644';sha='extra'};Assert-Rejected {Test-RemoteSnapshot $marker $tree $plugin 'owner/development'}
foreach($path in @('../secret','.git/config','x/../../secret','C:/secret','/secret','x//file','x/./file','x\file')){Assert-Rejected {Get-OwnedPath $PSScriptRoot $path}}
if((Get-GitBlob ([Text.Encoding]::UTF8.GetBytes('test content'+[char]10))) -ne 'd670460b4b4aece5915caf5c68d12f560a9fe3e4'){throw 'Git byte identity mismatch'}
$releaseManifest=[pscustomobject]@{schema=1;id='dev.example';version='1.2.3'}
$releaseMetadata=[pscustomobject]@{schema=1;runtimeApi=1;platforms=@('windows-x86_64');adapters=[pscustomobject]@{codex=[pscustomobject]@{clientProfiles=@()}}}
$pluginPlan=[pscustomobject]@{id='dev.example';repository='owner/example';version='1.2.3';archive=[pscustomobject]@{path='dev.example-1.2.3.zip';bytes=4;sha256=('a'*64)}}
$declaration=[pscustomobject]@{schema=1;kind='codlet-plugin-release';manifest=$releaseManifest;metadata=$releaseMetadata;asset=[pscustomobject]@{name=$pluginPlan.archive.path;bytes=4;sha256=('a'*64)}}
Assert-ReleaseDeclaration $declaration $releaseManifest $releaseMetadata $pluginPlan
$declaration.asset.bytes=5;Assert-Rejected {Assert-ReleaseDeclaration $declaration $releaseManifest $releaseMetadata $pluginPlan};$declaration.asset.bytes=4
$declaration.manifest.version='9.9.9';Assert-Rejected {Assert-ReleaseDeclaration $declaration $releaseManifest $releaseMetadata $pluginPlan};$declaration.manifest.version='1.2.3'
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('codlet-release-assets-test-'+[Guid]::NewGuid().ToString('N'))
if(Test-Path -LiteralPath $testRoot){throw 'Release asset test path already exists'}
[IO.Directory]::CreateDirectory($testRoot)|Out-Null
try{
  [IO.File]::WriteAllBytes((Join-Path $testRoot 'package.zip'),[byte[]]@(1,2,3,4))
  [IO.File]::WriteAllBytes((Join-Path $testRoot 'codlet-release.json'),[Text.Encoding]::UTF8.GetBytes('{"schema":1}'))
  $planRoot=Join-Path $testRoot 'plan';$packageRoot=Join-Path $planRoot 'repositories/example';$declarationRoot=Join-Path $planRoot 'release-assets/dev.example'
  [IO.Directory]::CreateDirectory((Join-Path $packageRoot 'frontend'))|Out-Null;[IO.Directory]::CreateDirectory($declarationRoot)|Out-Null
  $planManifest=[ordered]@{schema=1;id='dev.example';version='1.2.3';name='Example';tags=@('Tool')}
  $planMetadata=[ordered]@{schema=1;runtimeApi=1;platforms=@('windows-x86_64');author='Codlet';adapters=@{codex=@{clientProfiles=@(@{appVersion='26.917.51856';buildNumber='10492';appServerVersion='0.155.0-alpha.16'})}}}
  [IO.File]::WriteAllText((Join-Path $packageRoot 'codlet.json'),($planManifest|ConvertTo-Json -Depth 20)+"`n",[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $packageRoot 'codlet-package.json'),($planMetadata|ConvertTo-Json -Depth 20)+"`n",[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $packageRoot 'README.md'),'fixture README',[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $packageRoot 'frontend/build.mjs'),'fixture build',[Text.UTF8Encoding]::new($false))
  $planZipBytes=[byte[]]@(5,6,7,8);[IO.File]::WriteAllBytes((Join-Path $planRoot 'dev.example-1.2.3.zip'),$planZipBytes)
  $manifestFixture=@'
import {generateKeyPairSync} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createUpdateSource,createSignedUpdate,createUpdateManifest} from './.core-sdk/scripts/plugin-release.mjs';
const [packageRoot,declarationRoot]=process.argv.slice(-2);
const privateKey=generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});
const repository='owner/example';
const source=createUpdateSource({repository,privateKey,manifestUrl:'https://raw.githubusercontent.com/owner/example/codlet-updates/codlet-updates.json'});
const entry=createSignedUpdate({manifest:{id:'dev.example',version:'1.2.3'},repository,assetName:'dev.example-1.2.3.zip',archive:Buffer.from([5,6,7,8]),privateKey});
await writeFile(resolve(packageRoot,'codlet-update.json'),JSON.stringify(source));
await writeFile(resolve(declarationRoot,'codlet-updates.json'),JSON.stringify(createUpdateManifest([entry],repository)));
'@
  $null=& node --input-type=module -e $manifestFixture $packageRoot $declarationRoot
  if($LASTEXITCODE -ne 0){throw 'Signed manifest fixture failed'}
  $planArchiveSha=Get-Sha256 $planZipBytes;$contentDigest='c'*64;$planCommit='a'*40;$packageSha=$planArchiveSha
  $marker=[ordered]@{schema=1;kind='codlet-generated-distribution';pluginId='dev.example';repository='owner/example';sourceRepository='owner/development';sourceCommit=$planCommit;version='1.2.3';packageSha256=$packageSha;contentDigest=$contentDigest}
  [IO.File]::WriteAllText((Join-Path $packageRoot '.codlet-distribution.json'),($marker|ConvertTo-Json -Depth 20)+"`n",[Text.UTF8Encoding]::new($false))
  $planFiles=@(Get-ChildItem -LiteralPath $packageRoot -Recurse -File | ForEach-Object{$relative=$_.FullName.Substring($packageRoot.Length+1).Replace('\','/');$fileBytes=[IO.File]::ReadAllBytes($_.FullName);@{path=$relative;bytes=$fileBytes.Length;sha256=(Get-Sha256 $fileBytes);gitBlob=(Get-GitBlob $fileBytes)}})
  $planRelease=[ordered]@{schema=1;kind='codlet-plugin-release';manifest=$planManifest;metadata=$planMetadata;asset=[ordered]@{name='dev.example-1.2.3.zip';bytes=$planZipBytes.Length;sha256=$planArchiveSha}}
  $planReleaseBytes=[Text.UTF8Encoding]::new($false).GetBytes(($planRelease|ConvertTo-Json -Depth 30)+"`n")
  [IO.File]::WriteAllBytes((Join-Path $declarationRoot 'codlet-release.json'),$planReleaseBytes)
  $planUpdateBytes=[IO.File]::ReadAllBytes((Join-Path $declarationRoot 'codlet-updates.json'))
  $planDocument=[ordered]@{schema=1;kind='codlet-distribution-plan';sourceRepository='owner/development';sourceCommit=$planCommit;dirty=$false;plugins=@([ordered]@{id='dev.example';repository='owner/example';description='Fixture';topics=@('codlet-plugin');version='1.2.3';tag='v1.2.3';directory='repositories/example';contentDigest=$contentDigest;archive=[ordered]@{path='dev.example-1.2.3.zip';bytes=$planZipBytes.Length;sha256=$planArchiveSha};releaseAsset=[ordered]@{name='codlet-release.json';path='release-assets/dev.example/codlet-release.json';bytes=$planReleaseBytes.Length;sha256=(Get-Sha256 $planReleaseBytes)};updateAsset=[ordered]@{name='codlet-updates.json';path='release-assets/dev.example/codlet-updates.json';bytes=$planUpdateBytes.Length;sha256=(Get-Sha256 $planUpdateBytes)};files=$planFiles})}
  $planFile=Join-Path $planRoot 'distribution-plan.json';[IO.File]::WriteAllText($planFile,($planDocument|ConvertTo-Json -Depth 40)+"`n",[Text.UTF8Encoding]::new($false))
  $loadedPlan=Read-Plan $planFile
  if($loadedPlan.Document.plugins[0].releaseAsset.name -ne 'codlet-release.json'){throw 'Read-Plan did not validate its release declaration asset'}
  if($loadedPlan.Document.plugins[0].updateAsset.name -ne 'codlet-updates.json'){throw 'Read-Plan did not validate its signed update manifest'}
  $planData=[pscustomobject]@{Root=$testRoot}
  $release=[pscustomobject]@{id=77;draft=$true}
  $script:releaseUploadCalls=[Collections.Generic.List[object]]::new()
  function Invoke-GitHub([string]$Method,[string]$Path,$Body=$null,[switch]$Missing,[byte[]]$Upload,[string]$UploadContentType='application/octet-stream'){
    $name=[Uri]::UnescapeDataString(($Path -split 'name=')[-1])
    $sha=Get-Sha256 $Upload
    $script:releaseUploadCalls.Add([pscustomobject]@{method=$Method;name=$name;contentType=$UploadContentType;bytes=$Upload.Length;sha256=$sha})
    [pscustomobject]@{id=$script:releaseUploadCalls.Count;name=$name;size=$Upload.Length;state='uploaded';digest=('sha256:'+$sha)}
  }
  $zipSha=Get-Sha256 ([IO.File]::ReadAllBytes((Join-Path $testRoot 'package.zip')))
  $releaseSha=Get-Sha256 ([IO.File]::ReadAllBytes((Join-Path $testRoot 'codlet-release.json')))
  $zipAsset=Sync-ReleaseAsset $planData $pluginPlan $release @() 'dev.example-1.2.3.zip' 'package.zip' 4 $zipSha 'application/zip'
  $releaseAsset=Sync-ReleaseAsset $planData $pluginPlan $release @() 'codlet-release.json' 'codlet-release.json' ([IO.File]::ReadAllBytes((Join-Path $testRoot 'codlet-release.json')).Length) $releaseSha 'application/json; charset=utf-8'
  if($script:releaseUploadCalls.Count -ne 2 -or $script:releaseUploadCalls[0].name -ne 'dev.example-1.2.3.zip' -or $script:releaseUploadCalls[0].contentType -ne 'application/zip' -or
    $script:releaseUploadCalls[0].sha256 -ne $zipSha -or $script:releaseUploadCalls[1].name -ne 'codlet-release.json' -or
    $script:releaseUploadCalls[1].contentType -ne 'application/json; charset=utf-8' -or $script:releaseUploadCalls[1].sha256 -ne $releaseSha){throw 'ZIP/JSON upload names, bytes or content types are incorrect'}
  $callsBefore=$script:releaseUploadCalls.Count
  $remote=@($zipAsset,$releaseAsset)
  $null=Sync-ReleaseAsset $planData $pluginPlan $release $remote 'dev.example-1.2.3.zip' 'package.zip' 4 $zipSha 'application/zip'
  $null=Sync-ReleaseAsset $planData $pluginPlan $release $remote 'codlet-release.json' 'codlet-release.json' $releaseAsset.size $releaseSha 'application/json; charset=utf-8'
  if($script:releaseUploadCalls.Count -ne $callsBefore){throw 'An identical sync uploaded assets again'}
  $wrong=[pscustomobject]@{name='codlet-release.json';state='uploaded';size=$releaseAsset.size;digest=('sha256:'+('0'*64))}
  Assert-Rejected {Sync-ReleaseAsset $planData $pluginPlan $release @($wrong) 'codlet-release.json' 'codlet-release.json' $releaseAsset.size $releaseSha 'application/json; charset=utf-8'}
  $published=[pscustomobject]@{id=77;draft=$false}
  Assert-Rejected {Sync-ReleaseAsset $planData $pluginPlan $published @() 'codlet-release.json' 'codlet-release.json' $releaseAsset.size $releaseSha 'application/json; charset=utf-8'}
  if($script:releaseUploadCalls.Count -ne $callsBefore){throw 'A mismatch or published release caused an overwrite/upload'}

  $script:channelFile=$null;$script:channelExists=$false;$script:channelPuts=0;$script:channelCreates=0
  function Invoke-GitHub([string]$Method,[string]$Path,$Body=$null,[switch]$Missing,[byte[]]$Upload,[string]$UploadContentType='application/octet-stream'){
    if($Method -eq 'GET' -and $Path.EndsWith('/git/ref/heads/codlet-updates')){
      if($script:channelExists){return [pscustomobject]@{object=[pscustomobject]@{sha=('a'*40)}}}
      return $null
    }
    if($Method -eq 'POST' -and $Path.EndsWith('/git/refs')){
      if($Body.ref -ne 'refs/heads/codlet-updates' -or $Body.sha -ne ('a'*40)){throw 'Unexpected channel ref'}
      $script:channelExists=$true;$script:channelCreates++
      return [pscustomobject]@{object=[pscustomobject]@{sha=$Body.sha}}
    }
    if($Method -eq 'GET' -and $Path.EndsWith('/contents/codlet-updates.json?ref=codlet-updates')){return $script:channelFile}
    if($Method -eq 'PUT' -and $Path.EndsWith('/contents/codlet-updates.json')){
      if($Body.branch -ne 'codlet-updates'){throw 'Unexpected channel branch'}
      $bytes=[Convert]::FromBase64String($Body.content)
      $script:channelPuts++
      $script:channelFile=[pscustomobject]@{type='file';encoding='base64';size=$bytes.Length;content=$Body.content;sha=(Get-GitBlob $bytes)}
      return [pscustomobject]@{commit=[pscustomobject]@{sha=('b'*40)}}
    }
    throw "Unexpected channel request: $Method $Path"
  }
  $draftChannel=Sync-UpdateManifest $loadedPlan $loadedPlan.Document.plugins[0] ([pscustomobject]@{draft=$true}) ('a'*40)
  if($draftChannel -or $script:channelCreates -or $script:channelPuts){throw 'A draft advertised an unavailable update'}
  $publishedChannel=Sync-UpdateManifest $loadedPlan $loadedPlan.Document.plugins[0] ([pscustomobject]@{draft=$false}) ('a'*40)
  if(-not $publishedChannel.changed -or $script:channelCreates -ne 1 -or $script:channelPuts -ne 1){throw 'Published update channel was not created'}
  $repeated=Sync-UpdateManifest $loadedPlan $loadedPlan.Document.plugins[0] ([pscustomobject]@{draft=$false}) ('a'*40)
  if($repeated.changed -or $script:channelCreates -ne 1 -or $script:channelPuts -ne 1){throw 'An identical update channel was rewritten'}
  $broken=$script:utf8.GetString([Convert]::FromBase64String($script:channelFile.content))|ConvertFrom-Json
  $broken.plugins[0].payload.asset.sha256='f'*64
  $brokenBytes=$script:utf8.GetBytes(($broken|ConvertTo-Json -Depth 40))
  $script:channelFile.content=[Convert]::ToBase64String($brokenBytes);$script:channelFile.size=$brokenBytes.Length
  Assert-Rejected {Sync-UpdateManifest $loadedPlan $loadedPlan.Document.plugins[0] ([pscustomobject]@{draft=$false}) ('a'*40)}
  if($script:channelPuts -ne 1){throw 'An invalid signed channel was overwritten'}

  $nodeDist=Join-Path $testRoot 'node-distribution';[IO.Directory]::CreateDirectory($nodeDist)|Out-Null
  $null=& node (Join-Path $PSScriptRoot '../scripts/package.mjs') --output $nodeDist --fixture
  if($LASTEXITCODE -ne 0){throw 'Node package fixture failed'}
  $prepareArgs=@('--input-type=module','-e',"import {prepareDistribution} from './scripts/distribution.mjs'; await prepareDistribution(process.cwd(),{allowDirty:true,outputDirectory:process.argv.at(-1)});",$nodeDist)
  $null=& node @prepareArgs
  if($LASTEXITCODE -ne 0){throw 'Node distribution plan fixture failed'}
  $nodePlanPath=Join-Path $nodeDist 'distribution-plan.json'
  $nodePlan=[IO.File]::ReadAllText($nodePlanPath)|ConvertFrom-Json
  $nodePlan.dirty=$false
  [IO.File]::WriteAllText($nodePlanPath,($nodePlan|ConvertTo-Json -Depth 50)+"`n",[Text.UTF8Encoding]::new($false))
  Assert-Rejected {Read-Plan $nodePlanPath}
  if(-not $nodePlan.fixture){throw 'A test signing key was not marked as a fixture'}
}finally{
  $temporaryRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
  $resolvedTestRoot=[IO.Path]::GetFullPath($testRoot)
  if(-not $resolvedTestRoot.StartsWith($temporaryRoot,[StringComparison]::OrdinalIgnoreCase)-or -not [IO.Path]::GetFileName($resolvedTestRoot).StartsWith('codlet-release-assets-test-')){throw 'Refusing release asset test cleanup outside its owned temporary directory'}
  for($path=$resolvedTestRoot;$path.StartsWith($temporaryRoot,[StringComparison]::OrdinalIgnoreCase);$path=[IO.Path]::GetDirectoryName($path)){if(([IO.File]::GetAttributes($path)-band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'Refusing to clean linked release asset test data'}}
  [IO.Directory]::Delete($resolvedTestRoot,$true)
}
Write-Output 'PASS: release assets, signed update channels, publish ordering, idempotency and source ownership'
