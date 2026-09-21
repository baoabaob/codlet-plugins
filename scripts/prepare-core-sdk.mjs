import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const source=process.argv[2];
if(!source||!isAbsolute(source))throw Error('Pass an absolute matching Core checkout');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','.core-sdk');
for(const relative of ['bundled/runtime/ui.js','bundled/runtime/i18n.js','runtime/host-traffic-bundle.cjs']){
  const contents=await readFile(resolve(source,relative));
  await mkdir(dirname(resolve(root,relative)),{recursive:true});await writeFile(resolve(root,relative),contents);
}
await writeFile(resolve(root,'source.json'),JSON.stringify({coreCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim()},null,2)+'\n');
console.log('Prepared ignored test SDK snapshot; no plugins registered');
