export const updatePhases=['development','idle','checking','upToDate','available','downloading','downloaded','installRequested','deferred','failed'];
export const busyUpdatePhases=['checking','downloading','installRequested'];
export const installPhases=['queued','downloading','installing','checkingStatus','updated','upToDate','reviewRequired','failed'];
export const validPluginInstall=value=>Number.isSafeInteger(value?.id)&&value.id>=0&&typeof value.running==='boolean'&&Array.isArray(value.items)&&value.items.length<=128&&new Set(value.items.map(i=>i.pluginId)).size===value.items.length&&value.items.every(i=>typeof i?.pluginId==='string'&&typeof i.versionKey==='string'&&installPhases.includes(i.phase));
const componentList=value=>Array.isArray(value)&&value.length<=64&&value.every(item=>typeof item==='string'&&item.length>0&&item.length<=128);
export const validActivation=value=>value==null||['online','nextStart','unknown'].includes(value.mode)&&typeof value.version==='string'&&componentList(value.components)&&componentList(value.retainedComponents)&&(value.nextStartReason==null||typeof value.nextStartReason==='string')&&typeof value.persistencePending==='boolean';
export const validUpdate=value=>typeof value?.currentVersion==='string'&&typeof value.configured==='boolean'&&updatePhases.includes(value.phase)&&validActivation(value.activation)&&(value.phase!=='deferred'||value.activation?.mode==='nextStart');
export const activationComponentLabels={'core-runtime':'Core runtime','core-executable':'Compiled Core','rust-traffic':'Traffic connection owner','client-bridge':'Native connection bridge','module-observer':'Native module observer','native-client-source':'Native client source','renderer-bootstrap':'Renderer runtime','renderer-helpers':'Renderer helpers','renderer-ui':'UI SDK','renderer-facade':'Renderer SDK facade','renderer-page':'Page navigation','renderer-i18n':'Localization','renderer-codex-sdk':'Codex semantic SDK','renderer-core-services':'Renderer Core services','host-bootstrap':'Host runtime','core-ui-provider':'Core UI provider','core-desktop-provider':'Core desktop provider'};
export function updateStatusText(update){
  return ({development:'This development build has no configured update source.',idle:'Codlet updates have not been checked yet.',checking:'Checking for updates...',upToDate:'Codlet is up to date.',available:`Codlet ${update?.candidate?.version||''} is available.`,downloading:update?.totalBytes?`Downloading update: ${Math.min(100,Math.round(update.downloadedBytes/update.totalBytes*100))}%`:'Downloading update...',downloaded:`Codlet ${update?.candidate?.version||''} is ready to apply.`,installRequested:'Applying the update. Read the confirmed activation status below.',deferred:'Update takes effect on next start.',failed:`Update failed.\n${update?.error?.message||''}`})[update?.phase]??'Version information is unavailable.';
}
export const validOfficialUpdate=value=>value&&typeof value.available==='boolean'&&typeof value.restartPreserved==='boolean'&&typeof value.isUpdateReady==='boolean'&&['idle','checking','downloading','ready','installing'].includes(value.phase)&&['idle','downloading','preparing','installing','failed'].includes(value.combinedPhase)&&(value.error===null||typeof value.error==='string');
export const validPluginUpdates=value=>['idle','checking','completed','failed'].includes(value?.phase)&&(value.checkedAt===null||Number.isSafeInteger(value.checkedAt))&&value.plugins&&typeof value.plugins==='object'&&!Array.isArray(value.plugins)&&Object.values(value.plugins).every(item=>item&&typeof item.versionKey==='string'&&['unknown','upToDate','available','failed'].includes(item.status)&&(item.status!=='available'||typeof item.releaseTag==='string'&&typeof item.releaseUrl==='string'));
export function versionWarnings(state){
  const notices=[],update=state.update,client=state.clientStatus;
  // The Core retains a confirmed candidate during rechecks and failed
  // downloads. Those transitions do not make the installed version current.
  if(update?.configured&&update.candidate?.version&&['available','checking','downloading','downloaded','installRequested','failed'].includes(update.phase))notices.push('A Codlet update is available.');
  if(update?.phase==='deferred')notices.push('Update takes effect on next start.');
  if(client?.matchesRunningClient===false)notices.push('This running client version has not been verified with Codlet.');
  return notices;
}
const interval=value=>Number.isSafeInteger(value)&&value>=300&&value<=86400;
export function validateSettings(reply){
  const v=reply?.values,e=reply?.effective,d=reply?.defaults,a=reply?.availability;
  if(reply?.schema!==1||!Number.isSafeInteger(reply.revision)||reply.revision<0||typeof v?.automaticUpdateChecks!=='boolean'||typeof v.checkPluginUpdatesOnStartup!=='boolean'||typeof v.showPluginTags!=='boolean'||
    !(v.updateCheckIntervalSeconds===null||interval(v.updateCheckIntervalSeconds))||!(v.localSourceAutoReload===null||typeof v.localSourceAutoReload==='boolean')||
    !interval(d?.updateCheckIntervalSeconds)||typeof d.localSourceAutoReload!=='boolean'||typeof a?.updateChecks!=='boolean'||typeof a.pluginUpdateChecks!=='boolean'||typeof a.localSourceWatch!=='boolean'||e?.checkPluginUpdatesOnStartup!==v.checkPluginUpdatesOnStartup||
    e?.automaticUpdateChecks!==v.automaticUpdateChecks||e.showPluginTags!==v.showPluginTags||e.updateCheckIntervalSeconds!==(v.updateCheckIntervalSeconds??d.updateCheckIntervalSeconds)||e.localSourceAutoReload!==(v.localSourceAutoReload??d.localSourceAutoReload))throw new Error('Settings are unavailable or incomplete.');
  return reply;
}
