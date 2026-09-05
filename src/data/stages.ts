export const FESTIVAL_TIMEZONE = "Europe/Brussels" as const;

export const STAGES = {
  Supernova: {
    name: "Supernova",
    emoji: "🩷",
    genre: "Psytrance / Goatrance",
    color: "#d98fb8",
  },
  Nebula: {
    name: "Nebula",
    emoji: "🟣",
    genre: "Acid / Techno / Tekno",
    color: "#5c226c",
  },
  Zodiac: {
    name: "Zodiac",
    emoji: "🩵",
    genre: "Techno / House",
    color: "#26b9b8",
  },
  Galaxy: {
    name: "Galaxy",
    emoji: "🧡",
    genre: "Dub / Live / Eclectic",
    color: "#f36b12",
  },
} as const;

export type StageName = keyof typeof STAGES;
