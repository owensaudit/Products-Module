import { emailAllowed, parseAllowlist } from "./allowlist.js";

const OPEN_WHEN_FROZEN = [
  /^\/api\/freeze$/,
  /^\/api\/comments(?:\/|$)/,
  /^\/api\/presidency$/,
  /^\/api\/import\/preview$/,
];

export function freezeLocked(pathname) {
  const path = String(pathname || "").split("?")[0];
  return !OPEN_WHEN_FROZEN.some((pattern) => pattern.test(path));
}

export function freezePowers(email, env = process.env) {
  const canEnable = emailAllowed(email, parseAllowlist(env?.FREEZE_ENABLE_EMAILS));
  const canDisable = emailAllowed(email, parseAllowlist(env?.FREEZE_DISABLE_EMAILS));
  return {
    canOpen: Boolean(String(email || "").trim()),
    canEnable,
    canDisable,
  };
}
