import styles from "@/components/leisure/leisure.module.css";
export default function LeisureLoading() {
  return <div className={styles.page} role="status" aria-label="正在打开闲暇"><div className={styles.introRow}><h1>闲暇</h1></div><div className={styles.loadingFeature} aria-hidden="true" /><p className={styles.caption}>正在打开闲暇…</p></div>;
}
