"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageSource, Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { festivalImageCorners, type GeoAnchor } from "@/src/lib/map-georef";
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

export default function FestivalGeoMap({ anchors, members, ownUserId, ownFix, showNames }: FestivalGeoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const ownFallbackMarkerRef = useRef<MapLibreMarker | null>(null);
  const fittedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

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
      map.once("load", () => {
        if (!cancelled) setMapReady(true);
      });
    }).catch(() => {
      if (!cancelled) setMapFailed(true);
    });

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
    if (!map || !mapReady || !corners) return;

    const existing = map.getSource(OVERLAY_SOURCE);
    if (existing) {
      (existing as ImageSource).setCoordinates(corners);
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
  }, [corners, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    if (!map || !maplibre || !mapReady) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = members
      .filter((member) => Number.isFinite(member.latitude) && Number.isFinite(member.longitude))
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

  return (
    <div className={styles.geoMapWrap}>
      <div ref={containerRef} className={styles.geoMap} aria-label="Interactieve Space Safari kaart" />
      {mapFailed && (
        <a className={styles.mapFallbackLink} href="/festival-map.jpg?v=3">Kaartlaag kon niet laden · open festivalkaart</a>
      )}
      <div className={styles.mapLayerBadge}>
        <span className={styles.layerDot} />
        {corners ? "Festival + kaart" : "Live kaart · overlay na 2 ankers"}
      </div>
    </div>
  );
}
