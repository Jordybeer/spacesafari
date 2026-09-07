"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FestivalGeoMap, { type GeoMember } from "./FestivalGeoMap";
import type { GeoAnchor } from "@/src/lib/map-georef";
import styles from "./MapClientV2.module.css";

type RoomMode = "group" | "public";
type ShareDuration = 900 | 1800 | 3600 | 7200 | 604800;

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

type SessionUser = { id: number; firstName: string; username: string | null; photoUrl: string | null };

type Session = {
  room: string;
  mode: RoomMode;
  storageReady: boolean;
  groupAvailable: boolean;
  chatType: string | null;
  authSource: "miniapp" | "web" | null;
  user: SessionUser | null;
  admin: boolean;
  anchorCount: number;
  anchors: Anchor[];
  members: Member[];
  serverTime: string;
};

type BrowserAuthStatus = {
  authenticated: boolean;
  loginConfigured: boolean;
  user: SessionUser | null;
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

const SESSION_CACHE = "space-safari-map-session-v4";
const LIVE_INTERVAL_MS = 25_000;
const POLL_INTERVAL_MS = 15_000;
const CONSTANT_TTL_SECONDS: ShareDuration = 604800;
const ROOM_TOKEN_RE = /^[A-Za-z0-9_-]{20,32}$/;
const SHARE_DURATIONS: { label: string; seconds: ShareDuration }[] = [
  { label: "15m", seconds: 900 },
  { label: "30m", seconds: 1800 },
  { label: "1u", seconds: 3600 },
  { label: "2u", seconds: 7200 },
  { label: "∞", seconds: CONSTANT_TTL_SECONDS },
];

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

function authErrorText(code: string | null): string | null {
  if (!code) return null;
  if (code === "not_configured") return "Telegram-login is nog niet geconfigureerd voor deze website.";
  if (code === "cancelled") return "Telegram-login werd geannuleerd.";
  if (code === "expired") return "De Telegram-login is verlopen. Probeer opnieuw.";
  return "Telegram-login mislukte. Probeer opnieuw.";
}

export default function MapClientV3() {
  const [initData, setInitData] = useState("");
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const [mode, setMode] = useState<RoomMode>("public");
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginConfigured, setLoginConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [liveSharing, setLiveSharing] = useState(false);
  const [shareDuration, setShareDuration] = useState<ShareDuration>(1800);
  const [shareUntil, setShareUntil] = useState<number | null>(null);
  const [showNames, setShowNames] = useState(true);
  const [lastOwnFix, setLastOwnFix] = useState<LocationFix | null>(null);
  const [calibrationFix, setCalibrationFix] = useState<LocationFix | null>(null);
  const [calibrationPoint, setCalibrationPoint] = useState<{ x: number; y: number } | null>(null);
  const [anchorName, setAnchorName] = useState("");
  const [savingAnchor, setSavingAnchor] = useState(false);
  const [testLocationBusy, setTestLocationBusy] = useState(false);
  const calibrationRef = useRef<HTMLDivElement>(null);

  const authPayload = useMemo(() => ({
    ...(initData ? { initData } : {}),
    ...(roomToken ? { roomToken } : {}),
  }), [initData, roomToken]);

  const cacheKey = `${SESSION_CACHE}:${mode}:${roomToken ?? "none"}`;

  const refresh = useCallback(async (quiet = false) => {
    if (!authReady) return;
    if (!quiet) setLoading(true);
    try {
      const next = await postJson<Session>("/api/map/session", { ...authPayload, mode });
      setSession(next);
      setOnline(true);
      if (!quiet) setError(null);
      localStorage.setItem(cacheKey, JSON.stringify(next));
      if (mode === "group" && !next.groupAvailable) setMode("public");
    } catch (cause) {
      setOnline(false);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try { setSession(JSON.parse(cached) as Session); } catch { /* stale cache */ }
      }
      if (!quiet) setError(cause instanceof Error ? cause.message : "Kaart kon niet synchroniseren.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [authPayload, authReady, cacheKey, mode]);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready?.();
    webApp?.expand?.();
    webApp?.setHeaderColor?.("#211120");
    webApp?.setBackgroundColor?.("#211120");
    webApp?.setBottomBarColor?.("#211120");

    const query = new URLSearchParams(window.location.search);
    const rawRoomToken = query.get("room");
    const nextRoomToken = rawRoomToken && ROOM_TOKEN_RE.test(rawRoomToken) ? rawRoomToken : null;
    setRoomToken(nextRoomToken);
    const nextInitData = webApp?.initData ?? "";
    setInitData(nextInitData);
    setMode(nextInitData ? "group" : "public");

    const authError = authErrorText(query.get("auth_error"));
    if (authError) setError(authError);

    const applyInsets = () => {
      const inset = webApp?.contentSafeAreaInset ?? webApp?.safeAreaInset;
      document.documentElement.style.setProperty("--tg-safe-top", `${Math.max(0, inset?.top ?? 0)}px`);
      document.documentElement.style.setProperty("--tg-safe-bottom", `${Math.max(0, inset?.bottom ?? 0)}px`);
    };
    applyInsets();
    webApp?.onEvent?.("contentSafeAreaChanged", applyInsets);
    webApp?.onEvent?.("safeAreaChanged", applyInsets);

    const finishAuth = async () => {
      if (nextInitData) {
        setAuthReady(true);
        return;
      }
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const status = await response.json() as BrowserAuthStatus;
        setLoginConfigured(status.loginConfigured);
        if (status.authenticated && nextRoomToken) setMode("group");
      } catch {
        setLoginConfigured(false);
      } finally {
        setAuthReady(true);
      }
    };
    void finishAuth();

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      webApp?.offEvent?.("contentSafeAreaChanged", applyInsets);
      webApp?.offEvent?.("safeAreaChanged", applyInsets);
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [authReady, mode, refresh]);

  const updateOwnLocation = useCallback(async (ttlSeconds: number) => {
    if (!session?.user) throw new Error("Log in met Telegram om je locatie te delen.");
    const location = await telegramLocation();
    setLastOwnFix(location);
    await postJson("/api/map/location", { action: "update", ...authPayload, mode, location, ttlSeconds });
    setSharing(true);
    setOnline(true);
    await refresh(true);
    return location;
  }, [authPayload, mode, refresh, session?.user]);

  const stopSharing = useCallback(async () => {
    setLiveSharing(false);
    setShareUntil(null);
    if (!session?.user) return;
    try {
      await postJson("/api/map/location", { action: "stop", ...authPayload, mode });
      setSharing(false);
      setLastOwnFix(null);
      await refresh(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Stoppen met delen mislukte.");
    }
  }, [authPayload, mode, refresh, session?.user]);

  useEffect(() => {
    if (!liveSharing || !session?.user) return;
    let cancelled = false;

    const update = async () => {
      if (cancelled) return;
      if (shareUntil && Date.now() >= shareUntil) {
        await stopSharing();
        return;
      }
      const ttl = shareUntil
        ? Math.max(60, Math.ceil((shareUntil - Date.now()) / 1000))
        : CONSTANT_TTL_SECONDS;
      try {
        await updateOwnLocation(ttl);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Live locatie bijwerken mislukte.");
      }
    };

    void update();
    const timer = window.setInterval(() => void update(), LIVE_INTERVAL_MS);
    const expiryTimer = shareUntil
      ? window.setTimeout(() => void stopSharing(), Math.max(0, shareUntil - Date.now()))
      : null;

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (expiryTimer !== null) window.clearTimeout(expiryTimer);
    };
  }, [liveSharing, session?.user, shareUntil, stopSharing, updateOwnLocation]);

  const shareOnce = async () => {
    setError(null);
    try {
      await updateOwnLocation(shareDuration);
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Locatie delen mislukte.");
    }
  };

  const toggleLiveSharing = (enabled: boolean) => {
    if (!enabled) {
      void stopSharing();
      return;
    }
    setShareUntil(shareDuration === CONSTANT_TTL_SECONDS ? null : Date.now() + shareDuration * 1000);
    setLiveSharing(true);
  };

  const chooseDuration = (seconds: ShareDuration) => {
    setShareDuration(seconds);
    if (liveSharing) {
      setShareUntil(seconds === CONSTANT_TTL_SECONDS ? null : Date.now() + seconds * 1000);
    }
  };

  const changeMode = async (next: RoomMode) => {
    if (next === mode) return;
    if (next === "group" && !session?.groupAvailable) {
      setError("Open een groepslink vanuit de Telegram-bot om deze groepskaart te gebruiken.");
      return;
    }
    if (sharing || liveSharing) await stopSharing();
    setMode(next);
    setSession(null);
    setError(null);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    setLiveSharing(false);
    setSharing(false);
    setLastOwnFix(null);
    setMode("public");
    setSession(null);
    await refresh();
  };

  const setTemporaryTestLocation = async (enabled: boolean) => {
    if (!session?.admin || testLocationBusy) return;
    setTestLocationBusy(true);
    setError(null);
    setLiveSharing(false);
    setShareUntil(null);
    setSharing(false);
    setLastOwnFix(null);
    try {
      await postJson("/api/map/test-location", {
        action: enabled ? "start" : "stop",
        ...authPayload,
        mode,
        ...(enabled ? { anchorName: "Nebula" } : {}),
      });
      await refresh(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Testlocatie instellen mislukte.");
    } finally {
      setTestLocationBusy(false);
    }
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
    if (!session?.admin || !calibrationFix || !calibrationPoint || !anchorName.trim()) return;
    setSavingAnchor(true);
    try {
      await postJson("/api/map/anchors", {
        action: "save",
        ...authPayload,
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
    if (!session?.admin || !confirm("Dit kalibratiepunt verwijderen?")) return;
    await postJson("/api/map/anchors", { action: "delete", ...authPayload, id });
    await refresh(true);
  };

  const freshMembers = useMemo(() => session?.members ?? [], [session]);
  const calibrated = (session?.anchorCount ?? 0) >= 2;
  const me = freshMembers.find((member) => member.userId === session?.user?.id);
  const selectedDurationLabel = SHARE_DURATIONS.find((item) => item.seconds === shareDuration)?.label ?? "30m";
  const returnTo = roomToken ? `/map?room=${encodeURIComponent(roomToken)}` : "/map";
  const loginHref = `/api/auth/telegram/start?returnTo=${encodeURIComponent(returnTo)}`;

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
        <button className={mode === "group" ? styles.activeTab : ""} disabled={!session?.groupAvailable} onClick={() => void changeMode("group")}>👥 Groep</button>
        <button className={mode === "public" ? styles.activeTab : ""} onClick={() => void changeMode("public")}>🌍 Publiek</button>
      </nav>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {session?.authSource === "web" && session.user && (
        <div className={styles.infoBanner}>
          Ingelogd als {session.user.username ? `@${session.user.username}` : session.user.firstName}. <button className={styles.stopCompact} onClick={() => void logout()}>Uitloggen</button>
        </div>
      )}

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
          ownUserId={session?.user?.id}
          ownFix={lastOwnFix}
          showNames={showNames}
        />
      </section>

      {!session?.storageReady && session && <div className={styles.infoBanner}>Live opslag ontbreekt. De kaart zelf blijft bruikbaar.</div>}

      {session?.user ? (
        <section className={styles.controlDock} aria-label="Locatie delen">
          <div className={styles.shareDurations} aria-label="Duur locatie delen">
            {SHARE_DURATIONS.map((item) => (
              <button
                type="button"
                key={item.seconds}
                className={shareDuration === item.seconds ? styles.activeDuration : ""}
                onClick={() => chooseDuration(item.seconds)}
                aria-pressed={shareDuration === item.seconds}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button className={styles.primaryButton} disabled={loading || session.storageReady === false} onClick={() => void shareOnce()}>
            📍 {sharing || me ? "Bijwerken" : "Deel locatie"}
          </button>
          <label className={styles.liveCompact}>
            <span><strong>Live</strong><small>{selectedDurationLabel}</small></span>
            <span className={styles.switch}>
              <input type="checkbox" checked={liveSharing} disabled={session.storageReady === false} onChange={(event) => toggleLiveSharing(event.target.checked)} />
              <span />
            </span>
          </label>
          {(sharing || liveSharing || me) && <button className={styles.stopCompact} onClick={() => void stopSharing()}>Stop</button>}
        </section>
      ) : (
        <section className={styles.controlDock} aria-label="Telegram login">
          <div className={styles.infoBanner}>De kaart is publiek. Log in met Telegram om je locatie te delen{roomToken ? " en deze groepslink te gebruiken" : ""}.</div>
          {loginConfigured ? (
            <a className={styles.primaryButton} href={loginHref}>Log in met Telegram</a>
          ) : (
            <div className={styles.infoBanner}>Telegram Web Login moet nog één keer in BotFather worden gekoppeld aan spacesafari.jordy.beer.</div>
          )}
        </section>
      )}

      {session?.admin && (
        <details className={styles.adminCard}>
          <summary>📍 Kalibratie · {session.anchorCount} ankers</summary>
          <div className={styles.adminBody}>
            <div className={styles.infoBanner}>Testen van thuis: alleen jouw admin-account kan een gesimuleerde festivalpositie plaatsen. Die verloopt automatisch na 10 minuten en staat als testlocatie in de tooltip.</div>
            {me?.simulated ? (
              <button className={styles.secondaryButton} disabled={testLocationBusy} onClick={() => void setTemporaryTestLocation(false)}>🧪 Verwijder testlocatie</button>
            ) : (
              <button className={styles.secondaryButton} disabled={testLocationBusy || !session.anchorCount} onClick={() => void setTemporaryTestLocation(true)}>🧪 Test mij 10 min bij Nebula</button>
            )}
            <p>Loop naar een herkenbaar punt, neem je GPS op en tik daarna dezelfde plek op de festivalkaart.</p>
            <input className={styles.textInput} list="anchor-suggestions-v3" value={anchorName} onChange={(event) => setAnchorName(event.target.value)} placeholder="Naam, bv. Galaxy" />
            <datalist id="anchor-suggestions-v3">
              <option value="Entrance" /><option value="Galaxy" /><option value="Nebula" /><option value="Zodiac" /><option value="Supernova" /><option value="Camping 1" /><option value="Camping 2" /><option value="Parking" />
            </datalist>
            <button className={styles.secondaryButton} onClick={() => void beginCalibration()}>1 · Neem huidige GPS</button>
            {calibrationFix && <div className={styles.calibrationHint}>GPS vast{calibrationFix.horizontalAccuracy ? ` op ±${Math.round(calibrationFix.horizontalAccuracy)} m` : ""}. Tik nu exact dezelfde plek hieronder.</div>}
            <div ref={calibrationRef} className={`${styles.calibrationImage} ${calibrationFix ? styles.calibrating : ""}`} onClick={handleCalibrationTap}>
              <img src="/festival-map.jpg?v=3" alt="" draggable={false} />
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
