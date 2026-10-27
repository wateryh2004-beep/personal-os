"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { announceNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import type { LeisureSummary } from "@/features/leisure/types";
import { LeisureFeedbackControls } from "./leisure-feedback";
import styles from "@/components/life/life-field.module.css";

export function LeisureFieldMode({ experiences }: { experiences: LeisureSummary[] }) {
  const router = useRouter(); const params = useSearchParams();
  const fieldMode = params.get("mode") === "field";
  const ongoing = experiences.filter((item) => item.feedback?.status === "current");
  const [selected, setSelected] = useState(ongoing[0]?.id ?? "");
  const [visited,setVisited]=useState<Set<string>>(()=>new Set(ongoing[0]?[ongoing[0].id]:[]));
  const current = ongoing.find((item) => item.id === selected) ?? ongoing[0];
  const toggle = () => { announceNavigationIntent(); const query = new URLSearchParams(params.toString()); if (fieldMode) query.delete("mode"); else query.set("mode", "field"); router.replace(`/leisure${query.size ? `?${query}` : ""}`, { scroll: false }); };
  return <section className={fieldMode ? styles.fieldMode : ""} aria-label="闲暇现在用"><div className={styles.toolbar}><button onClick={toggle}>{fieldMode ? "退出现在用" : "现在用 · 闲暇"}</button><span className={styles.meta}>正在进行 {ongoing.length} 项</span></div><div className={styles.panel} hidden={!fieldMode} inert={!fieldMode}>{ongoing.length ? <><label className={styles.field}>选择正在进行的内容<select value={current?.id ?? ""} onChange={(event) => {setSelected(event.target.value);setVisited(before=>new Set([...before,event.target.value]));}}>{ongoing.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>{ongoing.filter(item=>visited.has(item.id)||item.id===current?.id).map(item=><div key={item.id} hidden={item.id!==current?.id} inert={item.id!==current?.id}><h2 className={styles.hero}>{item.title}</h2><p className={styles.meta}>{item.platform ?? ""}{item.how_to_start ? ` · ${item.how_to_start}` : ""}</p><LeisureFeedbackControls experience={item} /><Link href={`/leisure/${item.id}`} className="ui-link">打开完整内容</Link></div>)}</> : <p className={styles.notice}>还没有正在进行的内容。先在作品详情中选择“正在进行”。</p>}</div></section>;
}
