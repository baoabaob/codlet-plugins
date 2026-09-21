import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isOfficialPlugin,supportedPlatforms,compatibilityFor,sortPlugins,sumPackageDownloads} from '../frontend/src/codlet/marketplace-model.js';
import {auditPortability} from '../scripts/audit-portability.mjs';
test('official identity requires the pinned repository, owner and plugin binding',()=>{
  const official={id:'codlet-gui',source:{kind:'github',repository:'baoabaob/codlet-gui',repositoryId:1379359689,ownerId:76909162}};
  assert.equal(isOfficialPlugin(official),true);
  for(const value of [{...official,source:{...official.source,kind:'local'}},{...official,id:'another-plugin'},{...official,source:{...official.source,repositoryId:999}},{...official,source:{...official.source,ownerId:999}},{id:'codlet-gui',official:true,author:'Codlet',topics:['codlet-official']},{...official,source:{...official.source,repository:'fake/codlet-gui'}}])assert.equal(isOfficialPlugin(value),false);
});
test('adapter inheritance intersects Core, dependency and required capability support',()=>{
  const a={id:'adapter.a',systems:['windows-x86_64','macos-aarch64'],platformCapabilities:{'read@1':['windows-x86_64','macos-aarch64']}},b={id:'adapter.b',systems:['windows-x86_64','windows-aarch64','macos-aarch64'],platformCapabilities:{'write@1':['macos-aarch64']}};
  const consumer={id:'consumer',compatibility:{mode:'adapters',review:'public-api-only',requirements:[{providerId:a.id,capability:'read@1'},{providerId:b.id,capability:'write@1'}]}};
  assert.deepEqual(supportedPlatforms(consumer,[a,b]).platforms,['macos-aarch64']);
  assert.equal(compatibilityFor(consumer,[a,b],'windows-x86_64'),'unsupported');
  assert.equal(supportedPlatforms(consumer,[a,b],['windows-x86_64']).platforms.length,0);
  assert.equal(supportedPlatforms(consumer,[a]).known,false);
  assert.equal(supportedPlatforms({...consumer,compatibility:{...consumer.compatibility,review:null}},[a,b]).known,false);
  assert.equal(supportedPlatforms({...consumer,compatibility:{...consumer.compatibility,issues:['native-code']}},[a,b]).known,false);
  assert.equal(supportedPlatforms({...consumer,compatibility:{...consumer.compatibility,requirements:[{providerId:a.id,capability:'missing@1'}]}},[a,b]).known,false);
  assert.equal(supportedPlatforms({id:'unknown'},[a,b]).known,false);
});
test('cycles and absent evidence never become universal platform support',()=>{
  const a={id:'a',compatibility:{mode:'adapters',review:'public-api-only',requirements:[{providerId:'a',capability:'self@1'}]},platformCapabilities:{'self@1':['windows-x86_64']}};
  assert.equal(supportedPlatforms(a,[a]).known,false);
  assert.equal(supportedPlatforms({id:'broken',compatibility:{mode:'adapters',review:'public-api-only',requirements:[null]}},[a]).known,false);
});
test('sorting is deterministic and package downloads exclude unrelated or repeated assets',()=>{
  const items=[{id:'a',name:'Alpha',publishedAt:'2026-09-20',downloads:3},{id:'b',name:'Beta',publishedAt:'2026-09-21',downloads:10},{id:'c',name:'Unknown',publishedAt:null,downloads:null}];
  assert.deepEqual(sortPlugins(items).map(p=>p.id),['b','a','c']);
  assert.deepEqual(sortPlugins(items,'downloads').map(p=>p.id),['b','a','c']);
  assert.deepEqual(sortPlugins(items,'name').map(p=>p.id),['a','b','c']);
  assert.equal(sumPackageDownloads([{id:1,download_count:10},{id:1,download_count:10},{id:2,download_count:900}], [1]),10);
  assert.equal(sumPackageDownloads([{id:1,download_count:0}],[1]),0);
  assert.equal(sumPackageDownloads([],[1]),null);
  assert.equal(sumPackageDownloads([{id:1,download_count:10}],[1],{complete:false}),null);
});
test('read-only source audit distinguishes a portable candidate from direct OS and dynamic access',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'codlet-portability-'));
  t.after(async()=>{
    for(const file of ['renderer.js','native.dll','codlet.json'])await unlink(join(directory,file)).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await rmdir(directory);
  });
  await writeFile(join(directory,'codlet.json'),JSON.stringify({id:'dev.portable',renderer:{entry:'renderer.js'},permissions:[],requires:[{name:'codex.backend.read',api:1,scope:'target'}]}));
  await writeFile(join(directory,'renderer.js'),'module.exports={activate:context=>context.rpc.request({name:"codex.backend.read",api:1,scope:"target"},"get",null)}');
  let result=await auditPortability(directory);assert.equal(result.status,'adapter-candidate');assert.equal(result.verified,false);
  await writeFile(join(directory,'renderer.js'),'const fs=require("node:fs"); module.exports={}');
  result=await auditPortability(directory);assert.equal(result.status,'explicit-platforms-required');
  await writeFile(join(directory,'renderer.js'),'import "node:fs";');
  result=await auditPortability(directory);assert.equal(result.status,'explicit-platforms-required');
  await writeFile(join(directory,'renderer.js'),'module.exports={activate:()=>eval("some code")}');
  result=await auditPortability(directory);assert.equal(result.status,'review-required');
  await writeFile(join(directory,'native.dll'),'fixture');
  result=await auditPortability(directory);assert.equal(result.status,'explicit-platforms-required');
  await writeFile(join(directory,'renderer.js'),Buffer.alloc(2*1024*1024+1));
  await assert.rejects(auditPortability(directory),/size limit/);
});
