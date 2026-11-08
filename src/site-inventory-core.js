/* SignalMap Site Inventory Assistant v1 — standalone, side-effect-free helpers. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SignalMapSiteInventoryCore=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const fields={
 siteLat:['site latitude','site lat','tower latitude','tower lat','antenna latitude','antenna lat','bts latitude','lat site','latitude site','bs lat','gps tower lat','site gps lat','latitude'],
 siteLon:['site longitude','site lon','site lng','tower longitude','tower lon','tower lng','antenna longitude','antenna lon','bts longitude','lon site','longitude site','bs lon','gps tower lon','site gps lon','longitude','lon','lng'],
 siteId:['site id','site code','site name','tower id','antenna id','site','bts id','bts','enodeb id','enb id','gnb id'],
 cellId:['cell id','eci','ecgi','nci','ncgi','cell identity','serving cell id','cid','cellid'],
 plmn:['plmn','plmn id','mccmnc','mcc mnc','network plmn'],
 mcc:['mcc','mobile country code'],mnc:['mnc','mobile network code'],
 operator:['operator','operator name','network operator','carrier','provider','network'],
 technology:['technology','tech','rat','network type'],
 azimuth:['azimuth','antenna azimuth','azimuth deg'],height:['antenna height','tower height','height m','height'],
 pci:['pci','psc','physical cell id'],band:['band','lte band','nr band']
};
const norm=s=>String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const normalized=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.map(norm)]));
function detect(headers,options={}){
 // Do not auto-classify generic drive-test Latitude/Longitude as a physical tower site.
 // The user can deliberately select those columns when their CSV is a real site inventory.
 const h=headers.map(x=>[x,norm(x)]),used=new Set(),result={};
 const safeGps={siteLat:new Set(['latitude','lat']),siteLon:new Set(['longitude','lon','lng'])};
 for(const [k,choices] of Object.entries(normalized)){
  const eligible=options.allowGenericGps?choices:choices.filter(a=>!safeGps[k]?.has(a));
  const match=eligible.map(a=>h.find(([original,n])=>n===a&&!used.has(original))).find(Boolean);
  result[k]=match?match[0]:'';if(match)used.add(match[0]);
 }return result;
}
function num(v){if(v==null||String(v).trim()==='')return null;const x=String(v).trim().replace(',','.');return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(x)&&Number.isFinite(+x)?+x:null;}
function convert(rows,mapping,fileName){
 const accepted=[],rejected=[],keys=new Set(),conflicts=[];const counts=new Map();
 if(!mapping.siteLat||!mapping.siteLon)return {accepted,rejected:rows.map((r,i)=>({row:i+2,reason:'Tower latitude and longitude columns not selected',data:r})),conflicts,missingMapping:true};
 if(mapping.siteLat===mapping.siteLon)return {accepted,rejected:rows.map((r,i)=>({row:i+2,reason:'Latitude and longitude cannot use the same column',data:r})),conflicts,missingMapping:true};
 for(let i=0;i<rows.length;i++){
 const r=rows[i],value=k=>mapping[k]?String(r[mapping[k]]??'').trim():'',lat=num(value('siteLat')),lon=num(value('siteLon')),site=value('siteId'),cell=value('cellId'),plmn=value('plmn'),mcc=value('mcc'),mnc=value('mnc');
 const reason=lat===null||lon===null||Math.abs(lat)>90||Math.abs(lon)>180||(lat===0&&lon===0)?'Missing or invalid tower GPS':null;
 if(reason){rejected.push({row:i+2,reason,data:r});continue;}
 const key=JSON.stringify([site,cell,lat,lon]);if(keys.has(key)){rejected.push({row:i+2,reason:'Exact duplicate site/cell coordinates',data:r});continue;}keys.add(key);
 const matchingKey=site||('Cell:'+cell);if(!counts.has(matchingKey))counts.set(matchingKey,new Set());counts.get(matchingKey).add(lat+','+lon);
 const out={site_lat:lat,site_lon:lon,site_id:site,cell_id:cell,PLMN:plmn,MCC:mcc,MNC:mnc,operator:value('operator'),technology:value('technology'),azimuth:value('azimuth'),height:value('height'),PCI:value('pci'),band:value('band'),__sm_site_source:'Site inventory: '+fileName,__sm_import_v2:'1'};
 accepted.push(out);
 }
 for(const [site,positions] of counts)if(positions.size>1)conflicts.push(`${site}: ${positions.size} different coordinates (kept separate for review)`);
 return {accepted,rejected,conflicts,missingMapping:false};
}
function inventoryStats(rows){const supplements=rows.filter(r=>r&&r.__sm_import_v2==='1');const base=rows.filter(r=>!r||r.__sm_import_v2!=='1');return {baseRows:base.length,siteRows:supplements.length,sources:[...new Set(supplements.map(r=>r.__sm_site_source))]};}
return {fields,norm,detect,num,convert,inventoryStats};
});
