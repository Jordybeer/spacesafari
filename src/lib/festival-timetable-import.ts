import { DateTime } from "luxon";
import type { FestivalScheduleEntry } from "./festival-schedule";

const DATE_FORMATS = [
  "yyyy-MM-dd",
  "dd/MM/yyyy",
  "d/M/yyyy",
  "dd-MM-yyyy",
  "d-M-yyyy",
  "dd/MM",
  "d/M",
  "dd-MM",
  "d-M",
];

const HEADER_ALIASES = {
  date: new Set(["date", "datum", "day", "dag"]),
  start: new Set(["start", "starts", "starttime", "begin", "van"]),
  end: new Set(["end", "ends", "endtime", "einde", "tot"]),
  stage: new Set(["stage", "podium", "area", "zaal"]),
  artist: new Set(["artist", "artiest", "name", "naam", "act"]),
  live: new Set(["live"]),
  note: new Set(["note", "notes", "opmerking", "opmerkingen"]),
} as const;

type ColumnName = keyof typeof HEADER_ALIASES;

type ParseOptions = {
  timezone: string;
  year: number;
};

function normalizedHeader(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function delimiterFor(lines: string[]): string {
  const candidates = ["\t", ";", "|", ","];
  let best = ";";
  let bestScore = 0;
  for (const delimiter of candidates) {
    const score = lines.slice(0, 5).reduce((total, line) => {
      const count = splitDelimitedLine(line, delimiter).length;
      return total + (count >= 5 ? count : 0);
    }, 0);
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

function headerMap(row: string[]): Partial<Record<ColumnName, number>> | null {
  const result: Partial<Record<ColumnName, number>> = {};
  row.forEach((cell, index) => {
    const normalized = normalizedHeader(cell);
    for (const [name, aliases] of Object.entries(HEADER_ALIASES) as Array<[ColumnName, Set<string>]>) {
      if (aliases.has(normalized)) result[name] = index;
    }
  });
  const recognized = Object.keys(result).length;
  return recognized >= 3 && result.start !== undefined && result.end !== undefined ? result : null;
}

function parseDate(value: string, options: ParseOptions): DateTime {
  const trimmed = value.trim();
  for (const format of DATE_FORMATS) {
    let parsed = DateTime.fromFormat(trimmed, format, { zone: options.timezone });
    if (!parsed.isValid) continue;
    if (!format.includes("yyyy")) parsed = parsed.set({ year: options.year });
    return parsed.startOf("day");
  }
  throw new Error(`Ongeldige datum: ${value}`);
}

function parseClock(value: string): { hour: number; minute: number } {
  const match = value.trim().match(/^(\d{1,2})[:.]([0-5]\d)$/);
  if (!match) throw new Error(`Ongeldige tijd: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23) throw new Error(`Ongeldige tijd: ${value}`);
  return { hour, minute };
}

function truthyLive(value: string | undefined): boolean {
  return ["1", "true", "yes", "ja", "live"].includes(value?.trim().toLocaleLowerCase() ?? "");
}

function slug(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "set";
}

function entryFromValues(
  values: { date: string; start: string; end: string; stage: string; artist: string; live?: string; note?: string },
  index: number,
  options: ParseOptions,
): FestivalScheduleEntry {
  if (!values.stage.trim()) throw new Error(`Rij ${index + 1}: podium ontbreekt.`);
  if (!values.artist.trim()) throw new Error(`Rij ${index + 1}: artiest ontbreekt.`);

  const date = parseDate(values.date, options);
  const startClock = parseClock(values.start);
  const endClock = parseClock(values.end);
  const starts = date.set(startClock);
  let ends = date.set(endClock);
  if (ends.toMillis() <= starts.toMillis()) ends = ends.plus({ days: 1 });

  return {
    id: `${starts.toFormat("yyyyLLdd-HHmm")}-${slug(values.stage)}-${slug(values.artist)}-${index + 1}`.slice(0, 120),
    artist: values.artist.trim(),
    stage: values.stage.trim(),
    startsAt: starts.toISO()!,
    endsAt: ends.toISO()!,
    kind: "set",
    live: truthyLive(values.live),
    note: values.note?.trim() || null,
  };
}

function compactLine(line: string, index: number, options: ParseOptions): FestivalScheduleEntry | null {
  const match = line.match(/^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?)\s+(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})\s*[|;]\s*([^|;]+)\s*[|;]\s*(.+)$/);
  if (!match) return null;
  return entryFromValues({
    date: match[1],
    start: match[2],
    end: match[3],
    stage: match[4],
    artist: match[5],
  }, index, options);
}

export function parseFestivalTimetableText(text: string, options: ParseOptions): FestivalScheduleEntry[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (!lines.length) throw new Error("De timetable is leeg.");
  if (lines.length > 500) throw new Error("Maximaal 500 timetable-rijen per festival.");

  const compact = lines.map((line, index) => compactLine(line, index, options));
  if (compact.every(Boolean)) return compact as FestivalScheduleEntry[];

  const delimiter = delimiterFor(lines);
  const rows = lines.map((line) => splitDelimitedLine(line, delimiter));
  const header = headerMap(rows[0]);
  const dataRows = header ? rows.slice(1) : rows;
  const columns: Record<"date" | "start" | "end" | "stage" | "artist", number> = {
    date: header?.date ?? 0,
    start: header?.start ?? 1,
    end: header?.end ?? 2,
    stage: header?.stage ?? 3,
    artist: header?.artist ?? 4,
  };
  if (Object.values(columns).some((index) => index === undefined)) {
    throw new Error("Gebruik kolommen: datum, start, einde, podium, artiest.");
  }

  const entries = dataRows.map((row, index) => {
    const value = (column: number | undefined) => column === undefined ? "" : (row[column] ?? "");
    return entryFromValues({
      date: value(columns.date),
      start: value(columns.start),
      end: value(columns.end),
      stage: value(columns.stage),
      artist: value(columns.artist),
      live: value(header?.live),
      note: value(header?.note),
    }, index, options);
  });

  if (!entries.length) throw new Error("Geen sets gevonden in de timetable.");
  return entries.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function summarizeFestivalTimetable(
  entries: FestivalScheduleEntry[],
  timezone: string,
  limit = 6,
): string {
  const lines = entries.slice(0, limit).map((entry) => {
    const start = DateTime.fromISO(entry.startsAt, { setZone: true }).setZone(timezone);
    const end = DateTime.fromISO(entry.endsAt, { setZone: true }).setZone(timezone);
    return `${start.toFormat("dd/LL HH:mm")}–${end.toFormat("HH:mm")} · ${entry.stage} · ${entry.artist}`;
  });
  if (entries.length > limit) lines.push(`+ ${entries.length - limit} meer`);
  return lines.join("\n");
}
