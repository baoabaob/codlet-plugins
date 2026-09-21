import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../../frontend/node_modules/esbuild/lib/main.js';
const base=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(base,'../..');
const result=await build({entryPoints:[path.join(base,'app.jsx')],bundle:true,write:false,format:'cjs',platform:'browser',jsxFactory:'h',target:'chrome130',loader:{'.css':'text','.svg':'text'}});
const out=path.join(root,'.artifacts/marketplace-preview');await mkdir(out,{recursive:true});await writeFile(path.join(out,'renderer.js'),result.outputFiles[0].text);
const routes=new Map([['/',[path.join(base,'index.html'),'text/html; charset=utf-8']],['/preview/renderer.js',[path.join(out,'renderer.js'),'text/javascript; charset=utf-8']],['/sdk/ui.js',[path.join(root,'.core-sdk/bundled/runtime/ui.js'),'text/javascript; charset=utf-8']]]);
const server=http.createServer(async(request,response)=>{
  const route=routes.get(new URL(request.url,'http://127.0.0.1').pathname);
  if(!route||!['GET','HEAD'].includes(request.method)){response.writeHead(404).end();return;}
  try{const data=await readFile(route[0]);response.writeHead(200,{'Content-Type':route[1],'Cache-Control':'no-store'});response.end(request.method==='HEAD'?undefined:data);}catch{response.writeHead(500).end('Preview resource unavailable');}
});
server.listen(0,'127.0.0.1',()=>console.log(`http://127.0.0.1:${server.address().port}/?page=market`));
