/* SignalMap · grounded 3D city context. OSM building footprints are retrieved
 * only near a viewed site at close zoom. Building heights from OSM are retained;
 * floor-derived/unknown heights are visibly and textually classified as estimates.
 * This is 2.5D extrusion, not photogrammetry or surveyed vertical geometry.
 * No antenna/GPS/CSV/RF calculations are changed here.
 */
(function(global){
  'use strict';
  const SRC='sm-context-buildings', LAYER='sm-context-buildings-extrusion';
  const ENDPOINTS=['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter'];
  const EMPTY={type:'FeatureCollection',features:[]};
  const state={map:null,phase:'idle',records:0,known:0,estimated:0,lastError:'',lastCoordinate:null,cache:new Map(),lastKey:'',active:null,processed:0,attempts:0};
  const isValid=(v,min,max)=>Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max;
  const centered=(c)=>({lat:Number(c?.lat),lon:Number(c?.lng??c?.lon)});
  const roundCoord=(v)=>Math.round(Number(v)*250)/250;
  const rad=Math.PI/180;
  const distanceKm=(a,b)=>{const dlat=(a.lat-b.lat)*rad,dlon=(a.lon-b.lon)*rad;const k=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(k)));};
  function heightInfo(tags){
    // OSM records often store meters, centimeters or feet; reject absurd data.
    const h=String(tags.height??tags['building:height']??'').trim();
    const parse=(s)=>{const n=/^(-?\d+(?:\.\d+)?)\s*(m|meter|meters|ft|feet|')?$/i.exec(s);if(!n)return null;const v=Number(n[1])*(n[2]&&/^(ft|feet|')$/i.test(n[2])?.3048:1);return v>=2&&v<=280?v:null;};
    let meters=parse(h);
    if(meters!==null)return {height:meters,known:true,kind:'height_tag'};
    const levels=Number(tags['building:levels']);
    if(Number.isFinite(levels)&&levels>=1&&levels<=85)return {height:Math.min(260,levels*3.1),known:false,kind:'floor_estimate'};
    return {height:7.5,known:false,kind:'illustrative_unknown'};
  }
  function polygonFromElement(element){
    const geom=element?.geometry;
    if(element?.type!=='way'||!Array.isArray(geom)||geom.length<4||geom.length>1200)return null;
    const coordinates=[];
    for(const p of geom){if(!isValid(p.lon,-180,180)||!isValid(p.lat,-90,90))return null;coordinates.push([Number(p.lon),Number(p.lat)]);}
    const f=coordinates[0],l=coordinates[coordinates.length-1];if(Math.abs(f[0]-l[0])+Math.abs(f[1]-l[1])>1e-7)coordinates.push(f.slice());
    if(coordinates.length<5)return null;
    let area=0;for(let i=1;i<coordinates.length;i++)area+=coordinates[i-1][0]*coordinates[i][1]-coordinates[i][0]*coordinates[i-1][1];
    if(Math.abs(area)<1e-11)return null;
    return {type:'Polygon',coordinates:[coordinates]};
  }
  function toFeature(element){
    if(!element||typeof element.tags!=='object'||!element.tags?.building||element.tags.building==='no')return null;
    const geometry=polygonFromElement(element);if(!geometry)return null;
    const h=heightInfo(element.tags);
    let min=Number(String(element.tags.min_height??'').replace(/m$/i,''));if(!Number.isFinite(min)||min<0||min>=h.height)min=0;
    return {type:'Feature',id:String(element.id),geometry,properties:{osm_id:String(element.id),height_m:h.height,min_height_m:min,documented_height:h.known?1:0,height_kind:h.kind,name:String(element.tags.name??'').slice(0,120),source:'© OpenStreetMap contributors'}};
  }
  function parseResponse(data){
    if(!Array.isArray(data?.elements))throw Error('Invalid OSM response');
    const seen=new Set(),features=[];let total=0;
    for(const el of data.elements){total++;if(seen.has('w'+el.id))continue;seen.add('w'+el.id);const f=toFeature(el);if(f)features.push(f);if(features.length>=1700)break;}
    return {type:'FeatureCollection',features,meta:{received:total,shown:features.length,truncated:features.length>=1700}};
  }
  function query(center){
    const r=480;
    return `[out:json][timeout:20];way["building"](around:${r},${center.lat.toFixed(6)},${center.lon.toFixed(6)});out geom;`;
  }
  function badge(){if(typeof document==='undefined')return null;let el=document.getElementById('sm3dContextStatus');if(el)return el;const host=document.getElementById('smrealMap');if(!host)return null;
    el=document.createElement('div');el.id='sm3dContextStatus';el.className='sm3d-context-status';el.setAttribute('role','status');el.setAttribute('aria-live','polite');host.append(el);return el;
  }
  function note(message,phase){state.phase=phase||state.phase;const el=badge();if(el){el.textContent=message;el.dataset.phase=state.phase;}}
  function ensureLayer(m){if(!m?.getStyle?.()||!m.isStyleLoaded?.())return false;
    if(!m.getSource(SRC))m.addSource(SRC,{type:'geojson',data:EMPTY,attribution:'Buildings: © OpenStreetMap contributors'});
    if(!m.getLayer(LAYER)){
      const layer={id:LAYER,type:'fill-extrusion',source:SRC,minzoom:14.5,paint:{
        'fill-extrusion-color':['case',['==',['get','documented_height'],1],'#a8acaa','#d0c6b5'],
        'fill-extrusion-height':['get','height_m'],
        'fill-extrusion-base':['get','min_height_m'],
        'fill-extrusion-opacity':0.88,
        'fill-extrusion-vertical-gradient':true
      }};
      const before=m.getLayer('network-radio-towers')?'network-radio-towers':(m.getLayer('smreal-samples-display')?'smreal-samples-display':undefined);
      m.addLayer(layer,before);
    }
    return true;
  }
  function paint(m,data){if(!ensureLayer(m))return;const fc={type:'FeatureCollection',features:data.features||[]};m.getSource(SRC).setData(fc);state.records=fc.features.length;state.known=fc.features.filter(f=>f.properties.documented_height===1).length;state.estimated=state.records-state.known;
    note(`${state.records} OSM buildings in 3D · ${state.known} tagged heights · ${state.estimated} heights illustrative/estimated`,state.records?'ready':'empty');
  }
  async function fetchJson(queryText){const errors=[];
    for(const endpoint of ENDPOINTS){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),23000);
      try{const resp=await fetch(endpoint,{method:'POST',body:new URLSearchParams({data:queryText}),headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:controller.signal});
        if(!resp.ok)throw Error(`HTTP ${resp.status}`);
        const obj=await resp.json();if(obj?.remark)throw Error('Provider warning: '+String(obj.remark).slice(0,100));
        return obj;
      }catch(e){errors.push(`${new URL(endpoint).hostname}: ${e.message}`);if(/HTTP 429/.test(String(e)))break;
      }finally{clearTimeout(timer);}
    }
    throw Error(errors.join(' | ')||'OSM API unavailable');
  }
  async function loadFor(center){
    const m=state.map;if(!m||!ensureLayer(m)||!isValid(center.lat,-85,85)||!isValid(center.lon,-180,180))return;
    const key=roundCoord(center.lat)+':'+roundCoord(center.lon);
    if(state.lastKey===key&&state.phase!=='error')return;
    if(state.active)return;
    state.lastKey=key;state.lastCoordinate=center;state.attempts++;
    if(state.cache.has(key)){paint(m,state.cache.get(key));return;}
    note('Loading mapped buildings near camera · OSM heights shown when documented…','loading');
    const ticket={key};state.active=ticket;
    try{const response=await fetchJson(query(center)),geojson=parseResponse(response);
      state.cache.set(key,geojson);if(state.cache.size>12)state.cache.delete(state.cache.keys().next().value);
      if(state.active===ticket&&state.map===m){paint(m,geojson);state.processed++;}
    }catch(e){state.lastError=String(e.message||e);if(state.active===ticket){note('Buildings unavailable · terrain & antenna data unchanged. '+state.lastError.slice(0,125),'error');}}
    finally{if(state.active===ticket)state.active=null;}
  }
  function maybeLoad(){const m=state.map;if(!m||!m.isStyleLoaded?.()||!m.getCenter||m.getZoom?.()<15){return;}
    const center=centered(m.getCenter());if(state.lastCoordinate&&distanceKm(center,state.lastCoordinate)<.23&&state.phase!=='error')return;
    if(state.phase==='error'&&state.lastCoordinate&&distanceKm(center,state.lastCoordinate)<.23)return;
    loadFor(center);
  }
  let bound=null;function connect(m){if(m===bound)return;
    if(bound){bound.off?.('moveend',maybeLoad);bound.off?.('style.load',styleReady);}
    state.map=m;bound=m;state.lastKey='';state.lastCoordinate=null;
    if(!m)return;
    m.on?.('moveend',maybeLoad);m.on?.('style.load',styleReady);
    if(m.isStyleLoaded?.()){try{ensureLayer(m);maybeLoad();}catch(e){note('3D context layer unavailable: '+e.message,'error');}}
  }
  function styleReady(){try{ensureLayer(state.map);if(state.lastKey&&state.cache.has(state.lastKey))paint(state.map,state.cache.get(state.lastKey));else maybeLoad();}catch(e){note('3D context style reset: '+e.message,'error');}}
  let interval=null;function boot(){const m=global.SignalMapRealTerrain3D?.map;if(m!==bound)connect(m);}
  if(typeof document!=='undefined'){interval=setInterval(boot,900);global.addEventListener('beforeunload',()=>{clearInterval(interval);connect(null);},{once:true});boot();}
  global.SignalMap3DRealContext={heightInfo,polygonFromElement,toFeature,parseResponse,query,ensureLayer,paint,connect,loadFor,maybeLoad,get state(){return {phase:state.phase,records:state.records,known:state.known,estimated:state.estimated,lastError:state.lastError,lastCoordinate:state.lastCoordinate,attempts:state.attempts,processed:state.processed};}};
})(typeof window!=='undefined'?window:globalThis);
