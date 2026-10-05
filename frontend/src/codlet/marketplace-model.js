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

const timestamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):null;
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
export function formatDownloads(value,locale='zh-CN'){return count(value)==null?(locale.startsWith('zh')?'下载次数未知':'Downloads unknown'):`${new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:1}).format(value)} ${locale.startsWith('zh')?'次下载':'downloads'}`;}
