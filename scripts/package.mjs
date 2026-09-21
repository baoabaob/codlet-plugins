import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'dist');await mkdir(out,{recursive:true});
const hash=data=>createHash('sha256').update(data).digest('hex');
function crc32(data){let value=0xffffffff;for(const byte of data){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
function zip(files){
  const body=[],central=[];let offset=0;
  for(const [path,bytes]of files){
    const name=Buffer.from(path),packed=deflateRawSync(bytes),crc=crc32(bytes);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(packed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
    body.push(header,name,packed);
    const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(8,10);entry.writeUInt16LE(33,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(packed.length,20);entry.writeUInt32LE(bytes.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);central.push(entry,name);offset+=header.length+name.length+packed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...body,directory,end]);
}
const packages=[];
const config=JSON.parse(await readFile(resolve(root,'plugins.json'),'utf8'));
for(const plugin of config.plugins){
  const dir=plugin.directory;
  const source=resolve(root,'bundled',dir),manifestBytes=await readFile(resolve(source,'codlet.json')),manifest=JSON.parse(manifestBytes);
  if(manifest.id!==plugin.id)throw Error('Plugin manifest/catalog ID mismatch');
  const dependencies=plugin.dependencies;
  const metadata=Buffer.from(JSON.stringify({schema:1,runtimeApi:1,platforms:['windows-x86_64','windows-aarch64','macos-aarch64'],author:'Codlet',adapters:{codex:{testedBuilds:['26.915.31945/9922'],limitations:['Windows x64 local Preview; Windows ARM64 and macOS native client acceptance pending']}}},null,2)+'\n');
  const dependencyLinks=dependencies.map(id=>{const item=config.plugins.find(p=>p.id===id);if(!item)throw Error(`Unknown dependency ${id}`);return `[${id}](https://github.com/${item.repository})`;});
  const readme=Buffer.from(`# ${manifest.name}\n\n${plugin.description}\n\nPlugin ID: \`${manifest.id}\` · Version: \`${manifest.version}\`\n\n## Install and update\n\nIn Codlet, choose **Add → Import plugin → GitHub**, then paste:\n\nhttps://github.com/${plugin.repository}\n\nUse the plugin ZIP from [Releases](https://github.com/${plugin.repository}/releases), not GitHub's generated source-code archive. Codlet follows this plugin's own release channel for updates after a GitHub installation. Private repositories and draft releases are not available to the current unauthenticated importer.\n\nDependencies: ${dependencyLinks.join(', ')||'Core only'}. Install dependencies first; the current importer does not fetch them automatically.\n\nPermissions: ${manifest.permissions.map(p=>'`'+p+'`').join(', ')}\n\n## Development\n\nThis repository is generated from [codlet-plugins](https://github.com/${config.sourceRepository}). Make changes and report issues in that development repository; edits here are not automatically merged back.\n\nThe source snapshot and pinned build dependencies are included. To rebuild this plugin:\n\n\`\`\`text\nnpm ci --prefix frontend\nnode frontend/build.mjs\n\`\`\`\n\nCore's runtime SDK is supplied by Codlet. The source revision and exact files are recorded in \`.codlet-distribution.json\`. Windows x64 Preview is tested; Windows ARM64 and macOS real-client acceptance remain pending.\n\n## Remove\n\nUse the Codlet CLI or GUI. Removing the GUI or its dependency from within that GUI is intentionally protected; use the CLI.\n`);
  const files=[['codlet.json',manifestBytes],['codlet-package.json',metadata],['README.md',readme],[manifest.renderer.entry,await readFile(resolve(source,manifest.renderer.entry))]].sort(([a],[b])=>a.localeCompare(b));
  const destination=resolve(out,'packages',manifest.id);await mkdir(destination,{recursive:true});
  for(const [path,bytes]of files){await mkdir(dirname(resolve(destination,path)),{recursive:true});await writeFile(resolve(destination,path),bytes);}
  const archive=zip(files),asset=`${manifest.id}-${manifest.version}.zip`;await writeFile(resolve(out,asset),archive);
  packages.push({id:manifest.id,name:manifest.name,version:manifest.version,repository:`https://github.com/${plugin.repository}`,tag:`v${manifest.version}`,dependencies,permissions:manifest.permissions,directory:`packages/${manifest.id}`,asset,sha256:hash(archive),bytes:archive.length,files:files.map(([path,bytes])=>({path,bytes:bytes.length,sha256:hash(bytes)}))});
}
await writeFile(resolve(out,'catalog.json'),JSON.stringify({schema:1,kind:'codlet-official-plugin-bundle',repository:`https://github.com/${config.sourceRepository}`,installerPlugins:config.installerPlugins,packages},null,2)+'\n');
console.log(packages.map(p=>`${p.id} ${p.version}: ${p.asset} ${p.sha256}`).join('\n'));
