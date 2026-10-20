import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const source=process.argv[2];
const destination=process.argv[3];
if(!source||!isAbsolute(source)||process.argv.length>4||destination!==undefined&&!isAbsolute(destination))throw Error('Usage: node scripts/prepare-core-sdk.mjs ABSOLUTE_CORE_CHECKOUT [ABSOLUTE_OUTPUT_DIRECTORY]');
const root=destination??resolve(dirname(fileURLToPath(import.meta.url)),'..','.core-sdk');
for(const relative of ['bundled/runtime/ui.js','bundled/runtime/page.js','bundled/runtime/i18n.js','scripts/plugin-release.mjs']){
  const contents=await readFile(resolve(source,relative));
  await mkdir(dirname(resolve(root,relative)),{recursive:true});await writeFile(resolve(root,relative),contents);
}
await writeFile(resolve(root,'source.json'),JSON.stringify({coreCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim()},null,2)+'\n');
console.log('Prepared matching Core UI, page and i18n bundles for GUI tests and preview; no plugins registered');
