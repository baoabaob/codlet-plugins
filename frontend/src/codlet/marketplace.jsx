import {officialRepository,isOfficialPlugin,marketAssets,marketItemKey,formatDownloads,declaredPackageFor} from './marketplace-model.js';
import {tagCatalog,tagAtCaret,suggestTags,insertTag} from './tag-search.js';

const platformNames={'windows-x86_64':'Windows · x64','windows-aarch64':'Windows · ARM64','macos-aarch64':'macOS · Apple Silicon'};
const label=platform=>platformNames[platform]??platform;
const topicLabels={ui:'UI',adapter:'Adapter',tool:'Tool',enhancement:'Enhancement'};
const visibleTopics=topics=>(topics??[]).filter(topic=>!['codlet-plugin','codlet-official','codlet-adapter'].includes(topic.toLowerCase())).map(topic=>topicLabels[topic.toLowerCase()]??topic);

export function createMarketplaceView({React,C,I,manager,t,Copy,Back,PluginTags}){
  const h=React.createElement;
  function TagHash(){return <svg className="codlet-tag-hash" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M6.3 2.7L4.7 13.3 M11.3 2.7L9.7 13.3 M2.7 5.5H13.3 M2.7 10.5H13.3"/></svg>;}
  function Search({s}){
    const market=s.market,[draft,setDraft]=React.useState(market.query),[focused,setFocused]=React.useState(false),[ime,setIme]=React.useState(false),[active,setActive]=React.useState(0),[dismissed,setDismissed]=React.useState(false);
    const input=React.useRef(null),composing=React.useRef(false),caret=React.useRef({start:0,end:0}),pendingCaret=React.useRef(null),options=React.useRef(null),listId=React.useId();
    React.useEffect(()=>setDraft(market.query),[market.query]);
    const token=tagAtCaret(draft,caret.current.start,caret.current.end);
    const candidates=suggestTags(tagCatalog(market.items.map(item=>({tags:visibleTopics(item.topics)}))),draft,token);
    const open=focused&&!ime&&!dismissed&&!!token,selected=Math.min(active,Math.max(0,candidates.length-1));
    React.useLayoutEffect(()=>{if(pendingCaret.current==null)return;const next=pendingCaret.current;pendingCaret.current=null;input.current?.focus();input.current?.setSelectionRange(next,next);caret.current={start:next,end:next};},[draft]);
    React.useEffect(()=>{if(open)options.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({block:'nearest'});},[open,selected]);
    const remember=node=>{caret.current={start:node.selectionStart,end:node.selectionEnd};setDismissed(false);};
    const change=query=>{setDraft(query);manager.marketChangeQuery(query);setDismissed(false);setActive(0);};
    const choose=tag=>{const result=insertTag(draft,tag,token);change(result.query);pendingCaret.current=result.caret;setDismissed(true);};
    return <div className="market-search-anchor"><C.Input ref={input} className="codlet-search market-search" size="md" variant="outline" pill value={draft} role="combobox" data-codlet-market-search="" aria-label={t('Search marketplace')} placeholder={t('Search plugins or #tag')} aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined} aria-activedescendant={open&&candidates.length?`${listId}-${selected}`:undefined} startAdornment={<I.Search width={16} height={16}/>} endAdornment={draft?<C.Button color="secondary" variant="ghost" size="sm" uniform aria-label={t('Clear search')} onClick={()=>change('')}><I.X/></C.Button>:null}
      onFocus={event=>{setFocused(true);remember(event.currentTarget);}} onBlur={()=>{setFocused(false);setDismissed(true);}} onSelect={event=>remember(event.currentTarget)}
      onCompositionStart={()=>{composing.current=true;setIme(true);}} onCompositionEnd={event=>{composing.current=false;setIme(false);remember(event.currentTarget);change(event.currentTarget.value);}}
      onChange={event=>{remember(event.currentTarget);setDraft(event.currentTarget.value);if(!composing.current)manager.marketChangeQuery(event.currentTarget.value);}}
      onKeyDown={event=>{if(event.nativeEvent.isComposing||composing.current||event.altKey||event.ctrlKey||event.metaKey)return;if((event.key==='ArrowDown'||event.key==='ArrowUp')&&token&&candidates.length){event.preventDefault();setDismissed(false);setActive(open?(selected+(event.key==='ArrowDown'?1:-1)+candidates.length)%candidates.length:event.key==='ArrowDown'?0:candidates.length-1);}else if(event.key==='Enter'&&open&&candidates.length){event.preventDefault();choose(candidates[selected]);}else if(event.key==='Escape'&&!event.shiftKey&&(open||draft)){event.preventDefault();open?setDismissed(true):change('');}}}/>
      {open&&<div className="codlet-tag-menu"><div className="codlet-tag-menu-title">{t('Tags')}</div><div id={listId} ref={options} role="listbox" aria-label={t('Tag suggestions')} className="codlet-tag-options">{candidates.map((tag,index)=><div key={tag} id={`${listId}-${index}`} role="option" aria-label={`#${tag}`} aria-selected={index===selected} className="codlet-tag-option" onPointerMove={()=>setActive(index)} onPointerDown={event=>event.preventDefault()} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(tag)}><TagHash/><span>{tag}</span></div>)}{!candidates.length&&<div className="codlet-tag-empty" role="status">{t('No matching tags')}</div>}</div></div>}
    </div>;
  }
  function verifiedOfficial(item){
    const source=item.preparedSource;
    return !!source&&source.repositoryId===item.repositoryId&&source.ownerId===item.ownerId&&isOfficialPlugin({id:item.preparedPluginId,source:{kind:'github',repository:item.fullName,repositoryId:source.repositoryId,ownerId:source.ownerId}});
  }
  function Origin({item}){
    const pinned=officialRepository(item),verified=verifiedOfficial(item);
    return <span className="market-origin">{item.author||item.owner||t('Author unknown')}{pinned&&<C.Tooltip content={t(verified?'Verified official plugin source':'Registered official repository; plugin identity is checked during package review')}><span className="market-official">{t(verified?'Official':'Official repository')}</span></C.Tooltip>}</span>;
  }
  function Metrics({item}){
    const declared=declaredPackageFor(item),published=item.preparedManifest?item.preparedReleasePublishedAt:declared?declared.publishedAt:item.latestRelease?.publishedAt;
    const date=published&&Number.isFinite(Date.parse(published))?new Intl.DateTimeFormat(manager.state.locale==='zh'?'zh-CN':'en',{year:'numeric',month:'short',day:'numeric'}).format(new Date(published)):t('Date unknown');
    return <><time dateTime={published||undefined}>{t(item.preparedManifest?'Package Release':declared?'Publisher Release':'Release candidate')} · {date}</time><span>{formatDownloads(item.totalDownloads,manager.state.locale)}</span></>;
  }
  function Compatibility({metadata,device,status,clientStatus,declared=false}){
    const platforms=Array.isArray(metadata?.platforms)&&metadata.platforms.length?metadata.platforms.map(label).join(', '):t('Unknown (not declared)');
    const current=device?.platform?label(device.platform):t('Unknown');
    const verdict=status??device?.status??'unknown';
    const adapters=metadata?.adapters,profiles=Array.isArray(adapters?.codex?.clientProfiles)?[...new Set(adapters.codex.clientProfiles.map(profile=>profile?.appVersion).filter(value=>typeof value==='string'&&value.length>0))]:[];
    const builds=Array.isArray(adapters?.codex?.testedBuilds)?adapters.codex.testedBuilds.filter(value=>typeof value==='string'):[],limitations=Array.isArray(adapters?.codex?.limitations)?adapters.codex.limitations.filter(value=>typeof value==='string'):[];
    return <section className="market-detail-section market-compatibility"><div className="market-compat-heading"><h2>{t('Systems and compatibility')}</h2><span className={verdict==='compatible'?'market-compatible':'market-platform-note market-unknown'}>{t(verdict==='compatible'?(declared?'Author declares this device compatible':'Package declares this device compatible'):verdict==='incompatible'?(declared?'Author declares this device incompatible':'Package declares this device incompatible'):'Compatibility unknown')}</span></div><dl>
      <dt>{t('Supported systems')}</dt><dd>{platforms}</dd><dt>{t('Current device')}</dt><dd>{current}</dd>
      <dt>{t('Codex client')}</dt><dd>{clientStatus?.runningVersion||t('Unknown')}</dd>
      <dt>{t('Adapted client versions')}</dt><dd>{clientStatus?.adaptedVersions?.length?clientStatus.adaptedVersions.join(', '):t('Unknown')}</dd>
      <dt>{t('Codlet API')}</dt><dd>{metadata?.runtimeApi==null?t('Unknown (not declared)'):`API ${metadata.runtimeApi}`}</dd>
      {profiles.length>0&&<><dt>{t('Publisher-declared client versions')}</dt><dd>{profiles.join(', ')}</dd></>}
      {builds.length>0&&<><dt>{t('Author-declared client builds')}</dt><dd>{builds.join(', ')}</dd></>}
      {limitations.length>0&&<><dt>{t('Author-declared limitations')}</dt><dd>{limitations.join('; ')}</dd></>}
      {adapters&&typeof adapters==='object'&&!Array.isArray(adapters)&&Object.keys(adapters).length>0&&<><dt>{t('Adapter declarations')}</dt><dd>{Object.keys(adapters).join(', ')}</dd></>}
    </dl></section>;
  }
  function Action({item,s}){
    const installed=manager.marketInstalled(item),status=manager.marketKnownCompatibility(item),assets=marketAssets(item);
    if(status==='incompatible')return <C.Button color="secondary" variant="soft" size="sm" disabled>{t('Incompatible')}</C.Button>;
    if(installed?.operation==='installed'&&installed.plugin.ownership!=='installer-seed')return <span className="market-status">{t('Installed')}</span>;
    const update=installed?.operation==='update'||installed?.plugin?.ownership==='installer-seed';
    const selected=s.market.selected&&marketItemKey(s.market.selected)===marketItemKey(item);
    return <C.Button color={update?'info':'secondary'} variant="soft" size="sm" disabled={!assets.length||s.market.loading||s.listStale||!!manager.pending||(selected&&!s.market.assetId)} onClick={()=>{if(!selected||assets.length>1){manager.marketDetails(item);if(assets.length>1)return;}manager.reviewMarket(item);}}>{update?<I.Download/>:<I.Plus/>}{t(assets.length>1&&!selected?'Choose ZIP':update?'Update':'Install')}</C.Button>;
  }
  function Marketplace({s}){
    const market=s.market,items=manager.marketFiltered(),showTags=s.settings?.effective?.showPluginTags!==false;
    const sorts={updated:'Recently updated',downloads:'Most downloaded',name:'Name'};
    return <section className="codlet-page market-detail"><div className="market-breadcrumb"><Back/><h2>{t('Plugin marketplace')}</h2></div>
      <Search s={s}/><div className="market-filterbar"><div className="codlet-filters" role="group" aria-label={t('Plugin source')}>{[['all','All'],['official','Official'],['community','Community']].map(([value,label])=><C.Button key={value} color="secondary" variant={market.origin===value?'soft':'ghost'} size="sm" aria-pressed={market.origin===value} onClick={()=>manager.marketSet({origin:value})}>{t(label)}</C.Button>)}</div><div className="market-filter-actions"><C.Checkbox checked={market.onlyDevice} label={t('Only compatible with this device')} onCheckedChange={onlyDevice=>manager.marketSet({onlyDevice})}/><C.Menu><C.Menu.Trigger><C.Button color="secondary" variant="ghost" size="sm" aria-label={`${t('Sort')}: ${t(sorts[market.sort])}`}>{t(sorts[market.sort])}<I.ChevronDown/></C.Button></C.Menu.Trigger><C.Menu.Content align="end" minWidth={144}>{Object.entries(sorts).map(([value,label])=><C.Menu.Item key={value} aria-current={market.sort===value?'true':undefined} onSelect={()=>manager.marketSet({sort:value})}>{t(label)}</C.Menu.Item>)}</C.Menu.Content></C.Menu></div></div>
      {market.onlyDevice&&<Copy>{t('Only declared or reviewed packages with support for this device are shown.')}</Copy>}
      {s.operationError&&<Copy error role="alert">{t(s.operationError)}</Copy>}
      {market.error&&<div className="codlet-empty market-empty" role="alert"><C.EmptyMessage><C.EmptyMessage.Title>{t('Marketplace unavailable')}</C.EmptyMessage.Title><C.EmptyMessage.Description>{t(market.error)}</C.EmptyMessage.Description></C.EmptyMessage><C.Button color="secondary" variant="soft" size="sm" onClick={()=>manager.marketSearch(true)}><I.Regenerate/>{t('Retry')}</C.Button></div>}
      {market.loading&&!market.items.length&&<div className="codlet-empty codlet-loading" role="status" aria-label={t('Loading marketplace')}><C.LoadingIndicator size={24}/></div>}
      {!market.loading&&!market.error&&!items.length&&<div className="codlet-empty market-empty" role="status"><C.EmptyMessage><C.EmptyMessage.Description>{t('No matching plugins')}</C.EmptyMessage.Description></C.EmptyMessage>{!!market.query.trim()&&<Copy>{t('Search covers public repository names, descriptions and tags.')}</Copy>}<C.Button color="secondary" variant="ghost" size="sm" onClick={()=>{manager.marketSet({origin:'all',onlyDevice:false});manager.marketChangeQuery('');}}>{t('Clear filters')}</C.Button></div>}
      {!!items.length&&<div className="codlet-plugin-list">{items.map(item=>{
        const declared=declaredPackageFor(item),manifest=item.preparedManifest??declared?.manifest,compatibility=manager.marketKnownCompatibility(item);
        const topicTags=visibleTopics(item.topics),declaredTags=Array.isArray(manifest?.tags)?manifest.tags:[];
        return <article className="codlet-plugin-row market-row" key={marketItemKey(item)}><div className="codlet-plugin-copy">
          <div className="codlet-plugin-title"><span className="codlet-plugin-name">{manifest?.name||item.name||item.fullName}</span><span className="codlet-version">{manifest?.version??`${t('Release candidate')} ${item.latestRelease?.tag??''}`}</span>{declared&&!item.preparedManifest&&<span className="market-declared-note">{t('Publisher declared')}</span>}
            {manifest?<PluginTags tags={declaredTags} show={showTags}/>:<PluginTags tags={topicTags} show={showTags} query={market.query} onSelect={tag=>manager.marketChangeQuery(insertTag(market.query,tag).query)}/>}
          </div>
          {(manifest?.description||item.description)&&<div className="codlet-plugin-description">{manifest?.description||item.description}</div>}
          <div className="market-meta"><Origin item={item}/><Metrics item={item}/><span className="market-platform-note market-unknown"><I.InfoCircle/>{t(compatibility==='compatible'?(item.preparedManifest?'Package declares this device compatible':'Author declares this device compatible'):compatibility==='incompatible'?(item.preparedManifest?'Package declares this device incompatible':'Author declares this device incompatible'):declared||item.preparedManifest?'Compatibility unknown':'Systems unknown until package review')}</span></div>
        </div><div className="codlet-plugin-actions"><C.Button color="secondary" variant="ghost" size="sm" aria-label={t(`Details for ${manifest?.name||item.name||item.fullName}`)} onClick={()=>manager.marketDetails(item)}>{t('Details')}</C.Button><Action item={item} s={s}/></div></article>;
      })}</div>}
      {market.hasMore&&<C.Button color="secondary" variant="ghost" size="sm" disabled={market.loading} loading={market.loading} onClick={()=>manager.marketLoadMore()}>{t('Load more')}</C.Button>}
      {market.hasMore&&<Copy>{t('Sorting currently covers loaded repositories. Load more to include additional results.')}</Copy>}
      {market.loading&&market.items.length>0&&<p className="codlet-copy" role="status">{t('Loading more plugins...')}</p>}
    </section>;
  }
  function MarketplaceDetails({s}){
    const item=s.market.selected;if(!item)return <section className="codlet-page"><Back/></section>;
    const declared=declaredPackageFor(item),manifest=item.preparedManifest??declared?.manifest,installed=manager.marketInstalled(item),metadata=item.preparedMetadata??declared?.metadata??null,assets=marketAssets(item);
    return <section className="codlet-page market-detail"><Back/><div className="market-detail-top"><div className="market-detail-title"><div className="codlet-details-heading"><h2>{manifest?.name||item.name||item.fullName}</h2><span className="codlet-version">{manifest?.version??`${t('Release candidate')} ${item.latestRelease?.tag??''}`}</span>{declared&&!item.preparedManifest&&<span className="market-declared-note">{t('Publisher declared')}</span>}</div>{(manifest?.description||item.description)&&<Copy>{manifest?.description||item.description}</Copy>}<div className="market-meta"><Origin item={item}/><Metrics item={item}/></div></div><Action item={item} s={s}/></div>
      <Compatibility metadata={metadata} device={s.deviceCompatibility} status={manager.marketKnownCompatibility(item)} clientStatus={s.clientStatus} declared={!!declared&&!item.preparedManifest}/>
      {declared&&!item.preparedManifest&&<section className="market-detail-section"><h2>{t('Publisher declaration')}</h2><Copy>{`${declared.manifest.name||declared.manifest.id} · ${declared.manifest.id} · ${declared.manifest.version}`}</Copy><PluginTags tags={declared.manifest.tags} show={s.settings?.effective?.showPluginTags!==false}/><Copy>{t('The actual ZIP is checked before installation.')}</Copy></section>}
      {item.preparedManifest&&<section className="market-detail-section"><h2>{t('Verified package')}</h2><Copy>{`${item.preparedManifest.name||item.preparedManifest.id} · ${item.preparedManifest.id} · ${item.preparedManifest.version}`}</Copy><PluginTags tags={item.preparedManifest.tags} show={s.settings?.effective?.showPluginTags!==false}/>{item.preparedManifest.description&&<Copy>{item.preparedManifest.description}</Copy>}</section>}
      <section className="market-detail-section"><h2>{t('Package and source')}</h2><Copy>{`${item.fullName}\n${t('Release')}: ${item.latestRelease?.tag??t('Unknown')}\n${t('ZIP assets')}: ${assets.length}`}</Copy><Copy>{t('The package ID, permissions, dependencies and compatibility are checked before installation.')}</Copy>{!assets.length&&<Copy>{t('No installable ZIP asset was found in the latest release.')}</Copy>}
        {assets.length>1&&<div className="codlet-field"><label htmlFor="market-asset">{t('Choose a ZIP asset')}</label><C.Select id="market-asset" value={s.market.assetId??''} placeholder={t('Choose a ZIP asset')} options={assets.map(asset=>({value:String(asset.id),label:asset.name,description:`${asset.size.toLocaleString()} ${t('bytes')}`}))} onChange={option=>manager.marketSet({assetId:option.value})}/></div>}
      </section>
      {installed?.plugin&&<Copy>{`${t('Installed version')}: ${installed.plugin.version}`}</Copy>}
      <C.TextLink href={item.repositoryUrl} className="market-repo-link" target="_blank" rel="noopener noreferrer">{t('GitHub repository')}<I.ArrowUpRight/></C.TextLink>
    </section>;
  }
  return {Marketplace,MarketplaceDetails,Compatibility};
}
