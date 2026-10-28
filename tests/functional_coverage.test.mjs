import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),coverage=require('./fixtures/runtime-compatibility/consumer/coverage.cjs'),host=require('./fixtures/runtime-compatibility/consumer/host.cjs');
const find=(value,id)=>value.rows.find(row=>row.id===id);
const caller=generation=>({pluginId:'compatibility.acceptance',generation,targetId:'fixture-target',documentEpoch:1});
function report(checks=[]){
  const plugin={id:'compatibility.acceptance',version:'1.0.0-rc.2',generation:1,files:['codlet.json','codlet-package.json','host.cjs','renderer.js','coverage.cjs','coverage-catalog.json'].map(path=>({path,sha256:'a'.repeat(64),bytes:10}))},invocation=caller(1);
  return {schema:1,pluginId:plugin.id,version:plugin.version,generation:plugin.generation,runId:'run-one',phase:'complete',checks:checks.map(check=>({runId:'run-one',...check})),
    carrier:{plugin:{id:plugin.id,version:plugin.version,generation:1},caller:{...invocation}},
    provenance:{schema:2,runId:'run-one',observedAt:'2026-10-28T00:00:00Z',plugin,caller:{...invocation},core:{version:'1.0.0-rc.20',executable:{bytes:42,sha256:'b'.repeat(64)}},
      native:{build:{appVersion:'26.1023.50603',buildNumber:'22391'},document:{href:'app://-/index.html',timeOrigin:1234},owner:{...invocation},assets:[{url:'app://-/assets/app-initial-fixture.js',bytes:1,sha256:'c'.repeat(64)}]}}};
}

test('coverage separates reads, interfaces, operations and unexecuted Native lifecycle',()=>{
  const result=coverage.project(report([{id:'management.read-and-resources',status:'passed'},...coverage.sourceChecks({attached:false,activatedSources:[],unsupportedSources:[{id:'desktop-main-http',reason:'hook_unavailable'}]}),{id:'workspace.interface.navigation',status:'passed'}]));
  assert.equal(result.total,220);assert.equal(coverage.catalog.coreVersion,'1.0.0-rc.20');
  assert.equal(find(result,'management.list').status,'read-verified');
  assert.equal(find(result,'native.traffic.desktop-main-http').status,'unavailable');
  assert.equal(find(result,'native.traffic.model-transform').status,'not-verified');
  assert.equal(find(result,'native.workspace.navigation-interface').status,'interface-verified');
  for(const id of ['workspace.navigation.open','workspace.mountTranscript','workspace.transcript.scrollToLatest','native.workspace.input-ownership','native.workspace.full-lifecycle','native.workspace.physical-ime'])assert.equal(find(result,id).status,'not-verified',id);
  assert.equal(result.counts['operation-verified'],0);assert.deepEqual(result.unmappedChecks,[]);
});

test('empty, missing or contradictory build/owner evidence cannot verify an operation',()=>{
  const mutations=[
    value=>delete value.provenance,value=>{value.provenance={};},value=>{value.generation=9;},value=>{value.provenance.plugin.id='foreign';},
    value=>{value.provenance.plugin.version='older';},value=>{value.provenance.core.executable.sha256=null;},value=>{value.provenance.plugin.files=[];},
    value=>{value.provenance.caller.generation=2;},value=>{value.carrier.caller.documentEpoch=2;},value=>{value.checks[0].runId='old-run';},
    value=>{value.provenance.native.unavailable='Native identity unavailable';},value=>{value.provenance.native.owner.targetId='other-target';},value=>{value.provenance.native.assets=[];}
  ];
  for(const mutate of mutations){const value=report([{id:'native.editable-draft',status:'passed'}]);mutate(value);const row=find(coverage.project(value),'codex.navigation.newTaskDraft');assert.equal(row.status,'not-verified');assert.equal(row.evidence[0].bound,false);}
  assert.equal(find(coverage.project(report([{id:'native.editable-draft',status:'passed'}])),'codex.navigation.newTaskDraft').status,'operation-verified');
});

test('Core reads can be bound even when Native identity is unavailable',()=>{
  const value=report([{id:'management.read-and-resources',status:'passed'},{id:'native.editable-draft',status:'passed'}]);
  value.provenance.native={unavailable:'No current Native identity'};
  const projected=coverage.project(value);
  assert.equal(find(projected,'management.list').status,'read-verified');assert.equal(find(projected,'codex.navigation.newTaskDraft').status,'not-verified');
});

test('historical Host evidence never hides a fresh Renderer observation or gains current identity',()=>{
  const value=report([{id:'workspace.interface.navigation',status:'passed'}]);
  value.host={...report([{id:'storage.transaction-and-conflict',status:'passed'}]),historical:true};
  const projected=coverage.project(value);
  assert.equal(find(projected,'core.storage.transaction').status,'not-verified');assert.equal(find(projected,'core.storage.transaction').evidence[0].historical,true);
  assert.equal(find(projected,'native.workspace.navigation-interface').status,'interface-verified');
  value.historical=true;value.host.historical=false;assert.equal(find(coverage.project(value),'native.workspace.navigation-interface').status,'not-verified');assert.equal(find(coverage.project(value),'core.storage.transaction').status,'not-verified');
});

test('successful process workflow covers the public spawn operation without unmapped IDs',()=>{
  const projected=coverage.project(report([{id:'processes.streaming-and-receipts',status:'passed'}]));
  assert.equal(find(projected,'core.processes.spawn').status,'operation-verified');assert.deepEqual(projected.unmappedChecks,[]);
});

test('source absence remains unobserved, and attachment is not a model transform',()=>{
  const unobserved=coverage.project(report(coverage.sourceChecks({attached:false,activatedSources:[],unsupportedSources:[]})));
  assert.equal(find(unobserved,'native.traffic.desktop-main-http').status,'not-verified');
  const attached=coverage.project(report(coverage.sourceChecks({attached:true,activatedSources:[{id:'desktop-main-http',protocols:['http']}]})));
  assert.equal(find(attached,'native.traffic.desktop-main-http').status,'interface-verified');assert.equal(find(attached,'native.traffic.model-transform').status,'not-verified');
});

test('a failing repeat cannot be hidden by a successful observation',()=>{
  const projected=coverage.project(report([{id:'native.editable-draft',status:'passed'},{id:'native.editable-draft',status:'failed',error:{message:'draft mismatch'}}]));
  assert.equal(find(projected,'codex.navigation.newTaskDraft').status,'unavailable');
});

test('stale inventory metadata is separate from a Native incompatibility result',()=>{
  const value=report([{id:'workspace.interface.navigation',status:'passed'}]);value.provenance.catalog={coreVersion:'1.0.0-rc.10',sha256:'d'.repeat(64),status:'matched'};
  const projected=coverage.project(value);assert.equal(projected.inventory.status,'stale-or-unavailable');assert.equal(find(projected,'native.workspace.navigation-interface').status,'interface-verified');
});

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function hostContext(root,generation,metadata,methods){return {root,plugin:{id:'compatibility.acceptance',version:'1.0.0-rc.2',generation},services:{resources:{list:async()=>({})},diagnostics:{read:async()=>({cursor:0})}},traffic:{inspect:async()=>({attached:false,activatedSources:[],unsupportedSources:[]})},rpc:{provide:(_cap,method,handler)=>methods.set(method,handler),request:()=>metadata.promise}};}
test('readonly owns running state and blocks concurrent run, readonly and snapshot',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codlet-coverage-lock-')),metadata=deferred(),methods=new Map(),invocation={caller:caller(1)};
  try{
    await host.activate(hostContext(root,1,metadata,methods));const pending=methods.get('readonly')(null,invocation);
    assert.throws(()=>host.saveState(),/settle/);
    await assert.rejects(()=>methods.get('run')(null,invocation),/running/);await assert.rejects(()=>methods.get('readonly')(null,invocation),/running/);
    metadata.resolve({runtimeVersion:'1.0.0-rc.20'});const result=await pending;
    assert.equal(result.report.phase,'complete');assert.equal(result.report.carrier.caller.documentEpoch,1);assert.ok(result.report.runId);
    assert.equal(result.report.checks.some(check=>check.id==='native.source.desktop-main-http'&&check.status==='manual'),true);
    assert.doesNotThrow(()=>host.saveState());
  }finally{await host.deactivate();fs.rmSync(root,{recursive:true});}
});
test('retired readonly completion cannot overwrite a new generation report',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codlet-coverage-retire-')),metadata=deferred(),oldMethods=new Map(),newMethods=new Map();
  try{
    await host.activate(hostContext(root,1,metadata,oldMethods));const pending=oldMethods.get('readonly')(null,{caller:caller(1)});const rejected=assert.rejects(pending,/Test retired/);
    await host.deactivate();await host.activate(hostContext(root,2,deferred(),newMethods));
    metadata.resolve({runtimeVersion:'1.0.0-rc.20'});await rejected;
    const current=JSON.parse(fs.readFileSync(path.join(root,'host-report.json'),'utf8'));assert.equal(current.generation,2);assert.equal(current.phase,'idle');
    assert.throws(()=>newMethods.get('inspect')(null,{caller:caller(1)}),/generation/);
  }finally{await host.deactivate();fs.rmSync(root,{recursive:true});}
});
test('an explicit new interaction run does not reuse historical Native callback counters',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codlet-coverage-counters-')),methods=new Map();
  try{
    await host.activate(hostContext(root,1,deferred(),methods));const snapshot=host.saveState();snapshot.value.native.request=7;snapshot.value.native.response=8;host.restoreState(snapshot);
    await methods.get('run')(null,{caller:caller(1)});
    const current=methods.get('inspect')(null,{caller:caller(1)});assert.equal(current.native.request,0);assert.equal(current.native.response,0);assert.equal(snapshot.value.native.request,7);
  }finally{await host.deactivate();fs.rmSync(root,{recursive:true});}
});

async function readonlyRenderer({scripts=[],fetchSource,compatibility,width=1000,height=800,prepareResult,disposeWorkspace,onRunning}={}){
  let saved,disposed=0,preparations=0;const observed=report([{id:'management.read-and-resources',status:'passed'}]);
  const document={body:{append(){}},createElement:()=>({dataset:{},remove(){}}),querySelector(){assert.fail('Readonly check performed UI navigation');},querySelectorAll:()=>scripts};
  const context={pluginId:'compatibility.acceptance',version:'1.0.0-rc.2',generation:1,i18n:{locale:'en'},onDeactivate(){},rpc:{async request(_cap,method,args){
    if(method==='inspect')return {fixture:{autorun:false},report:observed,coverage:coverage.project({})};
    if(method==='readonly')return {report:observed,provenance:observed.provenance};if(method==='echo')return {value:args.value};
    if(method==='coverage')return coverage.project(args.report);if(method==='save-report'){saved=structuredClone(args.report);return {saved:true};}assert.fail('Readonly check called '+method);
  }},codex:{api:1,compatibility:{waitReady:async()=>compatibility??({available:true,initializing:false,build:{appVersion:'26.1023.50603',buildNumber:'22391'}})},backend:{read:async()=>({threads:[],models:[],providers:[],directories:[]}),write:()=>assert.fail('Native mutation')},navigation:{page:async()=>({path:'/fixture',dispose(){}}),newTaskDraft:()=>assert.fail('Native draft')},workspace:{connect:async()=>({
    getSnapshot:()=>({api:1,available:false,features:{navigation:true},diagnostic:{message:'Native main not selected'}}),prepare:async({features})=>{preparations++;if(prepareResult)return prepareResult(features);return {features:Object.fromEntries(features.map(feature=>[feature,{available:feature!=='shortcuts',diagnostic:feature==='shortcuts'?{message:'fixture shortcut mismatch'}:null}]))};},dispose(){disposed++;disposeWorkspace?.();},mountTranscript:()=>assert.fail('Mounted transcript'),mountComposer:()=>assert.fail('Mounted composer')
  })}}};
  const sandbox=vm.createContext({module:{exports:{}},document,innerWidth:width,innerHeight:height,setTimeout,clearTimeout,performance,AbortController,URL,crypto:{randomUUID,subtle:webcrypto.subtle},fetch:fetchSource,location:{href:'app://-/index.html'}});
  vm.runInContext(fs.readFileSync(new URL('./fixtures/runtime-compatibility/consumer/renderer.js',import.meta.url),'utf8'),sandbox);
  const plugin=sandbox.module.exports;
  try{await plugin.activate(context);const pending=vm.runInContext('globalThis[Symbol.for("codlet.functional.acceptance")]',sandbox).readonly();await onRunning?.(plugin);await pending;return {saved,disposed,preparations,snapshot:saved?plugin.saveState():null};}finally{plugin.deactivate();}
}
test('readonly Renderer prepares interfaces without drafts, navigation or model work',async()=>{
  const result=await readonlyRenderer();assert.equal(result.saved.phase,'complete');assert.equal(result.preparations,1);assert.equal(result.disposed,1);
  assert.equal(find(result.saved.coverage,'management.list').status,'read-verified');
  assert.equal(find(result.saved.coverage,'native.workspace.full-lifecycle').status,'not-verified');
  assert.equal(find(result.saved.coverage,'workspace.getSnapshot').status,'not-verified');
  assert.match(result.saved.provenance.native.unavailable,/incomplete/);assert.equal(result.snapshot.value.runId,'run-one');
});
test('Native identity follows all finite referenced sources without count or byte compatibility cutoffs',async()=>{
  const scripts=Array.from({length:35},(_,index)=>({src:`app://-/assets/app-initial-${index}.js`}));scripts.push(scripts[0]);let fetched=0;
  const result=await readonlyRenderer({scripts,fetchSource:async()=>{const size=fetched++===0?33*1024*1024:1;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(size)};}});
  assert.equal(fetched,35);assert.equal(result.saved.provenance.native.assets.length,35);assert.equal(result.saved.provenance.native.assets[0].bytes,33*1024*1024);assert.equal(result.saved.provenance.native.unavailable,undefined);
  assert.equal(find(result.saved.coverage,'workspace.getSnapshot').status,'read-verified');
});
test('initializing readiness is retained as unobserved rather than failed compatibility',async()=>{
  const result=await readonlyRenderer({compatibility:{available:false,initializing:true,build:{appVersion:'26.1023.50603',buildNumber:'22391'}}});
  assert.equal(result.saved.checks.find(check=>check.id==='desktop.compatibility').status,'manual');assert.equal(result.saved.phase,'complete');
});
test('consumer activation relies on Core ownership rather than viewport dimensions',async()=>{
  const result=await readonlyRenderer({width:160,height:120});assert.equal(result.saved.phase,'complete');assert.equal(result.preparations,1);
});
test('an unrelated application origin cannot supply Native source identity',async()=>{
  let fetched=0;const result=await readonlyRenderer({scripts:[{src:'app://foreign/assets/app-initial-fixture.js'}],fetchSource:async()=>{fetched++;assert.fail('Foreign application module fetched');}});
  assert.equal(fetched,0);assert.match(result.saved.provenance.native.unavailable,/incomplete/);assert.match(result.saved.provenance.native.assets[0].unavailable,/current-document/);
});
test('retirement disposes pending readonly workspace preparation and prevents report writes',async()=>{
  const started=deferred();let reject;
  const pending=new Promise((_resolve,fail)=>{reject=fail;});
  const result=await readonlyRenderer({prepareResult:()=>{started.resolve();return pending;},disposeWorkspace:()=>reject(Error('Workspace retired')),onRunning:async plugin=>{await started.promise;plugin.deactivate();}});
  assert.equal(result.saved,undefined);assert.equal(result.disposed,1);assert.equal(result.preparations,1);
});
