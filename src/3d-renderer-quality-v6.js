/* SignalMap 3D quality/stability patch — geometry and geographic anchors only.
 * No new workflows, no RF-model changes, no invented tower coordinates.
 * This file upgrades the existing Three/MapLibre custom layer instance.
 */
(function () {
  'use strict';
  const VERSION = '9.0-material-correctness';
  const patched = new WeakSet();
  const tunedMaterials = new WeakSet();
  let activeMap = null;
  let activeStyleListener=null;
  let activeCanvas=null;
  const onManualCamera=()=>{pointerTouched=true;};
  let pointerTouched = false;
  let observedGLB = false;
  let checkId = null;
  const getNet = () => window.SignalMapNetwork;
  const getTower = () => getNet()?.tower;
  const valid = s => !!s && Number.isFinite(s.lon) && Number.isFinite(s.lat) && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180;
  const terrainOf = m => { try { return m?.getTerrain?.() || null; } catch (_) { return null; } };
  const elevationOf = (m, site) => {
    if (!terrainOf(m)) return {known: true, value: 0, noTerrain: true};
    try {
      const result = m.queryTerrainElevation([site.lon, site.lat], {exaggerated: true});
      if (Number.isFinite(result)) return {known:true,value:result,noTerrain:false};
    } catch (_) {}
    return {known:false,value:null,noTerrain:false};
  };
  function tuneMaterial(material) {
    if (!material || tunedMaterials.has(material)) return;
    tunedMaterials.add(material);
    // The submitted GLB is light-gray and becomes nearly invisible on an
    // aerial basemap; restore readable metallic contrast without altering mesh.
    try {
      // Retain GLB's distinct metal, panel, and equipment materials for realistic depth.
      // Preserve the authored PBR materials: white composite radomes should NOT
      // be turned into metallic steel, and red warning lenses must not be
      // forcibly made opaque. Only lattice / thin metal needs double-sidedness.
      const name = String(material.name || '').toLowerCase();
      const nonMetal = /radome|polymer|plastic|cable|enamel|door|aviation_red|glass_red/.test(name);
      const thinMetal = !name || /lattice|steel|hardware|mount|dish_rim|bolts/.test(name);
      const rough = Number(material.roughness);
      const metal = Number(material.metalness);
      if (material.emissive?.set && !/glass_red|aviation_red/.test(name)) material.emissive.set('#101714');
      if ('emissiveIntensity' in material && !/glass_red|aviation_red/.test(name)) material.emissiveIntensity = 0.035;
      if ('roughness' in material && Number.isFinite(rough)) material.roughness = Math.max(nonMetal ? .42 : .32, Math.min(.86,rough));
      if ('metalness' in material && Number.isFinite(metal)) material.metalness = nonMetal ? Math.min(.15,Math.max(0,metal)) : Math.max(.08,Math.min(.68,metal));
      if ('side' in material && thinMetal) material.side = 2; // only lattice / thin steel is two-sided
      if ('depthWrite' in material && !material.transparent) material.depthWrite = true;
      // Do not override authored transparency, colors or textures.
      material.needsUpdate = true;
    } catch (e) { console.warn('SignalMap tower material tuning:',e.message); }
  }
  function tuneScene(layer) {
    if (!layer?.instances?.length) return;
    for (const mesh of layer.instances) {
      if (Array.isArray(mesh.material)) mesh.material.forEach(tuneMaterial);
      else tuneMaterial(mesh.material);
    }
    if (observedGLB) return;
    observedGLB = true;
    // Existing scene lights remain in place. One subtle fill avoids a silhouette
    // on the opposite side when the 3D map camera rotates around the mast.
    const lights = layer.scene?.children?.filter(o => o?.isLight) || [];
    for (const light of lights) {
      if (!Number.isFinite(light.intensity)) continue;
      if (light.isHemisphereLight) light.intensity = Math.max(light.intensity,2.2);
      if (light.isDirectionalLight) light.intensity = Math.max(light.intensity,2.8);
    }
  }
  function siteElevationSignature(layer) {
    const m=layer?.map,positions=layer?.positions||[];
    if (!m || !positions.length) return '';
    return positions.map(p => {
      const v=elevationOf(m,p.site);
      return v.known ? (Math.round(v.value*2)/2).toString() : '?';
    }).join(',');
  }
  function groundMatrices(layer) {
    if (!layer?.instances?.length || !layer?.positions?.length || !layer.localScale) return;
    const m=layer.map,MC=window.maplibregl?.MercatorCoordinate;
    if (!MC) return;
    const terrain=terrainOf(m);
    const positions=layer.positions;
    let grounded=0,pending=0;
    const meshes=layer.instances;
    for (let i=0;i<positions.length;i++) {
      const p=positions[i],s=p.site;
      if (!valid(s)) continue;
      const a=elevationOf(m,s);
      if (!a.known && terrain) {
        // Do not display a 3D tower underground at sea level while DEM tiles
        // are loading. The standard georeferenced map point remains visible.
        p._sm3dTerrainPending=true;
        pending++;
        for (const mesh of meshes) {
          if (i>=mesh.count) continue;
          const mat=mesh.instanceMatrix?.array;
          if (!mat) continue;
          const q=i*16;
          for (const c of [0,1,2,4,5,6,8,9,10]) mat[q+c]=0;
          mesh.instanceMatrix.needsUpdate=true;
        }
        continue;
      }
      p._sm3dTerrainPending=false;
      if (!a.noTerrain) grounded++;
      if (!a.noTerrain) {
        // Query elevation at *each tower's actual GPS*, not the map center.
        // Keep all heights in MapLibre Mercator units, exactly as the original
        // TowerLayer uses when placing meshes and projecting labels.
        const geo=MC.fromLngLat([s.lon,s.lat],a.value);
        const z=geo.z/layer.localScale;
        if (Number.isFinite(z)) {
          p.translation.z=z;
          for (const mesh of meshes) {
            if (i>=mesh.count) continue;
            const arr=mesh.instanceMatrix?.array;
            if (arr) { arr[i*16+14]=z; mesh.instanceMatrix.needsUpdate=true; }
          }
        }
      }
    }
    layer.__sm3dTerrainStatus={known:grounded,pending,total:positions.length,enabled:!!terrain};
  }
  function enhance(layer) {
    if (!layer || patched.has(layer)) return;
    patched.add(layer);
    const rawUpdate=layer.updateMatrices.bind(layer);
    const rawRebuild=layer.rebuild.bind(layer);
    const rawScreen=layer.screenPoint.bind(layer);
    layer.updateMatrices=function(...args){
      const r=rawUpdate(...args);
      tuneScene(this);groundMatrices(this);
      return r;
    };
    layer.rebuild=function(...args){
      const r=rawRebuild(...args);
      tuneScene(this);groundMatrices(this);
      return r;
    };
    layer.screenPoint=function(position,height){
      if (this.positions?.some(p=>p._sm3dTerrainPending&&p.translation===position)) return null;
      return rawScreen(position,height);
    };
    layer.__sm3dQualityV6=true;
  }
  function improvePins(map){
    // Site symbols must remain readable when true-scale towers are just pixels.
    // No invented sites and no change to measurement/RF data.
    try {
      for (const id of ['network-sites-dots','network-public-markers']) {
        if (!map.getLayer?.(id)) continue;
        if (id==='network-sites-dots') {
          map.setPaintProperty(id,'circle-radius',['interpolate',['linear'],['zoom'],7,4,11,5.5,15,8,18,11]);
          map.setPaintProperty(id,'circle-stroke-width',2.4);
        }
      }
    } catch(_) {}
  }
  function observeMap(m){
    if(!m || m===activeMap) return;
    if(activeMap&&activeStyleListener) activeMap.off?.('style.load',activeStyleListener);
    if(activeCanvas){
      activeCanvas.removeEventListener?.('pointerdown',onManualCamera);
      activeCanvas.removeEventListener?.('wheel',onManualCamera);
    }
    activeMap=m;pointerTouched=false;
    activeCanvas=m.getCanvas?.()||null;
    activeCanvas?.addEventListener?.('pointerdown',onManualCamera,{passive:true});
    activeCanvas?.addEventListener?.('wheel',onManualCamera,{passive:true});
    activeStyleListener=()=>improvePins(m);
    m.on?.('style.load',activeStyleListener);
    improvePins(m);
  }
  let lastTerrainSignature='',lastLayer=null;
  function tick(){
    const layer=getTower(),m=layer?.map;
    if (!layer || !m) return;
    observeMap(m);enhance(layer);
    if (lastLayer!==layer){lastLayer=layer;lastTerrainSignature='';}
    tuneScene(layer);
    if (!layer.asset || !layer.positions?.length || m.isMoving?.()) return;
    const signature=siteElevationSignature(layer);
    if (signature!==lastTerrainSignature){
      lastTerrainSignature=signature;
      layer.updateMatrices();m.triggerRepaint?.();
    }
    const status=layer.__sm3dTerrainStatus;
    const label=document.getElementById('sm3dState');
    if(label && status?.enabled && status.pending && layer.instances?.length){
      // Add an honest terrain status to existing diagnostics, not a new panel.
      const suffix=' · '+status.pending+' tower(s) awaiting terrain elevation';
      if(!label.textContent.includes(suffix))label.textContent=label.textContent.replace(/ · \d+ tower\(s\) awaiting terrain elevation/g,'')+suffix;
    }
  }
  checkId=setInterval(tick,1600);
  window.addEventListener('beforeunload',()=>{clearInterval(checkId);if(activeMap&&activeStyleListener)activeMap.off?.('style.load',activeStyleListener);activeCanvas?.removeEventListener?.('pointerdown',onManualCamera);activeCanvas?.removeEventListener?.('wheel',onManualCamera);},{once:true});
  window.SignalMap3DRendererQuality={version:VERSION,enhance,tick,siteElevationSignature,elevationOf,get status(){return getTower()?.__sm3dTerrainStatus||null;},get pointerTouched(){return pointerTouched;}};
  tick();
})();
