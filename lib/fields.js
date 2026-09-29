const HEADER_ALIASES = {
  name: ["name", "full name", "member", "member name", "person", "brother"],
  phone: ["phone", "phone number", "mobile", "cell", "cell phone", "telephone"],
  email: ["email", "e-mail", "email address"],
  household: ["household", "family", "family name"],
  notes: ["notes", "note"],
  channel: ["channel", "contact method", "method", "via"],
  date: ["date", "contact date", "outreach date", "last contact"],
  status: ["status", "outreach status", "response"],
};

export function normalizeHeader(header) {
  return String(header ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function suggestMapping(headers) {
  const mapping = {
    name: null,
    phone: null,
    email: null,
    household: null,
    notes: null,
    channel: null,
    date: null,
    status: null,
  };
  const used = new Set();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const match = headers.find((header) => {
      if (used.has(header)) return false;
      return aliases.includes(normalizeHeader(header));
    });
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }
  return mapping;
}

export function isPrivateHeader(header) {
  const normalized = normalizeHeader(header);
  return /phone|mobile|cell|e-?mail|address/.test(normalized);
}

export function parseDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeChannel(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("text") || raw.includes("sms")) return "text";
  if (raw.includes("phone") || raw.includes("call")) return "phone";
  if (raw.includes("email") || raw.includes("e-mail")) return "email";
  return "";
}

export function normalizeStatus(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (["replied", "reply", "responded", "yes"].includes(raw)) return "replied";
  if (["no reply", "no_reply", "noreply", "waiting", "awaiting", "left message"].includes(raw)) {
    return "no_reply";
  }
  if (["declined", "no", "not interested"].includes(raw)) return "declined";
  if (["planned", "to contact"].includes(raw)) return "planned";
  if (["contacted", "called", "texted", "emailed", "reached out"].includes(raw)) return "contacted";
  return "";
}

export function columnCounts(headers, rows) {
  const counts = {};
  for (const header of headers) {
    counts[header] = rows.filter((row) => String(row[header] ?? "").trim() !== "").length;
  }
  return counts;
}
