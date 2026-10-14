import { permissionGroups,permissionBoundary,UNADAPTED_COPY } from './permissions.js';
import { PERMISSION_COPY } from './messages.js';

export function createPermissionSummary({React,C,I,t}){
  const h=React.createElement;
  function Group({group,onRevoke,pluginId,expandedPermission}){
    const [open,setOpen]=React.useState(group.permissions.includes(expandedPermission)),id=React.useId();
    return <div className="codlet-permission-group">
      <C.Button color="secondary" variant="ghost" size="md" className="codlet-permission-disclosure" aria-label={t(group.label)} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>
        <span>{t(group.label)}</span><span className="codlet-permission-count">{group.permissions.length}</span><I.ChevronDown className={open?'codlet-chevron-open':''}/>
      </C.Button>
      <div id={id} role="region" aria-label={t(group.label)} hidden={!open} className="codlet-permission-items">
        {group.id==='unadapted'&&<p className="codlet-copy">{t(UNADAPTED_COPY)}</p>}
        {group.permissions.includes('host.process.spawn')&&<p className="codlet-copy">{t('Select executable scopes with the Codlet CLI --executable option before running this feature. Broad service consent does not select a program.')}</p>}
        {group.permissions.map(permission=>{const boundary=permissionBoundary(permission);return <div className="codlet-permission-line" key={permission}><div className="codlet-permission-description"><span>{t(PERMISSION_COPY[permission])}</span><code>{permission}</code>{boundary&&<><span>{t(({broker:'Core broker check',admission:'Execution admission check',declaration:'Author declaration and review'})[boundary.enforcement])}</span><span className="codlet-copy">{t(boundary.note)}</span></>}</div>{onRevoke&&<C.Button color="secondary" variant="ghost" size="sm" data-codlet-focus-key={`revoke:${pluginId}:${permission}`} aria-label={t(`Revoke ${permission}`)} onClick={()=>onRevoke(permission)}>{t('Revoke')}</C.Button>}</div>;})}
      </div>
    </div>;
  }
  return function PermissionSummary({permissions,onRevoke,pluginId,expandedPermission}){
    return <div className="codlet-permission-groups">{permissionGroups(permissions).map(group=><Group group={group} key={group.id} onRevoke={onRevoke} pluginId={pluginId} expandedPermission={expandedPermission}/>)}</div>;
  };
}
