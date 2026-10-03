import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import Module from 'node:module';
import {createHash} from 'node:crypto';
const {recoverLocalBackends}=createRequire(import.meta.url)('../host/electron-main.cjs');
function fixture() {
  const calls=[];
  class Connection {
    constructor(file='codex.exe') {this.connection={proc:{spawnfile:path.resolve(file)}};this.pending=0;this.turnCwds={pendingByStartId:new Map(),startedByTurnId:new Map()};}
    getPendingRequestCount(){return this.pending;}
    async restart(options){calls.push({connection:this,options});}
  }
  const connections=[],context={modules:{list:()=>[{name:'native.cjs',hash:'reviewed',evaluate:()=>Connection}],instances:()=>connections}};
  const dependencies={profiles:{'native.cjs':{hash:'reviewed',connectionSymbol:'Connection'}},verify(){}};
  return {calls,Connection,connections,context,dependencies};
}
test('late source recovery reconnects only verified idle local backends and preserves owned backends',async()=>{
  const f=fixture(),local=new f.Connection(),owned=new f.Connection(),other=new f.Connection('helper.exe'),remote=new f.Connection();
  remote.connection={};f.connections.push(local,owned,other,remote);
  await recoverLocalBackends(f.context,child=>child===owned.connection.proc,f.dependencies);
  assert.deepEqual(f.calls,[{connection:local,options:{intent:'restart',killCodexProcess:false}}]);
});
test('pending requests or active turns reject recovery before any backend is reconnected',async()=>{
  for(const busy of ['request','starting-turn','active-turn']){
    const f=fixture(),idle=new f.Connection(),connection=new f.Connection();f.connections.push(idle,connection);
    if(busy==='request')connection.pending=1;
    else connection.turnCwds[busy==='starting-turn'?'pendingByStartId':'startedByTurnId'].set('owned',true);
    await assert.rejects(recoverLocalBackends(f.context,()=>false,f.dependencies),{code:'client_source_backend_busy'});
    assert.equal(f.calls.length,0);
  }
});
test('unknown backend binaries and stale module hashes never receive a reconnect',async()=>{
  const f=fixture();f.connections.push(new f.Connection());
  await assert.rejects(recoverLocalBackends(f.context,()=>false,{...f.dependencies,verify(){throw Object.assign(Error(),{code:'backend_build_unverified'});}}),{code:'backend_build_unverified'});
  f.dependencies.profiles['native.cjs'].hash='different';
  await recoverLocalBackends(f.context,()=>false,f.dependencies);
  assert.equal(f.calls.length,0);
});
test('a replacement attaches reviewed hooks to initialized modules and removes its subscriptions on retirement',async()=>{
  const {installDesktopPlaintext}=createRequire(import.meta.url)('../host/electron-plaintext.cjs');
  const records=[],subscribers=new Set();
  const registry={list:()=>records,subscribe(callback){subscribers.add(callback);records.forEach(callback);return()=>subscribers.delete(callback);}};
  const bootstrap='let Pt=class {fetch(){} request(){}};module.exports={Pt};',main='let wEe=class {performDesktopFetch(){}};module.exports={wEe};';
  const hash=code=>createHash('sha256').update(code).digest('hex');
  function compile(name,code){const filename=path.join(process.cwd(),name),module=new Module(filename);module.filename=filename;module.paths=Module._nodeModulePaths(process.cwd());module._compile(code+'\nmodule.exports.evaluate=expression=>eval(expression);',filename);records.push({name,filename,hash:hash(code),evaluate:module.exports.evaluate});return module.exports;}
  const native=compile('bootstrap-DK4EfNwt.js',bootstrap);compile('main-LM8MUIFp.js',main);
  const original=native.Pt.prototype.fetch,options={expectedHashes:{'bootstrap-DK4EfNwt.js':hash(bootstrap),'main-LM8MUIFp.js':hash(main)}};
  for(let generation=0;generation<2;generation++){
    const hook=installDesktopPlaintext({app:{isReady:()=>true}},{source:{interceptHttp(){}},moduleRegistry:registry,deadlineUnixMs:Date.now()+500},options);
    assert.equal((await hook.ready()).available,true);assert.notEqual(native.Pt.prototype.fetch,original);
    hook.close();assert.equal(native.Pt.prototype.fetch,original);assert.equal(subscribers.size,0);
  }
});
