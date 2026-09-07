import styles from "./Home.module.css";

export default function HomePage() {
  return (
    <main className={styles.shell}>
      <div className={styles.wrap}>
        <div className={styles.brand} aria-label="Ginder">
          <h1 className={styles.wordmark}>Ginder</h1>
          <span className={styles.pin} aria-hidden="true" />
        </div>

        <p className={styles.intro}>Kies je festival.</p>

        <section className={styles.festival} aria-label="Festivals">
          <div>
            <h2 className={styles.name}>Space Safari 2026</h2>
            <p className={styles.meta}>Massembre · 4–6 september 2026</p>
          </div>
          <a className={styles.open} href="/map">Open kaart</a>
        </section>

        <p className={styles.foot}>Meer festivals komen hier naast te staan.</p>
      </div>
    </main>
  );
}
