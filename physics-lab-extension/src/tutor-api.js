export function extensionConnectionIssue(runtime=globalThis.chrome?.runtime) {
  if(!runtime?.getManifest)return '';
  const manifest=runtime.getManifest(),policy=manifest.content_security_policy?.extension_pages||'';
  if(!manifest.host_permissions?.some(origin=>origin.includes('127.0.0.1')||origin==='<all_urls>')||policy.includes("connect-src 'none'"))return '扩展的后台连接权限尚未生效。请打开 chrome://extensions，点击“物理实验室”的重新加载，再打开页面。';
  return '';
}
export const DEFAULT_SERVICE = 'http://127.0.0.1:8766';
export function sharedServiceUrl() {
  try {
    const here=globalThis.location;
    return normalizeServiceUrl(here && /^https?:$/.test(here.protocol) && here.pathname.startsWith('/physics/') ? here.origin : localStorage.getItem('physics-shared-service') || DEFAULT_SERVICE);
  } catch { return DEFAULT_SERVICE; }
}
export function normalizeServiceUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('请填写 GESP 后台的本机地址，例如 http://127.0.0.1:8766'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw Error('共享后台地址仅支持 http://127.0.0.1:端口 或 http://localhost:端口。');
  }
  return url.origin;
}
export function createTutorApi(baseUrl, fetcher = globalThis.fetch) {
  const base = normalizeServiceUrl(baseUrl);
  return async function api(path, body, signal) {
    if (!/^\/(health|questions|chat|lessons(?:\/sh-\d{4}-[\d-]+)?|jobs\/[a-f0-9]{32})$/.test(path)) throw Error('物理接口路径无效。');
    const issue=extensionConnectionIssue();if(issue){const error=Error(issue);error.code='extension_reload';throw error;}
    let response;
    const timeout = AbortSignal.timeout(15000);
    try {
      response = await fetcher(base + '/api/physics' + path, {
        method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw Error('未连上共享后台。请点击本页“启动／更新后台”后重试。');
    }
    let data;
    try { data = await response.json(); } catch { throw Error('后台返回的内容无法读取，请点击本页“启动／更新后台”后重试。'); }
    if (!response.ok) {
      const error = Error(data.error?.message || '共享后台请求失败。'); error.status = response.status; error.code = data.error?.code;
      throw error;
    }
    return data;
  };
}

export function createTutorStore(indexedDB = globalThis.indexedDB) {
  let connection, writes = Promise.resolve();
  const open = () => connection ||= new Promise((resolve, reject) => {
    if (!indexedDB) { reject(Error('当前浏览器不能保存本机课件。')); return; }
    const request = indexedDB.open('physics-tutoring', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('questions');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('请关闭其他旧版物理页面后重试保存。'));
  });
  async function transaction(mode, run) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('questions', mode), request = run(tx.objectStore('questions'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('本机课件保存失败。'));
    });
  }
  return {
    async get(id) { await writes.catch(() => {}); return transaction('readonly', store => store.get(id)); },
    put(id, value) {
      const snapshot = structuredClone(value);
      writes = writes.catch(() => {}).then(() => transaction('readwrite', store => store.put(snapshot, id)));
      return writes;
    },
  };
}
