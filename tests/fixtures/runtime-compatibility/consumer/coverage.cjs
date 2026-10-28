'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const catalog=require('./coverage-catalog.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const catalogSha=()=>hash(fs.readFileSync(path.join(__dirname,'coverage-catalog.json')));
const identityFiles=['codlet.json','codlet-package.json','host.cjs','renderer.js','coverage.cjs','coverage-catalog.json'];
const mappings={
  'renderer-host-rpc':['operation','rpc.request','rpc.provide'],
  'renderer-storage-and-cross-world-events':['operation','core.storage.snapshot','core.events.subscribe','core.events.read','core.events.close'],
  'host.system':['read','host.system.info'],
  'storage.transaction-and-conflict':['operation','core.storage.snapshot','core.storage.transaction','core.storage.get','core.storage.changes'],
  'events.replay-and-close':['operation','core.events.createTopic','core.events.subscribe','core.events.publish','core.events.read','core.events.ack','core.events.close'],
  'tasks.progress-idempotency-and-cancellation':['operation','core.tasks.register','core.tasks.start','core.tasks.get','core.tasks.cancel'],
  'files.atomic-read-watch-and-cleanup':['operation','core.files.writeAtomic','core.files.read','core.files.watch','core.files.changes','core.files.unwatch','core.files.stat','core.files.remove','host.fs.readText'],
  'processes.streaming-and-receipts':['operation','core.processes.spawn','core.processes.write','core.processes.endInput','core.processes.read','core.processes.status','core.processes.close'],
  'network.direct-profile-fetch-and-credentials':['operation','core.network.createProfile','core.network.resolve','core.network.fetch','core.network.closeProfile','core.credentials.list','core.credentials.put','core.credentials.metadata','core.credentials.remove'],
  'traffic.channel-http-sse-and-websocket':['operation','traffic.openChannel'],
  'traffic.interception-own-source':['operation','traffic.openSource','traffic.registerInterceptor'],
  'management.read-and-resources':['read','management.list','core.resources.list','core.diagnostics.read','traffic.inspect'],
  'desktop.compatibility':['read','codex.compatibility.waitReady'],
  'desktop.threads.list':['read','codex.read.threads.list'],
  'desktop.models.list':['read','codex.read.models.list'],
  'desktop.skills.list':['read','codex.read.skills.list'],
  'desktop.providers.list':['read','codex.read.providers.list'],
  'desktop.approvals-query':['read','codex.read.approvals.list'],
  'desktop.model-operations':['operation','native.traffic.model-transform'],
  'workspace.snapshot':['read','codex.workspace.connect','workspace.getSnapshot','workspace.dispose'],
  'workspace.surface':['interface','native.workspace.surface'],
  'workspace.prepare':['interface','workspace.prepare'],
  'composer.action-click-and-cleanup':['operation','codex.composer.registerAction','codex.composerAction.unregister'],
  'native.page-toolbar-and-ui-controls':['operation','codex.navigation.page','ui.page-controls'],
  'native.editable-draft':['operation','codex.navigation.newTaskDraft'],
  'desktop.task-open-read-and-configuration':['operation','codex.write.threads.open','codex.read.selection.get','codex.read.threads.get','codex.read.threads.configuration'],
  'desktop.turn-start-stream-events-and-history':['operation','codex.write.turns.start','codex.read.turns.list','codex.read.items.list','codex.events.onEvent','codex.submissions.register','codex.submissions.list','native.traffic.model-transform'],
  'desktop.turn-steer-and-interrupt':['operation','codex.write.turns.steer','codex.write.turns.interrupt'],
};
const validHash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const text=value=>typeof value==='string'&&value.length>0;
function binding(report,provenance,check,id,carrier){
  if(report.historical)return {bound:false,reason:'historical observation'};
  if(!provenance||!text(report.runId)||provenance.runId!==report.runId||check.runId!==report.runId)return {bound:false,reason:'run identity is missing or differs'};
  if(!text(provenance.observedAt)||!Number.isFinite(Date.parse(provenance.observedAt)))return {bound:false,reason:'observation time is missing'};
  const plugin=provenance.plugin,caller=provenance.caller,core=provenance.core;
  if(!plugin||!text(plugin.id)||plugin.id!==report.pluginId||!text(plugin.version)||plugin.version!==report.version||plugin.generation!==report.generation||!Number.isSafeInteger(plugin.generation)||plugin.generation<1)return {bound:false,reason:'plugin identity differs'};
  if(!Array.isArray(plugin.files)||plugin.files.some(file=>!validHash(file.sha256)||file.unavailable)||identityFiles.some(name=>plugin.files.filter(file=>file.path?.replaceAll('\\','/').split('/').at(-1)===name).length!==1))return {bound:false,reason:'plugin file identity is incomplete'};
  if(!caller||caller.pluginId!==plugin.id||caller.generation!==plugin.generation||!text(caller.targetId)||!Number.isSafeInteger(caller.documentEpoch)||caller.documentEpoch<1)return {bound:false,reason:'authenticated caller identity is missing or differs'};
  if(carrier?.plugin?.id!==plugin.id||carrier.plugin.version!==plugin.version||carrier.plugin.generation!==plugin.generation||
    carrier.caller?.pluginId!==caller.pluginId||carrier.caller.generation!==caller.generation||carrier.caller.targetId!==caller.targetId||carrier.caller.documentEpoch!==caller.documentEpoch)return {bound:false,reason:'current report carrier differs from the observed owner'};
  if(!core||!text(core.version)||!validHash(core.executable?.sha256)||!Number.isSafeInteger(core.executable.bytes)||core.executable.bytes<=0||core.unavailable)return {bound:false,reason:'Core binary identity is incomplete'};
  const native=/^(?:codex\.|workspace\.|native\.|ui\.)/.test(id);
  if(!native)return {bound:true,domain:'core'};
  const identity=provenance.native;
  if(!identity||identity.unavailable||!text(identity.build?.appVersion)||!text(identity.build?.buildNumber))return {bound:false,reason:'Native build identity is incomplete'};
  if(!identity.document||!text(identity.document.href)||!Number.isFinite(identity.document.timeOrigin)||identity.document.timeOrigin<=0)return {bound:false,reason:'Native document identity is incomplete'};
  if(identity.owner?.pluginId!==caller.pluginId||identity.owner?.generation!==caller.generation||identity.owner?.targetId!==caller.targetId||identity.owner?.documentEpoch!==caller.documentEpoch)return {bound:false,reason:'Native document owner differs'};
  if(!Array.isArray(identity.assets)||!identity.assets.length||identity.assets.some(asset=>!text(asset.url)||!validHash(asset.sha256)||asset.unavailable))return {bound:false,reason:'Native static source identity is incomplete'};
  return {bound:true,domain:'native'};
}
function project(report,carrier=report.carrier){
  const rows=catalog.entries.map(entry=>({...entry,evidence:[]})),byId=new Map(rows.map(row=>[row.id,row])),unmapped=[];
  const sources=[report,...(report.host?[report.host]:[])];
  for(const observed of sources){
    const source=report.historical?{...observed,historical:true}:observed;
    let provenance=source.provenance;
    if(source!==report&&source.runId===report.runId&&provenance?.caller?.targetId===report.provenance?.caller?.targetId&&provenance?.caller?.documentEpoch===report.provenance?.caller?.documentEpoch){
      provenance={...provenance,native:report.provenance?.native??provenance?.native};
    }
    for(const check of source.checks??[]){
      const mapping=mappings[check.id]??(
        /^workspace\.interface\.(navigation|transcript|composer|shortcuts|viewport|action)$/.test(check.id)?['interface',`native.workspace.${check.id.split('.').pop()}-interface`]:
        /^native\.source\.(desktop-main-http|owned-backend-provider)$/.test(check.id)?['interface',`native.traffic.${check.id.slice('native.source.'.length)}`]:null);
      if(!mapping){unmapped.push(check.id);continue;}
      const [level,...ids]=mapping;
      for(const id of ids){
        const row=byId.get(id);if(!row){unmapped.push(`${check.id} → ${id}`);continue;}
        const owner=binding(source,provenance,check,id,carrier);
        row.evidence.push({check:check.id,runId:check.runId??null,level,status:check.status,historical:source.historical===true,
          bound:owner.bound,domain:owner.domain??null,bindingReason:owner.reason??null,observedAt:provenance?.observedAt??null,
          reason:check.error?.message??check.detail?.reason??null});
      }
    }
  }
  for(const row of rows){
    row.levels=Object.fromEntries(catalog.levels.map(level=>{
      const current=row.evidence.filter(item=>item.level===level&&!item.historical&&item.bound);
      return [level,current.some(item=>['failed','unavailable'].includes(item.status))?'unavailable':current.some(item=>item.status==='passed')?'verified':'not-verified'];
    }));
    row.status=Object.values(row.levels).includes('unavailable')?'unavailable':row.levels.operation==='verified'?'operation-verified':row.levels.read==='verified'?'read-verified':row.levels.interface==='verified'?'interface-verified':'not-verified';
  }
  const inventory=report.provenance?.catalog;
  return {schema:1,catalog:{coreVersion:catalog.coreVersion,sha256:catalogSha(),files:catalog.files},
    inventory:{status:inventory?.sha256===catalogSha()&&inventory?.coreVersion===catalog.coreVersion&&inventory?.status==='matched'?'matched':inventory?'stale-or-unavailable':'unobserved',note:'Inventory mismatch is not a Native incompatibility result'},
    total:rows.length,counts:Object.fromEntries(['operation-verified','read-verified','interface-verified','unavailable','not-verified'].map(status=>[status,rows.filter(row=>row.status===status).length])),rows,unmappedChecks:[...new Set(unmapped)]};
}
function fileIdentity(file){
  let descriptor;
  try{
    descriptor=fs.openSync(file,'r');const before=fs.fstatSync(descriptor);if(!before.isFile())throw Error('Identity path is not a file');
    const digest=crypto.createHash('sha256'),buffer=Buffer.alloc(65536);let bytes=0,count;
    while((count=fs.readSync(descriptor,buffer,0,buffer.length,null))>0){bytes+=count;digest.update(buffer.subarray(0,count));}
    const after=fs.fstatSync(descriptor);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||bytes!==after.size)throw Error('Identity file changed while reading');
    return {path:file,bytes,sha256:digest.digest('hex')};
  }catch(error){return {path:file,unavailable:error.message};}
  finally{if(descriptor!==undefined)fs.closeSync(descriptor);}
}
function identity(context,snapshot,{runId,caller}={}){
  const result={schema:2,runId,observedAt:new Date().toISOString(),caller:caller?{...caller}:null,core:{version:snapshot?.runtimeVersion??null},
    plugin:{id:context.plugin.id,version:context.plugin.version,generation:context.plugin.generation,
      files:identityFiles.map(file=>fileIdentity(path.join(context.root,file)))},
    native:{build:null,assets:[],unavailable:'Renderer identity has not been captured'},catalog:{coreVersion:catalog.coreVersion,sha256:catalogSha(),status:'unavailable'}};
  try{
    const skill=snapshot?.runtimeSkill?.path;if(!skill)throw Error('Runtime skill identity unavailable');
    const root=path.extname(skill)?path.dirname(skill):skill,metadataFile=path.join(root,'runtime.json'),metadata=JSON.parse(fs.readFileSync(metadataFile,'utf8'));
    if(metadata.runtimeVersion!==snapshot.runtimeVersion)throw Error('Runtime metadata version differs from live management snapshot');
    result.core.metadata=fileIdentity(metadataFile);result.core.executable=fileIdentity(metadata.cliExecutable);
    result.catalog.files=catalog.files.map(file=>({...file,observed:fileIdentity(path.join(root,file.path))}));
    result.catalog.status=metadata.runtimeVersion===catalog.coreVersion&&result.catalog.files.every(file=>file.observed.sha256===file.sha256)?'matched':'stale-or-unavailable';
  }catch(error){result.core.unavailable=error.message;}
  return result;
}
function sourceChecks(traffic){
  return ['desktop-main-http','owned-backend-provider'].map(id=>{
    const source=traffic?.activatedSources?.find(item=>item.id===id),unsupported=traffic?.unsupportedSources?.find(item=>item.id===id);
    return {id:`native.source.${id}`,status:source&&traffic.attached===true?'passed':unsupported?'unavailable':'manual',
      detail:{level:'interface',attached:traffic?.attached===true,source:source??null,reason:unsupported?.reason??unsupported?.code??(!source?'Native source has not been observed attached':null),unsupported:unsupported??null,operationVerified:false}};
  });
}
module.exports={project,identity,sourceChecks,catalog};
