"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageSource, Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from "maplibre-gl";
import { festivalImageCorners, type GeoAnchor, type LngLatTuple } from "@/src/lib/map-georef";
import { VENUE_CENTER as VENUE } from "@/src/lib/venue";
import styles from "./MapClientV2.module.css";
import mapUi from "./FestivalGeoMap.module.css";

const VENUE_CENTER: [number, number] = [VENUE.longitude, VENUE.latitude];
const FESTIVAL_SOURCE = "festival-overlay";
const FESTIVAL_LAYER = "festival-overlay-layer";
const FESTIVAL_IMAGE_URL = "/festival-terrain-overlay.webp?v=2";
const LIVE_LOCATION_MS = 75_000;
const PRESENCE_TICK_MS = 30_000;
const LOCAL_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "festival-background", type: "background", paint: { "background-color": "#211120" } }],
};

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
}

interface LocationFix {
  latitude: number;
  longitude: number;
  horizontalAccuracy: number | null;
}

interface FestivalGeoMapProps {
  anchors: GeoAnchor[];
  members: GeoMember[];
  ownUserId?: number;
  ownFix: LocationFix | null;
  showNames: boolean;
}

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
  const days = Math.floor(hours / 24);
  return `laatst gezien ${days} d geleden`;
}

function createMarkerElement(member: GeoMember, isMe: boolean, showNames: boolean, nowMs: number): HTMLDivElement {
  const elapsedMs = ageMs(member.updatedAt, nowMs);
  const live = elapsedMs <= LIVE_LOCATION_MS;
  const name = memberName(member, isMe);
  const statusText = live ? "live" : formatLastSeen(elapsedMs);

  const root = document.createElement("div");
  root.className = [
    styles.geoMarker,
    live ? styles.geoMarkerLive : styles.geoMarkerStale,
    isMe ? styles.geoMarkerMe : "",
  ].filter(Boolean).join(" ");
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

  if (showNames) {
    const label = document.createElement("span");
    label.className = `${styles.geoLabel} ${live ? styles.geoLabelLive : styles.geoLabelStale}`;
    label.textContent = name;
    root.appendChild(label);
  }
  return root;
}

function validPoint(value: { latitude: number; longitude: number } | null | undefined): value is { latitude: number; longitude: number } {
  return Boolean(value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude));
}

function boundsForCorners(maplibre: typeof import("maplibre-gl"), corners: readonly LngLatTuple[]) {
  const bounds = new maplibre.LngLatBounds(corners[0], corners[0]);
  corners.slice(1).forEach((corner) => bounds.extend(corner));
  return bounds;
}

export default function FestivalGeoMap({ anchors, members, ownUserId, ownFix, showNames }: FestivalGeoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const ownFallbackMarkerRef = useRef<MapLibreMarker | null>(null);
  const lastAutoFitKeyRef = useRef("");
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());

  const corners = useMemo(() => festivalImageCorners(anchors), [anchors]);
  const cornerKey = corners ? corners.flat().map((value) => value.toFixed(8)).join(",") : "";
  const ownMember = useMemo(() => members.find((member) => member.userId === ownUserId), [members, ownUserId]);

  useEffect(() => {
    const timer = window.setInterval(() => setPresenceNow(Date.now()), PRESENCE_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    void import("maplibre-gl").then((maplibre) => {
      if (cancelled || !containerRef.current) return;
      maplibreRef.current = maplibre;

      const map = new maplibre.Map({
        container: containerRef.current,
        style: LOCAL_STYLE,
        center: VENUE_CENTER,
        zoom: 15.8,
        minZoom: 13,
        maxZoom: 20,
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: false,
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current = map;
      map.once("load", () => { if (!cancelled) setMapReady(true); });
    }).catch(() => { if (!cancelled) setMapFailed(true); });

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      ownFallbackMarkerRef.current?.remove();
      markersRef.current = [];
      ownFallbackMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre || !mapReady) return;

    if (!corners) {
      if (map.getLayer(FESTIVAL_LAYER)) map.removeLayer(FESTIVAL_LAYER);
      if (map.getSource(FESTIVAL_SOURCE)) map.removeSource(FESTIVAL_SOURCE);
      lastAutoFitKeyRef.current = "";
      return;
    }

    const existing = map.getSource(FESTIVAL_SOURCE) as ImageSource | undefined;
    if (existing) {
      existing.setCoordinates(corners);
    } else {
      map.addSource(FESTIVAL_SOURCE, {
        type: "image",
        url: FESTIVAL_IMAGE_URL,
        coordinates: corners,
      });
      map.addLayer({
        id: FESTIVAL_LAYER,
        type: "raster",
        source: FESTIVAL_SOURCE,
        paint: {
          "raster-opacity": 1,
          "raster-fade-duration": 0,
        },
      });
    }

    if (cornerKey && cornerKey !== lastAutoFitKeyRef.current) {
      map.fitBounds(boundsForCorners(maplibre, corners), {
        padding: { top: 24, right: 24, bottom: 42, left: 24 },
        maxZoom: 18,
        duration: 0,
      });
      lastAutoFitKeyRef.current = cornerKey;
    }
  }, [cornerKey, corners, mapReady]);

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
    ownFallbackMarkerRef.current?.remove();
    ownFallbackMarkerRef.current = null;

    const alreadyVisible = members.some((member) => member.userId === ownUserId);
    if (!ownFix || alreadyVisible) return;

    const root = document.createElement("div");
    root.className = `${styles.geoMarker} ${styles.geoMarkerLive} ${styles.geoMarkerMe} ${styles.geoMarkerGps}`;
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

  return (
    <div className={styles.geoMapWrap}>
      <div ref={containerRef} className={styles.geoMap} aria-label="GPS-uitgelijnde Space Safari festivalkaart" />

      {!corners && <div className={mapUi.staticFestivalFallback} aria-hidden="true" />}

      {mapReady && (
        <div className={mapUi.quickControls} aria-label="Kaartweergave">
          <button type="button" onClick={fitFestival} disabled={!corners} aria-label="Toon volledige festivalkaart" title="Toon volledige festivalkaart">🗺️</button>
          <button type="button" onClick={focusSelf} disabled={!canFocusSelf} aria-label="Centreer op mij" title="Centreer op mij">⌖</button>
          <button type="button" onClick={fitPeople} disabled={!canFitPeople} aria-label="Toon iedereen" title="Toon iedereen">👥</button>
        </div>
      )}

      {mapFailed && (
        <div className={mapUi.fallbackLink}>De live kaart kon niet starten.</div>
      )}

      <div className={styles.mapLayerBadge}>
        <span className={styles.layerDot} />
        {corners ? `Festivalkaart · GPS uitgelijnd · ${anchors.length} ankers` : "Festivalkaart · kalibratie nodig"}
      </div>
    </div>
  );
}
