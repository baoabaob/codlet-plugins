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
export function officialRepository(item){
  return officialSources.sources.find(source=>source.repositoryId===item?.repositoryId&&
    source.ownerId===item?.ownerId&&typeof item?.fullName==='string'&&
    source.repository.toLowerCase()===item.fullName.toLowerCase())??null;
}

export function declaredPackageFor(item){
  const declared=item?.declarationStatus==='matched'?item.declaredPackage:null;
  if(!declared||declared.basis!=='publisher-release-declaration'||
    declared.releaseId!==item.latestRelease?.id||typeof declared.manifest?.id!=='string'||
    typeof declared.manifest?.version!=='string'||!Number.isSafeInteger(declared.asset?.id)||
    !(item.latestRelease?.assets??[]).some(asset=>asset.id===declared.asset.id&&asset.name===declared.asset.name&&asset.size===declared.asset.bytes))return null;
  return declared;
}

export function marketAssets(item){
  const declared=declaredPackageFor(item);
  return (item?.latestRelease?.assets??[]).filter(asset=>Number.isSafeInteger(asset.id)&&/\.zip$/i.test(asset.name)&&(!declared||asset.id===declared.asset.id));
}

export function marketItemKey(item){return Number.isSafeInteger(item?.repositoryId)?String(item.repositoryId):item?.fullName??'';}

export function marketMatches(item,query){
  const topics=(item.topics??[]).map(topic=>topic.toLowerCase());
  const manifest=declaredPackageFor(item)?.manifest;
  const text=[item.name,item.fullName,item.description,item.author,manifest?.name,manifest?.description,...topics].filter(value=>typeof value==='string').join(' ').toLowerCase();
  return query.trim().toLowerCase().split(/\s+/u).filter(Boolean).every(term=>term.startsWith('#')?topics.includes(term.slice(1)):text.includes(term));
}

export function marketSort(items,order='updated'){
  return [...items].sort((a,b)=>{
    if(order!=='name'){
      const left=order==='downloads'?count(a.totalDownloads):timestamp(a.preparedManifest?a.preparedReleasePublishedAt:declaredPackageFor(a)?.publishedAt);
      const right=order==='downloads'?count(b.totalDownloads):timestamp(b.preparedManifest?b.preparedReleasePublishedAt:declaredPackageFor(b)?.publishedAt);
      if(left!==right)return left==null?1:right==null?-1:right-left;
    }
    return (a.name??a.fullName??'').localeCompare(b.name??b.fullName??'','zh-CN')||
      marketItemKey(a).localeCompare(marketItemKey(b));
  });
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
export function formatDownloads(value,locale='zh-CN'){return count(value)==null?(locale.startsWith('zh')?'下载次数未知':'Downloads unknown'):`${new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:1}).format(value)} ${locale.startsWith('zh')?'次下载':'downloads'}`;}
export function formatUpdated(value,locale='zh-CN'){return timestamp(value)==null?(locale.startsWith('zh')?'更新时间未知':'Publish date unknown'):(locale.startsWith('zh')?`${new Intl.DateTimeFormat(locale,{month:'long',day:'numeric'}).format(new Date(value))}更新`:`Updated ${new Intl.DateTimeFormat(locale,{month:'short',day:'numeric'}).format(new Date(value))}`);}
