import { DEFAULT_FESTIVAL_ID } from "./festivals";

const ROOM_TOKEN_PATTERN = "[A-Za-z0-9_-]{20,32}";
const FESTIVAL_SELECTOR_PATTERN = "[A-Za-z0-9_-]{4,16}";

export type ParsedFestivalStartParam = {
  selector: string | null;
  roomToken: string | null;
};

/**
 * Parse Telegram Mini App start parameters without importing server-only storage.
 * Legacy Space Safari links remain valid while Ginder can encode a compact festival
 * selector alongside the private room token.
 */
export function parseFestivalStartParam(value?: string | null): ParsedFestivalStartParam {
  if (!value) return { selector: null, roomToken: null };

  const roomOnly = value.match(new RegExp(`^room_(${ROOM_TOKEN_PATTERN})$`));
  if (roomOnly) return { selector: DEFAULT_FESTIVAL_ID, roomToken: roomOnly[1] };

  if (value === "map" || value === "map_admin") {
    return { selector: DEFAULT_FESTIVAL_ID, roomToken: null };
  }

  const festivalOnly = value.match(new RegExp(`^f_(${FESTIVAL_SELECTOR_PATTERN})$`));
  if (festivalOnly) return { selector: festivalOnly[1], roomToken: null };

  const festivalRoom = value.match(new RegExp(`^fr_(${FESTIVAL_SELECTOR_PATTERN})_(${ROOM_TOKEN_PATTERN})$`));
  if (festivalRoom) return { selector: festivalRoom[1], roomToken: festivalRoom[2] };

  return { selector: null, roomToken: null };
}
