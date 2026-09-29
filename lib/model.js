import { randomUUID } from "node:crypto";
import { columnCounts, columnSaysNotContacted, isPrivateHeader, normalizeChannel, normalizeStatus, parseDate, suggestMapping } from "./fields.js";

export const CALENDAR_NAME = "Elders Quorum Calendar";

export const PRESIDENCY = [
  { name: "Mark Lillenberg", role: "EQ President" },
  { name: "Tyler Sanders", role: "EQ Counselor" },
  { name: "Brad Conger", role: "EQ Counselor" },
  { name: "Josh Owens", role: "EQ Assistant Secretary" },
  { name: "Harrison Bardo", role: "EQ Secretary" },
];

export const CHANNELS = ["text", "phone", "email"];

export const OUTREACH_STATUSES = ["planned", "contacted", "no_reply", "replied", "declined"];

export const WEDNESDAY_SLOTS = [
  { key: "wed-1900", label: "7:00 pm" },
  { key: "wed-1915", label: "7:15 pm" },
  { key: "wed-1930", label: "7:30 pm" },
  { key: "wed-1945", label: "7:45 pm" },
];

export const SUNDAY_SLOTS = [
  { key: "sun-before", label: "Before church", detail: "Before sacrament meeting starts at 10:30 am" },
  { key: "sun-after", label: "After church", detail: "After sacrament meeting concludes at 12:30 pm" },
];

export const SACRAMENT = {
  starts: "10:30 am",
  concludes: "12:30 pm",
};

export class PortalError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function emptyState() {
  return {
    people: [],
    outreachAttempts: [],
    visits: [],
    comments: [],
    importMeta: null,
  };
}

export function createId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function stamp(deps) {
  return {
    id: deps.id ?? createId,
    now: deps.now ?? (() => new Date().toISOString()),
  };
}

function requirePerson(state, personId) {
  const person = state.people.find((item) => item.id === personId);
  if (!person) throw new PortalError("Person not found", 404);
  return person;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function slotsForMonth(month, visits = []) {
  const match = /^(\d{4})-(\d{2})$/.exec(month || "");
  if (!match) throw new PortalError("Month must look like YYYY-MM");
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new PortalError("Month must look like YYYY-MM");

  const slots = [];
  const total = daysInMonth(year, monthNumber);
  for (let day = 1; day <= total; day += 1) {
    const date = new Date(Date.UTC(year, monthNumber - 1, day));
    const weekday = date.getUTCDay();
    const iso = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const definitions = weekday === 3 ? WEDNESDAY_SLOTS : weekday === 0 ? SUNDAY_SLOTS : [];
    const dayType = weekday === 3 ? "wednesday" : weekday === 0 ? "sunday" : null;
    for (const definition of definitions) {
      const visit = visits.find(
        (item) =>
          item.date === iso &&
          item.slotKey === definition.key &&
          (item.status === "scheduled" || item.status === "completed"),
      );
      slots.push({
        id: `${iso}:${definition.key}`,
        date: iso,
        dayType,
        slotKey: definition.key,
        label: definition.label,
        detail: definition.detail || null,
        status: visit ? visit.status : "open",
        visitId: visit ? visit.id : null,
        personId: visit ? visit.personId : null,
      });
    }
  }
  return slots;
}

function attemptCountsAsContact(attempt, person) {
  if (!person) return true;
  const sheetSaysNo = columnSaysNotContacted(person.sheetColumns) || columnSaysNotContacted(attempt.sheetColumns);
  if (!sheetSaysNo) return true;
  if (person.createdAt && attempt.createdAt && attempt.createdAt !== person.createdAt) return true;
  return attempt.status !== "contacted" && attempt.status !== "planned";
}

export function personOutreachStatus(personId, attempts, visits, person = null) {
  if (visits.some((visit) => visit.personId === personId && visit.status === "scheduled")) {
    return "scheduled";
  }
  const mine = attempts
    .filter((attempt) => attempt.personId === personId && attemptCountsAsContact(attempt, person))
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const latest = mine[0];
  const completedVisit = visits
    .filter((visit) => visit.personId === personId && visit.status === "completed")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (!latest) return completedVisit ? "completed" : "not_contacted";
  if (latest.status === "declined") return "declined";
  if (latest.status === "replied") {
    if (completedVisit && String(completedVisit.createdAt) >= String(latest.createdAt)) return "completed";
    return "replied";
  }
  if (latest.status === "planned") return "not_contacted";
  return "awaiting_reply";
}

function visibleColumns(columns, includePrivate) {
  const source = columns || {};
  if (includePrivate) return source;
  const visible = {};
  for (const [key, value] of Object.entries(source)) {
    if (!isPrivateHeader(key)) visible[key] = value;
  }
  return visible;
}

function privateColumnNames(columns) {
  return Object.keys(columns || {}).filter((key) => isPrivateHeader(key) && String(columns[key] ?? "").trim() !== "");
}

export function presentState(state, month, options = {}) {
  const includePrivate = options.includePrivate === true;
  const slots = slotsForMonth(month, state.visits);
  const people = state.people.map((person) => {
    const attempts = state.outreachAttempts
      .filter((attempt) => attempt.personId === person.id)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    const visits = state.visits.filter((visit) => visit.personId === person.id);
    return {
      ...person,
      phone: includePrivate ? person.phone : "",
      email: includePrivate ? person.email : "",
      phoneOnFile: Boolean(person.phone),
      emailOnFile: Boolean(person.email),
      sheetColumns: visibleColumns(person.sheetColumns, includePrivate),
      privateColumns: privateColumnNames(person.sheetColumns),
      outreachStatus: personOutreachStatus(person.id, state.outreachAttempts, state.visits, person),
      attemptCount: attempts.length,
      latestAttempt: attempts[0]
        ? { ...attempts[0], sheetColumns: visibleColumns(attempts[0].sheetColumns, includePrivate) }
        : null,
      visits,
      commentCount: state.comments.filter((comment) => comment.targetType === "person" && comment.targetId === person.id).length,
    };
  });

  return {
    people,
    outreachAttempts: state.outreachAttempts.map((attempt) => ({
      ...attempt,
      sheetColumns: visibleColumns(attempt.sheetColumns, includePrivate),
    })),
    visits: state.visits,
    comments: state.comments,
    importMeta: state.importMeta,
    month,
    slots,
    presidency: PRESIDENCY,
    calendarName: CALENDAR_NAME,
    sacrament: SACRAMENT,
    privateVisible: includePrivate,
  };
}

export function addPerson(state, input, deps = {}) {
  const { id, now } = stamp(deps);
  const displayName = String(input.displayName ?? "").trim();
  if (!displayName) throw new PortalError("A name is required");
  const timestamp = now();
  const person = {
    id: id("per"),
    displayName,
    phone: String(input.phone ?? "").trim(),
    email: String(input.email ?? "").trim(),
    household: String(input.household ?? "").trim(),
    notes: String(input.notes ?? "").trim(),
    sheetColumns: input.sheetColumns && typeof input.sheetColumns === "object" ? input.sheetColumns : {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { ...state, people: [...state.people, person] };
}

export function logOutreach(state, input, deps = {}) {
  const { id, now } = stamp(deps);
  requirePerson(state, input.personId);
  const channel = normalizeChannel(input.channel);
  if (!CHANNELS.includes(channel)) throw new PortalError("Channel must be text, phone, or email");
  const status = normalizeStatus(input.status) || input.status;
  if (!OUTREACH_STATUSES.includes(status)) throw new PortalError("Outreach status is not recognized");
  const date = parseDate(input.date);
  if (!date) throw new PortalError("Outreach date must be YYYY-MM-DD or M/D/YYYY");
  const attempt = {
    id: id("out"),
    personId: input.personId,
    channel,
    date,
    status,
    notes: String(input.notes ?? "").trim(),
    sheetColumns: {},
    createdAt: now(),
  };
  return { ...state, outreachAttempts: [...state.outreachAttempts, attempt] };
}

export function scheduleVisit(state, input, deps = {}) {
  const { id, now } = stamp(deps);
  const person = requirePerson(state, input.personId);
  const replyChannel = normalizeChannel(input.replyChannel);
  if (!CHANNELS.includes(replyChannel)) {
    throw new PortalError("Reply channel must be text, phone, or email");
  }
  const date = parseDate(input.date);
  if (!date) throw new PortalError("Visit date must be YYYY-MM-DD or M/D/YYYY");
  const month = date.slice(0, 7);
  const slot = slotsForMonth(month, state.visits).find((item) => item.date === date && item.slotKey === input.slotKey);
  if (!slot) throw new PortalError("Choose a Wednesday 7:00–7:45 pm slot or a Sunday before/after church slot");
  if (slot.status !== "open") throw new PortalError("That slot is already taken");

  const replyDate = parseDate(input.replyDate) || date;
  const timestamp = now();
  const attempt = {
    id: id("out"),
    personId: person.id,
    channel: replyChannel,
    date: replyDate,
    status: "replied",
    notes: String(input.notes ?? "").trim(),
    sheetColumns: {},
    createdAt: timestamp,
  };
  const visit = {
    id: id("vis"),
    personId: person.id,
    date,
    slotKey: slot.slotKey,
    slotLabel: slot.label,
    dayType: slot.dayType,
    replyChannel,
    status: "scheduled",
    notes: String(input.notes ?? "").trim(),
    calendar: {
      name: CALENDAR_NAME,
      intendedFor: PRESIDENCY.map((member) => ({ name: member.name, role: member.role })),
      recordedAt: timestamp,
      externalEventId: null,
    },
    createdAt: timestamp,
  };
  return {
    ...state,
    outreachAttempts: [...state.outreachAttempts, attempt],
    visits: [...state.visits, visit],
  };
}

export function setVisitStatus(state, visitId, status) {
  if (status !== "completed" && status !== "cancelled") {
    throw new PortalError("Visit can be marked completed or cancelled");
  }
  const visit = state.visits.find((item) => item.id === visitId);
  if (!visit) throw new PortalError("Visit not found", 404);
  if (visit.status === "cancelled") throw new PortalError("That visit is already cancelled");
  return {
    ...state,
    visits: state.visits.map((item) => (item.id === visitId ? { ...item, status } : item)),
  };
}

export function addComment(state, input, deps = {}) {
  const { id, now } = stamp(deps);
  const targetType = input.targetType;
  if (targetType !== "person" && targetType !== "visit") {
    throw new PortalError("Comment on a person or a visit");
  }
  if (targetType === "person") requirePerson(state, input.targetId);
  if (targetType === "visit" && !state.visits.some((visit) => visit.id === input.targetId)) {
    throw new PortalError("Visit not found", 404);
  }
  const authorName = String(input.authorName ?? "").trim();
  const body = String(input.body ?? "").trim();
  if (!authorName) throw new PortalError("Add your name so others know who commented");
  if (!body) throw new PortalError("Comment is empty");
  const comment = {
    id: id("cmt"),
    targetType,
    targetId: input.targetId,
    authorName,
    body,
    createdAt: now(),
  };
  return { ...state, comments: [...state.comments, comment] };
}

function sheetColumns(headers, row, mapping) {
  const columns = {};
  for (const header of headers) {
    const value = String(row[header] ?? "").trim();
    if (!value) continue;
    columns[header] = value;
  }
  return columns;
}

function mappedValue(row, mapping, field) {
  const header = mapping?.[field];
  if (!header) return "";
  return String(row[header] ?? "").trim();
}

export function previewImport(csvResult) {
  const { headers, rows } = csvResult;
  return {
    headers,
    rowCount: rows.length,
    suggestedMapping: suggestMapping(headers),
    privateHeaders: headers.filter((header) => isPrivateHeader(header)),
    nonEmptyCounts: columnCounts(headers, rows),
  };
}

export function importRows(state, { fileName, headers, rows, mapping, kind, defaultChannel }, deps = {}) {
  const { id, now } = stamp(deps);
  const resolvedMapping = { ...suggestMapping(headers), ...(mapping || {}) };
  if (!resolvedMapping.name) throw new PortalError("Choose which column is the person's name");
  const timestamp = now();
  let imported = 0;
  const skipped = [];

  if (kind === "outreach") {
    const attempts = [];
    const people = [...state.people];
    rows.forEach((row, index) => {
      const displayName = mappedValue(row, resolvedMapping, "name");
      if (!displayName) {
        skipped.push({ row: index + 2, reason: "missing name" });
        return;
      }
      const status = normalizeStatus(mappedValue(row, resolvedMapping, "status"));
      const channel = normalizeChannel(mappedValue(row, resolvedMapping, "channel")) || normalizeChannel(defaultChannel);
      const date = parseDate(mappedValue(row, resolvedMapping, "date"));
      if (status !== "not_contacted") {
        if (!CHANNELS.includes(channel)) {
          skipped.push({ row: index + 2, reason: "missing channel" });
          return;
        }
        if (!date) {
          skipped.push({ row: index + 2, reason: "unparsed date" });
          return;
        }
      }
      let person = people.find((item) => item.displayName.toLowerCase() === displayName.toLowerCase());
      if (!person) {
        person = {
          id: id("per"),
          displayName,
          phone: "",
          email: "",
          household: "",
          notes: "",
          sheetColumns: sheetColumns(headers, row, resolvedMapping),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        people.push(person);
      }
      if (status !== "not_contacted") {
        attempts.push({
          id: id("out"),
          personId: person.id,
          channel,
          date,
          status: status || "contacted",
          notes: mappedValue(row, resolvedMapping, "notes"),
          sheetColumns: sheetColumns(headers, row, resolvedMapping),
          createdAt: timestamp,
        });
      }
      imported += 1;
    });
    return {
      state: {
        ...state,
        people,
        outreachAttempts: [...state.outreachAttempts, ...attempts],
        importMeta: importMeta({ fileName, headers, rows, mapping: resolvedMapping, kind, imported, skipped, timestamp }),
      },
      imported,
      skipped,
    };
  }

  if (kind !== "people") throw new PortalError("Import rows as people or outreach attempts");

  const people = [];
  const attempts = [];
  rows.forEach((row, index) => {
    const displayName = mappedValue(row, resolvedMapping, "name");
    if (!displayName) {
      skipped.push({ row: index + 2, reason: "missing name" });
      return;
    }
    const person = {
      id: id("per"),
      displayName,
      phone: mappedValue(row, resolvedMapping, "phone"),
      email: mappedValue(row, resolvedMapping, "email"),
      household: mappedValue(row, resolvedMapping, "household"),
      notes: mappedValue(row, resolvedMapping, "notes"),
      sheetColumns: sheetColumns(headers, row, resolvedMapping),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    people.push(person);
    imported += 1;

    const status = normalizeStatus(mappedValue(row, resolvedMapping, "status"));
    const channel = normalizeChannel(mappedValue(row, resolvedMapping, "channel")) || normalizeChannel(defaultChannel);
    const date = parseDate(mappedValue(row, resolvedMapping, "date"));
    if (channel && date && status && status !== "not_contacted") {
      attempts.push({
        id: id("out"),
        personId: person.id,
        channel,
        date,
        status,
        notes: mappedValue(row, resolvedMapping, "notes"),
        sheetColumns: person.sheetColumns,
        createdAt: timestamp,
      });
    }
  });

  return {
    state: {
      ...state,
      people: [...state.people, ...people],
      outreachAttempts: [...state.outreachAttempts, ...attempts],
      importMeta: importMeta({ fileName, headers, rows, mapping: resolvedMapping, kind, imported, skipped, timestamp }),
    },
    imported,
    skipped,
  };
}

function importMeta({ fileName, headers, rows, mapping, kind, imported, skipped, timestamp }) {
  return {
    fileName: fileName || "upload.csv",
    importedAt: timestamp,
    headers,
    rowCount: rows.length,
    imported,
    skipped: skipped.length,
    kind,
    mapping,
  };
}
