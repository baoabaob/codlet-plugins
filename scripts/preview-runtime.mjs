// Deterministic demo responses use checked-in client profile identifiers.
// They never call GitHub, install packages or alter a real runtime.
import reviewedProfiles from '../compatibility/client-profiles.json' with {type:'json'};
export function createPreviewRuntime() {
  const state={long:false,phase:'development',client:'matched',failure:false,versionFailure:false,settingsFailure:false,knownCandidate:false,checkedAt:Date.now(),settingsRevision:0,settings:{automaticUpdateChecks:true,checkPluginUpdatesOnStartup:true,showPluginTags:true,updateCheckIntervalSeconds:null,localSourceAutoReload:null},pluginUpdates:{phase:'idle',checkedAt:null,plugins:{},error:null}};let id=0;
  const updateStatus=()=>({phase:state.phase,currentVersion:'0.1.0',configured:state.phase!=='development',channel:state.phase==='development'?'development':'stable',installAvailable:true,
    candidate:state.knownCandidate||['available','downloading','downloaded','installRequested'].includes(state.phase)?{id:'fixture',version:'0.2.0',releaseUrl:'https://github.com/example/codlet/releases/tag/v0.2.0',size:100}:null,
    downloadedBytes:state.phase==='downloaded'?100:60,totalBytes:100,lastCheckedAt:state.phase==='development'||state.phase==='idle'?null:state.checkedAt,
    nextCheckAt:state.settings.automaticUpdateChecks&&state.phase!=='development'?state.checkedAt+(state.settings.updateCheckIntervalSeconds??900)*1000:null,error:state.phase==='failed'?{code:'preview_update_failed',message:'Preview update failed.'}:null});
  const settings=()=>({schema:1,revision:state.settingsRevision,values:structuredClone(state.settings),effective:{automaticUpdateChecks:state.settings.automaticUpdateChecks,checkPluginUpdatesOnStartup:state.settings.checkPluginUpdatesOnStartup,showPluginTags:state.settings.showPluginTags,updateCheckIntervalSeconds:state.settings.updateCheckIntervalSeconds??900,localSourceAutoReload:state.settings.localSourceAutoReload??false},defaults:{updateCheckIntervalSeconds:900,localSourceAutoReload:false},availability:{updateChecks:state.phase!=='development',pluginUpdateChecks:true,localSourceWatch:true}});
  const operations=new Map(),preferences=new Map(),removed=new Set(),versions=new Map();
  state.pluginInstall={id:0,running:false,items:[]};
  const source={repositoryUrl:'https://github.com/example/codlet-notes',releaseId:20,tag:'v2.0.0',assetId:200,assetName:'notes-win-x64.zip',sha256:'c'.repeat(64),upstreamDigestVerified:false};
  const marketItems=[
    {repositoryId:1379359689,ownerId:76909162,repositoryUrl:'https://github.com/baoabaob/codlet-gui',fullName:'baoabaob/codlet-gui',owner:'baoabaob',name:'Codlet GUI',description:'Manage Codlet plugins.',topics:['codlet-official','codlet-plugin','plugin-manager','ui','tool'],author:'baoabaob',latestRelease:{id:101,tag:'v0.2.0',name:'Codlet GUI v0.2.0',publishedAt:'2026-09-23T08:00:00Z',prerelease:false,assets:[{id:1001,name:'codlet-gui.zip',size:12000,downloadCount:null}]},latestReleaseVerified:false,latestInstallablePublishedAt:null,totalDownloads:null},
    {repositoryId:5678,ownerId:4321,repositoryUrl:'https://github.com/example/codlet-notes',fullName:'example/codlet-notes',owner:'example',name:'GitHub Notes',description:'A note panel for your workspace.',topics:['codlet-plugin','tool','notes'],author:'Community Demo',latestRelease:{id:21,tag:'v3.0.0',name:'Notes 3.0',publishedAt:'2026-09-22T08:00:00Z',prerelease:false,assets:[{id:201,name:'notes.zip',size:12800,downloadCount:null}]},latestReleaseVerified:false,latestInstallablePublishedAt:null,totalDownloads:null},
  ];
  const manifest={id:'local.notes',name:'Local Notes',description:'Keep notes beside your project.',version:'1.2.0',permissions:['ui.dom'],renderer:{entry:'renderer.js',world:'isolated'},requires:[],provides:[]};
  const clientProfiles=reviewedProfiles.builds.map(profile=>({appVersion:profile.appVersion,buildNumber:profile.buildNumber,appServerVersion:profile.appServerVersion}));
  const marketMetadata=item=>({platforms:['windows-x86_64','windows-aarch64','macos-aarch64'],runtimeApi:1,author:item?.author??'Community Demo',adapters:{codex:item?.repositoryId===1379359689?{clientProfiles}:{testedBuilds:['26.915.31945/9922'],limitations:['Local preview fixture']}}});
  marketItems[0].declarationStatus='matched';
  marketItems[0].latestInstallablePublishedAt=marketItems[0].latestRelease.publishedAt;
  marketItems[0].totalDownloads=18;
  marketItems[0].declaredPackage={basis:'publisher-release-declaration',releaseId:101,publishedAt:marketItems[0].latestRelease.publishedAt,
    manifest:{...manifest,id:'codlet-gui',name:'Codlet GUI',description:'Manage Codlet plugins.',tags:['UI','Tool'],version:'0.2.0'},
    metadata:marketMetadata(marketItems[0]),asset:{id:1001,name:'codlet-gui.zip',bytes:12000,sha256:'c'.repeat(64),downloadCount:18},
    deviceCompatibility:{platform:'windows-x86_64',runtimeApi:1,status:'compatible',basis:'author-declaration'}};
  marketItems[1].declarationStatus='missing';marketItems[1].declaredPackage=null;
  const preview=()=>({schema:1,kind:'codlet.local-import-preview',path:'C:/Projects/Local Notes',contentDigest:'a'.repeat(64),registrationDigest:'b'.repeat(64),manifest,ownership:'development-directory'});
  const plugins=()=>[
    {id:'codlet-gui',name:'Codlet GUI',tags:['UI','Tool'],description:'Manage plugins, imports, permissions, and Codlet updates.',i18n:{zh:{name:'Codlet 管理界面',description:'管理插件、导入、权限和 Codlet 更新。'}},version:'0.1.0',source:'bundled',ownership:'installer-seed',enabled:true},
    {id:'codex.ui.adapter',name:'Codex UI Adapter',tags:['UI','Adapter'],description:'Connect plugin pages to Codex navigation.',i18n:{zh:{name:'Codex 界面适配器',description:'将插件页面接入 Codex 主导航。'}},version:'0.1.0',source:'bundled',enabled:true,disableDependents:['codlet-gui']},
    {id:'codex.desktop.adapter',name:'Codex Desktop Adapter',tags:['Adapter'],description:'Connect plugins to supported desktop features.',i18n:{zh:{name:'Codex 桌面适配器',description:'为插件提供已适配的 Codex 桌面功能。'}},version:'0.1.0',source:'bundled',enabled:true},
    {...manifest,source:'local',enabled:false,disableDependents:state.dependents?['codex.ui.adapter','codlet-gui']:[]},
    {id:'managed.notes',name:'GitHub Notes',tags:['Tool','Enhancement'],description:'A community note panel for your workspace.',version:'2.0.0',source:'local',ownership:'core-managed-github',managedSource:source,managedVersionKey:'v2',enabled:true},
    ...(state.long?Array.from({length:40},(_,i)=>({id:`local.example-${i}`,name:`Workspace helper ${i+1}`,description:i%3?'A small tool for everyday tasks.':'A long description with a very-long-unbroken-filename-'+ 'x'.repeat(100),version:'1.0.0-preview',source:'local',enabled:i%2===0})):[]),
  ].filter(p=>!removed.has(p.id)).map(p=>({...p,...(versions.has(p.id)?{version:versions.get(p.id),managedVersionKey:'v3'}:{}),enabled:preferences.get(p.id)??p.enabled,registered:true,loaded:preferences.get(p.id)??p.enabled,active:preferences.get(p.id)??p.enabled,grants:['ui.dom'],validation:{status:'ok'}}));
  async function request(_cap,method,args) {
    if(method==='installCombinedUpdate'){state.officialUpdate={...state.officialUpdate,combinedPhase:'installing'};state.phase='installRequested';return structuredClone(state.officialUpdate);}
    if(method==='newTaskDraft'){state.draft=args.prompt;return {opened:true,submitted:false};}
    if(method==='versionStatus'){if(state.versionFailure)throw Error('Preview: version information is unavailable.');return {runtimeVersion:'0.1.0',runtimeUpdate:updateStatus(),officialUpdate:state.officialUpdate??null,runtimeUpdateError:null,pluginUpdates:structuredClone(state.pluginUpdates),pluginInstall:structuredClone(state.pluginInstall),clientStatus:{source:'local-package',status:state.client,runningVersion:'26.908.4834.0',adaptedVersions:['26.908.4834.0'],matchesRunningClient:state.client==='unknown'?undefined:state.client==='matched'}};}
    if(method==='updatePlugins'){
      const ids=args.pluginIds??plugins().filter(p=>p.ownership==='core-managed-github').map(p=>p.id);
      state.pluginInstall={id:state.pluginInstall.id+1,running:false,items:ids.map(pluginId=>({pluginId,versionKey:'v2',phase:'updated',version:'3.0.0',message:null,operationId:'preview-update'}))};
      for(const pluginId of ids)versions.set(pluginId,'3.0.0');return structuredClone(state.pluginInstall);
    }
    if(method==='checkPluginUpdates'){state.pluginUpdates={phase:'completed',checkedAt:Date.now(),plugins:Object.fromEntries(plugins().filter(p=>p.ownership==='core-managed-github').map(p=>[p.id,{versionKey:p.managedVersionKey,status:p.version==='3.0.0'?'upToDate':'available',releaseTag:'v3.0.0',releaseUrl:'https://github.com/example/codlet-notes/releases/tag/v3.0.0',error:null}])),error:null};return structuredClone(state.pluginUpdates);}
    if(method==='getSettings'||method==='saveSettings'){
      if(state.settingsFailure)throw Error('Preview: settings are unavailable.');
      if(method==='saveSettings'){if(args.expectedRevision!==state.settingsRevision)throw Error('Settings changed in another window. Review the current values before saving again.');state.settings={...args.values};state.settingsRevision++;state.checkedAt=Date.now();}
      return settings();
    }
    if(method==='list'){if(state.failure)throw Error('Preview: connection unavailable. Refresh to retry.');return {plugins:plugins(),runtimeVersion:'0.1.0',clientStatus:{status:'matched'},deviceCompatibility:{platform:'windows-x86_64',runtimeApi:1,status:'unknown',basis:'unknown'},runtimeSkill:{available:true,name:'codlet',path:'C:/Preview/runtime-skills/codlet/SKILL.md'},localManagement:{available:true,folderPicker:true},githubManagement:{available:true}};}
    if(method==='previewLocal')return {...preview(),path:args.path};
    if(method==='chooseLocalFolder')return {selectionId:'fixture-folder',status:'selected',path:'C:/Projects/Local Notes'};
    if(method==='permissions')return {pluginId:args.pluginId,registration:{path:'C:/Projects/Local Notes',grants:['ui.dom'],brokerPolicy:{}},ownership:args.pluginId==='managed.notes'?'core-managed-github':'development-directory',managedSource:source};
    if(method==='openFolder')return {pluginId:args.pluginId,opened:true};
    if(method==='openRuntimeFolder')return {opened:true};
    if(method==='sourceRemovalPreview')return {pluginId:args.pluginId,status:'available',path:'C:/Projects/Local Notes',sourceIdentity:'fixture-source',registrationDigest:'b'.repeat(64)};
    if(method==='githubReleases')return {jobId:'release-fixture',kind:'releases',status:'completed',result:{repository:{url:source.repositoryUrl},releases:[{id:20,tag:'v2.0.0',name:'Notes 2.0',assets:[{id:200,name:source.assetName,size:12800}]}]}};
    if(method==='githubDiscover'){
      const terms=(args.query??'').toLowerCase().split(/\s+/).filter(Boolean);
      const items=marketItems.filter(item=>terms.every(term=>term.startsWith('#')?item.topics.includes(term.slice(1)):[item.name,item.fullName,item.description,...item.topics].join(' ').toLowerCase().includes(term)));
      return {jobId:`discovery-${args.page??1}`,kind:'discovery',status:'completed',result:{items:args.page===1?items:[],page:args.page??1,hasMore:false,fetchedAtUnixMs:Date.now(),cacheUntilUnixMs:Date.now()+60000}};
    }
    if(method==='githubPrepare'||method==='previewRollback') {
      const item=marketItems.find(item=>item.repositoryUrl===args.repositoryUrl&&item.latestRelease.id===args.releaseId&&item.latestRelease.assets.some(asset=>asset.id===args.assetId)),asset=item?.latestRelease.assets.find(asset=>asset.id===args.assetId);
      const preparedSource=item?{repositoryUrl:item.repositoryUrl,repositoryId:item.repositoryId,ownerId:item.ownerId,releaseId:item.latestRelease.id,releasePublishedAt:item.latestRelease.publishedAt,tag:item.latestRelease.tag,assetId:asset.id,assetName:asset.name,sha256:'c'.repeat(64),upstreamDigestVerified:false}:source;
      const result={...preview(),kind:'codlet.managed-preview',ownership:'core-managed-github',operation:method==='previewRollback'?'rollback':args.operation,source:preparedSource,manifest:{...manifest,id:args.pluginId??(item?.repositoryId===1379359689?'codlet-gui':'managed.notes'),name:item?.name??manifest.name,description:item?.description??manifest.description,tags:item?.repositoryId===1379359689?['UI','Tool']:item?['Tool']:manifest.tags,version:item?.repositoryId===1379359689?'0.2.0':item?'3.0.0':'2.0.0'},metadata:marketMetadata(item),deviceCompatibility:{platform:'windows-x86_64',runtimeApi:1,status:'compatible',basis:'author-declaration'},changes:{permissionsAdded:[],permissionsRemoved:[],requirementsAdded:[],requirementsRemoved:[]}};
      return method==='previewRollback'?result:{jobId:'package-fixture',kind:'package',status:'completed',result};
    }
    if(method==='managedHistory')return {pluginId:args.pluginId,currentVersion:'v2',history:[{versionKey:'v2',manifest:{version:'2.0.0'},source},{versionKey:'v1',manifest:{version:'1.0.0'},source:{...source,tag:'v1.0.0'}}],nextCursor:null};
    if(method==='cancelGitHubJob')return {jobId:args.jobId,status:'cancelled'};
    if(method==='prepare'){const operation={operation_id:`preview-${++id}`,request:structuredClone(args)};operations.set(operation.operation_id,{status:'prepared',operation});return {status:'prepared',operation};}
    if(method==='submit'||method==='operation') {
      const record=operations.get(args.operationId);if(!record)return {status:'expired'};
      if(method==='submit')record.status='queued';
      if(method==='operation'&&record.status==='queued') {
        const r=record.operation.request;
        if(r.action==='remove')removed.add(r.plugin_id);else preferences.set(r.plugin_id,!['disable','revoke'].includes(r.action));
        record.status='completed';record.operation.completion={kind:'report',report:{outcome:'applied'}};
      }
      return structuredClone(record);
    }
    if(method.endsWith('RuntimeUpdate')||method==='runtimeUpdateStatus') {
      if(method==='checkRuntimeUpdate'){state.phase='available';state.knownCandidate=true;state.checkedAt=Date.now();}if(method==='downloadRuntimeUpdate')state.phase='downloaded';if(method==='installRuntimeUpdate')state.phase='installRequested';
      return updateStatus();
    }
    throw Error('Unsupported preview RPC: '+method);
  }
  return {state,request};
}
