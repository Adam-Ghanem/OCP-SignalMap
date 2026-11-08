/* SignalMap V13 — bounded, generation-safe geographic elevation requests.
   All values represent sampled ground heights in metres above the WGS84 ellipsoid.
   Unknown elevation stays UNKNOWN. It is never silently replaced by zero. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SignalMapImmersiveElevationCore=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const validHeight=h=>typeof h==='number'&&Number.isFinite(h)&&h>=-12000&&h<=10000;
const geographicKey=s=>`${Number(s.lat).toFixed(7)},${Number(s.lon).toFixed(7)}`;
function createQueue(load,onUpdate,options={}){
 const maxConcurrent=Math.max(1,Math.min(8,options.maxConcurrent||4));
 const maxAttempts=Math.max(1,Math.min(5,options.maxAttempts||3));
 let epoch=0,active=0,queue=[],states=new Map(),idleCallbacks=[];
 const notify=(key,state)=>{try{onUpdate?.(key,state);}catch(e){console.warn('Elevation status callback',e);}};
 function pump(){while(active<maxConcurrent&&queue.length){const task=queue.shift(),state=states.get(task.key);if(!state||state.status!=='queued')continue;
  state.status='pending';state.attempts++;active++;const myEpoch=epoch;
  Promise.resolve().then(()=>load(task.site)).then(height=>{
   if(myEpoch!==epoch)return;const current=states.get(task.key);if(!current)return;
   if(validHeight(height)){current.status='resolved';current.height=height;current.error='';}else{current.status='unavailable';current.height=null;current.error='No geographic height returned';}
   notify(task.key,{...current});
  }).catch(error=>{if(myEpoch!==epoch)return;const current=states.get(task.key);if(!current)return;current.status='unavailable';current.height=null;current.error=String(error?.message||error).slice(0,140);notify(task.key,{...current});})
  .finally(()=>{if(myEpoch!==epoch)return;active--;pump();if(!active&&!queue.length){const resolvers=idleCallbacks;idleCallbacks=[];for(const f of resolvers)f();}});
 }}
 function request(site){const key=geographicKey(site);let state=states.get(key);
  if(!state){state={status:'queued',height:null,attempts:0,error:''};states.set(key,state);queue.push({key,site});pump();}
  return {...state};
 }
 function retryUnavailable(sites){let count=0;for(const site of sites){const key=geographicKey(site),state=states.get(key);if(!state||state.status!=='unavailable'||state.attempts>=maxAttempts)continue;state.status='queued';state.error='';queue.push({key,site});count++;}pump();return count;}
 function get(site){const state=states.get(geographicKey(site));return state?{...state}:{status:'unknown',height:null,attempts:0,error:''};}
 function invalidate(){epoch++;states.clear();queue=[];active=0;for(const f of idleCallbacks)f();idleCallbacks=[];}
 function settled(){if(!active&&!queue.length)return Promise.resolve();return new Promise(resolve=>idleCallbacks.push(resolve));}
 function summary(sites){const counts={resolved:0,queued:0,pending:0,unavailable:0,unknown:0};for(const site of sites)counts[get(site).status]++;return counts;}
 return{request,retryUnavailable,get,invalidate,settled,summary};
}
// Terrain providers accept arrays of positions. Batch sampling prevents one network roundtrip per antenna.
function createBatchQueue(loadBatch,onUpdate,options={}){
 const size=Math.max(1,Math.min(32,options.batchSize||8));
 const concurrency=Math.max(1,Math.min(4,options.maxConcurrent||2));
 const maxAttempts=Math.max(1,Math.min(5,options.maxAttempts||3));
 let epoch=0,active=0,queue=[],states=new Map(),waiters=[];
 function finish(){if(!active&&!queue.length){const pending=waiters;waiters=[];pending.forEach(fn=>fn());}}
 function pump(){while(active<concurrency&&queue.length){const batch=queue.splice(0,size),token=epoch;
  const valid=batch.filter(t=>states.get(t.key)?.status==='queued');if(!valid.length)continue;
  valid.forEach(t=>{const st=states.get(t.key);st.status='pending';st.attempts++;});active++;
  Promise.resolve().then(()=>loadBatch(valid.map(x=>x.site))).then(heights=>{
   if(token!==epoch)return;
   if(!Array.isArray(heights)||heights.length!==valid.length)throw Error('Terrain provider returned malformed height batch');
   valid.forEach((task,i)=>{const st=states.get(task.key);if(!st)return;
    if(validHeight(heights[i])){st.status='resolved';st.height=heights[i];st.error='';}
    else{st.status='unavailable';st.height=null;st.error='Geographic height unavailable';}
    onUpdate?.(task.key,{...st});
   });
  }).catch(error=>{
   if(token!==epoch)return;
   valid.forEach(task=>{const st=states.get(task.key);if(!st)return;st.status='unavailable';st.height=null;st.error=String(error?.message||error).slice(0,140);onUpdate?.(task.key,{...st});});
  }).finally(()=>{if(token!==epoch)return;active--;pump();finish();});
 }finish();}
 function request(site){const key=geographicKey(site);let st=states.get(key);
  if(!st){st={status:'queued',height:null,attempts:0,error:''};states.set(key,st);queue.push({site,key});pump();}
  return {...st};
 }
 function retryUnavailable(sites){let n=0;for(const site of sites){const key=geographicKey(site),st=states.get(key);if(!st||st.status!=='unavailable'||st.attempts>=maxAttempts)continue;st.status='queued';st.error='';queue.push({site,key});n++;}pump();return n;}
 function get(site){const st=states.get(geographicKey(site));return st?{...st}:{status:'unknown',height:null,attempts:0,error:''};}
 function invalidate(){epoch++;queue=[];states.clear();active=0;for(const f of waiters)f();waiters=[];}
 function settled(){return !active&&!queue.length?Promise.resolve():new Promise(resolve=>waiters.push(resolve));}
 function summary(sites){const counts={resolved:0,queued:0,pending:0,unavailable:0,unknown:0};sites.forEach(site=>counts[get(site).status]++);return counts;}
 return{request,retryUnavailable,get,invalidate,settled,summary};
}
return {validHeight,geographicKey,createQueue,createBatchQueue};
});
