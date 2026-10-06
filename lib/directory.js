import { formatPhone } from "./roster.js";

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

export function applyDirectory(state, records) {
  const directory = (records || []).map((row, index) => ({
    id: row.id || `dir_${index + 1}`,
    name: clean(row.name),
    members: Array.isArray(row.members) ? row.members.map(clean).filter(Boolean) : [],
    address: String(row.address || "").trim(),
    phone: formatPhone(row.phone),
    email: clean(row.email),
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
