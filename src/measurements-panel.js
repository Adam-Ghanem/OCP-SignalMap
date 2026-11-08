/* SignalMap · Measurements workspace (v18)
   Progressive enhancement only: original CSV parser, renderer, map and filters remain authoritative.
   No sample readings or inferred antenna locations are created. */
(function () {
  'use strict';
  function init() {
    const dock=document.querySelector('.data-dock');
    const view=document.getElementById('measurementsView');
    const body=document.getElementById('measurementRows');
    if (!dock || !view || !body || document.getElementById('smMeasureEmpty')) return;

    const style=document.createElement('link');
    style.rel='stylesheet';
    style.href='./src/measurements-panel.css';
    document.head.appendChild(style);

    const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h4M8 13h8M8 17h5"/></svg>';
    view.insertAdjacentHTML('afterbegin', `
      <div id="smMeasureOverview" class="sm-measure-overview" hidden>
        <div><span class="sm-measure-label">DATA WORKSPACE</span><h3>Measurement explorer</h3><p>Inspect individual signal readings in the selected technology and metric.</p></div>
        <div class="sm-measure-data-stats">
          <span class="sm-measure-pill" id="smMeasureCount" aria-live="polite">Measurements loaded</span>
          <span class="sm-measure-pill weak" title="Weak readings in the current map dataset"><i></i><strong id="smMeasureWeak">0</strong> weak</span>
          <span class="sm-measure-pill good" title="Good readings in the current map dataset"><i></i><strong id="smMeasureGood">0</strong> good</span>
          <span class="sm-measure-pill excellent" title="Excellent readings in the current map dataset"><i></i><strong id="smMeasureExcellent">0</strong> excellent</span>
          <button id="smMeasureExport" class="sm-measure-btn" type="button" title="Download measurements matching the current filters as CSV">Export filtered CSV</button>
        </div>
      </div>
      <section id="smMeasureEmpty" class="sm-measure-empty" role="status" aria-label="Measurement workspace status" hidden>
        <div class="sm-measure-main">
          <div class="sm-measure-glyph">${icon}</div>
          <div>
            <span class="sm-measure-label" id="smMeasureEmptyEyebrow">READY FOR YOUR DATA</span>
            <h2 id="smMeasureEmptyTitle">Turn field measurements into insights</h2>
            <p id="smMeasureEmptyText">Import a CSV with GPS coordinates and signal values to explore coverage, quality and network performance. Your measurements stay in your browser.</p>
            <div class="sm-measure-actions">
              <button class="sm-measure-btn primary" id="smMeasureUpload" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/></svg>
                Import a CSV
              </button>
              <button class="sm-measure-btn" id="smMeasureGuide" type="button">CSV requirements</button>
              <button class="sm-measure-btn" id="smMeasureClear" type="button" hidden>Clear filters</button>
            </div>
          </div>
        </div>
        <div class="sm-measure-guide" aria-hidden="true">
          <div class="sm-measure-step"><em>01</em><div><b>Import</b><span>Choose a survey CSV with GPS coordinates.</span></div></div>
          <div class="sm-measure-step"><em>02</em><div><b>Validate</b><span>Check the metrics and quality breakdown.</span></div></div>
          <div class="sm-measure-step"><em>03</em><div><b>Explore</b><span>Inspect readings on the map and in the table.</span></div></div>
        </div>
      </section>
    `);

    const $=id=>document.getElementById(id);
    const empty=$('smMeasureEmpty'), overview=$('smMeasureOverview');
    const upload=$('smMeasureUpload'), guide=$('smMeasureGuide'), clear=$('smMeasureClear'), exportButton=$('smMeasureExport');
    function importCSV() {
      const file=$('csvFile');
      if (!file) return;
      file.value='';
      file.click();
    }
    upload.addEventListener('click',importCSV);
    guide.addEventListener('click',()=>$('helpBtn')?.click());
    clear.addEventListener('click',()=>{
      const search=$('tableSearch'),quality=$('qualityFilter'),weakOnly=$('weakOnly');
      if(search) search.value='';
      if(quality) quality.value='all';
      if(weakOnly && weakOnly.checked) {
        weakOnly.checked=false;
        weakOnly.dispatchEvent(new Event('change',{bubbles:true}));
      }
      if(typeof renderTable==='function') renderTable(true);
      else {
        search?.dispatchEvent(new Event('input',{bubbles:true}));
        quality?.dispatchEvent(new Event('change',{bubbles:true}));
      }
      search?.focus();
    });

    function csvText(value, forceText=false) {
      const raw=String(value??'');
      // Guard spreadsheet viewers against formula injection from imported free-text columns.
      const safe=forceText && /^\s*[=+@-]/.test(raw) ? "'"+raw : raw;
      return '"'+safe.replace(/"/g,'""')+'"';
    }
    exportButton.addEventListener('click',()=>{
      if(typeof filteredTableRows!=='function') return;
      const rows=filteredTableRows();
      if(!rows.length) return;
      const metric=$('metric')?.value || 'Signal';
      const lines=[['index','timestamp','latitude','longitude','technology','metric','signal_value','quality','location'].join(',')];
      rows.forEach(({row,index,details})=>{
        lines.push([
          index+1,csvText(details.stamp,true),Number(row.lat).toFixed(6),Number(row.lon).toFixed(6),
          csvText(row.tech,true),csvText(metric,true),Number(row.val).toFixed(1),
          csvText(details.quality,true),csvText(details.location,true)
        ].join(','));
      });
      const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download='SignalMap_measurements_filtered.csv';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    });

    function sync() {
      const noRows=!!body.querySelector('tr .table-empty');
      const text=body.querySelector('tr .table-empty')?.textContent || '';
      const noImport=noRows && /No measurements yet/i.test(text);
      dock.classList.toggle('sm-measure-is-empty',noRows);
      empty.hidden=!noRows;
      overview.hidden=noRows;
      if(noRows) {
        $('smMeasureEmptyEyebrow').textContent=noImport?'READY FOR YOUR DATA':'REFINE YOUR SEARCH';
        $('smMeasureEmptyTitle').textContent=noImport?'Turn field measurements into insights':'No matching measurements';
        $('smMeasureEmptyText').textContent=noImport
          ?'Import a CSV with GPS coordinates and signal values to explore coverage, quality and network performance. Your measurements stay in your browser.'
          :'No records match the selected search, quality or technology filters. Clear the filters or adjust your selection to see the results.';
        upload.hidden=!noImport;
        guide.hidden=!noImport;
        clear.hidden=noImport;
      } else {
        $('smMeasureCount').textContent=$('pageInfo')?.textContent || 'Measurements loaded';
        for(const [out,id] of [['smMeasureWeak','kpiWeak'],['smMeasureGood','kpiGood'],['smMeasureExcellent','kpiExcellent']]) {
          $(out).textContent=$(id)?.textContent || '0';
        }
      }
      exportButton.disabled=noRows;
    }
    let pending=false;
    function scheduleSync() {
      if(pending) return;
      pending=true;
      requestAnimationFrame(()=>{pending=false;sync();});
    }
    const observer=new MutationObserver(scheduleSync);
    observer.observe(body,{childList:true});
    // The table renderer updates rows on CSV imports, technology changes and filter edits.
    sync();
    window.SignalMapMeasurementsUI={version:'18.0',sync};
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
