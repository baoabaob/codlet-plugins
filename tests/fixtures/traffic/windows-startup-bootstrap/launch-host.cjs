const fs=require('node:fs'),path=require('node:path'),native=require('./desktop-host.cjs');
module.exports={...native,async attachClientLaunch(context){
  const root=context.originalEnvironment.CODLET_ACCEPTANCE_ROOT;
  if(!root||fs.readFileSync(path.join(root,'owner.txt'),'utf8')!=='codlet-desktop-acceptance\n')throw Error('missing test owner');
  // Research input is a reviewed local DOS path. Normalize the Core resolver's
  // verbatim spelling before the existing adapter compares canonical names.
  const executable=context.executable.startsWith('\\\\?\\')?context.executable.slice(4):context.executable;
  const original=fs.statSync(context.executable,{bigint:true}),normalized=fs.statSync(executable,{bigint:true});
  if(original.dev!==normalized.dev||original.ino!==normalized.ino)throw Error('different image');
  try{const result=await native.attachClientLaunch({...context,executable});
    const url=new URL(context.inspectorUrl);
    let inspectorClosed=false;
    for(let attempt=0;attempt<20&&!inspectorClosed;attempt++){
      inspectorClosed=await new Promise(resolve=>{const socket=require('node:net').connect(Number(url.port),'127.0.0.1');const timer=setTimeout(()=>{socket.destroy();resolve(false)},100);socket.once('error',()=>{clearTimeout(timer);resolve(true)});socket.once('connect',()=>{clearTimeout(timer);socket.destroy();resolve(false)});});
      if(!inspectorClosed)await new Promise(resolve=>setTimeout(resolve,50));
    }
    fs.writeFileSync(path.join(root,'adapter-attach.json'),JSON.stringify({...result,inspectorClosed}));return result;}
  catch(e){fs.writeFileSync(path.join(root,'adapter-attach.json'),JSON.stringify({code:e.code,details:e.details}));throw e;}
  finally{fs.writeFileSync(path.join(root,'native-bootstrap.json.restore'),'restore');}
}};
