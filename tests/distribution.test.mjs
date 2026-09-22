import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {validateConfig,safePath,hash,blobHash,prepareDistribution} from '../scripts/distribution.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await readFile(resolve(root,'plugins.json'),'utf8'));
test('distribution destinations and discovery metadata are unique and cannot point at the development repository',()=>{
  assert.equal(validateConfig(structuredClone(config)).plugins.length,3);
  for(const edit of [c=>c.plugins.push(c.plugins[0]),c=>c.plugins[0].repository=c.sourceRepository,c=>c.plugins[0].repository='someone-else/plugin',c=>c.plugins[0].topics=[],c=>c.plugins[0].dependencies=['missing'],c=>c.installerPlugins=['missing'],c=>c.installerPlugins.push(c.installerPlugins[0])]){
    const copy=structuredClone(config);edit(copy);assert.throws(()=>validateConfig(copy));
  }
  for(const path of ['../secret','x/../../secret','.git/config','x\\secret','C:/secret','/secret','x//file','x/./file'])assert.throws(()=>safePath(path),path);
});
test('Git blob identity includes the exact byte length and preserves UTF-8 source bytes',()=>{
  const bytes=Buffer.from('Codlet 插件\n');
  const expected=execFileSync('git',['hash-object','--stdin'],{input:bytes,encoding:'utf8',windowsHide:true}).trim();
  assert.equal(blobHash(bytes),expected);
});
test('each source snapshot contains its own installable bundle and build closure with pinned dependencies',async()=>{
  const plan=await prepareDistribution(root,{allowDirty:true});
  for(const plugin of plan.plugins){
    const folder=resolve(root,'dist',plugin.directory),paths=plugin.files.map(f=>f.path);
    for(const file of plugin.files){const bytes=await readFile(resolve(folder,file.path));assert.equal(hash(bytes),file.sha256);assert.equal(blobHash(bytes),file.gitBlob);}
    const manifest=JSON.parse(await readFile(resolve(folder,'codlet.json'),'utf8'));
    assert.equal(manifest.id,plugin.id);assert.equal(manifest.version,plugin.version);assert.ok(paths.includes(manifest.renderer.entry));
    if(manifest.host){
      for(const required of [manifest.host.entry,'frontend/build-host.mjs','host/desktop-launch.cjs','host/electron-main.cjs','host/backend-spawn.cjs'])assert.ok(paths.includes(required),required);
      assert((await readFile(resolve(folder,'frontend/build.mjs'),'utf8')).includes('buildDesktopHost'));
    }
    for(const required of ['frontend/build-plugin.mjs','frontend/build.mjs','frontend/package-lock.json','.codlet-distribution.json'])assert.ok(paths.includes(required));
    assert.ok(paths.every(p=>!p.includes('node_modules')&&!p.startsWith('.core-sdk')&&!p.startsWith('.git/')));
    const readme=await readFile(resolve(folder,'README.md'),'utf8');assert.ok(readme.includes(`https://github.com/${plugin.repository}`));
    if(plugin.id!=='codlet-gui')assert.equal(paths.includes('frontend/src/codlet/app.jsx'),false);
    const archive=await readFile(resolve(root,'dist',plugin.archive.path));assert.equal(hash(archive),plugin.archive.sha256);
  }
});
