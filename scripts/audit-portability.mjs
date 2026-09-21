import {open,opendir,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

async function readBounded(path,limit){
  const file=await open(path,'r');
  try{
    const stat=await file.stat();
    if(!stat.isFile()||stat.size>limit)throw Error('Portability audit file size/type limit exceeded');
    // Cap allocation and reads even if a file grows after the stat call.
    const bytes=Buffer.alloc(limit+1);let length=0;
    while(length<bytes.length){
      const result=await file.read(bytes,length,bytes.length-length,null);
      if(!result.bytesRead)break;
      length+=result.bytesRead;
    }
    if(length>limit)throw Error('Portability audit file size limit exceeded');
    return bytes.subarray(0,length);
  }finally{await file.close();}
}

// A bounded, read-only audit. Signals are review hints, not proof that dynamic
// JavaScript cannot escape an Adapter or a substitute for native acceptance.
export async function auditPortability(directory){
  const root=await realpath(resolve(directory)),issues=[],files=[];
  const manifestPath=resolve(root,'codlet.json');
  const manifestStat=await lstat(manifestPath);
  if(manifestStat.isSymbolicLink()||!manifestStat.isFile())throw Error('Manifest must be a regular file');
  if(manifestStat.size>256*1024)throw Error('Manifest size limit exceeded');
  const manifestBytes=await readBounded(manifestPath,256*1024);
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  if(!manifest||typeof manifest.id!=='string'||!manifest.id||
    [manifest.requires,manifest.host?.requires,manifest.permissions].some(value=>value!==undefined&&!Array.isArray(value)))throw Error('Invalid plugin manifest');
  const add=(code,path,explicit=false)=>{if(!issues.some(i=>i.code===code&&i.path===path))issues.push({code,path,explicit});};
  const requirements=[...(manifest.requires??[]),...(manifest.host?.requires??[])];
  if(requirements.some(r=>!r||typeof r.name!=='string'))throw Error('Invalid plugin requirements');
  const hasAdapter=requirements.some(r=>typeof r.name==='string'&&r.name.startsWith('codex.'));
  if(manifest.host)add('host-code-needs-review','codlet.json');
  if((manifest.permissions??[]).some(p=>['ui.mainWorld','cdp.raw','host.process','host.process.spawn','host.system'].includes(p)))add('direct-access-permission','codlet.json');
  if(!hasAdapter)add('adapter-dependency-not-declared','codlet.json');
  let total=0,entries=0;
  async function visit(folder){
    for await(const item of await opendir(folder)){
      if(['.git','node_modules','.artifacts'].includes(item.name))continue;
      if(++entries>256)throw Error('Portability audit exceeds 256 entries');
      const path=resolve(folder,item.name),name=relative(root,path).replaceAll('\\','/'),stat=await lstat(path);
      if(stat.isSymbolicLink()){add('linked-content-not-inspected',name);continue;}
      if(stat.isDirectory()){await visit(path);continue;}
      if(!stat.isFile()){add('special-file-not-inspected',name);continue;}
      const extension=extname(name).toLowerCase();
      if(['.exe','.dll','.node','.so','.dylib','.ps1','.bat','.cmd','.sh'].includes(extension))add('native-or-system-payload',name,true);
      if(!['.js','.cjs','.mjs','.jsx','.ts','.tsx'].includes(extension))continue;
      if(stat.size>2*1024*1024||total+stat.size>8*1024*1024)throw Error('Portability audit source size limit exceeded');
      const bytes=await readBounded(path,Math.min(2*1024*1024,8*1024*1024-total)),source=bytes.toString('utf8');
      total+=bytes.length;if(bytes.length>2*1024*1024||total>8*1024*1024)throw Error('Portability audit source size limit exceeded');
      files.push({path:name,sha256:createHash('sha256').update(bytes).digest('hex')});
      if(/\b(?:node:)?(?:child_process|node-gyp|ffi-napi)\b|\bprocess\s*\.\s*(?:platform|arch)\b/.test(source))add('system-api-or-platform-branch',name,true);
      if(/\b(?:require\s*\(\s*|from\s*|import\s*)['"](?:node:)?(?:fs|os|path|electron)\b/.test(source))add('direct-system-module',name,true);
      if(/\b[A-Za-z]:[\\/]|\/Applications\/|\/Library\/|\/usr\/bin\//.test(source))add('platform-path',name,true);
      if(/\belectronBridge\b|\bipcRenderer\b|\bdocument\s*\.\s*(?:querySelector|getElementById|evaluate)\b/.test(source))add('private-client-or-direct-dom-access',name);
      if(/\beval\s*\(|\b(?:new\s+)?Function\s*\(|\bimport\s*\(|\brequire\s*\(\s*[^'"\s]/.test(source))add('dynamic-code-or-loading',name);
      for(const match of source.matchAll(/\b(?:require\s*\(\s*|from\s*|import\s*)['"]([^'"]+)['"]/g))if(!match[1].startsWith('.')&&!match[1].startsWith('node:'))add('external-module-needs-review',name);
    }
  }
  await visit(root);
  if(!files.length)add('no-inspectable-source','codlet.json');
  const status=issues.some(i=>i.explicit)?'explicit-platforms-required':issues.length?'review-required':'adapter-candidate';
  return {schema:1,pluginId:manifest.id,status,verified:false,candidateForAdapterInheritance:status==='adapter-candidate',requiredCapabilities:requirements.map(r=>({name:r.name,api:r.api,scope:r.scope})),issues,files,limitations:'Static inspection only; resolve the actually bound Adapter capabilities and transitive platform intersection before inferring support'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3)throw Error('Usage: node scripts/audit-portability.mjs PLUGIN_DIRECTORY');
  console.log(JSON.stringify(await auditPortability(process.argv[2]),null,2));
}
