import styles from "./page.module.css";
import Building from "@/app/_components/building";
import Fence from "@/app/_components/fence";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Building />
        <Fence />
      </main>
    </div>
  );
}
