"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FestivalGeoMap, { type GeoMember } from "./FestivalGeoMap";
import type { GeoAnchor } from "@/src/lib/map-georef";
import styles from "./MapClientV2.module.css";

type RoomMode = "group" | "public";

type LocationFix = {
  latitude: number;
  longitude: number;
  horizontalAccuracy: number | null;
};

type Anchor = GeoAnchor & {
  id: string;
  name: string;
  horizontalAccuracy: number | null;
  createdAt: string;
};

type Member = GeoMember & {
  horizontalAccuracy: number | null;
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
    init: (callback?: () => void) => unknown;
    getLocation: (callback: (data: TelegramLocationData | null) => void) => unknown;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SESSION_CACHE = "space-safari-map-session-v3";
const LIVE_INTERVAL_MS = 25_000;
const POLL_INTERVAL_MS = 15_000;

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
    if (!navigator.geolocation) return reject(new Error("Geolocatie is niet beschikbaar."));
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
  if (!manager.isInited) await new Promise<void>((resolve) => manager.init(() => resolve()));
  if (!manager.isLocationAvailable) return browserLocation();
  return new Promise((resolve, reject) => {
    manager.getLocation((data) => {
      if (!data) return reject(new Error("Telegram kreeg geen locatietoegang."));
      resolve({
        latitude: data.latitude,
        longitude: data.longitude,
        horizontalAccuracy: data.horizontal_accuracy ?? null,
      });
    });
  });
}

export default function MapClientV3() {
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
  const calibrationRef = useRef<HTMLDivElement>(null);

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
    } catch (cause) {
      setOnline(false);
      const cached = localStorage.getItem(`${SESSION_CACHE}:${mode}`);
      if (cached) {
        try { setSession(JSON.parse(cached) as Session); } catch { /* stale cache */ }
      }
      if (!quiet) setError(cause instanceof Error ? cause.message : "Kaart kon niet synchroniseren.");
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
    const timer = window.setInterval(() => void refresh(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [initData, mode, refresh]);

  const updateOwnLocation = useCallback(async () => {
    const location = await telegramLocation();
    setLastOwnFix(location);
    await postJson("/api/map/location", { action: "update", initData, mode, location });
    setSharing(true);
    setOnline(true);
    await refresh(true);
    return location;
  }, [initData, mode, refresh]);

  useEffect(() => {
    if (!liveSharing || !initData) return;
    let cancelled = false;
    const update = async () => {
      try {
        if (!cancelled) await updateOwnLocation();
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Live locatie bijwerken mislukte.");
      }
    };
    void update();
    const timer = window.setInterval(() => void update(), LIVE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [initData, liveSharing, updateOwnLocation]);

  const shareOnce = async () => {
    setError(null);
    try {
      await updateOwnLocation();
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Locatie delen mislukte.");
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Stoppen met delen mislukte.");
    }
  };

  const changeMode = async (next: RoomMode) => {
    if (next === mode) return;
    if (sharing || liveSharing) await stopSharing();
    setMode(next);
    setSession(null);
    setError(null);
  };

  const beginCalibration = async () => {
    setError(null);
    setCalibrationPoint(null);
    try {
      const fix = await telegramLocation();
      setCalibrationFix(fix);
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "GPS-anker kon niet worden opgenomen.");
    }
  };

  const handleCalibrationTap = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!calibrationFix || !session?.admin || !calibrationRef.current) return;
    const rect = calibrationRef.current.getBoundingClientRect();
    setCalibrationPoint({
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    });
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Anker opslaan mislukte.");
    } finally {
      setSavingAnchor(false);
    }
  };

  const removeAnchor = async (id: string) => {
    if (!initData || !confirm("Dit kalibratiepunt verwijderen?")) return;
    await postJson("/api/map/anchors", { action: "delete", initData, id });
    await refresh(true);
  };

  const freshMembers = useMemo(
    () => (session?.members ?? []).filter((member) => Date.now() - new Date(member.updatedAt).getTime() <= 15 * 60 * 1000),
    [session],
  );
  const calibrated = (session?.anchorCount ?? 0) >= 2;
  const me = freshMembers.find((member) => member.userId === session?.user.id);

  if (!initData) {
    return (
      <main className={styles.shell}>
        <section className={styles.browserFallback}>
          <div className={styles.kicker}>SPACE SAFARI</div>
          <h1>Festivalkaart</h1>
          <p>Open deze kaart vanuit de Telegram-bot voor live groepslocaties.</p>
          <a href="/festival-map.jpg?v=3" className={styles.primaryButton}>Open statische kaart</a>
        </section>
      </main>
    );
  }

  return (
    <main className={`${styles.shell} ${styles.geoShell}`}>
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
        <button className={mode === "group" ? styles.activeTab : ""} disabled={session ? !session.groupAvailable : false} onClick={() => void changeMode("group")}>👥 Groep</button>
        <button className={mode === "public" ? styles.activeTab : ""} onClick={() => void changeMode("public")}>🌍 Publiek</button>
      </nav>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <section className={`${styles.mapCard} ${styles.geoMapCard}`}>
        <div className={styles.mapTopbar}>
          <div>
            <strong>{mode === "public" ? "Festival live" : "Groepskaart"}</strong>
            <span>{loading ? "verbinden…" : `${freshMembers.length} actief · ${calibrated ? `${session?.anchorCount} ankers` : "overlay nog niet gekalibreerd"}`}</span>
          </div>
          <label className={styles.nameToggle}>
            <input type="checkbox" checked={showNames} onChange={(event) => setShowNames(event.target.checked)} /> Namen
          </label>
        </div>

        <FestivalGeoMap
          anchors={session?.anchors ?? []}
          members={freshMembers}
          ownUserId={session?.user.id}
          ownFix={lastOwnFix}
          showNames={showNames}
        />
      </section>

      {!session?.storageReady && session && <div className={styles.infoBanner}>Live opslag ontbreekt. De kaart zelf blijft bruikbaar.</div>}

      <section className={styles.controlDock}>
        <button className={styles.primaryButton} disabled={loading || session?.storageReady === false} onClick={() => void shareOnce()}>
          📍 {sharing || me ? "Bijwerken" : "Deel locatie"}
        </button>
        <label className={styles.liveCompact}>
          <span><strong>Live</strong><small>25s</small></span>
          <span className={styles.switch}>
            <input type="checkbox" checked={liveSharing} disabled={session?.storageReady === false} onChange={(event) => setLiveSharing(event.target.checked)} />
            <span />
          </span>
        </label>
        {(sharing || liveSharing || me) && <button className={styles.stopCompact} onClick={() => void stopSharing()}>Stop</button>}
      </section>

      {session?.admin && (
        <details className={styles.adminCard}>
          <summary>📍 Kalibratie · {session.anchorCount} ankers</summary>
          <div className={styles.adminBody}>
            <p>Loop naar een herkenbaar punt, neem je GPS op en tik daarna dezelfde plek op de festivalkaart. Vanaf twee ankers legt MapLibre de festivalkaart geografisch over OpenStreetMap.</p>
            <input className={styles.textInput} list="anchor-suggestions-v3" value={anchorName} onChange={(event) => setAnchorName(event.target.value)} placeholder="Naam, bv. Galaxy" />
            <datalist id="anchor-suggestions-v3">
              <option value="Entrance" /><option value="Galaxy" /><option value="Nebula" /><option value="Zodiac" /><option value="Supernova" /><option value="Camping 1" /><option value="Camping 2" /><option value="Parking" />
            </datalist>
            <button className={styles.secondaryButton} onClick={() => void beginCalibration()}>1 · Neem huidige GPS</button>
            {calibrationFix && <div className={styles.calibrationHint}>GPS vast{calibrationFix.horizontalAccuracy ? ` op ±${Math.round(calibrationFix.horizontalAccuracy)} m` : ""}. Tik nu exact dezelfde plek hieronder.</div>}
            <div ref={calibrationRef} className={`${styles.calibrationImage} ${calibrationFix ? styles.calibrating : ""}`} onClick={handleCalibrationTap}>
              <img src="/festival-map.jpg?v=3" alt="Space Safari festivalkaart voor kalibratie" draggable={false} />
              {session.anchors.map((anchor) => <span key={anchor.id} className={styles.anchorMarker} style={{ left: `${anchor.mapX * 100}%`, top: `${anchor.mapY * 100}%` }} />)}
              {calibrationPoint && <span className={styles.calibrationTarget} style={{ left: `${calibrationPoint.x * 100}%`, top: `${calibrationPoint.y * 100}%` }} />}
            </div>
            <button className={styles.primaryButton} disabled={!calibrationFix || !calibrationPoint || !anchorName.trim() || savingAnchor} onClick={() => void saveCalibration()}>2 · Anker opslaan</button>
            {session.anchors.map((anchor) => <div className={styles.anchorRow} key={anchor.id}><span>{anchor.name}</span><button onClick={() => void removeAnchor(anchor.id)}>Verwijder</button></div>)}
          </div>
        </details>
      )}
    </main>
  );
}
