// Controlled, offline performance workloads. These are Node/jsdom measurements,
// not a claim about Chromium's total RSS or production network throughput.
// node --expose-gc scripts/profile-runtime.mjs <navigation|ui|gui|desktop> <report.json>
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import {writeHeapSnapshot} from 'node:v8';
import {uiFixture,tick} from '../tests/support/ui-fixture.mjs';
import {createPreviewRuntime} from './preview-runtime.mjs';

if(!global.gc)throw Error('Run with --expose-gc');
const [kind,output]=process.argv.slice(2);
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {buildSync}=require('esbuild');
const cwd=fileURLToPath(new URL('../frontend',import.meta.url));
const immediate=()=>new Promise(resolve=>setImmediate(resolve));
const collect=async()=>{for(let i=0;i<3;i++){await immediate();global.gc();}return process.memoryUsage().heapUsed;};
const cpu=before=>{const used=process.cpuUsage(before);return (used.user+used.system)/1000;};
const compile=(relative,name,resolveDir=cwd)=>buildSync({absWorkingDir:cwd,stdin:{contents:readFileSync(new URL(relative,import.meta.url),'utf8'),resolveDir},bundle:true,write:false,format:'iife',globalName:name,platform:'browser',loader:{'.svg':'text'},define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
const result={schema:1,kind,node:process.version,platform:process.platform,arch:process.arch,method:'Offline production bundles; Node --expose-gc; jsdom disables CSS parsing. Heap samples follow three full GCs. Native/backend responses are fixtures.'};
const resources=f=>({observers:f.observers.size,mediaListeners:f.mediaListeners.size,ownedNodes:f.document.querySelectorAll('[data-codlet-official-ui],[data-codlet-page-lease],[data-codlet-native-navigation]').length,cleanupCallbacks:f.cleanups.size});

async function mutations(f){
  const main=f.document.querySelector('main')??f.document.body;
  const content=f.document.createElement('article');
  content.innerHTML='<p>Historical message</p>'.repeat(1000);main.append(content);
  const live=f.document.createElement('span');content.append(live);await tick();
  const original=f.document.querySelectorAll.bind(f.document),counts={sidebar:0,pageHost:0,toolbar:0};
  f.document.querySelectorAll=(selector,...rest)=>{if(selector==='nav button.sidebar-item')counts.sidebar++;if(selector==='[data-codlet-page-host]')counts.pageHost++;if(selector==='[data-codlet-page-toolbar]')counts.toolbar++;return original(selector,...rest);};
  const run=async count=>{for(let i=0;i<count;i++){live.textContent=String(i);await Promise.resolve();await Promise.resolve();}};
  await run(100);result.streaming=[];
  for(let trial=0;trial<5;trial++){
    for(const key of Object.keys(counts))counts[key]=0;
    await collect();const used=process.cpuUsage(),start=performance.now();await run(1000);
    result.streaming.push({batches:1000,historyElements:1000,wallMs:performance.now()-start,cpuMs:cpu(used),documentScans:{...counts}});
  }
  f.document.querySelectorAll=original;content.remove();await tick();
}

if(kind==='navigation'){
  const f=uiFixture();
  result.fixtureResources=resources(f);
  const native=f.window.eval(compile('../tests/support/native-shell.js','NativeShell')+';NativeShell;');
  const shell=native.mount(),adapter=f.window.eval(compile('../frontend/src/adapter/navigation.js','Adapter',cwd+'/src/adapter')+';Adapter;');
  result.baselineHeap=await collect();
  let navigation=adapter.createNavigation(f.context,native,adapter.locateHost());
  const lease=f.document.createElement('span');Object.assign(lease.dataset,{codletPageLease:'profile-native-page-token',codletPageOwner:f.context.pluginId,codletGeneration:'1'});f.document.body.append(lease);
  navigation.register({label:'Codlet',icon:'Cube',token:lease.dataset.codletPageLease},{caller:{pluginId:f.context.pluginId,generation:1}});await tick();
  result.activeHeap=await collect();await mutations(f);
  navigation.dispose();navigation=null;lease.remove();await tick();
  result.lifecycle=[];
  for(let n=0;n<=60;n++){
    if(n){let nav=adapter.createNavigation(f.context,native,adapter.locateHost());f.document.body.append(lease);nav.register({label:'Codlet',icon:'Cube',token:lease.dataset.codletPageLease},{caller:{pluginId:f.context.pluginId,generation:1}});await tick();nav.dispose();nav=null;lease.remove();await tick();}
    if(n%10===0)result.lifecycle.push({cycles:n,heapUsed:await collect(),...resources(f)});
  }
  assert.equal(f.errors.length,0);shell.dispose();f.dispose();
}else if(kind==='ui'){
  const f=uiFixture();result.fixtureResources=resources(f);result.baselineHeap=await collect();
  let ui=f.context.ui.create();await ui.page({label:'Codlet',toolbar:true,render:()=>null});await tick();
  result.activeHeap=await collect();await mutations(f);ui.dispose();ui=null;
  // The mock adapter owns its navigation button; remove that fixture-owned DOM.
  f.document.querySelector('nav').replaceChildren();await tick();
  result.afterDispose={heapUsed:await collect(),...resources(f)};assert.equal(f.errors.length,0);f.dispose();
}else if(kind==='gui'){
  const demo=createPreviewRuntime(),f=uiFixture({request:demo.request}),fixtureCleanups=new Set(f.cleanups);
  const source=readFileSync(new URL('../bundled/codlet/dist/renderer.js',import.meta.url),'utf8');
  const load=()=>{const module={exports:{}};f.window.Function('module','exports',source)(module,module.exports);return module.exports;};
  result.fixtureResources=resources(f);result.baselineHeap=await collect();result.lifecycle=[];result.renderMs=[];
  const retiredFunctions=[],retiredPanels=[],cycles=Number(process.env.CODLET_PROFILE_CYCLES??40);
  // Finish the cleanup stack before measuring. V8 can retain its last loop
  // callback in a stack slot, which is a profiler-owned reference, not a leak.
  async function cycle(n){
    let plugin=load();await plugin.activate(f.context);const start=performance.now();await f.open();result.renderMs.push(performance.now()-start);
    assert.ok(f.document.querySelector('[data-codlet-panel]'),JSON.stringify({cycle:n,errors:f.errors.map(e=>String(e.stack??e.message??e))}));
    if(process.env.CODLET_PROFILE_HEAP)plugin.activate.codletProfileSentinel=true;
    retiredFunctions.push(new WeakRef(plugin.activate));retiredPanels.push(new WeakRef(f.document.querySelector('[data-codlet-panel]')));
    if(n===5)result.activeHeap=await collect();
    // Model the focus transfer to another native control on page departure.
    f.document.getElementById('host-editor').focus();await f.leave();plugin.deactivate();
    for(const cleanup of [...f.cleanups])if(!fixtureCleanups.has(cleanup)){cleanup();f.cleanups.delete(cleanup);}
    f.document.querySelector('nav').replaceChildren();f.calls.length=0;plugin=null;await tick();
  }
  for(let n=0;n<cycles;n++){
    await cycle(n);await immediate();
    if(n%5===4)result.lifecycle.push({cycles:n+1,heapUsed:await collect(),...resources(f),retainedPluginFunctions:retiredFunctions.filter(ref=>ref.deref()).length,retainedPanels:retiredPanels.filter(ref=>ref.deref()).length});
  }
  result.finalRetirement={heapUsed:await collect(),retainedPluginFunctions:retiredFunctions.filter(ref=>ref.deref()).length,retainedPanels:retiredPanels.filter(ref=>ref.deref()).length};
  assert.equal(f.errors.length,0);f.dispose();
  result.afterWindowClosed={heapUsed:await collect(),retainedPluginFunctions:retiredFunctions.filter(ref=>ref.deref()).length,retainedPanels:retiredPanels.filter(ref=>ref.deref()).length};
  if(process.env.CODLET_PROFILE_HEAP){await immediate();writeHeapSnapshot(process.env.CODLET_PROFILE_HEAP);}
}else if(kind==='desktop'){
  const source=readFileSync(new URL('../bundled/codex-desktop-adapter/renderer.js',import.meta.url),'utf8');
  const scope=vm.createContext({module:{exports:{}},setTimeout,clearTimeout,AbortController,URL,crypto:globalThis.crypto});
  const create=vm.runInContext(source+'\ncreateAdapter',scope),build=vm.runInContext('BUILDS',scope)[0];
  const callbacks=new Map(),cleanups=new Set(),endpoints=new Map(),postbox={postMessage(){}};
  const manager={getConversation:()=>null,getStreamRole:()=>({role:'owner'}),sendRequest:async()=>({}),addNotificationCallback(_methods,fn){callbacks.set('notification',fn);return()=>callbacks.delete('notification');},addConversationStateCallback(fn){callbacks.set('conversation',fn);return()=>callbacks.delete('conversation');},replyWithCommandExecutionApprovalDecision(){},replyWithFileChangeApprovalDecision(){},replyWithPermissionsRequestApprovalResponse(){},replyWithUserInputResponse(){}};
  const context={world:'main',pluginId:'adapter',generation:1,reportDiagnostic(){},onDeactivate(fn){cleanups.add(fn);return()=>cleanups.delete(fn);},rpc:{provide(cap,method,handler){endpoints.set(cap.name+':'+method,handler);},unavailable(cap){for(const key of endpoints.keys())if(key.startsWith(cap.name+':'))endpoints.delete(key);}}};
  const connection={manager,client:{requestPromises:new Map(),onError(){}},postbox,build,check(){}};
  result.baselineHeap=await collect();let adapter=create(connection,context);result.activeHeap=await collect();
  result.events=[];
  for(let round=0;round<5;round++){
    const start=performance.now(),used=process.cpuUsage();
    for(let i=0;i<10000;i++)callbacks.get('notification')({method:'item/agentMessage/delta',params:{threadId:'thread-a',turnId:'turn-a',itemId:'item-a',delta:String(i)+':'+ 'x'.repeat(1024)}});
    result.events.push({events:(round+1)*10000,wallMs:performance.now()-start,cpuMs:cpu(used),heapUsed:await collect()});
  }
  adapter.dispose();adapter=null;endpoints.clear();result.afterEventsDispose={heapUsed:await collect(),callbacks:callbacks.size,endpoints:endpoints.size};
  result.lifecycle=[];
  for(let i=1;i<=100;i++){
    let instance=create(connection,context);instance.dispose();instance=null;for(const stop of [...cleanups])stop();cleanups.clear();endpoints.clear();
    if(i%10===0)result.lifecycle.push({cycles:i,heapUsed:await collect(),callbacks:callbacks.size,endpoints:endpoints.size,cleanups:cleanups.size});
  }
  result.limitations='Uses a mock connection.check, so CPU excludes native React-scope validation, real IPC, network, and service streaming.';
}else throw Error('Unknown workload '+kind);
mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({kind,output,baselineHeap:result.baselineHeap,activeHeap:result.activeHeap,streaming:result.streaming,first:result.lifecycle?.[0],last:result.lifecycle?.at(-1),afterDispose:result.afterDispose??result.afterEventsDispose}));
