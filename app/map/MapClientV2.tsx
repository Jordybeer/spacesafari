"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./MapClientV2.module.css";

type RoomMode = "group" | "public";

type LocationFix = {
  latitude: number;
  longitude: number;
  horizontalAccuracy: number | null;
};

type Member = {
  userId: number;
  displayName: string;
  username?: string;
  photoUrl?: string;
  horizontalAccuracy: number | null;
  updatedAt: string;
  mapX: number | null;
  mapY: number | null;
};

type Anchor = {
  id: string;
  name: string;
  mapX: number;
  mapY: number;
  horizontalAccuracy: number | null;
  createdAt: string;
};

type Session = {
  room: string;
  mode: RoomMode;
  storageReady: boolean;
  groupAvailable: boolean;
  chatType: string | null;
  user: { id: number; firstName: string; username: string | null; photoUrl: string | null };
  admin: boolean;
  anchorCount: number;
  anchors: Anchor[];
  members: Member[];
  serverTime: string;
};

type TelegramLocationData = {
  latitude: number;
  longitude: number;
  horizontal_accuracy: number | null;
};

type TelegramInset = { top: number; right: number; bottom: number; left: number };

type TelegramWebApp = {
  initData: string;
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  contentSafeAreaInset?: TelegramInset;
  safeAreaInset?: TelegramInset;
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
  HapticFeedback?: { impactOccurred?: (style: "light" | "medium" | "heavy") => void };
  LocationManager?: {
    isInited: boolean;
    isLocationAvailable: boolean;
    isAccessGranted: boolean;
    init: (callback?: () => void) => unknown;
    getLocation: (callback: (data: TelegramLocationData | null) => void) => unknown;
    openSettings?: () => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SESSION_CACHE = "space-safari-map-session-v2";
const LIVE_INTERVAL_MS = 25_000;
const POLL_INTERVAL_MS = 15_000;

function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "nu";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)} min`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function browserLocation(): Promise<LocationFix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocatie is niet beschikbaar op dit toestel."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        horizontalAccuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      }),
      (error) => reject(new Error(error.message || "Locatie kon niet worden opgehaald.")),
      { enableHighAccuracy: true, maximumAge: 4_000, timeout: 15_000 },
    );
  });
}

async function telegramLocation(): Promise<LocationFix> {
  const manager = window.Telegram?.WebApp?.LocationManager;
  if (!manager) return browserLocation();

  if (!manager.isInited) {
    await new Promise<void>((resolve) => manager.init(() => resolve()));
  }
  if (!manager.isLocationAvailable) return browserLocation();

  return new Promise((resolve, reject) => {
    manager.getLocation((data) => {
      if (!data) {
        reject(new Error("Telegram kreeg geen locatietoegang. Controleer de Mini App-locatiepermissie."));
        return;
      }
      resolve({
        latitude: data.latitude,
        longitude: data.longitude,
        horizontalAccuracy: data.horizontal_accuracy ?? null,
      });
    });
  });
}

export default function MapClientV2() {
  const [initData, setInitData] = useState("");
  const [mode, setMode] = useState<RoomMode>("group");
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [liveSharing, setLiveSharing] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [lastOwnFix, setLastOwnFix] = useState<LocationFix | null>(null);
  const [calibrationFix, setCalibrationFix] = useState<LocationFix | null>(null);
  const [calibrationPoint, setCalibrationPoint] = useState<{ x: number; y: number } | null>(null);
  const [anchorName, setAnchorName] = useState("");
  const [savingAnchor, setSavingAnchor] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!initData) return;
    if (!quiet) setLoading(true);
    try {
      const next = await postJson<Session>("/api/map/session", { initData, mode });
      setSession(next);
      setOnline(true);
      setError(null);
      localStorage.setItem(`${SESSION_CACHE}:${mode}`, JSON.stringify(next));
      if (mode === "group" && !next.groupAvailable) setMode("public");
    } catch (err) {
      setOnline(false);
      const cached = localStorage.getItem(`${SESSION_CACHE}:${mode}`);
      if (cached) {
        try { setSession(JSON.parse(cached) as Session); } catch { /* ignore corrupt cache */ }
      }
      if (!quiet) setError(err instanceof Error ? err.message : "Kaart kon niet synchroniseren.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [initData, mode]);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready?.();
    webApp?.expand?.();
    webApp?.setHeaderColor?.("#211120");
    webApp?.setBackgroundColor?.("#211120");
    webApp?.setBottomBarColor?.("#211120");

    // Do not auto-request Telegram fullscreen. On iOS that can put app content
    // underneath Telegram's own chrome. Respect Telegram's content safe area instead.
    const applyInsets = () => {
      const inset = webApp?.contentSafeAreaInset ?? webApp?.safeAreaInset;
      document.documentElement.style.setProperty("--tg-safe-top", `${Math.max(0, inset?.top ?? 0)}px`);
      document.documentElement.style.setProperty("--tg-safe-bottom", `${Math.max(0, inset?.bottom ?? 0)}px`);
    };
    applyInsets();
    webApp?.onEvent?.("contentSafeAreaChanged", applyInsets);
    webApp?.onEvent?.("safeAreaChanged", applyInsets);

    setInitData(webApp?.initData ?? "");
    setLoading(false);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    return () => {
      webApp?.offEvent?.("contentSafeAreaChanged", applyInsets);
      webApp?.offEvent?.("safeAreaChanged", applyInsets);
    };
  }, []);

  useEffect(() => {
    if (!initData) return;
    void refresh();
    const id = window.setInterval(() => void refresh(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [initData, mode, refresh]);

  useEffect(() => {
    if (!liveSharing || !initData) return;
    let cancelled = false;
    const update = async () => {
      try {
        const location = await telegramLocation();
        if (cancelled) return;
        setLastOwnFix(location);
        await postJson("/api/map/location", { action: "update", initData, mode, location });
        setSharing(true);
        setOnline(true);
        await refresh(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Live locatie bijwerken mislukte.");
      }
    };
    void update();
    const id = window.setInterval(() => void update(), LIVE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [liveSharing, initData, mode, refresh]);

  const shareOnce = async () => {
    if (!initData) return;
    setError(null);
    try {
      const location = await telegramLocation();
      setLastOwnFix(location);
      await postJson("/api/map/location", { action: "update", initData, mode, location });
      setSharing(true);
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium");
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Locatie delen mislukte.");
    }
  };

  const stopSharing = async () => {
    setLiveSharing(false);
    if (!initData) return;
    try {
      await postJson("/api/map/location", { action: "stop", initData, mode });
      setSharing(false);
      setLastOwnFix(null);
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stoppen met delen mislukte.");
    }
  };

  const changeMode = async (next: RoomMode) => {
    if (next === mode) return;
    if (liveSharing || sharing) await stopSharing();
    setMode(next);
    setSession(null);
    setError(null);
  };

  const beginCalibration = async () => {
    setError(null);
    setCalibrationPoint(null);
    try {
      const location = await telegramLocation();
      setCalibrationFix(location);
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium");
    } catch (err) {
      setError(err instanceof Error ? err.message : "GPS-anker kon niet worden opgenomen.");
    }
  };

  const handleMapTap = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!calibrationFix || !session?.admin || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    setCalibrationPoint({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
  };

  const saveCalibration = async () => {
    if (!initData || !calibrationFix || !calibrationPoint || !anchorName.trim()) return;
    setSavingAnchor(true);
    try {
      await postJson("/api/map/anchors", {
        action: "save",
        initData,
        name: anchorName.trim(),
        ...calibrationFix,
        mapX: calibrationPoint.x,
        mapY: calibrationPoint.y,
      });
      setAnchorName("");
      setCalibrationFix(null);
      setCalibrationPoint(null);
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("heavy");
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anker opslaan mislukte.");
    } finally {
      setSavingAnchor(false);
    }
  };

  const removeAnchor = async (id: string) => {
    if (!initData || !confirm("Dit kalibratiepunt verwijderen?")) return;
    try {
      await postJson("/api/map/anchors", { action: "delete", initData, id });
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anker verwijderen mislukte.");
    }
  };

  const freshMembers = useMemo(
    () => (session?.members ?? []).filter((member) => Date.now() - new Date(member.updatedAt).getTime() <= 15 * 60 * 1000),
    [session],
  );
  const visibleMembers = useMemo(
    () => freshMembers.filter((member) => member.mapX !== null && member.mapY !== null && member.mapX! >= -0.1 && member.mapX! <= 1.1 && member.mapY! >= -0.1 && member.mapY! <= 1.1),
    [freshMembers],
  );
  const me = freshMembers.find((member) => member.userId === session?.user.id);
  const calibrated = (session?.anchorCount ?? 0) >= 2;
  const roomLabel = mode === "public" ? "Festival live" : "Groepskaart";

  if (!initData) {
    return (
      <main className={styles.shell}>
        <section className={styles.browserFallback}>
          <div className={styles.kicker}>SPACE SAFARI</div>
          <h1>Festivalkaart</h1>
          <p>Open de kaart vanuit de Telegram-bot voor live locaties en groepsrooms.</p>
          <a href="/festival-map.jpg" className={styles.primaryButton}>Open statische kaart</a>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>MASSEMBRE · 2026</div>
          <div className={styles.brand}>SPACE <span>SAFARI</span></div>
        </div>
        <div className={styles.livePill}>
          <span className={`${styles.liveDot} ${online ? "" : styles.offline}`} />
          {online ? "live" : "offline"}
        </div>
      </header>

      <nav className={styles.roomTabs} aria-label="Kaartroom">
        <button
          type="button"
          className={mode === "group" ? styles.activeTab : ""}
          disabled={session ? !session.groupAvailable : false}
          onClick={() => void changeMode("group")}
        >
          👥 Groep
        </button>
        <button
          type="button"
          className={mode === "public" ? styles.activeTab : ""}
          onClick={() => void changeMode("public")}
        >
          🌍 Publiek
        </button>
      </nav>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {!session?.storageReady && session && (
        <div className={styles.infoBanner}>Live delen is nog niet gekoppeld. De kaart zelf blijft bruikbaar.</div>
      )}

      <section className={styles.mapCard}>
        <div className={styles.mapTopbar}>
          <div>
            <strong>{roomLabel}</strong>
            <span>{loading ? "verbinden…" : `${freshMembers.length} ${freshMembers.length === 1 ? "persoon" : "mensen"} actief`}</span>
          </div>
          <label className={styles.nameToggle}>
            <input type="checkbox" checked={showNames} onChange={(event) => setShowNames(event.target.checked)} />
            Namen
          </label>
        </div>

        <div
          ref={mapRef}
          className={`${styles.mapSurface} ${calibrationFix ? styles.calibrating : ""}`}
          onClick={handleMapTap}
          role={calibrationFix ? "button" : undefined}
          aria-label="Space Safari festivalkaart"
        >
          <img src="/festival-map.jpg" alt="Space Safari festivalterrein met camping, stages en voorzieningen" draggable={false} />

          {session?.admin && session.anchors.map((anchor) => (
            <span
              key={anchor.id}
              className={styles.anchorMarker}
              title={anchor.name}
              style={{ left: `${anchor.mapX * 100}%`, top: `${anchor.mapY * 100}%` }}
            />
          ))}

          {visibleMembers.map((member) => {
            const isMe = member.userId === session?.user.id;
            const label = member.username ? `@${member.username}` : member.displayName;
            return (
              <span
                key={member.userId}
                className={`${styles.marker} ${isMe ? styles.me : ""}`}
                style={{ left: `${member.mapX! * 100}%`, top: `${member.mapY! * 100}%` }}
                title={`${label} · ${ago(member.updatedAt)}`}
              >
                {member.photoUrl
                  ? <img src={member.photoUrl} alt="" referrerPolicy="no-referrer" />
                  : <span>{initials(member.displayName)}</span>}
                {showNames && <b>{label}</b>}
              </span>
            );
          })}

          {calibrationPoint && (
            <span
              className={styles.calibrationTarget}
              style={{ left: `${calibrationPoint.x * 100}%`, top: `${calibrationPoint.y * 100}%` }}
            />
          )}
        </div>

        <div className={styles.mapMeta}>
          <span>{calibrated ? `✓ ${session?.anchorCount ?? 0} ankers` : `Kalibratie ${session?.anchorCount ?? 0}/2`}</span>
          <span>{lastOwnFix?.horizontalAccuracy ? `GPS ±${Math.round(lastOwnFix.horizontalAccuracy)} m` : "GPS nog niet gedeeld"}</span>
        </div>
      </section>

      <section className={styles.shareCard}>
        <div className={styles.shareHeading}>
          <div>
            <span className={styles.kicker}>MIJN LOCATIE</span>
            <strong>{sharing || liveSharing || me ? "Je bent zichtbaar" : "Alleen delen wanneer jij kiest"}</strong>
          </div>
          {(sharing || liveSharing || me) && <span className={styles.sharingDot}>●</span>}
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          disabled={loading || session?.storageReady === false}
          onClick={() => void shareOnce()}
        >
          📍 {sharing || me ? "Locatie bijwerken" : "Locatie delen"}
        </button>

        <div className={styles.liveRow}>
          <div>
            <strong>Live updates</strong>
            <span>Elke 25 seconden zolang de Mini App open is</span>
          </div>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={liveSharing}
              disabled={session?.storageReady === false}
              onChange={(event) => setLiveSharing(event.target.checked)}
            />
            <span />
          </label>
        </div>

        {(sharing || liveSharing || me) && (
          <button type="button" className={styles.stopButton} onClick={() => void stopSharing()}>
            Stop met delen
          </button>
        )}

        <p className={styles.privacy}>Geen routegeschiedenis. Je marker verdwijnt automatisch na 15 minuten zonder update.</p>
      </section>

      {freshMembers.length > 0 && (
        <section className={styles.peopleCard}>
          <div className={styles.sectionLabel}>NU OP DE KAART</div>
          <div className={styles.peopleStrip}>
            {[...freshMembers]
              .sort((a, b) => (a.userId === session?.user.id ? -1 : b.userId === session?.user.id ? 1 : 0))
              .map((member) => {
                const label = member.username ? `@${member.username}` : member.displayName;
                return (
                  <div className={styles.personChip} key={member.userId}>
                    <div className={styles.avatar}>
                      {member.photoUrl ? <img src={member.photoUrl} alt="" referrerPolicy="no-referrer" /> : initials(member.displayName)}
                    </div>
                    <div>
                      <strong>{member.userId === session?.user.id ? "Jij" : label}</strong>
                      <span>{ago(member.updatedAt)} · {member.horizontalAccuracy ? `±${Math.round(member.horizontalAccuracy)} m` : "GPS"}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {session?.admin && (
        <details className={styles.adminCard}>
          <summary>📍 Kaart kalibreren · {session.anchorCount} ankers</summary>
          <div className={styles.adminBody}>
            <p>Loop naar een herkenbaar punt, neem daar je GPS op en tik daarna exact dezelfde plek op de festivalkaart.</p>
            <input
              className={styles.textInput}
              list="anchor-suggestions-v2"
              value={anchorName}
              onChange={(event) => setAnchorName(event.target.value)}
              placeholder="Naam, bv. Galaxy"
            />
            <datalist id="anchor-suggestions-v2">
              <option value="Entrance" /><option value="Galaxy" /><option value="Nebula" /><option value="Zodiac" />
              <option value="Supernova" /><option value="Camping 1" /><option value="Camping 2" /><option value="Parking" />
            </datalist>
            <button type="button" className={styles.secondaryButton} onClick={() => void beginCalibration()}>
              1 · Neem huidige GPS
            </button>
            {calibrationFix && (
              <div className={styles.calibrationHint}>
                GPS vast{calibrationFix.horizontalAccuracy ? ` op ±${Math.round(calibrationFix.horizontalAccuracy)} m` : ""}. Tik nu op dezelfde plek op de kaart.
              </div>
            )}
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!calibrationFix || !calibrationPoint || !anchorName.trim() || savingAnchor}
              onClick={() => void saveCalibration()}
            >
              2 · Anker opslaan
            </button>
            {session.anchors.map((anchor) => (
              <div className={styles.anchorRow} key={anchor.id}>
                <span>{anchor.name}</span>
                <button type="button" onClick={() => void removeAnchor(anchor.id)}>Verwijder</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
