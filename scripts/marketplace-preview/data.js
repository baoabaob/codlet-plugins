import {desktopPlatforms,compatibilityFor,supportedPlatforms} from '../../frontend/src/codlet/marketplace-model.js';

// Presentation-only fixtures, including dates, counts and portability reviews.
// No repository search, download or installation. GitHub identities below match
// the registered repositories; real catalog responses must resolve them via Core.
const officialSource=(repository,repositoryId)=>({kind:'github',repository:'baoabaob/'+repository,repositoryId,ownerId:76909162});
export const plugins = [
  {id:'hide-usage-notice',name:'隐藏额度提示',version:'0.1.1',installed:'0.1.0',author:'Community Demo',tags:['UI','Enhancement'],description:'隐藏额度已用完的提示，让对话界面更清爽',systems:desktopPlatforms,permissions:['ui.dom'],permissionCopy:['读取和调整客户端页面中的元素'],dependency:'Codex 界面适配器',summary:'调整额度提示卡片的显示，不改变账户额度、请求结果或对话内容',repository:'example/hide-usage-notice',client:'26.915.31945 / 9922',publishedAt:'2026-09-21T08:00:00Z',downloads:1248},
  {id:'example.request-router',name:'请求路由',version:'0.2.0',author:'Community Demo',tags:['Tool','Enhancement'],description:'为不同会话选择请求 API，并查看当前连接状态',systems:['windows-x86_64','macos-aarch64'],permissions:['host.network','ui.mainWorld'],permissionCopy:['连接你指定的 API 服务','在客户端页面的 JavaScript 环境中运行'],dependency:'Codex 桌面适配器',summary:'在对话中切换请求使用的 API，支持保存多个连接配置；可通过适配器查看和修改实际请求与响应',repository:'example/request-router',client:'由桌面适配器提供',publishedAt:'2026-09-20T08:00:00Z',downloads:856},
  {id:'codex.ui.adapter',name:'Codex 界面适配器',version:'0.1.1',installed:'0.1.1',author:'Codlet',source:officialSource('codlet-ui-adapter',1379358711),tags:['UI','Adapter'],description:'将插件页面接入 Codex 侧栏与主导航',systems:desktopPlatforms,platformCapabilities:{'codex.ui.navigation.page@1':desktopPlatforms},permissions:['ui.dom','ui.mainWorld'],permissionCopy:['读取和调整客户端页面中的元素','在客户端页面的 JavaScript 环境中运行'],summary:'为其他插件提供统一的页面注册、导航和官方界面组件接入',repository:'baoabaob/codlet-ui-adapter',client:'26.915.31945 / 9922',publishedAt:'2026-09-19T08:00:00Z',downloads:3200},
  {id:'codex.desktop.adapter',name:'Codex 桌面适配器',version:'0.1.0',installed:'0.1.0',author:'Codlet',source:officialSource('codlet-desktop-adapter',1379359205),tags:['Adapter'],description:'为插件提供已适配的客户端、对话和请求接口',systems:desktopPlatforms,permissions:['ui.mainWorld'],permissionCopy:['在客户端页面的 JavaScript 环境中运行'],summary:'通过 Codlet Core 和客户端现有接口，向插件提供经过适配的桌面能力',repository:'baoabaob/codlet-desktop-adapter',client:'26.915.31945 / 9922',publishedAt:'2026-09-18T08:00:00Z',downloads:2680},
  {id:'example.snippets',name:'快捷片段',version:'1.0.0',author:'Community Demo',tags:['Tool'],description:'保存常用提示词，在输入框中快速插入',systems:null,permissions:['ui.dom'],permissionCopy:['读取和调整客户端页面中的元素'],summary:'管理你经常使用的文本片段',repository:'example/snippets',client:null,publishedAt:'2026-09-17T08:00:00Z',downloads:412},
  {id:'example.mac-shortcuts',name:'Mac 快捷操作',version:'0.3.0',author:'Community Demo',tags:['Enhancement'],description:'通过 macOS 快捷操作唤起常用的 Codex 功能',systems:['macos-aarch64'],permissions:['core.shortcuts'],permissionCopy:['注册你确认的全局快捷键'],summary:'将常用操作接入系统快捷键',repository:'example/mac-shortcuts',client:'由桌面适配器提供',publishedAt:'2026-09-16T08:00:00Z',downloads:168},
  {id:'codlet-gui',name:'Codlet 管理界面',version:'0.1.1',installed:'0.1.1',author:'Codlet',source:officialSource('codlet-gui',1379359689),tags:['UI','Tool'],description:'创建、查找、安装和管理 Codlet 插件',compatibility:{mode:'adapters',review:'public-api-only',requirements:[{providerId:'codex.ui.adapter',capability:'codex.ui.navigation.page@1'}]},permissions:['ui.dom','runtime.manage'],permissionCopy:['读取和调整客户端页面中的元素','管理插件、权限与 Codlet 设置'],dependency:'Codex 界面适配器',summary:'通过 Core 的跨平台接口和界面适配器管理插件，无需为每个操作系统分别实现',repository:'baoabaob/codlet-gui',client:'由界面适配器提供',publishedAt:'2026-09-19T09:00:00Z',downloads:2950}
];
export const systemNames={'windows-x86_64':'Windows · x64','windows-aarch64':'Windows · ARM64','macos-aarch64':'macOS · Apple Silicon'};
export const compatibility=(plugin,device)=>compatibilityFor(plugin,plugins,device);
export const support=plugin=>supportedPlatforms(plugin,plugins);
export function platformSummary(plugin){
  const result=support(plugin);
  if(!result.known)return '系统支持未知';
  if(!result.platforms.length)return '不支持当前 Codlet 平台';
  return [...new Set(result.platforms.map(platform=>platform.startsWith('windows-')?'Windows':'macOS'))].join(' / ');
}
