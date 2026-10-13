import { workspaceError, OWNED } from './workspace-dom.js';

// A temporary heading presentation belongs to one caller, not to a layout or
// panel model. It never changes the Native route or the Native thread's title.
export function createWorkspaceSelection({document,surface,snapshot,check,changed,isConfirmed}) {
  let record,disposed=false;
  const restore=()=>{
    if(!record)return;
    for(const [node,entry] of record.journal){
      if(node.style.getPropertyValue('visibility')===entry.applied&&node.style.getPropertyPriority('visibility')==='important')entry.value?node.style.setProperty('visibility',entry.value,entry.priority):node.style.removeProperty('visibility');
      if(node.getAttribute('inert')==='')entry.inert==null?node.removeAttribute('inert'):node.setAttribute('inert',entry.inert);
      if(node.getAttribute('aria-hidden')==='true')entry.hidden==null?node.removeAttribute('aria-hidden'):node.setAttribute('aria-hidden',entry.hidden);
    }
    record.journal.clear();record.label?.remove();record.label=null;
  };
  function options(value,previous={threadId:null,emptyLabel:'No conversation selected'}){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['threadId','emptyLabel'].includes(key)))throw workspaceError('invalid_argument','Invalid selection presentation');
    const next={...previous,...value};
    if(next.threadId!==null&&(typeof next.threadId!=='string'||!/^\w[\w-]{0,255}$/.test(next.threadId))||typeof next.emptyLabel!=='string'||!next.emptyLabel.length||next.emptyLabel.length>128)
      throw workspaceError('invalid_argument','Invalid selected identity or heading label');
    if(next.threadId!==null&&(snapshot().threadId!==next.threadId||isConfirmed&&!isConfirmed(next.threadId)))throw workspaceError('workspace_selection_not_confirmed','Native input does not match the selected identity');
    return next;
  }
  function reconcile(){
    if(!record||!record.active)return;
    const header=surface()?.header;
    if(record.header!==header){restore();record.header=header;}
    if(record.options.threadId!==null&&snapshot().threadId===record.options.threadId&&(!isConfirmed||isConfirmed(record.options.threadId))){restore();return;}
    if(!header?.isConnected)return;
    for(const node of header.children){
      if(node.matches(OWNED))continue;
      const current={value:node.style.getPropertyValue('visibility'),priority:node.style.getPropertyPriority('visibility'),inert:node.getAttribute('inert'),hidden:node.getAttribute('aria-hidden'),applied:'hidden'};
      const saved=record.journal.get(node);
      if(!saved)record.journal.set(node,current);
      else{
        if(current.value!=='hidden'||current.priority!=='important'){saved.value=current.value;saved.priority=current.priority;}
        if(current.inert!=='')saved.inert=current.inert;
        if(current.hidden!=='true')saved.hidden=current.hidden;
      }
      node.style.setProperty('visibility','hidden','important');node.setAttribute('inert','');node.setAttribute('aria-hidden','true');
    }
    if(!record.label){record.label=document.createElement('span');record.label.dataset.codletWorkspaceOwned=record.owner;record.label.style.cssText='position:absolute;inset-inline:0;pointer-events:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';header.append(record.label);}
    if(record.label.parentElement!==header)header.append(record.label);
    if(record.label.textContent!==record.options.emptyLabel)record.label.textContent=record.options.emptyLabel;
  }
  function acquire(value,owner,live){
    check();live();if(disposed)throw workspaceError('workspace_retired','Selection presentation provider retired');
    if(record?.active)throw workspaceError('workspace_presentation_owned','Native heading presentation already has an owner');
    record={active:true,owner,options:options(value),journal:new Map(),header:null,label:null};const owned=record;reconcile();changed();
    return Object.freeze({update(value){check();live();if(!owned.active)throw workspaceError('workspace_retired','Selection presentation retired');owned.options=options(value,owned.options);reconcile();changed();},
      dispose(){if(!owned.active)return;owned.active=false;restore();record=null;changed();}});
  }
  return{acquire,reconcile,displaced(mutations){return !!record?.label&&mutations.some(mutation=>[...mutation.removedNodes].some(node=>node===record.label||node.contains?.(record.label)));},dispose(){disposed=true;if(record){record.active=false;restore();record=null;}}};
}
