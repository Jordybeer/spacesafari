import type { Metadata } from "next";
import FestivalSetupClient from "./FestivalSetupClient";
import styles from "./FestivalSetup.module.css";

export const metadata: Metadata = {
  title: "Festival setup · Ginder",
  description: "Zet je festival stap voor stap klaar in Ginder.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FestivalSetupPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;

  // Anchors still need the visual editor. Every other setup step belongs in
  // the private Telegram conversation, where Ginder can receive the actual
  // map image and continue the wizard without asking for URLs or coordinates.
  if (mode === "anchors") return <FestivalSetupClient />;

  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  const telegramUrl = username ? `https://t.me/${username}` : null;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>GINDER SETUP</div>
          <h1>Verder in Telegram</h1>
        </div>
      </header>

      <section className={styles.card}>
        <h2>1 · Stuur je festivalkaart</h2>
        <p className={styles.help}>
          Je hoeft hier niets in te vullen. De kaart upload je rechtstreeks in je privéchat met Ginder.
        </p>
        <p className={styles.help}>
          Open Ginder, tik in Telegram op <strong>+</strong> of de paperclip, kies <strong>Foto</strong> of <strong>Bestand</strong> en verstuur de officiële festivalkaart. Een origineel bestand geeft de beste resolutie.
        </p>
        <p className={styles.help}>
          Zodra de kaart binnen is, gaat Ginder automatisch verder met terrein, ankers en timetable. Alleen het plaatsen van de ankers opent nog even de visuele kaarteditor.
        </p>

        {telegramUrl ? (
          <a
            href={telegramUrl}
            className={styles.primary}
            style={{ display: "inline-block", textDecoration: "none" }}
          >
            Open Ginder in Telegram
          </a>
        ) : (
          <p className={styles.message}>Ga terug naar je privéchat met Ginder en stuur de kaart daar als foto of afbeeldingsbestand.</p>
        )}
      </section>
    </main>
  );
}
