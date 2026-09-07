"use client";

import { useMemo, useRef, useState } from "react";
import styles from "./FestivalSetup.module.css";

type PlannedAnchor = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  mapX: number;
  mapY: number;
};

type FestivalDraft = {
  version: 1;
  id: string;
  name: string;
  year: number;
  mapImageUrl: string;
  venueCenter: { latitude: number; longitude: number };
  venueMaxDistanceMeters: number;
  anchors: PlannedAnchor[];
};

const STORAGE_KEY = "space-safari-festival-draft-v1";

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function num(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function coverage(anchors: PlannedAnchor[]): string {
  if (anchors.length < 2) return "Nog minstens 2 ankers nodig";
  const xs = anchors.map((a) => a.mapX);
  const ys = anchors.map((a) => a.mapY);
  const spreadX = Math.max(...xs) - Math.min(...xs);
  const spreadY = Math.max(...ys) - Math.min(...ys);
  if (anchors.length >= 4 && spreadX >= 0.45 && spreadY >= 0.45) return "Goede spreiding";
  if (spreadX >= 0.3 && spreadY >= 0.3) return "Bruikbaar, 4+ verspreide punten is beter";
  return "Ankers liggen te dicht bij elkaar";
}

export default function FestivalSetupClient() {
  const imageRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("Nieuw festival");
  const [year, setYear] = useState(new Date().getFullYear());
  const [mapImageUrl, setMapImageUrl] = useState("");
  const [centerLat, setCenterLat] = useState("");
  const [centerLon, setCenterLon] = useState("");
  const [radius, setRadius] = useState("3000");
  const [anchorName, setAnchorName] = useState("");
  const [anchorLat, setAnchorLat] = useState("");
  const [anchorLon, setAnchorLon] = useState("");
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [anchors, setAnchors] = useState<PlannedAnchor[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const draft = useMemo<FestivalDraft | null>(() => {
    const latitude = num(centerLat);
    const longitude = num(centerLon);
    const maxDistance = num(radius);
    if (latitude === null || longitude === null || maxDistance === null) return null;
    return {
      version: 1,
      id: slugify(name) || "festival",
      name: name.trim() || "Festival",
      year,
      mapImageUrl: mapImageUrl.trim(),
      venueCenter: { latitude, longitude },
      venueMaxDistanceMeters: Math.max(100, Math.round(maxDistance)),
      anchors,
    };
  }, [anchors, centerLat, centerLon, mapImageUrl, name, radius, year]);

  const tapMap = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    setPoint({
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    });
  };

  const addAnchor = () => {
    const latitude = num(anchorLat);
    const longitude = num(anchorLon);
    if (!point || !anchorName.trim() || latitude === null || longitude === null) {
      setMessage("Kies een punt op de kaart en vul naam + GPS-coördinaten in.");
      return;
    }
    setAnchors((current) => [...current, {
      id: `${slugify(anchorName) || "anchor"}-${crypto.randomUUID().slice(0, 8)}`,
      name: anchorName.trim(),
      latitude,
      longitude,
      mapX: point.x,
      mapY: point.y,
    }]);
    setAnchorName("");
    setAnchorLat("");
    setAnchorLon("");
    setPoint(null);
    setMessage(null);
  };

  const saveDraft = () => {
    if (!draft) return setMessage("Vul eerst geldige centrumcoördinaten in.");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setMessage("Concept lokaal opgeslagen op dit toestel.");
  };

  const loadDraft = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return setMessage("Geen lokaal concept gevonden.");
      const value = JSON.parse(raw) as FestivalDraft;
      setName(value.name);
      setYear(value.year);
      setMapImageUrl(value.mapImageUrl);
      setCenterLat(String(value.venueCenter.latitude));
      setCenterLon(String(value.venueCenter.longitude));
      setRadius(String(value.venueMaxDistanceMeters));
      setAnchors(value.anchors ?? []);
      setMessage("Concept geladen.");
    } catch {
      setMessage("Concept kon niet worden gelezen.");
    }
  };

  const exportDraft = () => {
    if (!draft) return setMessage("Vul eerst geldige festivalgegevens in.");
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.id}-${draft.year}.festival.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div><div className={styles.kicker}>MULTI-FESTIVAL</div><h1>Festival voorbereiden</h1></div>
        <a href="/map" className={styles.back}>← Kaart</a>
      </header>

      <section className={styles.card}>
        <h2>1 · Festival</h2>
        <div className={styles.grid}>
          <label>Naam<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Jaar<input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} /></label>
          <label className={styles.wide}>Kaart-afbeelding URL<input placeholder="/festival-map.png of https://…" value={mapImageUrl} onChange={(e) => setMapImageUrl(e.target.value)} /></label>
          <label>Centrum latitude<input inputMode="decimal" placeholder="50.12345" value={centerLat} onChange={(e) => setCenterLat(e.target.value)} /></label>
          <label>Centrum longitude<input inputMode="decimal" placeholder="4.12345" value={centerLon} onChange={(e) => setCenterLon(e.target.value)} /></label>
          <label>Terreinradius (m)<input inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} /></label>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHead}><h2>2 · Ankers vooraf plannen</h2><span>{anchors.length} · {coverage(anchors)}</span></div>
        <p className={styles.help}>Je hoeft niet op het festival te staan. Zoek herkenbare punten op de festivalkaart en vul hun echte GPS-coördinaten in, bijvoorbeeld uit een officiële locatie, satellietkaart of terreinmeting. Tik daarna dezelfde plek op de afbeelding.</p>
        {mapImageUrl ? (
          <div ref={imageRef} className={styles.map} onClick={tapMap}>
            <img src={mapImageUrl} alt="Festivalkaart voor ankerplanning" draggable={false} />
            {anchors.map((anchor) => <span key={anchor.id} className={styles.anchor} style={{ left: `${anchor.mapX * 100}%`, top: `${anchor.mapY * 100}%` }} title={anchor.name} />)}
            {point && <span className={`${styles.anchor} ${styles.target}`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />}
          </div>
        ) : <div className={styles.empty}>Vul eerst de URL van de festivalkaart in.</div>}

        <div className={styles.grid}>
          <label>Naam anker<input placeholder="Main stage / ingang / kruispunt" value={anchorName} onChange={(e) => setAnchorName(e.target.value)} /></label>
          <label>Latitude<input inputMode="decimal" value={anchorLat} onChange={(e) => setAnchorLat(e.target.value)} /></label>
          <label>Longitude<input inputMode="decimal" value={anchorLon} onChange={(e) => setAnchorLon(e.target.value)} /></label>
        </div>
        <button className={styles.primary} onClick={addAnchor}>+ Anker toevoegen</button>

        <div className={styles.rows}>
          {anchors.map((anchor) => (
            <div className={styles.row} key={anchor.id}>
              <div><strong>{anchor.name}</strong><small>{anchor.latitude.toFixed(6)}, {anchor.longitude.toFixed(6)} · {Math.round(anchor.mapX * 100)}% / {Math.round(anchor.mapY * 100)}%</small></div>
              <button onClick={() => setAnchors((current) => current.filter((item) => item.id !== anchor.id))}>Verwijder</button>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.actions}>
        <button onClick={loadDraft}>Laad concept</button>
        <button onClick={saveDraft}>Bewaar concept</button>
        <button className={styles.primary} onClick={exportDraft}>Exporteer festivalconfig</button>
      </section>
      {message && <div className={styles.message}>{message}</div>}
    </main>
  );
}
