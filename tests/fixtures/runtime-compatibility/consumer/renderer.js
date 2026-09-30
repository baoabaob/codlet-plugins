module.exports.deactivate=()=>{};
module.exports.activate=context=>{
  if(innerWidth<480||innerHeight<400)return;
  let alive=true;const nodes=[],results={};
  const cap=name=>({name,api:1,scope:'target'}),ask=(name,method,args)=>context.rpc.request(cap(name),method,args);
  const report=document.createElement('div');report.hidden=true;report.dataset.compatibilityAcceptance='starting';document.body.append(report);nodes.push(report);
  const save=()=>{report.textContent=JSON.stringify(results)};
  const wait=async check=>{const end=Date.now()+45000;while(alive){const result=check();if(result)return result;if(Date.now()>end)throw Error('Timed out waiting for a native contract');await new Promise(r=>setTimeout(r,100));}throw Error('retired');};
  context.onDeactivate(()=>{alive=false;for(const node of nodes)node.remove();});
  void(async()=>{
    await wait(()=>document.querySelector('nav[data-app-navigation-rail="true"],nav button.sidebar-item'));
    results.desktop=await ask('codex.desktop.compatibility','waitReady',{timeoutMs:10000});save();
    if(!results.desktop.available)throw Error('Desktop adapter unavailable');
    results.threads=await ask('codex.backend.read','threads.list',{limit:1});save();
    const actionToken='compatibility-action-12345',action=document.createElement('span');
    Object.assign(action.dataset,{codletComposerActionLease:actionToken,codletComposerActionOwner:context.pluginId,codletGeneration:String(context.generation)});
    document.body.append(action);nodes.push(action);
    results.composer=await ask('codex.ui.composer.action','register',{token:actionToken,label:'Contract check'});save();
    const actionButton=await wait(()=>document.querySelector('[data-codlet-composer-action-instance="'+actionToken+'"] button'));
    let clicked=false;action.addEventListener('codlet:composer-action',()=>clicked=true,{once:true});actionButton.click();results.composerClick=clicked;save();
    const token='compatibility-page-12345',lease=document.createElement('span');
    Object.assign(lease.dataset,{codletPageLease:token,codletPageOwner:context.pluginId,codletGeneration:String(context.generation)});
    document.body.append(lease);nodes.push(lease);
    results.page=await ask('codex.ui.navigation.page','register',{token,label:'Contract check',icon:'Cube',toolbar:true});save();
    const entry=await wait(()=>document.querySelector('[data-codlet-navigation-entry="'+context.pluginId+'"]'));entry.click();
    await wait(()=>document.querySelector('[data-codlet-page-host="'+token+'"]'));
    results.toolbar=!!document.querySelector('[data-codlet-page-toolbar="'+token+'"]');save();
    try{results.draft=await ask('codex.ui.navigation.page','newTaskDraft',{prompt:'Codlet compatibility draft; do not submit.'});}
    catch(error){results.draftError=String(error.message);}save();
    lease.remove();action.remove();
    await wait(()=>!document.querySelector('[data-codlet-navigation-entry="'+context.pluginId+'"]'));
    results.cleaned=!document.querySelector('[data-codlet-composer-action-instance="'+actionToken+'"]');
    report.dataset.compatibilityAcceptance='complete';save();
  })().catch(error=>{results.error=String(error.message);report.dataset.compatibilityAcceptance='failed';save();});
};
