import { randomUUID } from "node:crypto";
import { columnCounts, columnSaysNotContacted, isPrivateHeader, normalizeChannel, normalizeStatus, parseDate, suggestMapping } from "./fields.js";
import { calendarMarks, canonicalRosterStatus, rosterFields } from "./roster.js";

export const CALENDAR_NAME = "Elders Quorum Calendar";

export const PRESIDENCY_ROLES = [
  "President",
  "1st Counselor",
  "2nd Counselor",
  "Secretary",
  "Asst. Secretary",
];

export const PRESIDENCY = [
  { name: "Mark Lillenberg", role: PRESIDENCY_ROLES[0] },
  { name: "Tyler Sanders", role: PRESIDENCY_ROLES[1] },
  { name: "Brad Conger", role: PRESIDENCY_ROLES[2] },
  { name: "Harrison Bardo", role: PRESIDENCY_ROLES[3] },
  { name: "Josh Owens", role: PRESIDENCY_ROLES[4] },
];

export const CHANNELS = ["text", "phone", "email", "in_person"];

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
    const roster = rosterFields(person.sheetColumns);
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
      ...roster,
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
    presidency: activePresidency(state),
    calendarName: CALENDAR_NAME,
    sacrament: SACRAMENT,
    privateVisible: includePrivate,
    rosterMode: people.some((person) => person.sheetName || person.priesthood || person.rosterStatus || person.appointment),
    calendarMarks: calendarMarks({ people, outreachAttempts: state.outreachAttempts, visits: state.visits }),
    openMessages: openMessages(state).map((comment) => presentMessage(state, people, comment)),
  };
}

function presentMessage(state, people, comment) {
  const visit = comment.targetType === "visit" ? state.visits.find((item) => item.id === comment.targetId) : null;
  const personId = comment.targetType === "person" ? comment.targetId : visit?.personId || "";
  const person = people.find((item) => item.id === personId);
  return {
    id: comment.id,
    body: comment.body,
    targetType: comment.targetType,
    targetId: comment.targetId,
    personId,
    personName: person ? (person.sheetName || person.displayName || "") : "",
    mentions: mentionedMembers(comment.body, activePresidency(state)),
    createdAt: comment.createdAt,
  };
}

function presidencySlot(role, counselorCount) {
  const raw = String(role ?? "").toLowerCase();
  if (raw.includes("assist") || raw.includes("asst")) return 4;
  if (raw.includes("secretary")) return 3;
  if (raw.includes("president")) return 0;
  if (raw.includes("1st") || raw.includes("first")) return 1;
  if (raw.includes("2nd") || raw.includes("second")) return 2;
  if (raw.includes("counselor")) return counselorCount === 0 ? 1 : 2;
  return -1;
}

export function activePresidency(state) {
  const saved = Array.isArray(state?.presidency) ? state.presidency : [];
  const names = PRESIDENCY.map((member) => member.name);
  let counselors = 0;
  for (const member of saved) {
    const name = String(member?.name ?? "").trim();
    if (!name) continue;
    const raw = String(member?.role ?? "").toLowerCase();
    const slot = presidencySlot(member?.role, counselors);
    if (raw.includes("counselor") && !raw.includes("1st") && !raw.includes("2nd") && !raw.includes("first") && !raw.includes("second")) {
      counselors += 1;
    }
    if (slot >= 0) names[slot] = name;
  }
  return PRESIDENCY_ROLES.map((role, index) => ({ name: names[index], role }));
}

export function setPresidency(state, members) {
  const names = (Array.isArray(members) ? members : []).map((member) => String(member?.name ?? "").trim());
  if (names.length !== PRESIDENCY_ROLES.length || names.some((name) => !name)) {
    throw new PortalError("Enter a name for each EQ Presidency position");
  }
  return {
    ...state,
    presidency: names.map((name, index) => ({ name, role: PRESIDENCY_ROLES[index] })),
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
  if (!CHANNELS.includes(channel)) throw new PortalError("Channel must be text, phone, email, or in person");
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
    sheetColumns: String(input.by ?? "").trim() ? { By: String(input.by).trim() } : {},
    createdAt: now(),
  };
  return { ...state, outreachAttempts: [...state.outreachAttempts, attempt] };
}

export function scheduleVisit(state, input, deps = {}) {
  const { id, now } = stamp(deps);
  const person = requirePerson(state, input.personId);
  const replyChannel = normalizeChannel(input.replyChannel);
  if (!CHANNELS.includes(replyChannel)) {
    throw new PortalError("Reply channel must be text, phone, email, or in person");
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

export function appointmentLabel(date, time) {
  const iso = parseDate(date);
  if (!iso) throw new PortalError("Appointment date must be YYYY-MM-DD or M/D/YYYY");
  const match = String(time ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new PortalError("Appointment time must be HH:MM");
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new PortalError("Appointment time must be HH:MM");
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  const [year, month, day] = iso.split("-");
  const dated = year === "2026" ? `${Number(month)}/${Number(day)}` : `${Number(month)}/${Number(day)}/${year}`;
  return `${dated} ${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function reachOutLabel(date) {
  const iso = parseDate(date);
  if (!iso) throw new PortalError("Reach out date must be YYYY-MM-DD or M/D/YYYY");
  const [year, month, day] = iso.split("-");
  return year === "2026" ? `${Number(month)}/${Number(day)}` : `${Number(month)}/${Number(day)}/${year}`;
}

export function setReachOutDate(state, personId, input) {
  const person = requirePerson(state, personId);
  const label = reachOutLabel(input.date);
  const sheetColumns = { ...person.sheetColumns, "Reach Out Date": label, Status: "Reach Out" };
  return {
    ...state,
    people: state.people.map((item) => (item.id === personId ? { ...item, sheetColumns } : item)),
  };
}

export function setAppointment(state, personId, input) {
  const person = requirePerson(state, personId);
  const label = appointmentLabel(input.date, input.time);
  const sheetColumns = { ...person.sheetColumns, "Apt Date": label, Status: "Scheduled" };
  return {
    ...state,
    people: state.people.map((item) => (item.id === personId ? { ...item, sheetColumns } : item)),
  };
}

export function setPersonStatus(state, personId, status) {
  const person = requirePerson(state, personId);
  const label = canonicalRosterStatus(status);
  const sheetColumns = { ...person.sheetColumns };
  if (label) sheetColumns.Status = label;
  else delete sheetColumns.Status;
  return {
    ...state,
    people: state.people.map((item) => (item.id === personId ? { ...item, sheetColumns } : item)),
  };
}

export function mentionedMembers(body, presidency) {
  const members = (presidency || []).filter((member) => String(member?.name ?? "").trim());
  const text = String(body ?? "");
  const found = new Set();
  const names = members.map((member) => member.name).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (text.includes(`@${name}`)) found.add(name);
  }
  for (const match of text.matchAll(/@([A-Za-z][A-Za-z'-]*)/g)) {
    const token = match[1].toLowerCase();
    const hits = members.filter((member) => member.name.toLowerCase().split(/\s+/)[0] === token);
    if (hits.length === 1) found.add(hits[0].name);
  }
  return [...found];
}

export function openMessages(state) {
  const presidency = activePresidency(state);
  const comments = state?.comments || [];
  const answered = new Set(comments.map((comment) => comment.parentId).filter(Boolean));
  return comments
    .filter((comment) => !comment.resolvedAt && !answered.has(comment.id) && mentionedMembers(comment.body, presidency).length > 0)
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function commentTarget(state, input) {
  let targetType = input.targetType;
  let targetId = input.targetId;
  let parentId = String(input.parentId ?? "").trim();
  if (parentId) {
    const parent = state.comments.find((comment) => comment.id === parentId);
    if (!parent) throw new PortalError("Message not found", 404);
    targetType = parent.targetType;
    targetId = parent.targetId;
  }
  if (targetType !== "person" && targetType !== "visit") throw new PortalError("Comment on a person or a visit");
  if (targetType === "person") requirePerson(state, targetId);
  if (targetType === "visit" && !state.visits.some((visit) => visit.id === targetId)) {
    throw new PortalError("Visit not found", 404);
  }
  return { targetType, targetId, parentId };
}

export function addComment(state, input, deps = {}) {
  const { id, now } = stamp(deps);
  const { targetType, targetId, parentId } = commentTarget(state, input);
  const authorName = String(input.authorName ?? "").trim();
  const body = String(input.body ?? "").trim();
  if (!body) throw new PortalError("Comment is empty");
  const comment = {
    id: id("cmt"),
    targetType,
    targetId,
    parentId,
    authorName,
    body,
    createdAt: now(),
    resolvedAt: "",
  };
  return { ...state, comments: [...state.comments, comment] };
}

export function updateComment(state, commentId, input, deps = {}) {
  const { now } = stamp(deps);
  const body = String(input.body ?? "").trim();
  if (!body) throw new PortalError("Comment is empty");
  const index = state.comments.findIndex((comment) => comment.id === commentId);
  if (index < 0) throw new PortalError("Comment not found", 404);
  const comments = state.comments.slice();
  comments[index] = { ...comments[index], body, updatedAt: now() };
  return { ...state, comments };
}

export function resolveComment(state, commentId, deps = {}) {
  const { now } = stamp(deps);
  const index = state.comments.findIndex((comment) => comment.id === commentId);
  if (index < 0) throw new PortalError("Comment not found", 404);
  const comments = state.comments.slice();
  comments[index] = { ...comments[index], resolvedAt: now() };
  return { ...state, comments };
}

export function deleteComment(state, commentId) {
  if (!state.comments.some((comment) => comment.id === commentId)) throw new PortalError("Comment not found", 404);
  const drop = new Set([commentId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const comment of state.comments) {
      if (comment.parentId && drop.has(comment.parentId) && !drop.has(comment.id)) {
        drop.add(comment.id);
        grew = true;
      }
    }
  }
  return { ...state, comments: state.comments.filter((comment) => !drop.has(comment.id)) };
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
