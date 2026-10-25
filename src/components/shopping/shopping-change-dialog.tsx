"use client";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from "@/components/ui/dialog";
import { useLifeMutation } from "@/components/life/use-life-mutation";
import { quantityFields,type LifeFieldRow } from "@/features/life/contracts";
import { useLifeDialogFocus } from "@/components/life/use-life-dialog-focus";
import styles from "@/components/life/life-field.module.css";
export type PurchaseChangeItem={id:string;title:string;status:string;quantity?:string|null;quantity_unit?:string|null;mutation_revision?:number};
const quantityLabel=(item:PurchaseChangeItem)=>item.quantity&&item.quantity_unit?`${item.quantity} ${item.quantity_unit}`:"数量未记录";
const statusLabels:Record<string,string>={inbox:"待判断",cooling:"冷静期",ready:"可决定",purchased:"已购买",abandoned:"已放弃"};

export function ShoppingChange({ items, kind, onClose, onSaved }: { items: PurchaseChangeItem[]; kind: "quantity" | "purchased"; onClose: () => void; onSaved: (rows: LifeFieldRow[]) => void }) {
  const focus=useLifeDialogFocus();
  const mutation = useLifeMutation(); const router = useRouter();
  const [quantity, setQuantity] = useState(items.length === 1 ? items[0].quantity ?? "" : ""); const [unit, setUnit] = useState(items.length === 1 ? items[0].quantity_unit ?? "" : "");
  const [preview, setPreview] = useState(kind === "purchased"); const [validation, setValidation] = useState(""); const requestId = useRef(crypto.randomUUID());
  const title = kind === "quantity" ? `修改${items.length > 1 ? "所选" : ""}数量` : "确认已购买";
  async function confirm() {
    const identity = items.map((item) => ({ id: item.id, expected_revision: item.mutation_revision ?? 1 }));
    const rows = await mutation.save(kind === "quantity" ? { requestId: requestId.current, operation: "shopping_quantity", items: identity.map((item) => ({ ...item, quantity, quantity_unit: unit })) } : { requestId: requestId.current, operation: "shopping_purchased", items: identity }, kind === "quantity" ? `已更新 ${items.length} 项数量` : `已标记 ${items.length} 项为已购买`);
    if (rows) onSaved(rows);
  }
  return <Dialog open onOpenChange={(open) => { if(mutation.pending)return false;if (!open) onClose(); }}><DialogContent {...focus}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{preview ? "核对影响后确认。取消不会修改记录。" : "数量和单位由你明确填写。"}</DialogDescription></DialogHeader>{!preview ? <form onSubmit={(event) => { event.preventDefault(); const parsed = quantityFields.safeParse({ quantity, quantity_unit: unit }); if (!parsed.success) { setValidation("请填写大于零的数量和单位，最多三位小数。"); return; } setUnit(parsed.data.quantity_unit ?? ""); setPreview(true); }}><div className={styles.fields}><label className={styles.field}>数量<input value={quantity} required inputMode="decimal" onChange={(event) => setQuantity(event.target.value)} /></label><label className={styles.field}>单位<input value={unit} required maxLength={24} onChange={(event) => setUnit(event.target.value)} /></label></div>{validation ? <p role="alert" className={styles.error}>{validation}</p> : null}<div className={styles.actions}><Button variant="outline" type="button" onClick={onClose}>取消</Button><Button>预览修改</Button></div></form> : <><ul className={styles.preview}>{items.map((item) => <li key={item.id}><strong>{item.title}</strong><p>{kind === "quantity" ? `${quantityLabel(item)} → ${quantity} ${unit}` : `${statusLabels[item.status] ?? item.status} → 已购买`}</p></li>)}</ul>{mutation.error ? <p role="alert" className={styles.error}>{mutation.error}<button className={styles.action} onClick={() => { onClose(); router.refresh(); }}>读取最新内容</button></p> : null}<div className={styles.actions}><Button type="button" variant="outline" disabled={mutation.pending} onClick={onClose}>取消</Button>{kind === "quantity" ? <Button variant="outline" disabled={mutation.pending} onClick={() => { setPreview(false); requestId.current = crypto.randomUUID(); }}>返回修改</Button> : null}<Button disabled={mutation.pending} onClick={() => void confirm()}>{mutation.pending ? "保存中…" : "确认保存"}</Button></div></>}</DialogContent></Dialog>;
}
