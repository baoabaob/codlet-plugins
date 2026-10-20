'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const catalog=require('./coverage-catalog.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const mappings={
  'renderer-host-rpc':['operation','rpc.request','rpc.provide'],
  'renderer-storage-and-cross-world-events':['operation','core.storage.snapshot','core.events.subscribe','core.events.read','core.events.close'],
  'host.system':['read','host.system.info'],
  'storage.transaction-and-conflict':['operation','core.storage.snapshot','core.storage.transaction','core.storage.get','core.storage.changes'],
  'events.replay-and-close':['operation','core.events.createTopic','core.events.subscribe','core.events.publish','core.events.read','core.events.ack','core.events.close'],
  'tasks.progress-idempotency-and-cancellation':['operation','core.tasks.register','core.tasks.start','core.tasks.get','core.tasks.cancel'],
  'files.atomic-read-watch-and-cleanup':['operation','core.files.writeAtomic','core.files.read','core.files.watch','core.files.changes','core.files.unwatch','core.files.stat','core.files.remove','host.fs.readText'],
  'processes.streaming-and-receipts':['operation','core.processes.start','core.processes.write','core.processes.endInput','core.processes.read','core.processes.status','core.processes.close'],
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
const levels=catalog.levels;
function project(report){
  const checks=[...(report.checks??[]),...(report.host?.checks??[])];
  const rows=catalog.entries.map(entry=>({...entry,evidence:[]}));
  const byId=new Map(rows.map(row=>[row.id,row]));
  const unmapped=[];
  for(const check of checks){
    const mapping=mappings[check.id]??(
      /^workspace\.interface\.(navigation|transcript|composer|shortcuts|viewport|action)$/.test(check.id)
        ?['interface',`native.workspace.${check.id.split('.').pop()}-interface`]:
      /^native\.source\.(desktop-main-http|owned-backend-provider)$/.test(check.id)
        ?['interface',`native.traffic.${check.id.slice('native.source.'.length)}`]:null);
    if(!mapping){unmapped.push(check.id);continue;}
    const [level,...ids]=mapping;
    for(const id of ids){
      const row=byId.get(id);
      if(!row){unmapped.push(`${check.id} → ${id}`);continue;}
      // Old observations without captured identity remain historical. Restoring a
      // generation never upgrades an old check into a current verification.
      const historical=!!report.historical||!!report.host?.historical||!report.provenance;
      row.evidence.push({check:check.id,level,status:check.status,historical,
        observedAt:report.provenance?.observedAt??null,reason:check.error?.message??check.detail?.reason??null});
    }
  }
  for(const row of rows){
    row.levels=Object.fromEntries(levels.map(level=>{
      const current=row.evidence.filter(item=>item.level===level&&!item.historical);
      const status=current.some(item=>['failed','unavailable'].includes(item.status))?'unavailable':
        current.some(item=>item.status==='passed')?'verified':'not-verified';
      return [level,status];
    }));
    row.status=Object.values(row.levels).includes('unavailable')?'unavailable':
      row.levels.operation==='verified'?'operation-verified':
      row.levels.read==='verified'?'read-verified':
      row.levels.interface==='verified'?'interface-verified':'not-verified';
  }
  return {schema:1,catalog:{coreVersion:catalog.coreVersion,sha256:hash(fs.readFileSync(path.join(__dirname,'coverage-catalog.json'))),files:catalog.files},
    total:rows.length,counts:Object.fromEntries(['operation-verified','read-verified','interface-verified','unavailable','not-verified'].map(status=>[status,rows.filter(row=>row.status===status).length])),
    rows,unmappedChecks:[...new Set(unmapped)]};
}
function fileIdentity(file){
  try{const stat=fs.statSync(file);if(!stat.isFile()||stat.size>256*1024*1024)throw Error('Unsupported identity file size');
    return {path:file,bytes:stat.size,sha256:hash(fs.readFileSync(file))};
  }catch(error){return {path:file,unavailable:error.message};}
}
function identity(context,snapshot){
  const result={schema:1,observedAt:new Date().toISOString(),core:{version:snapshot?.runtimeVersion??null},
    plugin:{id:context.plugin.id,version:context.plugin.version,generation:context.plugin.generation,
      files:['codlet.json','codlet-package.json','host.cjs','renderer.js','coverage.cjs','coverage-catalog.json'].map(file=>fileIdentity(path.join(context.root,file)))},
    native:{build:null,assets:[],unavailable:'Renderer identity has not been captured'},catalogCoreVersion:catalog.coreVersion};
  try{
    const skill=snapshot?.runtimeSkill?.path;if(!skill)throw Error('Runtime skill identity unavailable');
    const metadataFile=path.join(path.extname(skill)?path.dirname(skill):skill,'runtime.json');
    const metadata=JSON.parse(fs.readFileSync(metadataFile,'utf8'));
    if(metadata.runtimeVersion!==snapshot.runtimeVersion)throw Error('Runtime metadata version differs from live management snapshot');
    result.core.metadata=fileIdentity(metadataFile);result.core.executable=fileIdentity(metadata.cliExecutable);
  }catch(error){result.core.unavailable=error.message;}
  return result;
}
function sourceChecks(traffic){
  return ['desktop-main-http','owned-backend-provider'].map(id=>{
    const source=traffic?.activatedSources?.find(item=>item.id===id);
    const unsupported=traffic?.unsupportedSources?.find(item=>item.id===id);
    return {id:`native.source.${id}`,status:source&&traffic.attached===true?'passed':'unavailable',
      detail:{level:'interface',attached:traffic?.attached===true,source:source??null,
        reason:unsupported?.reason??unsupported?.code??(!source?'Native source is not attached':null),unsupported:unsupported??null,operationVerified:false}};
  });
}
module.exports={project,identity,sourceChecks,catalog};
