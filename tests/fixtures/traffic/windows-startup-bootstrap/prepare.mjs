// Explicit local research preparation. Does not launch, install or register apps.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=import.meta.dirname,repo=fileURLToPath(new URL('../../../../',import.meta.url));
const output=process.argv[2];
if(!output||!path.isAbsolute(output)||fs.existsSync(output))throw Error('Supply a new absolute fixture output directory');
fs.mkdirSync(output,{recursive:true});
for(const name of ['codex-desktop-adapter','codex-ui-adapter','codlet']){
  const destination=path.join(output,'plugins/bundled',name);
  fs.cpSync(path.join(repo,'bundled',name),destination,{recursive:true,errorOnExist:true,force:false});
  if(name==='codex-desktop-adapter'){
    const file=path.join(destination,'codlet.json'),manifest=JSON.parse(fs.readFileSync(file,'utf8'));
    delete manifest.host;manifest.permissions=['ui.mainWorld'];
    fs.writeFileSync(file,JSON.stringify(manifest,null,2));
  }
}
const launch=path.join(output,'launch');fs.mkdirSync(launch);
fs.copyFileSync(path.join(repo,'bundled/codex-desktop-adapter/host.cjs'),path.join(launch,'desktop-host.cjs'));
fs.copyFileSync(path.join(here,'launch-host.cjs'),path.join(launch,'host.cjs'));
fs.writeFileSync(path.join(launch,'codlet.json'),JSON.stringify({schema:1,id:'codlet.lab.launch',version:'0.0.1',
  permissions:['host.process','cdp.raw'],host:{entry:'host.cjs'},provides:[{name:'codlet.client.launch',api:1,scope:'runtime'}]},null,2));
fs.cpSync(path.join(here,'consumer'),path.join(output,'consumer'),{recursive:true,errorOnExist:true,force:false});
fs.copyFileSync(path.join(here,'traffic-probe.js'),path.join(output,'probe.js'));
fs.copyFileSync(path.join(here,'StartupProbe.cs'),path.join(output,'StartupProbe.cs'));
fs.writeFileSync(path.join(output,'config.example.json'),JSON.stringify({root:path.join(output,'run-http'),
  clientApp:'REPLACE_WITH_ABSOLUTE_REVIEWED_APP_DIRECTORY',testBinary:'REPLACE_WITH_ABSOLUTE_CORE_ACCEPTANCE_BINARY',
  pluginsRoot:path.join(output,'plugins'),packageVersion:'26.924.2738.0',localApiKeyFixture:true,ownedBackend:true,
  durationSeconds:45,fixtureWebSocket:false,probeScript:path.join(output,'probe.js'),
  startupHelper:path.join(output,'StartupProbe.exe'),extraPlugins:[path.join(output,'consumer'),launch]},null,2));
console.log(JSON.stringify({output,configuration:path.join(output,'config.example.json')}));
