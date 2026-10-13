import { nativeMainInput, nativeInputBinding, workspaceError } from './workspace-dom.js';

// The caller sees an opaque handle. Native state stays in this closure and is
// neither serialized nor copied into a consumer-owned draft or router.
export function createWorkspaceLocations({document,host,load,check,changed,beforeCapture,beforeRestore,retainGuard}) {
  const handles=new Set();let native,prepared,disposed=false;
  const ensure=()=>prepared??=Promise.resolve().then(load).then(value=>{
    if(disposed)throw workspaceError('workspace_retired','Location provider retired');
    if(typeof value?.restoreLocation!=='function')throw workspaceError('workspace_location_restore_unavailable','Native semantic page restoration is unavailable');
    native=value;return value;
  });
  function capture(live){
    check();live();const source=host(),origin=source?.navigator?.location;
    if(!origin||!source.rootNode?.isConnected)throw workspaceError('workspace_host_pending','Native main page is not ready for capture');
    const saved={...origin};
    if(source.auxiliary||!saved.pathname?.startsWith('/')||saved.pathname.startsWith('/codlet/'))throw workspaceError('workspace_location_unsupported','Capture requires a Native main page');
    const record={active:true,saved,source,pending:null,releaseGuard:retainGuard?.()};handles.add(record);
    const ready=ensure().then(()=>{
      check();live();if(!record.active)throw workspaceError('workspace_retired','Captured location retired');
      if(host().navigator!==source.navigator||host().navigator.location!==origin)throw workspaceError('workspace_location_superseded','Native location changed before capture readiness');
      beforeCapture?.();record.input=nativeMainInput(document,native);
      if(record.input?.controller.view.composing)throw workspaceError('workspace_composer_busy','Native main input is composing');
    });ready.catch(()=>{});
    const kind=/^\/local\/[\w-]+\/?$/.test(saved.pathname)?'thread':'page';
    const dispose=()=>{if(!record.active)return;record.active=false;record.pending?.abort();record.releaseGuard?.();record.saved=null;record.input=null;handles.delete(record);};
    return Object.freeze({ready,kind,
      async restore(options={}){
        check();live();if(!record.active)throw workspaceError('workspace_retired','Captured location retired');
        if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='signal'))throw workspaceError('invalid_argument','Invalid location restoration options');
        if(record.pending)throw workspaceError('workspace_location_busy','Location restoration is pending');
        const controller=new document.defaultView.AbortController();record.pending=controller;
        const signal=options.signal,abort=()=>controller.abort(signal?.reason);
        if(signal!=null&&(typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function')){record.pending=null;throw workspaceError('invalid_argument','Invalid location restoration signal');}
        if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
        let observer,timer,releaseRestore,inspect;
        try{
          await ready;check();live();if(controller.signal.aborted)throw workspaceError('invocation_cancelled','Location restoration cancelled');
          if(host().navigator!==source.navigator||host().rootNode!==source.rootNode)throw workspaceError('workspace_host_drift','Captured page belongs to another Native host');
          releaseRestore=beforeRestore?.();const current=nativeMainInput(document,native);
          if(current?.controller.view.composing)throw workspaceError('workspace_composer_busy','Native main input is composing');
          native.check?.();const restoringFrom=host().navigator.location;native.restoreLocation(record.saved);
          await new Promise((resolve,reject)=>{
            inspect=()=>{try{
              check();live();if(controller.signal.aborted)throw workspaceError('invocation_cancelled','Location restoration cancelled');
              const location=host().navigator.location;
              if(location.pathname!==saved.pathname||(location.search??'')!==(saved.search??'')||(location.hash??'')!==(saved.hash??'')||(location.state??null)!==(saved.state??null)){
                if(location===restoringFrom)return;
                throw workspaceError('workspace_location_superseded','Native selected another page during restoration');
              }
              if(record.input){const restored=nativeMainInput(document,native);if(!restored)return;
                const binding=nativeInputBinding(restored,native),old=record.input;
                if(restored.controller!==old.controller||restored.scope.node!==old.scope.node||restored.scope.value.clientThreadId!==old.scope.value.clientThreadId)
                  throw workspaceError('workspace_location_state_evicted','Native did not retain the captured input state');
                if(binding&&kind==='thread')changed(binding);else changed();
              }else changed();resolve();
            }catch(error){reject(error);}};
            observer=new document.defaultView.MutationObserver(inspect);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-app-shell-active-page','data-codex-composer-root']});
            timer=setTimeout(()=>reject(workspaceError('workspace_location_restore_timeout','Native page restoration was not confirmed')),5000);
            controller.signal.addEventListener('abort',inspect,{once:true});queueMicrotask(inspect);
          });
          return Object.freeze({restored:true,kind});
        }finally{observer?.disconnect();clearTimeout(timer);if(inspect)controller.signal.removeEventListener('abort',inspect);signal?.removeEventListener('abort',abort);releaseRestore?.();if(record.pending===controller)record.pending=null;}
      },dispose});
  }
  return{capture,prepare:ensure,dispose(){disposed=true;for(const record of handles){record.active=false;record.pending?.abort();record.releaseGuard?.();record.saved=null;record.input=null;}handles.clear();}};
}
