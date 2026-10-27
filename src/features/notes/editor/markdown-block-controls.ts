import { EditorView, ViewPlugin, GutterMarker, gutter, type ViewUpdate } from "@codemirror/view";
import { syntaxTree, ensureSyntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { editorMarkdownBlocks, blockMove, frontmatterBoundary, type MarkdownBlock } from "./markdown-blocks";

let drag: { view: EditorView; document: EditorView["state"]["doc"]; index: number } | null = null;
let marker: HTMLDivElement | null = null;
const clearDrag = () => { drag = null; marker?.remove(); marker = null; };
const cache = new WeakMap<EditorState, { tree: ReturnType<typeof syntaxTree>; blocks: MarkdownBlock[]; frontmatter: number }>();
function blocksFor(state: EditorState) { const tree = syntaxTree(state); let entry = cache.get(state); if (!entry || entry.tree !== tree) { entry = { tree, blocks: editorMarkdownBlocks(state), frontmatter: frontmatterBoundary(state.doc.sliceString(0,20_000)) }; cache.set(state, entry); } return entry.blocks; }
export function moveMarkdownBlock(view: EditorView, index: number, destination: number) {
 if (view.composing || view.state.readOnly) return false;
 if (!ensureSyntaxTree(view.state, view.state.doc.length, 40)) { view.dispatch({ effects: EditorView.announce.of("正文语法尚在分析，稍后再移动完整段落。") }); return false; }
 const change = blockMove(view.state.doc.toString(), blocksFor(view.state), index, destination);
 if (!change) return false;
 view.dispatch({ changes: { from: change.from, to: change.to, insert: change.insert }, selection: { anchor: change.movedFrom }, scrollIntoView: true, userEvent: "move.block" });
 view.focus(); return true;
}
class BlockHandle extends GutterMarker {
 constructor(readonly index: number) { super(); }
 eq(other: GutterMarker) { return other instanceof BlockHandle && other.index === this.index; }
 toDOM(view: EditorView) {
  const wrapper = document.createElement("span"); wrapper.className = "cm-block-controls"; wrapper.dataset.dragHandle = "true";
  const handle = document.createElement("button");handle.type="button";handle.textContent="⠿";handle.title="移动完整段落";handle.setAttribute("aria-label","移动完整段落：打开操作，或 Alt + 上下方向键");handle.setAttribute("aria-expanded","false");handle.draggable=true;
  const menu=document.createElement("span");menu.className="cm-block-menu";menu.hidden=true;
  for(const [label,delta] of [["上移",-1],["下移",1]] as const){
   const button=document.createElement("button");button.type="button";button.textContent=label;button.setAttribute("aria-label",`完整段落${label}`);
   button.onclick=event=>{event.preventDefault();event.stopPropagation();menu.hidden=true;handle.setAttribute("aria-expanded","false");moveMarkdownBlock(view,this.index,this.index+delta);};menu.append(button);
  }
  handle.onmousedown=event=>event.preventDefault();
  handle.onclick=event=>{event.preventDefault();event.stopPropagation();menu.hidden=!menu.hidden;handle.setAttribute("aria-expanded",String(!menu.hidden));};
  wrapper.onkeydown=event=>{if(event.key==="Escape"){menu.hidden=true;handle.setAttribute("aria-expanded","false");handle.focus();}};
  handle.ondragstart=event=>{
   if(view.composing||view.state.readOnly){event.preventDefault();return;}
   menu.hidden=true;drag={view,document:view.state.doc,index:this.index};event.dataTransfer?.setData("application/x-personal-os-markdown-block",String(this.index));if(event.dataTransfer)event.dataTransfer.effectAllowed="move";
  };
  handle.ondragend=clearDrag;
  handle.onkeydown=event=>{if(event.altKey&&["ArrowUp","ArrowDown"].includes(event.key)){event.preventDefault();moveMarkdownBlock(view,this.index,this.index+(event.key==="ArrowUp"?-1:1));}};
  wrapper.append(handle,menu);return wrapper;
 }
}
function targetAt(view:EditorView,event:DragEvent){
 const position=view.posAtCoords({x:event.clientX,y:event.clientY});if(position==null)return -1;
 return blocksFor(view.state).findIndex(block=>position>=block.from&&position<=block.to);
}
export const markdownBlockControls=[gutter({
 class:"cm-block-gutter",
 lineMarker(view,line){if(view.state.readOnly)return null;const blocks=blocksFor(view.state);const index=blocks.findIndex(block=>block.from===line.from&&!['HTMLBlock','LinkReference'].includes(block.name)&&block.from>=(cache.get(view.state)?.frontmatter??0));return index>=0?new BlockHandle(index):null;},
 lineMarkerChange:update=>update.docChanged,
}),ViewPlugin.fromClass(class{
 constructor(readonly view:EditorView){}
 update(update:ViewUpdate){if(update.docChanged&&drag?.view===this.view)clearDrag();}
 destroy(){if(drag?.view===this.view)clearDrag();}
}),EditorView.domEventHandlers({
 dragover(event,view){
  if(drag?.view!==view||!event.dataTransfer?.types.includes("application/x-personal-os-markdown-block"))return false;
  const index=targetAt(view,event);if(index<0)return false;
  const coordinates=view.coordsAtPos(blocksFor(view.state)[index].from);if(!coordinates)return false;
  if(!marker){marker=document.createElement("div");marker.className="cm-block-drop-marker";marker.setAttribute("aria-hidden","true");document.body.append(marker);}
  const bounds=view.contentDOM.getBoundingClientRect();Object.assign(marker.style,{position:"fixed",top:`${coordinates.top}px`,left:`${bounds.left}px`,width:`${bounds.width}px`,height:"2px",background:"var(--accent)",zIndex:"100",pointerEvents:"none"});
  event.preventDefault();return true;
 },
 dragleave(event,view){if(drag?.view===view&&!view.dom.contains(event.relatedTarget as Node|null)){marker?.remove();marker=null;}return false;},
 drop(event,view){const pending=drag;clearDrag();if(!pending||pending.view!==view||pending.document!==view.state.doc)return false;const index=targetAt(view,event);event.preventDefault();return index>=0&&moveMarkdownBlock(view,pending.index,index);},
}),EditorView.theme({
 ".cm-gutters":{background:"transparent",border:"none",overflow:"visible"},
 ".cm-block-gutter":{width:"28px"},
 ".cm-block-controls":{position:"relative",display:"block",opacity:".3",userSelect:"none"},
 ".cm-block-controls:focus-within, .cm-block-controls:hover":{opacity:"1"},
 ".cm-block-controls button":{minWidth:"26px",minHeight:"28px",borderRadius:"4px",color:"var(--muted-foreground)",cursor:"pointer",font:"12px sans-serif"},
 ".cm-block-menu":{position:"absolute",left:"24px",top:"0",zIndex:"20",padding:"4px",background:"var(--surface-elevated)",border:"1px solid var(--border)",borderRadius:"8px",boxShadow:"var(--shadow-md)",whiteSpace:"nowrap"},
 ".cm-block-menu[hidden]":{display:"none"},
 "@media (pointer: coarse)":{".cm-block-gutter":{width:"44px"},".cm-block-controls":{opacity:".7"},".cm-block-controls button":{minWidth:"44px",minHeight:"44px"},".cm-block-menu":{left:"40px"}},
})];
