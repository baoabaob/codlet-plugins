// Test-only current input/picker identity evidence. No text, documents, actual
// permission values, setters, backend requests, navigation or UI operations.
import { loadedAsset, uniqueExport, componentSource, currentElementAncestry, localConnection } from '../../../frontend/src/host-discovery.js';
import { nativeMainInput, nativeInputBinding, OWNED } from '../../../frontend/src/adapter/workspace-dom.js';

export async function inspectNativePermissionOwnership(document) {
  const shared=await import(loadedAsset('shared'));
  const brand=name=>uniqueExport(shared,value=>value?.__scopeBrand===name&&typeof value.id==='symbol',name);
  const native={composerScope:brand('ComposerScope'),ThreadScope:brand('ThreadScope'),RouteScope:brand('RouteScope')};
  const input=nativeMainInput(document,native),binding=input&&nativeInputBinding(input,native),root=document.getElementById('root');
  const triggers=[...root.querySelectorAll('[data-composer-navigation-target="permissions"]')].filter(node=>!node.closest(OWNED+', [data-app-shell-active-page="false"]'));
  if(triggers.length>8)throw Error('Permission trigger count exceeds read-only limit');
  const pickers=[];
  for(const trigger of triggers){
    const chain=currentElementAncestry(trigger,root)??[];
    const fiber=chain.find(fiber=>{
      const source=componentSource(fiber.type);
      return source.includes('conversationId')&&(source.includes('workPreferences.composer.useWorkSettings')||
        source.includes('selectedPermissionSelection')&&source.includes('updateThreadPermissions')||
        source.includes('permissionProfilesOverride')&&source.includes('setAgentMode')&&source.includes('setPermissionProfileId'));
    });
    const source=componentSource(fiber?.type),props=fiber?.memoizedProps;
    pickers.push({committed:chain.length>0,implementationFound:!!fiber,
      implementation:!fiber?'unknown':source.includes('workPreferences.composer.useWorkSettings')?'account':source.includes('selectedPermissionSelection')?'selection':'legacy',
      conversationPresent:typeof props?.conversationId==='string',
      conversationMatchesInput:!!props&&props.conversationId===(input?.scope.value.conversationId??null),
      conversationMatchesStrictBinding:!!binding&&props?.conversationId===binding.threadId,
      hostLocal:props?.hostId==='local',insideCurrentInput:!!input?.input.contains(trigger),
      insideCurrentFooter:!!input&&!!trigger.closest('[data-thread-scroll-footer]')?.contains(input.input)});
  }
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
