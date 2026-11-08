/* SignalMap Network Cinema 3D V4.
   Real map controls + source-attributed sector geometry. No invented towers or RF claims. */
(function(){
'use strict';
const core=window.SignalMap3DStudioCore,net=window.SignalMapNetwork,stage=document.getElementById('smrealSection'),aside=stage?.querySelector('.smreal-panel'),mapHost=document.getElementById('smrealMap');
if(!core||!net||!stage||!aside||!mapHost)return;
const $=id=>document.getElementById(id);
const block=document.createElement('section');block.id='sm3dCinema';block.className='smreal-wide';block.setAttribute('aria-label','Network Cinema 3D Studio');
block.innerHTML=`<div class="s4heading"><b><span class="s4pulse"></span> NETWORK CINEMA · 3D V4</b><span>REAL SITES · CAMERA TOUR</span></div>
<div class="s4stats" role="status" aria-live="polite"><div><strong id="s4Sites">0</strong><span>CSV tower GPS</span></div><div><strong id="s4Sectors">0</strong><span>3D sector fans</span></div><div><strong id="s4Progress">0 / 0</strong><span>Tour progress</span></div></div>
<label class="s4field" for="s4Site">Focus site / operator<select id="s4Site"><option value="">Import site GPS CSV to start</option></select></label>
<div class="s4row"><button id="s4Prev" type="button">◀ Previous site</button><button id="s4Next" type="button">Next site ▶</button><button class="s4primary" id="s4Play" type="button">▶ Play cinematic tour</button><button id="s4Pause" type="button">Pause tour</button></div>
<label class="s4field" for="s4TourSpeed">Camera dwell time <output id="s4SpeedOut">6 seconds / site</output><input id="s4TourSpeed" type="range" min="3" max="12" step="1" value="6"></label>
<label class="s4check"><input id="s4SectorsToggle" type="checkbox">Show 3D sector fans (visual indication only)</label>
<label class="s4check"><input id="s4AssumeSector" type="checkbox">Preview missing bearings as assumed 120° (NOT CSV data)</label>
<label class="s4field" for="s4Range">Visual fan radius <output id="s4RangeOut">450 m</output><input id="s4Range" type="range" min="150" max="1600" step="50" value="450"></label>
<label class="s4check"><input id="s4HUDtoggle" type="checkbox" checked>Show cinema HUD over 3D map</label>
<div class="s4row"><button id="s4Fit" type="button">Frame network</button><button id="s4Stop" type="button">■ Stop tour</button></div>
<p class="s4warn">3D fans are schematic views of documented azimuths or explicitly assumed previews. They are <b>not measured coverage</b>. No verified antenna coordinates → no physical towers or tour.</p>
<p class="s4status" id="s4Status" role="status">Load real 3D terrain and import a site inventory CSV with tower GPS.</p>`;
const old=document.getElementById('sm3dFocusPanel');if(old)old.insertAdjacentElement('afterend',block);else aside.append(block);
const hud=document.createElement('div');hud.className='s4-hud';hud.id='s4HUD';hud.setAttribute('aria-live','off');hud.innerHTML='<span class="s4-hud-sub">NETWORK CINEMA / REAL 3D</span><b id="s4HudSite">No site selected</b><span id="s4HudInfo">Camera ready when 3D map loads</span><div class="s4-hud-track"><div class="s4-hud-fill" id="s4HudFill"></div></div>';
mapHost.append(hud);
let currentMap=null,geosig='',tour=[],index=-1,playing=false,paused=false,timer=null,lastItems='',lastBearingSig='',mapEvents=[],hudEnabled=true;
const cssSafeColor={IAM:'#397adc',inwi:'#9356cc',Orange:'#f39d37',Unknown:'#748d81'};
const getSites=()=>net.entities.filter(core.validSite);
const status=s=>{$('s4Status').textContent=s;};
const op=s=>core.operatorOf(s);
const name=s=>(s.siteId||s.key||'Site')+' · '+op(s);
const runAllowed=()=>Boolean(currentMap&&currentMap.getStyle?.());
function clearTimer(){if(timer){clearTimeout(timer);timer=null;}}
function stopTour(silent=false){clearTimer();if(playing&&currentMap?.stop)currentMap.stop();playing=false;paused=false;document.body.classList.remove('s4-cinema');if(!silent)status('Cinema stopped. Manual 3D camera controls are available.');refreshButtons();}
function sortTour(){const m=currentMap,c=m?.getCenter?.(),center=c?{lat:c.lat,lon:c.lng}:null;let list=getSites();if(center&&list.length>200)list=list.slice().sort((a,b)=>core.haversine(center,a)-core.haversine(center,b));return core.tourOrder(list.slice(0,200),center);}
function refreshButtons(){const ready=runAllowed(),size=getSites().length;for(const id of ['s4Prev','s4Next','s4Play','s4Fit','s4Site'])$(id).disabled=!ready||!size;$('s4Pause').disabled=!playing;$('s4Stop').disabled=!playing;$('s4Pause').textContent=paused?'Resume tour':'Pause tour';}
function orient(s,run=false){if(!runAllowed()||!s)return;const a=core.bearingOf(s,false);const bearing=a?.bearing??-32;const speed=Number($('s4TourSpeed').value)||6;
 currentMap.flyTo({center:[s.lon,s.lat],zoom:Math.min(16.4,Math.max(13,currentMap.getZoom())),pitch:70,bearing:bearing-25,duration:run?Math.min(3000,speed*420):950,essential:true});
 net.selectEntity(s,'studio');$('s4Site').value=s.key;setHUD(s);status((run?'Tour stop: ':'Focused: ')+name(s)+' · tower GPS from imported site columns'+(a?' · CSV azimuth '+a.bearing+'°':' · azimuth unavailable'));
}
function setHUD(s){$('s4HudSite').textContent=s?name(s):'No site selected';const number=getSites().length;const indexInTour=playing?index+1:0;
 $('s4HudInfo').textContent=(s?'CSV site coordinates · ':'')+indexInTour+'/'+(playing?tour.length:number)+' · '+(currentMap?.getPitch?.()?.toFixed(0)??'—')+'° camera pitch';
 $('s4HudFill').style.width=playing&&tour.length?Math.round(100*indexInTour/tour.length)+'%':'0%';}
function visit(i){clearTimer();if(!playing||paused||!tour.length)return;if(i>=tour.length){stopTour(true);status('Cinematic tour complete · '+tour.length+' GPS sites.');return;}
 index=i;orient(tour[i],true);$('s4Progress').textContent=(i+1)+' / '+tour.length;const wait=Number($('s4TourSpeed').value)*1000;timer=setTimeout(()=>visit(i+1),wait);refreshButtons();}
function play(){if(!runAllowed()){status('Load the Real 3D map first.');return;}tour=sortTour();if(!tour.length){status('No real antenna GPS in CSV. Import a site inventory; measurement locations are not towers.');return;}if(getSites().length>200)status('Tour is limited to 200 nearest sites per run; all site models remain on the map.');stopTour(true);playing=true;paused=false;index=-1;document.body.classList.add('s4-cinema');visit(0);}
function pause(){if(!playing)return;if(!paused){clearTimer();currentMap?.stop?.();paused=true;status('Tour paused. Resume to finish the current site before advancing.');}else{paused=false;visit(Math.max(0,index));}refreshButtons();}
function manual(step){if(!runAllowed())return;stopTour(true);const arr=sortTour();if(!arr.length){status('No site GPS positions available.');return;}const selected=arr.findIndex(s=>s.key===$('s4Site').value);const next=selected<0?(step<0?arr.length-1:0):(selected+step+arr.length)%arr.length;orient(arr[next]);$('s4Progress').textContent='0 / '+arr.length;refreshButtons();}
function bearingData(){const sites=getSites();return JSON.stringify(sites.map(s=>[s.key,s.lat,s.lon,(s.azimuth||[]).join(','),op(s)]));}
function setSectorLayers(){const m=currentMap,enabled=$('s4SectorsToggle').checked;if(!m||!m.getStyle?.()||!m.isStyleLoaded?.())return;
 const sid='s4-visual-sector-source',vol='s4-visual-sector-extrusion',edges='s4-visual-sector-lines';
 if(!m.getSource(sid)){m.addSource(sid,{type:'geojson',data:{type:'FeatureCollection',features:[]}});}
 if(!m.getLayer(vol))m.addLayer({id:vol,type:'fill-extrusion',source:sid,paint:{'fill-extrusion-color':['match',['get','operator'],'IAM',cssSafeColor.IAM,'inwi',cssSafeColor.inwi,'Orange',cssSafeColor.Orange,cssSafeColor.Unknown],'fill-extrusion-height':35,'fill-extrusion-base':0,'fill-extrusion-opacity':.30,'fill-extrusion-vertical-gradient':true}},m.getLayer('network-radio-towers')?'network-radio-towers':undefined);
 if(!m.getLayer(edges))m.addLayer({id:edges,type:'line',source:sid,paint:{'line-color':['match',['get','operator'],'IAM',cssSafeColor.IAM,'inwi',cssSafeColor.inwi,'Orange',cssSafeColor.Orange,cssSafeColor.Unknown],'line-width':1.4,'line-opacity':.7}},m.getLayer('network-radio-towers')?'network-radio-towers':undefined);
 const sig=String(enabled)+'|'+String($('s4AssumeSector').checked)+'|'+String($('s4Range').value)+'|'+bearingData();if(sig===lastBearingSig)return;lastBearingSig=sig;
 const result=enabled?core.sectorFeatures(getSites(),{allowAssumed:$('s4AssumeSector').checked,radiusM:Number($('s4Range').value),maxSites:400}):{features:[],skipped:0,assumedCount:0};
 m.getSource(sid).setData({type:'FeatureCollection',features:result.features});
 $('s4Sectors').textContent=String(result.features.length);if(enabled)status(`${result.features.length} schematic 3D sectors · ${result.assumedCount} explicitly assumed at 120° · ${result.skipped} skipped. Not RF coverage.`);
}
function refreshMap(){const latest=net.map||window.SignalMapRealTerrain3D?.map||null;if(latest===currentMap)return;
 stopTour(true);if(currentMap){for(const [name,fn] of mapEvents)currentMap.off?.(name,fn);}mapEvents=[];currentMap=latest;lastBearingSig='';
 if(currentMap){const onStyle=()=>{lastBearingSig='';try{setSectorLayers();}catch(e){status('3D sector render: '+e.message);}};
 const onCamera=()=>{const chosen=getSites().find(s=>s.key===$('s4Site').value);setHUD(chosen);};
 const onUser=()=>{if(playing&&!paused){clearTimer();playing=false;paused=false;status('Manual camera movement stopped cinematic autopilot.');refreshButtons();}};
 for(const [ev,fn] of [['style.load',onStyle],['moveend',onCamera],['dragstart',onUser]]){currentMap.on?.(ev,fn);mapEvents.push([ev,fn]);}
 try{setSectorLayers();}catch(e){status('3D map available; sectors pending: '+e.message);}status('Real 3D camera connected. Ready for cinematic network tour.');}
 refreshButtons();}
function refresh(){refreshMap();const sites=getSites(),signature=sites.map(s=>s.key+':'+s.lat+':'+s.lon+':'+op(s)).join('|');
 if(signature!==lastItems){lastItems=signature;const old=$('s4Site').value;$('s4Site').replaceChildren();if(sites.length){for(const s of sites.slice(0,1500)){const o=document.createElement('option');o.value=s.key;o.textContent=name(s);$('s4Site').append(o);}if(sites.some(s=>s.key===old))$('s4Site').value=old;}else {$('s4Site').add(new Option('No documented site GPS',''));}if(playing)stopTour(true);refreshButtons();}
 $('s4Sites').textContent=sites.length.toLocaleString();if(currentMap&&$('s4SectorsToggle').checked)try{setSectorLayers();}catch(e){status('Sector overlay error: '+e.message);}
 if(!playing)$('s4Progress').textContent='0 / '+sites.length;
 hud.hidden=!hudEnabled||!currentMap;refreshButtons();}
$('s4Play').addEventListener('click',play);$('s4Pause').addEventListener('click',pause);$('s4Stop').addEventListener('click',()=>stopTour());$('s4Prev').addEventListener('click',()=>manual(-1));$('s4Next').addEventListener('click',()=>manual(1));$('s4Fit').addEventListener('click',()=>{stopTour(true);window.SignalMap3DFocus?.fitSites?.();});
$('s4Site').addEventListener('change',()=>{stopTour(true);const s=getSites().find(x=>x.key===$('s4Site').value);orient(s);});
$('s4TourSpeed').addEventListener('input',()=>{$('s4SpeedOut').textContent=$('s4TourSpeed').value+' seconds / site';});
$('s4Range').addEventListener('input',()=>{$('s4RangeOut').textContent=$('s4Range').value+' m';lastBearingSig='';try{setSectorLayers();}catch(e){status(e.message);}});
for(const id of ['s4SectorsToggle','s4AssumeSector'])$(id).addEventListener('change',()=>{lastBearingSig='';try{setSectorLayers();}catch(e){status(e.message);}});
$('s4HUDtoggle').addEventListener('change',()=>{hudEnabled=$('s4HUDtoggle').checked;hud.hidden=!hudEnabled;});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&!paused)pause();});
window.addEventListener('beforeunload',()=>{stopTour(true);if(currentMap)for(const [ev,fn] of mapEvents)currentMap.off?.(ev,fn);});
setInterval(refresh,750);refresh();
window.SignalMap3DStudio={refresh,play,pause,stop:stopTour,sectorRefresh:setSectorLayers,get state(){return {sites:getSites().length,sectors:Number($('s4Sectors').textContent)||0,playing,paused,tourIndex:index,hasMap:runAllowed()};}};
})();
