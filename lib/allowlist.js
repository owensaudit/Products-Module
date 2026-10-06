export function parseAllowlist(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function emailAllowed(email, allow) {
  return allow.has(String(email ?? "").trim().toLowerCase());
}
