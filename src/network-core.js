/* Pure, deterministic inventory and RF functions. No geographic inference of tower GPS. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.SignalMapNetworkCore=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const SOURCE='https://www.anrt.ma/sites/default/files/liste_codes_mnc_maroc_juin_2017.pdf';
const registry={
 '60400':['Orange Maroc','Orange','Mobile 2G/3G/4G allocation','1999'],
 '60401':['Maroc Telecom / IAM','IAM','Mobile 2G/3G/4G allocation','1994'],
 '60402':['inwi','inwi','Mobile 2G/3G/4G allocation','2009'],
 '60403':['MORATEL','Other','3RP/TETRA allocation','2004'],
 '60404':['Al Houria Telecom','Other','GMPCS / Globalstar satellite allocation','2004'],
 '60405':['inwi','inwi','Mobile CDMA allocation','2006'],
 '60406':['Maroc Telecom / IAM','IAM','Fixed CDMA allocation','2006'],
 '60407':['ONCF','Other','Independent GSM-R allocation','2016'],
 '60420':['Orange Maroc','Orange','Experimental universal-service mobile allocation','2017'],
 '60422':['inwi','inwi','Experimental universal-service mobile allocation','2017'],
 '60499':['Al Houria Telecom','Other','GMPCS / IS41 satellite allocation','2004']
};
const colors={IAM:'#287ad4',inwi:'#8b48b9',Orange:'#e77820',Other:'#467c79',Unknown:'#738078'};
const clean=x=>String(x??'').trim();
const key=x=>clean(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={
 lat:['latitude','lat','gps latitude','gpslat','latitudewgs84','y'],lon:['longitude','lon','lng','long','gps longitude','gpslon','longitudewgs84','x'],
 siteLat:['site latitude','site lat','tower latitude','tower lat','antenna latitude','antenna lat','ant lat','antenna gps latitude','bs latitude','bs lat','base station latitude','cell site latitude','cell latitude','enodeb latitude','enb lat'],
 siteLon:['site longitude','site lon','site lng','tower longitude','tower lon','tower lng','antenna longitude','antenna lon','ant lon','antenna gps longitude','bs longitude','bs lon','base station longitude','cell site longitude','cell longitude','enodeb longitude','enb lon'],
 site:['site id','site code','site name','tower id','tower name','antenna id','enodeb id','enb id','gnodeb id','gnb id'],
 cell:['ECGI','NCGI','NCI','ECI','cell id','cell identity','serving cell id','cid','ci','cellidhex'],pci:['PCI','PSC','physical cell id','physical cell identity','NR PCI','primary scrambling code'],
 mcc:['MCC','mobile country code'],mnc:['MNC','mobile network code'],plmn:['PLMN','PLMN ID','MCC MNC','MCCMNC','serving PLMN'],
 operator:['operator','network','network operator','operator name','provider','carrier'],tech:['technology','tech','RAT','network type','radio','la technologie','technologie'],
 band:['band','LTE band','NR band','frequency band','bande'],channel:['EARFCN','NRARFCN','NR ARFCN','NARFCN','ARFCN','UARFCN','DL EARFCN','channel'],
 azimuth:['azimuth','azimuth deg','antenna azimuth','bearing'],height:['antenna height','antenna height m','tower height','tower height m','site height m','height m','height'],
 rsrp:['RSRP','RSRP dBm','LTE RSRP','SS RSRP','signal dbm'],rsrq:['RSRQ','RSRQ dB','SS RSRQ'],sinr:['SINR','SINR dB','SNR','SS SINR'],
 lac:['LAC','TAC','tracking area code','location area code'],verified:['gps verified','coordinates verified','survey verified']
};
const aliasKeys=Object.fromEntries(Object.entries(aliases).map(([k,v])=>[k,v.map(key)]));
function number(v){if(v===null||v===undefined||clean(v)==='')return null;const s=clean(v).replace(/\u2212/g,'-').replace(',','.').replace(/\s*(dBm|dB|m|deg|°)$/i,'');return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)&&Number.isFinite(+s)?+s:null;}
const valid=(lat,lon)=>lat!==null&&lon!==null&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
function nameOperator(v){const s=key(v);if(['iam','maroctelecom','itissalatalmaghrib','ittissalatalmaghrib','maroctelecomiam'].includes(s))return 'IAM';if(['inwi','wana','wanacorporate'].includes(s))return 'inwi';if(['orange','orangemaroc','orangemorocco','meditelecom','meditel'].includes(s))return 'Orange';return null;}
const opName={IAM:'Maroc Telecom / IAM',inwi:'inwi',Orange:'Orange Maroc'};
function plmnValue(v){const s=clean(v);if(/^\d{5,6}$/.test(s))return s;const m=s.match(/^(\d{3})[\s/\-]+(\d{1,3})$/);return m?m[1]+m[2].padStart(2,'0'):null;}
function identify(n,options={}){
 const direct=plmnValue(n.plmn),mcc=clean(n.mcc),mnc=clean(n.mnc);
 const separate=/^\d{3}$/.test(mcc)&&/^\d{1,3}$/.test(mnc)?mcc+mnc.padStart(2,'0'):null;
 const ecgi=clean(n.cell).match(/^(\d{3})[-/](\d{2,3})[-/]\d+$/);
 const codes=[...new Set([direct,separate,ecgi?ecgi[1]+ecgi[2]:null].filter(Boolean))];
 const hits=codes.filter(c=>registry[c]),explicit=nameOperator(n.operator),conflicts=[];
 if(codes.length>1)conflicts.push('PLMN fields disagree: '+codes.join(' / '));
 if(new Set(hits.map(c=>registry[c][0])).size>1)return {name:'Unknown operator',group:'Unknown',plmn:codes.join('/'),status:'Conflicting official PLMN identities',source:SOURCE,conflicts};
 const code=hits[0]||codes[0]||'',r=registry[code];
 if(r){if(clean(n.operator)&&((explicit&&explicit!==r[1])||(!explicit&&key(n.operator)!==key(r[0]))))conflicts.push('CSV operator '+clean(n.operator)+' contradicts or cannot be reconciled with '+code);
 return {name:r[0],group:r[1],plmn:code,status:conflicts.length?'Conflict — PLMN takes priority':'Official allocation match',source:SOURCE,context:r[2],allocationYear:r[3],registryDate:'2017-06',reviewed:'2026-11-03',conflicts};}
 if(explicit&&options.trustCSV)return {name:opName[explicit],group:explicit,plmn:code,status:'Explicit CSV operator — source reported',source:options.filename||'CSV operator column',conflicts};
 return {name:'Unknown operator',group:'Unknown',plmn:code,status:explicit?'CSV name present — source trust not confirmed':code?'PLMN absent from bundled registry':'Insufficient operator evidence',source:options.filename||'CSV',claimed:clean(n.operator),conflicts};
}
function normalize(rows,options={}){
 return rows.map((raw,index)=>{const fields=new Map(Object.entries(raw).map(([k,v])=>[key(k),v]));const n={index,raw};
 for(const [field,keys] of Object.entries(aliasKeys)){n[field]='';for(const a of keys)if(fields.has(a)&&clean(fields.get(a))!==''){n[field]=fields.get(a);break;}}
 for(const f of ['lat','lon','siteLat','siteLon','height','azimuth','rsrp','rsrq','sinr'])n[f]=number(n[f]);
 for(const f of ['site','cell','pci','tech','band','channel','lac'])n[f]=clean(n[f]);
 if(n.rsrp!==null&&(n.rsrp>0||n.rsrp< -160))n.rsrp=null;
 if(n.height!==null&&(n.height<=0||n.height>1000))n.height=null;
 if(n.azimuth!==null&&(n.azimuth<0||n.azimuth>=360))n.azimuth=null;
 n.operatorEvidence=identify(n,options);n.hasSiteGPS=valid(n.siteLat,n.siteLon);n.hasMeasurement=valid(n.lat,n.lon);return n;});
}
function analyze(rows,options={}){
 const normalized=normalize(rows,options),sites=new Map(),cells=new Map(),unlocated=new Map(),unidentified=[],siteIds=new Map();
 function group(id,type,n){return {key:id,type,siteId:n.site,cellId:n.cell,pci:[],operators:[],technology:[],band:[],channel:[],azimuth:[],height:[],rowIndices:[],measurementIndices:[],source:options.filename||'Imported CSV',conflicts:[],verified:false,lat:null,lon:null,cellKeys:[],siteKeys:[]};}
 function append(g,n){g.rowIndices.push(n.index);if(n.hasMeasurement)g.measurementIndices.push(n.index);for(const f of ['pci','band','channel','azimuth','height'])if(n[f]!==''&&n[f]!==null&&!g[f].includes(n[f]))g[f].push(n[f]);if(n.tech&&!g.technology.includes(n.tech))g.technology.push(n.tech);
 if(!g.operators.some(x=>JSON.stringify(x)===JSON.stringify(n.operatorEvidence)))g.operators.push(n.operatorEvidence);
 g.verified=g.verified||/^(true|yes|1|surveyed)$/i.test(clean(n.verified));
 }
 for(const n of normalized){
 let s=null,c=null;
 if(n.hasSiteGPS){const gps=n.siteLat+','+n.siteLon;const id='site:'+JSON.stringify([n.site||null,gps]);if(!sites.has(id))sites.set(id,group(id,'site',n));s=sites.get(id);s.lat=n.siteLat;s.lon=n.siteLon;append(s,n);if(n.site){if(!siteIds.has(n.site))siteIds.set(n.site,new Set());siteIds.get(n.site).add(gps);}}
 if(n.cell){const scope=n.operatorEvidence.plmn||n.operatorEvidence.group;const id='cell:'+JSON.stringify([scope,n.tech,n.lac,n.cell]);if(!cells.has(id))cells.set(id,group(id,'cell',n));c=cells.get(id);append(c,n);}
 else if(n.pci){const id='observation:'+JSON.stringify([n.operatorEvidence.plmn,n.tech,n.channel,n.lac,n.pci,n.site]);if(!cells.has(id)){const g=group(id,'observation',n);g.conflicts.push('PCI/PSC is reused; this observation group is not a globally identified cell.');cells.set(id,g);}c=cells.get(id);append(c,n);}
 if(!s&&n.site){const id='site-observation:'+JSON.stringify([n.site,n.operatorEvidence.plmn||n.operatorEvidence.group]);if(!unlocated.has(id)){const g=group(id,'site-observation',n);g.locationConfidence='Site identified — tower position unknown';unlocated.set(id,g);}const u=unlocated.get(id);append(u,n);if(c&&!u.cellKeys.includes(c.key))u.cellKeys.push(c.key);}
 if(s&&c){if(!s.cellKeys.includes(c.key))s.cellKeys.push(c.key);if(!c.siteKeys.includes(s.key))c.siteKeys.push(s.key);}
 if(!s&&!c&&!n.site)unidentified.push(n.index);
 }
 for(const s of sites.values()){if(s.siteId&&siteIds.get(s.siteId).size>1)s.conflicts.push('Site ID has multiple coordinate pairs; retained as separate locations.');s.locationConfidence=s.verified?'CSV reports surveyed GPS (not independently checked)':'Explicit CSV site GPS (not independently verified)';}
 for(const c of cells.values()){if(c.siteKeys.length===1){const s=sites.get(c.siteKeys[0]);c.lat=s.lat;c.lon=s.lon;c.locationConfidence=s.locationConfidence;}else {c.locationConfidence=c.siteKeys.length>1?'Conflicting tower locations — inspect linked sites':'Measurement-derived — tower position unknown';if(c.siteKeys.length>1)c.conflicts.push('Cell links to more than one site coordinate.');}}
 const records=[...sites.values(),...unlocated.values(),...cells.values()];
 for(const g of records){const vals=g.rowIndices.map(i=>normalized[i].rsrp).filter(x=>x!==null);g.rsrp={count:vals.length,mean:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,min:vals.length?vals.reduce((a,b)=>Math.min(a,b),Infinity):null,max:vals.length?vals.reduce((a,b)=>Math.max(a,b),-Infinity):null};g.count=g.rowIndices.length;g.conflicts.push(...new Set(g.operators.flatMap(x=>x.conflicts)));}
 for(const g of records){g.classification=g.type==='site'?'CSV tower — explicit site GPS':valid(g.lat,g.lon)?'Cell linked to explicit CSV site GPS':'Measurement-derived observation — tower GPS unknown';g.observation=observation(g.measurementIndices.map(i=>normalized[i]));}
 return {rows:normalized,sites:[...sites.values()],unlocatedSites:[...unlocated.values()],cells:[...cells.values()],records,unidentified,identifiableCells:[...cells.values()].filter(c=>c.type==='cell').length};
}
/* Observation geometry is separate from physical lat/lon. It must never become tower GPS. */
function observation(rows){const points=rows.filter(n=>n.hasMeasurement);if(!points.length)return null;const lat=points.reduce((a,p)=>a+p.lat,0)/points.length;const sx=points.reduce((a,p)=>a+Math.cos(p.lon*Math.PI/180),0),sy=points.reduce((a,p)=>a+Math.sin(p.lon*Math.PI/180),0),lon=Math.atan2(sy,sx)*180/Math.PI;
 const unique=[...new Map(points.map(p=>{let x=p.lon;while(x-lon>180)x-=360;while(x-lon< -180)x+=360;return [x+','+p.lat,[x,p.lat]];})).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);const lower=[],upper=[];
 for(const p of unique){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
 for(const p of unique.slice().reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
 const hull=unique.length>1?lower.slice(0,-1).concat(upper.slice(0,-1)):unique;
 const geometry=hull.length>=3?{type:'Polygon',coordinates:[[...hull,hull[0]]]}:hull.length===2?{type:'LineString',coordinates:hull}:{type:'Point',coordinates:unique[0]};
 return {lat,lon,geometry,pointCount:points.length,uniqueCount:unique.length,meaning:'Mean observed GPS / convex hull of samples — not tower GPS or a predicted coverage boundary'};
}
function publicRecord(o){const evidence=identify({operator:o.operator},{trustCSV:true,filename:o.sourceUrl||'OpenStreetMap'});evidence.status=evidence.group==='Unknown'?'Public metadata insufficient for operator identification':'Source-attributed public operator metadata';evidence.source=o.sourceUrl||'OpenStreetMap';
 return {key:'public:'+o.id,type:'public',publicId:o.id,siteId:o.name||o.id,cellId:'',lat:o.lat,lon:o.lon,pci:[],operators:[evidence],technology:[],band:[],channel:[],azimuth:[],height:o.height?[o.height]:[],rowIndices:[],measurementIndices:[],source:o.sourceUrl||'OpenStreetMap',conflicts:[],verified:false,cellKeys:[],siteKeys:[],locationConfidence:'Publicly mapped coordinates — crowdsourced, not independently verified',classification:'Public mapped infrastructure',count:0,rsrp:{count:0,mean:null,min:null,max:null},observation:null,publicData:o};
}
function features(groups){return {type:'FeatureCollection',features:groups.map(g=>({type:'Feature',id:g.key,geometry:valid(g.lat,g.lon)?{type:'Point',coordinates:[g.lon,g.lat]}:null,properties:{key:g.key,category:g.type,classification:g.classification,observation_center:g.observation?[g.observation.lon,g.observation.lat]:null,observation_geometry:g.observation?.geometry||null,site_id:g.siteId,cell_id:g.cellId,pci:g.pci.join(';'),operator:g.operators.map(x=>x.name).join(';'),operator_evidence:g.operators,technology:g.technology.join(';'),location_confidence:g.locationConfidence,measurement_count:g.measurementIndices.length,mean_rsrp:g.rsrp.mean,source:g.source,conflicts:g.conflicts}}))};}
function csv(groups){const cols=['category','classification','site_id','cell_id','pci','operator','technology','latitude','longitude','location_confidence','measurement_count','mean_rsrp','source','operator_evidence'];const esc=v=>{let s=typeof v==='object'?JSON.stringify(v):String(v??'');if(/^[=+@\t\r]/.test(s)||/^-[^\d]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};return cols.join(',')+'\r\n'+features(groups).features.map(f=>cols.map(c=>esc(c==='latitude'?f.geometry?.coordinates[1]:c==='longitude'?f.geometry?.coordinates[0]:f.properties[c])).join(',')).join('\r\n');}
function kml(groups,rows=[]){
 const xml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const styles=Object.entries(colors).map(([name,hex])=>{const rgb=hex.slice(1);return `<Style id="op-${name}"><IconStyle><color>ff${rgb.slice(4,6)}${rgb.slice(2,4)}${rgb.slice(0,2)}</color><scale>1</scale></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style>`;}).join('');
 const placemarks=groups.map(g=>{const known=valid(g.lat,g.lon),label=g.type==='public'?'Public structure '+g.siteId:g.type==='site'||g.type==='site-observation'?'Site '+(g.siteId||'CSV coordinates'):'Cell '+(g.cellId||g.pci.join('/'));
 const observed=g.measurementIndices.map(i=>rows[i]).filter(n=>n&&n.hasMeasurement);const positions=[...new Map(observed.map(n=>[n.lon+','+n.lat,[n.lon,n.lat]])).values()];
 const point=([lon,lat])=>`<Point><altitudeMode>clampToGround</altitudeMode><coordinates>${lon},${lat},0</coordinates></Point>`;
 const geometry=known?point([g.lon,g.lat]):positions.length?'<MultiGeometry>'+positions.map(point).join('')+'</MultiGeometry>':'';
 const properties={category:g.type,classification:g.classification,site_id:g.siteId,cell_id:g.cellId,operator:g.operators.map(o=>o.name).join('; '),operator_evidence:JSON.stringify(g.operators),technology:g.technology.join('; '),pci:g.pci.join('; '),location_confidence:g.locationConfidence,measurement_count:g.measurementIndices.length,mean_rsrp:g.rsrp.mean,source:g.source,conflicts:g.conflicts.join('; '),geometry_meaning:known?(g.type==='public'?'Publicly mapped infrastructure coordinates':'Explicit CSV site coordinates'):'Observed measurement GPS only; tower position unknown'};
 return `<Placemark><name>${xml(known?label:'Observed / unlocated — '+label)}</name><description>${xml((known?g.locationConfidence:'Measurement-derived — tower position unknown. No antenna coordinates inferred.')+' Source: '+g.source)}</description><styleUrl>#op-${g.operators[0]?.group||'Unknown'}</styleUrl><ExtendedData>${Object.entries(properties).map(([name,value])=>`<Data name="${xml(name)}"><value>${xml(value)}</value></Data>`).join('')}</ExtendedData>${geometry}</Placemark>`;
 }).join('');
 return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>SignalMap antenna network inventory</name><description>Source-attributed CSV inventory. Measurement locations are not tower positions. Heights clamp to Google Earth's terrain; the supplied GLB is rendered in SignalMap, not embedded in KML.</description>${styles}${placemarks}</Document></kml>`;
}
function haversine(a,b){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2)));}
function predict(site,p,radio){for(const f of ['frequency','power','gain','azimuth','tilt','height','exponent'])if(!Number.isFinite(radio[f]))throw Error('Explicit radio parameter required: '+f);if(radio.frequency<=0||radio.height<=0||radio.exponent<1||radio.exponent>6||radio.azimuth<0||radio.azimuth>=360||radio.tilt< -20||radio.tilt>90)throw Error('Radio parameter outside documented range');
 const distance=Math.max(100,haversine(site,p)),r=Math.PI/180,dl=(p.lon-site.lon)*r;
 const bearing=(Math.atan2(Math.sin(dl)*Math.cos(p.lat*r),Math.cos(site.lat*r)*Math.sin(p.lat*r)-Math.sin(site.lat*r)*Math.cos(p.lat*r)*Math.cos(dl))/r+360)%360;
 const delta=Math.abs(((bearing-radio.azimuth+540)%360)-180),vertical=Math.atan2(radio.height-1.5,distance)/r;
 const attenuation=Math.min(30,12*(delta/65)**2+12*((vertical-radio.tilt)/10)**2);
 const loss=32.44+20*Math.log10(radio.frequency)+20*Math.log10(.1)+10*radio.exponent*Math.log10(distance/100);
 return radio.power+radio.gain-loss-attenuation;
}
return {registry,registrySource:SOURCE,colors,aliases,key,number,valid,identify,normalize,analyze,observation,publicRecord,features,csv,kml,haversine,predict};
});
