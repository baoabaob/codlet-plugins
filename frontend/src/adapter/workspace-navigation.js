import { createThreadOpener } from '../desktop/thread-navigation.js';
import { nativeInputBinding, nativeMainInput, workspaceError } from './workspace-dom.js';
import { sameNativeInput } from './workspace-native-input.js';

export function createWorkspaceNavigation({document,load,host,check,changed,readBinding,readCurrentInput,metrics}) {
  const sessions=new Set();let native,prepared,current,sequence=0,observer,frame,microtask=false,queueEpoch=0,disposed=false;
  let tracking=false,composing=new WeakMap(),compositionRoots=new WeakMap();
  function compositionStart(event){
    const target=event.target,input=target?.closest?.('[data-codex-composer-root]');
    if(!input||input.closest('[data-codlet-workspace-owned]'))return;
    composing.set(input,true);compositionRoots.set(target,input);
  }
  function compositionEnd(event){const input=compositionRoots.get(event.target);if(input)composing.delete(input);compositionRoots.delete(event.target);}
  function track(){if(tracking)return;tracking=true;document.addEventListener('compositionstart',compositionStart,true);document.addEventListener('compositionend',compositionEnd,true);}
  function untrack(){if(!tracking)return;tracking=false;document.removeEventListener('compositionstart',compositionStart,true);document.removeEventListener('compositionend',compositionEnd,true);composing=new WeakMap();compositionRoots=new WeakMap();}
  const stamp=()=>JSON.stringify(host().navigator.location);
  const input=()=>readCurrentInput?readCurrentInput():nativeMainInput(document,native);
  const binding=()=>readBinding?readBinding():nativeInputBinding(input(),native);
  function composition(){
    if(native?.inputApi!==1)return;
    const value=input();
    if(value&&(value.controller.view.composing===true||composing.get(value.input)))throw workspaceError('workspace_composer_busy','Native main input is composing');
  }
  function stop(){observer?.disconnect();observer=null;if(frame!=null)document.defaultView.cancelAnimationFrame?.(frame);frame=null;microtask=false;queueEpoch++;}
  function pulse(){
    const op=current;if(!op||op.settled||!op.didExecute)return;
    try{
      check();const route=host().navigator.location.pathname;
      if(route!=='/local/'+op.threadId){finish(op,'workspace_navigation_superseded','Native selected another task');return;}
      native.check?.();const value=binding();
      if(value?.threadId!==op.threadId||value.hostId!=='local')return;
      if(native.inputApi===1&&op.startedBinding&&!sameNativeInput(op.startedBinding,value))throw workspaceError('workspace_composer_binding_drift','Native replaced the already-selected input during confirmation');
      op.session.latest={revision:op.sequence,routeStamp:stamp(),binding:value};
      op.settled=true;stop();changed();clearTimeout(op.timer);op.removeAbort?.();
      metrics?.end('navigation.committed',op.started,{operationId:op.sequence});
      op.session.operations.delete(op);op.resolveCommitted(Object.freeze({threadId:op.threadId,hostId:'local',inputConfirmed:true,submitDisabled:value.submitDisabled,revision:op.sequence}));
    }catch(error){if(!['workspace_host_pending','ui_host_pending'].includes(error.code))finish(op,error.code??'workspace_navigation_unavailable',error.message);}
  }
  function schedule(){if(disposed||!current||current.settled||!current.didExecute)return;
    if(!microtask){microtask=true;const epoch=queueEpoch;queueMicrotask(()=>{if(epoch!==queueEpoch)return;microtask=false;pulse();});}
    if(frame==null&&document.visibilityState!=='hidden'&&document.defaultView.requestAnimationFrame)frame=document.defaultView.requestAnimationFrame(()=>{frame=null;pulse();});
  }
  function observe(){if(observer)return;observer=new document.defaultView.MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-codex-composer-root','data-app-shell-active-page','disabled','contenteditable']});}
  function finish(op,code,message){if(op.settled)return;op.settled=true;if(current===op)stop();op.session.operations.delete(op);clearTimeout(op.timer);op.removeAbort?.();const error=workspaceError(code,message);op.controller.abort(error);if(!op.didExecute)op.rejectExecuted(error);op.rejectCommitted(error);}
  function ensure(){return prepared??=Promise.resolve().then(load).then(value=>{if(disposed)throw workspaceError('workspace_retired','Navigation provider retired');native=value;return value;});}
  function create(live){
    const session={alive:true,operations:new Set(),latest:null};sessions.add(session);track();
    const valid=()=>{check();live();if(!session.alive)throw workspaceError('workspace_retired','Navigation session retired');};
    const ready=ensure().then(()=>undefined);ready.catch(()=>{});
    const makeOpener=()=>createThreadOpener({manager:{getConversation:id=>native.manager.getConversation(id)},selection:()=>{
      valid();native.check?.();const match=/^\/local\/([\w-]+)\/?$/.exec(host().navigator.location.pathname),threadId=match?.[1]??null,thread=native.manager.getConversation(threadId);
      return{threadId,resumeState:thread?.resumeState==='resumed'?'resumed':'loading',streamRole:native.manager.getStreamRole?.(threadId)?.role??'none'};
    },navigation:()=>{const navigator=host().navigator;return{stamp:()=>JSON.stringify(navigator.location),open:id=>navigator.push('/local/'+id)};},beforeNavigate:composition,request:async(method,args,signal)=>{const value=await native.manager.sendRequest(method,args,{timeoutMs:10000});if(signal?.aborted)throw workspaceError('invocation_cancelled','Navigation validation was cancelled');return value;}});
    return Object.freeze({ready,get inputApi(){return native?.inputApi===1?1:0;},
      open(args,options={}){
        valid();if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>key!=='threadId')||typeof args.threadId!=='string'||!/^[\w-]{1,256}$/.test(args.threadId))throw workspaceError('invalid_argument','Invalid local navigation identity');
        if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='signal'))throw workspaceError('invalid_argument','Invalid navigation options');
        const signal=options.signal;
        if(signal!=null&&(typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'))throw workspaceError('invalid_argument','Invalid navigation signal');
        if(!signal?.aborted&&native)composition(); // Before supersession, routing or any possible focus change.
        const before=!signal?.aborted&&native?.inputApi===1?binding():null;
        const op={threadId:args.threadId,sequence:++sequence,settled:false,didExecute:false,session,controller:new document.defaultView.AbortController(),
          started:metrics?.start(),startedBinding:before?.threadId===args.threadId&&host().navigator.location.pathname==='/local/'+args.threadId?before:null};session.operations.add(op);
        const executed=new Promise((resolve,reject)=>{op.resolveExecuted=resolve;op.rejectExecuted=reject;});
        const committed=new Promise((resolve,reject)=>{op.resolveCommitted=resolve;op.rejectCommitted=reject;});executed.catch(()=>{});committed.catch(()=>{});
        const abort=()=>finish(op,'invocation_cancelled','Navigation confirmation was cancelled');
        if(signal?.aborted)abort();else if(signal){signal.addEventListener('abort',abort,{once:true});op.removeAbort=()=>signal.removeEventListener('abort',abort);}
        if(!op.settled){if(current&&!current.settled)finish(current,'workspace_navigation_superseded','A newer navigation replaced this operation');current=op;session.latest=null;}
        function run(){if(op.settled)return;try{composition();}catch(error){finish(op,error.code??'workspace_navigation_unavailable',error.message);return;}const start=performance.now();const result=makeOpener()(args,op.controller.signal),synchronousMs=performance.now()-start;Promise.resolve(result).then(receipt=>{
          if(op.settled)return;valid();op.didExecute=true;changed();op.resolveExecuted(Object.freeze({...receipt,synchronousMs,revision:op.sequence}));
          metrics?.end('navigation.executed',op.started,{operationId:op.sequence});
          op.timer=setTimeout(()=>finish(op,'workspace_navigation_commit_timeout','Native composer did not confirm the selected task'),5000);observe();schedule();
        },error=>finish(op,error.code??'workspace_navigation_unavailable',error.message)).catch(error=>finish(op,error.code??'workspace_retired',error.message));}
        if(native)run();else ready.then(run,error=>finish(op,error.code??'workspace_navigation_unavailable',error.message));
        return Object.freeze({executed,committed,dispose(){finish(op,'invocation_cancelled','Navigation operation retired');if(session.latest?.revision===op.sequence)session.latest=null;session.operations.delete(op);}});
      },
      focus(options){
        valid();
        if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='revision')||!Number.isSafeInteger(options.revision)||options.revision<=0)throw workspaceError('invalid_argument','Expected a navigation revision');
        if(native?.inputApi!==1)throw workspaceError('workspace_navigation_unsupported','Strict Native input navigation is unavailable');
        const pin=session.latest;
        if(!pin||pin.revision!==options.revision||current?.sequence!==pin.revision||current.session!==session)return false;
        try{
          native.check?.();if(stamp()!==pin.routeStamp)return false;
          const value=binding();
          if(!sameNativeInput(pin.binding,value)||value.submitDisabled||!value.editable.isConnected||value.editable.closest('[inert],[aria-hidden="true"]'))return false;
          if((value.controller.view.composing||composing.get(value.input))&&document.activeElement!==value.editable)return false;
          value.editable.focus({preventScroll:true});return document.activeElement===value.editable;
        }catch{return false;}
      },
      dispose(){if(!session.alive)return;session.alive=false;session.latest=null;for(const op of session.operations)finish(op,'workspace_retired','Navigation consumer retired');session.operations.clear();sessions.delete(session);if(!sessions.size)untrack();},
    });
  }
  return{create,pulse:schedule,dispose(){if(disposed)return;disposed=true;for(const session of sessions){session.alive=false;session.latest=null;for(const op of session.operations)finish(op,'workspace_retired','Navigation provider retired');}sessions.clear();stop();untrack();}};
}
