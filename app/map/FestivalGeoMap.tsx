"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from "maplibre-gl";
import { parseFestivalStartParam } from "@/src/lib/festival-links";
import { DEFAULT_FESTIVAL_ID } from "@/src/lib/festivals";
import { festivalImageCorners, type GeoAnchor, type LngLatTuple } from "@/src/lib/map-georef";
import styles from "./MapClientV2.module.css";
import mapUi from "./FestivalGeoMap.module.css";

const LIVE_LOCATION_MS = 75_000;
const PRESENCE_TICK_MS = 30_000;
const LOCAL_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "festival-background", type: "background", paint: { "background-color": "#251225" } }],
};

export type MeetStatus = "going" | "arrived";

export interface GeoMember {
  userId: number;
  displayName: string;
  username?: string;
  photoUrl?: string;
  updatedAt: string;
  latitude: number;
  longitude: number;
  mapX: number | null;
  mapY: number | null;
  simulated?: boolean;
  meetStatus?: MeetStatus | null;
}

export interface GeoMeetPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  createdByName: string;
  createdAt: string;
  expiresAt: string;
  goingCount: number;
  arrivedCount: number;
}

export interface GeoTentPoint {
  userId: number;
  displayName: string;
  username: string | null;
  latitude: number;
  longitude: number;
  createdAt: string;
}

interface FestivalMapConfig {
  id: string;
  name: string;
  year: number;
  status: "draft" | "map" | "anchors" | "timetable" | "ready";
  mapImageUrl: string;
  mapImageWidth: number;
  mapImageHeight: number;
  venueCenter: { latitude: number; longitude: number };
}

interface LocationFix {
  latitude: number;
  longitude: number;
  horizontalAccuracy: number | null;
}

interface FestivalGeoMapProps {
  anchors: GeoAnchor[];
  members: GeoMember[];
  meet: GeoMeetPoint | null;
  tents: GeoTentPoint[];
  ownUserId?: number;
  ownFix: LocationFix | null;
  showNames: boolean;
}

type TelegramWindow = Window & {
  Telegram?: { WebApp?: { initData?: string } };
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function memberName(member: GeoMember, isMe: boolean): string {
  if (isMe) return "Jij";
  return member.username ? `@${member.username}` : member.displayName;
}

function ageMs(updatedAt: string, nowMs: number): number {
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMs - timestamp);
}

function formatLastSeen(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs)) return "laatst gezien onbekend";
  const minutes = Math.max(1, Math.floor(elapsedMs / 60_000));
  if (minutes < 60) return `laatst gezien ${minutes} min geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `laatst gezien ${hours} u geleden`;
  return `laatst gezien ${Math.floor(hours / 24)} d geleden`;
}

function attachPresenceTooltip(root: HTMLDivElement, text: string, live: boolean): void {
  root.tabIndex = 0;
  root.setAttribute("role", "button");
  root.setAttribute("aria-expanded", "false");
  root.dataset.presenceTooltipOpen = "false";

  const tooltip = document.createElement("span");
  tooltip.className = `${styles.geoLabel} ${live ? styles.geoLabelLive : styles.geoLabelStale}`;
  tooltip.textContent = text;
  tooltip.dataset.presenceTooltip = "true";
  tooltip.style.top = "auto";
  tooltip.style.bottom = "calc(100% + 8px)";
  tooltip.style.display = "none";
  tooltip.style.pointerEvents = "none";
  root.appendChild(tooltip);

  const setOpen = (open: boolean) => {
    root.dataset.presenceTooltipOpen = open ? "true" : "false";
    root.setAttribute("aria-expanded", String(open));
    tooltip.style.display = open ? "inline-block" : "none";
  };

  const closeOtherTooltips = () => {
    document.querySelectorAll<HTMLElement>("[data-presence-tooltip-open='true']").forEach((element) => {
      if (element === root) return;
      element.dataset.presenceTooltipOpen = "false";
      element.setAttribute("aria-expanded", "false");
      const otherTooltip = element.querySelector<HTMLElement>("[data-presence-tooltip]");
      if (otherTooltip) otherTooltip.style.display = "none";
    });
  };

  const toggle = () => {
    const open = root.dataset.presenceTooltipOpen === "true";
    closeOtherTooltips();
    setOpen(!open);
  };

  root.addEventListener("click", (event) => {
    event.stopPropagation();
    toggle();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    toggle();
  });
  root.addEventListener("blur", () => setOpen(false));
}

function appendMeetingStatusDot(root: HTMLDivElement, status: MeetStatus): void {
  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  dot.title = status === "arrived" ? "Aangekomen" : "Onderweg";
  dot.textContent = status === "arrived" ? "✓" : "→";
  Object.assign(dot.style, {
    position: "absolute",
    left: "-4px",
    bottom: "-4px",
    zIndex: "5",
    width: "15px",
    height: "15px",
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    border: "2px solid #211120",
    background: status === "arrived" ? "#63d98b" : "#f3a14a",
    color: "#211120",
    fontSize: "9px",
    fontWeight: "1000",
    lineHeight: "1",
    boxShadow: status === "arrived" ? "0 0 9px rgba(99,217,139,.65)" : "0 0 9px rgba(243,161,74,.52)",
    pointerEvents: "none",
  });
  root.appendChild(dot);
}

function createMarkerElement(member: GeoMember, isMe: boolean, showNames: boolean, nowMs: number): HTMLDivElement {
  const elapsedMs = ageMs(member.updatedAt, nowMs);
  const live = Boolean(member.simulated) || elapsedMs <= LIVE_LOCATION_MS;
  const name = memberName(member, isMe);
  const presenceText = member.simulated ? "testlocatie" : live ? "live" : formatLastSeen(elapsedMs);
  const meetText = member.meetStatus === "arrived" ? " · aangekomen" : member.meetStatus === "going" ? " · onderweg" : "";
  const statusText = `${presenceText}${meetText}`;

  const root = document.createElement("div");
  root.className = [
    styles.geoMarker,
    live ? styles.geoMarkerLive : styles.geoMarkerStale,
    isMe ? styles.geoMarkerMe : "",
  ].filter(Boolean).join(" ");
  root.style.zIndex = "2";
  root.title = `${name} · ${statusText}`;
  root.setAttribute("aria-label", `${name}, ${statusText}`);

  const avatar = document.createElement("div");
  avatar.className = styles.geoAvatar;
  if (member.photoUrl) {
    const image = document.createElement("img");
    image.src = member.photoUrl;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    avatar.appendChild(image);
  } else {
    avatar.textContent = initials(member.displayName);
  }
  root.appendChild(avatar);

  const presenceDot = document.createElement("span");
  presenceDot.className = `${styles.geoPresenceDot} ${live ? styles.geoPresenceLive : styles.geoPresenceStale}`;
  presenceDot.setAttribute("aria-hidden", "true");
  root.appendChild(presenceDot);

  if (member.meetStatus) appendMeetingStatusDot(root, member.meetStatus);
  attachPresenceTooltip(root, showNames ? statusText : `${name} · ${statusText}`, live);

  if (showNames) {
    const label = document.createElement("span");
    label.className = `${styles.geoLabel} ${live ? styles.geoLabelLive : styles.geoLabelStale}`;
    label.textContent = name;
    root.appendChild(label);
  }
  return root;
}

function createSpecialMarkerElement(kind: "meet" | "tent", label: string, detail: string): HTMLDivElement {
  const root = document.createElement("div");
  root.dataset.mapSpecial = kind;
  root.title = detail;
  root.setAttribute("aria-label", detail);
  root.style.position = "relative";
  root.style.display = "grid";
  root.style.placeItems = "center";
  root.style.zIndex = kind === "meet" ? "4" : "3";

  const bubble = document.createElement("div");
  bubble.dataset.specialBubble = "true";
  Object.assign(bubble.style, {
    width: kind === "meet" ? "42px" : "36px",
    height: kind === "meet" ? "42px" : "36px",
    display: "grid",
    placeItems: "center",
    borderRadius: "50% 50% 50% 10%",
    transform: "rotate(-45deg)",
    border: kind === "meet" ? "2px solid #ffe1c9" : "2px solid #f8e8d1",
    background: kind === "meet" ? "#f36b17" : "#5a352d",
    boxShadow: kind === "meet" ? "0 0 0 6px rgba(243,107,23,.18), 0 6px 18px rgba(0,0,0,.42)" : "0 5px 15px rgba(0,0,0,.4)",
  });
  const emoji = document.createElement("span");
  emoji.textContent = kind === "meet" ? "📍" : "⛺";
  emoji.style.transform = "rotate(45deg)";
  emoji.style.fontSize = kind === "meet" ? "20px" : "17px";
  bubble.appendChild(emoji);
  root.appendChild(bubble);

  const text = document.createElement("span");
  text.className = `${styles.geoLabel} ${styles.geoLabelLive}`;
  text.textContent = label;
  text.style.top = "calc(100% + 6px)";
  text.style.background = kind === "meet" ? "rgba(94,43,20,.96)" : "rgba(65,38,31,.96)";
  text.style.borderColor = kind === "meet" ? "rgba(243,107,23,.55)" : "rgba(248,232,209,.28)";
  root.appendChild(text);
  return root;
}

function validPoint(value: { latitude: number; longitude: number } | null | undefined): value is { latitude: number; longitude: number } {
  return Boolean(value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude));
}

function validVenueCenter(value: FestivalMapConfig["venueCenter"]): boolean {
  return validPoint(value) && !(value.latitude === 0 && value.longitude === 0);
}

function boundsForCorners(maplibre: typeof import("maplibre-gl"), corners: readonly LngLatTuple[]) {
  const bounds = new maplibre.LngLatBounds(corners[0], corners[0]);
  corners.slice(1).forEach((corner) => bounds.extend(corner));
  return bounds;
}

function prepareFestivalArtwork(map: MapLibreMap, festival: FestivalMapConfig): HTMLImageElement {
  const image = document.createElement("img");
  image.src = festival.mapImageUrl;
  image.alt = "";
  image.draggable = false;
  image.setAttribute("aria-hidden", "true");
  image.style.position = "absolute";
  image.style.left = "0";
  image.style.top = "0";
  image.style.width = `${festival.mapImageWidth}px`;
  image.style.height = `${festival.mapImageHeight}px`;
  image.style.maxWidth = "none";
  image.style.transformOrigin = "0 0";
  image.style.pointerEvents = "none";
  image.style.userSelect = "none";
  image.style.zIndex = "1";

  const canvas = map.getCanvas();
  map.getCanvasContainer().insertBefore(image, canvas.nextSibling);
  return image;
}

function positionFestivalArtwork(
  map: MapLibreMap,
  image: HTMLImageElement,
  corners: readonly LngLatTuple[] | null,
  festival: FestivalMapConfig,
): void {
  if (!corners) {
    image.style.display = "block";
    image.style.left = "0";
    image.style.top = "0";
    image.style.width = "100%";
    image.style.height = "100%";
    image.style.objectFit = "contain";
    image.style.transform = "none";
    return;
  }

  const topLeft = map.project(corners[0]);
  const topRight = map.project(corners[1]);
  const bottomLeft = map.project(corners[3]);
  const a = (topRight.x - topLeft.x) / festival.mapImageWidth;
  const b = (topRight.y - topLeft.y) / festival.mapImageWidth;
  const c = (bottomLeft.x - topLeft.x) / festival.mapImageHeight;
  const d = (bottomLeft.y - topLeft.y) / festival.mapImageHeight;

  image.style.display = "block";
  image.style.left = "0";
  image.style.top = "0";
  image.style.width = `${festival.mapImageWidth}px`;
  image.style.height = `${festival.mapImageHeight}px`;
  image.style.objectFit = "fill";
  image.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${topLeft.x}, ${topLeft.y})`;
}

function launchFestivalSelector(): string {
  const query = new URLSearchParams(window.location.search);
  const explicit = query.get("festival")?.trim();
  if (explicit) return explicit;

  const initData = (window as TelegramWindow).Telegram?.WebApp?.initData ?? "";
  const startParam = initData
    ? new URLSearchParams(initData).get("start_param")
    : query.get("startapp");
  return parseFestivalStartParam(startParam).selector ?? DEFAULT_FESTIVAL_ID;
}

export default function FestivalGeoMap({ anchors, members, meet, tents, ownUserId, ownFix, showNames }: FestivalGeoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const artworkRef = useRef<HTMLImageElement | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const specialMarkersRef = useRef<MapLibreMarker[]>([]);
  const ownFallbackMarkerRef = useRef<MapLibreMarker | null>(null);
  const lastAutoFitKeyRef = useRef("");
  const [festival, setFestival] = useState<FestivalMapConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const selector = launchFestivalSelector();
    void fetch(`/api/festivals/resolve?selector=${encodeURIComponent(selector)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { festival?: FestivalMapConfig; error?: string };
        if (!response.ok || !payload.festival) throw new Error(payload.error || "Festival kon niet worden geladen.");
        if (!cancelled) {
          setFestival(payload.festival);
          setConfigError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setFestival(null);
          setConfigError(error instanceof Error ? error.message : "Festival kon niet worden geladen.");
        }
      });
    return () => { cancelled = true; };
  }, []);

  const corners = useMemo(
    () => festival ? festivalImageCorners(anchors, festival.mapImageWidth, festival.mapImageHeight) : null,
    [anchors, festival],
  );
  const cornerKey = corners ? corners.flat().map((value) => value.toFixed(8)).join(",") : "";
  const ownMember = useMemo(() => members.find((member) => member.userId === ownUserId), [members, ownUserId]);
  const mapConfigured = Boolean(festival?.mapImageUrl && festival && validVenueCenter(festival.venueCenter));

  useEffect(() => {
    const timer = window.setInterval(() => setPresenceNow(Date.now()), PRESENCE_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !festival || !mapConfigured) return;
    let cancelled = false;
    setMapReady(false);
    setMapFailed(false);
    lastAutoFitKeyRef.current = "";

    void import("maplibre-gl").then((maplibre) => {
      if (cancelled || !containerRef.current) return;
      maplibreRef.current = maplibre;

      const map = new maplibre.Map({
        container: containerRef.current,
        style: LOCAL_STYLE,
        center: [festival.venueCenter.longitude, festival.venueCenter.latitude],
        zoom: 15.8,
        minZoom: 13,
        maxZoom: 20,
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: false,
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current = map;
      map.once("load", () => {
        if (cancelled) return;
        artworkRef.current = prepareFestivalArtwork(map, festival);
        artworkRef.current.addEventListener("error", () => setMapFailed(true), { once: true });
        setMapReady(true);
      });
    }).catch(() => { if (!cancelled) setMapFailed(true); });

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      specialMarkersRef.current.forEach((marker) => marker.remove());
      ownFallbackMarkerRef.current?.remove();
      artworkRef.current?.remove();
      artworkRef.current = null;
      markersRef.current = [];
      specialMarkersRef.current = [];
      ownFallbackMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
      setMapReady(false);
    };
  }, [festival, mapConfigured]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    const artwork = artworkRef.current;
    if (!map || !maplibre || !artwork || !mapReady || !festival) return;

    const updateArtwork = () => positionFestivalArtwork(map, artwork, corners, festival);
    updateArtwork();
    map.on("move", updateArtwork);
    map.on("resize", updateArtwork);

    if (corners && cornerKey && cornerKey !== lastAutoFitKeyRef.current) {
      map.fitBounds(boundsForCorners(maplibre, corners), {
        padding: { top: 24, right: 24, bottom: 42, left: 24 },
        maxZoom: 18,
        duration: 0,
      });
      lastAutoFitKeyRef.current = cornerKey;
      updateArtwork();
    } else if (!corners) {
      lastAutoFitKeyRef.current = "";
    }

    return () => {
      map.off("move", updateArtwork);
      map.off("resize", updateArtwork);
    };
  }, [cornerKey, corners, festival, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre || !mapReady) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = members
      .filter(validPoint)
      .map((member) => new maplibre.Marker({
        element: createMarkerElement(member, member.userId === ownUserId, showNames, presenceNow),
        anchor: "center",
      }).setLngLat([member.longitude, member.latitude]).addTo(map));

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [mapReady, members, ownUserId, presenceNow, showNames]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre || !mapReady) return;

    specialMarkersRef.current.forEach((marker) => marker.remove());
    const next: MapLibreMarker[] = [];
    if (meet && validPoint(meet)) {
      const detail = `${meet.name} · ${meet.goingCount} onderweg · ${meet.arrivedCount} aangekomen · door ${meet.createdByName}`;
      next.push(new maplibre.Marker({
        element: createSpecialMarkerElement("meet", `Meet · ${meet.name}`, detail),
        anchor: "bottom",
      }).setLngLat([meet.longitude, meet.latitude]).addTo(map));
    }
    tents.filter(validPoint).forEach((tent) => {
      const who = tent.username ? `@${tent.username}` : tent.displayName;
      next.push(new maplibre.Marker({
        element: createSpecialMarkerElement("tent", `Tent · ${who}`, `Tentplek van ${who}`),
        anchor: "bottom",
      }).setLngLat([tent.longitude, tent.latitude]).addTo(map));
    });
    specialMarkersRef.current = next;

    return () => {
      specialMarkersRef.current.forEach((marker) => marker.remove());
      specialMarkersRef.current = [];
    };
  }, [mapReady, meet, tents]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre || !mapReady) return;
    ownFallbackMarkerRef.current?.remove();
    ownFallbackMarkerRef.current = null;

    const alreadyVisible = members.some((member) => member.userId === ownUserId);
    if (!ownFix || alreadyVisible) return;

    const root = document.createElement("div");
    root.className = `${styles.geoMarker} ${styles.geoMarkerLive} ${styles.geoMarkerMe} ${styles.geoMarkerGps}`;
    root.style.zIndex = "2";
    root.title = "Jij · live";
    root.setAttribute("aria-label", "Jij, live");

    const avatar = document.createElement("div");
    avatar.className = styles.geoAvatar;
    avatar.textContent = "●";
    root.appendChild(avatar);

    const presenceDot = document.createElement("span");
    presenceDot.className = `${styles.geoPresenceDot} ${styles.geoPresenceLive}`;
    presenceDot.setAttribute("aria-hidden", "true");
    root.appendChild(presenceDot);

    attachPresenceTooltip(root, showNames ? "live" : "Jij · live", true);

    if (showNames) {
      const label = document.createElement("span");
      label.className = `${styles.geoLabel} ${styles.geoLabelLive}`;
      label.textContent = "Jij";
      root.appendChild(label);
    }
    ownFallbackMarkerRef.current = new maplibre.Marker({ element: root, anchor: "center" })
      .setLngLat([ownFix.longitude, ownFix.latitude])
      .addTo(map);

    return () => {
      ownFallbackMarkerRef.current?.remove();
      ownFallbackMarkerRef.current = null;
    };
  }, [mapReady, members, ownFix, ownUserId, showNames]);

  const fitFestival = () => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre || !corners) return;
    map.fitBounds(boundsForCorners(maplibre, corners), {
      padding: { top: 24, right: 24, bottom: 42, left: 24 },
      maxZoom: 18,
      duration: 350,
    });
  };

  const focusSelf = () => {
    const point = validPoint(ownFix) ? ownFix : validPoint(ownMember) ? ownMember : null;
    const map = mapRef.current;
    if (!point || !map) return;
    map.easeTo({ center: [point.longitude, point.latitude], zoom: Math.max(map.getZoom(), 18), duration: 350 });
  };

  const focusMeet = () => {
    const map = mapRef.current;
    if (!map || !meet || !validPoint(meet)) return;
    map.easeTo({ center: [meet.longitude, meet.latitude], zoom: Math.max(map.getZoom(), 18.2), duration: 350 });
  };

  const fitPeople = () => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre) return;
    const points: [number, number][] = members.filter(validPoint).map((member) => [member.longitude, member.latitude]);
    if (validPoint(ownFix) && !members.some((member) => member.userId === ownUserId)) points.push([ownFix.longitude, ownFix.latitude]);
    if (!points.length) return;
    if (points.length === 1) {
      map.easeTo({ center: points[0], zoom: Math.max(map.getZoom(), 18), duration: 350 });
      return;
    }
    const bounds = points.slice(1).reduce((next, point) => next.extend(point), new maplibre.LngLatBounds(points[0], points[0]));
    map.fitBounds(bounds, { padding: 52, maxZoom: 18, duration: 350 });
  };

  const canFocusSelf = validPoint(ownFix) || validPoint(ownMember);
  const canFitPeople = members.some(validPoint) || validPoint(ownFix);
  const label = festival ? `${festival.name} festivalkaart` : "Festivalkaart";

  return (
    <div className={styles.geoMapWrap}>
      <div ref={containerRef} className={styles.geoMap} aria-label={label} />

      {mapReady && (
        <div className={mapUi.quickControls} aria-label="Kaartweergave">
          <button type="button" onClick={fitFestival} disabled={!corners} aria-label="Toon volledige festivalkaart" title="Toon volledige festivalkaart">🗺️</button>
          <button type="button" onClick={focusSelf} disabled={!canFocusSelf} aria-label="Centreer op mij" title="Centreer op mij">⌖</button>
          {meet && <button type="button" onClick={focusMeet} aria-label="Ga naar meeting point" title="Ga naar meeting point">📍</button>}
          <button type="button" onClick={fitPeople} disabled={!canFitPeople} aria-label="Toon iedereen" title="Toon iedereen">👥</button>
        </div>
      )}

      {configError && <div className={mapUi.fallbackLink}>{configError}</div>}
      {festival && !mapConfigured && !configError && (
        <div className={mapUi.fallbackLink}>De kaart voor {festival.name} is nog niet volledig ingesteld.</div>
      )}
      {mapFailed && <div className={mapUi.fallbackLink}>De festivalkaart kon niet starten.</div>}

      <div className={styles.mapLayerBadge}>
        <span className={styles.layerDot} />
        {!festival
          ? "Festival laden…"
          : !mapConfigured
            ? `${festival.name} · setup nodig`
            : corners
              ? `${festival.name} · GPS uitgelijnd · ${anchors.length} ankers`
              : `${festival.name} · kalibratie nodig`}
      </div>
    </div>
  );
}
