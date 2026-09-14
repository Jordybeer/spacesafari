import { listPublishedFestivals } from "@/src/lib/festivals";
import styles from "./Home.module.css";

const DATE = new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", timeZone: "UTC" });

function festivalDates(startsOn?: string, endsOn?: string): string | null {
  if (!startsOn) return null;
  const start = new Date(`${startsOn}T12:00:00Z`);
  if (!endsOn || endsOn === startsOn) return DATE.format(start);
  const end = new Date(`${endsOn}T12:00:00Z`);
  if (start.getUTCMonth() === end.getUTCMonth()) {
    const month = new Intl.DateTimeFormat("nl-BE", { month: "long", timeZone: "UTC" }).format(end);
    return `${start.getUTCDate()}–${end.getUTCDate()} ${month}`;
  }
  return `${DATE.format(start)} – ${DATE.format(end)}`;
}

export default function HomePage() {
  const festivals = listPublishedFestivals();

  return (
    <main className={styles.shell}>
      <div className={styles.wrap}>
        <div className={styles.brand} aria-label="Ginder">
          <h1 className={styles.wordmark}>Ginder</h1>
          <span className={styles.pin} aria-hidden="true" />
        </div>

        <p className={styles.intro}>Kies je festival.</p>

        <section className={styles.festivalList} aria-label="Festivals">
          {festivals.map((festival) => {
            const dates = festivalDates(festival.startsOn, festival.endsOn);
            const meta = [festival.venueLabel, dates ? `${dates} ${festival.year}` : String(festival.year)]
              .filter(Boolean)
              .join(" · ");
            return (
              <article className={styles.festival} key={festival.id}>
                <div>
                  <h2 className={styles.name}>{festival.name} {festival.year}</h2>
                  <p className={styles.meta}>{meta}</p>
                </div>
                <a className={styles.open} href={`/map?festival=${encodeURIComponent(festival.id)}`}>Open kaart</a>
              </article>
            );
          })}
        </section>

        <p className={styles.foot}>Alleen door Ginder voorbereide festivals verschijnen hier.</p>
      </div>
    </main>
  );
}
