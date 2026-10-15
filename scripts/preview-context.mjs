// The browser preview uses Core's actual UI/page/i18n factories. Only the
// navigation endpoint and management responses are supplied by its local demo.
export function createPreviewContext({pluginId,generation,onDeactivate,reportDiagnostic,request,createUI,createPage,createI18n}){
  const context={pluginId,generation,onDeactivate,reportDiagnostic,rpc:{request}};
  context.i18n=createI18n(context);
  context.ui={api:2,create:()=>createUI(context),page:options=>createPage(context,options,()=>context.ui.create())};
  context.codex={api:1,navigation:{page:options=>context.ui.page(options),newTaskDraft:params=>request({name:'codex.ui.navigation.page',api:1,scope:'target'},'newTaskDraft',params)}};
  return context;
}
