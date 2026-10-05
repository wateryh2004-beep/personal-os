import styles from "@/components/leisure/leisure.module.css";
export default function LeisureLoading() {
  return <div className={styles.page} role="status" aria-label="正在打开闲暇"><div className={styles.header}><p className={styles.eyebrow}>PERSONAL</p><h1 className="page-title mt-2">闲暇</h1></div><p className="py-12 text-sm text-[var(--text-tertiary)]">正在打开闲暇…</p></div>;
}
