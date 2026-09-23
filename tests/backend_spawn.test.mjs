import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { installBackendSpawn, effectiveProviders, providerTrust, lastStringOverride } = createRequire(import.meta.url)('../host/backend-spawn.cjs');

test('effective provider routing preserves ChatGPT/API-key defaults and custom response providers', () => {
  assert.equal(effectiveProviders({accountType:'chatgpt'}).get('openai_base_url'),'https://chatgpt.com/backend-api/codex');
  assert.equal(effectiveProviders({accountType:'apiKey'}).get('openai_base_url'),'https://api.openai.com/v1');
  const routes=effectiveProviders({accountType:'chatgpt',openaiBaseUrl:'https://owned.example/v2',providerBaseUrls:{custom:'https://custom.example/v1'}});
  assert.deepEqual([...routes],[['openai_base_url','https://owned.example/v2'],['model_providers.custom.base_url','https://custom.example/v1']]);
});

test('last exact CLI config override preserves Desktop-owned local provider base', () => {
  const args=['app-server','--stdio','-c','openai_base_url="https://old.example/v1"','--config=openai_base_url="http://127.0.0.1:43210/v1"'];
  assert.equal(lastStringOverride(args,'openai_base_url'),'http://127.0.0.1:43210/v1');
  assert.equal(lastStringOverride(args,'chatgpt_base_url'),undefined);
});

test('owned verified backend receives only route config; original environment and unrelated children remain untouched', async () => {
  const reservations=[], dispatched=[], environment={HTTPS_PROXY:'http://corporate.invalid',OTHER:'original'};
  const source={reserveRoute({upstreamBaseUrl}) {const item={baseUrl:`http://127.0.0.1:43210/r${reservations.length}/`,ready:Promise.resolve(),close(){item.closed=true},async update(value){item.updated=value},upstreamBaseUrl};reservations.push(item);return item;}};
  const prototype={spawn(options){dispatched.push(options);return 'started';}}, original=prototype.spawn;
  const hook=installBackendSpawn({source,runtimeExecutable:process.execPath,deadlineUnixMs:Date.now()+1000},{prototype,
    verify(){return {binarySha256:'verified'}},
    probe(){return {accountType:'chatgpt',providerBaseUrls:{custom:'https://custom.example/v1'}}},
    prepare(plan){return {arguments:[...plan.arguments,'-c',`openai_base_url=${plan.providerRoutes.openai_base_url}`,'-c',`model_providers.custom.base_url=${plan.providerRoutes['model_providers.custom.base_url']}`]}}});
  try {
    const unrelated={file:process.execPath,args:[process.execPath,'--version'],envPairs:['OTHER=original']};
    prototype.spawn.call(new EventEmitter(),unrelated);
    assert.equal(dispatched[0],unrelated);
    const executable=path.resolve('codex.exe');
    const owned={file:executable,args:[executable,'app-server','--stdio'],envPairs:Object.entries(environment).map(([key,value])=>`${key}=${value}`)};
    const child=new EventEmitter();prototype.spawn.call(child,owned);
    assert.equal((await hook.ready()).available,true);
    assert.equal(reservations.length,2);
    assert.deepEqual(reservations.map(value=>value.upstreamBaseUrl),['https://chatgpt.com/backend-api/codex','https://custom.example/v1']);
    assert.equal(dispatched[1].envPairs,owned.envPairs);
    assert.equal(dispatched[1].args.at(-1),'model_providers.custom.base_url=http://127.0.0.1:43210/r1/');
    assert.equal(environment.HTTPS_PROXY,'http://corporate.invalid');
    hook.updateAccountMode(child,'apiKey');await hook.pendingAccountUpdate(child);
    assert.deepEqual(reservations[0].updated,{upstreamBaseUrl:'https://api.openai.com/v1'});
    child.emit('exit');assert(reservations.every(value=>value.closed));
  } finally {hook.close();assert.equal(prototype.spawn,original);}
});

test('existing provider CA is passed only as a scoped route trust input', t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'codlet-trust-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const file=path.join(directory,'owned.pem');fs.writeFileSync(file,'-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----\n');
  assert.match(providerTrust({CODEX_CA_CERTIFICATE:file,SSL_CERT_FILE:'ignored'},directory),/BEGIN CERTIFICATE/u);
  assert.equal(providerTrust({OTHER:'value'},directory),undefined);
  assert.throws(()=>providerTrust({CODEX_CA_CERTIFICATE:''},directory),{code:'backend_provider_trust_unsupported'});
});

test('unverified backend uses its original launch and reports only backend source unsupported', async () => {
  const dispatched=[],prototype={spawn(value){dispatched.push(value);return 'original';}};
  const hook=installBackendSpawn({source:{reserveRoute(){throw Error('should not route')}},runtimeExecutable:process.execPath,deadlineUnixMs:Date.now()+1000},{prototype,verify(){throw Object.assign(Error('unverified'),{code:'backend_build_unverified'})}});
  try {
    const executable=path.resolve('codex.exe'),options={file:executable,args:[executable,'app-server'],envPairs:['OTHER=original']};
    assert.equal(prototype.spawn.call(new EventEmitter(),options),'original');
    assert.equal(dispatched[0],options);
    assert.equal((await hook.ready()).reason,'backend_build_unverified');
  } finally {hook.close();}
});
