import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createWorkspaceLocations } from '../frontend/src/adapter/workspace-location.js';
import { createWorkspaceSelection } from '../frontend/src/adapter/workspace-selection.js';
import { createWorkspaceViewports } from '../frontend/src/adapter/workspace-viewport.js';
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('opaque location restores exact Native page state without returning state or invoking a draft API',async t=>{
  const dom=new JSDOM('<div id="root"></div>'),document=dom.window.document;t.after(()=>dom.window.close());
  const state={privateDraft:'never-export'},navigator={location:{pathname:'/settings/preferences',search:'?a=1',hash:'#section',state,key:'origin'}};
  const host={navigator,rootNode:document.getElementById('root')},calls=[];
  const provider=createWorkspaceLocations({document,host:()=>host,load:async()=>({restoreLocation(location){calls.push(location);navigator.location={...location};}}),check(){},changed(){}});
  t.after(()=>provider.dispose());const handle=provider.capture(()=>{});await handle.ready;
  assert.deepEqual(Object.keys(handle),['ready','kind','restore','dispose']);assert.equal(JSON.stringify(handle).includes('never-export'),false);
  navigator.location={pathname:'/local/another-thread',search:'',hash:'',state:null};
  assert.deepEqual(await handle.restore(),{restored:true,kind:'page'});assert.equal(calls.length,1);assert.equal(navigator.location.state,state);
  assert.equal(navigator.location.search,'?a=1');assert.equal(navigator.location.hash,'#section');handle.dispose();
  await assert.rejects(handle.restore(),{code:'workspace_retired'});
});

test('capture cannot silently bind a different page during Native readiness and cancellation releases its guard',async t=>{
  const dom=new JSDOM('<div id="root"></div>'),document=dom.window.document;t.after(()=>dom.window.close());
  const navigator={location:{pathname:'/',state:null}},host={navigator,rootNode:document.getElementById('root')};let resolve,released=0;
  const provider=createWorkspaceLocations({document,host:()=>host,load:()=>new Promise(yes=>{resolve=yes;}),check(){},changed(){},retainGuard:()=>()=>released++});
  const handle=provider.capture(()=>{});await tick();navigator.location={pathname:'/settings',state:null};resolve({restoreLocation(){assert.fail('must not restore unready capture');}});
  await assert.rejects(handle.ready,{code:'workspace_location_superseded'});handle.dispose();assert.equal(released,1);provider.dispose();
});

test('selection presentation masks unselected Native actions, preserves drag parent and restores journal on release',t=>{
  const dom=new JSDOM('<header id="header" style="-webkit-app-region:drag"><div id="title">Native title</div><button id="action">Action</button></header>');t.after(()=>dom.window.close());
  const document=dom.window.document,header=document.getElementById('header'),title=document.getElementById('title'),button=document.getElementById('action');
  let selected='thread-a',confirmed=true;const provider=createWorkspaceSelection({document,surface:()=>({header}),snapshot:()=>({threadId:selected}),check(){},changed(){},isConfirmed:()=>confirmed});
  const lease=provider.acquire({threadId:null,emptyLabel:'未选择会话'},'consumer',()=>{});
  assert.equal(button.hasAttribute('inert'),true);assert.equal(title.style.visibility,'hidden');assert.equal(header.hasAttribute('inert'),false);
  assert.equal(header.querySelector('[data-codlet-workspace-owned]').textContent,'未选择会话');
  confirmed=false;assert.throws(()=>lease.update({threadId:'thread-a'}),{code:'workspace_selection_not_confirmed'});
  confirmed=true;lease.update({threadId:'thread-a'});assert.equal(button.hasAttribute('inert'),false);assert.equal(title.style.visibility,'');
  selected='thread-b';provider.reconcile();assert.equal(button.hasAttribute('inert'),true,'an externally changed route cannot masquerade as selected A');
  lease.dispose();assert.equal(button.hasAttribute('inert'),false);assert.equal(header.querySelector('[data-codlet-workspace-owned]'),null);
});

test('unsupported independent viewport fails closed without allocating state or poisoning later teardown',async()=>{
  const provider=createWorkspaceViewports({load:async()=>{throw Object.assign(Error('No verified driver'),{code:'workspace_viewport_unsupported'});},check(){},isConfirmed:()=>true,report(){}});
  const handle=provider.create({},()=>{});await assert.rejects(handle.ready,{code:'workspace_viewport_unsupported'});await handle.close();await provider.cleanup();provider.dispose();
});

test('independent viewport routes verified selection through its driver and waits for in-flight work before restoration',async()=>{
  const calls=[];let finish;const view={async bind(value){calls.push(['bind',value]);await new Promise(resolve=>{finish=resolve;});},async update(value){calls.push(['update',value]);},subscribe(){return()=>{};},async close(){calls.push(['close']);}};
  const provider=createWorkspaceViewports({load:async()=>({api:1,independent:true,restoresSettings:true,avoidsThreadPersistence:true,notifiesChanges:true,create:async value=>{calls.push(['create',value]);return view;}}),check(){},isConfirmed:id=>id==='thread-a',report(){}});
  const handle=provider.create({open:true,width:400},()=>{});await handle.ready;
  await assert.rejects(handle.bind({threadId:'wrong'}),{code:'workspace_selection_not_confirmed'});
  const pending=handle.bind({threadId:'thread-a'});await tick();const closing=handle.close();await tick();assert.equal(calls.some(value=>value[0]==='close'),false);
  finish();await assert.rejects(pending,{code:'workspace_retired'});await closing;assert.equal(calls.at(-1)[0],'close');assert.equal(calls.filter(value=>value[0]==='close').length,1);await provider.cleanup();provider.dispose();
});

test('viewport retirement during async allocation restores a late-created Native view exactly once',async()=>{
  let resolve,closed=0;const provider=createWorkspaceViewports({load:async()=>({api:1,independent:true,restoresSettings:true,avoidsThreadPersistence:true,notifiesChanges:true,create:()=>new Promise(yes=>{resolve=yes;})}),check(){},isConfirmed:()=>true,report(){}});
  const handle=provider.create({},()=>{});await tick();handle.dispose();resolve({bind(){},update(){},subscribe(){return()=>{};},close(){closed++;}});await assert.rejects(handle.ready,{code:'workspace_retired'});await provider.cleanup();assert.equal(closed,1);provider.dispose();
});

test('Native viewport resize/close notifications push state and null binding preserves layout while clearing identity',async()=>{
  let notify,unsubscribed=0,closed=0;const bindings=[];
  const view={async bind(value){bindings.push(value);},async update(value){return value;},subscribe(listener){notify=listener;return()=>unsubscribed++;},async close(){closed++;}};
  const provider=createWorkspaceViewports({load:async()=>({api:1,independent:true,restoresSettings:true,avoidsThreadPersistence:true,notifiesChanges:true,create:()=>view}),check(){},isConfirmed:id=>id==='thread-a',report(error){assert.fail(error.message);}});
  const handle=provider.create({open:true,width:400},()=>{}),seen=[];const stop=handle.subscribe(value=>seen.push(value));await handle.ready;
  await handle.bind({threadId:'thread-a'});notify({width:520});assert.equal(handle.getSnapshot().width,520);
  await handle.bind(null);assert.deepEqual(handle.getSnapshot(),{independent:true,open:true,width:520,threadId:null,hostId:null});assert.equal(bindings.at(-1),null);
  notify({open:false});assert.equal(seen.at(-1).open,false);stop();const count=seen.length;notify({width:600});assert.equal(seen.length,count);
  await handle.close();notify({open:true});assert.equal(unsubscribed,1);assert.equal(closed,1);await provider.cleanup();provider.dispose();
});

test('location restoration waits for an asynchronous Native route commit and releases its route guard on cancellation',async t=>{
  const dom=new JSDOM('<div id="root"></div>'),document=dom.window.document;t.after(()=>dom.window.close());
  const navigator={location:{pathname:'/',state:{private:'original'}}},host={navigator,rootNode:document.getElementById('root')};let pending,released=0;
  const provider=createWorkspaceLocations({document,host:()=>host,load:async()=>({restoreLocation(value){pending=value;}}),check(){},changed(){},beforeRestore:()=>()=>released++});
  t.after(()=>provider.dispose());const handle=provider.capture(()=>{});await handle.ready;
  navigator.location={pathname:'/settings',state:null};const restored=handle.restore();await tick();
  navigator.location={...pending};document.getElementById('root').append(document.createElement('span'));
  assert.deepEqual(await restored,{restored:true,kind:'page'});assert.equal(released,1);
  navigator.location={pathname:'/settings',state:null};const controller=new dom.window.AbortController(),cancelled=handle.restore({signal:controller.signal});await tick();controller.abort();
  await assert.rejects(cancelled,{code:'invocation_cancelled'});assert.equal(released,2);
});

test('capture respects shared IME preflight and does not retain a usable draft handle while composing',async t=>{
  const dom=new JSDOM('<div id="root"></div>'),document=dom.window.document;t.after(()=>dom.window.close());const host={navigator:{location:{pathname:'/',state:null}},rootNode:document.getElementById('root')};let routed=0;
  const provider=createWorkspaceLocations({document,host:()=>host,load:async()=>({restoreLocation(){routed++;}}),check(){},changed(){},beforeCapture(){throw Object.assign(Error('composing'),{code:'workspace_composer_busy'});}});
  const handle=provider.capture(()=>{});await assert.rejects(handle.ready,{code:'workspace_composer_busy'});await assert.rejects(handle.restore(),{code:'workspace_composer_busy'});assert.equal(routed,0);handle.dispose();provider.dispose();
});

test('heading journal preserves a later unrelated Native property change',t=>{
  const dom=new JSDOM('<header><span>Title</span></header>');t.after(()=>dom.window.close());const document=dom.window.document,header=document.querySelector('header'),title=header.firstElementChild;
  const provider=createWorkspaceSelection({document,surface:()=>({header}),snapshot:()=>({threadId:null}),check(){},changed(){}});
  const handle=provider.acquire({threadId:null},'consumer',()=>{});title.style.setProperty('visibility','collapse');title.setAttribute('aria-hidden','false');provider.reconcile();
  handle.dispose();assert.equal(title.style.visibility,'collapse');assert.equal(title.getAttribute('aria-hidden'),'false');assert.equal(title.hasAttribute('inert'),false);
});
