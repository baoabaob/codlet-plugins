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
  const diagnostics={triggerAttachments:0,attachedHostMatches:0,nearbyCurrentChains:0,triggerBranchHosts:0,triggerBranchCurrentChains:0,
    sourceRoles:{conversation:0,legacy:0,account:0,selection:0,permissionNavigation:0},attachedRoots:[]};
  const countRoles=chain=>{for(const fiber of chain??[]){
    const source=componentSource(fiber.type);
    if(source.includes('conversationId'))diagnostics.sourceRoles.conversation++;
    if(source.includes('setAgentMode')&&source.includes('setPermissionProfileId'))diagnostics.sourceRoles.legacy++;
    if(source.includes('workPreferences.composer.useWorkSettings'))diagnostics.sourceRoles.account++;
    if(source.includes('selectedPermissionSelection')&&source.includes('updateThreadPermissions'))diagnostics.sourceRoles.selection++;
    if(source.includes('data-composer-navigation-target'))diagnostics.sourceRoles.permissionNavigation++;
  }};
  // Counts distinguish stale DOM pointers, a foreign existing Native root and
  // an unknown component predicate. No root, fiber, source or identity escapes.
  for(const key of Object.keys(trigger).filter(key=>key.startsWith('__reactFiber$')).slice(0,4)){
    diagnostics.triggerAttachments++;const attached=trigger[key];
    if(attached?.stateNode===trigger)diagnostics.attachedHostMatches++;
    for(const start of [attached,attached?.alternate]){
      const seen=new Set();let fiber=start;
      while(fiber&&!seen.has(fiber)&&seen.size<128){
        seen.add(fiber);
        if(fiber.tag===3){
          const container=fiber.stateNode?.containerInfo,current=fiber.stateNode?.current;
          diagnostics.attachedRoots.push({currentPresent:!!current,currentMatchesThisFiber:current===fiber,containerIsMainRoot:container===root,
            containerConnected:container?.isConnected===true,containerOwnsTrigger:!!container?.contains?.(trigger),containerOwned:!!container?.closest?.(OWNED)});
          break;
        }
        fiber=fiber.return;
      }
    }
  }
  const inspect=(element,container,proof)=>{
    const chain=currentElementAncestry(element,container);if(chain?.length){committed=true;diagnostics.nearbyCurrentChains++;countRoles(chain);}
    const fiber=pickerFiber(chain);return fiber?{fiber,proof,committed:true,visited,diagnostics}:null;
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
      diagnostics.triggerBranchHosts++;
      // currentElementAncestry resolves only the potentially stale DOM pointer;
      // this host was found through current child links, so verify it directly.
      const attached=Object.keys(root).find(key=>key.startsWith('__reactContainer$')),container=attached&&root[attached];
      const current=container?.stateNode?.current??container;
      const chain=currentAncestry(fiber,current),picker=pickerFiber(chain?[...chain]:null);
      if(chain){committed=true;diagnostics.triggerBranchCurrentChains++;countRoles(chain);}
      if(picker)return{fiber:picker,proof:'input-branch',committed:true,visited,diagnostics};
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
  return{fiber:null,proof:'unconfirmed',committed,visited,diagnostics};
}

// This test helper returns only projected evidence, including when Native DOM
// attachments are stale. Unconfirmed identity comparisons are null, not false.
export function permissionPickerEvidence(trigger,input,binding,root) {
  const {fiber,proof,committed,visited,diagnostics}=committedPicker(trigger,input,root),source=componentSource(fiber?.type),props=fiber?.memoizedProps;
  return{committed,proof,visited,diagnostics,implementationFound:!!fiber,
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
