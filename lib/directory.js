import { PortalError, addPerson, createId, setPersonContact } from "./model.js";
import { assignedNames, formatAssigned, formatPhone, friendlyBrotherName } from "./roster.js";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeDirectoryName(value) {
  return clean(value).toLowerCase().replace(/\./g, "");
}

function splitName(value) {
  const raw = clean(value);
  const comma = raw.indexOf(",");
  if (comma === -1) return { last: normalizeDirectoryName(raw), given: "" };
  return {
    last: normalizeDirectoryName(raw.slice(0, comma)),
    given: normalizeDirectoryName(raw.slice(comma + 1).split("&")[0]),
  };
}

function phoneLike(value) {
  const raw = clean(value);
  if (/^\d{3}-\d{4}$/.test(raw)) return true;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  return /^[+(]?\d[\d\s().-]{6,}$/.test(raw);
}

function emailLike(value) {
  return /@/.test(String(value || ""));
}

function splitContact(line) {
  const bits = String(line || "").split(/\t+/).map(clean).filter(Boolean);
  if (!bits.length) return null;
  let phone = "";
  let email = "";
  for (const bit of bits) {
    const foundEmail = bit.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const withoutEmail = foundEmail ? clean(bit.replace(foundEmail[0], "")) : bit;
    if (foundEmail) email = foundEmail[0];
    if (withoutEmail && phoneLike(withoutEmail)) phone = withoutEmail;
    else if (withoutEmail && !foundEmail) return null;
    else if (!foundEmail && !phoneLike(bit)) return null;
  }
  if (!phone && !email) return null;
  return { phone, email };
}

function isAddressLine(line) {
  if (/^(apt|unit|suite|po box|p\.?o\.?\s*box)\b/i.test(line)) return true;
  if (phoneLike(line) || emailLike(line)) return false;
  if (/^\d/.test(line)) return true;
  return /\b[A-Za-z]{2}\s+\d{5}(?:-\d{0,4})?-?$/.test(line);
}

function parseBlock(name, lines) {
  const members = [];
  const address = [];
  let phone = "";
  let email = "";
  let seenAddress = false;
  for (const line of lines) {
    const contact = splitContact(line);
    if (contact) {
      if (contact.phone && !phone) phone = contact.phone;
      if (contact.email && !email) email = contact.email;
      continue;
    }
    if (/^out-of-unit$/i.test(line)) {
      if (members.length) members[members.length - 1] = `${members[members.length - 1]} (Out-of-Unit)`;
      continue;
    }
    if (seenAddress || isAddressLine(line)) {
      seenAddress = true;
      address.push(line);
      continue;
    }
    members.push(line);
  }
  return {
    name,
    members,
    address: address.join("\n"),
    phone,
    email,
  };
}

export function parseDirectory(text) {
  const blocks = String(text || "").replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const records = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const name = clean(lines[0].replace(/\t/g, " "));
    if (!/^[^,]+,\s*\S/.test(name)) continue;
    records.push(parseBlock(name, lines.slice(1)));
  }
  return records;
}

function memberMatches(record, personName) {
  const person = splitName(personName);
  if (!person.last || !person.given) return false;
  if (splitName(record.name).last !== person.last) return false;
  const given = person.given.replace(/[()]/g, "").trim();
  return (record.members || []).some((member) => {
    const text = normalizeDirectoryName(member).replace(/\s*\(out-of-unit\)\s*/g, "").trim();
    return text === given || text === `${person.last}, ${given}`;
  });
}

export function findDirectoryRecord(name, directory) {
  const key = normalizeDirectoryName(name);
  if (!key || !Array.isArray(directory)) return null;
  const exact = directory.find((row) => normalizeDirectoryName(row.name) === key);
  if (exact) return exact;
  const prefix = directory.find((row) => normalizeDirectoryName(row.name).startsWith(`${key} &`));
  if (prefix) return prefix;
  const members = directory.filter((row) => memberMatches(row, name));
  if (members.length === 1) return members[0];
  return null;
}

function withHousehold(person, record, replaceContact) {
  const household = (record.members || []).join("\n");
  const sheetColumns = { ...(person.sheetColumns || {}) };
  if (household) sheetColumns["Household Members"] = household;
  const next = {
    ...person,
    household: household || person.household || "",
    sheetColumns,
  };
  if (!replaceContact) return next;
  if (record.address) next.sheetColumns = { ...next.sheetColumns, Address: record.address };
  if (record.phone) next.phone = formatPhone(record.phone);
  if (record.email) next.email = clean(record.email);
  return next;
}

function savedCompanions(state, name) {
  const previous = (state?.directory || []).find((row) => normalizeDirectoryName(row.name) === normalizeDirectoryName(name));
  const companions = previous?.memberCompanions;
  return companions && typeof companions === "object" ? { ...companions } : {};
}

function savedVisits(state, name) {
  const previous = (state?.directory || []).find((row) => normalizeDirectoryName(row.name) === normalizeDirectoryName(name));
  const visits = previous?.memberVisits;
  return visits && typeof visits === "object" ? { ...visits } : {};
}

export function companionNames(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const text = clean(value);
  return text ? [text] : [];
}

export function directoryPersonName(record, member) {
  const given = clean(member).replace(/\s*\(out-of-unit\)\s*/ig, " ").replace(/\s+/g, " ").trim();
  if (!given) return "";
  if (given.includes(",")) return given;
  const last = clean(record?.name).split(",")[0].trim();
  if (last && given.toLowerCase().endsWith(` ${last.toLowerCase()}`)) {
    const first = given.slice(0, given.length - last.length).trim();
    if (first) return `${last}, ${first}`;
  }
  return last ? `${last}, ${given}` : given;
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

function sheetName(person) {
  return clean(person?.sheetColumns?.Brother || person?.displayName || "");
}

function requireDirectoryRecord(state, directoryId) {
  const record = (state.directory || []).find((row) => row.id === directoryId);
  if (!record) throw new PortalError("Household not found", 404);
  return record;
}

function youthMember(state, fullName) {
  return (state.people || []).find((person) => (person.group === "priests" || person.group === "teachers") && (namesMatch(sheetName(person), fullName) || namesMatch(person.displayName, fullName)));
}

export function setDirectoryCompanion(state, input) {
  const record = requireDirectoryRecord(state, input?.directoryId);
  const member = clean(input?.member);
  if (!member || !(record.members || []).includes(member)) throw new PortalError("Choose a person in this household");
  const companion = clean(input?.companion);
  const key = normalizeDirectoryName(member);
  const directory = state.directory.map((row) => {
    if (row.id !== record.id) return row;
    const companions = { ...(row.memberCompanions || {}) };
    if (companion) companions[key] = companion;
    else delete companions[key];
    return { ...row, memberCompanions: companions };
  });
  let next = { ...state, directory };
  const fullName = directoryPersonName(record, member);
  const youth = youthMember(next, fullName);
  if (!youth) return next;
  next = setPersonContact(next, youth.id, { companion });
  const assignedYouth = sheetName(youth) || fullName;
  for (const family of next.people) {
    if (family.list !== "youth") continue;
    const assigned = assignedNames(family.sheetColumns?.Assigned);
    if (!namesMatch(assigned[0], assignedYouth) && !namesMatch(assigned[0], fullName)) continue;
    const names = [assigned[0] || assignedYouth];
    if (companion) names.push(companion);
    next = setPersonContact(next, family.id, { assigned: names });
  }
  return next;
}

function assignmentForHousehold(state, record) {
  return (state.people || []).find((person) => {
    if (person.list !== "youth") return false;
    const name = sheetName(person);
    return namesMatch(name, record.name) || findDirectoryRecord(name, [record])?.id === record.id;
  });
}

function storedMember(record, line) {
  const text = clean(line);
  if (!text) return "";
  const existing = (record.members || []).find((member) => member === text || directoryPersonName(record, member) === text);
  if (existing) return existing;
  const last = clean(record.name).split(",")[0].trim();
  const comma = text.indexOf(",");
  if (last && comma !== -1 && normalizeDirectoryName(text.slice(0, comma)) === normalizeDirectoryName(last)) {
    return clean(text.slice(comma + 1));
  }
  return text;
}

export function moveDirectoryPerson(state, input) {
  const from = requireDirectoryRecord(state, input?.directoryId);
  const to = requireDirectoryRecord(state, input?.householdId);
  if (from.id === to.id) return state;
  const member = clean(input?.member);
  if (!member || !(from.members || []).includes(member)) throw new PortalError("Choose a person in this household");
  const key = normalizeDirectoryName(member);
  const companion = from.memberCompanions?.[key] || "";
  const visits = Array.isArray(from.memberVisits?.[key]) ? from.memberVisits[key] : [];
  const remaining = (from.members || []).filter((item) => item !== member);
  const directory = state.directory.flatMap((row) => {
    if (row.id === from.id) {
      if (!remaining.length) return [];
      const companions = { ...(row.memberCompanions || {}) };
      const memberVisits = { ...(row.memberVisits || {}) };
      delete companions[key];
      delete memberVisits[key];
      return [{ ...row, members: remaining, memberCompanions: companions, memberVisits }];
    }
    if (row.id === to.id) {
      const members = (row.members || []).includes(member) ? row.members : [...(row.members || []), member];
      const companions = { ...(row.memberCompanions || {}) };
      const memberVisits = { ...(row.memberVisits || {}) };
      if (companion) companions[key] = Array.isArray(companion) ? [...companion] : companion;
      if (visits.length) memberVisits[key] = visits.map((item) => ({ ...item }));
      return [{ ...row, members, memberCompanions: companions, memberVisits }];
    }
    return [row];
  });
  return { ...state, directory };
}

function sameDirectoryPerson(record, member, name) {
  const target = clean(name);
  if (!target) return false;
  if (member === target) return true;
  return directoryPersonName(record, member).toLowerCase() === target.toLowerCase();
}

export function addDirectoryMember(state, input, deps = {}) {
  const name = clean(input?.name);
  if (!name) throw new PortalError("A member needs a name");
  const householdId = clean(input?.householdId);
  const householdName = clean(input?.householdName) || name;
  const directory = Array.isArray(state.directory) ? state.directory : [];
  const record = householdId
    ? directory.find((row) => row.id === householdId)
    : directory.find((row) => normalizeDirectoryName(row.name) === normalizeDirectoryName(householdName));
  if (householdId && !record) throw new PortalError("Household not found", 404);
  if (record) {
    if ((record.members || []).some((member) => sameDirectoryPerson(record, member, name))) {
      throw new PortalError("That person is already in this household");
    }
    const member = storedMember(record, name);
    return {
      ...state,
      directory: directory.map((row) => (row.id === record.id ? { ...row, members: [...(row.members || []), member] } : row)),
    };
  }
  const id = deps.id ? deps.id("dir") : createId("dir");
  const draft = { name: householdName, members: [] };
  return {
    ...state,
    directory: [...directory, {
      id,
      name: householdName,
      members: [storedMember(draft, name)],
      address: "",
      phone: "",
      email: "",
      memberCompanions: {},
    }],
  };
}

function normAddressText(value) {
  return clean(value).toLowerCase().replace(/[.#,]/g, " ").replace(/\s+/g, " ").trim();
}

function directoryLastName(record) {
  return normalizeDirectoryName(clean(record?.name).split(",")[0]);
}

export function directoryAddressKey(address) {
  const lines = String(address || "").split(/\n/).map(clean).filter(Boolean);
  if (!lines.length) return "";
  const units = [];
  const body = [];
  for (const line of lines) {
    if (/^(apt|apartment|unit|suite|ste|#)\b/i.test(line)) units.push(line);
    else body.push(line);
  }
  let city = "";
  let street = body;
  if (body.length >= 2 && /\d{5}/.test(body[body.length - 1])) {
    city = body[body.length - 1];
    street = body.slice(0, -1);
  }
  const streetKey = normAddressText(street.join(" "));
  if (!streetKey) return "";
  const unitKey = normAddressText(units.join(" ")).replace(/\b(apt|apartment|unit|suite|ste)\b/g, " ").replace(/\s+/g, " ").trim();
  const cityKey = normAddressText(city).replace(/\d{5}(?:-\d{4})?/g, " ").replace(/\s+/g, " ").trim();
  return `${streetKey}|${unitKey}|${cityKey}`;
}

function directoryIdentity(record, member) {
  return normalizeDirectoryName(directoryPersonName(record, member));
}

function placeDirectoryMember(anchor, source, member) {
  const identity = directoryIdentity(source, member);
  const already = (anchor.members || []).some((item) => directoryIdentity(anchor, item) === identity);
  const stored = directoryLastName(anchor) && directoryLastName(anchor) === directoryLastName(source)
    ? storedMember(anchor, member)
    : (clean(member).includes(",") ? clean(member) : directoryPersonName(source, member));
  if (!already && stored) anchor.members.push(stored);
  const companions = source.memberCompanions || {};
  const companion = companions[normalizeDirectoryName(member)]
    || companions[normalizeDirectoryName(directoryPersonName(source, member))]
    || "";
  if (companion && !anchor.memberCompanions[normalizeDirectoryName(stored || member)]) {
    anchor.memberCompanions[normalizeDirectoryName(stored || member)] = companion;
  }
  const visits = source.memberVisits || {};
  const visitKey = normalizeDirectoryName(member);
  const incoming = Array.isArray(visits[visitKey]) ? visits[visitKey] : [];
  if (!incoming.length) return;
  const storedKey = normalizeDirectoryName(stored || member);
  if (!anchor.memberVisits) anchor.memberVisits = {};
  if (!anchor.memberVisits[storedKey]) anchor.memberVisits[storedKey] = incoming.map((item) => ({ ...item }));
}

function fillDirectoryContact(anchor, source) {
  if (!clean(anchor.phone) && clean(source.phone)) anchor.phone = source.phone;
  if (!clean(anchor.email) && clean(source.email)) anchor.email = source.email;
  if (!clean(anchor.address) && clean(source.address)) anchor.address = source.address;
}

function nameJoinedHousehold(record) {
  if (clean(record.name).includes("&")) return record.name;
  const last = clean(record.name).split(",")[0].trim();
  const given = (record.members || []).map((member) => {
    const text = clean(member).replace(/\s*\(out-of-unit\)\s*/ig, " ").replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (!text.includes(",")) return text;
    return clean(text.slice(text.indexOf(",") + 1)) || text;
  }).filter(Boolean);
  if (!last || given.length < 2) return record.name;
  return `${last}, ${given.join(" & ")}`;
}

export function mergeDirectoryByAddress(state) {
  const directory = (Array.isArray(state.directory) ? state.directory : []).map((row) => ({
    ...row,
    members: [...(row.members || [])],
    memberCompanions: { ...(row.memberCompanions || {}) },
    memberVisits: { ...(row.memberVisits || {}) },
  }));
  const groups = new Map();
  for (const row of directory) {
    const key = directoryAddressKey(row.address);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const remove = new Set();
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const active = rows.filter((row) => !remove.has(row.id));
    const households = active.filter((row) => (row.members || []).length >= 2);
    const singles = active.filter((row) => (row.members || []).length === 1);
    if (households.length === 1) {
      const anchor = households[0];
      for (const single of singles) {
        for (const member of single.members || []) placeDirectoryMember(anchor, single, member);
        fillDirectoryContact(anchor, single);
        remove.add(single.id);
      }
      continue;
    }
    if (households.length > 0) continue;
    const byLast = new Map();
    for (const single of singles) {
      const last = directoryLastName(single);
      if (!last) continue;
      if (!byLast.has(last)) byLast.set(last, []);
      byLast.get(last).push(single);
    }
    for (const group of byLast.values()) {
      if (group.length < 2) continue;
      const anchor = group[0];
      for (const single of group.slice(1)) {
        for (const member of single.members || []) placeDirectoryMember(anchor, single, member);
        fillDirectoryContact(anchor, single);
        remove.add(single.id);
      }
      anchor.name = nameJoinedHousehold(anchor);
    }
  }
  return {
    ...state,
    directory: directory.filter((row) => !remove.has(row.id)),
  };
}

function foldDirectoryLabel(value) {
  return normalizeDirectoryName(value).replace(/&/g, " and ").replace(/[()]/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function directoryRoster(directory) {
  const people = [];
  for (const row of directory || []) {
    for (const member of row.members || []) {
      const name = directoryPersonName(row, member);
      if (name) people.push({ name, member, id: row.id, fold: foldDirectoryLabel(name) });
    }
  }
  return people;
}

function findDirectoryPerson(directory, label) {
  const folded = foldDirectoryLabel(label);
  const exact = directoryRoster(directory).filter((person) => person.fold === folded);
  if (exact.length === 1) return exact[0];
  const [last, rest] = clean(label).split(",").map((part) => part.trim());
  const first = foldDirectoryLabel(rest || "").split(" ")[0];
  const lastName = foldDirectoryLabel(last);
  if (!lastName || !first) return null;
  const loose = directoryRoster(directory).filter((person) => {
    const [personLast, personRest] = person.name.split(",").map((part) => foldDirectoryLabel(part));
    return personLast === lastName && (personRest || "").split(" ")[0] === first;
  });
  return loose.length === 1 ? loose[0] : null;
}

function findAssignedHousehold(directory, label) {
  const folded = foldDirectoryLabel(label);
  const exact = (directory || []).filter((row) => foldDirectoryLabel(row.name) === folded);
  if (exact.length === 1) return { directoryId: exact[0].id, label: exact[0].name };
  const tokens = folded.split(" ").filter((token) => token && token !== "and");
  const byTokens = (directory || []).filter((row) => {
    const words = foldDirectoryLabel(row.name).split(" ");
    return tokens.length > 0 && tokens.every((token) => words.includes(token));
  });
  if (byTokens.length === 1) return { directoryId: byTokens[0].id, label: byTokens[0].name };
  const head = clean(label).split("&")[0];
  const person = findDirectoryPerson(directory, head);
  if (!person) return null;
  return { directoryId: person.id, label: person.name };
}

export function applyMinisteringGroups(state, groups) {
  const directory = (Array.isArray(state.directory) ? state.directory : []).map((row) => ({
    ...row,
    members: [...(row.members || [])],
    memberCompanions: { ...(row.memberCompanions || {}) },
    memberVisits: { ...(row.memberVisits || {}) },
  }));
  for (const group of groups || []) {
    const ministers = (group?.members || []).map((name) => findDirectoryPerson(directory, name)).filter(Boolean);
    if (ministers.length !== (group?.members || []).length) throw new PortalError("A ministering brother was not found");
    const households = (group?.households || []).map((name) => findAssignedHousehold(directory, name));
    if (households.some((item) => !item)) throw new PortalError("An assigned household was not found");
    for (const person of ministers) {
      const row = directory.find((item) => item.id === person.id);
      const key = normalizeDirectoryName(person.member);
      const others = ministers.filter((item) => item !== person).map((item) => item.name);
      row.memberCompanions[key] = others.length === 1 ? others[0] : others;
      row.memberVisits[key] = households.map((item) => ({ directoryId: item.directoryId, label: item.label }));
    }
  }
  return { ...state, directory };
}

export function addDirectoryVisit(state, input) {
  const record = requireDirectoryRecord(state, input?.directoryId);
  const member = clean(input?.member);
  if (!member || !(record.members || []).includes(member)) throw new PortalError("Choose a person in this household");
  const household = requireDirectoryRecord(state, input?.householdId);
  const key = normalizeDirectoryName(member);
  const label = clean(input?.label) || household.name;
  const directory = state.directory.map((row) => {
    if (row.id !== record.id) return row;
    const memberVisits = { ...(row.memberVisits || {}) };
    const list = Array.isArray(memberVisits[key]) ? memberVisits[key].map((item) => ({ ...item })) : [];
    if (!list.some((item) => item.directoryId === household.id && item.label === label)) list.push({ directoryId: household.id, label });
    memberVisits[key] = list;
    return { ...row, memberVisits };
  });
  return { ...state, directory };
}

export function removeDirectoryMember(state, input) {
  const record = requireDirectoryRecord(state, input?.directoryId);
  const member = clean(input?.member);
  if (!member || !(record.members || []).includes(member)) throw new PortalError("Choose a person in this household");
  const key = normalizeDirectoryName(member);
  const remaining = (record.members || []).filter((item) => item !== member);
  const directory = remaining.length
    ? state.directory.map((row) => {
      if (row.id !== record.id) return row;
      const companions = { ...(row.memberCompanions || {}) };
      const memberVisits = { ...(row.memberVisits || {}) };
      delete companions[key];
      delete memberVisits[key];
      return { ...row, members: remaining, memberCompanions: companions, memberVisits };
    })
    : state.directory.filter((row) => row.id !== record.id);
  return { ...state, directory };
}

export function updateDirectoryHousehold(state, input) {
  const record = requireDirectoryRecord(state, input?.directoryId);
  const name = clean(input?.name) || record.name;
  const lines = Array.isArray(input?.members) ? input.members : String(input?.members ?? "").split(/\n/);
  const members = [];
  for (const line of lines) {
    const member = storedMember(record, line);
    if (member && !members.includes(member)) members.push(member);
  }
  if (!members.length) throw new PortalError("A household needs at least one person");
  const address = String(input?.address ?? "").trim();
  const phone = formatPhone(input?.phone);
  const email = clean(input?.email);
  const previous = record.memberCompanions || {};
  const previousVisits = record.memberVisits || {};
  const companions = {};
  const memberVisits = {};
  for (const member of members) {
    const key = normalizeDirectoryName(member);
    if (previous[key]) companions[key] = previous[key];
    if (previousVisits[key]) memberVisits[key] = previousVisits[key];
  }
  const directory = state.directory.map((row) => (row.id === record.id ? { ...row, name, members, address, phone, email, memberCompanions: companions, memberVisits } : row));
  let next = { ...state, directory };
  const existing = assignmentForHousehold(state, record);
  if (!existing) return next;
  next = setPersonContact(next, existing.id, { household: members.join("\n"), address, phone, email });
  if (name !== record.name) next = setPersonContact(next, existing.id, { name });
  return next;
}

export function assignDirectoryHousehold(state, input, deps) {
  const record = requireDirectoryRecord(state, input?.directoryId);
  const youth = clean(input?.youth);
  const companion = clean(input?.companion);
  if (!youth) throw new PortalError("Choose the youth for this assignment");
  const member = (record.members || []).find((item) => namesMatch(directoryPersonName(record, item), youth));
  let next = member ? setDirectoryCompanion(state, { directoryId: record.id, member, companion }) : state;
  const youthPerson = youthMember(next, youth);
  const assignedYouth = youthPerson ? (sheetName(youthPerson) || youth) : youth;
  const assigned = companion ? [assignedYouth, companion] : [assignedYouth];
  const existing = assignmentForHousehold(next, record);
  if (existing) {
    const patch = { assigned };
    if (!clean(existing.household) && record.members.length) patch.household = record.members.join("\n");
    if (!clean(existing.phone) && record.phone) patch.phone = record.phone;
    if (!clean(existing.email) && record.email) patch.email = record.email;
    if (!clean(existing.sheetColumns?.Address) && record.address) patch.address = record.address;
    return setPersonContact(next, existing.id, patch);
  }
  return addPerson(next, {
    displayName: record.name,
    list: "youth",
    household: record.members.join("\n"),
    phone: record.phone,
    email: record.email,
    sheetColumns: {
      Brother: record.name,
      Address: record.address,
      "Household Members": record.members.join("\n"),
      Assigned: formatAssigned(assigned),
    },
  }, deps);
}

export function applyDirectory(state, records) {
  const directory = (records || []).map((row, index) => ({
    id: row.id || `dir_${index + 1}`,
    name: clean(row.name),
    members: Array.isArray(row.members) ? row.members.map(clean).filter(Boolean) : [],
    address: String(row.address || "").trim(),
    phone: formatPhone(row.phone),
    email: clean(row.email),
    memberCompanions: savedCompanions(state, row.name),
    memberVisits: savedVisits(state, row.name),
  }));
  const people = (state.people || []).map((person) => {
    const name = person.sheetColumns?.Brother || person.displayName || "";
    const record = findDirectoryRecord(name, directory);
    if (!record) return person;
    const replaceContact = person.list === "youth";
    if (!replaceContact && String(person.household || "").trim()) return person;
    if (!replaceContact && !(record.members || []).length) return person;
    return withHousehold(person, record, replaceContact);
  });
  return { ...state, directory, people };
}
