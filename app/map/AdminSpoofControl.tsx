"use client";

import { useEffect, useMemo, useState } from "react";

type RoomMode = "group" | "public";

type Anchor = {
  id: string;
  name: string;
};

type Session = {
  admin: boolean;
  groupAvailable: boolean;
  anchors: Anchor[];
  members: Array<{ userId: number; simulated?: boolean }>;
  user: { id: number } | null;
};

type TelegramWindow = Window & {
  Telegram?: { WebApp?: { initData?: string } };
};

const ROOM_TOKEN_RE = /^[A-Za-z0-9_-]{20,32}$/;

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

export default function AdminSpoofControl() {
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<RoomMode>("public");
  const [anchorName, setAnchorName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authPayload = useMemo(() => {
    if (typeof window === "undefined") return {};
    const webApp = (window as TelegramWindow).Telegram?.WebApp;
    const initData = webApp?.initData ?? "";
    const rawRoom = new URLSearchParams(window.location.search).get("room");
    const roomToken = rawRoom && ROOM_TOKEN_RE.test(rawRoom) ? rawRoom : null;
    return {
      ...(initData ? { initData } : {}),
      ...(roomToken ? { roomToken } : {}),
    };
  }, []);

  const refresh = async (nextMode = mode) => {
    const next = await postJson<Session>("/api/map/session", { ...authPayload, mode: nextMode });
    setSession(next);
    if (!anchorName && next.anchors.length) {
      setAnchorName(next.anchors.find((anchor) => anchor.name.toLowerCase().includes("nebula"))?.name ?? next.anchors[0].name);
    }
    return next;
  };

  useEffect(() => {
    void (async () => {
      try {
        const publicSession = await refresh("public");
        if (publicSession.admin && publicSession.groupAvailable) {
          setMode("group");
          await refresh("group");
        }
      } catch {
        // The regular map owns auth/error UI; this helper stays invisible on failure.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session?.admin || !session.user) return null;

  const me = session.members.find((member) => member.userId === session.user?.id);
  const simulated = Boolean(me?.simulated);

  const switchMode = async (nextMode: RoomMode) => {
    if (nextMode === mode || busy) return;
    setBusy(true);
    setError(null);
    try {
      setMode(nextMode);
      await refresh(nextMode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Testmodus wisselen mislukte.");
    } finally {
      setBusy(false);
    }
  };

  const setSpoof = async (enabled: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        // Kill any regular/live GPS presence first. Reloading immediately after the
        // spoof is stored also resets the Mini App's client-side live-location timer,
        // so real home GPS cannot keep firing geofence errors over test mode.
        try {
          await postJson("/api/map/location", {
            action: "stop",
            ...authPayload,
            mode,
          });
        } catch {
          // No existing presence is fine; the spoof call below is authoritative.
        }
      }

      await postJson("/api/map/test-location", {
        action: enabled ? "start" : "stop",
        ...authPayload,
        mode,
        ...(enabled ? { anchorName } : {}),
      });

      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Testlocatie instellen mislukte.");
      setBusy(false);
    }
  };

  return (
    <aside
      aria-label="Admin testlocatie"
      style={{
        position: "fixed",
        zIndex: 40,
        right: 10,
        top: "calc(var(--tg-safe-top, 0px) + 112px)",
        width: 174,
        padding: 8,
        border: "1px solid rgba(248,232,209,.22)",
        borderRadius: 14,
        background: "rgba(32,15,29,.94)",
        boxShadow: "0 8px 24px rgba(0,0,0,.34)",
        backdropFilter: "blur(14px)",
        color: "#f8e8d1",
        fontSize: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
        <strong style={{ fontSize: 10, letterSpacing: ".04em" }}>🧪 SPOOF</strong>
        <div style={{ display: "flex", gap: 2 }}>
          {session.groupAvailable && (
            <button type="button" disabled={busy} onClick={() => void switchMode("group")} style={pill(mode === "group")}>groep</button>
          )}
          <button type="button" disabled={busy} onClick={() => void switchMode("public")} style={pill(mode === "public")}>publiek</button>
        </div>
      </div>

      <select
        aria-label="Testlocatie"
        value={anchorName}
        disabled={busy || simulated}
        onChange={(event) => setAnchorName(event.target.value)}
        style={{
          width: "100%",
          minHeight: 30,
          border: "1px solid rgba(248,232,209,.2)",
          borderRadius: 9,
          background: "#2b1629",
          color: "#fff4e7",
          font: "inherit",
          marginBottom: 6,
        }}
      >
        {session.anchors.map((anchor) => <option key={anchor.id} value={anchor.name}>{anchor.name}</option>)}
      </select>

      <button
        type="button"
        disabled={busy || (!simulated && !anchorName)}
        onClick={() => void setSpoof(!simulated)}
        style={{
          width: "100%",
          minHeight: 32,
          border: 0,
          borderRadius: 9,
          background: simulated ? "rgba(243,107,23,.22)" : "#1eb9bd",
          color: simulated ? "#ffd6b8" : "#211120",
          font: "inherit",
          fontWeight: 900,
        }}
      >
        {busy ? "bezig…" : simulated ? "Stop spoof" : "Spoof hier"}
      </button>
      {error && <div style={{ marginTop: 5, color: "#ffb9aa", lineHeight: 1.25 }}>{error}</div>}
    </aside>
  );
}

function pill(active: boolean): React.CSSProperties {
  return {
    minHeight: 22,
    padding: "0 6px",
    border: "1px solid rgba(248,232,209,.18)",
    borderRadius: 999,
    background: active ? "#1eb9bd" : "transparent",
    color: active ? "#211120" : "rgba(248,232,209,.7)",
    font: "inherit",
    fontWeight: 800,
  };
}
