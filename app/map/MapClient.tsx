"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type TelegramWebApp = {
  initData: string;
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
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

const SESSION_CACHE = "space-safari-map-session-v1";
const LIVE_INTERVAL_MS = 25_000;
const POLL_INTERVAL_MS = 15_000;

function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "nu";
  if (seconds < 60) return `${seconds}s geleden`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min geleden`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
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
    if (!navigator.geolocation) return reject(new Error("Geolocatie is niet beschikbaar op dit toestel."));
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

export default function MapClient() {
  const [initData, setInitData] = useState("");
  const [mode, setMode] = useState<RoomMode>("group");
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [liveSharing, setLiveSharing] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [showAnchors, setShowAnchors] = useState(false);
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
    if (typeof webApp?.requestFullscreen === "function") {
      try { webApp.requestFullscreen(); } catch { /* optional */ }
    }
    const data = webApp?.initData ?? "";
    setInitData(data);
    setLoading(false);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!initData) return;
    refresh();
    const id = window.setInterval(() => refresh(true), POLL_INTERVAL_MS);
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
    update();
    const id = window.setInterval(update, LIVE_INTERVAL_MS);
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
    if (liveSharing) await stopSharing();
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
      setShowAnchors(true);
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

  if (!initData) {
    return (
      <main className="landing-shell">
        <section className="festival-card landing-card">
          <div className="eyebrow">TELEGRAM MINI APP</div>
          <div className="wordmark">SPACE<br />SAFARI</div>
          <p className="lede">Open deze kaart vanuit de Space Safari Telegram-bot. Zo kan de server je Telegram-identiteit en groepsroom veilig verifiëren.</p>
          <p className="microcopy">De statische festivalkaart blijft hieronder beschikbaar.</p>
          <a className="primary-button" href="/festival-map.jpg">Open statische kaart</a>
        </section>
      </main>
    );
  }

  return (
    <main className="map-shell">
      <header className="map-header">
        <div>
          <div className="eyebrow">MASSEMBRE · BELGIUM</div>
          <h1 className="map-title">SPACE <span>SAFARI</span> LIVE</h1>
        </div>
        <div className="status-pill">
          <span className={`status-dot ${online ? "" : "offline"}`} />
          {online ? "live" : "offline cache"}
        </div>
      </header>

      <section className="festival-card room-tabs" aria-label="Kaartroom">
        <button className={`room-tab ${mode === "group" ? "active" : ""}`} disabled={session ? !session.groupAvailable : false} onClick={() => changeMode("group")}>👥 Mijn groep</button>
        <button className={`room-tab ${mode === "public" ? "active" : ""}`} onClick={() => changeMode("public")}>🌍 Space Safari Live</button>
      </section>

      {error && <div className="notice error-notice">{error}</div>}
      {!calibrated && session && (
        <div className="notice">📡 De live markers worden zichtbaar zodra minstens 2 GPS-ankers zijn gekalibreerd. Met 3+ verspreide ankers wordt de projectie lokaal nauwkeuriger.</div>
      )}
      {mode === "public" && !sharing && !liveSharing && (
        <div className="notice">🌍 Publieke room. Je locatie verschijnt hier pas nadat je zelf op delen drukt. Er wordt geen bewegingsgeschiedenis bewaard en je marker verloopt automatisch.</div>
      )}

      <div className="map-layout">
        <div>
          <div ref={mapRef} className="map-frame" onClick={handleMapTap} role={calibrationFix ? "button" : undefined} aria-label="Festivalkaart">
            <img className="map-image" src="/festival-map.jpg" alt="Space Safari festivalterrein met camping, stages en voorzieningen" draggable={false} />

            {showAnchors && session?.anchors.map((anchor) => (
              <span key={anchor.id} className="anchor-marker" data-name={anchor.name} style={{ left: `${anchor.mapX * 100}%`, top: `${anchor.mapY * 100}%` }} />
            ))}

            {visibleMembers.map((member) => {
              const isMe = member.userId === session?.user.id;
              const label = member.username ? `@${member.username}` : member.displayName;
              return (
                <span key={member.userId} className={`map-marker ${isMe ? "me" : ""}`} style={{ left: `${member.mapX! * 100}%`, top: `${member.mapY! * 100}%` }} title={`${label} · ${ago(member.updatedAt)}`}>
                  {member.photoUrl ? <img src={member.photoUrl} alt="" referrerPolicy="no-referrer" /> : <span className="marker-initials">{initials(member.displayName)}</span>}
                  {showNames && <span className="marker-label">{label}</span>}
                </span>
              );
            })}

            {calibrationPoint && (
              <span className="calibration-target" style={{ left: `${calibrationPoint.x * 100}%`, top: `${calibrationPoint.y * 100}%` }} />
            )}

            <div className="map-info-bar">
              <span><strong>{freshMembers.length}</strong> zichtbaar</span>
              <span>{session?.room ? `room ${session.room}` : "verbinden…"}</span>
              <span><strong>{session?.anchorCount ?? 0}</strong> ankers</span>
            </div>
          </div>
        </div>

        <div className="side-column">
          <section className="festival-card controls">
            <h2 className="section-title">Mijn locatie</h2>
            <div className="control-grid">
              <button className="control-button secondary" disabled={loading} onClick={shareOnce}>📍 Eenmalig</button>
              <button className="control-button" disabled={loading} onClick={() => setLiveSharing((value) => !value)}>{liveSharing ? "🟢 Live aan" : "🛰 Live delen"}</button>
              {(sharing || liveSharing || me) && <button className="control-button danger wide" onClick={stopSharing}>⏹ Stop delen</button>}
            </div>
            <div className="toggle-row"><span>Telegram-namen op kaart</span><input className="switch" type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /></div>
            {session?.admin && <div className="toggle-row"><span>Kalibratiepunten tonen</span><input className="switch" type="checkbox" checked={showAnchors} onChange={(e) => setShowAnchors(e.target.checked)} /></div>}
            <p className="microcopy">
              {lastOwnFix ? `Laatste GPS nauwkeurigheid: ${lastOwnFix.horizontalAccuracy ? `±${Math.round(lastOwnFix.horizontalAccuracy)} m` : "onbekend"}. ` : ""}
              Een marker vervalt na 15 minuten zonder update.
            </p>
          </section>

          <section className="festival-card member-list">
            <h2 className="section-title">Mensen · {mode === "public" ? "publiek" : "groep"}</h2>
            {freshMembers.length === 0 && <p className="microcopy">Nog niemand deelt in deze room.</p>}
            {[...freshMembers].sort((a, b) => (a.userId === session?.user.id ? -1 : b.userId === session?.user.id ? 1 : 0)).map((member) => {
              const label = member.username ? `@${member.username}` : member.displayName;
              return (
                <div className="member-row" key={member.userId}>
                  <div className="avatar">{member.photoUrl ? <img src={member.photoUrl} alt="" referrerPolicy="no-referrer" /> : initials(member.displayName)}</div>
                  <div className="member-copy">
                    <div className="member-name">{label}{member.userId === session?.user.id ? " · jij" : ""}</div>
                    <div className="member-meta">{ago(member.updatedAt)} · GPS {member.horizontalAccuracy ? `±${Math.round(member.horizontalAccuracy)} m` : "nauwkeurigheid onbekend"}{member.mapX === null ? " · nog niet projecteerbaar" : ""}</div>
                  </div>
                  {member.username && <a className="small-button" href={`https://t.me/${member.username}`}>Telegram</a>}
                </div>
              );
            })}
          </section>

          {session?.admin && (
            <section className="festival-card admin-panel">
              <h2 className="section-title">📍 Calibration mode</h2>
              <div className="calibration-form">
                <input className="text-input" list="anchor-suggestions" value={anchorName} onChange={(e) => setAnchorName(e.target.value)} placeholder="Naam, bv. Galaxy" />
                <datalist id="anchor-suggestions">
                  <option value="Entrance" /><option value="Galaxy" /><option value="Nebula" /><option value="Zodiac" /><option value="Supernova" /><option value="Camping 1" /><option value="Camping 2" /><option value="Camping 3" /><option value="Parking" />
                </datalist>
                <button className="control-button secondary" onClick={beginCalibration}>1. 📡 Neem huidige GPS</button>
                <div className="microcopy">
                  {calibrationFix ? `GPS vast: ${calibrationFix.horizontalAccuracy ? `±${Math.round(calibrationFix.horizontalAccuracy)} m` : "nauwkeurigheid onbekend"}. Tik nu exact dezelfde plek op de festivalkaart.` : "Loop naar een herkenbaar punt en neem daar je GPS op."}
                </div>
                <button className="control-button" disabled={!calibrationFix || !calibrationPoint || !anchorName.trim() || savingAnchor} onClick={saveCalibration}>3. ✨ Anker opslaan</button>
              </div>
              {(session.anchors ?? []).map((anchor) => (
                <div className="anchor-row" key={anchor.id}>
                  <div className="member-copy"><div className="member-name">{anchor.name}</div><div className="member-meta">x {anchor.mapX.toFixed(3)} · y {anchor.mapY.toFixed(3)}</div></div>
                  <button className="small-button danger" onClick={() => removeAnchor(anchor.id)}>Verwijder</button>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
