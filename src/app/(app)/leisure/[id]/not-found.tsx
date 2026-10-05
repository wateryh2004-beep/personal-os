import Link from "next/link";
import styles from "@/components/leisure/leisure.module.css";
export default function LeisureNotFound() {
  return <div className={styles.page}><section className={styles.empty}><h1 className="page-title">这条体验已不在这里</h1><p>它可能已归档，或链接不完整。</p><Link href="/leisure" className={styles.link}>回到闲暇</Link></section></div>;
}
