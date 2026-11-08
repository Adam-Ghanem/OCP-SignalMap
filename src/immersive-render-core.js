/* SignalMap Immersive: side-effect-free geographic and visual decisions.
   No tower positions are inferred. A visual minimum pixel size never modifies physical dimensions. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SignalMapImmersiveRenderCore=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const NATIVE_MODEL_HEIGHT_M=1.07583338; // actual bounds of assets/radio-tower-precision-v9.glb (Y axis)
const DEMO_HEIGHT_M=28;
const MAX_MODELS=48;
function number(v){if(v===null||v===undefined||String(v).trim()==='')return NaN;return Number(v);}
function coord(lat,lon){const a=number(lat),o=number(lon);return Number.isFinite(a)&&Number.isFinite(o)&&a>=-90&&a<=90&&o>=-180&&o<=180;}
function measuredHeight(s){const h=number(s?.height);return Number.isFinite(h)&&h>=3&&h<=250?h:null;}
function visualHeight(s){return measuredHeight(s)??DEMO_HEIGHT_M;}
function modelScale(s){return visualHeight(s)/NATIVE_MODEL_HEIGHT_M;}
function name(s){return String(s?.name||s?.siteId||s?.cellId||'Mapped structure').slice(0,90);}
function radians(deg){return deg*Math.PI/180;}
function distanceM(a,b){if(!coord(a?.lat,a?.lon)||!coord(b?.lat,b?.lon))return Infinity;const R=6371008.8,dLat=radians(+b.lat- +a.lat),dLon=radians(+b.lon- +a.lon),p1=radians(+a.lat),p2=radians(+b.lat);const h=Math.sin(dLat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
function isTelecomStructure(s){if(s?.kind==='site')return true;if(s?.kind!=='public')return false;const kind=String(s.classification||'').toLowerCase();return /telecom|mobile|communication|radio antenna/.test(kind);}
function modelSites(sites,center,selectedKey='',limit=MAX_MODELS){const pool=sites.filter(isTelecomStructure);pool.sort((a,b)=>(String(a.key)===String(selectedKey)?-1:0)-(String(b.key)===String(selectedKey)?-1:0)||distanceM(a,center)-distanceM(b,center)||String(a.key).localeCompare(String(b.key)));return new Set(pool.slice(0,Math.max(0,limit)).map(s=>String(s.key)));}
function viewPreset(preset,s){const h=visualHeight(s);switch(preset){case 'near':return {heading:35,pitch:-24,range:Math.max(100,h*4.5)};case 'top':return {heading:0,pitch:-88,range:Math.max(550,h*17)};case 'fit':return {heading:24,pitch:-43,range:Math.max(900,h*31)};default:return {heading:30,pitch:-39,range:Math.max(340,h*12)};}}
function groundSafeAltitude(elevation,visualHeightM=30){const h=number(elevation);return Number.isFinite(h)?h+Math.max(2,visualHeightM/2):null;}
function formatHemisphere(lat,lon){if(!coord(lat,lon))return 'No geographic position';return `${Math.abs(+lat).toFixed(4)}° ${+lat>=0?'N':'S'} · ${Math.abs(+lon).toFixed(4)}° ${+lon>=0?'E':'W'}`;}
function redact(error,secret){let s=String(error?.message||error||'Unknown error');if(secret)s=s.split(secret).join('[redacted]');return s.replace(/(key|token)=([^&\s]+)/gi,'$1=[redacted]').slice(0,350);}
return {NATIVE_MODEL_HEIGHT_M,DEMO_HEIGHT_M,MAX_MODELS,number,coord,measuredHeight,visualHeight,modelScale,name,distanceM,isTelecomStructure,modelSites,viewPreset,groundSafeAltitude,formatHemisphere,redact};
});
