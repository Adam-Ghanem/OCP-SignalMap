/* SignalMap V14 — trustworthy 3D visibility & scalable GLB rendering.
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
  function detailSites(sites,center,selectedKey='',limit=MAX_DETAIL){
    const all=(sites||[]).filter(validSite),max=Math.max(1,Math.floor(limit));if(all.length<=max)return all;
    const focus=validSite(center)?center:all[0];
    return all.map((s,i)=>({s,i,d:sqMeters(s,focus),selected:s.key===selectedKey}))
       .sort((a,b)=>Number(b.selected)-Number(a.selected)||a.d-b.d||a.i-b.i)
       .slice(0,max).map(v=>v.s);
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
  const core={MAX_DETAIL,QUALITY,validSite,rsrpClass,qualityColor,sqMeters,detailSites,decorateGeoJSON,observedHeadline};
  root.SignalMap3DV14Core=core;
  if(typeof document==='undefined'||!root.setInterval)return;
  let layer=null,map=null,cleanups=[],lastCenter=null,lastZoom=null,lastSelected=null;
  let coloredSources=new WeakSet();let mapEnhanced=new WeakSet();let styleObserved=new WeakSet();let lastRaw=null,lastDataSignature='',lastLODStatus='';
  function attrStatus(msg){const feedback=document.getElementById('sm3dFeedback');if(feedback&&feedback.textContent!==msg)feedback.textContent=msg;}
  function spatialCenter(m){try{const p=m?.getCenter?.();return validSite({lat:p.lat,lon:p.lng})?{lat:p.lat,lon:p.lng}:null;}catch(_){return null;}}
  function setQualityStyle(m){if(!m||mapEnhanced.has(m))return;
    try{if(!m.getLayer?.('network-derived-markers'))return;
      m.setPaintProperty('network-derived-markers','circle-radius',['interpolate',['linear'],['zoom'],7,7,11,10,15,13]);
      m.setPaintProperty('network-derived-markers','circle-stroke-width',3.5);
      m.setPaintProperty('network-derived-area','fill-opacity',.19);
      m.setPaintProperty('network-derived-outline','line-width',2.6);
      mapEnhanced.add(m);
    }catch(err){console.warn('SignalMap 3D V14 style:',err.message);}
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
    if(fresh)try{root.SignalMapCellSites?.refresh3D?.();}catch(e){console.warn('V14 observed RSRP refresh:',e.message);}
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
      const signature=[list.map(s=>s.key+':'+s.lat+':'+s.lon).join('|'),focus?.lat?.toFixed(3),focus?.lon?.toFixed(3),selected].join('|');
      if(signature!==cachedSignature||!cached){cached=detailSites(list,focus,selected,MAX_DETAIL);cachedSignature=signature;}
      return cached;
    };
    const onMove=()=>{if(!layer||layer!==next)return;const all=original();if(all.length<=MAX_DETAIL)return;
      const center=spatialCenter(map),zoom=map.getZoom?.();if(!center)return;
      const moved=!lastCenter||sqMeters(center,lastCenter)>700*700||Math.abs((zoom||0)-(lastZoom||0))>.9;
      if(moved){lastCenter=center;lastZoom=zoom;cached=null;next.dirty=true;map.triggerRepaint?.();}
    };
    map.on?.('moveend',onMove);
    cleanups.push(()=>{map?.off?.('moveend',onMove);next.getSites=original;});
    next.__smV14DetailLimit=MAX_DETAIL;
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
      const rendered=layer.sites?.length||0,summary=`${rendered}/${physical.length} detailed 3D GLB models near the camera. All ${physical.length} tower GPS points remain on the map.`;
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
