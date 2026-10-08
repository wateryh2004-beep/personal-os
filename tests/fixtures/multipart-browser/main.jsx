import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FileResumableUploads } from '@/components/files/file-resumable-uploads';
import { uploadMultipartFile } from '@/features/files/multipart-client';
import '@/app/globals.css';

function App() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [refresh, setRefresh] = useState(0);
  const [retained, setRetained] = useState([]);
  const controller = useRef(null), inFlight = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  // This clearly labelled evidence is fixture provider state, not a product status UI.
  // Reload after cancellation refreshes it and clears a previous upload error.
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/fixture/stats', { signal: abort.signal }).then(response => response.json()).then(value => {
      if (!abort.signal.aborted) setRetained(value.sessions.filter(session => session.status === 'aborted'));
    }).catch(() => {});
    return () => abort.abort();
  }, [refresh]);
  async function start(file, resume) {
    if (!file || inFlight.current) return;
    inFlight.current = true; controller.current = new AbortController(); setBusy(true); setMessage('');
    try {
      await uploadMultipartFile(file, { folderId: null, resume, signal: controller.current.signal, onProgress: () => {} });
      setMessage('分片已组装，等待最终保存确认');
    } catch (error) { setMessage(error.message); }
    finally { inFlight.current = false; setBusy(false); setRefresh(value => value + 1); }
  }
  return <main style={{ padding: 16, maxWidth: 850, margin: 'auto', minWidth: 0 }}>
    <h1 className="text-xl font-semibold">合成大文件断点续传</h1>
    <p className="my-3 text-xs leading-5 text-[var(--text-secondary)]">浏览器夹具：真实 multipart 客户端与续传组件，内存中的模拟存储。最终原件封存另由服务 / SQL 测试验证，此处没有连接真实 R2。</p>
    <input aria-label="新上传" style={{ display: 'block', width: '100%', minWidth: 0 }} type="file" disabled={busy} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''; void start(file);
    }} />
    {busy ? <button className="my-2 min-h-9 text-sm" onClick={() => controller.current?.abort()}>暂停上传</button> : null}
    <p role="status" data-upload-feedback className="my-3 break-words text-sm leading-5">{message}</p>
    <FileResumableUploads busy={busy} refresh={String(refresh)} onResume={(file, session) => void start(file, session)}
      onFinish={() => setMessage('已触发完成保存入口；本夹具不执行原件封存')} />
    {retained.length ? <aside aria-label="夹具保留的取消证据" className="mt-4 rounded-lg border border-[var(--separator)] p-3 text-xs leading-5">
      <p className="font-medium">夹具存储状态证据（不是产品状态界面）</p>
      {retained.map(session => <p className="break-all" key={session.sessionId}>{session.filename}：已取消，仅保留记录，未声明保存原件</p>)}
    </aside> : null}
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
