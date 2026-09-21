import officialSources from '../../../compatibility/official-sources.json' with {type:'json'};

// Inputs must come from the catalog/Core's GitHub response, never package authors'
// metadata. This is a presentation rule; Core must verify installation provenance.
export function isOfficialPlugin(plugin){
  const source=plugin.source;
  return source?.kind==='github'&&officialSources.sources.some(allowed=>
    source.repositoryId===allowed.repositoryId&&source.ownerId===allowed.ownerId&&
    typeof source.repository==='string'&&source.repository.toLowerCase()===allowed.repository.toLowerCase()&&
    allowed.pluginIds.includes(plugin.id));
}

export const desktopPlatforms=['windows-x86_64','windows-aarch64','macos-aarch64'];
const unknown=reason=>({known:false,platforms:[],reason});
const intersection=(left,right)=>left.filter(value=>right.includes(value));
const strings=value=>Array.isArray(value)&&value.length>0&&value.every(item=>typeof item==='string'&&item.length>0);
export function supportedPlatforms(plugin,catalog,corePlatforms=desktopPlatforms,seen=new Set()){
  if(!plugin||seen.has(plugin.id))return unknown('dependency-cycle-or-missing');
  const rule=plugin.compatibility;
  if(rule?.mode==='adapters'){
    // Merely listing an Adapter does not establish portability. Require an
    // explicit public-API review and resolve each bound capability separately.
    if(rule.review!=='public-api-only'||rule.issues?.length||!Array.isArray(rule.requirements)||!rule.requirements.length||rule.requirements.some(r=>!r||typeof r.providerId!=='string'||typeof r.capability!=='string'))return unknown('platform-review-required');
    let platforms=[...corePlatforms];const visited=new Set(seen).add(plugin.id);
    for(const requirement of rule.requirements){
      const providers=catalog.filter(p=>p.id===requirement.providerId);
      if(providers.length!==1)return unknown('provider-unavailable');
      const provider=providers[0],capability=provider.platformCapabilities?.[requirement.capability];
      if(!strings(capability))return unknown('capability-platforms-unknown');
      const inherited=supportedPlatforms(provider,catalog,corePlatforms,visited);
      if(!inherited.known)return inherited;
      platforms=intersection(platforms,intersection(inherited.platforms,capability));
    }
    return {known:true,platforms,inherited:true};
  }
  if(!strings(plugin.systems))return unknown('not-declared');
  return {known:true,platforms:plugin.systems.includes('any')?[...corePlatforms]:intersection(corePlatforms,plugin.systems),inherited:false};
}
export function compatibilityFor(plugin,catalog,device){const support=supportedPlatforms(plugin,catalog);return !support.known?'unknown':support.platforms.includes(device)?'supported':'unsupported';}

const timestamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):null;
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
export function sortPlugins(plugins,order='updated'){
  return [...plugins].sort((a,b)=>{
    if(order!=='name'){
      const av=order==='downloads'?count(a.downloads):timestamp(a.publishedAt),bv=order==='downloads'?count(b.downloads):timestamp(b.publishedAt);
      if(av!==bv)return av==null?1:bv==null?-1:bv-av;
    }
    return a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id);
  });
}
export function sumPackageDownloads(assets,eligibleAssetIds,{complete=true}={}){
  if(!complete)return null;
  const ids=new Set(eligibleAssetIds),seen=new Set();let total=0;
  for(const asset of assets){
    if(!ids.has(asset.id)||seen.has(asset.id))continue;
    if(count(asset.download_count)==null)return null;
    seen.add(asset.id);total+=asset.download_count;
  }
  return seen.size===ids.size&&Number.isSafeInteger(total)?total:null;
}
export function formatDownloads(value){return count(value)==null?'下载次数未知':`${new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(value)} 次下载`;}
export function formatUpdated(value){return timestamp(value)==null?'更新时间未知':`${new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric'}).format(new Date(value))}更新`;}
