import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPlugin} from './build-plugin.mjs';
const base=dirname(fileURLToPath(import.meta.url)),root=resolve(base,'..');
const config=JSON.parse(await readFile(resolve(root,'plugins.json'),'utf8'));
const artifacts=[];
for(const plugin of config.plugins){
  const directory=resolve(root,'bundled',plugin.directory),manifest=JSON.parse(await readFile(resolve(directory,'codlet.json'),'utf8'));
  if(manifest.id!==plugin.id)throw Error('Plugin manifest/catalog ID mismatch');
  artifacts.push([resolve(directory,manifest.renderer.entry),(await buildPlugin(base,plugin.entry)).code]);
}
for(const [file,contents]of artifacts){await mkdir(dirname(file),{recursive:true});await writeFile(file,contents);}
console.log('Built official plugins from plugins.json independently of Core');
