import { parseDate } from "./fields.js";

const FIXED_HEADERS = ["Brother", "Apt Date", "NOTES", "Status", "Priesthood", "Age", "Birthday", "Phone Number", "Email"];

const STATUS_KEYS = [
  ["re-schedule, visited", "visited"],
  ["reschedule, visited", "visited"],
  ["re-schedule", "reschedule"],
  ["reschedule", "reschedule"],
  ["do not contact", "do_not_contact"],
  ["not interested", "not_interested"],
  ["no contact info", "no_contact_info"],
  ["no response", "no_response"],
  ["reach out", "reach_out"],
  ["scheduled", "scheduled"],
  ["visited", "visited"],
  ["declined", "declined"],
  ["moved", "moved"],
  ["mission", "mission"],
];

const CANONICAL_STATUS = {
  visited: "Visited",
  reschedule: "Re-Schedule",
  no_response: "No Response",
  reach_out: "Reach Out",
  scheduled: "Scheduled",
  declined: "Declined",
  moved: "Moved",
  mission: "Mission",
  do_not_contact: "Do Not Contact",
  not_interested: "Not Interested",
  no_contact_info: "No Contact Info",
};

export const ARCHIVE_STATUSES = [
  ["moved", "Moved"],
  ["mission", "Mission"],
  ["do_not_contact", "Do Not Contact"],
  ["not_interested", "Not Interested"],
  ["no_contact_info", "No Contact Info"],
  ["declined", "Declined"],
  ["visited", "Visited"],
];

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export function rosterStatusKey(status) {
  const raw = String(status ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw) return "none";
  const match = STATUS_KEYS.find(([label]) => raw === label || raw.startsWith(`${label} `));
  return match ? match[1] : raw.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "none";
}

export function isArchiveStatus(status) {
  const key = rosterStatusKey(status);
  return ARCHIVE_STATUSES.some(([archiveKey]) => archiveKey === key);
}

export function canonicalRosterStatus(status) {
  const key = rosterStatusKey(status);
  if (key === "none") return "";
  return CANONICAL_STATUS[key] || String(status ?? "").trim().replace(/\s+/g, " ");
}

const BIRTHDAY_MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function formatBirthday(value) {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const parts = birthdayParts(raw);
  if (!parts) return raw;
  return `${String(parts.month).padStart(2, "0")}/${String(parts.day).padStart(2, "0")}/${parts.year}`;
}

function birthdayParts(raw) {
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return validBirthday(Number(slash[1]), Number(slash[2]), Number(slash[3]));
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return validBirthday(Number(iso[2]), Number(iso[3]), Number(iso[1]));
  const named = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (named) return validBirthday(BIRTHDAY_MONTHS[named[2].toLowerCase()], Number(named[1]), Number(named[3]));
  const monthFirst = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthFirst) return validBirthday(BIRTHDAY_MONTHS[monthFirst[1].toLowerCase()], Number(monthFirst[2]), Number(monthFirst[3]));
  return null;
}

function validBirthday(month, day, year) {
  if (!month || month < 1 || month > 12 || day < 1 || day > 31 || year < 1000) return null;
  return { month, day, year };
}

export function rosterFields(columns) {
  const source = columns || {};
  const status = columnValue(source, "Status");
  return {
    sheetName: columnValue(source, "Brother"),
    rosterStatus: canonicalRosterStatus(status),
    rosterStatusKey: rosterStatusKey(status),
    priesthood: columnValue(source, "Priesthood"),
    age: columnValue(source, "Age"),
    birthday: formatBirthday(columnValue(source, "Birthday")),
    appointment: columnValue(source, "Apt Date"),
    reachOutDate: columnValue(source, "Reach Out Date"),
  };
}

export function friendlyBrotherName(sheetName) {
  const raw = String(sheetName ?? "").trim();
  const comma = raw.indexOf(",");
  if (comma === -1) return raw;
  const last = raw.slice(0, comma).trim();
  const first = raw.slice(comma + 1).trim();
  if (!first || !last) return raw;
  return `${first} ${last}`;
}

export function brotherSheetToState(text, deps) {
  const rows = parseBrotherSheet(text);
  const id = deps.id;
  const timestamp = deps.now();
  const people = [];
  const outreachAttempts = [];

  rows.forEach((row) => {
    const sheetName = row.brother;
    if (!sheetName) return;
    const personId = id("per");
    const phone = keepContact(row.phone);
    const email = keepContact(row.email);
    const contactNotes = [row.phone, row.email].map(leftoverContact).filter(Boolean);
    const notes = [row.notes, ...contactNotes].filter(Boolean).join(" ");
    const sheetColumns = {
      Brother: sheetName,
    };
    if (row.appointment) sheetColumns["Apt Date"] = row.appointment;
    if (row.status) sheetColumns.Status = canonicalRosterStatus(row.status);
    if (row.priesthood) sheetColumns.Priesthood = row.priesthood;
    if (row.age) sheetColumns.Age = row.age;
    if (row.birthday) sheetColumns.Birthday = formatBirthday(row.birthday);

    people.push({
      id: personId,
      displayName: friendlyBrotherName(sheetName),
      phone,
      email,
      household: "",
      notes,
      sheetColumns,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    for (const touch of row.touches) {
      const date = parseTouchDate(touch.day);
      if (!date) continue;
      outreachAttempts.push({
        id: id("out"),
        personId,
        channel: touchChannel(touch.type),
        date,
        status: "contacted",
        notes: touch.day && !/^\d{1,2}\/\d{1,2}$/.test(touch.day.trim()) ? touch.day.trim() : "",
        sheetColumns: {
          ...(touch.by ? { By: touch.by } : {}),
          ...(touch.type ? { Type: touch.type } : {}),
        },
        createdAt: timestamp,
      });
    }
  });

  return {
    people,
    outreachAttempts,
    visits: [],
    comments: [],
    importMeta: {
      fileName: "brothers",
      imported: people.length,
      skipped: [],
      importedAt: timestamp,
      kind: "brothers",
    },
  };
}

export function parseBrotherSheet(text) {
  const lines = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");
  if (!lines.length) return [];
  const start = looksLikeHeader(lines[0]) ? 1 : 0;
  return lines.slice(start).map(parseBrotherLine).filter((row) => row.brother);
}

function looksLikeHeader(line) {
  const first = line.split("\t")[0]?.trim().toLowerCase();
  return first === "brother" || first === "name";
}

function parseBrotherLine(line) {
  const cells = line.split("\t").map((cell) => cell.trim());
  while (cells.length < FIXED_HEADERS.length) cells.push("");
  const [brother, appointment, notes, status, priesthood, age, birthday, phone, email, ...rest] = cells;
  return {
    brother,
    appointment,
    notes,
    status,
    priesthood,
    age,
    birthday,
    phone,
    email,
    touches: parseTouches(rest),
  };
}

function parseTouches(cells) {
  const touches = [];
  let index = 0;
  while (index < cells.length) {
    const remaining = cells.length - index;
    if (remaining === 2 && !cells[index] && cells[index + 1]) {
      touches.push({ by: "", day: cells[index], type: cells[index + 1] });
      break;
    }
    if (remaining === 2 && looksLikeDay(cells[index])) {
      touches.push({ by: "", day: cells[index], type: cells[index + 1] || "" });
      break;
    }
    const by = cells[index] || "";
    const day = cells[index + 1] || "";
    const type = cells[index + 2] || "";
    if (by || day || type) touches.push({ by, day, type });
    index += 3;
    if (index >= cells.length) break;
  }
  return touches.filter((touch) => touch.day || touch.type || touch.by);
}

function looksLikeDay(value) {
  return /^\d{1,2}\/\d{1,2}$/.test(String(value ?? "").trim()) || /^[A-Za-z]{3,}\s+\d{4}$/.test(String(value ?? "").trim());
}

function parseTouchDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const numeric = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (numeric) return `2026-${pad(numeric[1])}-${pad(numeric[2])}`;
  const named = raw.match(/^([A-Za-z]{3,})\s+(\d{4})$/);
  if (named) {
    const month = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (!month) return null;
    return `${named[2]}-${pad(month)}-01`;
  }
  return parseDate(raw);
}

function touchChannel(type) {
  const raw = String(type ?? "").trim().toLowerCase();
  if (!raw) return "text";
  if (raw.includes("drive")) return "driveby";
  if (raw.includes("text") || raw.includes("sms")) return "text";
  if (raw.includes("phone") || raw.includes("call")) return "phone";
  if (raw.includes("email") || raw.includes("e-mail")) return "email";
  return "text";
}

function leftoverContact(value) {
  const raw = String(value ?? "").trim();
  if (!raw || keepContact(raw)) return "";
  if (/^(no phone|no email|no contact|none)$/i.test(raw)) return "";
  return raw;
}

function keepContact(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/no phone|no email|no contact|none/i.test(raw)) return "";
  if (!/\d/.test(raw) && !raw.includes("@")) return "";
  return raw;
}

function columnValue(columns, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(columns)) {
    if (key.toLowerCase() === wanted && String(value ?? "").trim()) return String(value).trim();
  }
  return "";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

const MARK_ORDER = ["scheduled", "reschedule", "reach_out"];

function sheetDay(value, year = 2026) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = parseDate(raw);
  if (iso) return iso;
  const numeric = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s|$)/);
  if (!numeric) return "";
  let parsedYear = year;
  if (numeric[3]) parsedYear = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
  const month = Number(numeric[1]);
  const day = Number(numeric[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${parsedYear}-${pad(month)}-${pad(day)}`;
}

export function calendarMarks({ people = [], outreachAttempts = [], visits = [] } = {}) {
  const marks = new Map();
  const add = (date, kind, personId) => {
    if (!date) return;
    if (!marks.has(date)) marks.set(date, { kinds: new Set(), people: [] });
    const mark = marks.get(date);
    mark.kinds.add(kind);
    if (personId && !mark.people.includes(personId)) mark.people.push(personId);
  };
  for (const person of people) {
    const key = person.rosterStatusKey || rosterStatusKey(person.rosterStatus || person.sheetColumns?.Status);
    if (key === "scheduled") add(sheetDay(person.appointment || person.sheetColumns?.["Apt Date"]), "scheduled", person.id);
    if (key === "reschedule") add(sheetDay(person.appointment || person.sheetColumns?.["Apt Date"]), "reschedule", person.id);
    if (key === "reach_out") add(sheetDay(person.reachOutDate || person.sheetColumns?.["Reach Out Date"]), "reach_out", person.id);
  }
  for (const visit of visits) {
    if (visit?.status !== "scheduled") continue;
    add(sheetDay(visit.date), "scheduled", visit.personId);
  }
  const peopleById = new Map(people.map((person) => [person.id, person]));
  for (const attempt of outreachAttempts) {
    const person = peopleById.get(attempt.personId);
    const key = person?.rosterStatusKey || rosterStatusKey(person?.rosterStatus || person?.sheetColumns?.Status);
    if (key !== "reach_out") continue;
    add(sheetDay(attempt.date), "reach_out", attempt.personId);
  }
  const result = {};
  for (const [date, mark] of marks) {
    result[date] = {
      kinds: MARK_ORDER.filter((kind) => mark.kinds.has(kind)),
      people: mark.people,
    };
  }
  return result;
}
