import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { reactFactories } from '../frontend/src/adapter/react-factories.js';
const desktop = readFileSync(new URL('../bundled/codex-desktop-adapter/renderer.js', import.meta.url), 'utf8');
function fixture() {
  const context = vm.createContext({ module:{exports:{}},setTimeout,clearTimeout,location:{origin:'app://-',pathname:'/index.html'} });
  vm.runInContext(desktop,context);
  const native = vm.runInContext(`(()=>{
    const token={id:Symbol()},client={requestPromises:new Map(),sendRequest(){},setAppServerVersion(){},getAppServerVersion:()=> 'future-protocol',onError(){}};
    const manager={requestClient:client,getHostId:()=> 'local'};
    for(const name of ['sendRequest','getConversation','getStreamRole','addNotificationCallback','addConversationStateCallback','replyWithCommandExecutionApprovalDecision','replyWithFileChangeApprovalDecision','replyWithPermissionsRequestApprovalResponse','replyWithUserInputResponse'])manager[name]=()=>{};
    const managerFamily={scope:token,read:()=>manager},clientFamily={scope:token,read:()=>client};
    const node={token,store:{},familyBindings:new Map([[managerFamily,new Map([['local',manager]])],[clientFamily,new Map([['local',client]])]])};
    const chain=new Map([[token.id,node]]),root={__reactContainer$fixture:{memoizedProps:{value:chain}}};
    const urls=[{href:'app://-/assets/app-shared-renamed-123.js'}];
    document={readyState:'complete',scripts:[{src:'app://-/assets/index-future.js'}],querySelectorAll:()=>urls,getElementById:()=>root};
    electronBridge={getSentryInitOptions:()=>({appVersion:'unlisted-version',buildNumber:'future'}),sendMessageFromView(){throw Error('must reuse native transport')}};
    const postbox={postMessage(){},getState(){},setState(){}};
    return {token,client,manager,managerFamily,clientFamily,node,chain,root,urls,postbox};
  })()`,context);
  const imports=[];
  const module={arbitraryRenamedExport:native.postbox};
  return {context,native,module,imports,probe:()=>vm.runInContext('probeDesktop',context)(async url=>{imports.push(url);return module;},0)};
}
test('unlisted build, renamed exports and backend version pass actual contracts without a profile',async()=>{
  const f=fixture(),connection=await f.probe();
  assert.equal(connection.manager,f.native.manager);assert.equal(connection.client,f.native.client);assert.equal(connection.postbox,f.native.postbox);
  assert.equal(connection.build.appVersion,'unlisted-version');assert.equal(connection.build.appServerVersion,'future-protocol');
  assert.equal(connection.build.compatibility,'structural');connection.check();
  assert.deepEqual(f.imports,['app://-/assets/app-shared-renamed-123.js']);
  f.native.clientFamily.read=()=>({});assert.throws(()=>connection.check());
});
test('partial, remote, unbound and ambiguous connections cannot acquire a transport',async()=>{
  for(const mutate of [f=>{f.native.node.familyBindings.get(f.native.clientFamily).clear();},f=>{f.native.manager.getHostId=()=> 'remote';},f=>{f.native.clientFamily.scope={};}]){
    const f=fixture();mutate(f);await assert.rejects(f.probe(),{code:'desktop_connection_not_ready'});assert.equal(f.imports.length,0);
  }
  const f=fixture();f.native.urls.push({href:'app://-/assets/app-shared-second.js'});
  await assert.rejects(f.probe(),{code:'desktop_asset_ambiguous'});assert.equal(f.imports.length,0);
});
test('cached task families do not consume local service reads; eligible reads remain bounded',async()=>{
  const f=fixture();f.context.fixtureNative=f.native;
  vm.runInContext(`for(let i=0;i<3000;i++)fixtureNative.node.familyBindings.set({scope:fixtureNative.token,read(){throw Error('must not read task bindings')}},new Map([['task-'+i,{}]]));`,f.context);
  const connection=await f.probe();assert.equal(connection.manager,f.native.manager);connection.check();
  const saturated=fixture();saturated.context.fixtureNative=saturated.native;
  vm.runInContext(`for(let i=0;i<600;i++)fixtureNative.node.familyBindings.set({scope:fixtureNative.token,read:()=>({})},new Map([['local',{}]]));`,saturated.context);
  await assert.rejects(saturated.probe(),{code:'desktop_scope_drift'});assert.equal(saturated.imports.length,0);
});
test('missing manager methods and ambiguous or immutable transports do not install an interceptor',async()=>{
  for(const mutate of [f=>{f.native.manager.sendRequest=undefined;},f=>{f.module.decoy={...f.native.postbox};},f=>{Object.defineProperty(f.native.postbox,'postMessage',{writable:false});}]){
    const f=fixture(),original=f.native.postbox.postMessage;mutate(f);await assert.rejects(f.probe());assert.equal(f.native.postbox.postMessage,original);
  }
});
const factorySource = suffix => `
const react${suffix}=cjs(e=>{e.createElement=()=>{};e.useState=()=>{};e.useEffect=()=>{};e.Fragment=Symbol();e.version='x';});
const wrap${suffix}=cjs((e,m)=>{m.exports=react${suffix}()});
const dom${suffix}=cjs(e=>{e.createPortal=()=>{};e.flushSync=()=>{};e.version='x'});
const client${suffix}=cjs(e=>{e.createRoot=()=>{throw Error('must never execute during discovery')}});
export{wrap${suffix} as r${suffix},dom${suffix} as d${suffix},client${suffix} as c${suffix}};`;
test('React resolution follows parsed export relationships across arbitrary renaming without execution',()=>{
  for(const suffix of ['a','future_123'])assert.deepEqual(reactFactories(factorySource(suffix)),{react:'r'+suffix,dom:'d'+suffix,client:'c'+suffix});
});
test('React resolution rejects missing, duplicate and misleading factory contracts',()=>{
  assert.throws(()=>reactFactories(factorySource('a').replace('e.useState=()=>{};','')),{code:'ui_react_drift'});
  assert.throws(()=>reactFactories(factorySource('a')+factorySource('b')),{code:'ui_react_drift'});
  assert.throws(()=>reactFactories('const text='+JSON.stringify(factorySource('a'))+';'),{code:'ui_react_drift'});
  assert.throws(()=>reactFactories(' '.repeat(16*1024*1024+1)),{code:'ui_react_drift'});
});
