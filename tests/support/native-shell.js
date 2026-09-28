import * as React from 'react';
import * as DOM from 'react-dom';
import * as Client from 'react-dom/client';
export {React,DOM,Client};
const h=React.createElement;
export function SidebarItem({label,icon,isActive,onClick,...props}){
  return h('button',{className:'sidebar-item',onClick,'aria-current':isActive?'page':undefined,'aria-label':props['aria-label']},icon?h(icon,{className:isActive?'native-active-icon':''}):null,label);
}
function RailButton({children,selected,color,variant,pill,size,iconSize,uniform,...props}){
  return h('button',{...props,'data-native-rail-button':'','data-selected':selected?'':undefined,
    'data-color':color,'data-variant':variant,'data-pill':pill?'':undefined,'data-size':size,'data-icon-size':iconSize,'data-uniform':uniform?'':undefined},children);
}
function RailTooltip({children,side,tooltipContent,cloneCustomTrigger,closeOnTriggerClick}){
  return React.cloneElement(children,{'data-native-tooltip':tooltipContent,'data-tooltip-side':side,
    'data-tooltip-clone':String(cloneCustomTrigger),'data-tooltip-close-on-click':String(closeOnTriggerClick)});
}
export function mount({fragmentRouteRoot=false,multipleComposers=false,dataRouter=false,groupedNewChat=false,rail=false}={}){
  const listeners=new Set(),history=[{pathname:'/local/start',search:'',hash:'',state:null}];let index=0;
  const navigator={get location(){return history[index];},listen(fn){listeners.add(fn);return()=>listeners.delete(fn);},push(to,state){history.splice(++index);history[index]=typeof to==='string'?{pathname:to,search:'',hash:'',state}:to;listeners.forEach(fn=>fn());},replace(to,state){history[index]=typeof to==='string'?{pathname:to,search:'',hash:'',state}: {...to,state};listeners.forEach(fn=>fn());},go(delta){index=Math.max(0,Math.min(history.length-1,index+delta));listeners.forEach(fn=>fn());}};
  const router={routes:[{id:'0',path:'*'}],get state(){return {location:navigator.location,historyAction:'POP'};},subscribe(fn){return navigator.listen(()=>fn(router.state));},navigate(to,options){typeof to==='number'?navigator.go(to):options?.replace?navigator.replace(to,options.state):navigator.push(to,options?.state);return Promise.resolve();}};
  const facade={push:(to,state)=>router.navigate(to,{state}),replace:(to,state)=>router.navigate(to,{replace:true,state}),go:delta=>router.navigate(delta)};
  const RouterContext=React.createContext(null);
  function Route() {throw Error('Route descriptor must never render');}
  function SidebarGroup({children,itemSpacing}){return h('div',{'data-native-sidebar-group':'','data-spacing':itemSpacing},children);}
  function NativeComposer({placement,index=0}){
    return h('div',{'data-codex-composer-root':'','data-composer-placement':placement},
      h('div',{'data-composer-utility-bar-scroll-area':'',role:'group','aria-label':'Composer utility bar'},
        h('div',null,h('button',{type:'button','data-native-composer-action':String(index)},'Native action'))),
      h('input',{id:index===0?'native-composer':undefined}));
  }
  const startComposer=multipleComposers?h(React.Fragment,null,h(NativeComposer,{placement:'home',index:0}),h(NativeComposer,{placement:'floating',index:1})):h(NativeComposer,{placement:'home'});
  const collection=[h(Route,{path:'/inbox',element:h('p',null,'Inbox')}),h(Route,{path:'/connector/oauth_callback',element:null}),
    h(Route,{path:'/local/start',element:startComposer}),h(Route,{path:'/local/thread/one',element:h(NativeComposer,{placement:'thread'})})];
  const routeChildren=[h(Route,{path:'/avatar-overlay',element:null,key:'avatar'}),h(Route,{children:fragmentRouteRoot?h(React.Fragment,{children:collection}):collection,key:'main'})];
  const tree=h(Route,{children:fragmentRouteRoot?h(React.Fragment,null,...routeChildren):routeChildren});
  function Routes({children}){
    const location=React.useSyncExternalStore(navigator.listen,()=>navigator.location);
    const walk=element=>{if(element?.props?.path===location.pathname||element?.props?.path?.endsWith('/*')&&location.pathname.startsWith(element.props.path.slice(0,-2)))return element;for(const child of React.Children.toArray(element?.props?.children)){const match=walk(child);if(match)return match;}};
    return h('main',{'data-app-shell-focus-area':'main'},walk(children)?.props.element??h('p',null,'Native page'));
  }
  const rootNode=document.createElement('div');rootNode.id='root';document.body.appendChild(rootNode);const root=Client.createRoot(rootNode);
  const item=h(SidebarItem,{label:groupedNewChat?'New chat':'Scheduled',animatedIcon:groupedNewChat?'sidebar-new-chat':'sidebar-tasks',onClick:()=>navigator.push('/inbox')});
  const navigationRail=rail?h('nav',{'data-app-navigation-rail':'true'},h(SidebarGroup,{itemSpacing:'rail'},
    h('div',null,h(RailButton,{'data-sidebar-destination':'builtin:home',onClick:()=>navigator.push('/')},'Home')),
    h(RailButton,{'data-sidebar-destination':'builtin:customize',onClick:()=>navigator.push('/plugins')},'Customize'),
    h('button',{'data-native-explore':''},'Explore'),
    h(SidebarGroup,{itemSpacing:'rail'},h(RailButton,{'data-sidebar-destination':'fixture:pinned'},'Pinned destination')))):null;
  const content=h(React.Fragment,null,navigationRail,h('nav',null,groupedNewChat?h(SidebarGroup,null,h('div',{'data-native-drag-row':''},item)):item),h(Routes,{navigator:dataRouter?facade:navigator,children:tree}));
  DOM.flushSync(()=>root.render(dataRouter?h(RouterContext.Provider,{value:{router,navigator:facade}},content):content));
  return {navigator,tree,routes:collection,Route,SidebarGroup:groupedNewChat||rail?SidebarGroup:undefined,
    RailButton:rail?RailButton:undefined,RailTooltip:rail?RailTooltip:undefined,dispose:()=>DOM.flushSync(()=>root.unmount())};
}
