"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./FestivalSetup.module.css";

type PlannedAnchor = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  mapX: number;
  mapY: number;
};

type PlannedTimetableEntry = {
  id: string;
  artist: string;
  stage: string;
  startsLocal: string;
  endsLocal: string;
  live: boolean;
  note: string | null;
};

type SetupStatus = "draft" | "map" | "anchors" | "timetable" | "ready";

type FestivalDraft = {
  version: 1;
  id: string;
  name: string;
  year: number;
  mapImageUrl: string;
  mapImageWidth?: number;
  mapImageHeight?: number;
  venueCenter: { latitude: number; longitude: number };
  venueMaxDistanceMeters: number;
  anchors: PlannedAnchor[];
};

type ConnectedFestival = {
  id: string;
  name: string;
  year: number;
  timezone: string;
  status: SetupStatus;
  mapImageUrl: string;
  mapImageWidth: number;
  mapImageHeight: number;
  venueCenter: { latitude: number; longitude: number };
  venueMaxDistanceMeters: number;
  chatTitle?: string | null;
};

const STORAGE_KEY = "ginder-festival-draft-v1";
const LEGACY_STORAGE_KEY = "space-safari-festival-draft-v1";
const LOCAL_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

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

function statusCopy(status: SetupStatus): string {
  switch (status) {
    case "map": return "Kaart + terrein nog instellen";
    case "anchors": return "Ankers nog instellen";
    case "timetable": return "Kaart klaar · timetable nog instellen";
    case "ready": return "Klaar";
    default: return "Concept";
  }
}

function normalizeLocalDateTime(value: string): string {
  const normalized = value.trim().replace(" ", "T").slice(0, 16);
  return LOCAL_DATE_TIME_RE.test(normalized) ? normalized : "";
}

function importedTimetable(text: string): { entries: PlannedTimetableEntry[]; invalid: number } {
  const entries: PlannedTimetableEntry[] = [];
  let invalid = 0;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const delimiter = line.includes("\t") ? "\t" : line.includes(";") ? ";" : "|";
    const parts = line.split(delimiter).map((part) => part.trim());
    if (parts[0]?.toLowerCase() === "artist" || parts[0]?.toLowerCase() === "artiest") continue;
    if (parts.length < 4) {
      invalid += 1;
      continue;
    }
    const startsLocal = normalizeLocalDateTime(parts[2]);
    const endsLocal = normalizeLocalDateTime(parts[3]);
    if (!parts[0] || !parts[1] || !startsLocal || !endsLocal) {
      invalid += 1;
      continue;
    }
    entries.push({
      id: `set-${crypto.randomUUID()}`,
      artist: parts[0],
      stage: parts[1],
      startsLocal,
      endsLocal,
      live: /^(1|true|live|ja)$/i.test(parts[4] ?? ""),
      note: parts[5]?.trim() || null,
    });
  }
  return { entries, invalid };
}

export default function FestivalSetupClient() {
  const imageRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("Nieuw festival");
  const [year, setYear] = useState(new Date().getFullYear());
  const [timezone, setTimezone] = useState("Europe/Brussels");
  const [mapImageUrl, setMapImageUrl] = useState("");
  const [mapImageWidth, setMapImageWidth] = useState(640);
  const [mapImageHeight, setMapImageHeight] = useState(800);
  const [centerLat, setCenterLat] = useState("");
  const [centerLon, setCenterLon] = useState("");
  const [radius, setRadius] = useState("3000");
  const [anchorName, setAnchorName] = useState("");
  const [anchorLat, setAnchorLat] = useState("");
  const [anchorLon, setAnchorLon] = useState("");
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [anchors, setAnchors] = useState<PlannedAnchor[]>([]);
  const [timetable, setTimetable] = useState<PlannedTimetableEntry[]>([]);
  const [artist, setArtist] = useState("");
  const [stage, setStage] = useState("");
  const [startsLocal, setStartsLocal] = useState("");
  const [endsLocal, setEndsLocal] = useState("");
  const [bulkTimetable, setBulkTimetable] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connectedFestivalId, setConnectedFestivalId] = useState<string | null>(null);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [status, setStatus] = useState<SetupStatus>("draft");
  const connected = Boolean(connectedFestivalId && setupToken);

  const draft = useMemo<FestivalDraft | null>(() => {
    const latitude = num(centerLat);
    const longitude = num(centerLon);
    const maxDistance = num(radius);
    if (latitude === null || longitude === null || maxDistance === null) return null;
    return {
      version: 1,
      id: connectedFestivalId ?? (slugify(name) || "festival"),
      name: name.trim() || "Festival",
      year,
      mapImageUrl: mapImageUrl.trim(),
      mapImageWidth,
      mapImageHeight,
      venueCenter: { latitude, longitude },
      venueMaxDistanceMeters: Math.max(100, Math.round(maxDistance)),
      anchors,
    };
  }, [anchors, centerLat, centerLon, connectedFestivalId, mapImageHeight, mapImageUrl, mapImageWidth, name, radius, year]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const festivalId = query.get("festivalId")?.trim() ?? "";
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hash.get("token")?.trim() ?? "";
    if (!festivalId) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (!token) {
        setMessage("Deze festival-link mist de setup-sleutel. Open de link opnieuw vanuit je Ginder-groep.");
        return;
      }

      setConnectedFestivalId(festivalId);
      setSetupToken(token);
      setBusy(true);
      void fetch("/api/festivals/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "load", festivalId, token }),
        cache: "no-store",
      }).then(async (response) => {
        const payload = await response.json() as {
          ok?: boolean;
          error?: string;
          festival?: ConnectedFestival;
          anchors?: PlannedAnchor[];
          timetable?: PlannedTimetableEntry[];
        };
        if (!response.ok || !payload.ok || !payload.festival) {
          throw new Error(payload.error || "Festival kon niet worden geladen.");
        }
        if (cancelled) return;
        const festival = payload.festival;
        setName(festival.name);
        setYear(festival.year);
        setTimezone(festival.timezone || "Europe/Brussels");
        setStatus(festival.status);
        setMapImageUrl(festival.mapImageUrl || "");
        setMapImageWidth(festival.mapImageWidth || 640);
        setMapImageHeight(festival.mapImageHeight || 800);
        setCenterLat(festival.venueCenter.latitude || festival.venueCenter.longitude ? String(festival.venueCenter.latitude) : "");
        setCenterLon(festival.venueCenter.latitude || festival.venueCenter.longitude ? String(festival.venueCenter.longitude) : "");
        setRadius(String(festival.venueMaxDistanceMeters || 3000));
        setAnchors(payload.anchors ?? []);
        setTimetable(payload.timetable ?? []);
        setMessage(festival.chatTitle ? `Gekoppeld aan ${festival.chatTitle}.` : "Festival geladen.");
      }).catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Festival kon niet worden geladen.");
      }).finally(() => {
        if (!cancelled) setBusy(false);
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

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

  const addTimetableEntry = () => {
    if (!artist.trim() || !stage.trim() || !LOCAL_DATE_TIME_RE.test(startsLocal) || !LOCAL_DATE_TIME_RE.test(endsLocal)) {
      setMessage("Vul artiest, stage, start en einde in.");
      return;
    }
    if (endsLocal <= startsLocal) {
      setMessage("De eindtijd moet na de starttijd liggen.");
      return;
    }
    setTimetable((current) => [...current, {
      id: `set-${crypto.randomUUID()}`,
      artist: artist.trim(),
      stage: stage.trim(),
      startsLocal,
      endsLocal,
      live: false,
      note: null,
    }].sort((a, b) => a.startsLocal.localeCompare(b.startsLocal)));
    setArtist("");
    setMessage(null);
  };

  const importBulkTimetable = () => {
    const parsed = importedTimetable(bulkTimetable);
    if (!parsed.entries.length) {
      setMessage("Geen geldige timetable-regels gevonden.");
      return;
    }
    setTimetable((current) => [...current, ...parsed.entries].sort((a, b) => a.startsLocal.localeCompare(b.startsLocal)));
    setBulkTimetable("");
    setMessage(`${parsed.entries.length} set${parsed.entries.length === 1 ? "" : "s"} toegevoegd${parsed.invalid ? ` · ${parsed.invalid} regel${parsed.invalid === 1 ? "" : "s"} overgeslagen` : ""}.`);
  };

  const saveConnected = async () => {
    if (!connectedFestivalId || !setupToken) return;
    if (!draft || !draft.mapImageUrl) {
      setMessage("Nog geen festivalkaart. Stuur de kaart eerst naar Ginder in privé of vul een afbeeldings-URL in.");
      return;
    }
    if (draft.venueCenter.latitude === 0 && draft.venueCenter.longitude === 0) {
      setMessage("Vul het echte centrum van het festivalterrein in.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/festivals/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          festivalId: connectedFestivalId,
          token: setupToken,
          mapImageUrl: draft.mapImageUrl,
          mapImageWidth,
          mapImageHeight,
          venueCenter: draft.venueCenter,
          venueMaxDistanceMeters: draft.venueMaxDistanceMeters,
          anchors,
        }),
        cache: "no-store",
      });
      const payload = await response.json() as { ok?: boolean; error?: string; festival?: ConnectedFestival; anchors?: PlannedAnchor[]; timetable?: PlannedTimetableEntry[] };
      if (!response.ok || !payload.ok || !payload.festival) throw new Error(payload.error || "Opslaan mislukte.");
      setStatus(payload.festival.status);
      setAnchors(payload.anchors ?? anchors);
      setTimetable(payload.timetable ?? timetable);
      setMessage(payload.festival.status === "timetable"
        ? "Kaart + ankers staan goed. Zet nu de timetable eronder."
        : `Opgeslagen · ${statusCopy(payload.festival.status)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opslaan mislukte.");
    } finally {
      setBusy(false);
    }
  };

  const saveTimetable = async () => {
    if (!connectedFestivalId || !setupToken) return;
    if (!timetable.length) {
      setMessage("Voeg minstens één set toe voor je de timetable opslaat.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/festivals/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save-timetable",
          festivalId: connectedFestivalId,
          token: setupToken,
          entries: timetable,
        }),
        cache: "no-store",
      });
      const payload = await response.json() as { ok?: boolean; error?: string; festival?: ConnectedFestival; timetable?: PlannedTimetableEntry[] };
      if (!response.ok || !payload.ok || !payload.festival) throw new Error(payload.error || "Timetable opslaan mislukte.");
      setStatus(payload.festival.status);
      setTimetable(payload.timetable ?? timetable);
      setMessage(payload.festival.status === "ready"
        ? `${payload.festival.name} staat klaar in Ginder. 🎪`
        : `Timetable opgeslagen · ${statusCopy(payload.festival.status)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Timetable opslaan mislukte.");
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () => {
    if (!draft) return setMessage("Vul eerst geldige centrumcoördinaten in.");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setMessage("Concept lokaal opgeslagen op dit toestel.");
  };

  const loadDraft = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return setMessage("Geen lokaal concept gevonden.");
      const value = JSON.parse(raw) as FestivalDraft;
      setName(value.name);
      setYear(value.year);
      setMapImageUrl(value.mapImageUrl);
      setMapImageWidth(value.mapImageWidth ?? 640);
      setMapImageHeight(value.mapImageHeight ?? 800);
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
        <div>
          <div className={styles.kicker}>{connected ? "GINDER SETUP" : "GINDER PLANNER"}</div>
          <h1>{connected ? name : "Festival voorbereiden"}</h1>
        </div>
        <Link href="/" className={styles.back}>← Ginder</Link>
      </header>

      <section className={styles.card}>
        <div className={styles.sectionHead}>
          <h2>1 · Festival</h2>
          {connected && <span>{statusCopy(status)}</span>}
        </div>
        <div className={styles.grid}>
          <label>Naam<input value={name} disabled={connected} onChange={(e) => setName(e.target.value)} /></label>
          <label>Jaar<input type="number" value={year} disabled={connected} onChange={(e) => setYear(Number(e.target.value) || year)} /></label>
          {connected && <label>Timezone<input value={timezone} disabled /></label>}
          <label className={styles.wide}>Kaart-afbeelding URL<input placeholder="Stuur de kaart naar Ginder of plak een URL" value={mapImageUrl} onChange={(e) => setMapImageUrl(e.target.value)} /></label>
          <label>Centrum latitude<input inputMode="decimal" placeholder="50.12345" value={centerLat} onChange={(e) => setCenterLat(e.target.value)} /></label>
          <label>Centrum longitude<input inputMode="decimal" placeholder="4.12345" value={centerLon} onChange={(e) => setCenterLon(e.target.value)} /></label>
          <label>Terreinradius (m)<input inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} /></label>
        </div>
        {connected && !mapImageUrl && (
          <p className={styles.help}>Stuur de officiële festivalkaart eerst als foto of afbeeldingsbestand naar Ginder in privé. De hoogste beschikbare resolutie is het handigst.</p>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHead}><h2>2 · Ankers</h2><span>{anchors.length} · {coverage(anchors)}</span></div>
        <p className={styles.help}>Je hoeft niet op het festival te staan. Kies vaste herkenbare plekken op de festivalkaart en vul hun echte GPS-coördinaten in. Liefst 4–6 goed verspreide punten; twee is het technische minimum.</p>
        {mapImageUrl ? (
          <div ref={imageRef} className={styles.map} onClick={tapMap}>
            <img
              src={mapImageUrl}
              alt="Festivalkaart voor ankerplanning"
              draggable={false}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                  setMapImageWidth(image.naturalWidth);
                  setMapImageHeight(image.naturalHeight);
                }
              }}
            />
            {anchors.map((anchor) => <span key={anchor.id} className={styles.anchor} style={{ left: `${anchor.mapX * 100}%`, top: `${anchor.mapY * 100}%` }} title={anchor.name} />)}
            {point && <span className={`${styles.anchor} ${styles.target}`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />}
          </div>
        ) : <div className={styles.empty}>Nog geen festivalkaart.</div>}

        <div className={styles.grid}>
          <label>Naam anker<input placeholder="Ingang / kruispunt / vast gebouw" value={anchorName} onChange={(e) => setAnchorName(e.target.value)} /></label>
          <label>Latitude<input inputMode="decimal" value={anchorLat} onChange={(e) => setAnchorLat(e.target.value)} /></label>
          <label>Longitude<input inputMode="decimal" value={anchorLon} onChange={(e) => setAnchorLon(e.target.value)} /></label>
        </div>
        <button className={styles.primary} type="button" onClick={addAnchor}>+ Anker toevoegen</button>

        <div className={styles.rows}>
          {anchors.map((anchor) => (
            <div className={styles.row} key={anchor.id}>
              <div><strong>{anchor.name}</strong><small>{anchor.latitude.toFixed(6)}, {anchor.longitude.toFixed(6)} · {Math.round(anchor.mapX * 100)}% / {Math.round(anchor.mapY * 100)}%</small></div>
              <button type="button" onClick={() => setAnchors((current) => current.filter((item) => item.id !== anchor.id))}>Verwijder</button>
            </div>
          ))}
        </div>
        {connected && <button className={styles.primary} type="button" disabled={busy} onClick={() => void saveConnected()}>{busy ? "Opslaan…" : "Bewaar kaart + ankers"}</button>}
      </section>

      {connected && (
        <section className={styles.card}>
          <div className={styles.sectionHead}><h2>3 · Timetable</h2><span>{timetable.length} sets · {timezone}</span></div>
          <p className={styles.help}>Voeg sets één voor één toe of plak ineens een lijst. Bulkformaat: <code>Artiest ; Stage ; 2027-07-10 18:00 ; 2027-07-10 19:00</code>. Tabs en | werken ook.</p>
          <div className={styles.grid}>
            <label>Artiest<input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="DJ / band" /></label>
            <label>Stage<input value={stage} onChange={(e) => setStage(e.target.value)} placeholder="Main / Club / ..." /></label>
            <label>Start<input type="datetime-local" value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} /></label>
            <label>Einde<input type="datetime-local" value={endsLocal} onChange={(e) => setEndsLocal(e.target.value)} /></label>
          </div>
          <button className={styles.primary} type="button" onClick={addTimetableEntry}>+ Set toevoegen</button>

          <label className={styles.bulkLabel}>Plak timetable
            <textarea value={bulkTimetable} onChange={(e) => setBulkTimetable(e.target.value)} placeholder={`Artiest A ; Main ; ${year}-07-10 18:00 ; ${year}-07-10 19:00\nArtiest B ; Club ; ${year}-07-10 18:30 ; ${year}-07-10 20:00`} />
          </label>
          <button type="button" className={styles.secondary} disabled={!bulkTimetable.trim()} onClick={importBulkTimetable}>Lijst toevoegen</button>

          <div className={styles.rows}>
            {timetable.map((entry) => (
              <div className={styles.row} key={entry.id}>
                <div><strong>{entry.artist}</strong><small>{entry.stage} · {entry.startsLocal.replace("T", " ")}–{entry.endsLocal.slice(11)}</small></div>
                <button type="button" onClick={() => setTimetable((current) => current.filter((item) => item.id !== entry.id))}>Verwijder</button>
              </div>
            ))}
          </div>
          <button className={styles.primary} type="button" disabled={busy || !timetable.length} onClick={() => void saveTimetable()}>{busy ? "Opslaan…" : "Bewaar timetable"}</button>
        </section>
      )}

      <section className={styles.actions}>
        {!connected && (
          <>
            <button type="button" onClick={loadDraft}>Laad concept</button>
            <button type="button" onClick={saveDraft}>Bewaar concept</button>
            <button className={styles.primary} type="button" onClick={exportDraft}>Exporteer festivalconfig</button>
          </>
        )}
      </section>
      {message && <div className={styles.message}>{message}</div>}
    </main>
  );
}
