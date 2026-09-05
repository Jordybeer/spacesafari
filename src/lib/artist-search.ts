import { performerSets, type FestivalSet } from "@/src/data/timetable";

export function normalizeArtist(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\[\](){}'’".,:/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

export interface ArtistMatch {
  exact: FestivalSet[];
  suggestions: FestivalSet[];
}

export function findArtistSets(query: string): ArtistMatch {
  const q = normalizeArtist(query);
  if (!q) return { exact: [], suggestions: [] };

  const unique = new Map<string, FestivalSet[]>();
  for (const set of performerSets) {
    const key = normalizeArtist(set.artist);
    const group = unique.get(key) ?? [];
    group.push(set);
    unique.set(key, group);
  }

  const exact = unique.get(q) ?? [];
  if (exact.length) return { exact, suggestions: [] };

  const scored = [...unique.entries()]
    .map(([key, sets]) => {
      const substring = key.includes(q) || q.includes(key);
      const d = distance(q, key);
      const threshold = Math.max(2, Math.floor(Math.max(q.length, key.length) * 0.18));
      return { sets, score: substring ? -10 : d, accepted: substring || d <= threshold };
    })
    .filter((item) => item.accepted)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .flatMap((item) => item.sets);

  return { exact: [], suggestions: scored };
}
