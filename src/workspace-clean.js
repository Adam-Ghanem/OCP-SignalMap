/* SignalMap workspace cleanup: presentation-only navigation for existing tools.
   Moves existing buttons instead of cloning them, preserving their original event handlers. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const TAB_GROUPS = [
    {id:'overview', label:'Overview', ids:['measurementsTab','qualityTab','smxValidateTab','smpProjectsTab','smpReportTab']},
    {id:'coverage', label:'Coverage', ids:['smxWeakTab','smxCompareTab','smfScoreTab','smpDiagnosticsTab','smpConfidenceTab']},
    {id:'field', label:'Field tools', ids:['smfReplayTab','smfAreaTab','smnSwipeTab','smnChartsTab']},
    {id:'network', label:'Network & 3D', ids:['smnCellsTab','networkDockTab','smtTwinTab','smnPlannerTab','smnOfflineTab','smnTestsTab']}
  ];
  const QUICK_GROUPS = [
    {name:'Coverage analysis', open:true, ids:['smxWeakJump','smxCompareJump','smfScoreJump','smpDiagJump','smpConfidenceJump']},
    {name:'Survey & import', ids:['smxValidateJump','smfReplayJump','smfAreaJump','smpWizardJump']},
    {name:'Network & engineering', ids:['smnJumpCells','smnJumpSwipe','smnJumpCharts','smnJumpPlanner','smnJumpOffline','smtJumpTwin']},
    {name:'Workspace & quality', ids:['smpProjectJump','smpReportJump','smnJumpTests']}
  ];
  function init() {
    if (document.documentElement.dataset.smCleanInit) return;
    const dock=document.querySelector('.data-dock'), toolbar=dock?.querySelector('.dock-toolbar'), tabs=toolbar?.querySelector('.dock-tabs');
    const actionList=document.querySelector('.smx-field-section .smx-action-list');
    if (!dock || !toolbar || !tabs || !actionList) return;
    document.documentElement.dataset.smCleanInit='1';
    document.documentElement.classList.add('sm-clean');
    document.body.classList.add('sm-clean');

    // Organize the original sidebar actions. Never replace their IDs or click listeners.
    actionList.classList.add('sm-clean-action-list');
    QUICK_GROUPS.forEach((group,i)=>{
      const available=group.ids.map($).filter(btn=>btn && actionList.contains(btn));
      if (!available.length) return;
      const details=document.createElement('details');
      details.className='sm-clean-quick-group';
      details.open=!!group.open;
      const summary=document.createElement('summary');
      const label=document.createElement('span');label.textContent=group.name;
      const count=document.createElement('span');count.className='sm-clean-count';count.textContent=String(available.length);
      summary.append(label,count);
      const content=document.createElement('div');content.className='sm-clean-quick-items';
      available.forEach(btn=>content.appendChild(btn));
      details.append(summary,content);
      actionList.appendChild(details);
      details.addEventListener('toggle',()=>{
        if (!details.open) return;
        actionList.querySelectorAll('.sm-clean-quick-group').forEach(other=>{
          if (other!==details) other.open=false;
        });
      });
    });
    const title=document.querySelector('.smx-field-section .section-heading h2');
    if(title)title.textContent='Workspace tools';
    const badge=document.querySelector('.smx-field-section .section-heading .smx-pill');
    if(badge)badge.textContent='Organized by task';

    // Retain the real dock tab buttons. Their ARIA tab/tabpanel relationships and
    // original event listeners stay intact; categories merely filter visibility.
    const toolsRow=document.createElement('div');toolsRow.className='sm-clean-tools-row';
    const tableControls=toolbar.querySelector('.table-controls');
    toolsRow.appendChild(tabs);
    if(tableControls)toolsRow.appendChild(tableControls);
    const categories=document.createElement('div');categories.className='sm-clean-categories';
    categories.setAttribute('role','group');categories.setAttribute('aria-label','Analysis tool categories');
    TAB_GROUPS.forEach(group=>{
      const btn=document.createElement('button');btn.type='button';btn.className='sm-clean-category';btn.textContent=group.label;
      btn.dataset.category=group.id;btn.setAttribute('aria-pressed',group.id==='overview'?'true':'false');
      btn.addEventListener('click',()=>{
        showGroup(group.id);
        const active=Array.from(tabs.querySelectorAll('button[role="tab"]'))
          .find(tab=>tab.getAttribute('aria-selected')==='true' && groupForTab(tab.id)===group.id);
        if (!active) group.ids.map($).find(tab=>tab && tabs.contains(tab))?.click();
      });
      categories.appendChild(btn);
    });
    toolbar.append(categories,toolsRow);
    toolbar.classList.add('sm-clean-toolbar');

    const groupForTab=(id)=>TAB_GROUPS.find(g=>g.ids.includes(id))?.id || 'network';
    let currentCategory='overview';
    function showGroup(category){
      currentCategory=category;
      Array.from(tabs.querySelectorAll('button[role="tab"]')).forEach(tab=>{
        tab.hidden=groupForTab(tab.id)!==category;
      });
      categories.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
      if(tableControls){
        const active=tabs.querySelector('button[aria-selected="true"]');
        tableControls.hidden=category!=='overview'||active?.id!=='measurementsTab';
      }
    }
    // Listen AFTER original tab handlers. Capturing the click and hiding a tab before
    // its own handler runs can prevent tool activation in Chromium.
    tabs.addEventListener('click',e=>{
      const tab=e.target.closest('button[role="tab"]');
      if(tab) showGroup(groupForTab(tab.id));
    });
    const quickTabMap={
      smxWeakJump:'smxWeakTab',smxCompareJump:'smxCompareTab',smxValidateJump:'smxValidateTab',
      smfScoreJump:'smfScoreTab',smfReplayJump:'smfReplayTab',smfAreaJump:'smfAreaTab',
      smpDiagJump:'smpDiagnosticsTab',smpConfidenceJump:'smpConfidenceTab',
      smpProjectJump:'smpProjectsTab',smpReportJump:'smpReportTab',
      smnJumpCells:'smnCellsTab',smnJumpSwipe:'smnSwipeTab',smnJumpCharts:'smnChartsTab',
      smnJumpPlanner:'smnPlannerTab',smnJumpOffline:'smnOfflineTab',
      smtJumpTwin:'smtTwinTab',smnJumpTests:'smnTestsTab'
    };
    actionList.addEventListener('click',e=>{
      const button=e.target.closest('button.smx-action');
      const tabId=button && quickTabMap[button.id];
      if(tabId) showGroup(groupForTab(tabId));
    });
    ['navMap','navAnalysis'].forEach(id=>$(id)?.addEventListener('click',()=>showGroup('overview')));
    showGroup('overview');

    // A visible, honest explanation of when a 3D tower can be rendered.
    const real3D=$('smrealSection');
    if(real3D && !document.getElementById('smCleanTerrainNote')){
      const note=document.createElement('p');note.id='smCleanTerrainNote';note.className='sm-clean-terrain-note';
      note.innerHTML='<strong>3D site accuracy:</strong> Radio Tower models require documented site coordinates. CSV measurement points and observed cells remain distinct markers. DEM and satellite layers require internet access.';
      const head=real3D.querySelector('.smreal-head');
      if(head)head.after(note);
    }
    const panel=$('networkPanel');
    if(panel && !document.getElementById('smCleanNetworkNote')){
      const note=document.createElement('div');note.id='smCleanNetworkNote';note.className='sm-clean-provenance';
      note.innerHTML='<strong>Data provenance:</strong> physical towers appear only with documented site GPS. Observed cells from drive-test CSVs are not tower locations.';
      panel.querySelector('.network-heading')?.after(note);
    }

    // Feedback for keyboard use of the categories, without intercepting application shortcuts.
    categories.addEventListener('keydown',e=>{
      if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
      const b=e.target.closest('.sm-clean-category');if(!b)return;
      const arr=[...categories.querySelectorAll('button')],idx=arr.indexOf(b);
      const next=arr[(idx+(e.key==='ArrowRight'?1:arr.length-1))%arr.length];
      e.preventDefault();next.focus();next.click();
    });
    window.SignalMapCleanUI={showGroup,groupForTab,version:'clean-v17'};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
