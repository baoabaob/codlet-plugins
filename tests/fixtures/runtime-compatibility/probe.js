(()=>{
 const report=document.querySelector('[data-compatibility-acceptance]');
 if(report?.dataset.compatibilityAcceptance==='complete'){
   const entry=document.querySelector('[data-codlet-navigation-entry="codlet-gui"]');if(entry&&entry.getAttribute('aria-current')!=='page')entry.click();
 }
 const skill=globalThis[Symbol.for('codlet.core.skills.v1')],panel=document.querySelector('[data-codlet-page-host]');
 return {phase:report?.dataset.compatibilityAcceptance,checks:report?.textContent&&JSON.parse(report.textContent),gui:!!panel,
   guiText:panel?.innerText?.slice(0,1200),skill:skill&&{status:skill.status,error:skill.error}};
})()
