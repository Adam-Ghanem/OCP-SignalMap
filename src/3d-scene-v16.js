/* SignalMap V16 — 3D quality & evidence-aware observation labels.
 * Preserves the original RF model, CSV data, tower GPS, MapLibre layer and PDF.
 * An observed cell has a MEASUREMENT anchor, NEVER a new physical tower.
 */
(function(root){
'use strict';
const VERSION='16.0';
const MAX_OBS_LABELS=40;
const $=id=>root.document?.getElementById(id);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const valid=(p)=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
function normalizeParts(asset){
 if(!asset||asset.__smv16Normalized)return false;
 const b=asset.bounds,min=b?.min,max=b?.max;
 if(!min||!max||!asset.parts?.length)return false;
 const height=max.y-min.y;
 if(!Number.isFinite(height)||height<.001||height>100000)return false;
 const cx=(min.x+max.x)/2,cz=(min.z+max.z)/2,inv=1/height;
 // Apply the same affine transform to every geometry without changing any GPS.
 // Actual model height becomes 1, base Y becomes 0, horizontal pivot is centered.
 const matrices=[];
 for(const part of asset.parts){
  // GLTFLoader supplies BufferGeometry.translate/scale, so no dependency
  // on Three.js internals or a second GL context is introduced.
  if(typeof part.geometry?.scale!=='function'||typeof part.geometry?.translate!=='function')return false;
  matrices.push(part.geometry);
 }
 for(const geometry of matrices){geometry.translate(-cx,-min.y,-cz);geometry.scale(inv,inv,inv);geometry.computeBoundingSphere?.();geometry.computeBoundingBox?.();}
 const old={minX:min.x,maxX:max.x,minY:min.y,maxY:max.y,minZ:min.z,maxZ:max.z};
 min.x=(old.minX-cx)*inv;max.x=(old.maxX-cx)*inv;
 min.y=0;max.y=1;
 min.z=(old.minZ-cz)*inv;max.z=(old.maxZ-cz)*inv;
 asset.__smv16Normalized=true;
 asset.__smv16OriginalHeight=height;
 return true;
}
function clusterAnchors(items,dist=115){
 const groups=[];
 for(const item of items){let best=null,score=Infinity;
  for(const g of groups){const dx=item.x-g.cx,dy=item.y-g.cy,d=dx*dx+dy*dy;if(d<dist*dist&&d<score){best=g;score=d;}}
  if(!best){best={items:[],cx:item.x,cy:item.y};groups.push(best);}
  best.items.push(item);best.cx=best.items.reduce((a,p)=>a+p.x,0)/best.items.length;
  best.cy=best.items.reduce((a,p)=>a+p.y,0)/best.items.length;
 }
 return groups;
}
function layout(items,width,height){
 const clusters=clusterAnchors(items);const results=[];
 for(const g of clusters){
  const sorted=g.items.slice().sort((a,b)=>a.key.localeCompare(b.key));
  if(sorted.length===1){const p=sorted[0];results.push({...p,lx:clamp(p.x,80,width-80),ly:clamp(p.y-62,10,height-46)});continue;}
  // Fan out *screen labels* only. The leader line ends at the actual observed
  // measurement centroid; we do not move any geographic data or place towers.
  const rows=Math.ceil(sorted.length/2),side=g.cx>width*.55?-1:1;
  for(let i=0;i<sorted.length;i++){
   const col=Math.floor(i/rows),row=i%rows;
   const desiredX=g.cx+side*(110+col*167);
   const desiredY=g.cy+(row-(rows-1)/2)*53;
   const p=sorted[i];results.push({...p,lx:clamp(desiredX,80,width-80),ly:clamp(desiredY,12,height-44)});
  }
 }
 // Resolve collisions across neighboring groups without shifting any geographic
 // anchors. Only the floating callout position changes on the screen.
 const placed=[];const boxWidth=148,boxHeight=46;
 for(const p of results){
  const originalX=p.lx,originalY=p.ly;
  const candidates=[[0,0],[0,52],[0,-52],[0,104],[0,-104],[167,0],[-167,0],[167,52],[-167,52],[0,156],[0,-156]];
  for(const [dx,dy] of candidates){
   const x=clamp(originalX+dx,80,width-80),y=clamp(originalY+dy,12,height-44);
   const box={left:x-boxWidth/2,right:x+boxWidth/2,top:y,bottom:y+boxHeight};
   const overlap=placed.some(b=>box.left<b.right+5&&box.right+5>b.left&&box.top<b.bottom+5&&box.bottom+5>b.top);
   if(!overlap){p.lx=x;p.ly=y;placed.push(box);break;}
  }
 }
 return results;
}
const core={VERSION,MAX_OBS_LABELS,normalizeParts,clusterAnchors,layout,valid};
root.SignalMap3DSceneV16Core=core;
if(!root.document||!root.setInterval)return;
let layerRef=null,assetRef=null,mapRef=null,rendererHost=null,leaders=null;
const nodes=new Map();let lastTick=0;
function isOn(){
 const net=root.SignalMapNetwork;
 return !!(net?.map&&$('network3D')?.checked&&$('network3DCells')?.checked&&$('network3DLabels')?.checked&&$('networkMainLabels')?.checked&&$('networkMainCells')?.checked&&$('networkLabels')?.checked);
}
function readyLayer(){const net=root.SignalMapNetwork,l=net?.tower;
 if(!l||!l.asset||!l.map)return;
 if(l.asset!==assetRef){
  assetRef=l.asset;
  const changed=normalizeParts(assetRef);
  if(changed){l.dirty=true;l.updateMatrices?.();l.map.triggerRepaint?.();}
 }
 if(layerRef!==l){layerRef=l;}
}
function hideOverlay(){root.document.body?.classList.remove('sm-v16-observations-active');for(const node of nodes.values())node.remove();nodes.clear();leaders?.replaceChildren();}
function cleanupMap(){if(mapRef){mapRef.off?.('render',throttled);mapRef=null;}rendererHost?.remove();rendererHost=null;leaders=null;nodes.clear();}
function ensureHost(map){if(mapRef===map&&rendererHost)return;
 cleanupMap();mapRef=map;const parent=map.getContainer?.();if(!parent)return;
 rendererHost=root.document.createElement('div');rendererHost.className='sm-v16-overlay';rendererHost.setAttribute('aria-label','Observed cell measurement labels');
 leaders=root.document.createElementNS('http://www.w3.org/2000/svg','svg');leaders.setAttribute('class','sm-v16-leaders');leaders.setAttribute('aria-hidden','true');
 rendererHost.append(leaders);parent.append(rendererHost);map.on?.('render',throttled);
}
function labelFor(entry){let node=nodes.get(entry.key);if(node)return node;
 node=root.document.createElement('button');node.type='button';node.className='sm-v16-cell';node.dataset.key=entry.key;
 const name=root.document.createElement('strong'),detail=root.document.createElement('span');node.append(name,detail);
 node.addEventListener('click',e=>{e.stopPropagation();const net=root.SignalMapNetwork,g=(net?.entities||[]).find(x=>x.key===entry.key);if(g)net.selectEntity?.(g,'3d');});
 nodes.set(entry.key,node);rendererHost.append(node);return node;
}
function paint(){
 readyLayer();const net=root.SignalMapNetwork,map=net?.map;
 if(!isOn()||!map){hideOverlay();return;}
 ensureHost(map);if(!rendererHost)return;
 const records=(net.entities||[]).filter(g=>g.type!=='site'&&g.type!=='public'&&valid(g.observation));
 if(!records.length){hideOverlay();return;}
 const host=map.getContainer(),width=host.clientWidth,height=host.clientHeight;
 if(width<100||height<100)return;
 const recordsInView=[];
 for(const g of records){let point;try{point=map.project([g.observation.lon,g.observation.lat]);}catch(_){continue;}
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x < -35||point.x>width+35||point.y < -35||point.y>height+35)continue;
  recordsInView.push({key:String(g.key),x:point.x,y:point.y,g});
 }
 recordsInView.sort((a,b)=>Number(b.key===net.activeKey)-Number(a.key===net.activeKey)||a.key.localeCompare(b.key));
 const arranged=layout(recordsInView.slice(0,MAX_OBS_LABELS),width,height);
 const kept=new Set(arranged.map(p=>p.key));root.document.body?.classList.add('sm-v16-observations-active');
 for(const [key,node] of nodes)if(!kept.has(key)){node.remove();nodes.delete(key);}
 const svgItems=[];
 for(const p of arranged){const node=labelFor(p),mean=Number(p.g.rsrp?.mean),cell=String(p.g.cellId||p.g.siteId||'unidentified');
  const heading='Cell '+cell.slice(0,44),sub=Number.isFinite(mean)?`RSRP ${mean.toFixed(1)} dBm · obs.`:'Observed measurements · no tower GPS';
  if(node.firstChild.textContent!==heading)node.firstChild.textContent=heading;
  if(node.lastChild.textContent!==sub)node.lastChild.textContent=sub;
  node.style.left=p.lx+'px';node.style.top=p.ly+'px';
  const kind=Number.isFinite(mean)?mean<-105?'weak':mean<-90?'good':'excellent':'unknown';node.dataset.quality=kind;
  node.classList.toggle('selected',p.key===net.activeKey);
  node.title='Measurement-derived cell group. The line points to its observed GPS centroid, NOT a physical tower.';
  svgItems.push({x1:p.x,y1:p.y,x2:p.lx,y2:p.ly+18});
 }
 leaders.setAttribute('viewBox',`0 0 ${width} ${height}`);leaders.replaceChildren();
 const frag=root.document.createDocumentFragment();for(const p of svgItems){
  const line=root.document.createElementNS('http://www.w3.org/2000/svg','line');
  for(const [k,v] of Object.entries(p))line.setAttribute(k,String(v));frag.append(line);
 }
 leaders.append(frag);
}
function throttled(){const now=root.performance?.now?.()??Date.now();if(now-lastTick<110)return;lastTick=now;paint();}
const timer=root.setInterval(()=>{if(root.document.hidden)return;paint();},650);
root.addEventListener?.('beforeunload',()=>{root.clearInterval(timer);cleanupMap();},{once:true});
paint();
})(typeof window!=='undefined'?window:globalThis);
