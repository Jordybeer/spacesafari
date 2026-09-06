"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from "maplibre-gl";
import { fitSimilarity, projectWithFit } from "@/src/lib/map-similarity";
import type { GeoAnchor } from "@/src/lib/map-georef";
import { OFFLINE_MAP_BOUNDS, VENUE_CENTER as VENUE } from "@/src/lib/venue";
import styles from "./MapClientV2.module.css";
import mapUi from "./FestivalGeoMap.module.css";

const VENUE_CENTER: [number, number] = [VENUE.longitude, VENUE.latitude];
const OFFLINE_SOURCE = "hastiere-offline";
const OFFLINE_LAYER = "hastiere-offline-layer";
const LOCAL_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "offline-background", type: "background", paint: { "background-color": "#211120" } }],
};

const OFFLINE_CORNERS: [[number, number], [number, number], [number, number], [number, number]] = [
  [OFFLINE_MAP_BOUNDS.west, OFFLINE_MAP_BOUNDS.north],
  [OFFLINE_MAP_BOUNDS.east, OFFLINE_MAP_BOUNDS.north],
  [OFFLINE_MAP_BOUNDS.east, OFFLINE_MAP_BOUNDS.south],
  [OFFLINE_MAP_BOUNDS.west, OFFLINE_MAP_BOUNDS.south],
];

type MapView = "festival" | "area";

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

function createMarkerElement(member: GeoMember, isMe: boolean, showNames: boolean): HTMLDivElement {
  const root = document.createElement("div");
  root.className = `${styles.geoMarker} ${isMe ? styles.geoMarkerMe : ""}`;

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

  if (showNames) {
    const label = document.createElement("span");
    label.className = styles.geoLabel;
    label.textContent = isMe ? "Jij" : member.username ? `@${member.username}` : member.displayName;
    root.appendChild(label);
  }
  return root;
}

function validPoint(value: { latitude: number; longitude: number } | null | undefined): value is { latitude: number; longitude: number } {
  return Boolean(value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude));
}

function validMapPoint(member: GeoMember): member is GeoMember & { mapX: number; mapY: number } {
  return Number.isFinite(member.mapX) && Number.isFinite(member.mapY) &&
    (member.mapX as number) >= 0 && (member.mapX as number) <= 1 &&
    (member.mapY as number) >= 0 && (member.mapY as number) <= 1;
}

function markerLabel(member: GeoMember, ownUserId?: number): string {
  if (member.userId === ownUserId) return "Jij";
  return member.username ? `@${member.username}` : member.displayName;
}

export default function FestivalGeoMap({ anchors, members, ownUserId, ownFix, showNames }: FestivalGeoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const ownFallbackMarkerRef = useRef<MapLibreMarker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [view, setView] = useState<MapView>("festival");

  const calibrated = anchors.length >= 2;
  const activeView: MapView = calibrated ? view : "area";
  const ownMember = useMemo(() => members.find((member) => member.userId === ownUserId), [members, ownUserId]);
  const fit = useMemo(() => fitSimilarity(anchors), [anchors]);

  const festivalMembers = useMemo(() => {
    const visible = members.filter(validMapPoint);
    if (!ownFix || visible.some((member) => member.userId === ownUserId) || !fit) return visible;
    const projected = projectWithFit(ownFix.latitude, ownFix.longitude, fit);
    if (projected.mapX < 0 || projected.mapX > 1 || projected.mapY < 0 || projected.mapY > 1) return visible;
    return [...visible, {
      userId: ownUserId ?? -1,
      displayName: "Jij",
      updatedAt: new Date().toISOString(),
      latitude: ownFix.latitude,
      longitude: ownFix.longitude,
      mapX: projected.mapX,
      mapY: projected.mapY,
    }];
  }, [fit, members, ownFix, ownUserId]);

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
        maxBounds: [[OFFLINE_MAP_BOUNDS.west, OFFLINE_MAP_BOUNDS.south], [OFFLINE_MAP_BOUNDS.east, OFFLINE_MAP_BOUNDS.north]],
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: false,
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new maplibre.AttributionControl({ compact: true, customAttribution: "© OpenStreetMap contributors · MapMap" }), "bottom-left");
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
    if (!map || !mapReady || map.getSource(OFFLINE_SOURCE)) return;
    map.addSource(OFFLINE_SOURCE, { type: "image", url: "/hastiere-offline.webp?v=2", coordinates: OFFLINE_CORNERS });
    map.addLayer({ id: OFFLINE_LAYER, type: "raster", source: OFFLINE_SOURCE, paint: { "raster-opacity": 1, "raster-fade-duration": 0 } });
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre || !mapReady) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = members
      .filter(validPoint)
      .map((member) => new maplibre.Marker({
        element: createMarkerElement(member, member.userId === ownUserId, showNames),
        anchor: "center",
      }).setLngLat([member.longitude, member.latitude]).addTo(map));

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [mapReady, members, ownUserId, showNames]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre || !mapReady) return;
    ownFallbackMarkerRef.current?.remove();
    ownFallbackMarkerRef.current = null;

    const alreadyVisible = members.some((member) => member.userId === ownUserId);
    if (!ownFix || alreadyVisible) return;

    const root = document.createElement("div");
    root.className = `${styles.geoMarker} ${styles.geoMarkerMe} ${styles.geoMarkerGps}`;
    const avatar = document.createElement("div");
    avatar.className = styles.geoAvatar;
    avatar.textContent = "●";
    root.appendChild(avatar);
    if (showNames) {
      const label = document.createElement("span");
      label.className = styles.geoLabel;
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

  useEffect(() => {
    if (activeView === "area") requestAnimationFrame(() => mapRef.current?.resize());
  }, [activeView]);

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
      <div ref={containerRef} className={`${styles.geoMap} ${activeView === "area" ? mapUi.surfaceVisible : mapUi.surfaceHidden}`} aria-label="Interactieve offline kaart van Hastière" />

      {calibrated && (
        <div className={mapUi.viewTabs} aria-label="Kaartlaag">
          <button type="button" className={activeView === "festival" ? mapUi.activeView : ""} onClick={() => setView("festival")}>🎪 Festival</button>
          <button type="button" className={activeView === "area" ? mapUi.activeView : ""} onClick={() => setView("area")}>🗺 Omgeving</button>
        </div>
      )}

      {calibrated && (
        <svg
          className={`${mapUi.festivalSurface} ${activeView === "festival" ? mapUi.surfaceVisible : mapUi.surfaceHidden}`}
          viewBox="0 0 640 800"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Space Safari festivalkaart met live locaties"
        >
          <image href="/festival-map.jpg?v=4" x="0" y="0" width="640" height="800" preserveAspectRatio="xMidYMid meet" />
          {festivalMembers.map((member) => {
            const x = (member.mapX as number) * 640;
            const y = (member.mapY as number) * 800;
            const me = member.userId === ownUserId;
            const clipId = `festival-avatar-${String(member.userId).replace(/[^a-zA-Z0-9_-]/g, "")}`;
            const label = markerLabel(member, ownUserId);
            return (
              <g key={`${member.userId}-${member.updatedAt}`} transform={`translate(${x} ${y})`}>
                <circle r="24" className={me ? mapUi.meHalo : mapUi.memberHalo} />
                <circle r="19" className={mapUi.memberDisc} />
                {member.photoUrl ? (
                  <>
                    <defs><clipPath id={clipId}><circle r="16" /></clipPath></defs>
                    <image href={member.photoUrl} x="-16" y="-16" width="32" height="32" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
                  </>
                ) : (
                  <text className={mapUi.memberInitials} textAnchor="middle" dominantBaseline="central">{initials(member.displayName)}</text>
                )}
                {showNames && (
                  <g transform="translate(0 29)">
                    <rect x="-52" y="0" width="104" height="24" rx="12" className={mapUi.memberLabelBg} />
                    <text x="0" y="16" textAnchor="middle" className={mapUi.memberLabelText}>{label.length > 16 ? `${label.slice(0, 15)}…` : label}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {mapReady && activeView === "area" && (
        <div className={mapUi.quickControls} aria-label="Kaartweergave">
          <button type="button" onClick={focusSelf} disabled={!canFocusSelf} aria-label="Centreer op mij" title="Centreer op mij">⌖</button>
          <button type="button" onClick={fitPeople} disabled={!canFitPeople} aria-label="Toon iedereen" title="Toon iedereen">👥</button>
        </div>
      )}

      {mapFailed && activeView === "area" && (
        <button className={mapUi.fallbackLink} type="button" onClick={() => calibrated && setView("festival")}>{calibrated ? "Omgevingskaart kon niet starten · toon festivalkaart" : "Omgevingskaart kon niet starten"}</button>
      )}

      <div className={styles.mapLayerBadge}>
        <span className={styles.layerDot} />
        {activeView === "festival" ? `Festivalkaart lokaal · ${festivalMembers.length} zichtbaar` : "Offline Hastière"}
      </div>
    </div>
  );
}
