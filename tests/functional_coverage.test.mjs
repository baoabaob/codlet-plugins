import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const coverage=require('./fixtures/runtime-compatibility/consumer/coverage.cjs');
const provenance={observedAt:'2026-10-21T00:00:00Z',core:{version:'candidate'},native:{build:{appVersion:'fixture'}}};
const find=(value,id)=>value.rows.find(row=>row.id===id);

test('coverage keeps missing operations, interface availability and actual operations distinct',()=>{
  const result=coverage.project({provenance,checks:[
    {id:'management.read-and-resources',status:'passed'},
    ...coverage.sourceChecks({attached:false,activatedSources:[],unsupportedSources:[{id:'desktop-main-http',reason:'hook_unavailable'}]}),
    {id:'workspace.interface.navigation',status:'passed'},
  ]});
  assert.equal(result.total,coverage.catalog.entries.length);
  assert.equal(find(result,'management.list').status,'read-verified');
  assert.equal(find(result,'native.traffic.desktop-main-http').status,'unavailable');
  assert.equal(find(result,'native.traffic.model-transform').status,'not-verified');
  assert.equal(find(result,'native.workspace.navigation-interface').status,'interface-verified');
  for(const id of ['workspace.navigation.open','workspace.mountTranscript','native.workspace.input-ownership','native.workspace.full-lifecycle','native.workspace.physical-ime']){
    assert.equal(find(result,id).status,'not-verified',id);
  }
  assert.equal(result.counts['operation-verified'],0);
  assert.deepEqual(result.unmappedChecks,[]);
});

test('historical and identity-free checks do not become current verifications',()=>{
  const checks=[{id:'native.editable-draft',status:'passed'}];
  for(const report of [{checks},{provenance,historical:true,checks},{provenance,host:{historical:true,checks}}]){
    const result=coverage.project(report);
    assert.equal(find(result,'codex.navigation.newTaskDraft').status,'not-verified');
    assert.equal(find(result,'codex.navigation.newTaskDraft').evidence[0].historical,true);
  }
  assert.equal(find(coverage.project({provenance,checks}),'codex.navigation.newTaskDraft').status,'operation-verified');
});

test('a failing repeat cannot be hidden by a successful observation or source attachment',()=>{
  const result=coverage.project({provenance,checks:[
    {id:'native.editable-draft',status:'passed'},{id:'native.editable-draft',status:'failed',error:{message:'draft mismatch'}},
    ...coverage.sourceChecks({attached:true,activatedSources:[{id:'desktop-main-http',protocols:['http']}]}),
  ]});
  assert.equal(find(result,'codex.navigation.newTaskDraft').status,'unavailable');
  assert.equal(find(result,'native.traffic.desktop-main-http').status,'interface-verified');
  assert.equal(find(result,'native.traffic.model-transform').status,'not-verified');
});

test('read-only renderer inspects all workspace roles without opening drafts, roots or model work',async()=>{
  let saved,disposed=0,preparations=0;
  const host={phase:'complete',checks:[{id:'management.read-and-resources',status:'passed'}],provenance};
  const document={body:{append(){}},createElement:()=>({dataset:{},remove(){}}),querySelector(){assert.fail('Read-only check navigated the DOM');}};
  const context={pluginId:'compatibility.acceptance',version:'1.0.0-rc.2',generation:1,i18n:{locale:'en'},onDeactivate(){},
    rpc:{async request(_cap,method,args){
      if(method==='inspect')return{fixture:{autorun:false},report:host,coverage:coverage.project({})};
      if(method==='echo')return{value:args.value};
      if(method==='readonly')return{report:host,provenance};
      if(method==='coverage')return coverage.project(args.report);
      if(method==='save-report'){saved=args.report;return{saved:true};}
      assert.fail('Read-only check called '+method);
    }},
    codex:{api:1,compatibility:{waitReady:async()=>({available:true,build:{appVersion:'fixture',buildNumber:'1'}})},
      backend:{read:async()=>({threads:[],models:[],providers:[],directories:[]}),write:()=>assert.fail('Model or navigation write')},
      navigation:{page:async()=>({path:'/fixture',dispose(){}}),newTaskDraft:()=>assert.fail('Created draft')},
      workspace:{connect:async()=>({
        getSnapshot:()=>({api:1,available:false,features:{navigation:true},diagnostic:{message:'Ambiguous Native main input'}}),
        prepare:async({features})=>{preparations++;return {features:Object.fromEntries(features.map(feature=>[feature,{available:feature!=='shortcuts',diagnostic:feature==='shortcuts'?{message:'ambiguous keymap'}:null}]))};},
        dispose(){disposed++;},mountTranscript:()=>assert.fail('Mounted transcript'),mountComposer:()=>assert.fail('Mounted composer'),
      })},
    }};
  const sandbox=vm.createContext({module:{exports:{}},document,innerWidth:1000,innerHeight:800,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(new URL('./fixtures/runtime-compatibility/consumer/renderer.js',import.meta.url),'utf8'),sandbox);
  try{
    await sandbox.module.exports.activate(context);
    await vm.runInContext('globalThis[Symbol.for("codlet.functional.acceptance")]',sandbox).readonly();
    assert.equal(saved.phase,'complete');assert.equal(preparations,1);assert.equal(disposed,1);
    assert.equal(find(saved.coverage,'native.workspace.shortcuts-interface').status,'unavailable');
    assert.equal(find(saved.coverage,'workspace.getSnapshot').status,'read-verified');
    assert.equal(find(saved.coverage,'native.workspace.surface').status,'unavailable');
    assert.equal(find(saved.coverage,'native.workspace.full-lifecycle').status,'not-verified');
    assert.equal(find(saved.coverage,'workspace.navigation.open').status,'not-verified');
    assert.equal(saved.provenance.native.build.appVersion,'fixture');
    assert.match(saved.provenance.native.unavailable,/incomplete/);
    const snapshot=sandbox.module.exports.saveState();sandbox.module.exports.restoreState(snapshot);
    assert.equal(vm.runInContext('globalThis[Symbol.for("codlet.functional.acceptance")].inspect().historical',sandbox),true);
  }finally{sandbox.module.exports.deactivate();}
});
