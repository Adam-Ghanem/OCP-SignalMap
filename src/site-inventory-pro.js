/* SignalMap — Supplemental Site Inventory & Evidence Assistant.
   Uses the existing validated antenna map integration; never moves measurement GPS to tower GPS. */
(function(){
'use strict';
const net=window.SignalMapNetwork,core=window.SignalMapSiteInventoryCore,radio=window.SignalMapNetworkCore;
const panel=document.getElementById('networkPanel'),summary=document.getElementById('networkSummary');
if(!net||!core||!radio||!panel||!summary)return;
const $=id=>document.getElementById(id);
const nativeAnalyze=radio.analyze;
radio.analyze=(rows,options={})=>{const result=nativeAnalyze(rows,options);for(const group of result.records){const sources=[...new Set(group.rowIndices.map(i=>rows[i]?.__sm_site_source||options.filename||'Imported CSV'))];if(sources.length)group.source=sources.join(' + ');}return result;};
let supplementary=[],baseName=$('datasetFile')?.textContent?.trim()||'Measurements CSV',pendingRows=[],pendingFile='',pendingHeaders=[],working=false,observerLock=false,keepOnNewImport=false;
const ui=document.createElement('section');ui.id='networkSiteAdvisor';ui.className='network-data-advisor';ui.setAttribute('aria-label','Antenna data readiness and supplemental tower CSV');
ui.innerHTML=`<h3>📡 Antenna data assistant</h3><p>Add a separate CSV containing actual tower GPS coordinates. Keep your RSRP heatmap and all original measurement rows.</p>
<div class="network-data-badges" id="siteDataMetrics" role="status" aria-live="polite"></div>
<div id="siteDataAdvice" class="network-data-note"></div>
<div class="network-data-toolbar"><button type="button" class="primary" id="siteDataChoose">+ Add tower/site CSV</button><button type="button" id="siteDataTemplate">Download column template</button><button type="button" id="siteDataClear" disabled>Clear added sites</button><input type="file" id="siteDataFile" accept=".csv,text/csv" hidden></div><div id="siteDataFileFeedback" role="status" aria-live="polite"></div>
<div id="siteDataMapping" class="network-site-mapping" hidden><strong id="siteDataFileLabel">Tower inventory CSV</strong><p>Choose columns that represent the <b>physical tower/site GPS</b>, NOT drive-test measurement GPS. If those locations are unknown, import cells through the ordinary CSV workflow instead.</p><div class="network-data-fields" id="siteDataFields"></div><p id="siteDataGpsWarning" class="network-data-note" role="status"></p>
<div id="siteDataResult" role="status" aria-live="polite"></div>
<div class="network-data-toolbar"><button type="button" id="siteDataRejected" disabled>Export rejected rows CSV</button><button type="button" id="siteDataConflict" disabled>Export GPS conflicts</button></div>
<details class="network-validation-details"><summary>Validation breakdown &amp; reasons</summary><div id="siteDataBreakdown" role="status"></div></details>
<div class="network-site-preview"><table><thead><tr><th>Site</th><th>Cell</th><th>Site latitude</th><th>Site longitude</th><th>PLMN / operator</th></tr></thead><tbody id="siteDataPreview"></tbody></table></div>
<label class="consent"><input type="checkbox" id="siteDataConfirm"> I confirm the mapped GPS fields are supplied site/tower coordinates, not measurement positions.</label>
<label class="consent"><input type="checkbox" id="siteDataKeep"> Keep this site list when I import another measurement CSV in this session.</label>
<div class="network-data-toolbar"><button type="button" id="siteDataApply" class="primary" disabled>Import valid tower records</button><button type="button" id="siteDataCancel">Cancel</button></div></div>
<p class="network-pro-hint">Site GPS from CSV is source-supplied, not independently verified. Cell IDs or PCI alone never reveal tower GPS. Operator labels appear only with supporting metadata (PLMN/operator field).</p>`;
const anchor=panel.querySelector('#networkKPIs');panel.insertBefore(ui,anchor);
const labels={siteLat:'Tower latitude *',siteLon:'Tower longitude *',siteId:'Site ID',cellId:'Cell ID',plmn:'PLMN',mcc:'MCC',mnc:'MNC',operator:'Operator',technology:'Technology',azimuth:'Azimuth °',height:'Height m',pci:'PCI',band:'Band'};
const selectFields={};let conversion=null,validationRun=0;
const clear=el=>el.replaceChildren();
const txt=(tag,textValue)=>{const e=document.createElement(tag);e.textContent=String(textValue??'');return e;};
const status=(msg,error=false)=>{const e=$('siteDataResult');e.textContent=msg;e.style.color=error?'#a34128':'#2a7850';};
function mapping(){return Object.fromEntries(Object.entries(selectFields).map(([k,select])=>[k,select.value]));}
function evaluate(){if(!pendingRows.length)return;conversion=core.convert(pendingRows,mapping(),pendingFile);const v=conversion;validationRun++;
 const m=mapping(),generic=['latitude','lat','longitude','lon','lng'];
 const usesGeneric=core.norm(m.siteLat)&&generic.includes(core.norm(m.siteLat))||core.norm(m.siteLon)&&generic.includes(core.norm(m.siteLon));
 const gpsWarning=$('siteDataGpsWarning');
 gpsWarning.textContent=!m.siteLat||!m.siteLon?'Select both physical tower GPS columns. Generic drive-test Latitude/Longitude are deliberately not preselected.':usesGeneric?'CAUTION: Generic Latitude/Longitude selected manually. Confirm these are real physical site coordinates, not drive-test GPS.':'Tower-specific coordinate mapping selected. Check preview and source before confirming.';
 status(`${v.accepted.length} valid site/cell records · ${v.rejected.length} rejected · ${v.conflicts.length} coordinate conflicts.`+(v.conflicts.length?' Review: '+v.conflicts.slice(0,2).join('; '):''),!v.accepted.length);
 const info=$('siteDataBreakdown');info.replaceChildren();
 const counts=new Map();for(const item of v.rejected)counts.set(item.reason,(counts.get(item.reason)||0)+1);
 const items=[['Accepted site/cell rows',v.accepted.length],...Array.from(counts.entries()),['Conflicting site IDs',v.conflicts.length]];
 for(const [description,count] of items){const row=txt('div','');row.className='network-validation-reason';row.append(txt('span',description),txt('strong',count));info.append(row);}
 if(v.conflicts.length)for(const conflict of v.conflicts.slice(0,10))info.append(txt('p',conflict));
 $('siteDataRejected').disabled=!v.rejected.length;
 $('siteDataConflict').disabled=!v.conflicts.length;
 $('siteDataApply').disabled=!v.accepted.length||!$('siteDataConfirm').checked;const preview=$('siteDataPreview');clear(preview);for(const r of v.accepted.slice(0,6)){const row=document.createElement('tr');for(const x of [r.site_id||'—',r.cell_id||'—',r.site_lat,r.site_lon,r.PLMN||r.operator||'Unknown'])row.append(txt('td',x));preview.append(row);}if(!v.accepted.length){const tr=txt('tr','');const td=txt('td','No valid site GPS records in selected mapping.');td.colSpan=5;tr.append(td);preview.append(tr);}}
function makeFields(){clear($('siteDataFields'));const guesses=core.detect(pendingHeaders);for(const [name,title] of Object.entries(labels)){const l=txt('label',title),s=document.createElement('select');s.id='siteDataMap_'+name;s.setAttribute('aria-label',title);s.add(new Option('— Not provided —',''));for(const h of pendingHeaders)s.add(new Option(h,h));s.value=guesses[name]||'';s.addEventListener('change',evaluate);l.append(s);$('siteDataFields').append(l);selectFields[name]=s;}}
function readFile(file){
 if(!file)return;
 // An invalid second file must not leave the previous file's "Import" button active.
 conversion=null;pendingRows=[];pendingHeaders=[];pendingFile='';$('siteDataMapping').hidden=true;
 $('siteDataApply').disabled=true;
 const feedback=$('siteDataFileFeedback');
 const error=msg=>{feedback.textContent=msg;feedback.style.color='#9d3928';};
 if(file.size>12*1024*1024){error('File rejected: tower inventory CSV must be under 12 MB. No previous import was changed.');return;}
 if(!window.Papa){error('CSV parser unavailable: check vendor/papaparse.min.js.');return;}
 feedback.textContent='Reading '+file.name+' locally…';feedback.style.color='#2a7850';
 window.Papa.parse(file,{header:true,skipEmptyLines:'greedy',complete:r=>{
  if(r.errors?.length){error(`CSV parser found ${r.errors.length} formatting problem(s), for example: ${r.errors[0].message}. Fix this source CSV and try again.`);return;}
  const rows=r.data.filter(x=>x&&Object.values(x).some(v=>String(v??'').trim()));
  if(!rows.length){error('CSV contains no data rows. No sites imported.');return;}
  if(rows.length>25000){error(`CSV contains ${rows.length} rows, above the 25,000-row validation limit. No rows silently dropped; split into smaller site inventories.`);return;}
  pendingFile=file.name;pendingRows=rows;pendingHeaders=r.meta.fields||Object.keys(pendingRows[0]);
  $('siteDataFileLabel').textContent=`${file.name} · ${rows.length} rows`;
  makeFields();$('siteDataConfirm').checked=false;$('siteDataKeep').checked=keepOnNewImport;
  $('siteDataMapping').hidden=false;feedback.textContent='Source file loaded locally. Review column mapping and confirm physical tower GPS.';
  evaluate();$('siteDataMapping').scrollIntoView({block:'nearest',behavior:'smooth'});
 },error:e=>error('Cannot read CSV: '+e.message)});
}
function saveCombined(data,remember=true){working=true;try{supplementary=data.slice();const existing=net.raw.filter(r=>r&&r.__sm_import_v2!=='1');net.ingest(existing.concat(supplementary),baseName,{restore:true});keepOnNewImport=remember;update();}finally{working=false;}}
function setMetric(label,value){const node=txt('span',`${value} ${label}`);$('siteDataMetrics').append(node);}
function update(){const current=net.raw||[];const recognized=current.filter(r=>r&&r.__sm_import_v2==='1');if(recognized.length){supplementary=recognized.slice();}const base=current.filter(r=>!r||r.__sm_import_v2!=='1');const s=net.state||{};const sites=s.sites||[],cells=s.cells||[],records=s.records||[];clear($('siteDataMetrics'));
 setMetric('measurement/source rows',base.length);setMetric('site GPS records',sites.length);setMetric('identifiable cells',cells.filter(c=>c.type==='cell').length);setMetric('added site rows',recognized.length);for(const group of ['IAM','inwi','Orange']){const count=sites.filter(x=>x.operators.some(o=>o.group===group)).length;if(count)setMetric(group+' sites',count);}const inconsistencies=records.filter(r=>r.conflicts?.length).length;if(inconsistencies)setMetric('metadata conflict(s)',inconsistencies);
 const oldSummary=summary.textContent;const accuratePrefix=`${base.length.toLocaleString()} primary CSV rows + ${recognized.length.toLocaleString()} site inventory rows`;const adjusted=oldSummary.replace(/^\d[\d,]* original rows/,accuratePrefix);if(adjusted!==oldSummary)summary.textContent=adjusted;const box=$('siteDataAdvice');const known=sites.length,identified=cells.filter(c=>c.type==='cell').length;
 if(known){box.className='network-data-note ok';box.textContent=`${known} site location(s) available for 2D + 3D. Coordinates are supplied by CSV and not independently surveyed by this app. Check source evidence before field decisions.`;}
 else if(identified){box.className='network-data-note';box.textContent=`${identified} cell identity group(s), but no tower GPS. Dashed observation groups can be mapped; add a separate site inventory to show real tower models.`;}
 else if(base.length){box.className='network-data-note';box.textContent='This dataset contains measurements but no usable tower GPS / unique cell identifiers. It cannot reveal physical antennas by itself. Add a tower/site CSV with documented GPS.';}
 else {box.className='network-data-note';box.textContent='Import measurements or a tower/site CSV to build the network map. No positions are invented.';}
 $('siteDataClear').disabled=!recognized.length;}
function exportCSV(name,columns,rows){
 const quote=value=>{let v=String(value??'');if(/^[=+@\t\r]/.test(v)||/^-[^\d]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';};
 const csv=[columns.map(quote).join(','),...rows.map(r=>columns.map(c=>quote(r[c])).join(','))].join('\r\n');
 const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
$('siteDataRejected').onclick=()=>{if(!conversion?.rejected?.length)return;const cols=['source_row','reason',...pendingHeaders];exportCSV('signalmap_rejected_tower_rows.csv',cols,conversion.rejected.map(r=>Object.fromEntries([['source_row',r.row],['reason',r.reason],...pendingHeaders.map(c=>[c,r.data?.[c]])])));};
$('siteDataConflict').onclick=()=>{if(!conversion?.conflicts?.length)return;exportCSV('signalmap_tower_gps_conflicts.csv',['issue'],conversion.conflicts.map(issue=>({issue})));};
function template(){const file='site_id,site_lat,site_lon,cell_id,PLMN,operator,technology,azimuth,height,PCI,band\r\n';const url=URL.createObjectURL(new Blob([file],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='signalmap_tower_site_template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),800);}
$('siteDataChoose').onclick=()=>$('siteDataFile').click();$('siteDataTemplate').onclick=template;
$('siteDataFile').addEventListener('change',e=>{readFile(e.target.files?.[0]);e.target.value='';});
$('siteDataConfirm').addEventListener('change',evaluate);
$('siteDataApply').onclick=()=>{evaluate();if(!conversion?.accepted?.length||!$('siteDataConfirm').checked)return;const old=net.raw.filter(r=>!r||r.__sm_import_v2!=='1'),newRecords=conversion.accepted;working=true;try{const already=net.raw.filter(r=>r&&r.__sm_import_v2==='1');const key=r=>JSON.stringify([r.site_id,r.cell_id,r.site_lat,r.site_lon,r.PLMN,r.operator]);const seen=new Set(already.map(key));const appended=newRecords.filter(r=>{const k=key(r);if(seen.has(k))return false;seen.add(k);return true;});const combined=already.concat(appended);baseName=$('datasetFile')?.textContent?.trim()||baseName;const newCombined=old.concat(combined);supplementary=combined.slice();keepOnNewImport=$('siteDataKeep').checked;net.ingest(newCombined,baseName,{restore:true});$('siteDataMapping').hidden=true;$('siteDataFileFeedback').textContent='Site inventory imported successfully.';update();$('networkStatus').textContent=`Added ${appended.length} site entries (${newRecords.length-appended.length} duplicate records skipped); ${net.state.sites.length} tower location(s) mapped in 2D/3D. Original measurements preserved.`;}finally{working=false;}};
$('siteDataCancel').onclick=()=>{$('siteDataMapping').hidden=true;pendingRows=[];};
$('siteDataClear').onclick=()=>{working=true;try{const base=net.raw.filter(r=>!r||r.__sm_import_v2!=='1');supplementary=[];keepOnNewImport=false;$('siteDataKeep').checked=false;net.ingest(base,baseName||'Imported CSV',{restore:true});update();$('networkStatus').textContent='Supplemental tower list removed. Measurement CSV and original analysis preserved.';}finally{working=false;}};
const towerToggle=$('networkMainTowers');if(towerToggle?.parentElement){const label=towerToggle.parentElement;for(const n of [...label.childNodes])if(n.nodeType===Node.TEXT_NODE&&n.textContent.includes('Verified towers'))n.textContent=' CSV towers ';const small=label.querySelector('small');if(small)small.textContent='(source GPS)';}
const mainBar=$('networkMainFit')?.parentElement;if(mainBar){const btn=txt('button','+ Site CSV');btn.id='networkMainAddSites';btn.type='button';btn.onclick=()=>{document.getElementById('networkNav')?.click();$('siteDataChoose').scrollIntoView({behavior:'smooth',block:'center'});$('siteDataFile').click();};mainBar.prepend(btn);}
const control=document.querySelector('.network-main-controls');if(control){const wrap=document.createElement('label');wrap.className='network-operator-quick';wrap.append(txt('span','Show operator on 2D / 3D map'));const s=document.createElement('select');s.id='networkQuickOperator';s.setAttribute('aria-label','Filter map antennas by operator');for(const [v,t] of [['','All operators'],['IAM','IAM · Maroc Telecom'],['inwi','inwi'],['Orange','Orange Maroc'],['Unknown','Unknown operator'],['Other','Other']])s.add(new Option(t,v));s.value=$('networkOperator')?.value||'';s.onchange=()=>{$('networkOperator').value=s.value;$('networkOperator').dispatchEvent(new Event('change',{bubbles:true}));};$('networkOperator')?.addEventListener('change',()=>{s.value=$('networkOperator').value;});wrap.append(s);control.insertBefore(wrap,control.querySelector('div'));}
// The original import uses a closed-over ingest(), so detect its completion via the existing status summary.
// When enabled, reapply the site list after a new measurement CSV, with a strict loop guard.
const observer=new MutationObserver(()=>{if(working||observerLock)return;observerLock=true;queueMicrotask(()=>{try{if(working)return;const current=net.raw||[],extra=current.filter(r=>r&&r.__sm_import_v2==='1');if(extra.length){supplementary=extra.slice();}else if(supplementary.length&&keepOnNewImport&&current.length){baseName=document.getElementById('datasetFile')?.textContent?.trim()||baseName;working=true;try{net.ingest(current.concat(supplementary),baseName,{restore:true});}finally{working=false;}}update();}finally{observerLock=false;}});});
observer.observe(summary,{subtree:true,childList:true,characterData:true});
// Keep wrapper data available to the project's existing JSON exporter for traceability.
const originalSerialize=net.serialize,originalRestore=net.restore;
net.serialize=function(){const data=originalSerialize();data.siteInventoryMetadata={schema:'SignalMap.SiteInventoryAssistant.v1',keepOnNewImport,sources:core.inventoryStats(net.raw).sources};return data;};
net.restore=function(data){working=true;try{const ok=originalRestore(data);supplementary=(net.raw||[]).filter(r=>r&&r.__sm_import_v2==='1');keepOnNewImport=data?.siteInventoryMetadata?.keepOnNewImport===true;$('siteDataKeep').checked=keepOnNewImport;update();return ok;}finally{working=false;}};
window.SignalMapSiteAdvisor={get attached(){return supplementary.length;},get stats(){return core.inventoryStats(net.raw);},refresh:update};
update();
})();
