import { fitMapTransform, projectWithFit, type CalibrationAnchor } from "./map-similarity";

export type CalibrationQualityLevel = "insufficient" | "weak" | "usable" | "good";

export interface CalibrationQuality {
  level: CalibrationQualityLevel;
  score: number;
  anchorCount: number;
  spreadX: number;
  spreadY: number;
  worstCrossCheckError: number | null;
  outlierIndex: number | null;
  summary: string;
  nextAction: string;
}

export interface CalibrationCheck {
  mapError: number | null;
  level: "unavailable" | "good" | "check" | "poor";
  summary: string;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function mapDistance(a: { mapX: number; mapY: number }, b: { mapX: number; mapY: number }): number {
  return Math.hypot(a.mapX - b.mapX, a.mapY - b.mapY);
}

function spreadFor(anchors: CalibrationAnchor[]): { x: number; y: number } {
  if (!anchors.length) return { x: 0, y: 0 };
  const xs = anchors.map((anchor) => anchor.mapX);
  const ys = anchors.map((anchor) => anchor.mapY);
  return {
    x: Math.max(...xs) - Math.min(...xs),
    y: Math.max(...ys) - Math.min(...ys),
  };
}

function leaveOneOutErrors(anchors: CalibrationAnchor[]): number[] {
  if (anchors.length < 4) return [];
  return anchors.map((anchor, index) => {
    const fit = fitMapTransform(anchors.filter((_, candidateIndex) => candidateIndex !== index));
    if (!fit) return Number.POSITIVE_INFINITY;
    const predicted = projectWithFit(anchor.latitude, anchor.longitude, fit);
    return mapDistance(predicted, anchor);
  });
}

export function assessCalibrationQuality(anchors: CalibrationAnchor[]): CalibrationQuality {
  const anchorCount = anchors.length;
  const spread = spreadFor(anchors);
  const crossChecks = leaveOneOutErrors(anchors);
  const worstCrossCheckError = crossChecks.length ? Math.max(...crossChecks) : null;
  const outlierIndex = crossChecks.length && Number.isFinite(worstCrossCheckError)
    ? crossChecks.findIndex((error) => error === worstCrossCheckError && error > 0.07)
    : null;

  if (anchorCount < 2) {
    return {
      level: "insufficient",
      score: anchorCount ? 15 : 0,
      anchorCount,
      spreadX: spread.x,
      spreadY: spread.y,
      worstCrossCheckError,
      outlierIndex,
      summary: "Nog niet kalibreerbaar",
      nextAction: "Plaats minstens twee herkenbare punten ver uit elkaar.",
    };
  }

  const countScore = anchorCount >= 5 ? 1 : anchorCount === 4 ? 0.9 : anchorCount === 3 ? 0.72 : 0.45;
  const spreadScore = (clamp(spread.x / 0.55) + clamp(spread.y / 0.55)) / 2;
  const crossCheckScore = worstCrossCheckError === null
    ? (anchorCount >= 3 ? 0.6 : 0.35)
    : clamp(1 - worstCrossCheckError / 0.12);
  const score = Math.round(100 * (countScore * 0.35 + spreadScore * 0.35 + crossCheckScore * 0.3));

  if (outlierIndex !== null || (worstCrossCheckError !== null && worstCrossCheckError > 0.1)) {
    return {
      level: "weak",
      score: Math.min(score, 49),
      anchorCount,
      spreadX: spread.x,
      spreadY: spread.y,
      worstCrossCheckError,
      outlierIndex,
      summary: "Een kalibratiepunt wijkt sterk af",
      nextAction: "Controleer het gemarkeerde punt vóór publicatie.",
    };
  }

  if (anchorCount === 2 || spread.x < 0.28 || spread.y < 0.28) {
    return {
      level: "weak",
      score: Math.min(score, 59),
      anchorCount,
      spreadX: spread.x,
      spreadY: spread.y,
      worstCrossCheckError,
      outlierIndex,
      summary: "Bruikbaar als voorlopige kalibratie",
      nextAction: "Voeg een derde punt toe in een andere hoek van het terrein.",
    };
  }

  if (anchorCount >= 4 && spread.x >= 0.45 && spread.y >= 0.45 && (worstCrossCheckError === null || worstCrossCheckError <= 0.05)) {
    return {
      level: "good",
      score: Math.max(score, 80),
      anchorCount,
      spreadX: spread.x,
      spreadY: spread.y,
      worstCrossCheckError,
      outlierIndex,
      summary: "Sterke remote kalibratie",
      nextAction: "Doe op locatie nog één onafhankelijke controle vóór je de kaart vertrouwt.",
    };
  }

  return {
    level: "usable",
    score: Math.max(60, Math.min(score, 79)),
    anchorCount,
    spreadX: spread.x,
    spreadY: spread.y,
    worstCrossCheckError,
    outlierIndex,
    summary: "Kalibratie is bruikbaar",
    nextAction: "Verbreed de spreiding of bevestig de kaart op locatie.",
  };
}

export function checkCalibrationAtPoint(
  anchors: CalibrationAnchor[],
  check: CalibrationAnchor,
): CalibrationCheck {
  const fit = fitMapTransform(anchors);
  if (!fit) {
    return {
      mapError: null,
      level: "unavailable",
      summary: "Minstens twee bestaande ankers nodig voor een onafhankelijke controle.",
    };
  }

  const predicted = projectWithFit(check.latitude, check.longitude, fit);
  const mapError = mapDistance(predicted, check);
  if (mapError <= 0.035) {
    return { mapError, level: "good", summary: "Controle klopt goed met de huidige overlay." };
  }
  if (mapError <= 0.07) {
    return { mapError, level: "check", summary: "Controle is bruikbaar, maar niet strak. Check nog een punt." };
  }
  return { mapError, level: "poor", summary: "Controle wijkt te veel af. Herzie ankers vóór publicatie." };
}
