import { createThreadOpener } from '../desktop/thread-navigation.js';
import { composerBinding, findWorkspaceSurface, workspaceError } from './workspace-dom.js';

export function createWorkspaceNavigation({document,load,host,check,changed,readBinding=()=>composerBinding(document,findWorkspaceSurface(document)?.composer)}) {
  const sessions=new Set();let native,prepared,current,sequence=0,observer,frame,microtask=false,queueEpoch=0,disposed=false;
  function stop(){observer?.disconnect();observer=null;if(frame!=null)document.defaultView.cancelAnimationFrame?.(frame);frame=null;microtask=false;queueEpoch++;}
  function pulse(){
    const op=current;if(!op||op.settled||!op.didExecute)return;
    try{
      check();const route=host().navigator.location.pathname;
      if(route!=='/local/'+op.threadId){finish(op,'workspace_navigation_superseded','Native selected another task');return;}
      const binding=readBinding();
      if(binding?.threadId!==op.threadId||binding.hostId!=='local')return;
      op.settled=true;stop();changed();clearTimeout(op.timer);op.removeAbort?.();
      op.session.operations.delete(op);op.resolveCommitted(Object.freeze({threadId:op.threadId,hostId:'local',inputConfirmed:true,submitDisabled:binding.submitDisabled,revision:op.sequence}));
    }catch(error){if(!['workspace_host_pending','ui_host_pending'].includes(error.code))finish(op,error.code??'workspace_navigation_unavailable',error.message);}
  }
  function schedule(){if(disposed||!current||current.settled||!current.didExecute)return;
    if(!microtask){microtask=true;const epoch=queueEpoch;queueMicrotask(()=>{if(epoch!==queueEpoch)return;microtask=false;pulse();});}
    if(frame==null&&document.visibilityState!=='hidden'&&document.defaultView.requestAnimationFrame)frame=document.defaultView.requestAnimationFrame(()=>{frame=null;pulse();});
  }
  function observe(){if(observer)return;observer=new document.defaultView.MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-codex-composer-root','data-app-shell-active-page']});}
  function finish(op,code,message){if(op.settled)return;op.settled=true;if(current===op)stop();op.session.operations.delete(op);clearTimeout(op.timer);op.removeAbort?.();const error=workspaceError(code,message);op.controller.abort(error);if(!op.didExecute)op.rejectExecuted(error);op.rejectCommitted(error);}
  function ensure(){return prepared??=Promise.resolve().then(load).then(value=>{if(disposed)throw workspaceError('workspace_retired','Navigation provider retired');native=value;return value;});}
  function create(live){
    const session={alive:true,operations:new Set()};sessions.add(session);
    const valid=()=>{check();live();if(!session.alive)throw workspaceError('workspace_retired','Navigation session retired');};
    const ready=ensure();ready.catch(()=>{});
    const makeOpener=()=>createThreadOpener({manager:{getConversation:id=>native.manager.getConversation(id)},selection:()=>{
      valid();native.check?.();const match=/^\/local\/([\w-]+)\/?$/.exec(host().navigator.location.pathname),threadId=match?.[1]??null,thread=native.manager.getConversation(threadId);
      return{threadId,resumeState:thread?.resumeState==='resumed'?'resumed':'loading',streamRole:native.manager.getStreamRole?.(threadId)?.role??'none'};
    },navigation:()=>{const navigator=host().navigator;return{stamp:()=>JSON.stringify(navigator.location),open:id=>navigator.push('/local/'+id)};},request:async(method,args,signal)=>{const value=await native.manager.sendRequest(method,args,{timeoutMs:10000});if(signal?.aborted)throw workspaceError('invocation_cancelled','Navigation validation was cancelled');return value;}});
    return Object.freeze({ready,
      open(args,options={}){
        valid();if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>key!=='threadId')||typeof args.threadId!=='string'||!/^[\w-]{1,256}$/.test(args.threadId))throw workspaceError('invalid_argument','Invalid local navigation identity');
        if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='signal'))throw workspaceError('invalid_argument','Invalid navigation options');
        const signal=options.signal;
        if(signal!=null&&(typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'))throw workspaceError('invalid_argument','Invalid navigation signal');
        const op={threadId:args.threadId,sequence:++sequence,settled:false,didExecute:false,session,controller:new document.defaultView.AbortController()};session.operations.add(op);
        const executed=new Promise((resolve,reject)=>{op.resolveExecuted=resolve;op.rejectExecuted=reject;});
        const committed=new Promise((resolve,reject)=>{op.resolveCommitted=resolve;op.rejectCommitted=reject;});executed.catch(()=>{});committed.catch(()=>{});
        const abort=()=>finish(op,'invocation_cancelled','Navigation confirmation was cancelled');
        if(signal?.aborted)abort();else if(signal){signal.addEventListener('abort',abort,{once:true});op.removeAbort=()=>signal.removeEventListener('abort',abort);}
        if(!op.settled){if(current&&!current.settled)finish(current,'workspace_navigation_superseded','A newer navigation replaced this operation');current=op;}
        function run(){if(op.settled)return;const start=performance.now();const result=makeOpener()(args,op.controller.signal),synchronousMs=performance.now()-start;Promise.resolve(result).then(receipt=>{
          if(op.settled)return;valid();op.didExecute=true;changed();op.resolveExecuted(Object.freeze({...receipt,synchronousMs,revision:op.sequence}));
          op.timer=setTimeout(()=>finish(op,'workspace_navigation_commit_timeout','Native composer did not confirm the selected task'),5000);observe();schedule();
        },error=>finish(op,error.code??'workspace_navigation_unavailable',error.message)).catch(error=>finish(op,error.code??'workspace_retired',error.message));}
        if(native)run();else ready.then(run,error=>finish(op,error.code??'workspace_navigation_unavailable',error.message));
        return Object.freeze({executed,committed,dispose(){finish(op,'invocation_cancelled','Navigation operation retired');session.operations.delete(op);}});
      },
      dispose(){if(!session.alive)return;session.alive=false;for(const op of session.operations)finish(op,'workspace_retired','Navigation consumer retired');session.operations.clear();sessions.delete(session);},
    });
  }
  return{create,pulse:schedule,dispose(){if(disposed)return;disposed=true;for(const session of sessions){session.alive=false;for(const op of session.operations)finish(op,'workspace_retired','Navigation provider retired');}sessions.clear();stop();}};
}
