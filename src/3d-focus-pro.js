/* SignalMap 3D Focus Pro — independent, local-first enhancement.
   Does not modify radio engineering calculations or the original PDF pipeline. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const network=window.SignalMapNetwork;
const stage=$('smrealSection');
const aside=stage?.querySelector('.smreal-panel');
if(!network||!stage||!aside)return;
const panel=document.createElement('section');
panel.id='sm3dFocusPanel';panel.className='sm3d-focus-panel smreal-wide';
panel.setAttribute('aria-label','3D engineering scene control');
panel.innerHTML=`<div class="sm3d-title"><strong>3D SCENE CONTROL</strong><span>Local · verified source status</span></div>
<div class="sm3d-metrics" role="status" aria-live="polite"><div><b id="sm3dSites">0</b><small>CSV tower GPS</small></div><div><b id="sm3dObjects">—</b><small>3D GLB instances</small></div><div><b id="sm3dElevated">—</b><small>DEM-aligned models</small></div></div>
<p class="sm3d-state" id="sm3dState">Load the real 3D scene to inspect the supplied radio tower model.</p>
<div class="sm3d-tools"><button type="button" id="sm3dFitSites">Fit CSV towers</button><button type="button" id="sm3dFocusSite">Focus selected</button><button type="button" id="sm3dTop">Top view</button><button type="button" id="sm3dOblique">Oblique view</button><button type="button" id="sm3dFullscreen">Full-screen 3D</button></div>
<label class="sm3d-scale-label">Tower model visibility <output id="sm3dScaleOut">1× · physical height</output><input id="sm3dScale" type="range" min="1" max="5" step="1" value="1"></label>
<p class="sm3d-note">1× uses the site height provided by CSV, or an illustrative 30 m when missing. Higher multipliers enlarge only the rendered 3D model, not tower GPS, radio calculations or DEM elevations.</p>
<div class="sm3d-tools"><button type="button" id="sm3dSaveCamera">Save camera locally</button><button type="button" id="sm3dRestoreCamera">Restore camera</button><button type="button" id="sm3dRetryScene">Load / retry 3D</button></div>
<p class="sm3d-feedback" role="status" id="sm3dFeedback">Site positions are source-supplied, not independently surveyed. Derived CSV cell observations are not physical towers.</p>`;
const orig=aside.querySelector('.network-3d-tools');
if(orig)orig.insertAdjacentElement('afterend',panel);else aside.prepend(panel);
const scaleInput=$('sm3dScale'),out=$('sm3dScaleOut'),feedback=$('sm3dFeedback');
const tell=s=>{feedback.textContent=s;};
let activeLayer=null, lastSelection='', clock=null, lastVisualScale=null;
const storage={get(){try{return localStorage.getItem('SignalMap.3D.Camera.v1');}catch(_){return null;}},set(data){try{localStorage.setItem('SignalMap.3D.Camera.v1',data);return true;}catch(_){return false;}}};
function map(){return window.SignalMapNetwork?.map||window.SignalMapRealTerrain3D?.map||null;}
function tower(){return window.SignalMapNetwork?.tower||null;}
function valid(g){return g&&Number.isFinite(g.lat)&&Number.isFinite(g.lon)&&Math.abs(g.lat)<=90&&Math.abs(g.lon)<=180;}
function sites(){return (network.entities||[]).filter(g=>g.type==='site'&&valid(g));}
function chosen(){return (network.inventory||[]).find(g=>g.key===network.activeKey)||null;}
function coordinate(g){return valid(g)?[g.lon,g.lat]:g?.observation&&valid(g.observation)?[g.observation.lon,g.observation.lat]:null;}
function labelScale(){return Number(scaleInput.value)||1;}
// Physical 1x is restored for close inspection. At regional zoom levels a
// 30-m tower occupies fewer than ~2 pixels; scale only the visual mesh to
// maintain recognizability. Geographic anchors and RF computations stay put.
function clarityFactor(zoom){
 if(!Number.isFinite(zoom))return 1;
 return Math.max(1,Math.min(7,Math.pow(2,(15.6-zoom)*0.65)));
}
function effectiveScale(){return Math.min(8,labelScale()*clarityFactor(map()?.getZoom?.()));}
function describeScale(){
 const auto=clarityFactor(map()?.getZoom?.());
 return labelScale()+'× manual'+(auto>1.05?' · '+auto.toFixed(1)+'× distance visibility (VISUAL ONLY)':' · 1× at close zoom');
}
function applyScale(layer){const mult=effectiveScale();if(!layer?.instances?.length||Math.abs(mult-1)<.00001)return;
 // Every instance's transform columns are uniformly multiplied about its BASE.
 // Translation remains unchanged; the geographic site anchor is not displaced.
 for(const mesh of layer.instances){const arr=mesh.instanceMatrix.array;
  for(let i=0;i<mesh.count;i++){const base=i*16;for(const j of [0,1,2,4,5,6,8,9,10])arr[base+j]*=mult;}
  mesh.instanceMatrix.needsUpdate=true;
 }
 for(const p of layer.positions||[])p.height*=mult;
}
function geometrySignature(entries){return entries.map(s=>[s.key,s.lat,s.lon,Array.isArray(s.height)?s.height.join(','):s.height,(s.operators||[]).map(o=>o.group).join('/')].join(':')).join('|');}
function enhanceTower(layer){if(!layer||layer===activeLayer)return;activeLayer=layer;
 const rawRebuild=layer.rebuild.bind(layer);
 const rawUpdate=layer.updateMatrices.bind(layer);
 layer.__sm3dSig=null;layer.__sm3dBuilds=0;layer.__sm3dReuses=0;
 layer.updateMatrices=function(...args){const result=rawUpdate(...args);applyScale(this);return result;};
 layer.rebuild=function(...args){if(!this.asset)return;
   const incoming=this.getSites();const sig=geometrySignature(incoming);
   // Reuse the INSTANCED WebGL model for layer/filter redraws that do not change site geometry.
   if(this.__sm3dSig===sig&&this.instances?.length&&this.sites?.length===incoming.length){
     this.sites=incoming;this.dirty=false;this.__sm3dReuses++;
     if(this.terrainDirty)this.updateMatrices();
     return;
   }
   const result=rawRebuild(...args);
   this.__sm3dSig=sig;this.__sm3dBuilds++;
   return result;
 };
 tell('GLB tower layer connected. Instanced models reuse geometry across filter redraws.');
}
function forceModelUpdate(){const layer=tower(),m=map();if(layer?.asset){lastVisualScale=effectiveScale();layer.updateMatrices();m?.triggerRepaint?.();tell('3D model visual scale: '+describeScale()+'. RF model and GPS are unchanged.');}else tell('Load 3D with site GPS from CSV or mapped public telecom structures to see tower models.');}
function refresh(){if(document.hidden)return;const m=map(),layer=tower(),items=sites();
 // Rebuild matrices only after a meaningful zoom-dependent visual-scale change.
 // No per-frame geometric recalculation or cumulative transform multipliers.
 if(layer?.asset&&m&&!m.isMoving?.()){
  const scale=effectiveScale();
  if(lastVisualScale===null||Math.abs(lastVisualScale-scale)>.08){
   lastVisualScale=scale;
   if(layer.instances?.length){layer.updateMatrices();m.triggerRepaint?.();}
  }
 }
 out.textContent=describeScale();
 if(layer&&layer!==activeLayer){lastVisualScale=null;enhanceTower(layer);}
 $('sm3dSites').textContent=items.length.toLocaleString();
 const ready=Boolean(m&&layer?.asset),drawn=ready?(layer.instances?.[0]?.count||0):0;
 $('sm3dObjects').textContent=ready?drawn.toLocaleString():layer?'Loading':'—';
 $('sm3dElevated').textContent=ready?String(layer.elevated||0):'—';
 let terrain='DEM not yet verified';
 try{const t=m?.getTerrain?.();const src=t?.source;const srcReady=Boolean(src&&m?.isSourceLoaded?.(src));const e=srcReady?m.queryTerrainElevation(m.getCenter(),{exaggerated:false}):null;
   terrain=srcReady&&Number.isFinite(e)?'Real DEM available near camera':'DEM pending / unavailable at camera';
 }catch(_){}
 const publicCount=window.SignalMap3DPublicModels?.count||0;
 const model=ready?drawn+' GLB tower model(s) ready · '+items.length+' CSV site(s) + '+publicCount+' publicly mapped telecom structure(s)':!items.length?'No tower GPS in CSV (public tower layer can still be loaded)':layer?'Loading radio tower GLB':'3D engine not started';
 $('sm3dState').textContent=model+' · '+terrain+(items.length?' · '+items.filter(s=>s.height?.length===1).length+' height(s) from CSV; others illustrative 30 m':'');
 const selected=chosen();const k=selected?.key||'';
 if(k!==lastSelection){lastSelection=k;for(const el of stage.querySelectorAll('.network-tower-label'))el.classList.toggle('sm3d-selected',el.dataset.key===k);}
 const on=Boolean(m);for(const id of ['sm3dFitSites','sm3dTop','sm3dOblique','sm3dSaveCamera'])$(id).disabled=!on;
 $('sm3dFocusSite').disabled=!on||!coordinate(selected);
 $('sm3dRestoreCamera').disabled=!on||!storage.get();
}
function fitSites(){const m=map(),list=sites();if(!m){tell('Load real 3D first.');return;}if(!list.length){tell('No CSV tower GPS. Import a separate site inventory with site_lat/site_lon.');return;}
 const lon=list.map(s=>s.lon),lat=list.map(s=>s.lat);m.fitBounds([[Math.min(...lon),Math.min(...lat)],[Math.max(...lon),Math.max(...lat)]],{padding:75,maxZoom:list.length===1?16:15,duration:850,pitch:58});tell('Framed '+list.length+' CSV site(s), not measurement centroids.');}
function focusSelected(){const m=map(),sel=chosen(),ll=coordinate(sel);if(!m||!ll){tell('Select a site or cell first in Antenna Inventory.');return;}
 m.flyTo({center:ll,zoom:18.1,pitch:73,bearing:m.getBearing(),duration:850});
 tell(sel.type==='site'?'Focused physical CSV tower coordinates.':'Focused measurement-derived / public position; no tower GPS invented.');}
function camera(pitch,bearing){const m=map();if(m)m.easeTo({pitch,bearing,zoom:Math.max(11,m.getZoom()),duration:800});else tell('Load real 3D first.');}
function fullscreen(force){const active=force!==undefined?force:!document.body.classList.contains('sm3d-immersive');document.body.classList.toggle('sm3d-immersive',active);$('sm3dFullscreen').textContent=active?'Exit full-screen 3D':'Full-screen 3D';
 requestAnimationFrame(()=>{map()?.resize?.();setTimeout(()=>map()?.resize?.(),180);});tell(active?'Focused 3D mode enabled. Press Escape to exit.':'Returned to original SignalMap layout.');}
function saveCamera(){const m=map();if(!m)return;const c=m.getCenter();const info={lon:c.lng,lat:c.lat,zoom:m.getZoom(),pitch:m.getPitch(),bearing:m.getBearing()};
 const ok=storage.set(JSON.stringify(info));tell(ok?'Camera saved in this browser only.':'Browser storage blocked; camera could not be saved.');refresh();}
function restoreCamera(){const m=map();if(!m)return;try{const v=JSON.parse(storage.get()||'null');if(!v||![v.lon,v.lat,v.zoom,v.pitch,v.bearing].every(Number.isFinite))throw Error('No valid saved camera');m.flyTo({center:[v.lon,v.lat],zoom:v.zoom,pitch:v.pitch,bearing:v.bearing,duration:800});tell('Restored saved camera position.');}catch(e){tell('Camera restore: '+e.message);}}
$('sm3dFitSites').addEventListener('click',fitSites);
$('sm3dFocusSite').addEventListener('click',focusSelected);
$('sm3dTop').addEventListener('click',()=>camera(0,0));
$('sm3dOblique').addEventListener('click',()=>camera(65,-32));
$('sm3dFullscreen').addEventListener('click',()=>fullscreen());
$('sm3dSaveCamera').addEventListener('click',saveCamera);
$('sm3dRestoreCamera').addEventListener('click',restoreCamera);
$('sm3dRetryScene').addEventListener('click',()=>{const start=$('smrealStart');if(!map()&&start){start.click();tell('Loading real 3D engine…');}else if(map()){map().resize();map().triggerRepaint();tell('3D scene refreshed.');}else tell('3D loader is unavailable.');});
scaleInput.addEventListener('input',()=>{out.textContent=describeScale();forceModelUpdate();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('sm3d-immersive'))fullscreen(false);});
// Small 3D telemetry check is intentionally detached from the render loop.
clock=setInterval(refresh,450);refresh();
window.SignalMap3DFocus={refresh,enhanceTower,fitSites,focusSelected,fullscreen,forceModelUpdate,get state(){return {sites:sites().length,drawn:tower()?.instances?.[0]?.count||0,scale:labelScale(),builds:tower()?.__sm3dBuilds||0,reuses:tower()?.__sm3dReuses||0,fullscreen:document.body.classList.contains('sm3d-immersive')};}};
})();
