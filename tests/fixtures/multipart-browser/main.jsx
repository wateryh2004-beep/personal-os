import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FileResumableUploads} from '@/components/files/file-resumable-uploads';
import {uploadMultipartFile} from '@/features/files/multipart-client';
import '@/app/globals.css';
function App(){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0);
 const controller=useRef(null),inFlight=useRef(false);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function start(file,resume){if(!file||inFlight.current)return;inFlight.current=true;controller.current=new AbortController();setBusy(true);setMessage('');
  try{await uploadMultipartFile(file,{folderId:null,resume,signal:controller.current.signal,onProgress:()=>{}});setMessage('上传完成');}
  catch(error){setMessage(error.message);}finally{inFlight.current=false;setBusy(false);setRefresh(n=>n+1);}
 }
 return <main style={{padding:16,maxWidth:850,margin:'auto'}}><h1>合成大文件断点续传</h1>
 <input aria-label="新上传" type="file" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void start(file);}}/>
 {busy?<button onClick={()=>controller.current?.abort()}>暂停上传</button>:null}
 <p role="status">{message}</p><FileResumableUploads busy={busy} refresh={String(refresh)} onResume={(file,session)=>void start(file,session)} onFinish={()=>{}}/></main>;
}
createRoot(document.getElementById('root')).render(<App/>);
