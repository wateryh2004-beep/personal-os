import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { VaultPdfPreview } from '@/components/vault/vault-pdf-preview';
import { FilePdfPreview } from '@/components/files/file-pdf-preview';
import '@/app/globals.css';
function App() {
  const vaultMode = new URLSearchParams(location.search).get('mode') === 'vault';
  const [blob, setBlob] = useState(null);
  useEffect(() => { if(!vaultMode) return; const controller=new AbortController(); fetch('/fixture/vault.pdf'+(location.search.includes('pages=2') ? '?pages=2' : ''),{signal:controller.signal}).then(r=>r.blob()).then(setBlob).catch(()=>{}); return ()=>controller.abort(); },[vaultMode]);
  const [open, setOpen] = useState(location.hash === '#reader');
  useEffect(() => { const update = () => setOpen(location.hash === '#reader'); window.addEventListener('popstate',update); return () => window.removeEventListener('popstate',update); }, []);
  return <main style={{maxWidth:900,padding:16,margin:'auto'}}><h1>合成 PDF 阅读连续性</h1>
    {open ? <><button onClick={() => history.back()}>关闭预览</button>{vaultMode ? blob ? <div style={{height:'78vh',display:'flex',flexDirection:'column'}}><VaultPdfPreview blob={blob} title="合成暗格 PDF" /></div> : <p>正在读取合成 PDF…</p> : <FilePdfPreview documentId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" title="Synthetic reading fixture" />}</> : <button onClick={() => { history.pushState({},'', '#reader'); setOpen(true); }}>打开 PDF</button>}
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
