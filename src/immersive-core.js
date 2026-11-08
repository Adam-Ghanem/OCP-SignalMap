(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SignalMapImmersiveCore=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const PLMN={'60400':'Orange','60401':'IAM','60402':'inwi'};
const norm=s=>String(s??'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={lat:['towerlat','towerlatitude','sitelat','sitelatitude','antennalat','antennalatitude','bslat','latitudeantenne','latitudeantenna'],lon:['towerlon','towerlongitude','sitelon','sitelongitude','antennalon','antennalongitude','bslon','longitudeantenne','longitudeantenna'],op:['operator','networkoperator','operateur','network','mno'],plmn:['plmn','mccmnc','mccmncid'],mcc:['mcc'],mnc:['mnc'],siteId:['siteid','sitecode','towerid','antennasite','sitename','site'],cellId:['cellid','eci','ecgi','nci'],technology:['technology','rat','tech'],height:['towerheight','antennaheight','antennaheightm','towerheightm','siteheight','heightm'],sector:['azimuth','bearing','sectorazimuth']};
function valid(lat,lon){if(lat===null||lat===undefined||lon===null||lon===undefined||String(lat).trim()===''||String(lon).trim()==='')return false;const a=Number(lat),o=Number(lon);return Number.isFinite(a)&&Number.isFinite(o)&&a>=-90&&a<=90&&o>=-180&&o<=180;}
function opGroup(name='',plmn=''){
 const raw=String(plmn||'').replace(/[^0-9]/g,'');if(PLMN[raw])return {group:PLMN[raw],evidence:'PLMN '+raw};
 const n=norm(name);if(/(^iam$|maroctelecom|itissalat|moroccotelecom)/.test(n))return {group:'IAM',evidence:'CSV operator'};
 if(/inwi|wana/.test(n))return {group:'inwi',evidence:'CSV operator'};
 if(/orange|meditel|meditelecom/.test(n))return {group:'Orange',evidence:'CSV operator'};
 return {group:'Unknown',evidence:'No supported operator evidence'};
}
function mapping(keys){let out={};for(const [k,refs] of Object.entries(aliases)){out[k]=keys.find(h=>refs.includes(norm(h)))||null;}return out;}
function parseCSV(txt){const rows=[];let row=[],field='',inQuote=false;for(let i=0;i<txt.length;i++){let c=txt[i];if(c==='"'){if(inQuote&&txt[i+1]==='"'){field+='"';i++;}else inQuote=!inQuote;}else if((c===','||c===';'||c==='\t')&&!inQuote){row.push(field);field='';}else if((c==='\r'||c==='\n')&&!inQuote){if(c==='\r'&&txt[i+1]==='\n')i++;row.push(field);field='';if(row.some(v=>v.trim()))rows.push(row);row=[];}else field+=c;}if(field||row.length){row.push(field);rows.push(row);}if(!rows.length)return[];
 // Parse using delimiter detected in first line, not any separator encountered.
 const firstLine=txt.split(/\r?\n/,1)[0];const counts=[',',';','\t'].map(d=>[d,(firstLine.match(new RegExp(d==='\t'?'\\t':d===';'?';':',','g'))||[]).length]);counts.sort((a,b)=>b[1]-a[1]);const sep=counts[0][0];
 function split(line){const out=[];let s='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){s+='"';i++;}else q=!q;}else if(c===sep&&!q){out.push(s);s='';}else s+=c;}out.push(s);return out;}
 const lines=txt.replace(/^\ufeff/,'').split(/\r?\n/);let logical=[],buffer='',q=false;for(const line of lines){if(buffer)buffer+='\n';buffer+=line;const quoted=(buffer.match(/"/g)||[]).length; // works for balanced escaped quotes
 if(quoted%2===0){logical.push(split(buffer));buffer='';}}if(buffer)logical.push(split(buffer));
 const headers=logical.shift()?.map(v=>v.trim())||[];return logical.filter(r=>r.some(v=>v.trim())).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]||''])));
}
function fromCSV(text){const rows=parseCSV(text);if(!rows.length)return {sites:[],rejected:0,rows:0,mapping:{}};const m=mapping(Object.keys(rows[0]));const sites=[],keys=new Set();let rejected=0;
 for(const row of rows){const rawLat=m.lat?row[m.lat]:null,rawLon=m.lon?row[m.lon]:null;const lat=rawLat===null||String(rawLat).trim()===''?NaN:Number(rawLat),lon=rawLon===null||String(rawLon).trim()===''?NaN:Number(rawLon);if(!valid(lat,lon)){rejected++;continue;}const siteId=String(row[m.siteId]||'').trim(), cellId=String(row[m.cellId]||'').trim();const geo=`${lat.toFixed(6)}:${lon.toFixed(6)}`;const key=[siteId||cellId||'site',geo].join('@');if(keys.has(key))continue;keys.add(key);
 const mcc=String(row[m.mcc]||''),mnc=String(row[m.mnc]||'');const p=(m.plmn?String(row[m.plmn]):(mcc?mcc+mnc.padStart(2,'0'):''));const op=opGroup(row[m.op],p);
 sites.push({key,name:siteId||cellId||'Site '+(sites.length+1),siteId,cellId,lat,lon,kind:'site',group:op.group,operator:op.group,operatorSource:op.evidence,height:m.height&&+row[m.height]>0&&+row[m.height]<600?+row[m.height]:null,technology:String(row[m.technology]||''),source:'Imported site CSV; explicit site GPS',positionStatus:'Explicit site coordinate columns',classification:'CSV site with dedicated antenna GPS'});
 }return {sites,rejected,rows:rows.length,mapping:m};}
function fromGeoJSON(obj){if(obj?.type!=='FeatureCollection'||!Array.isArray(obj.features))throw Error('Expected GeoJSON FeatureCollection');let sites=[],rejected=0;
 for(const [i,f] of obj.features.entries()){const p=f.geometry?.coordinates||[];if(f.geometry?.type!=='Point'||!valid(p[1],p[0])){rejected++;continue;}const props=f.properties||{};if(!['site','public'].includes(String(props.kind||''))&&!props.siteId&&!props.classification){rejected++;continue;}const op=opGroup(props.operator,props.plmn);sites.push({key:String(props.siteId||props.id||i),name:String(props.name||props.siteId||'Public site'),siteId:String(props.siteId||''),cellId:String(props.cellId||''),lat:+p[1],lon:+p[0],group:op.group,operator:props.operator||op.group,operatorSource:op.evidence,kind:props.kind==='public'?'public':'site',height:Number.isFinite(+props.height)&&+props.height>0?+props.height:null,source:String(props.source||'Imported GeoJSON'),positionStatus:String(props.positionStatus||'Mapped GPS coordinates'),classification:String(props.classification||'Imported geographic point')});}
 return{sites,rejected};}
function sanitizePayload(p){const sites=[],obs=[],usedKeys=new Map();const src=Array.isArray(p?.sites)?p.sites:[];for(const [i,s] of src.slice(0,5000).entries()){if(!valid(s.lat,s.lon))continue;const g=opGroup(s.group||s.operator);
 const rawKey=String(s.key||i).slice(0,135),geoKey=`${(+s.lat).toFixed(6)}:${(+s.lon).toFixed(6)}`;
 let uniqueKey=rawKey,conflict=false;
 if(usedKeys.has(rawKey)){
  if(usedKeys.get(rawKey)===geoKey)continue; // repeat of same mapped site
  conflict=true;uniqueKey=`${rawKey}@${geoKey}`;
  let n=2;while(usedKeys.has(uniqueKey))uniqueKey=`${rawKey}@${geoKey}#${n++}`;
 }
 usedKeys.set(rawKey,usedKeys.get(rawKey)||geoKey);usedKeys.set(uniqueKey,geoKey);
 sites.push({key:uniqueKey,name:String(s.name||s.siteId||'Site').slice(0,160),siteId:String(s.siteId||'').slice(0,100),cellId:String(s.cellId||'').slice(0,100),lat:+s.lat,lon:+s.lon,group:g.group,operator:s.operator||g.group,source:String(s.source||'CSV inventory').slice(0,200),kind:s.kind==='public'?'public':'site',height:Number.isFinite(+s.height)&&+s.height>0?+s.height:null,technology:String(s.technology||'').slice(0,80),classification:String(s.classification||'').slice(0,160),positionStatus:(String(s.positionStatus||'').slice(0,130)+(conflict?' · duplicated ID at different GPS; verify':'')).slice(0,180)});}
 for(const [i,s] of (Array.isArray(p?.observations)?p.observations:[]).slice(0,5000).entries()){if(valid(s.lat,s.lon))obs.push({key:String(s.key||i),name:String(s.name||s.cellId||'Observed cell'),lat:+s.lat,lon:+s.lon,group:opGroup(s.group||s.operator).group,kind:'observed-cell',source:'CSV measurements, not tower GPS'});}
 return{sites,observations:obs,center:valid(p?.center?.lat,p?.center?.lon)?p.center:(sites[0]||obs[0]||{lat:32.667706,lon:-6.715322})};}
return {valid,opGroup,mapping,parseCSV,fromCSV,fromGeoJSON,sanitizePayload};
});
