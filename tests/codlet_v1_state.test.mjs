import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Manager,portableManagerView} from '../frontend/src/codlet/controller.js';
import {createPreviewRuntime} from '../scripts/preview-runtime.mjs';
import {uiFixture,tick} from './support/ui-fixture.mjs';
import {coreProvidedRepository} from '../frontend/src/codlet/marketplace-model.js';
import {validUpdate,updateStatusText,versionWarnings} from '../frontend/src/codlet/versions.js';
import {createMessages} from '../frontend/src/codlet/messages.js';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {buildSync}=require('esbuild');
const source=buildSync({absWorkingDir:fileURLToPath(new URL('../frontend',import.meta.url)),entryPoints:['src/codlet/app.jsx'],bundle:true,write:false,format:'cjs',platform:'browser',jsxFactory:'h',jsxFragment:'React.Fragment',target:'chrome130',define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'text','.svg':'text'}}).outputFiles[0].text;
const viewModule=entry=>{const module={exports:{}};const code=buildSync({absWorkingDir:fileURLToPath(new URL('../frontend',import.meta.url)),entryPoints:[entry],bundle:true,write:false,format:'cjs',platform:'browser',jsxFactory:'h',jsxFragment:'React.Fragment'}).outputFiles[0].text;new Function('module',code)(module);return module.exports;};

test('GUI snapshot transfers only safe navigation, query, filters and bounded scroll',()=>{
  const before={open:true,page:'import',query:'notes',filter:'enabled',trusted:true,grants:['host.raw'],confirmation:{receipt:'secret'},preview:{path:'private'},updateCommand:{id:3},market:{query:'#Tool',origin:'official',onlyDevice:true,sort:'name',selected:{token:'private'}}};
  const saved=portableManagerView(before,{plugins:140,settings:Infinity,market:-2});
  assert.deepEqual(saved,{schema:1,value:{open:true,page:'plugins',query:'notes',filter:'enabled',market:{query:'#Tool',origin:'official',onlyDevice:true,sort:'name'},scroll:{plugins:140,settings:0,market:0}}});
  assert.doesNotMatch(JSON.stringify(saved),/secret|private|receipt|host.raw|trusted/);
  const manager=new Manager({pluginId:'codlet-gui'});
  assert.equal(manager.restoreViewState(saved),true);
  assert.equal(manager.state.trusted,false);assert.deepEqual(manager.state.grants,[]);assert.equal(manager.pending,null);
  assert.equal(manager.state.page,'plugins');assert.equal(manager.state.query,'notes');assert.equal(manager.pendingScroll.plugins,140);
  assert.throws(()=>manager.restoreViewState({schema:2,value:{}}),/Unsupported/);manager.dispose();
});

test('current GUI source mounts through semantic navigation and restores search after a new activation',async t=>{
  const demo=createPreviewRuntime(),fixture=uiFixture({request:demo.request}),plugin=fixture.loadSource(source);
  let registrations=0;const page=fixture.context.codex.navigation.page;
  fixture.context.codex.navigation.page=options=>{registrations++;return page(options);};
  t.after(()=>{plugin.deactivate();fixture.dispose();});
  await plugin.activate(fixture.context);await fixture.open();await fixture.input('Search plugins','notes');
  const saved=plugin.saveState();assert.equal(saved.value.query,'notes');assert.equal(registrations,1);
  plugin.deactivate();await plugin.activate(fixture.context);await plugin.restoreState(saved);await fixture.open();await tick();
  assert.equal(fixture.control('Search plugins').value,'notes');assert.equal(registrations,2);assert.equal(fixture.calls.some(call=>call.method==='submit'),false);assert.equal(fixture.errors.length,0);
});

test('fresh GUI source rejects a missing Core facade before navigation or list admission',async t=>{
  const fixture=uiFixture(),plugin=fixture.loadSource(source);delete fixture.context.codex;
  t.after(()=>{plugin.deactivate();fixture.dispose();});await plugin.activate(fixture.context);
  assert.equal(fixture.document.querySelector('[data-codlet-panel]'),null);
  assert.equal(fixture.calls.length,0);
  assert.equal(fixture.errors[0]?.code,'gui_ui_unavailable');assert.match(fixture.errors[0]?.message,/Core Codex SDK/);
});

test('ordinary downloaded Core update has an apply confirmation without a restart prompt',async t=>{
  const demo=createPreviewRuntime();demo.state.phase='downloaded';
  const fixture=uiFixture({request:demo.request}),plugin=fixture.loadSource(source);
  t.after(()=>{plugin.deactivate();fixture.dispose();});
  await plugin.activate(fixture.context);await fixture.open();await fixture.click('Settings');await fixture.click('Apply update');
  assert.match(fixture.document.body.textContent,/Apply Codlet update\?/);assert.match(fixture.document.body.textContent,/current tasks and connections continue/);
  assert.equal(fixture.control('Install and restart'),undefined);assert.doesNotMatch(fixture.document.body.textContent,/running local tasks will be interrupted/);
  assert.equal(fixture.calls.some(call=>call.method==='installRuntimeUpdate'),false);
});

test('only pinned Core provider repositories disappear from the normal v1 market',()=>{
  const adapter={repositoryId:1379358711,ownerId:76909162,fullName:'baoabaob/codlet-ui-adapter'};
  assert.equal(coreProvidedRepository(adapter),true);assert.equal(coreProvidedRepository({...adapter,ownerId:2}),false);
  assert.equal(coreProvidedRepository({repositoryId:1379359689,ownerId:76909162,fullName:'baoabaob/codlet-gui'}),false);
  const manager=new Manager({pluginId:'codlet-gui',codex:{api:1}});
  manager.marketSet({items:[adapter,{...adapter,repositoryId:99,ownerId:99,fullName:'community/custom-adapter'}]});
  assert.deepEqual(manager.marketFiltered().map(item=>item.fullName),['community/custom-adapter']);manager.dispose();
});

test('current GUI review renders actual enforcement and keeps author evidence separate from SDK claims',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
  const {createPermissionSummary}=viewModule('src/codlet/permissions-view.jsx');
  const Summary=createPermissionSummary({React,C:{Button:({children,...props})=>React.createElement('button',props,children)},I:{ChevronDown:()=>null},t:value=>value});
  const permissions=renderToStaticMarkup(React.createElement(Summary,{permissions:['ui.dom','host.process.spawn','ui.nativeDom','host.raw','cdp.raw']}));
  assert.match(permissions,/Core broker check/);assert.match(permissions,/Execution admission check/);assert.match(permissions,/Author declaration and review/);assert.match(permissions,/--executable/);
  const {createMarketplaceView}=viewModule('src/codlet/marketplace.jsx');
  const {Compatibility}=createMarketplaceView({React,C:{},I:{},manager:{state:{locale:'en'}},t:value=>value});
  const metadata={runtimeApi:1,sdk:{api:1,capabilities:[{name:'codex.backend.read',api:1,scope:'target'}]},verification:[{kind:'automated',platform:'windows-x86_64',clientVersion:'fixture-only',status:'passed',evidence:'synthetic JSONL suite'}]};
  const compatibility=renderToStaticMarkup(React.createElement(Compatibility,{metadata,device:{platform:'windows-x86_64',status:'compatible',basis:'sdk-declaration'}}));
  assert.match(compatibility,/SDK and capabilities/);assert.match(compatibility,/SDK contract declared/);assert.match(compatibility,/codex.backend.read@1/);assert.match(compatibility,/Author-supplied test evidence/);assert.match(compatibility,/does not certify/);assert.match(compatibility,/synthetic JSONL suite/);
});

test('deferred update is shown as locally staged with separate activation scope and no install or restart action',()=>{
  const update={currentVersion:'1.0.0-rc.1',configured:true,phase:'deferred',installAvailable:true,candidate:{id:'candidate',version:'1.0.0-rc.2'},activation:{mode:'nextStart',version:'1.0.0-rc.2',components:['core-runtime'],retainedComponents:['core-executable','client-bridge'],nextStartReason:'Compiled components changed',persistencePending:false}};
  assert.equal(validUpdate(update),true);assert.equal(validUpdate({...update,activation:{...update.activation,mode:'online'}}),false);
  assert.equal(validUpdate({...update,activation:{...update.activation,components:'all'}}),false);
  assert.equal(updateStatusText(update),'Update takes effect on next start.');
  assert.deepEqual(versionWarnings({update}),['Update takes effect on next start.']);
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{createSettingsView}=viewModule('src/codlet/settings.jsx');
  const t=createMessages({i18n:{locale:'zh'}}).t;
  const C={Button:({children})=>React.createElement('button',null,children),TextLink:({children})=>React.createElement('a',null,children),Dialog:{Root:({children})=>React.createElement(React.Fragment,null,children),Portal:()=>null}},I={FolderOpen:()=>null,Regenerate:()=>null};
  const manager={combiningUpdates:()=>false,pluginSummary:()=>({}),canCombineUpdates:()=>false};
  const Settings=createSettingsView({React,C,I,manager,t,Copy:({children})=>React.createElement('p',null,children),mutationBusy:()=>false});
  const markup=renderToStaticMarkup(React.createElement(Settings,{s:{update,listStale:true}}));
  assert.match(markup,/下次启动生效/);assert.match(markup,/已在本地暂存/);assert.match(markup,/尚未在此会话安装生效/);assert.match(markup,/已编译 Core 版本<\/dt><dd>1\.0\.0-rc\.1/);
  assert.match(markup,/已暂存版本<\/dt><dd>1\.0\.0-rc\.2/);assert.match(markup,/生效范围/);assert.match(markup,/继续使用原版本的组件/);
  assert.doesNotMatch(markup,/应用更新|安装并重启|同时更新/);
  const live=renderToStaticMarkup(React.createElement(Settings,{s:{update:{...update,phase:'upToDate',activation:{...update.activation,mode:'online',components:['host-bootstrap']}},listStale:true}}));
  assert.match(live,/已生效 JS Core 版本<\/dt><dd>1\.0\.0-rc\.2/);assert.match(live,/已编译 Core 版本<\/dt><dd>1\.0\.0-rc\.1/);assert.match(live,/Host 运行时/);
});
