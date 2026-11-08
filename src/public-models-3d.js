/* SignalMap 3D reliability patch: publicly mapped physical towers use the same
 * supplied GLB asset as CSV sites. No fabricated operator, coordinate or height.
 * MapLibre's source-attributed symbols remain the fallback for objects without
 * a known tower/mast structure or when WebGL/GLB is unavailable.
 */
(function(){
'use strict';
const EXPECTED_KINDS=new Set(['mast','tower','communications_tower']);
function isStructure(g){
 const kind=String(g?.publicData?.kind||'').toLowerCase();
 return g?.type==='public' && ['mobile','telecom'].includes(g.publicData?.level) && EXPECTED_KINDS.has(kind) &&
  Number.isFinite(g.lat)&&Number.isFinite(g.lon)&&Math.abs(g.lat)<=90&&Math.abs(g.lon)<=180;
}
function mergeSites(sites,entities,showPublic){
 const result=sites.slice(),used=new Set(result.map(x=>x.key));
 if(showPublic)for(const g of entities){
  if(!isStructure(g)||used.has(g.key))continue;
  result.push(g);used.add(g.key);
 }
 return result;
}
let patched=null,lastSignature='',cachedPublic=[],lastReport='';
let cameraLayer=null,userTouched=false,firstFrameDone=false,attachedMap=null;
let lastLabelDraw=0;
function alignPublicLabels(){
 const now=performance.now();if(now-lastLabelDraw<45)return;lastLabelDraw=now;
 const layer=patched;if(!layer?.positions?.length||!layer.screenPoint||!cachedPublic.length)return;
 const location=new Map(layer.positions.filter(p=>p.site?.type==='public').map(p=>[p.site.key,p]));
 if(!location.size)return;
 for(const label of document.querySelectorAll('.network-tower-label.network-public-label')){
  const p=location.get(label.dataset.key);if(!p)continue;
  const screen=layer.screenPoint(p.translation,p.height+3);
  if(!screen||!Number.isFinite(screen.x)||!Number.isFinite(screen.y))continue;
  const left=screen.x-(label.offsetWidth||180)/2,top=screen.y-(label.offsetHeight||52)-12;
  if(!Number.isFinite(left)||!Number.isFinite(top))continue;
  label.style.left=left.toFixed(1)+'px';label.style.top=top.toFixed(1)+'px';
 }
}

function approximateKm(a,b){
 const r=Math.PI/180,dlat=(a.lat-b.lat)*r,dlon=(a.lon-b.lon)*r;
 const v=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(v)));
}
function frameVisibleSites(layer){
 const map=layer?.map;
 if(firstFrameDone||userTouched||!layer?.asset||!map?.getStyle?.()||!map?.isStyleLoaded?.())return;
 const sites=layer.getSites().filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon));
 if(!sites.length)return;
 // Frame a useful local group at a level where GLB silhouettes can actually
 // be inspected, instead of zooming to an entire province and hiding models.
 const first=sites[0],range=sites.slice(0,2000).reduce((max,s)=>Math.max(max,approximateKm(first,s)),0);
 try{
  // Opening at province-wide zoom makes the true-scale tower just a few
  // pixels wide. Inspect one *real documented GPS site* close-up first; the
  // existing Fit Network button still shows the entire inventory on demand.
  if(sites.length>1&&range<0.45){
   const xs=sites.map(s=>s.lon),ys=sites.map(s=>s.lat);
   map.fitBounds([[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)]],{padding:110,maxZoom:18.35,duration:900,pitch:67});
  }else{
   map.flyTo({center:[first.lon,first.lat],zoom:18.35,pitch:73,bearing:-28,duration:950});
  }
  firstFrameDone=true;
 }catch(_){/* camera remains user controlled when map API is unavailable */}
}

function tick(){
 const network=window.SignalMapNetwork,layer=network?.tower;
 if(!layer)return;
 if(layer!==patched){
  patched=layer;lastSignature='';cachedPublic=[];
  cameraLayer=layer;userTouched=false;firstFrameDone=false;
  const map=layer.map;
  if(map&&map!==attachedMap){
   if(attachedMap)attachedMap.off?.('render',alignPublicLabels);
   attachedMap=map;map.on?.('render',alignPublicLabels);
  }
  const el=map?.getCanvas?.();
  if(el&&!el.__sm3dTouchListener){
   const touched=()=>{userTouched=true;};
   el.addEventListener('pointerdown',touched,{passive:true});
   el.addEventListener('wheel',touched,{passive:true});
   el.__sm3dTouchListener=true;
  }

  const original=layer.getSites.bind(layer);
  layer.getSites=function(){return mergeSites(original(),cachedPublic,true);};
  layer.__sm3dPublicModelPatch=true;
 }
 const enabled=!!(document.getElementById('network3D')?.checked&&document.getElementById('networkMainPublic')?.checked&&document.getElementById('smosmShow3D')?.checked);
 const entities=enabled?(network.entities||[]):[];
 const publicSites=entities.filter(isStructure);
 const signature=(enabled?'1:':'0:')+publicSites.map(g=>[g.key,g.lat,g.lon,g.height?.[0],g.operators?.[0]?.group].join('/')).join('|');
 if(signature!==lastSignature){
  lastSignature=signature;cachedPublic=publicSites;layer.dirty=true;
  layer.map?.triggerRepaint?.();
 }
 const stamp=layer.asset?'ready':'loading';
 if(stamp!==lastReport){lastReport=stamp;}
 frameVisibleSites(layer);
}
const interval=setInterval(tick,800);
window.addEventListener('beforeunload',()=>{clearInterval(interval);attachedMap?.off?.('render',alignPublicLabels);},{once:true});
window.SignalMap3DPublicModels={isStructure,mergeSites,approximateKm,tick,get count(){return cachedPublic.length;}};
tick();
})();
