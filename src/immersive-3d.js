/* OCP SignalMap — Immersive 3D V12. Precision-grounded, adaptive Cesium renderer.
   Preserve existing SignalMap/CSV/PDF; no inferred antennas or operator identities. */
(()=>{'use strict';
const Core=window.SignalMapImmersiveCore;
const RC=window.SignalMapImmersiveRenderCore;
const Elevation=window.SignalMapImmersiveElevationCore;
const $=id=>document.getElementById(id);
const COLOR={IAM:'#4ca1e9',inwi:'#aa73e8',Orange:'#f79a3b',Unknown:'#a1aeb3'};
let viewer=null,tileset=null,mode='basic',payload={sites:[],observations:[],center:{lat:32.667706,lon:-6.715322}};
let siteEntries=new Map(),observedEntries=[],selected=null,sceneGeneration=0,flightGeneration=0;
let surfaceMode='basic',elevationQueue=null;
let statusTimer=0,modelRefreshTimer=0,providerState='not loaded',providerMessage='',cameraUnsubscribe=null,moveUnsubscribe=null,loadProgressUnsubscribe=null;
const safe=v=>String(v??'').slice(0,140);
function say(message,error=false){const status=$('status');status.textContent=message;status.classList.toggle('error',error);$('footStatus').textContent=error?'3D NOTICE':message.slice(0,48).toUpperCase();}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(statusTimer);statusTimer=setTimeout(()=>el.classList.remove('show'),2600);}
function badge(label){$('sceneBadge').textContent=label;}
function formatSite(s){return `${s.group} · ${s.kind==='public'?'Public map structure':'CSV site GPS'} · ${(+s.lat).toFixed(4)}, ${(+s.lon).toFixed(4)}`;}
function stats(){const s=payload.sites,p=payload.center;$('siteTotal').textContent=s.length.toLocaleString();$('cellTotal').textContent=payload.observations.length.toLocaleString();$('listCount').textContent=`${s.length} sites`;$('cameraCoords').textContent=RC.formatHemisphere(p.lat,p.lon);}
function filtered(){const op=$('filterOperator').value,q=$('searchSite').value.toLowerCase().trim();return payload.sites.filter(s=>(op==='all'||op===s.group)&&(!q||[s.name,s.siteId,s.cellId,s.operator,s.classification].some(v=>String(v??'').toLowerCase().includes(q))));}
function buildList(){const list=filtered(),node=$('siteList');node.replaceChildren();for(const s of list.slice(0,150)){
 const button=document.createElement('button');button.type='button';button.className='site-row'+(selected?.key===s.key?' active':'');
 const dot=document.createElement('span');dot.className='dot';dot.style.background=COLOR[s.group]||COLOR.Unknown;
 const label=document.createElement('span');label.className='site-name';const title=document.createElement('strong');title.textContent=RC.name(s);
 const sub=document.createElement('small');sub.textContent=formatSite(s);label.append(title,sub);const arrow=document.createElement('i');arrow.textContent='↗';button.append(dot,label,arrow);
 button.onclick=()=>focusSite(s);node.append(button);
 }if(list.length>150){const x=document.createElement('div');x.className='legal';x.textContent=`150 of ${list.length} visible · refine filters to locate more sites.`;node.append(x);}}
function siteInfo(s){const node=$('selected');node.replaceChildren();if(!s){const title=document.createElement('strong');title.textContent='Nothing selected';const p=document.createElement('p');p.textContent='Choose a documented GPS site to inspect.';node.append(title,p);return;}
 const title=document.createElement('strong');title.textContent=RC.name(s);const dl=document.createElement('dl');const rows=[['Operator',s.operator||'Unknown'],['GPS',`${(+s.lat).toFixed(6)}, ${(+s.lon).toFixed(6)}`],['Position basis',s.positionStatus||'Mapped geographic point'],['Record type',s.kind==='public'?'Publicly mapped structure':'Imported CSV site'],['Physical height',RC.measuredHeight(s)===null?'Unknown — 28 m display model':`${RC.measuredHeight(s)} m`],['Source',s.source||'Not supplied'],['Terrain elevation',surfaceMode==='basic'?'Ellipsoid preview — no real DEM':(elevationQueue?.get(s)?.status==='resolved'?`${elevationQueue.get(s).height.toFixed(1)} m (sampled)`:`${elevationQueue?.get(s)?.status||'pending'} · not assumed`)]];for(const [k,v] of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;dl.append(dt,dd);}node.append(title,dl);
}
function c(){return window.Cesium;}
function ensureEngine(){if(!Core||!RC||!Elevation){say('Local 3D modules missing. Check immersive-core.js, immersive-render-core.js and immersive-elevation-core.js.',true);return false;}if(!c()){say('Cesium 3D could not be prepared automatically. Open SignalMap with Start_SignalMap.bat while connected to the internet, then reload. No separate installer is needed.',true);badge('ENGINE MISSING');$('sceneType').textContent='INSTALL CESIUM';return false;}return true;}
function screenCamera(){if(!viewer||viewer.isDestroyed?.())return;try{const C=c(),cart=C.Cartographic.fromCartesian(viewer.camera.positionWC);if(cart){const lat=C.Math.toDegrees(cart.latitude),lon=C.Math.toDegrees(cart.longitude);$('cameraCoords').textContent=`${RC.formatHemisphere(lat,lon)} · ${Math.round(cart.height).toLocaleString()} m ellipsoid`;}}catch(_){} }
function sceneRefresh(){try{viewer?.scene?.requestRender();}catch(_){} }
function updateQuality(){if(tileset)tileset.maximumScreenSpaceError=Number($('qualityRange').value);if(viewer){viewer.scene.fog.enabled=$('fogToggle').checked;viewer.scene.globe.enableLighting=$('lightToggle').checked;sceneRefresh();}}
function unlisten(){for(const fn of [cameraUnsubscribe,moveUnsubscribe,loadProgressUnsubscribe]){try{fn?.();}catch(_){}}cameraUnsubscribe=moveUnsubscribe=loadProgressUnsubscribe=null;clearTimeout(modelRefreshTimer);modelRefreshTimer=0;clearTimeout(elevationRefreshTimer);elevationRefreshTimer=0;}
function destroyScene(){unlisten();elevationQueue?.invalidate();elevationQueue=null;surfaceMode='basic';if(viewer){try{viewer.destroy();}catch(e){console.warn('3D scene disposal failed',e);}viewer=null;}tileset=null;siteEntries.clear();observedEntries=[];}
function wrapProviderError(err){return RC.redact(err,$('accessKey').value.trim());}
function originOfCamera(){if(!viewer)return payload.center;try{const C=c(),p=C.Cartographic.fromCartesian(viewer.camera.positionWC);if(p)return {lat:C.Math.toDegrees(p.latitude),lon:C.Math.toDegrees(p.longitude)};}catch(_){}return selected||payload.sites[0]||payload.center;}
// Cesium height references are used for drawing; height sampling is used for reliably framing the camera.
async function sampleGround(site,generation){if(!viewer||!RC.coord(site.lat,site.lon))return null;const C=c(),cart=C.Cartographic.fromDegrees(+site.lon,+site.lat);
 try{
  if(surfaceMode==='google'&&typeof viewer.scene.sampleHeightMostDetailed==='function'){
   const result=await Promise.race([viewer.scene.sampleHeightMostDetailed([cart]),new Promise(resolve=>setTimeout(()=>resolve(null),4800))]);
   if(generation!==sceneGeneration||!viewer)return null;const h=result?.[0]?.height;if(Number.isFinite(h))return h;
  }
  if(surfaceMode==='ion'&&typeof C.sampleTerrainMostDetailed==='function'){
   const result=await Promise.race([C.sampleTerrainMostDetailed(viewer.terrainProvider,[cart]),new Promise(resolve=>setTimeout(()=>resolve(null),4800))]);
   if(generation!==sceneGeneration||!viewer)return null;const h=result?.[0]?.height;if(Number.isFinite(h))return h;
  }
 }catch(e){console.warn('3D elevation sampling unavailable',RC.redact(e));}
 return null;
}
// Never fly to an arbitrary 200 m absolute ellipsoid altitude. That can be underground on elevated terrain.
async function flyToSite(site,preset='oblique'){
 if(!viewer||!site)return;const C=c(),generation=sceneGeneration,request=++flightGeneration;
 const spec=RC.viewPreset(preset,site);
 // Immediately move the camera toward the site while high-detail elevation data is streaming.
 // This provisional view stays safely above the ellipsoid and is never called a verified ground elevation.
 if(surfaceMode!=='basic')try{
  const provisional=C.Cartesian3.fromDegrees(+site.lon,+site.lat,12000),sphere=new C.BoundingSphere(provisional,Math.max(15,RC.visualHeight(site)/2));
  viewer.camera.flyToBoundingSphere(sphere,{duration:.85,offset:new C.HeadingPitchRange(C.Math.toRadians(30),C.Math.toRadians(-43),12000)});
 }catch(_){}
 const cached=elevationQueue?.get(site);
 let ground=cached?.status==='resolved'?cached.height:await sampleGround(site,generation);
 if(generation!==sceneGeneration||request!==flightGeneration||!viewer)return;
 // The viewer can lack streamed tile heights. In that case, aim from a safe *above-ellipsoid* range and do not claim terrain-accurate framing.
 const unknown=ground===null;const h=RC.visualHeight(site),localGround=unknown?0:ground;
 const target=C.Cartesian3.fromDegrees(+site.lon,+site.lat,localGround+h/2),sphere=new C.BoundingSphere(target,Math.max(12,h/2));
 let range=spec.range;
 // Without a terrain height, a large temporary offset prevents underground camera flights in mountainous regions.
 if(unknown&&surfaceMode!=='basic'){say('Terrain height not yet available for this site. Ground marker remains visible; tower model waits for sampled elevation.');return;}
 try{viewer.camera.flyToBoundingSphere(sphere,{duration:1.45,offset:new C.HeadingPitchRange(C.Math.toRadians(spec.heading),C.Math.toRadians(spec.pitch),range)});}catch(e){say('Could not frame site: '+RC.redact(e),true);}
 if(unknown&&surfaceMode!=='basic')say('Elevation unavailable: no physically placed model until terrain loads.');
}
function focusSite(s){selected=s;siteInfo(s);buildList();if(viewer){reconcile();flyToSite(s,'near');}toast(`Focus: ${RC.name(s)}`);}
async function flyCenter(preset='oblique'){
 if(!viewer)return;const s=selected||payload.sites[0]||payload.observations[0]||payload.center;
 if(preset==='fit'&&payload.sites.length>1){const C=c(),pts=payload.sites.filter(s=>RC.coord(s.lat,s.lon)).map(s=>C.Cartesian3.fromDegrees(+s.lon,+s.lat,0));if(pts.length>1){const bs=C.BoundingSphere.fromPoints(pts);const range=Math.max(850,bs.radius*3,mode==='basic'?0:1400);viewer.camera.flyToBoundingSphere(bs,{duration:1.5,offset:new C.HeadingPitchRange(C.Math.toRadians(20),C.Math.toRadians(-45),range)});return;}}
 await flyToSite(s,preset);
}
function makePoint(C,s){return {pixelSize:s.kind==='public'?11:12,color:C.Color.fromCssColorString(COLOR[s.group]||COLOR.Unknown),outlineColor:C.Color.WHITE,outlineWidth:2,heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:2000};}
function makeModel(C,s){const scale=RC.modelScale(s);return {uri:'./assets/radio-tower-precision-v9.glb',scale,minimumPixelSize:28,maximumScale:scale*1.15,heightReference:C.HeightReference.NONE,shadows:C.ShadowMode.ENABLED};}
function makeLabel(C,s){return {text:`${s.group==='Unknown'?'MAPPED':s.group} · ${RC.name(s).slice(0,28)}`,font:'600 13px Segoe UI, sans-serif',showBackground:true,backgroundPadding:new C.Cartesian2(8,5),backgroundColor:C.Color.fromCssColorString('#08261ee8'),fillColor:C.Color.WHITE,outlineColor:C.Color.fromCssColorString('#001910'),outlineWidth:2,style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(0,-8),heightReference:C.HeightReference.NONE,verticalOrigin:C.VerticalOrigin.BOTTOM,distanceDisplayCondition:new C.DistanceDisplayCondition(0,4500),disableDepthTestDistance:3000,show:$('showLabels').checked};}
function createSite(C,s){const e=viewer.entities.add({id:'site:'+s.key,name:RC.name(s),position:C.Cartesian3.fromDegrees(+s.lon,+s.lat,0),point:makePoint(C,s)});
 e.__record=s;
 // A physically grounded label uses independent position and relative elevation. Do not attach a label to the ground-level model entity.
 siteEntries.set(String(s.key),{site:s,entity:e,label:null,hasModel:false,ground:null});
}
async function sampleGroundBatch(sites,generation){
 if(!viewer||generation!==sceneGeneration)return sites.map(()=>null);
 if(surfaceMode==='basic')return sites.map(()=>0);
 const C=c(),positions=sites.map(s=>C.Cartographic.fromDegrees(+s.lon,+s.lat));
 const timed=(p,ms)=>Promise.race([p,new Promise(resolve=>setTimeout(()=>resolve(null),ms))]);
 try{
  if(surfaceMode==='ion'&&typeof C.sampleTerrainMostDetailed==='function'){
   const result=await timed(C.sampleTerrainMostDetailed(viewer.terrainProvider,positions),6500);
   if(generation!==sceneGeneration)return sites.map(()=>null);
   return (result||positions).map(x=>Number.isFinite(x?.height)?x.height:null);
  }
  if(surfaceMode==='google'&&typeof viewer.scene.sampleHeightMostDetailed==='function'){
   const result=await timed(viewer.scene.sampleHeightMostDetailed(positions),6500);
   if(generation!==sceneGeneration)return sites.map(()=>null);
   return (result||positions).map(x=>Number.isFinite(x?.height)?x.height:null);
  }
 }catch(e){console.warn('Terrain batch unavailable:',RC.redact(e));}
 return sites.map(()=>null);
}
let elevationRefreshTimer=0;
function createElevationQueue(){
 if(!viewer||!Elevation)return;
 clearTimeout(elevationRefreshTimer);
 const currentGeneration=sceneGeneration;
 elevationQueue=Elevation.createBatchQueue(sites=>sampleGroundBatch(sites,currentGeneration),(key,state)=>{
  if(currentGeneration!==sceneGeneration||!viewer)return;
  // One scene refresh per height batch (rather than one full 3D reconciliation per site).
  if(!elevationRefreshTimer)elevationRefreshTimer=setTimeout(()=>{
   elevationRefreshTimer=0;if(currentGeneration===sceneGeneration&&viewer){reconcile();if(selected)siteInfo(selected);}
  },45);
 },{batchSize:8,maxConcurrent:2,maxAttempts:3});
}
function retryVisibleElevation(){
 if(!viewer||surfaceMode==='basic'||!elevationQueue)return;
 const center=selected||originOfCamera();
 const chosen=RC.modelSites(filtered(),center,selected?.key,RC.MAX_MODELS);
 elevationQueue.retryUnavailable(filtered().filter(s=>chosen.has(String(s.key))));
}
function reconcile(){if(!viewer)return;const C=c(),list=filtered(),wanted=new Set(list.map(s=>String(s.key)));
 for(const [key,item] of siteEntries){if(!wanted.has(key)){viewer.entities.remove(item.entity);if(item.label)viewer.entities.remove(item.label);siteEntries.delete(key);}}
 for(const s of list){const key=String(s.key);if(!siteEntries.has(key))createSite(C,s);}
 const center=selected||originOfCamera();const models=RC.modelSites(list,center,selected?.key,RC.MAX_MODELS),modelsEnabled=$('showTowers').checked,labelsEnabled=$('showLabels').checked;
 let modelsOn=0,pending=0,unavailable=0;
 for(const [key,item] of siteEntries){
  const wantsModel=modelsEnabled&&models.has(key);
  let ground=surfaceMode==='basic'?0:null;
  if(wantsModel&&surfaceMode!=='basic'&&elevationQueue){
   const state=elevationQueue.request(item.site);
   if(state.status==='resolved')ground=state.height;
   else if(state.status==='unavailable')unavailable++;
   else pending++;
  }
  // Cesium's ModelGraphics CLAMP_TO_GROUND can be clamped to a different surface than 3D Tiles.
  // Set an explicit absolute WGS84 height only after a real DEM / tile height was sampled.
  const canDraw=wantsModel&&Number.isFinite(ground);
  if(canDraw){
   if(item.ground!==ground){item.entity.position=C.Cartesian3.fromDegrees(+item.site.lon,+item.site.lat,ground);item.ground=ground;}
   if(!item.hasModel){item.entity.model=new C.ModelGraphics(makeModel(C,item.site));item.hasModel=true;}
   modelsOn++;
  }else if(item.hasModel){item.entity.model=undefined;item.hasModel=false;}
  item.entity.point.show=!canDraw;
  const wantLabel=canDraw&&labelsEnabled;
  if(wantLabel){
   const labelHeight=ground+RC.visualHeight(item.site)+5;
   if(!item.label){item.label=viewer.entities.add({id:'label:'+key,name:RC.name(item.site),position:C.Cartesian3.fromDegrees(+item.site.lon,+item.site.lat,labelHeight),label:makeLabel(C,item.site)});item.label.__record=item.site;}
   else if(item.label.__ground!==ground){item.label.position=C.Cartesian3.fromDegrees(+item.site.lon,+item.site.lat,labelHeight);}
   item.label.__ground=ground;
  }else if(item.label){viewer.entities.remove(item.label);item.label=null;}
 }
 $('siteTotal').textContent=list.length.toLocaleString();
 $('listCount').textContent=`${modelsOn} GLB · ${list.length} GPS sites`;
 if($('terrainPlacementStatus'))$('terrainPlacementStatus').textContent=surfaceMode==='basic'?'Ellipsoid preview · no terrain altitudes':`${modelsOn} surface placed · ${pending} sampling · ${unavailable} unavailable`;
 if(!observedEntries.length&&payload.observations.length){for(const s of payload.observations.slice(0,1000)){const e=viewer.entities.add({name:RC.name(s),position:C.Cartesian3.fromDegrees(+s.lon,+s.lat,0),point:{pixelSize:7,color:C.Color.fromCssColorString(COLOR[s.group]||COLOR.Unknown).withAlpha(.5),outlineColor:C.Color.WHITE.withAlpha(.6),outlineWidth:1,heightReference:C.HeightReference.CLAMP_TO_GROUND}});observedEntries.push({entity:e,site:s});}}
 for(const x of observedEntries)x.entity.show=$('showObserved').checked&&($('filterOperator').value==='all'||x.site.group===$('filterOperator').value);
 sceneRefresh();
}
function updateModelVisibilityDebounced(){clearTimeout(modelRefreshTimer);modelRefreshTimer=setTimeout(()=>{if(viewer)reconcile();},350);}
function attachSceneEvents(C){cameraUnsubscribe=viewer.camera.changed.addEventListener(screenCamera);viewer.camera.percentageChanged=.08;
 moveUnsubscribe=viewer.camera.moveEnd.addEventListener(()=>{updateModelVisibilityDebounced();retryVisibleElevation();});
 viewer.screenSpaceEventHandler.setInputAction(event=>{try{const pick=viewer.scene.pick(event.position),s=pick?.id?.__record;if(s)focusSite(s);}catch(e){console.warn('3D pick:',e);}},C.ScreenSpaceEventType.LEFT_CLICK);
}
function addAttribution(){if($('attribution'))$('attribution').textContent='Provider attributions appear on the globe and must remain visible.';}
async function initializeProvider(C,generation){providerState='loading';let warning='';
 if(mode==='ion'){
  const token=$('accessKey').value.trim();if(!token)throw Error('Cesium ion token required for World Terrain and OSM Buildings.');
  C.Ion.defaultAccessToken=token;
  say('Loading Cesium World Terrain…');const terrain=await C.createWorldTerrainAsync();if(generation!==sceneGeneration)return;
  viewer.terrainProvider=terrain;surfaceMode='ion';providerState='real DEM';badge('REAL DEM');$('sceneType').textContent='WORLD TERRAIN';
  try{say('Loading Cesium OSM Buildings…');const b=await C.createOsmBuildingsAsync();if(generation!==sceneGeneration)return;viewer.scene.primitives.add(b);tileset=b;$('sceneType').textContent='REAL DEM + OSM BUILDINGS';}catch(e){warning='Buildings unavailable: '+wrapProviderError(e);}
 }else if(mode==='google'){
  const token=$('accessKey').value.trim();if(!token)throw Error('Google Maps Platform Map Tiles API key required.');
  say('Loading Google Photorealistic 3D Tiles…');
  const url='https://tile.googleapis.com/v1/3dtiles/root.json?key='+encodeURIComponent(token);
  const t=await C.Cesium3DTileset.fromUrl(url,{maximumScreenSpaceError:Number($('qualityRange').value),dynamicScreenSpaceError:true,showCreditsOnScreen:true,enableCollision:true});
  if(generation!==sceneGeneration)return;viewer.scene.primitives.add(t);tileset=t;viewer.scene.globe.show=false;surfaceMode='google';providerState='tiles requested';badge('3D TILES');$('sceneType').textContent='GOOGLE PHOTOREALISTIC TILES';
 }else{surfaceMode='basic';providerState='ellipsoid';badge('GLOBE');$('sceneType').textContent='ELLIPSOID — NO REAL DEM';}
 if(tileset?.loadProgress?.addEventListener){loadProgressUnsubscribe=tileset.loadProgress.addEventListener((pending,processing)=>{if(generation!==sceneGeneration)return;if(pending+processing>0){providerState='streaming';badge('STREAMING');}else{providerState='tiles ready';badge(mode==='google'?'TILES STREAMED':'REAL DEM');retryVisibleElevation();}sceneRefresh();});}
 return warning;
}
async function initScene(){if(!ensureEngine())return;const C=c(),generation=++sceneGeneration;flightGeneration++;
 destroyScene();$('cesiumHost').replaceChildren();$('loadScene').disabled=true;providerMessage='';say('Starting GPU 3D renderer…');
 try{
  // Construct a real Cesium viewer once per user-initiated initialization.
  viewer=new C.Viewer('cesiumHost',{baseLayer:false,animation:false,timeline:false,homeButton:false,geocoder:false,baseLayerPicker:false,sceneModePicker:false,navigationHelpButton:false,selectionIndicator:false,infoBox:false,fullscreenButton:false,requestRenderMode:true,maximumRenderTimeChange:.5});
  viewer.scene.screenSpaceCameraController.enableCollisionDetection=true;
  viewer.scene.globe.enableLighting=$('lightToggle').checked;viewer.scene.fog.enabled=$('fogToggle').checked;
  try{viewer.scene.postProcessStages.fxaa.enabled=true;}catch(_){}
  // Avoid excessive GPU load on modest laptops while retaining sharp edges on good GPUs.
  try{viewer.resolutionScale=Math.min(1.4,Math.max(1,window.devicePixelRatio||1));}catch(_){}
  try{viewer.scene.globe.depthTestAgainstTerrain=true;}catch(_){}
  if(mode!=='google')try{viewer.imageryLayers.addImageryProvider(new C.OpenStreetMapImageryProvider({url:'https://tile.openstreetmap.org/'}));}catch(err){console.warn('Street imagery unavailable:',RC.redact(err));}
  attachSceneEvents(C);addAttribution();
  let warning='';
  try{warning=await initializeProvider(C,generation)||'';}catch(e){warning='Provider unavailable: '+wrapProviderError(e);providerState='fallback';surfaceMode='basic';badge('GLOBE FALLBACK');$('sceneType').textContent='GLOBE — EXTERNAL TILES FAILED';try{viewer.scene.globe.show=true;}catch(_){}if(mode==='google')try{viewer.imageryLayers.addImageryProvider(new C.OpenStreetMapImageryProvider({url:'https://tile.openstreetmap.org/'}));}catch(_){} }
  if(generation!==sceneGeneration||!viewer)return;
  createElevationQueue();reconcile();updateQuality();await flyCenter('oblique');
  if(warning){providerMessage=warning;say(`${warning}. The georeferenced 3D sites remain available on a basic globe; no fake terrain is shown.`,true);}else say(mode==='basic'?'Globe ready (ellipsoid, not real terrain). Select a data provider for real relief.':`3D engine ready · ${providerState}. Satellite/DEM detail depends on regional tile availability.`);
 }catch(e){say(`3D engine failed: ${wrapProviderError(e)}. Check WebGL and local Cesium installation.`,true);badge('3D ERROR');console.warn('Immersive 3D startup:',RC.redact(e));}
 finally{$('loadScene').disabled=false;}
}
function readData(input){if(!Core||!RC)return;elevationQueue?.invalidate();if(viewer)createElevationQueue();payload=Core.sanitizePayload(input);selected=null;siteInfo(null);stats();buildList();if(viewer){for(const item of siteEntries.values()){viewer.entities.remove(item.entity);if(item.label)viewer.entities.remove(item.label);}for(const x of observedEntries)viewer.entities.remove(x.entity);siteEntries.clear();observedEntries=[];reconcile();flyCenter('fit');}
 say(`Loaded ${payload.sites.length} GPS sites + ${payload.observations.length} observed cells. No tower positions are inferred from route measurements.`);}
function installUI(){if(!Core||!RC||!Elevation){say('Local 3D render/data module is unavailable.',true);return;}if(!c())ensureEngine();else say('CesiumJS available · choose geographic dataset.');
 try{const cached=sessionStorage.getItem('signalmap_immersive_bridge_v1');if(cached)readData(JSON.parse(cached));}catch(err){console.warn('Session data was not restored:',RC.redact(err));}
 window.addEventListener('message',evt=>{if(evt.origin!==location.origin||evt.data?.type!=='SIGNALMAP_IMMERSIVE_DATA')return;if(window.opener&&evt.source!==window.opener)return;readData(evt.data.payload);});
 if(window.opener)try{window.opener.postMessage({type:'SIGNALMAP_IMMERSIVE_READY'},location.origin);}catch(_){}
 for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>{mode=b.dataset.mode;for(const x of document.querySelectorAll('[data-mode]'))x.classList.toggle('active',b===x);$('credentials').hidden=mode==='basic';$('credentialLabel').textContent=mode==='google'?'Google Maps Platform API key':'Cesium ion token';$('credentialHint').textContent=mode==='google'?'Billing and regional availability apply. Key stays in this tab only.':'World Terrain and 3D Buildings depend on Cesium ion. Key stays in memory only.';$('accessKey').value='';say(mode==='basic'?'Basic globe selected; terrain is not real DEM.':'Press Initialize 3D Scene to stream selected provider.');};
 $('toggleKey').onclick=()=>$('accessKey').type=$('accessKey').type==='password'?'text':'password';$('loadScene').onclick=initScene;
 for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>flyCenter(b.dataset.view);
 $('resetCamera').onclick=()=>{selected=null;siteInfo(null);buildList();flyCenter('oblique');};
 $('fullScreen').onclick=async()=>{if(!document.fullscreenElement){document.body.classList.add('scene-focus');try{await document.documentElement.requestFullscreen?.();}catch(_){}}else{document.body.classList.remove('scene-focus');try{await document.exitFullscreen?.();}catch(_){}}};
 document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)document.body.classList.remove('scene-focus');});
 $('filterOperator').onchange=()=>{buildList();reconcile();};$('searchSite').oninput=buildList;
 for(const id of ['showTowers','showLabels','showObserved'])$(id).onchange=reconcile;
 $('qualityRange').oninput=()=>{$('qualityValue').textContent=$('qualityRange').value;updateQuality();};$('fogToggle').onchange=updateQuality;$('lightToggle').onchange=updateQuality;
 $('homeMap').onclick=()=>{if(window.opener&&!window.opener.closed)window.opener.focus();else location.href='./OCP_SignalMap_Real_Terrain_3D_Public_Antennas.html';};
 $('importCSV').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>10e6)throw Error('CSV exceeds 10 MB');const result=Core.fromCSV(await f.text());if(!result.sites.length)throw Error('No dedicated tower_lat/site_lat/antenna_lat coordinate columns. Route coordinates cannot be treated as tower GPS.');readData({sites:result.sites,observations:[],center:result.sites[0]});toast(`${result.sites.length} real-coordinate site(s) loaded · ${result.rejected} rows rejected`);}catch(err){say(`CSV: ${RC.redact(err)}`,true);}finally{e.target.value='';}};
 $('importGeoJSON').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>10e6)throw Error('File exceeds 10 MB');const result=Core.fromGeoJSON(JSON.parse(await f.text()));if(!result.sites.length)throw Error('No valid mapped site points');readData({sites:result.sites,observations:[],center:result.sites[0]});toast(`${result.sites.length} mapped sites loaded`);}catch(err){say(`GeoJSON: ${RC.redact(err)}`,true);}finally{e.target.value='';}};
 const left=document.querySelector('.left');if(window.matchMedia('(max-width:650px)').matches&&left){left.onclick=e=>{if(e.target===left)left.classList.toggle('expanded');};}
 window.addEventListener('pagehide',()=>{sceneGeneration++;destroyScene();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installUI);else installUI();
})();
