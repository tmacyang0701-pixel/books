let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(Error('当前浏览器无法使用本地问答存储')); return; }
    const request = indexedDB.open('codearena-learning', 1);
    let finished = false;
    const fail = () => { if (!finished) { finished = true; reject(Error('本地问答存储无法打开，请关闭其他旧版页面后重试')); } };
    const timeout = setTimeout(fail, 5000);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('pageChats')) request.result.createObjectStore('pageChats', {keyPath:'key'});
    };
    request.onerror = () => { clearTimeout(timeout); fail(); };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (finished) { request.result.close(); return; }
      finished = true;
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = null; };
      resolve(db);
    };
  }).catch(error => { databasePromise = null; throw error; });
  return databasePromise;
}

async function transaction(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pageChats', mode);
    const request = operation(tx.objectStore('pageChats'));
    let result;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(Error('本地问答保存失败，请检查浏览器存储空间或权限'));
  });
}

export const chatStore = {
  get: key => transaction('readonly', store => store.get(key)),
  put: value => transaction('readwrite', store => store.put(value)),
  async deleteLesson(lessonId) {
    const db=await openDatabase();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('pageChats','readwrite');
      const cursor=tx.objectStore('pageChats').openCursor(IDBKeyRange.bound(lessonId+':',lessonId+':\uffff'));
      cursor.onsuccess=()=>{const row=cursor.result;if(row){row.delete();row.continue();}};
      tx.oncomplete=()=>resolve();
      tx.onabort=tx.onerror=()=>reject(Error('本机问答记录未能清理，请稍后重试'));
    });
  },
};
