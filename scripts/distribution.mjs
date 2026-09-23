import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {buildPlugin} from '../frontend/build-plugin.mjs';
import {buildDesktopHost} from '../frontend/build-host.mjs';

export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const blobHash=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const releasePlatforms=['windows-x86_64','windows-aarch64','macos-aarch64'];
export function safePath(path){
  if(typeof path!=='string'||!path||isAbsolute(path)||path.includes('\\')||path.includes(':')||path.includes('\0')||path.split('/').some(p=>!p||p==='.'||p==='..'||p.toLowerCase()==='.git'))throw Error(`Unsafe distribution path: ${path}`);
  return path;
}
export function validateConfig(config){
  if(config.schema!==1||!/^[-\w]+\/[-\w.]+$/.test(config.sourceRepository)||!Array.isArray(config.plugins)||!config.plugins.length)throw Error('Invalid plugin distribution configuration');
  const ids=new Set(),repos=new Set();
  for(const p of config.plugins){
    if(!/^[a-z0-9.-]+$/.test(p.id)||ids.has(p.id)||!/^[-\w]+\/[-\w.]+$/.test(p.repository)||repos.has(p.repository.toLowerCase())||p.repository===config.sourceRepository)throw Error('Invalid or duplicate plugin ID/repository');
    if(p.repository.split('/')[0]!==config.sourceRepository.split('/')[0])throw Error('Distribution repositories must belong to the development owner');
    safePath(p.directory);safePath(p.entry);
    if(!p.description||!Array.isArray(p.topics)||!p.topics.includes('codlet-plugin')||p.topics.length>20||p.topics.some(t=>!(/^[a-z0-9][a-z0-9-]{0,49}$/.test(t))))throw Error('Invalid discovery topics');
    if(!Array.isArray(p.dependencies)||p.dependencies.includes(p.id))throw Error('Invalid plugin dependencies');
    ids.add(p.id);repos.add(p.repository.toLowerCase());
  }
  for(const p of config.plugins)for(const id of p.dependencies)if(!ids.has(id))throw Error(`Unknown dependency ${id}`);
  if(!Array.isArray(config.installerPlugins)||new Set(config.installerPlugins).size!==config.installerPlugins.length||config.installerPlugins.some(id=>!ids.has(id)))throw Error('Invalid installer plugin selection');
  return config;
}

export async function prepareDistribution(root,{allowDirty=false,outputDirectory}={}){
  root=await realpath(root);
  const config=validateConfig(JSON.parse(await readFile(resolve(root,'plugins.json'),'utf8')));
  const compatibility=JSON.parse(await readFile(resolve(root,'compatibility/client-profiles.json'),'utf8'));
  if(compatibility.schema!==1||!Array.isArray(compatibility.builds))throw Error('Invalid reviewed client profile source');
  const reviewedClientProfiles=[...new Map(compatibility.builds.map(({appVersion,buildNumber,appServerVersion})=>[`${appVersion}/${buildNumber}`,{appVersion,buildNumber,appServerVersion}])).values()];
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();
  const sourceCommit=git('rev-parse','HEAD'),dirty=!!git('status','--porcelain','--untracked-files=normal');
  if(dirty&&!allowDirty)throw Error('Commit the tested development files before preparing a synchronized distribution (use --allow-dirty for local inspection only)');
  const out=resolve(root,outputDirectory??'dist'),catalog=JSON.parse(await readFile(resolve(out,'catalog.json'),'utf8'));
  const plan={schema:1,kind:'codlet-distribution-plan',sourceRepository:config.sourceRepository,sourceCommit,dirty,plugins:[]};
  for(const plugin of config.plugins){
    const pkg=catalog.packages.find(p=>p.id===plugin.id);
    if(!pkg||pkg.repository!==`https://github.com/${plugin.repository}`||pkg.tag!==`v${pkg.version}`||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version))throw Error(`Invalid package catalog for ${plugin.id}`);
    const archive=await readFile(resolve(out,safePath(pkg.asset)));
    if(hash(archive)!==pkg.sha256||archive.length!==pkg.bytes)throw Error(`Archive changed for ${plugin.id}`);
    const packageDirectory=resolve(out,safePath(pkg.directory));
    const manifest=JSON.parse(await readFile(resolve(packageDirectory,'codlet.json'),'utf8'));
    const metadata=JSON.parse(await readFile(resolve(packageDirectory,'codlet-package.json'),'utf8'));
    if(metadata.schema!==1||metadata.runtimeApi!==1||canonical(metadata.platforms)!==canonical(releasePlatforms)||
      canonical(metadata.adapters?.codex?.clientProfiles)!==canonical(reviewedClientProfiles)||
      'testedBuilds'in(metadata.adapters?.codex??{})||'limitations'in(metadata.adapters?.codex??{}))throw Error(`Stale or invalid release metadata for ${plugin.id}; rebuild and package first`);
    const releaseAssetPath=safePath(`release-assets/${plugin.id}/codlet-release.json`);
    const releaseAssetBytes=await readFile(resolve(out,releaseAssetPath));
    if(releaseAssetBytes.length>16*1024)throw Error(`Release declaration is too large for ${plugin.id}`);
    const releaseDeclaration=JSON.parse(releaseAssetBytes);
    const expectedDeclaration={schema:1,kind:'codlet-plugin-release',manifest,metadata,asset:{name:pkg.asset,bytes:archive.length,sha256:hash(archive)}};
    if(canonical(releaseDeclaration)!==canonical(expectedDeclaration))throw Error(`Release declaration differs from the actual package for ${plugin.id}`);
    safePath(manifest.renderer.entry);
    const built=await buildPlugin(resolve(root,'frontend'),plugin.entry);
    const hostBuilt=manifest.host?await buildDesktopHost(resolve(root,'frontend')):null;
    const files=new Map();
    const add=(path,bytes)=>{safePath(path);if(files.has(path))throw Error(`Duplicate export ${path}`);files.set(path,Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes));};
    for(const file of pkg.files){
      const bytes=await readFile(resolve(out,pkg.directory,safePath(file.path)));
      if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error(`Package payload changed: ${file.path}`);
      add(file.path,bytes);
    }
    if(!files.get(manifest.renderer.entry).equals(Buffer.from(built.code)))throw Error(`Stale bundle for ${plugin.id}; rebuild and package first`);
    if(hostBuilt&&!files.get(manifest.host.entry)?.equals(Buffer.from(hostBuilt.code)))throw Error(`Stale Host bundle for ${plugin.id}; rebuild and package first`);
    for(const file of [...new Set([...built.inputs,...hostBuilt?.inputs??[]])]){
      const actual=await realpath(file),path=relative(root,actual).replaceAll('\\','/');
      safePath(path);add(path,await readFile(actual));
    }
    for(const path of ['frontend/build-plugin.mjs','frontend/package-lock.json'])add(path,await readFile(resolve(root,path)));
    if(hostBuilt)add('frontend/build-host.mjs',await readFile(resolve(root,'frontend/build-host.mjs')));
    const buildPackage=JSON.parse(await readFile(resolve(root,'frontend/package.json'),'utf8'));
    buildPackage.scripts={build:'node build.mjs'};
    add('frontend/package.json',JSON.stringify(buildPackage,null,2)+'\n');
    add('frontend/build.mjs',`// Generated distribution build; make changes in ${config.sourceRepository}\nimport {readFile,writeFile,mkdir} from 'node:fs/promises';\nimport {resolve,dirname} from 'node:path';\nimport {fileURLToPath} from 'node:url';\nimport {buildPlugin} from './build-plugin.mjs';\nconst base=dirname(fileURLToPath(import.meta.url)),root=resolve(base,'..');\nconst manifest=JSON.parse(await readFile(resolve(root,'codlet.json'),'utf8'));\nconst result=await buildPlugin(base,${JSON.stringify(plugin.entry)});\nconst destination=resolve(root,manifest.renderer.entry);\nawait mkdir(dirname(destination),{recursive:true});\nawait writeFile(destination,result.code);\n${hostBuilt?"const {buildDesktopHost}=await import('./build-host.mjs');\nawait writeFile(resolve(root,manifest.host.entry),(await buildDesktopHost(base)).code);\n":""}`);
    add('.gitignore','frontend/node_modules/\n');
    add('.gitattributes','* -text\n');
    add('CONTRIBUTING.md',`# Contributing\n\nThis is an automatically generated distribution repository. Develop and report issues in https://github.com/${config.sourceRepository}. Direct edits here will stop synchronization rather than being overwritten.\n\nThe development repository is the source of truth. Plugin IDs and release channels stay independent.\n\nOriginal Codlet code and contributions are licensed under Apache-2.0; see LICENSE and NOTICE. Preserve third-party dependency licenses and notices.\n`);
    const inventory=()=>[...files].sort(([a],[b])=>a.localeCompare(b,'en')).map(([path,bytes])=>({path,bytes:bytes.length,sha256:hash(bytes),gitBlob:blobHash(bytes)}));
    const payloadFiles=inventory(),contentDigest=hash(Buffer.from(JSON.stringify(payloadFiles)));
    add('.codlet-distribution.json',JSON.stringify({schema:1,kind:'codlet-generated-distribution',pluginId:plugin.id,repository:plugin.repository,sourceRepository:config.sourceRepository,sourceCommit,version:pkg.version,packageSha256:pkg.sha256,contentDigest,files:payloadFiles},null,2)+'\n');
    const directory=`repositories/${plugin.repository.split('/')[1]}`;
    for(const [path,bytes]of files){const target=resolve(out,directory,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
    plan.plugins.push({id:plugin.id,repository:plugin.repository,description:plugin.description,topics:plugin.topics,version:pkg.version,tag:pkg.tag,directory,contentDigest,archive:{path:pkg.asset,bytes:pkg.bytes,sha256:pkg.sha256},releaseAsset:{name:'codlet-release.json',path:releaseAssetPath,bytes:releaseAssetBytes.length,sha256:hash(releaseAssetBytes)},files:inventory()});
  }
  await writeFile(resolve(out,'distribution-plan.json'),JSON.stringify(plan,null,2)+'\n');
  return plan;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.slice(2).some(arg=>arg!=='--allow-dirty'))throw Error('Usage: node scripts/distribution.mjs [--allow-dirty]');
  const plan=await prepareDistribution(resolve(dirname(fileURLToPath(import.meta.url)),'..'),{allowDirty:process.argv.includes('--allow-dirty')});
  console.log(JSON.stringify({sourceCommit:plan.sourceCommit,dirty:plan.dirty,plugins:plan.plugins.map(p=>({id:p.id,repository:p.repository,tag:p.tag,files:p.files.length}))},null,2));
}
