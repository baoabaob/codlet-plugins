'use strict';
let cleanup;
let transfer;
const SYMBOL=Symbol.for('codlet.functional.acceptance');
const cap=(name,scope='target')=>({name,api:1,scope});
const assert=(condition,message)=>{if(!condition)throw Error(message);};
async function openDraftWhenReady(ask,isAlive,params,timeoutMs=12000){
  const deadline=Date.now()+timeoutMs;let pending;
  while(isAlive()){
    const remaining=deadline-Date.now();if(remaining<=0)throw pending??Error('Timed out waiting for draft navigation');
    try{return await ask('codex.ui.navigation.page','newTaskDraft',params,{timeoutMs:Math.min(10000,remaining)});}
    catch(error){
      // The adapter reports this before invoking the native draft action.
      // An uncertain timeout or another error must never replay the action.
      if(error.code!=='ui_host_pending'&&!/^ui_host_pending:/.test(error.message??''))throw error;
      pending=error;await new Promise(resolve=>setTimeout(resolve,Math.min(80,Math.max(0,deadline-Date.now()))));
    }
  }
  throw Error('Test retired');
}
module.exports.deactivate=()=>{cleanup?.();cleanup=null;transfer=null;};
module.exports.saveState=()=>{
  assert(transfer&&!transfer.running(),'Functional checks must settle before state transfer');
  const observed=transfer.inspect();assert(['idle','complete','failed'].includes(observed.phase),'Running checks are not transferable');
  return {schema:1,value:{phase:observed.phase,checks:observed.checks,host:observed.host,provenance:observed.provenance}};
};
module.exports.restoreState=snapshot=>{assert(transfer&&snapshot?.schema===1,'Unsupported functional Renderer state');transfer.restore(snapshot.value);};
module.exports.activate=async context=>{
  cleanup?.();if(innerWidth<480||innerHeight<400)return;
  assert(context.codex?.api===1,'Core Codex SDK API 1 is required');
  let alive=true,running=false,page,fixtureThread,resolveThread,api;
  const disposals=[],listeners=new Set(),nodes=[];
  const state={schema:1,version:context.version,generation:context.generation,phase:'idle',checks:[],host:null,fixture:null,provenance:null,coverage:null};
  transfer={running:()=>running,inspect:()=>state,restore(value){assert(value&&['idle','complete','failed'].includes(value.phase)&&Array.isArray(value.checks),'Unsupported functional Renderer snapshot');state.phase=value.phase;state.checks=value.checks;state.host=value.host??null;state.provenance=value.provenance??null;state.historical=true;state.coverage=null;save();}};
  const report=document.createElement('div');report.hidden=true;report.dataset.compatibilityAcceptance='idle';document.body.append(report);nodes.push(report);
  const ask=(name,method,args={},options={})=>{
    const callOptions={timeoutMs:10000,...options};
    if(name==='compatibility.acceptance.host')return context.rpc.request(cap(name,'runtime'),method,args,callOptions);
    if(name==='codex.backend.read')return context.codex.backend.read(method,args,callOptions);
    if(name==='codex.backend.write')return context.codex.backend.write(method,args,callOptions);
    if(name==='codex.desktop.compatibility')return context.codex.compatibility[method](args,callOptions);
    if(name==='codex.ui.navigation.page')return context.codex.navigation[method](args,callOptions);
    if(name==='codex.ui.preSubmit'&&method==='interceptors.list')return context.codex.submissions.list(args,callOptions);
    throw Error('Unknown semantic test capability '+name+' '+method);
  };
  const save=()=>{if(!alive)return;report.dataset.compatibilityAcceptance=state.phase;report.textContent=JSON.stringify(state);listeners.forEach(fn=>fn());};
  const wait=async(check,timeout=12000)=>{const end=Date.now()+timeout;while(alive&&Date.now()<end){const value=await check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,60));}throw Error(alive?'Timed out waiting for a test contract':'Test retired');};
  const check=async(id,fn)=>{const start=Date.now();try{const detail=await fn();state.checks.push({id,status:'passed',milliseconds:Date.now()-start,detail});return detail;}catch(error){state.checks.push({id,status:'failed',milliseconds:Date.now()-start,error:{code:error.code??'test_failed',message:error.message}});return null;}finally{save();}};
  const retire=()=>{if(!alive)return;alive=false;resolveThread?.(null);for(const dispose of disposals.splice(0).reverse())try{dispose();}catch{}page?.dispose();for(const node of nodes)node.remove();listeners.clear();if(globalThis[SYMBOL]===api)delete globalThis[SYMBOL];};
  cleanup=retire;context.onDeactivate(retire);
  const zh=context.i18n.locale.startsWith('zh'),label=zh?'功能测试':'Functional tests';
  function Panel({ui}){
    const React=ui.React,h=React.createElement,C=ui.components;
    const [,refresh]=React.useState(0);React.useEffect(()=>{const update=()=>refresh(value=>value+1);listeners.add(update);return()=>listeners.delete(update);},[]);
    const all=[...state.checks,...(state.host?.checks??[])],inventory=state.coverage;
    const phase=zh?({idle:'未运行',running:'正在运行',waitingForFixtureThread:'等待独立测试任务',failed:'失败',complete:'完成'}[state.phase]??state.phase):state.phase;
    const counts=inventory?.counts??{},total=inventory?.total??0;
    const summary=zh?`${phase} · 操作验证 ${counts['operation-verified']??0}/${total} · 读取 ${counts['read-verified']??0} · 接口 ${counts['interface-verified']??0} · 不可用 ${counts.unavailable??0} · 未验证 ${counts['not-verified']??total}`:
      `${phase} · operations ${counts['operation-verified']??0}/${total} · reads ${counts['read-verified']??0} · interfaces ${counts['interface-verified']??0} · unavailable ${counts.unavailable??0} · unverified ${counts['not-verified']??total}`;
    const statusText=status=>zh?({'operation-verified':'操作已验证','read-verified':'读取已验证','interface-verified':'接口已匹配',unavailable:'不可用','not-verified':'未验证'}[status]??status):status;
    return h('section',{'data-functional-test-panel':'',style:{padding:24,display:'flex',flexDirection:'column',gap:16,maxWidth:1000,margin:'0 auto',width:'100%'}},
      h('h1',{style:{fontSize:24,fontWeight:600}},zh?'Codlet 功能测试':'Codlet functional tests'),
      h('p',null,zh?'覆盖清单分别记录源码、模拟测试、接口、读取和操作证据。接口匹配后，草稿、附件、输入法和分屏生命周期仍需交互验证。':'Coverage separates source, simulated, interface, read and operation evidence. Drafts, attachments, IME and split lifecycle require interaction checks.'),
      h('p',null,zh?'只读检查读取状态并准备接口。交互测试会创建未发送草稿，并使用临时文件、回环服务和回显进程；模型检查需要独立测试环境。':'Read-only checks inspect status and prepare interfaces. Interaction checks create unsent drafts and temporary files, loopback services and an echo process; model checks need an isolated fixture.'),
      h('div',{style:{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}},h(C.Button,{onClick:()=>void run('readonly'),disabled:running},zh?'只读检查':'Read-only checks'),h(C.Button,{variant:'soft',onClick:()=>void run(),disabled:running},zh?'运行交互测试':'Run interaction checks'),h('span',{'data-functional-phase':state.phase,role:'status'},summary)),
      state.historical?h('p',{role:'status'},zh?'下方为历史记录；重新检查可生成当前构建的证据。':'Historical observations; run checks to capture evidence for the current build.'):null,
      h('details',null,h('summary',null,zh?'构建与文件身份':'Build and file identities'),h('pre',{style:{whiteSpace:'pre-wrap',fontSize:12}},JSON.stringify(state.provenance??{status:'not-captured'},null,2))),
      h('table',{style:{width:'100%',textAlign:'left',fontSize:13}},h('thead',null,h('tr',null,h('th',null,zh?'能力清单':'Capability inventory'),h('th',null,zh?'证据':'Evidence'))),
        h('tbody',null,...(inventory?.rows??[]).map(row=>h('tr',{key:row.id},h('td',{style:{padding:8}},row.id),h('td',{style:{padding:8,color:row.status==='operation-verified'?'#258045':row.status==='unavailable'?'#b64237':'inherit'}},h('details',null,h('summary',null,statusText(row.status)),h('pre',{style:{whiteSpace:'pre-wrap'}},JSON.stringify({levels:row.levels,evidence:row.evidence},null,2)))))))),
      h('h2',null,zh?'本次检查明细':'Check observations'),
      h('table',{style:{width:'100%',textAlign:'left',fontSize:13,borderCollapse:'collapse'}},h('thead',null,h('tr',null,h('th',{style:{padding:12}},zh?'检查':'Check'),h('th',{style:{padding:12,width:100}},zh?'结果':'Result'),h('th',{style:{padding:12}},zh?'详情':'Details'))),
        h('tbody',null,...all.map(item=>h('tr',{key:item.id,style:{borderBottom:'1px solid rgba(128,128,128,.2)'}},h('td',{style:{padding:12}},item.id),h('td',{style:{padding:12,color:item.status==='passed'?'#258045':item.status==='failed'?'#b64237':'inherit'}},item.status),h('td',{style:{padding:12,overflowWrap:'anywhere'}},item.error?.message??h('details',null,h('summary',null,zh?'查看详情':'View details'),h('pre',{style:{whiteSpace:'pre-wrap',fontSize:12,marginTop:8}},JSON.stringify(item.detail??{},null,2)))))))),
      h(C.Button,{variant:'soft',color:'secondary',onClick:()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='codlet-functional-test.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}},zh?'导出报告':'Export report'));
  }
  page=await context.codex.navigation.page({label,icon:'CodeSquareSlash',toolbar:true,render:({ui})=>ui.React.createElement(Panel,{ui})});
  if(!alive){page.dispose();return;}
  api={inspect:()=>state,pagePath:page.path,run,readonly:()=>run('readonly'),prepareFixture:()=>ask('compatibility.acceptance.host','native.begin'),
    releaseFixtureTraffic(){assert(!running&&['complete','failed'].includes(state.phase),'Functional checks must settle before fixture traffic is released');return ask('compatibility.acceptance.host','native.end');},
    supplyFixtureThread(id){if(state.fixture?.autorun&&typeof id==='string'){fixtureThread=id;resolveThread?.(id);return true;}return false;}};
  globalThis[SYMBOL]=api;
  async function activateTestPage(){
    const entry=await wait(()=>document.querySelector('[data-codlet-navigation-entry="'+context.pluginId+'"]'));entry.click();
    await wait(()=>document.querySelector('[data-functional-test-panel]'));
    assert(document.querySelector('[data-codlet-page-toolbar]'),'Native toolbar missing');
  }
  async function backendChecks(){
    if(!state.fixture?.autorun){state.checks.push({id:'desktop.model-operations',status:'manual',detail:{reason:'Requires isolated local model fixture'}});save();return;}
    state.phase='waitingForFixtureThread';save();
    let deadline;
    const id=fixtureThread??await Promise.race([new Promise(resolve=>{resolveThread=resolve;}),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('Isolated fixture did not supply a test task')),20000);})]).finally(()=>clearTimeout(deadline));
    if(!id||!alive)throw Error('Test retired');
    const stream=[];const releaseEvents=await context.codex.events.onEvent(event=>stream.push(event));disposals.push(releaseEvents);
    let submitCalls=0;
    const hook=await context.codex.submissions.register({id:'functional',enabled:true,timeoutMs:500},draft=>{
      if(draft.threadId===id&&draft.text.startsWith('[FUNCTIONAL]')){submitCalls++;return {text:draft.text.replace('[FUNCTIONAL]','').trim(),context:[{kind:'untrusted',text:'Synthetic functional test context'}]};}
    });disposals.push(hook);
    try{
      await check('desktop.task-open-read-and-configuration',async()=>{
        await ask('codex.backend.write','threads.open',{threadId:id});let latest;
        try{await wait(async()=>{latest=await ask('codex.backend.read','selection.get');return latest.threadId===id&&latest.resumeState==='resumed';});}
        catch(error){throw Error(error.message+' '+JSON.stringify(latest));}
        const thread=await ask('codex.backend.read','threads.get',{threadId:id}),configuration=await ask('codex.backend.read','threads.configuration',{threadId:id});assert(thread.id===id&&configuration.threadId===id,'Task identity changed');return {opened:true,provider:configuration.modelProvider};
      });
      await check('desktop.turn-start-stream-events-and-history',async()=>{
        await ask('compatibility.acceptance.host','native.begin');
        const started=await ask('codex.backend.write','turns.start',{threadId:id,text:'[FUNCTIONAL] codlet-original-request'});
        const completed=await wait(()=>stream.find(event=>event.type==='turn.completed'&&(event.turnId===started.turn.id||event.turn?.id===started.turn.id)),20000);
        assert(completed.turn?.status==='completed','Synthetic model turn failed');
        const turns=await ask('codex.backend.read','turns.list',{threadId:id,limit:10}),items=await ask('codex.backend.read','items.list',{threadId:id,limit:20});
        assert(turns.turns.some(turn=>turn.id===started.turn.id)&&items.items.length,'Turn history or items missing');
        const inspection=await ask('codex.ui.preSubmit','interceptors.list');assert(JSON.stringify(inspection).includes('functional'),'Submit hook missing');
        assert(submitCalls>0,'Submit hook did not execute');
        assert(items.items.some(item=>item.turnId===started.turn.id&&item.item.text?.includes('codlet-modified-response')),'Native model response transform did not reach history');
        const native=(await ask('compatibility.acceptance.host','inspect')).native;assert(native.request+native.clientFrames>0&&native.response+native.serverFrames>0,'Native traffic callbacks did not execute');
        return {completed:true,turns:turns.turns.length,items:items.items.length,events:stream.length,submitCalls,native};
      });
      await check('desktop.turn-steer-and-interrupt',async()=>{
        const started=await ask('codex.backend.write','turns.start',{threadId:id,text:'Interrupt this synthetic fixture turn'});
        const steered=await ask('codex.backend.write','turns.steer',{threadId:id,turnId:started.turn.id,text:'Additional fixture input'});assert(steered.turnId===started.turn.id,'Steer affected another turn');
        await ask('codex.backend.write','turns.interrupt',{threadId:id,turnId:started.turn.id});
        const completed=await wait(()=>stream.find(event=>event.type==='turn.completed'&&(event.turnId===started.turn.id||event.turn?.id===started.turn.id)),15000);assert(completed.turn?.status==='interrupted','Turn did not interrupt');return {steered:true,interrupted:true};
      });
      await check('desktop.approvals-query',async()=>{const value=await ask('codex.backend.read','approvals.list',{threadId:id});assert(Array.isArray(value.requests),'Approval schema changed');return {pending:value.requests.length,automaticApproval:false};});
    }finally{if(typeof hook==='function')hook();else hook.dispose?.();releaseEvents();}
  }
  async function workspaceChecks(){
    let workspace;
    const snapshot=await check('workspace.snapshot',async()=>{
      assert(typeof context.codex.workspace?.connect==='function','Workspace SDK is unavailable');
      workspace=await context.codex.workspace.connect();
      const value=workspace.getSnapshot();return {api:value.api,available:value.available,features:value.features,diagnostic:value.diagnostic};
    });
    const features=['navigation','transcript','composer','shortcuts','viewport','action'];
    try{
      state.checks.push({id:'workspace.surface',status:snapshot?.available?'passed':'unavailable',
        detail:{level:'interface',operationVerified:false,reason:snapshot?.diagnostic?.message??(!snapshot?.available?'Native workspace surface is unavailable':null)}});
      if(!workspace?.prepare){
        state.checks.push({id:'workspace.prepare',status:'unavailable',detail:{reason:'Installed Core does not expose workspace.prepare'}});
        for(const feature of features)state.checks.push({id:'workspace.interface.'+feature,status:'manual',detail:{reason:snapshot?'Interface preparation requires a newer Core':'Workspace session unavailable'}});
        return;
      }
      const prepared=await check('workspace.prepare',()=>workspace.prepare({features}));
      for(const feature of features){
        const result=prepared?.features?.[feature];
        state.checks.push({id:'workspace.interface.'+feature,status:result?.available?'passed':'unavailable',
          detail:{level:'interface',lifecycleVerified:false,reason:result?.diagnostic?.message??(!result?'Preparation did not return this feature':null),diagnostic:result?.diagnostic??null}});
      }
    }finally{workspace?.dispose();save();}
  }
  async function nativeIdentity(ready){
    const result={build:ready?.build??null,assets:[]};
    // Hash only static script URLs already present in the current document.
    // No guessed imports or module evaluation is used for identity capture.
    for(const node of [...(document.querySelectorAll?.('script[src],link[rel="modulepreload"][href]')??[])].slice(0,32)){
      const url=node.src??node.href;if(!url||!/(?:app-initial|app-shared|primary-panel|transcript)[^/]*\.js(?:\?|$)/.test(url))continue;
      try{
        const response=await fetch(url);assert(response.ok,'Native source response failed');
        const bytes=await response.arrayBuffer();assert(bytes.byteLength<=32*1024*1024,'Native source exceeds identity bound');
        const digest=await crypto.subtle.digest('SHA-256',bytes);
        result.assets.push({url,bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')});
      }catch(error){result.assets.push({url,unavailable:error.message});}
    }
    if(!result.build||!result.assets.some(asset=>asset.sha256))result.unavailable='Native build or static source file identity is incomplete';
    return result;
  }
  async function run(mode='interactive'){
    if(running||!alive)return;running=true;state.phase='running';state.mode=mode;state.checks=[];state.host=null;state.error=null;state.coverage=null;state.provenance=null;delete state.historical;delete state.reportSaveError;save();
    try{
      const inspection=await ask('compatibility.acceptance.host','inspect');state.fixture=inspection.fixture;
      await check('renderer-host-rpc',async()=>{const value=await ask('compatibility.acceptance.host','echo',{value:{marker:'renderer'}});assert(value.value.marker==='renderer','RPC result changed');return {hostGeneration:value.hostGeneration};});
      if(mode==='readonly'){
        const value=await ask('compatibility.acceptance.host','readonly');state.host=value.report;state.provenance=value.provenance;
      }else await ask('compatibility.acceptance.host','run');
      if(mode!=='readonly'){
      await check('renderer-storage-and-cross-world-events',async()=>{
        const current=await context.services.storage.snapshot();assert(current.schema===1,'Storage schema changed');
        const topic=await ask('compatibility.acceptance.host','events'),subscription=await context.services.events.subscribe({topic:topic.topic,after:topic.cursor});
        try{const batch=await context.services.events.read({subscription:subscription.subscription,after:topic.cursor});assert(batch.events.some(item=>item.value.marker==='host-to-renderer'),'Host event did not reach Renderer');return {received:batch.events.length};}
        finally{await context.services.events.close({resource:subscription.subscription});}
      });
      }
      const ready=await check('desktop.compatibility',async()=>{const ready=await ask('codex.desktop.compatibility','waitReady',{timeoutMs:10000},{timeoutMs:15000});assert(ready.available,'Desktop unavailable');return ready;});
      const native=await nativeIdentity(ready);
      for(const method of ['threads.list','models.list','skills.list','providers.list'])await check('desktop.'+method,async()=>{
        const reply=await ask('codex.backend.read',method,method==='threads.list'||method==='models.list'?{limit:10}:{});return {fields:Object.keys(reply),count:(reply.threads??reply.models??reply.directories??reply.providers??[]).length};
      });
      await workspaceChecks();
      if(mode!=='readonly'){
      await check('composer.action-click-and-cleanup',async()=>{
        if(!state.fixture.autorun){await activateTestPage();await openDraftWhenReady(ask,()=>alive,{prompt:'Codlet functional draft; do not submit'});}
        const token=crypto.randomUUID();let clicked=false;const action=await context.codex.composer.registerAction({token,label:'Functional check'},()=>{clicked=true;});
        try{const button=await wait(()=>document.querySelector('[data-codlet-composer-action-instance="'+token+'"] button'));button.click();assert(clicked,'Composer click did not reach the lease');}
        finally{await action.unregister();}
        assert(!document.querySelector('[data-codlet-composer-action-instance="'+token+'"]'),'Composer action leaked');return {clicked:true,cleaned:true};
      });
      await check('native.page-toolbar-and-ui-controls',async()=>{
        await activateTestPage();return {page:true,toolbar:true,controls:true};
      });
      await check('native.editable-draft',async()=>{const result=await openDraftWhenReady(ask,()=>alive,{prompt:'Codlet functional draft; do not submit'});assert(result.opened&&result.submitted===false,'Draft unexpectedly submitted');return result;});
      await backendChecks();
      await wait(async()=>{const value=await ask('compatibility.acceptance.host','inspect');state.host=value.report;save();return ['complete','failed'].includes(value.report.phase);},35000);
      }
      state.provenance={...(state.host?.provenance??state.provenance??{observedAt:new Date().toISOString(),core:{unavailable:'Host build identity unavailable'}}),native};
      state.phase=[...state.checks,...state.host.checks].some(item=>item.status==='failed')?'failed':'complete';
    }catch(error){state.error={code:error.code??'test_failed',message:error.message};state.phase='failed';}
    finally{
      save();
      if(alive)try{state.coverage=await ask('compatibility.acceptance.host','coverage',{report:state});await ask('compatibility.acceptance.host','save-report',{report:state});}
      catch(error){state.reportSaveError={code:error.code??'report_save_failed',message:error.message};}
      running=false;save();
    }
  }
  const initial=await ask('compatibility.acceptance.host','inspect');state.fixture=initial.fixture;state.coverage=initial.coverage??null;save();
  if(initial.fixture.autorun&&!context.restoringState)void run();
};
