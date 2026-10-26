import { hasCodletUpdate, updateStatusText } from './versions.js';
import { descriptionText } from './messages.js';

export function createUpdatesView({React,C,I,manager,t,Copy,mutationBusy}) {
  const h=React.createElement;
  function UpdateNotice({s}) {
    const [open,setOpen]=React.useState(false),update=s.update;
    if(!hasCodletUpdate(update))return null;
    const label=t(`Codlet ${update.candidate.version} is available.`),busy=s.updateBusy||s.updateUncertain||mutationBusy(s);
    const review=()=>{setOpen(false);manager.requestCombinedInstall();};
    return <C.Popover open={open} onOpenChange={setOpen}>
      <C.Popover.Trigger><C.Button color="secondary" variant="ghost" size="sm" uniform aria-label={label} title={label} data-codlet-update-trigger="" disabled={!!s.confirmation}><I.NativeDownload/></C.Button></C.Popover.Trigger>
      <C.Popover.Content align="start" minWidth={280} maxWidth={360} className="codlet-update-popover">
        <strong>{label}</strong>{update.phase!=='available'&&<Copy role="status">{t(updateStatusText(update))}</Copy>}
        {s.updateError&&<Copy error role="alert">{t(s.updateError)}</Copy>}
        <div className="codlet-actions">
          {update.phase==='available'&&<C.Button color="primary" size="sm" disabled={busy} onClick={()=>manager.loadUpdate('downloadRuntimeUpdate')}><I.NativeDownload/>{t('Download update')}</C.Button>}
          {update.phase==='downloaded'&&update.installAvailable&&<C.Button color="primary" size="sm" disabled={busy} onClick={()=>{setOpen(false);manager.requestInstall();}}>{t('Apply update')}</C.Button>}
          <C.Button color="secondary" variant="ghost" size="sm" onClick={()=>{setOpen(false);manager.settingsPage(true);}}>{t('Version information')}</C.Button>
        </div>
        {manager.canCombineUpdates()&&<div className="codlet-update-together"><Copy>{t('An official client update is available and this Codlet release supports it. Update both together?')}</Copy><C.Button color="secondary" variant="soft" size="sm" disabled={busy} onClick={review}>{t('Update both')}</C.Button></div>}
      </C.Popover.Content>
    </C.Popover>;
  }
  function CombinedUpdateDialog({s}) {
    const selected=s.combinedConfirmation,returnFocus=React.useRef(null);
    return <C.Dialog.Root open={!!selected} onOpenChange={open=>{if(!open)manager.cancelCombinedInstall();}}>
      <C.Dialog.Portal><C.Dialog.Overlay className="codlet-help-overlay"/><C.Dialog.Content className="codlet-help-dialog codlet-combined-dialog" onOpenAutoFocus={()=>{returnFocus.current=document.activeElement?.closest('button')??document.querySelector('[data-codlet-update-trigger]');}} onCloseAutoFocus={event=>{event.preventDefault();if(returnFocus.current?.isConnected)returnFocus.current.focus();else document.querySelector('[data-codlet-update-trigger]')?.focus();returnFocus.current=null;}}>
        <div className="codlet-help-heading"><C.Dialog.Title>{t('Update Codlet and the client together')}</C.Dialog.Title></div>
        <C.Dialog.Description>{descriptionText(t('An official client update is available and this Codlet release supports it. Update both together?'))}</C.Dialog.Description>
        <dl className="codlet-version-details"><dt>Codlet</dt><dd>{s.update?.currentVersion} → {selected?.coreVersion}</dd><dt>{t('Client')}</dt><dd>{s.clientStatus?.runningVersion} → {selected?.targetVersion}</dd></dl>
        <Copy>{t('The current client will restart and running local tasks will be interrupted.')}</Copy>
        {selected?.error&&<Copy error role="alert">{t(selected.error)}</Copy>}
        <div className="codlet-confirmation-actions"><C.Button color="secondary" variant="soft" disabled={s.updateBusy} onClick={()=>manager.cancelCombinedInstall()}>{t('Cancel')}</C.Button><C.Button color="primary" disabled={s.updateBusy||!manager.canCombineUpdates()} loading={s.updateBusy} onClick={()=>manager.confirmCombinedInstall()}>{t('Update and restart')}</C.Button></div>
      </C.Dialog.Content></C.Dialog.Portal>
    </C.Dialog.Root>;
  }
  return {UpdateNotice,CombinedUpdateDialog};
}
