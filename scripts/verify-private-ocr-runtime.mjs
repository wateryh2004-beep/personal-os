// Real recognition of synthetic documents, local engine/models only. No app credentials.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { jsPDF } from 'jspdf';
import { createWorker } from 'tesseract.js';
const require = createRequire(import.meta.url);
const pdfRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
assert(GlobalFonts.registerFromPath(process.env.OCR_TEST_FONT || '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 'FixtureChinese'));
const canvas = createCanvas(1500,420), context = canvas.getContext('2d');
context.fillStyle='white';context.fillRect(0,0,1500,420);context.fillStyle='black';context.font='56px FixtureChinese';
context.fillText('私人文档 中文识别测试',80,115);context.fillText('PRIVATE SCANNED DOCUMENT 7412',80,225);context.fillText('SEARCHABLE ENGLISH AND CHINESE',80,330);
const image=canvas.toBuffer('image/png');
const source=new jsPDF({unit:'pt',format:[750,210],orientation:'landscape'});source.addImage(image,'PNG',0,0,750,210);source.addPage();
const loading=getDocument({data:new Uint8Array(source.output('arraybuffer')),useWorkerFetch:false,
  standardFontDataUrl:pdfRoot+'/standard_fonts/',cMapUrl:pdfRoot+'/cmaps/',wasmUrl:pdfRoot+'/wasm/',cMapPacked:true,verbosity:0});
const document=await loading.promise;
const page=await document.getPage(1);
assert.equal((await page.getTextContent()).items.length,0,'fixture must be a true scan without a text layer');
const viewport=page.getViewport({scale:2.5});
const raster=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
await page.render({canvas:raster,canvasContext:raster.getContext('2d'),viewport,annotationMode:0}).promise;
const worker=await createWorker('chi_sim+eng',1,{langPath:path.resolve('public/ocr/v1/lang'),cacheMethod:'none',logger:()=>{}},{tessedit_load_sublangs:''});
try {
  const png=(await worker.recognize(image)).data.text;
  const pdf=(await worker.recognize(raster.toBuffer('image/png'))).data.text;
  const blankPage=await document.getPage(2);const blankViewport=blankPage.getViewport({scale:2.5});
  const blankCanvas=createCanvas(Math.ceil(blankViewport.width),Math.ceil(blankViewport.height));
  await blankPage.render({canvas:blankCanvas,canvasContext:blankCanvas.getContext('2d'),viewport:blankViewport,annotationMode:0}).promise;
  const blank=(await worker.recognize(blankCanvas.toBuffer('image/png'))).data.text;
  assert.equal(blank.trim(),'');assert.equal(document.numPages,2);
  console.log('Synthetic recognition:',JSON.stringify({png,pdf}));
  for(const text of [png,pdf]) {assert.match(text,/PRIVATE SCANNED DOCUMENT 7412/);assert.match(text.replace(/\s/g,''),/中文识别测试/);}
  console.log(JSON.stringify({passed:true,engine:'tesseract.js@7.0.0',models:'local chi_sim+eng',imageText:png,pdfText:pdf,scanHadTextLayer:false,pdfPages:document.numPages,emptyPages:1},null,2));
} finally {await worker.terminate();await loading.destroy();}
