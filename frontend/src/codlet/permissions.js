const groups = [
  ['interface','Interface and client',['ui.dom','ui.mainWorld','cdp.raw']],
  ['data','Data and files',['core.storage','core.credentials','core.credentials.use','host.fs','host.fs.write','host.fs.watch','core.files.dialog']],
  ['network','Network and traffic',['host.network','core.network','traffic.intercept','traffic.sensitiveHeaders','traffic.redirect']],
  ['system','System and background tasks',['host.process','host.process.spawn','host.system','core.tasks','core.notifications','core.clipboard.read','core.clipboard.write','core.shortcuts']],
  ['management','Plugin coordination and management',['core.events','core.diagnostics','runtime.manage']],
];
export function permissionGroups(permissions=[]){
  return groups.map(([id,label,all])=>({id,label,permissions:all.filter(p=>permissions.includes(p))})).filter(g=>g.permissions.length);
}
const key=c=>`${c.name}@${c.api}/${c.scope}`;
const builtins=new Set(['codlet.runtime.ping@1/target','codlet.runtime.manage@1/target','codlet.runtime.manage@1/runtime','codlet.core.services@1/runtime']);
export function pluginDependencies(manifest,plugins=[],check=null){
  const own=new Set([...(manifest.provides??[]),...(manifest.host?.provides??[])].map(key));
  const requirements=[...(manifest.renderer?manifest.requires??[]:[]),...(manifest.host?(manifest.renderer?manifest.host.requires??[]:manifest.requires??[]):[])];
  const rows=new Map();let missing=false;
  for(const capability of requirements){
    const id=key(capability);
    if(own.has(id)||builtins.has(id))continue;
    const matches=plugins.filter(p=>p.id!==manifest.id&&(p.providedCapabilities??p.provides??[]).some(c=>key(c)===id));
    if(!matches.length){missing=true;continue;}
    for(const plugin of matches){
      const observed=check?.requirements?.find(r=>key(r.capability)===id);
      const available=plugin.active===true&&observed?.status!=='unavailable';
      const prior=rows.get(plugin.id);
      rows.set(plugin.id,{plugin,available:available&&(prior?.available??true)});
    }
  }
  return {plugins:[...rows.values()],missing};
}
