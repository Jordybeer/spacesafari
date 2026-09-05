import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing-shell">
      <section className="festival-card landing-card">
        <div className="eyebrow">COMMUNITY COMPANION · 04–06.09.26</div>
        <div className="wordmark" aria-label="Space Safari">SPACE<br />SAFARI</div>
        <p className="lede">
          Timetable, artiestpings en een live festivalkaart voor je Telegram-groep.
        </p>
        <Link className="primary-button" href="/map">Open festivalkaart</Link>
        <p className="microcopy">
          De live kaart gebruikt geverifieerde Telegram Mini App-identiteit. Open hem vanuit de bot voor delen en groepsrooms.
        </p>
      </section>
    </main>
  );
}
