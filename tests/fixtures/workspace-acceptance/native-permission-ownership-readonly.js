// Test-only current input/picker identity evidence. No text, documents, actual
// permission values, setters, backend requests, navigation or UI operations.
import { loadedAsset, uniqueExport, componentSource, currentElementAncestry, currentAncestry, localConnection } from '../../../frontend/src/host-discovery.js';
import { nativeMainInput, nativeInputBinding, OWNED } from '../../../frontend/src/adapter/workspace-dom.js';

function pickerFiber(chain) {
  return chain?.find(fiber=>{
    const source=componentSource(fiber.type);
    return source.includes('conversationId')&&(source.includes('workPreferences.composer.useWorkSettings')||
      source.includes('selectedPermissionSelection')&&source.includes('updateThreadPermissions')||
      source.includes('permissionProfilesOverride')&&source.includes('setAgentMode')&&source.includes('setPermissionProfileId'));
  });
}
function committedPicker(trigger,input,root) {
  let committed=false,visited=0;
  const inspect=(element,container,proof)=>{
    const chain=currentElementAncestry(element,container);if(chain?.length)committed=true;
    const fiber=pickerFiber(chain);return fiber?{fiber,proof,committed:true,visited}:null;
  };
  let found=inspect(trigger,root,'trigger');if(found)return found;
  // A cloned trigger may retain a detached DOM attachment. Prove a nearby
  // committed host instead; never treat an unverified return chain as current.
  for(let element=trigger.parentElement,depth=0;element&&root.contains(element)&&element!==input?.input&&depth++<16;element=element.parentElement){
    found=inspect(element,root,'ancestor');if(found)return found;
  }
  for(const element of [...trigger.querySelectorAll('span,svg,path')].slice(0,16)){
    found=inspect(element,root,'descendant');if(found)return found;
  }
  // Search only the already-proven current input's component branch, not other
  // conversations or the app tree. A matching host must also prove its own chain.
  const inputChain=input&&currentElementAncestry(input.input,root),owner=inputChain?.find(fiber=>fiber.stateNode===input.input);
  const queue=owner?.child?[owner.child]:[],seen=new Set();
  while(queue.length&&seen.size<2048){
    const fiber=queue.pop();if(!fiber||seen.has(fiber))continue;seen.add(fiber);visited++;
    if(fiber.stateNode===trigger){
      // currentElementAncestry resolves only the potentially stale DOM pointer;
      // this host was found through current child links, so verify it directly.
      const attached=Object.keys(root).find(key=>key.startsWith('__reactContainer$')),container=attached&&root[attached];
      const current=container?.stateNode?.current??container;
      const chain=currentAncestry(fiber,current),picker=pickerFiber(chain?[...chain]:null);
      if(picker)return{fiber:picker,proof:'input-branch',committed:true,visited};
    }
    if(fiber.sibling)queue.push(fiber.sibling);if(fiber.child)queue.push(fiber.child);
  }
  // Some Native control regions have their own React container. Its current
  // root must be inside this Native input and outside consumer-owned surfaces.
  for(let element=trigger.parentElement,depth=0;input?.input.contains(element)&&depth++<16;element=element.parentElement){
    if(!element.closest(OWNED)&&Object.keys(element).some(key=>key.startsWith('__reactContainer$'))){
      found=inspect(trigger,element,'native-container');if(found)return found;
    }
  }
  return{fiber:null,proof:'unconfirmed',committed,visited};
}

// This test helper returns only projected evidence, including when Native DOM
// attachments are stale. Unconfirmed identity comparisons are null, not false.
export function permissionPickerEvidence(trigger,input,binding,root) {
  const {fiber,proof,committed,visited}=committedPicker(trigger,input,root),source=componentSource(fiber?.type),props=fiber?.memoizedProps;
  return{committed,proof,visited,implementationFound:!!fiber,
    implementation:!fiber?'unknown':source.includes('workPreferences.composer.useWorkSettings')?'account':source.includes('selectedPermissionSelection')?'selection':'legacy',
    conversationPresent:props?typeof props.conversationId==='string':null,
    conversationMatchesInput:props?props.conversationId===(input?.scope.value.conversationId??null):null,
    conversationMatchesStrictBinding:props&&binding?props.conversationId===binding.threadId:null,
    hostLocal:props?props.hostId==='local':null,insideCurrentInput:!!input?.input.contains(trigger),
    insideCurrentFooter:!!input&&!!trigger.closest('[data-thread-scroll-footer]')?.contains(input.input)};
}

export async function inspectNativePermissionOwnership(document) {
  const shared=await import(loadedAsset('shared'));
  const brand=name=>uniqueExport(shared,value=>value?.__scopeBrand===name&&typeof value.id==='symbol',name);
  const native={composerScope:brand('ComposerScope'),ThreadScope:brand('ThreadScope'),RouteScope:brand('RouteScope')};
  const input=nativeMainInput(document,native),binding=input&&nativeInputBinding(input,native),root=document.getElementById('root');
  const triggers=[...root.querySelectorAll('[data-composer-navigation-target="permissions"]')].filter(node=>!node.closest(OWNED+', [data-app-shell-active-page="false"]'));
  if(triggers.length>8)throw Error('Permission trigger count exceeds read-only limit');
  const pickers=triggers.map(trigger=>permissionPickerEvidence(trigger,input,binding,root));
  let loadedThread=null;
  if(binding){
    const current=localConnection().manager.getConversation(binding.threadId),settings=current?.latestThreadSettings;
    loadedThread={present:!!current,resumed:current?.resumeState==='resumed',
      cachedSettingsPresent:settings!=null,approvalPolicyPresent:settings?.approvalPolicy!=null,
      approvalsReviewerPresent:settings?.approvalsReviewer!=null,sandboxPolicyPresent:settings?.sandboxPolicy!=null,
      permissionsPresent:settings?.permissions!=null,activePermissionProfilePresent:settings?.activePermissionProfile!=null};
  }
  return Object.freeze({inputPresent:!!input,kind:input?.scope.value.kind??null,strictBinding:!!binding,triggerCount:triggers.length,pickers:Object.freeze(pickers),loadedThread});
}
