/* SignalMap V15 — camera-aware 3D visibility and stable GLB rendering.
 * No invented towers: a tower is rendered only for explicit site coordinates.
 * No new engine, no dark UI, no change to the PDF or RF calculations.
 */
(function(root){
  'use strict';
  const MAX_DETAIL=96;
  const QUALITY=Object.freeze({weak:'#ce5747',good:'#dfa537',excellent:'#159769'});
  function validSite(s){return !!s&&Number.isFinite(s.lat)&&Number.isFinite(s.lon)&&Math.abs(s.lat)<=90&&Math.abs(s.lon)<=180;}
  function rsrpClass(v){return !Number.isFinite(v)?null:v < -105?'weak':v < -90?'good':'excellent';}
  function qualityColor(record){if(!record||record.type==='site'||record.type==='public')return null;
    // Documented operators retain their operator colors; do not imply an operator from RSRP.
    if((record.operators||[]).some(o=>o.group&&o.group!=='Unknown'&&o.group!=='Other'))return null;
    const raw=record.rsrp?.mean;const cls=rsrpClass(raw===null||raw===undefined||raw===''?NaN:Number(raw));return cls?QUALITY[cls]:null;
  }
  function sqMeters(a,b){const dy=(a.lat-b.lat)*111195,dx=(a.lon-b.lon)*111195*Math.cos(b.lat*Math.PI/180);return dx*dx+dy*dy;}
  function normalizeLon(x){return ((x+180)%360+360)%360-180;}
  function safeBounds(bounds){
    if(!bounds)return null;
    const west=Number(bounds.west),east=Number(bounds.east),south=Number(bounds.south),north=Number(bounds.north);
    if(![west,east,south,north].every(Number.isFinite)||south>north)return null;
    return {west,east,south,north};
  }
  function inViewport(s,b,pad=.18){
    if(!b)return false;
    const latSpan=Math.max(.00001,b.north-b.south),south=b.south-pad*latSpan,north=b.north+pad*latSpan;
    if(s.lat<south||s.lat>north)return false;
    // MapLibre bounds may cross the antimeridian or use unwrapped longitudes.
    const lonSpan=Math.min(360,((b.east-b.west)%360+360)%360||360);
    if(lonSpan>=359.9)return true;
    const start=normalizeLon(b.west-pad*lonSpan);
    const width=Math.min(360,lonSpan*(1+2*pad));
    const position=(normalizeLon(s.lon)-start+360)%360;
    return position<=width;
  }
  function detailSites(sites,center,selectedKey='',limit=MAX_DETAIL,bounds=null){
    // Keep the inventory unchanged; this only chooses which physical tower GLBs
    // to render with expensive high-detail geometry in the current camera view.
    const all=(sites||[]).filter(validSite),max=Math.max(1,Math.floor(limit));
    if(all.length<=max)return all;
    const focus=validSite(center)?center:all[0],viewport=safeBounds(bounds);
    return all.map((s,i)=>({s,i,d:sqMeters(s,focus),selected:s.key===selectedKey,visible:inViewport(s,viewport)}))
       .sort((a,b)=>Number(b.selected)-Number(a.selected)||Number(b.visible)-Number(a.visible)||a.d-b.d||a.i-b.i)
       .slice(0,max).map(v=>v.s);
  }
  function viewportOf(map){
    try{const b=map?.getBounds?.();if(!b)return null;
      const west=b.getWest?.()??b.west,east=b.getEast?.()??b.east;
      const south=b.getSouth?.()??b.south,north=b.getNorth?.()??b.north;
      return safeBounds({west,east,south,north});
    }catch(_){return null;}
  }
  function cameraMoveThresholdMeters(zoom){
    // At close zoom 700 m is far larger than the visible viewport. Rebuild
    // the *selection* sooner, but never on every pointermove/render frame.
    return Math.max(18,Math.min(700,80000/Math.pow(2,Math.max(0,zoom-8))));
  }
  function decorateGeoJSON(data,byKey){if(!data||data.type!=='FeatureCollection'||!Array.isArray(data.features))return data;
    let change=false;const features=data.features.map(f=>{const color=qualityColor(byKey.get(f?.properties?.key));if(!color||f.properties.color===color)return f;change=true;return {...f,properties:{...f.properties,color}};});
    return change?{...data,features}:data;
  }
  function observedHeadline(g){
    if(!g||g.type==='site'||g.type==='public')return null;
    const group=(g.operators||[]).map(o=>o.group).find(v=>v&&v!=='Unknown'&&v!=='Other');
    if(group)return null;
    const id=String(g.cellId||g.siteId||g.pci?.join('/')||'unidentified').slice(0,60);
    const mean=g.rsrp?.mean;
    const rsrp=Number.isFinite(mean)?`Avg RSRP ${mean.toFixed(1)} dBm` : 'RSRP not available';
    return {title:`Cell ${id}`,subtitle:rsrp+' · not tower GPS'};
  }
  const core={MAX_DETAIL,QUALITY,validSite,rsrpClass,qualityColor,sqMeters,normalizeLon,safeBounds,inViewport,detailSites,viewportOf,cameraMoveThresholdMeters,decorateGeoJSON,observedHeadline};
  root.SignalMap3DV15Core=core;
  if(typeof document==='undefined'||!root.setInterval)return;
  let layer=null,map=null,cleanups=[],lastCenter=null,lastZoom=null,lastSelected=null;
  let coloredSources=new WeakSet();let mapEnhanced=new WeakSet();let styleObserved=new WeakSet();let lastRaw=null,lastDataSignature='',lastLODStatus='';
  function attrStatus(msg){const feedback=document.getElementById('sm3dFeedback');if(feedback&&feedback.textContent!==msg)feedback.textContent=msg;}
  function spatialCenter(m){try{const p=m?.getCenter?.();return validSite({lat:p.lat,lon:p.lng})?{lat:p.lat,lon:p.lng}:null;}catch(_){return null;}}
  function setQualityStyle(m){if(!m||mapEnhanced.has(m))return;
    // Some map styles intentionally omit filled polygons. A missing optional
    // layer must not prevent styling the visible observation circles.
    const props=[
      ['network-derived-markers','circle-radius',['interpolate',['linear'],['zoom'],7,7,11,10,15,13]],
      ['network-derived-markers','circle-stroke-width',3.5],
      ['network-derived-area','fill-opacity',.19],
      ['network-derived-outline','line-width',2.6]
    ];
    try{
      if(!m.getLayer?.('network-derived-markers'))return;
      for(const [layer,property,value] of props){if(m.getLayer?.(layer))m.setPaintProperty(layer,property,value);}
      mapEnhanced.add(m);
    }catch(err){console.warn('SignalMap 3D V15 style:',err.message);}
  }
  function patchSource(m,name,records){const source=m?.getSource?.(name);if(!source||coloredSources.has(source)||typeof source.setData!=='function')return false;
    const old=source.setData.bind(source);source.setData=function(data,...other){return old(decorateGeoJSON(data,new Map((root.SignalMapNetwork?.entities||[]).map(g=>[g.key,g]))),...other);};
    coloredSources.add(source);return true;
  }
  function patchMap(m){if(!m)return;
    if(!styleObserved.has(m)&&typeof m.on==='function'){
      styleObserved.add(m);
      m.on('style.load',()=>{mapEnhanced.delete(m);root.setTimeout?.(()=>patchMap(m),50);});
    }
    let fresh=false;for(const name of ['network-derived-data','network-derived-centers'])fresh=patchSource(m,name)||fresh;
    setQualityStyle(m);
    if(fresh)try{root.SignalMapCellSites?.refresh3D?.();}catch(e){console.warn('V15 observed RSRP refresh:',e.message);}
  }
  function unbind(){for(const fn of cleanups)try{fn();}catch(_){}cleanups=[];layer=null;map=null;lastCenter=null;lastZoom=null;}
  function attachTower(next){if(!next||!next.map||next===layer)return;
    unbind();layer=next;map=next.map;
    const original=next.getSites.bind(next);
    let cached=null,cachedSignature='';
    next.getSites=function(){
      const list=original();if(list.length<=MAX_DETAIL)return list;
      const selected=root.SignalMapNetwork?.activeKey||'';
      const focus=spatialCenter(this.map);
      const bounds=viewportOf(this.map);
      const signature=[list.map(s=>s.key+':'+s.lat+':'+s.lon).join('|'),focus?.lat?.toFixed(5),focus?.lon?.toFixed(5),selected,bounds?.west?.toFixed(5),bounds?.east?.toFixed(5),bounds?.south?.toFixed(5),bounds?.north?.toFixed(5)].join('|');
      if(signature!==cachedSignature||!cached){cached=detailSites(list,focus,selected,MAX_DETAIL,bounds);cachedSignature=signature;}
      return cached;
    };
    const onMove=()=>{if(!layer||layer!==next)return;const all=original();if(all.length<=MAX_DETAIL)return;
      const center=spatialCenter(map),zoom=map.getZoom?.();if(!center)return;
      const threshold=cameraMoveThresholdMeters(zoom||12);
      const moved=!lastCenter||sqMeters(center,lastCenter)>threshold*threshold||Math.abs((zoom||0)-(lastZoom||0))>.25;
      if(moved){lastCenter=center;lastZoom=zoom;cached=null;next.dirty=true;map.triggerRepaint?.();}
    };
    map.on?.('moveend',onMove);
    map.on?.('zoomend',onMove);
    cleanups.push(()=>{map?.off?.('moveend',onMove);map?.off?.('zoomend',onMove);next.getSites=original;});
    next.__smV15DetailLimit=MAX_DETAIL;
    // Consistent output colors for the supplied GLB PBR materials, without replacing them.
    try{if(next.renderer&&'outputColorSpace'in next.renderer)next.renderer.outputColorSpace='srgb';}catch(_){}
    onMove();
  }
  function relabelObserved(net){
    if(!net)return;
    const records=new Map((net.inventory||[]).map(g=>[g.key,g]));
    const byCellId=new Map((net.inventory||[]).filter(g=>g.cellId).map(g=>[String(g.cellId),g]));
    // Existing MapLibre labels have data-key, unlike anonymous measurement dots.
    // Edit textContent only; never render untrusted CSV strings as HTML.
    for(const node of document.querySelectorAll('.network-observed-label[data-key]')){
      const record=records.get(node.dataset.key),info=observedHeadline(record);
      if(!info||node.networkKeys?.length>1)continue;
      const bold=node.querySelector('b'),sub=node.querySelector('span');
      if(bold&&bold.textContent!==info.title)bold.textContent=info.title;
      if(sub&&sub.textContent!==info.subtitle)sub.textContent=info.subtitle;
      const c=qualityColor(record);if(c)node.style.borderColor=c;
    }
    // Same evidence labels are visible on the original 2D map too.
    for(const node of document.querySelectorAll('.network-map-label.cells')){
      const sub=node.querySelector('span'),bold=node.querySelector('b');
      if(!sub||!bold||/observed groups/i.test(sub.textContent))continue;
      const name=sub.textContent||'';
      const cellId=/^Observed cell (.+)$/i.exec(name.trim())?.[1];
      const rec=cellId?byCellId.get(cellId):null;
      const info=observedHeadline(rec);if(!info)continue;
      if(bold.textContent!==info.title)bold.textContent=info.title;
      const c=qualityColor(rec);if(c)node.style.borderColor=c;
    }
  }
  function tick(){
    const net=root.SignalMapNetwork,m=net?.map||root.SignalMapRealTerrain3D?.map||null,t=net?.tower||null;
    if(t&&t!==layer)attachTower(t);else if(layer&&!t)unbind();
    patchMap(m);
    if(!net)return;
    // Improve the ORIGINAL Leaflet view too; all observations remain distinct
    // from real site positions and verified operator colors are untouched.
    const twoD=net.mainView;
    if(twoD?.options&&!twoD.options.__smV14Quality){
      const original=twoD.options.color;
      twoD.options.color=g=>qualityColor(g)||original(g);
      twoD.options.__smV14Quality=true;
      try{net.refresh?.();}catch(e){console.warn('V14 2D quality rendering:',e.message);}
    }
    relabelObserved(net);
    const raw=net.raw||[],entities=net.inventory||[],physical=entities.filter(g=>g.type==='site'&&validSite(g)),observed=entities.filter(g=>g.type!=='site'&&g.type!=='public'&&g.observation);
    const sig=[physical.length,observed.length,net.activeKey].join('|');if(raw!==lastRaw||sig!==lastDataSignature){lastRaw=raw;lastDataSignature=sig;
      if(raw.length&&!physical.length&&observed.length)attrStatus(`${observed.length} observed cell groups from CSV; 0 tower GPS. 3D shows measurements, not fabricated towers. Import real tower/site GPS to render radio tower models.`);
    }
    if(layer){const sel=net.activeKey;if(sel!==lastSelected){lastSelected=sel;layer.dirty=true;layer.map?.triggerRepaint?.();}}
    if(layer&&physical.length>MAX_DETAIL&&layer.asset){
      const rendered=layer.sites?.length||0,summary=`${rendered} detailed GLB instances near the current 3D camera (budget ${MAX_DETAIL}). All ${physical.length} CSV tower GPS points remain on the map.`;
      if(summary!==lastLODStatus){lastLODStatus=summary;attrStatus(summary);}
    }
  }
  // Hook the existing MapLibre lifecycle immediately: the cap must be
  // active BEFORE GLB loading completes, not one second after first draw.
  const cellSites=root.SignalMapCellSites;
  if(typeof cellSites?.install3DLayers==='function'&&!cellSites.install3DLayers.__smV14){
    const originalInstall=cellSites.install3DLayers;
    const install=function(...args){const result=originalInstall.apply(this,args);
      const current=root.SignalMapNetwork?.tower;
      if(current)attachTower(current);
      patchMap(root.SignalMapNetwork?.map||null);
      return result;
    };
    install.__smV14=true;
    cellSites.install3DLayers=install;
  }
  const timer=root.setInterval(tick,1000);tick();root.addEventListener?.('beforeunload',()=>{root.clearInterval(timer);unbind();},{once:true});
})(typeof window!=='undefined'?window:globalThis);
