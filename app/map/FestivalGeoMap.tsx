"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { festivalImageCorners, mapPointToLngLat, type GeoAnchor } from "@/src/lib/map-georef";
import styles from "./MapClientV2.module.css";

const VENUE_CENTER: [number, number] = [4.85465, 50.15575];
const BASE_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const OVERLAY_SOURCE = "festival-terrain";
const OVERLAY_LAYER = "festival-terrain-layer";

export interface GeoMember {
  userId: number;
  displayName: string;
  username?: string;
  photoUrl?: string;
  updatedAt: string;
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

export default function FestivalGeoMap({ anchors, members, ownUserId, ownFix, showNames }: FestivalGeoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const ownFallbackMarkerRef = useRef<MapLibreMarker | null>(null);
  const fittedRef = useRef(false);

  const corners = useMemo(() => festivalImageCorners(anchors), [anchors]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    void import("maplibre-gl").then((maplibre) => {
      if (cancelled || !containerRef.current) return;
      maplibreRef.current = maplibre;
      const map = new maplibre.Map({
        container: containerRef.current,
        style: BASE_STYLE,
        center: VENUE_CENTER,
        zoom: 15.5,
        minZoom: 13,
        maxZoom: 20,
        maxBounds: [[4.82, 50.135], [4.90, 50.18]],
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current = map;
    }).catch(() => undefined);

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
    if (!map || !corners) return;

    const applyOverlay = () => {
      const existing = map.getSource(OVERLAY_SOURCE);
      if (existing && "setCoordinates" in existing) {
        (existing as { setCoordinates: (coordinates: typeof corners) => void }).setCoordinates(corners);
      } else {
        map.addSource(OVERLAY_SOURCE, {
          type: "image",
          url: "/festival-terrain-overlay.webp?v=1",
          coordinates: corners,
        });
        map.addLayer({
          id: OVERLAY_LAYER,
          type: "raster",
          source: OVERLAY_SOURCE,
          paint: { "raster-opacity": 0.9, "raster-fade-duration": 0 },
        });
      }

      if (!fittedRef.current) {
        const maplibre = maplibreRef.current;
        if (!maplibre) return;
        const bounds = corners.reduce(
          (next, point) => next.extend(point),
          new maplibre.LngLatBounds(corners[0], corners[0]),
        );
        map.fitBounds(bounds, { padding: 34, duration: 0, maxZoom: 17.2 });
        fittedRef.current = true;
      }
    };

    if (map.loaded()) applyOverlay();
    else map.once("load", applyOverlay);
  }, [corners]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre) return;

    const renderMarkers = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      for (const member of members) {
        if (member.mapX === null || member.mapY === null) continue;
        const lngLat = mapPointToLngLat(member.mapX, member.mapY, anchors);
        if (!lngLat) continue;
        const marker = new maplibre.Marker({
          element: createMarkerElement(member, member.userId === ownUserId, showNames),
          anchor: "center",
        }).setLngLat(lngLat).addTo(map);
        markersRef.current.push(marker);
      }
    };

    if (map.loaded()) renderMarkers();
    else map.once("load", renderMarkers);
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [anchors, members, ownUserId, showNames]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre) return;
    ownFallbackMarkerRef.current?.remove();
    ownFallbackMarkerRef.current = null;

    const alreadyProjected = members.some(
      (member) => member.userId === ownUserId && member.mapX !== null && member.mapY !== null,
    );
    if (!ownFix || alreadyProjected) return;

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
  }, [members, ownFix, ownUserId, showNames]);

  return (
    <div className={styles.geoMapWrap}>
      <div ref={containerRef} className={styles.geoMap} aria-label="Interactieve Space Safari kaart" />
      <div className={styles.mapLayerBadge}>
        <span className={styles.layerDot} />
        {corners ? "Festival + kaart" : "Kaart · kalibratie nodig"}
      </div>
    </div>
  );
}
