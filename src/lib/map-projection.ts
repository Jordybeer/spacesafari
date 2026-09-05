import type { MapAnchor, MapPresence, ProjectedPresence } from "./map-model";

const R = 6371000;

interface XY {
  x: number;
  y: number;
}

function worldPoint(latitude: number, longitude: number, lat0: number): XY {
  const lat = (latitude * Math.PI) / 180;
  const lon = (longitude * Math.PI) / 180;
  const ref = (lat0 * Math.PI) / 180;
  return {
    x: R * lon * Math.cos(ref),
    y: R * lat,
  };
}

function distanceSq(a: XY, b: XY): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function barycentric(p: XY, a: XY, b: XY, c: XY): [number, number, number] | null {
  const denom = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denom) < 0.000001) return null;
  const w1 = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / denom;
  const w2 = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / denom;
  return [w1, w2, 1 - w1 - w2];
}

function projectWithTwo(p: XY, a: XY, b: XY, ma: XY, mb: XY): XY | null {
  const wx = b.x - a.x;
  const wy = b.y - a.y;
  const mx = mb.x - ma.x;
  const my = mb.y - ma.y;
  const worldLen = Math.hypot(wx, wy);
  const mapLen = Math.hypot(mx, my);
  if (worldLen < 0.5 || mapLen < 0.00001) return null;

  const scale = mapLen / worldLen;
  const worldAngle = Math.atan2(wy, wx);
  const mapAngle = Math.atan2(my, mx);
  const angle = mapAngle - worldAngle;

  const px = p.x - a.x;
  const py = p.y - a.y;
  const rx = (px * Math.cos(angle) - py * Math.sin(angle)) * scale;
  const ry = (px * Math.sin(angle) + py * Math.cos(angle)) * scale;
  return { x: ma.x + rx, y: ma.y + ry };
}

export function projectLocation(
  latitude: number,
  longitude: number,
  anchors: MapAnchor[],
): { mapX: number; mapY: number } | null {
  if (anchors.length < 2) return null;
  const lat0 = anchors.reduce((sum, anchor) => sum + anchor.latitude, 0) / anchors.length;
  const p = worldPoint(latitude, longitude, lat0);
  const ranked = anchors
    .map((anchor) => ({
      anchor,
      world: worldPoint(anchor.latitude, anchor.longitude, lat0),
    }))
    .sort((a, b) => distanceSq(a.world, p) - distanceSq(b.world, p));

  if (ranked.length === 2) {
    const result = projectWithTwo(
      p,
      ranked[0].world,
      ranked[1].world,
      { x: ranked[0].anchor.mapX, y: ranked[0].anchor.mapY },
      { x: ranked[1].anchor.mapX, y: ranked[1].anchor.mapY },
    );
    return result ? { mapX: result.x, mapY: result.y } : null;
  }

  // Prefer the three nearest non-collinear calibration points.
  for (let j = 1; j < Math.min(ranked.length - 1, 8); j++) {
    for (let k = j + 1; k < Math.min(ranked.length, 9); k++) {
      const weights = barycentric(p, ranked[0].world, ranked[j].world, ranked[k].world);
      if (!weights) continue;
      const selected = [ranked[0].anchor, ranked[j].anchor, ranked[k].anchor];
      const mapX = weights.reduce((sum, weight, index) => sum + weight * selected[index].mapX, 0);
      const mapY = weights.reduce((sum, weight, index) => sum + weight * selected[index].mapY, 0);
      return { mapX, mapY };
    }
  }
  return null;
}

export function projectPresence(
  presence: MapPresence[],
  anchors: MapAnchor[],
): ProjectedPresence[] {
  return presence.map((member) => {
    const projected = projectLocation(member.latitude, member.longitude, anchors);
    return {
      ...member,
      mapX: projected?.mapX ?? null,
      mapY: projected?.mapY ?? null,
    };
  });
}
