import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { FilePdfPreview } from '@/components/files/file-pdf-preview';
import '@/app/globals.css';
function App() {
  const [open, setOpen] = useState(location.hash === '#reader');
  useEffect(() => { const update = () => setOpen(location.hash === '#reader'); window.addEventListener('popstate',update); return () => window.removeEventListener('popstate',update); }, []);
  return <main style={{maxWidth:900,padding:16,margin:'auto'}}><h1>合成 PDF 阅读连续性</h1>
    {open ? <><button onClick={() => history.back()}>关闭预览</button><FilePdfPreview documentId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" title="Synthetic reading fixture" /></> : <button onClick={() => { history.pushState({},'', '#reader'); setOpen(true); }}>打开 PDF</button>}
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
