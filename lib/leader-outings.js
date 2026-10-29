import { parseDate } from "./fields.js";
import { directoryPersonName, normalizeDirectoryName } from "./directory.js";
import { PortalError, appointmentLabel, createId } from "./model.js";
import { friendlyBrotherName } from "./roster.js";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function nameKeys(value) {
  const raw = clean(value);
  const keys = new Set();
  if (!raw) return keys;
  keys.add(normalizeDirectoryName(raw));
  keys.add(normalizeDirectoryName(friendlyBrotherName(raw)));
  const comma = raw.indexOf(",");
  if (comma !== -1) keys.add(normalizeDirectoryName(`${raw.slice(comma + 1)} ${raw.slice(0, comma)}`));
  return keys;
}

function namesMatch(left, right) {
  const keys = nameKeys(left);
  for (const key of nameKeys(right)) {
    if (key && keys.has(key)) return true;
  }
  return false;
}

function personName(person) {
  return clean(person?.sheetColumns?.Brother || person?.displayName || "");
}

function leaderNames(state) {
  const names = [];
  for (const quorum of ["priests", "teachers"]) {
    for (const row of state?.youthLeadership?.[quorum] || []) {
      const name = clean(row?.name);
      if (name) names.push(name);
    }
  }
  return names;
}

function requireLeader(state, personId) {
  const person = (state.people || []).find((item) => item.id === personId);
  if (!person) throw new PortalError("Person not found", 404);
  const name = personName(person);
  if (!leaderNames(state).some((leader) => namesMatch(leader, name) || namesMatch(leader, person.displayName))) {
    throw new PortalError("Choose a youth leader");
  }
  return person;
}

function meetingClock(time) {
  const match = String(time ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new PortalError("Appointment time must be HH:MM");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new PortalError("Appointment time must be HH:MM");
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function quarterOf(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
  const month = Number(iso.slice(5, 7));
  return `${iso.slice(0, 4)}-${Math.floor((month - 1) / 3) + 1}`;
}

function youthCompanion(state, quorum, name) {
  return (state.people || []).find((person) => person.group === quorum && (namesMatch(personName(person), name) || namesMatch(person.displayName, name)));
}

function companionNames(state, quorum, input) {
  const requested = Array.isArray(input) ? input : [input];
  const names = [];
  for (const item of requested) {
    const text = clean(item);
    if (!text || names.some((name) => namesMatch(name, text))) continue;
    names.push(text);
  }
  if (names.length < 1 || names.length > 2) throw new PortalError("Choose one or two priests, or one or two teachers");
  const resolved = [];
  for (const name of names) {
    const person = youthCompanion(state, quorum, name);
    if (!person) throw new PortalError("Choose one or two priests, or one or two teachers");
    resolved.push(personName(person));
  }
  return resolved;
}

function outingTarget(state, input) {
  const householdId = clean(input?.householdId);
  const personDirectoryId = clean(input?.personDirectoryId);
  const personMember = clean(input?.personMember);
  if (householdId && (personDirectoryId || personMember)) throw new PortalError("Choose a household or a person, not both");
  if (householdId) {
    const record = (state.directory || []).find((row) => row.id === householdId);
    if (!record) throw new PortalError("Choose a household or a person");
    const people = (record.members || []).map((member) => directoryPersonName(record, member)).filter(Boolean);
    return {
      targetKind: "household",
      targetDirectoryId: record.id,
      targetMember: "",
      targetLabel: record.name,
      visitedPeople: people.length ? people : [record.name],
    };
  }
  if (personDirectoryId && personMember) {
    const record = (state.directory || []).find((row) => row.id === personDirectoryId);
    if (!record || !(record.members || []).includes(personMember)) throw new PortalError("Choose a household or a person");
    const label = directoryPersonName(record, personMember);
    return {
      targetKind: "person",
      targetDirectoryId: record.id,
      targetMember: personMember,
      targetLabel: label,
      visitedPeople: [label],
    };
  }
  throw new PortalError("Choose a household or a person");
}

function outings(state) {
  return Array.isArray(state.leaderOutings) ? state.leaderOutings : [];
}

function ministerCompanion(state, person, name) {
  const companion = clean(name);
  if (!companion) throw new PortalError("Choose a temporary companion");
  if (namesMatch(personName(person), companion) || namesMatch(person.displayName, companion)) throw new PortalError("Choose a temporary companion");
  const brother = (state.people || []).find((item) => item.id !== person.id && item.list !== "youth" && item.group !== "priests" && item.group !== "teachers" && (namesMatch(personName(item), companion) || namesMatch(item.displayName, companion)));
  if (brother) return personName(brother);
  const office = (state.presidency || []).find((member) => namesMatch(member?.name, companion));
  if (office) return clean(office.name);
  throw new PortalError("Choose a temporary companion");
}

export function scheduleMinisterOuting(state, input) {
  const person = (state.people || []).find((item) => item.id === input?.personId);
  if (!person || person.list === "youth" || person.group === "priests" || person.group === "teachers") throw new PortalError("Choose a minister");
  const companion = ministerCompanion(state, person, input?.companion);
  const target = outingTarget(state, input);
  const meeting = appointmentLabel(input?.date, input?.time);
  const meetingDate = parseDate(input?.date);
  const meetingTime = meetingClock(input?.time);
  const leaderName = personName(person);
  const existing = outings(state);
  const duplicate = existing.some((row) => !row.done && row.leaderPersonId === person.id && row.meetingDate === meetingDate && row.meetingTime === meetingTime && row.targetDirectoryId === target.targetDirectoryId && row.targetMember === target.targetMember);
  if (duplicate) throw new PortalError("That outing is already scheduled");
  return {
    ...state,
    leaderOutings: [...existing, {
      id: createId("out"),
      leaderPersonId: person.id,
      leaderName,
      quorum: "brother",
      companions: [companion],
      ...target,
      meeting,
      meetingDate,
      meetingTime,
      done: false,
      doneOn: "",
      quarter: "",
      visitors: [],
    }],
  };
}

export function scheduleLeaderOuting(state, input) {
  const person = requireLeader(state, input?.personId);
  const quorum = input?.quorum === "teachers" ? "teachers" : input?.quorum === "priests" ? "priests" : "";
  if (!quorum) throw new PortalError("Choose one or two priests, or one or two teachers");
  const companions = companionNames(state, quorum, input?.companions);
  const target = outingTarget(state, input);
  const meeting = appointmentLabel(input?.date, input?.time);
  const meetingDate = parseDate(input?.date);
  const meetingTime = meetingClock(input?.time);
  const leaderName = personName(person);
  const existing = outings(state);
  const duplicate = existing.some((row) => !row.done && row.leaderPersonId === person.id && row.meetingDate === meetingDate && row.meetingTime === meetingTime && row.targetDirectoryId === target.targetDirectoryId && row.targetMember === target.targetMember);
  if (duplicate) throw new PortalError("That outing is already scheduled");
  return {
    ...state,
    leaderOutings: [...existing, {
      id: createId("out"),
      leaderPersonId: person.id,
      leaderName,
      quorum,
      companions,
      ...target,
      meeting,
      meetingDate,
      meetingTime,
      done: false,
      doneOn: "",
      quarter: "",
      visitors: [],
    }],
  };
}

export function completeLeaderOuting(state, input) {
  const id = clean(input?.id);
  const rows = outings(state);
  const current = rows.find((row) => row.id === id);
  if (!current) throw new PortalError("Temporary outing not found", 404);
  if (current.done) return state;
  const doneOn = parseDate(input?.date) || current.meetingDate;
  const quarter = quarterOf(current.meetingDate || doneOn);
  const visitors = [current.leaderName, ...(current.companions || [])].filter(Boolean);
  return {
    ...state,
    leaderOutings: rows.map((row) => (row.id === id ? { ...row, done: true, doneOn, quarter, visitors } : row)),
  };
}

export function removeLeaderOuting(state, input) {
  const id = clean(input?.id);
  const rows = outings(state);
  const current = rows.find((row) => row.id === id);
  if (!current) throw new PortalError("Temporary outing not found", 404);
  if (current.done) throw new PortalError("A finished outing stays on the record");
  return { ...state, leaderOutings: rows.filter((row) => row.id !== id) };
}
