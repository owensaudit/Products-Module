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
  const remaining = (from.members || []).filter((item) => item !== member);
  const directory = state.directory.flatMap((row) => {
    if (row.id === from.id) {
      if (!remaining.length) return [];
      const companions = { ...(row.memberCompanions || {}) };
      delete companions[key];
      return [{ ...row, members: remaining, memberCompanions: companions }];
    }
    if (row.id === to.id) {
      const members = (row.members || []).includes(member) ? row.members : [...(row.members || []), member];
      const companions = { ...(row.memberCompanions || {}) };
      if (companion) companions[key] = companion;
      return [{ ...row, members, memberCompanions: companions }];
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
      delete companions[key];
      return { ...row, members: remaining, memberCompanions: companions };
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
  const companions = {};
  for (const member of members) {
    const key = normalizeDirectoryName(member);
    if (previous[key]) companions[key] = previous[key];
  }
  const directory = state.directory.map((row) => (row.id === record.id ? { ...row, name, members, address, phone, email, memberCompanions: companions } : row));
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
