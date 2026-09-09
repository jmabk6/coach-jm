
export const DB_NAME="coach_jm";
export const DB_VERSION=1;

export function openCoachDB(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded=()=>{
      const db=r.result;
      ["exercises","workoutTemplates","plannedWorkouts","workoutSessions","goals","assessments","recommendations","settings","meta"]
        .forEach(n=>{if(!db.objectStoreNames.contains(n))db.createObjectStore(n,{keyPath:"id"});});
    };
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);
  });
}

async function withStore(storeName, mode, fn){
  const db=await openCoachDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,mode);
    const store=tx.objectStore(storeName);
    let result;
    try{ result=fn(store); }catch(err){ reject(err); return; }
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  });
}

export async function dbPut(storeName,value){
  return withStore(storeName,"readwrite",store=>store.put(value));
}
export async function dbGet(storeName,id){
  const db=await openCoachDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,"readonly");
    const req=tx.objectStore(storeName).get(id);
    req.onsuccess=()=>resolve(req.result??null);
    req.onerror=()=>reject(req.error);
  });
}
export async function dbDelete(storeName,id){
  return withStore(storeName,"readwrite",store=>store.delete(id));
}
export async function dbGetAll(storeName){
  const db=await openCoachDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,"readonly");
    const req=tx.objectStore(storeName).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}
