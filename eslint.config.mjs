import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    files: ["app/map/MapClientV2.tsx"],
    rules: {
      // The Mini App synchronizes Telegram's external runtime into React state and
      // refreshes presence on timers. These are intentional external-system effects.
      "react-hooks/set-state-in-effect": "warn",
      // Freshness labels intentionally use wall-clock time while rendering cached
      // presence. Keep the rule visible as a warning rather than failing CI.
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([".next/**", "coverage/**"]),
]);
