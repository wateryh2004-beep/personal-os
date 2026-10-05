"use client";
import styles from "@/components/leisure/leisure.module.css";
export default function LeisureError({ reset }: { reset: () => void }) {
  return <div className={styles.page}><section className={styles.empty} role="alert"><h1 className="page-title">暂时无法打开闲暇</h1><p>请重试。已保存的内容不会因此被改动。</p><button onClick={reset} className={styles.quietButton}>重试</button></section></div>;
}
