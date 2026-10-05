import styles from "@/components/leisure/leisure.module.css";
export default function LeisureLoading() {
  return <div className={styles.page} role="status" aria-label="正在打开闲暇"><div className={styles.masthead}><span className={styles.wordmark}>闲暇<span aria-hidden="true">/</span></span><span className={styles.eyebrow}>THE GOOD HOURS</span></div><div className={styles.introRow}><h1>留一点时间，<br /><em>给喜欢的事。</em></h1></div><div className={styles.loadingFeature} aria-hidden="true" /><p className={styles.caption}>正在打开闲暇…</p></div>;
}
