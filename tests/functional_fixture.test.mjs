import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
      await host.activate({root:pluginRoot,plugin:{id:'compatibility.acceptance',version:'0.0.2',generation:1},services:{},
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
