import test from 'node:test';
import assert from 'node:assert/strict';
import {permissionGroups,pluginDependencies,permissionBoundary,UNADAPTED_COPY} from '../frontend/src/codlet/permissions.js';
import {PERMISSION_COPY} from '../frontend/src/codlet/messages.js';
const cap=(name,scope='target')=>({name,api:1,scope});
test('every permission appears once in a small readable category set',()=>{
  const requested=Object.keys(PERMISSION_COPY),groups=permissionGroups(requested);
  assert.equal(groups.length,6);assert.deepEqual(groups.flatMap(g=>g.permissions).sort(),requested.sort());
});
test('standard SDK use is not an unadapted grant and actual exception enforcement is visible',()=>{
  const standard=['ui.dom','host.fs','host.network','core.clipboard.read','core.tasks'];
  assert.equal(permissionGroups(standard).some(group=>group.id==='unadapted'),false);
  assert.equal(permissionBoundary('ui.nativeDom').enforcement,'declaration');
  assert.equal(permissionBoundary('host.process.spawn').enforcement,'broker');
  assert.equal(permissionBoundary('host.raw').enforcement,'admission');
  assert.equal(permissionBoundary('host.process').legacy,true);
  assert.match(UNADAPTED_COPY,/author maintains/);
});
test('dependency summaries collapse interfaces into plugins and omit Core and self',()=>{
  const nav=cap('navigation'),read=cap('read'),write=cap('write'),own=cap('my.host','runtime');
  const manifest={id:'dev.lab',renderer:{},host:{provides:[own],requires:[cap('codlet.core.services','runtime')]},requires:[nav,read,write,own,cap('codlet.core.services','runtime'),cap('codlet.runtime.ping')]};
  const plugins=[{id:'ui',active:true,providedCapabilities:[nav]},{id:'desktop',active:false,providedCapabilities:[read,write]}];
  const result=pluginDependencies(manifest,plugins);
  assert.deepEqual(result.plugins.map(r=>[r.plugin.id,r.available]),[['ui',true],['desktop',false]]);assert.equal(result.missing,false);
  assert.equal(pluginDependencies(manifest,plugins.slice(0,1)).missing,true);
});
