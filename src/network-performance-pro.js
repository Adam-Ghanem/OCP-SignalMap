/* Compatibility speed-up for prebuilt vendor/network.bundle.js.
   The source Map class includes the equivalent optimization for a future esbuild build.
   Never changes geographic coordinates, data, or PDF behavior. */
(function(){
 'use strict';
 const view=window.SignalMapNetwork?.mainView;
 if(!view||view.markerCache||view.__networkFastDraw)return;
 const baseDraw=view.draw.bind(view),baseMeasurements=view.measurements.bind(view);
 let lastEntities=null,lastRows=null,lastFallback=null;
 const stats={savedMapRebuilds:0,savedMeasurementRebuilds:0};
 view.draw=function(entities,settings){
  const unchanged=lastEntities&&lastEntities.length===entities.length&&lastEntities.every((g,i)=>g===entities[i]);
  if(!unchanged){baseDraw(entities,settings);lastEntities=entities.slice();return;}
  // Same georeferenced objects, only layer visibility or selection changed.
  // Keep the SVG markers and their associated popup/click handlers alive.
  this.entities=entities;this.settings=settings;
  for(const kind of ['sites','cells','public'])this.setVisible(this.layers[kind],settings.enabled&&settings[kind]);
  this.drawLabels();this.select(settings.selectionKeys||[]);
  stats.savedMapRebuilds++;
 };
 view.measurements=function(rows,visible,fallback){
  if(rows!==lastRows||fallback!==lastFallback){baseMeasurements(rows,visible,fallback);lastRows=rows;lastFallback=fallback;return;}
  this.setVisible(this.layers.route,visible);this.setVisible(this.layers.fallbackPoints,visible&&fallback);
  stats.savedMeasurementRebuilds++;
 };
 view.__networkFastDraw=true;
 window.SignalMapPerformance={get stats(){return {...stats};}};
})();
