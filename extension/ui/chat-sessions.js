import {MAX_IMAGES,validAttachment} from './chat-images.js';
export const pageChatKey = (lessonId, pageIndex) => `${lessonId}:${pageIndex}`;

export function chatContextMessages(messages) {
  const selected = [];
  let length = 0, imageCount=0;
  for (const message of messages.filter(m => m.status === 'complete').slice(-20).reverse()) {
    const content = message.content.slice(0, 8000);
    if (length + content.length > 24000) break;
    const entry={role:message.role,content};
    const attachments=message.role==='user'?(message.attachments||[]).filter(validAttachment).slice(0,MAX_IMAGES-imageCount):[];
    if(attachments.length){entry.attachments=attachments.map(({dataUrl,name})=>({dataUrl,name}));imageCount+=attachments.length;}
    selected.unshift(entry);
    length += content.length;
  }
  return selected;
}

export class ChatSessions {
  constructor({store, api, notify=()=>{}, sleep=ms=>new Promise(r=>setTimeout(r,ms)), pollMs=1200,context=()=>''}) {
    Object.assign(this, {store, api, notify, sleep, pollMs,context});
    this.records = new Map();
    this.loading = new Map();
    this.running = new Map();
    this.writes = new Map();
    this.removed = new Set();
  }

  async load(lessonId, pageIndex) {
    const key = pageChatKey(lessonId, pageIndex);
    if (this.records.has(key)) return this.records.get(key);
    if (this.loading.has(key)) return this.loading.get(key);
    const task = (async () => {
      const saved = await this.store.get(key);
      if(this.removed.has(lessonId))throw Error('课件已被删除或替换');
      const record = saved?.key===key && saved.lessonId===lessonId && saved.pageIndex===pageIndex ? saved :
        {key,lessonId,pageIndex,messages:[],draft:'',pending:null};
      record.messages = Array.isArray(record.messages) ? record.messages : [];
      record.draftAttachments=(record.draftAttachments||[]).filter(validAttachment).slice(0,MAX_IMAGES);
      this.records.set(key, record);
      if (record.pending) {
        if (record.pending.jobId) this.run(record, true);
        else {
          const message = record.messages.find(m=>m.id===record.pending.messageId);
          if (message) { message.status='error'; message.error='上次发送未完成，请重试。'; }
          record.pending = null;
          await this.save(record);
        }
      }
      return record;
    })();
    this.loading.set(key, task);
    try { return await task; } finally { this.loading.delete(key); }
  }

  async save(record) {
    if(this.removed.has(record.lessonId))return false;
    record.updatedAt = Date.now();
    const snapshot = structuredClone(record);
    delete snapshot.storageError;
    const write = (this.writes.get(record.key)||Promise.resolve()).catch(()=>{}).then(()=>this.removed.has(record.lessonId)?undefined:this.store.put(snapshot));
    this.writes.set(record.key,write);
    try { await write; delete record.storageError; return true; }
    catch { record.storageError='本地问答未能保存，请检查浏览器存储空间或权限'; return false; }
    finally { if (this.writes.get(record.key)===write) this.writes.delete(record.key); this.notify(record.key); }
  }

  async draft(key, value) {
    const record = this.records.get(key);
    if (!record) return;
    record.draft = value;
    await this.save(record);
  }

  async send(key, text) {
    const record = this.records.get(key);
    text = String(text).trim();
    if (!record || this.running.has(key)) return;
    const attachments=(record.draftAttachments||[]).filter(validAttachment).slice(0,MAX_IMAGES);
    if(!text&&attachments.length)text='请结合当前课件页，引导我理解图片中的内容。';
    if (!text || text.length>4000) throw Error('请输入不超过 4000 字的问题');
    record.messages.push({id:crypto.randomUUID(),role:'user',content:text,status:'complete',...(attachments.length?{attachments}:{} )});
    const message = {id:crypto.randomUUID(),role:'assistant',content:'',status:'pending'};
    record.messages.push(message);
    record.pending = {messageId:message.id,jobId:null,visualContext:this.context(record.lessonId,record.pageIndex)};
    record.draft = '';
    record.draftAttachments=[];
    return this.run(record, false);
  }

  async attach(key,attachment) {
    const record=this.records.get(key);
    if(!record||this.removed.has(record.lessonId)||this.running.has(key))throw Error('当前页正在回答或已关闭，请稍后添加图片');
    if(!validAttachment(attachment))throw Error('图片格式或大小无效');
    record.draftAttachments||=[];
    if(record.draftAttachments.length>=MAX_IMAGES)throw Error(`每次最多添加 ${MAX_IMAGES} 张图片`);
    record.draftAttachments.push(attachment);await this.save(record);
  }

  async removeAttachment(key,id) {
    const record=this.records.get(key);if(!record||this.running.has(key))return;
    record.draftAttachments=(record.draftAttachments||[]).filter(image=>image.id!==id);await this.save(record);
  }

  async retry(key) {
    const record = this.records.get(key);
    if (!record || this.running.has(key)) return;
    const message = record.messages.at(-1);
    if (message?.status!=='error') return;
    message.status='pending'; delete message.error;
    record.pending ||= {messageId:message.id,jobId:null,visualContext:this.context(record.lessonId,record.pageIndex)};
    return this.run(record, Boolean(record.pending.jobId));
  }

  run(record, resume) {
    if (this.running.has(record.key)) return this.running.get(record.key);
    const task = Promise.resolve().then(async () => {
      const message = record.messages.find(m=>m.id===record.pending.messageId);
      try {
        if (!await this.save(record)) throw Error(record.storageError);
        if (!resume) {
          const job = await this.api('/api/chat',{lessonId:record.lessonId,pageIndex:record.pageIndex,messages:chatContextMessages(record.messages),visualContext:record.pending.visualContext||''});
          record.pending.jobId = job.id;
          await this.save(record);
        }
        while (true) {
          if(this.removed.has(record.lessonId))return;
          const job = await this.api('/api/jobs/'+record.pending.jobId);
          if(this.removed.has(record.lessonId))return;
          if (job.status==='failed') { record.pending.jobId=null; throw Error(job.error?.message||'回答未完成，请重试'); }
          if (job.status==='completed') {
            const result=job.result;
            if (result?.lessonId!==record.lessonId || result.pageIndex!==record.pageIndex || typeof result.answer!=='string') {
              record.pending.jobId=null; throw Error('回答与当前问题页面不匹配，请重试');
            }
            message.content=result.answer; message.status='complete'; delete message.error;
            record.pending=null;
            await this.save(record);
            return;
          }
          await this.sleep(this.pollMs);
        }
      } catch (error) {
        message.status='error';
        message.error=error.status===404 ? (record.pending?.jobId?'上次问答任务已失效，请点击“重试回答”重新提问。':'当前后台没有问答接口。请点击“启动／更新后台”，完成后重试回答。') : error.message;
        if (error.status===404) record.pending=null;
        await this.save(record);
      } finally {
        this.running.delete(record.key);
        this.notify(record.key);
      }
    });
    this.running.set(record.key,task);
    this.notify(record.key);
    return task;
  }

  async clear(key) {
    const record = this.records.get(key);
    if (!record || this.running.has(key)) return;
    record.messages=[]; record.pending=null; record.draft='';record.draftAttachments=[];
    await this.save(record);
  }

  async removeLesson(lessonId) {
    this.removed.add(lessonId);
    const keys=[...this.records.keys()].filter(key=>key.startsWith(lessonId+':'));
    await Promise.allSettled(keys.map(key=>this.writes.get(key)).filter(Boolean));
    await this.store.deleteLesson(lessonId);
    for(const key of keys)this.records.delete(key);
  }
}
