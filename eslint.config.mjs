import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    files: ["app/map/MapClientV3.tsx"],
    rules: {
      // The Mini App synchronizes Telegram's external runtime into React state and
      // refreshes presence on timers. These are intentional external-system effects.
      "react-hooks/set-state-in-effect": "warn",
      // Freshness/session state intentionally follows Telegram and network clocks.
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([".next/**", "coverage/**"]),
]);
