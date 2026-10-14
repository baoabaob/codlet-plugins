import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const host=require('./fixtures/runtime-compatibility/consumer/host.cjs');

test('functional fixture never enables native model interception outside its owned loopback profile',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codlet-functional-guard-'));
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));
  const pluginRoot=path.join(root,'fixture-plugins','compatibility.acceptance');fs.mkdirSync(pluginRoot,{recursive:true});
  try{
    for(const item of [
      {marker:false,url:'http://127.0.0.1:12345/v1',enabled:true,expected:false},
      {marker:true,url:'https://api.openai.com/v1',enabled:true,expected:false},
      {marker:true,url:'http://127.0.0.1:12345/v1',enabled:false,expected:false},
      {marker:true,url:'http://127.0.0.1:12345/v1',enabled:true,expected:true},
    ]){
      if(item.marker)fs.writeFileSync(path.join(root,'owner.txt'),'codlet-desktop-acceptance\n');
      fs.writeFileSync(path.join(pluginRoot,'fixture.json'),JSON.stringify({baseUrl:item.url,autorun:item.enabled}));
      const methods=new Map();let registrations=0,closed=0;
      await host.activate({root:pluginRoot,plugin:{id:'compatibility.acceptance',version:'0.0.3',generation:1},services:{},
        rpc:{provide:(_cap,method,handler)=>methods.set(method,handler)},
        traffic:{registerInterceptor:async()=>{registrations++;return {close:async()=>{closed++;}};}}});
      try{
        const inspect=methods.get('inspect'),report=inspect(null,{caller:{pluginId:'compatibility.acceptance'}});
        assert.equal(report.fixture.autorun,item.expected);
        assert.equal(report.report.phase,'idle');assert.equal(registrations,0);
        assert.throws(()=>inspect(null,{caller:{pluginId:'foreign.plugin'}}),/Only the test plugin/);
        if(item.expected)await methods.get('native.begin')(null,{caller:{pluginId:'compatibility.acceptance'}});
        else await assert.rejects(()=>methods.get('native.begin')(null,{caller:{pluginId:'compatibility.acceptance'}}),/owned loopback/);
        assert.equal(registrations,Number(item.expected));
      }finally{await host.deactivate();}
      assert.equal(closed,Number(item.expected));
      assert.equal(JSON.parse(fs.readFileSync(path.join(pluginRoot,'cleanup.json'))).retired,true);
    }
  }finally{fs.rmSync(root,{recursive:true});}
});

function draftOpener(){
  let now=0;
  const sandbox=vm.createContext({module:{exports:{}},Date:{now:()=>now},setTimeout:(callback,delay)=>{now+=delay;queueMicrotask(callback);}});
  const source=fs.readFileSync(new URL('./fixtures/runtime-compatibility/consumer/renderer.js',import.meta.url),'utf8');
  vm.runInContext(source,sandbox);
  return vm.runInContext('openDraftWhenReady',sandbox);
}

test('draft checks wait for native navigation without replaying an applied action',async()=>{
  const open=draftOpener(),params={prompt:'Unsent test draft'};let calls=0,actions=0;
  const result=await open(async(capability,method,args,options)=>{
    assert.equal(capability,'codex.ui.navigation.page');assert.equal(method,'newTaskDraft');assert.equal(args,params);assert.ok(options.timeoutMs>0&&options.timeoutMs<=10000);
    calls++;
    if(calls===1)throw Object.assign(Error('Waiting for the current native navigation tree'),{code:'ui_host_pending'});
    if(calls===2)throw Error('ui_host_pending: Waiting for the current native navigation tree');
    actions++;return {opened:true,submitted:false};
  },()=>true,params);
  assert.equal(calls,3);assert.equal(actions,1);assert.deepEqual(result,{opened:true,submitted:false});
});

test('draft checks preserve uncertain failures and never replay them',async()=>{
  for(const code of ['request_timeout','invalid_owner','ui_host_drift']){
    const open=draftOpener();let calls=0;
    const failure=Object.assign(Error(code),{code});
    await assert.rejects(()=>open(async()=>{calls++;throw failure;},()=>true,{prompt:'Unsent test draft'}),error=>error===failure);
    assert.equal(calls,1);
  }
});

test('draft navigation waits end at their deadline and at generation retirement',async()=>{
  const pending=Object.assign(Error('Waiting for the current native navigation tree'),{code:'ui_host_pending'});
  let calls=0;
  await assert.rejects(()=>draftOpener()(async()=>{calls++;throw pending;},()=>true,{prompt:'Unsent test draft'},160),error=>error===pending);
  assert.ok(calls<=3);
  let alive=true,retiredCalls=0;
  await assert.rejects(()=>draftOpener()(async()=>{retiredCalls++;alive=false;throw pending;},()=>alive,{prompt:'Unsent test draft'}),/Test retired/);
  assert.equal(retiredCalls,1);
});

test('complete reports can only be saved by the owning plugin generation and remain bounded',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codlet-functional-report-'));
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));
  const methods=new Map(),caller={caller:{pluginId:'compatibility.acceptance'}};
  try{
    await host.activate({root,plugin:{id:'compatibility.acceptance',version:'0.0.3',generation:4},services:{},rpc:{provide:(_cap,method,handler)=>methods.set(method,handler)}});
    const save=methods.get('save-report'),report={schema:1,version:'0.0.3',generation:4,phase:'complete',checks:[{id:'native.editable-draft',status:'passed'},{id:'desktop.model-operations',status:'manual'}]};
    assert.throws(()=>save({report},{caller:{pluginId:'foreign.plugin'}}),/Only the test plugin/);
    assert.throws(()=>save({report:{...report,generation:3}},caller),/this generation/);
    assert.throws(()=>save({report:{...report,padding:'x'.repeat(65536)}},caller),/size limit/);
    assert.deepEqual(save({report},caller),{saved:true});
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'functional-report.json'),'utf8')),report);
    assert.equal(methods.get('inspect')(null,caller).fixture.autorun,false);
  }finally{await host.deactivate();fs.rmSync(root,{recursive:true});}
});

test('functional Host state carries observations and never reconstructs live model or server work',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codlet-functional-state-'));
  try{
    const methods=new Map(),context={root,plugin:{id:'compatibility.acceptance',version:'1.0.0-rc.1',generation:1},services:{},rpc:{provide:(_cap,method,handler)=>methods.set(method,handler)}};
    await host.activate(context);
    const snapshot=host.saveState();assert.equal(snapshot.schema,1);assert.equal(snapshot.value.report.phase,'idle');assert.doesNotMatch(JSON.stringify(snapshot),/detached|nativeInterceptor|baseUrl|"server":/);
    await host.deactivate();methods.clear();await host.activate({...context,plugin:{...context.plugin,generation:2}});
    host.restoreState(snapshot);
    const observed=methods.get('inspect')(null,{caller:{pluginId:'compatibility.acceptance'}});
    assert.equal(observed.report.generation,2);assert.equal(observed.report.phase,'idle');assert.equal(observed.native.request,0);
    assert.throws(()=>host.restoreState({schema:1,value:{report:{schema:1,phase:'running'}}}),/not transferable/);
  }finally{await host.deactivate();fs.rmSync(root,{recursive:true});}
});

test('settled consumer explicitly releases only idle owned fixture traffic and keeps its report',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codlet-functional-release-'));
  const pluginRoot=path.join(root,'fixture-plugins','compatibility.acceptance');fs.mkdirSync(pluginRoot,{recursive:true});
  fs.writeFileSync(path.join(root,'owner.txt'),'codlet-desktop-acceptance\n');
  fs.writeFileSync(path.join(pluginRoot,'fixture.json'),JSON.stringify({baseUrl:'http://127.0.0.1:12345/v1',autorun:true}));
  const methods=new Map(),caller={caller:{pluginId:'compatibility.acceptance'}};let closed=0,exchanges=1;
  try{
    await host.activate({root:pluginRoot,plugin:{id:'compatibility.acceptance',version:'1.0.0-rc.1',generation:2},services:{},rpc:{provide:(_cap,method,handler)=>methods.set(method,handler)},
      traffic:{registerInterceptor:async()=>({inspect:()=>({exchanges}),close:async()=>{closed++;}})}});
    await methods.get('native.begin')(null,caller);
    await assert.rejects(()=>methods.get('native.end')(null,{caller:{pluginId:'foreign.plugin'}}),/Only the test plugin/);
    await assert.rejects(()=>methods.get('native.end')(null,caller),/must settle/);
    const snapshot=host.saveState();snapshot.value.report.phase='complete';snapshot.value.report.checks=[{id:'synthetic',status:'passed'}];host.restoreState(snapshot);
    await assert.rejects(()=>methods.get('native.end')(null,caller),/Accepted fixture traffic must settle/);assert.equal(closed,0);
    exchanges=0;assert.deepEqual(await methods.get('native.end')(null,caller),{released:true});assert.equal(closed,1);
    assert.deepEqual(await methods.get('native.end')(null,caller),{released:true});assert.equal(closed,1);
    assert.equal(host.saveState().value.report.checks[0].id,'synthetic');
  }finally{await host.deactivate();fs.rmSync(root,{recursive:true});}
  assert.equal(closed,1,'retirement does not replay an explicitly completed close');
});

test('full readonly consumer activates its own page before each draft and preserves Core active-page admission',async()=>{
  let pageActive=false,action=null,activations=0,drafts=0,saved;
  const order=[],source=fs.readFileSync(new URL('./fixtures/runtime-compatibility/consumer/renderer.js',import.meta.url),'utf8');
  const document={body:{append(){}},createElement(){return{dataset:{},remove(){}};},querySelector(selector){
    if(selector.startsWith('[data-codlet-navigation-entry='))return{click(){pageActive=true;activations++;order.push('page');}};
    if(selector==='[data-functional-test-panel]'||selector==='[data-codlet-page-toolbar]')return pageActive?{}:null;
    if(selector.includes('data-codlet-composer-action-instance'))return action?{click:action}:null;
    return null;
  }};
  const fixture={autorun:false},report={phase:'complete',checks:[]};
  const context={pluginId:'compatibility.acceptance',version:'1.0.0-rc.1',generation:1,i18n:{locale:'en'},onDeactivate(){},
    rpc:{async request(_cap,method,args){
      if(method==='inspect')return{fixture,report};
      if(method==='echo')return{value:args.value,hostGeneration:1};
      if(method==='events')return{topic:'fixture',cursor:0};
      if(method==='save-report'){saved=args.report;return{saved:true};}
      if(method==='native.begin')assert.fail('readonly run dispatched model work');
      return{};
    }},
    services:{storage:{snapshot:async()=>({schema:1})},events:{subscribe:async()=>({subscription:'fixture'}),read:async()=>({events:[{value:{marker:'host-to-renderer'}}]}),close:async()=>{}}},
    codex:{api:1,compatibility:{waitReady:async()=>({available:true})},backend:{read:async()=>({threads:[],models:[],directories:[],providers:[]})},
      navigation:{page:async()=>({path:'/fixture',dispose(){}}),async newTaskDraft(){
        if(!pageActive)throw Object.assign(Error('A new task draft requires this caller’s active page'),{code:'invalid_owner'});
        order.push('draft');drafts++;pageActive=false;return{opened:true,submitted:false};
      }},composer:{async registerAction(_options,callback){action=callback;return{async unregister(){action=null;}};}}},
  };
  const sandbox=vm.createContext({module:{exports:{}},document,innerWidth:1000,innerHeight:800,crypto:{randomUUID},setTimeout,clearTimeout});
  vm.runInContext(source,sandbox);const plugin=sandbox.module.exports;
  try{
    await plugin.activate(context);await vm.runInContext('globalThis[SYMBOL]',sandbox).run();
    assert.equal(saved.phase,'complete');assert.equal(drafts,2);assert.equal(activations,2);
    assert.deepEqual(order,['page','draft','page','draft']);
    for(const id of ['composer.action-click-and-cleanup','native.page-toolbar-and-ui-controls','native.editable-draft'])assert.equal(saved.checks.find(item=>item.id===id).status,'passed');
    assert.equal(saved.checks.find(item=>item.id==='desktop.model-operations').status,'manual');
  }finally{plugin.deactivate();}
});
