import { afterEach, describe, expect, it } from "vitest";
import { mapMiniAppUrl } from "../src/lib/telegram";

const ORIGINAL_USERNAME = process.env.TELEGRAM_BOT_USERNAME;
const ORIGINAL_SHORT_NAME = process.env.TELEGRAM_MINI_APP_SHORT_NAME;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("TELEGRAM_BOT_USERNAME", ORIGINAL_USERNAME);
  restore("TELEGRAM_MINI_APP_SHORT_NAME", ORIGINAL_SHORT_NAME);
});

describe("mapMiniAppUrl", () => {
  it("uses the Main Mini App deep link when only the bot username is configured", () => {
    process.env.TELEGRAM_BOT_USERNAME = "@spacesafari";
    delete process.env.TELEGRAM_MINI_APP_SHORT_NAME;

    expect(mapMiniAppUrl("room_abc")).toBe("https://t.me/spacesafari?startapp=room_abc");
  });

  it("uses the named direct Mini App when a short name is configured", () => {
    process.env.TELEGRAM_BOT_USERNAME = "spacesafari";
    process.env.TELEGRAM_MINI_APP_SHORT_NAME = "map";

    expect(mapMiniAppUrl("map admin")).toBe("https://t.me/spacesafari/map?startapp=map%20admin");
  });

  it("falls back to the browser map only when no Telegram bot username exists", () => {
    delete process.env.TELEGRAM_BOT_USERNAME;
    delete process.env.TELEGRAM_MINI_APP_SHORT_NAME;

    expect(mapMiniAppUrl("map")).toBe("https://spacesafari.jordy.beer/map?startapp=map");
  });
});
