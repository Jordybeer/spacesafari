const DEFAULT_APP_URL = "https://spacesafari.jordy.beer";

// Normalize the canonical production origin once so legacy callers that still
// read process.env.APP_URL directly get the same safe fallback as requireEnv().
if (!process.env.APP_URL) process.env.APP_URL = DEFAULT_APP_URL;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (name === "APP_URL") return DEFAULT_APP_URL;
  throw new Error(`Missing required environment variable: ${name}`);
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || (name === "APP_URL" ? DEFAULT_APP_URL : undefined);
}
