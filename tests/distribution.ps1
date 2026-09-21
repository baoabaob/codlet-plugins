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
Write-Output 'PASS: remote edits, symlinks, extra files, wrong ownership, truncated trees and unsafe paths are rejected'
