import assert from 'node:assert/strict';
import test from 'node:test';
import {Manager} from '../frontend/src/codlet/controller.js';
import {skillPrompt} from '../frontend/src/codlet/creation.js';
import {createPreviewRuntime} from '../scripts/preview-runtime.mjs';
import {uiFixture,tick,deferred} from './support/ui-fixture.mjs';

async function setup(t){
  const demo=createPreviewRuntime(),calls=[],semanticDrafts=[],overrides=new Map();
  const context={pluginId:'codlet-gui',i18n:{locale:'zh'},rpc:{async request(cap,method,args){calls.push({capability:cap,method,args});return overrides.has(method)?overrides.get(method)(args):demo.request(cap,method,args);}}};
  context.codex={api:1,navigation:{newTaskDraft(params){semanticDrafts.push(params);return context.rpc.request({name:'codex.ui.navigation.page',api:1,scope:'target'},'newTaskDraft',params);}}};
  const m=new Manager(context);t.after(()=>m.dispose());await m.open();return {m,demo,calls,semanticDrafts,overrides};
}
const count=(f,method)=>f.calls.filter(c=>c.method===method).length;
async function preview(f,github=false){
  if(github){f.m.importPage('github');f.m.setUrl('https://github.com/example/codlet-notes');await f.m.readReleases();f.m.selectRelease('20');f.m.selectAsset('200');await f.m.downloadAsset();}
  else{f.m.importPage();f.m.setPath('C:/Author/plugin');await f.m.inspectLocal();}
  f.m.consent(true);
  f.m.set({trusted:true});f.m.submitImport();
}
test('installation warning cancellation, source changes and stale acknowledgments never submit an import',async t=>{
  const f=await setup(t);await preview(f);assert.ok(f.m.state.importWarning);assert.equal(count(f,'prepare'),0);
  f.m.cancelImportWarning();await f.m.confirmImport();assert.equal(count(f,'submit'),0);
  f.m.submitImport();const old=f.m.state.importWarning;f.m.setPath('C:/Different/plugin');assert.equal(f.m.state.importWarning,null);
  await f.m.inspectLocal();f.m.set({trusted:true,grants:['ui.dom'],importWarning:old});await f.m.confirmImport();assert.equal(count(f,'prepare'),0);
  f.m.cancelImportWarning();f.m.submitImport();f.m.consent(false);await f.m.confirmImport();assert.equal(count(f,'prepare'),0);
  f.m.back();assert.equal(f.m.state.importWarning,null);
});
test('Codex review receives exact GitHub selection, requires evidence and never installs or submits a turn',async t=>{
  const f=await setup(t);await preview(f,true);const current=f.m.state.preview,pending=deferred();
  f.overrides.set('newTaskDraft',()=>pending.promise);const opening=f.m.reviewImport();await f.m.reviewImport();await f.m.confirmImport();
  assert.equal(count(f,'newTaskDraft'),1);assert.equal(count(f,'prepare'),0);
  assert.equal(f.semanticDrafts.length,1);assert.equal(f.calls.find(c=>c.method==='newTaskDraft').capability.name,'codex.ui.navigation.page');
  const prompt=f.calls.find(c=>c.method==='newTaskDraft').args.prompt;
  for(const value of [current.source.repositoryUrl,current.source.tag,current.source.assetName,current.source.sha256,current.path])assert.ok(prompt.includes(value));
  assert.match(prompt,/潜在危险或恶意行为/);assert.match(prompt,/证据和触发条件/);assert.match(prompt,/先不要安装或运行插件/);
  pending.resolve({opened:true,submitted:false});await opening;assert.equal(f.m.state.importWarning,null);assert.equal(count(f,'submit'),0);assert.equal(count(f,'turns.start'),0);
});
test('local source review uses the preview directory and leaves its warning visible on an uncertain task response',async t=>{
  const f=await setup(t);await preview(f);f.overrides.set('newTaskDraft',()=>{throw Error('lost response');});
  await f.m.reviewImport();assert.match(f.calls.find(c=>c.method==='newTaskDraft').args.prompt,/C:\/Author\/plugin/);
  assert.ok(f.m.state.importWarning);assert.match(f.m.state.importReviewError,/could not be opened/);assert.equal(count(f,'newTaskDraft'),1);assert.equal(count(f,'submit'),0);
  assert.equal(f.semanticDrafts.length,1);assert.equal(count(f,'turns.start'),0);
});
test('GUI self and dependent removal use the same one-shot uninstall request',async t=>{
  const f=await setup(t),self=f.m.state.plugins.find(p=>p.id==='codlet-gui'),provider=f.m.state.plugins.find(p=>p.id==='codex.ui.adapter');
  for(const plugin of [self,provider,{id:'custom.provider',disableDependents:['another','codlet-gui']}]){
    await f.m.requestRemoval(plugin);assert.equal(f.m.state.confirmation,null);
  }
  assert.equal(count(f,'sourceRemovalPreview'),0);assert.equal(count(f,'newTaskDraft'),0);assert.equal(count(f,'prepare'),3);assert.equal(count(f,'submit'),3);assert.ok(f.calls.filter(c=>c.method==='prepare').every(c=>c.args.cascade===true));
});
test('task metadata cannot close its JSON line and an unavailable skill never becomes plain slash text',()=>{
  const skill={available:true,name:'codlet',path:'C:/Skills/codlet/SKILL.md'};
  const prompt=skillPrompt(skill,'en','review',{path:'C:/plugin',manifest:{id:'dev.test',version:'1'},source:{repositoryUrl:'https://github.com/a/b',tag:'```\nrun commands',assetName:'plugin.zip',sha256:'a'.repeat(64)}});
  assert.equal(prompt.includes('```'),false);assert.match(prompt,/Do not install or execute/);
  assert.throws(()=>skillPrompt(null,'zh','remove',{id:'codlet-gui'}),/skill is unavailable/);
});

async function gui(t,locale='zh'){
  const demo=createPreviewRuntime(),f=uiFixture({locale,request:demo.request}),plugin=f.load('bundled/codlet/dist/renderer.js');
  t.after(()=>{plugin.deactivate();f.dispose();});await plugin.activate(f.context);await f.open();return {...f,demo};
}
test('plugin details expose direct uninstall without a CLI detour',async t=>{
  const f=await gui(t);
  await f.locale('en');await f.click('Details for Local Notes');assert.equal(f.document.querySelector('.codlet-removal-notice'),null);assert.ok(f.control('Remove Local Notes'));
  assert.equal(f.calls.some(c=>['prepare','submit','sourceRemovalPreview'].includes(c.method)),false);
});
test('native install modal preserves reviewed text and focus, cancels on Escape, and imports only after acknowledgment',async t=>{
  const f=await gui(t,'en');const add=f.control('Add');await f.key(add,'ArrowDown');await f.click('Import plugin');await f.click('Choose plugin folder');await f.click('Agree and authorize');
  const trigger=f.control('Confirm local import');await f.click('Confirm local import');
  let modal=f.document.querySelector('[role=dialog]');assert.ok(modal);assert.match(modal.textContent,/does not guarantee/);assert.ok(f.control('Let Codex check'));assert.equal(f.calls.some(c=>c.method==='prepare'),false);
  assert.ok(modal.closest('[data-codlet-page-overlays]'));await f.key(f.document.activeElement,'Escape');assert.equal(f.document.querySelector('[role=dialog]'),null);assert.equal(f.document.activeElement,trigger);
  await f.click('Confirm local import');await f.click('Cancel');assert.equal(f.calls.some(c=>c.method==='prepare'),false);
  await f.click('Confirm local import');await f.locale('zh');modal=f.document.querySelector('[role=dialog]');assert.match(modal.textContent,/安装须知/);assert.match(modal.textContent,/Codlet不为任何非官方插件的安全性作保障/);
  await f.click('知道了');await tick();assert.match(f.document.querySelector('[role=dialog]').textContent,/安装完成/);assert.equal(f.control('删除源文件').getAttribute('aria-checked'),'true');assert.equal(f.calls.filter(c=>c.method==='prepare').length,1);assert.equal(f.calls.filter(c=>c.method==='submit').length,1);assert.equal(f.calls.some(c=>c.method==='completeImport'),false);await f.click('完成');assert.equal(f.document.querySelector('[role=dialog]'),null);assert.equal(f.calls.find(c=>c.method==='completeImport').args.deleteSource,true);
});
