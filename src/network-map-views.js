/* Main-map layers reuse one canvas renderer and one set of layer groups. */
export class MainNetworkMap {
 constructor(map,options){this.map=map;this.options=options;this.markers=new Map();this.markerCache=new Map();this.lastGeometrySignature=null;this.lastMeasurementRows=null;this.lastMeasurementFallback=null;this.entities=[];this.settings={};
  map.createPane('networkEntities');map.getPane('networkEntities').style.zIndex=625;
  map.createPane('networkSelection');map.getPane('networkSelection').style.zIndex=635;map.getPane('networkSelection').style.pointerEvents='none';
  this.canvas=L.canvas({pane:'networkEntities',padding:.4});this.selectionCanvas=L.canvas({pane:'networkSelection',padding:.4});
  this.layers=Object.fromEntries(['sites','cells','public','labels','selection','fallbackPoints','route'].map(k=>[k,L.layerGroup()]));
  this.observationMarkers=L.layerGroup();this.onMove=()=>{this.layoutObserved();this.drawLabels();};map.on('moveend zoomend resize',this.onMove);
 }
 kind(g){return g.type==='site'?'sites':g.type==='public'?'public':'cells';}
 location(g){return this.kind(g)==='cells'?g.observation?[g.observation.lat,g.observation.lon]:null:[g.lat,g.lon];}
 icon(g){const color=this.options.color(g),kind=this.kind(g);const shape=kind==='sites'?'<path d="M16 5 8 27h16L16 5Zm-5 15h10M12 14h8M8 27l13-13M24 27 12 14M16 2v6"/>':kind==='public'?'<path d="m16 4 12 12-12 12L4 16Z"/><path d="M16 10v12M11 16h10"/>':'<circle cx="16" cy="16" r="11" stroke-dasharray="3 2"/><circle cx="16" cy="16" r="3"/>';
  return L.divIcon({className:'network-map-icon '+kind,html:`<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="white" stroke="${color}" stroke-width="1.5"/><g stroke="${color}" stroke-width="2" fill="none" stroke-linejoin="round">${shape}</g></svg>`,iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-16]});
 }
 draw(entities,settings){
  this.entities=entities;this.settings=settings;
  // Most UI changes (heatmap, labels, selection, 2D/3D checkboxes) do not
  // change antenna coordinates. Preserve marker DOM and avoid 1,000s of
  // Leaflet event bindings / SVG icons on every toggle.
  const signature=entities.map(g=>[g.key,g.type,g.lat,g.lon,g.observation?.lat,g.observation?.lon,this.options.color(g),this.options.name(g),this.options.operator(g)].join('|')).join(';');
  if(signature!==this.lastGeometrySignature){
   this.lastGeometrySignature=signature;this.markers.clear();for(const group of Object.values(this.layers))group.clearLayers();
   const visibleKeys=new Set();
   for(const g of entities){const kind=this.kind(g),ll=this.location(g);if(!ll)continue;const layer=this.layers[kind];
    if(kind==='cells'&&g.observation.geometry.type!=='Point'){
     L.geoJSON({type:'Feature',geometry:g.observation.geometry,properties:{}},{style:{renderer:this.canvas,pane:'networkEntities',color:this.options.color(g),weight:2,dashArray:'5 5',fillColor:this.options.color(g),fillOpacity:.09},onEachFeature:(f,l)=>{l.bindPopup(()=>this.options.popup(g),{maxWidth:330});l.on('click',()=>this.options.select(g,'2d'));}}).addTo(layer);
    }
    if(kind==='cells')continue;
    visibleKeys.add(g.key);
    const color=this.options.color(g),name=this.options.name(g),cacheId=kind+'|'+g.key;
    let entry=this.markerCache.get(cacheId);
    if(!entry){
     entry={g,location:ll.join(','),color,name};
     const marker=L.marker(ll,{icon:this.icon(g),pane:'networkEntities',keyboard:true,title:name+' · '+g.classification});
     marker.bindPopup(()=>this.options.popup(entry.g),{maxWidth:330,autoPanPadding:[45,45]});
     marker.on('click',()=>this.options.select(entry.g,'2d'));entry.marker=marker;this.markerCache.set(cacheId,entry);
    }else{
     entry.g=g;
     if(entry.location!==ll.join(',')){entry.marker.setLatLng(ll);entry.location=ll.join(',');}
     if(entry.color!==color){entry.marker.setIcon(this.icon(g));entry.color=color;}
     if(entry.name!==name){entry.name=name;entry.marker.options.title=name+' · '+g.classification;}
    }
    entry.marker.addTo(layer);this.markers.set(g.key,entry.marker);
   }
   // Cache is bounded and only keeps current dataset members; filtering
   // uses a small temporary cache to avoid unnecessary icon creation.
   if(this.markerCache.size>3500){for(const key of this.markerCache.keys())if(!visibleKeys.has(key.split('|').slice(1).join('|')))this.markerCache.delete(key);}
   this.observationMarkers.addTo(this.layers.cells);this.layoutObserved();
  }
  for(const kind of ['sites','cells','public'])this.setVisible(this.layers[kind],settings.enabled&&settings[kind]);
  this.drawLabels();this.select(settings.selectionKeys||[]);
 }

 layoutObserved(){this.observationMarkers.clearLayers();for(const g of this.entities)if(this.kind(g)==='cells')this.markers.delete(g.key);const clusters=[],grid=new Map();for(const g of this.entities.filter(g=>this.kind(g)==='cells'&&g.observation)){const ll=this.location(g),p=this.map.latLngToContainerPoint(ll),gx=Math.floor(p.x/40),gy=Math.floor(p.y/40);let found=null;for(let dx=-1;dx<=1&&!found;dx++)for(let dy=-1;dy<=1&&!found;dy++)for(const c of grid.get((gx+dx)+','+(gy+dy))||[])if(Math.hypot(p.x-c.point.x,p.y-c.point.y)<38){found=c;break;}if(found)found.members.push(g);else{const c={point:p,latlng:ll,members:[g]};clusters.push(c);const k=gx+','+gy;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(c);}}
  this.clusters=clusters;this.displayEntities=this.entities.filter(g=>this.kind(g)!=='cells');for(const c of clusters){const first=c.members[0],count=c.members.length;const icon=count===1?this.icon(first):L.divIcon({className:'network-cell-cluster',html:'<span>'+count+'</span>',iconSize:[36,36],iconAnchor:[18,18]});const marker=L.marker(c.latlng,{icon,pane:'networkEntities',title:count===1?this.options.name(first):count+' observed cell/site groups — tower positions unknown'}).addTo(this.observationMarkers);if(count===1){marker.bindPopup(()=>this.options.popup(first),{maxWidth:330});marker.on('click',()=>this.options.select(first,'2d'));}else{marker.bindPopup(()=>{const host=document.createElement('div');host.className='network-popup';const title=document.createElement('strong');title.textContent=count+' overlapping observation groups';host.append(title);const note=document.createElement('p');note.textContent='Measurement-derived, not tower GPS. Choose a group or zoom in.';host.append(note);for(const g of c.members){const b=document.createElement('button');b.textContent=this.options.name(g)+' · '+this.options.operator(g);b.style.display='block';b.onclick=()=>{this.options.select(g,'2d');L.popup({maxWidth:330}).setLatLng(this.location(g)).setContent(this.options.popup(g)).openOn(this.map);};host.append(b);}return host;},{maxWidth:340});}for(const g of c.members)this.markers.set(g.key,marker);this.displayEntities.push({...first,clusterMembers:c.members});}
 }
 setVisible(layer,visible){if(visible&&!this.map.hasLayer(layer))layer.addTo(this.map);else if(!visible&&this.map.hasLayer(layer))layer.remove();}
 drawLabels(){this.layers.labels.clearLayers();if(!this.settings.enabled||!this.settings.labels){this.layers.labels.remove();return;}const boxes=[],size=this.map.getSize(),selected=this.settings.selectionKeys||[];const sorted=(this.displayEntities||this.entities).slice().sort((a,b)=>selected.includes(b.key)-selected.includes(a.key));
  for(const g of sorted){const kind=this.kind(g);if(!this.settings[kind])continue;const ll=this.location(g);if(!ll)continue;const p=this.map.latLngToContainerPoint(ll);if(p.x<0||p.y<0||p.x>size.x||p.y>size.y)continue;const box={x:p.x-85,y:p.y-53,w:170,h:34};if(boxes.some(b=>box.x<b.x+b.w+5&&box.x+box.w+5>b.x&&box.y<b.y+b.h+5&&box.y+box.h+5>b.y))continue;if(boxes.length>=160)break;boxes.push(box);
   const content=document.createElement('div');content.className='network-map-label-text';const title=document.createElement('b');title.textContent=g.clusterMembers?.length>1?[...new Set(g.clusterMembers.map(x=>this.options.operator(x)))].join(' / '):this.options.operator(g);const sub=document.createElement('span');sub.textContent=g.clusterMembers?.length>1?g.clusterMembers.length+' observed groups · click to choose':this.options.name(g);content.append(title,sub);L.tooltip({permanent:true,direction:'top',offset:[0,-16],className:'network-map-label '+kind,opacity:.96}).setLatLng(ll).setContent(content).addTo(this.layers.labels);
  }this.layers.labels.addTo(this.map);
 }
 select(keys){this.settings.selectionKeys=keys;this.layers.selection.clearLayers();for(const key of keys){const g=this.entities.find(g=>g.key===key),ll=g&&this.location(g);if(!g||!ll||!this.settings.enabled||!this.settings[this.kind(g)])continue;L.circleMarker(ll,{radius:22,color:'#d5a026',weight:4,fill:false,renderer:this.selectionCanvas,interactive:false}).addTo(this.layers.selection);if(this.kind(g)==='cells'&&g.observation.geometry.type!=='Point')L.geoJSON({type:'Feature',geometry:g.observation.geometry,properties:{}},{interactive:false,style:{renderer:this.selectionCanvas,color:'#d5a026',weight:4,fillOpacity:.15,interactive:false}}).addTo(this.layers.selection);}this.layers.selection.addTo(this.map);}
 measurements(rows,visible,fallback){
  // Rebuild thousands of measurement points only when imported data changes.
  if(rows!==this.lastMeasurementRows||fallback!==this.lastMeasurementFallback){
   this.lastMeasurementRows=rows;this.lastMeasurementFallback=fallback;
   this.layers.fallbackPoints.clearLayers();this.layers.route.clearLayers();
   const points=rows.filter(n=>n.hasMeasurement);
   if(points.length>1)L.polyline(points.map(n=>[n.lat,n.lon]),{renderer:this.canvas,color:'#43846b',weight:2,opacity:.5,interactive:false}).addTo(this.layers.route);
   if(fallback)for(const n of points)L.circleMarker([n.lat,n.lon],{renderer:this.canvas,radius:3,color:'#3287b9',weight:1,fillOpacity:.7}).addTo(this.layers.fallbackPoints);
  }
  this.setVisible(this.layers.route,visible);this.setVisible(this.layers.fallbackPoints,visible&&fallback);
 }
 get counts(){return Object.fromEntries(['sites','cells','public'].map(kind=>[kind,this.entities.filter(g=>this.kind(g)===kind&&this.location(g)&&this.map.hasLayer(this.layers[kind])).length]));}
 destroy(){this.map.off('moveend zoomend resize',this.onMove);for(const layer of Object.values(this.layers))layer.remove();this.canvas.remove();this.selectionCanvas.remove();this.markers.clear();this.markerCache.clear();this.lastGeometrySignature=null;this.lastMeasurementRows=null;}
}
