"use client"

import { useState } from "react"
import Building from "@/app/_components/building"
import Fence from "@/app/_components/fence"
import styles from "./page.module.css"

export default function Home() {
  const [selectionInfo, setSelectionInfo] = useState<string>("Гитара: — • Синт: — • Басс: — • Ударные: —")

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Building onSelectionChange={setSelectionInfo} />
        <Fence />
      </main>
      <LegendOverlay selectionInfo={selectionInfo} />
    </div>
  )
}

const LegendOverlay = ({ selectionInfo }: { selectionInfo: string }) => {
  return (
    <div className={styles.legendOverlay}>
      <div className={styles.legendCard}>
        <span>Строки сверху вниз: Гитара • Синт • Басс • Ударные</span>
        <span>Центральный блок — активная зона</span>
        <span>ЛКМ — добавить или сменить последовательность, повторный клик — убрать</span>
        <span className={styles.legendActive}>{selectionInfo}</span>
      </div>
    </div>
  )
}
