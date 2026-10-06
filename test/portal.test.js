import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseCsv } from "../lib/csv.js";
import { suggestMapping } from "../lib/fields.js";
import {
  CALENDAR_NAME,
  PRESIDENCY,
  activePresidency,
  addComment,
  mentionedMembers,
  openMessages,
  deleteComment,
  resolveComment,
  updateComment,
  emptyState,
  importRows,
  logOutreach,
  removeOutreach,
  updateOutreach,
  setAppointment,
  setReachOutDate,
  setPersonContact,
  setPersonStatus,
  setPresidency,
  setYouthLeadership,
  addPerson,
  removePerson,
  personOutreachStatus,
  previewImport,
  presentState,
  scheduleVisit,
  setVisitStatus,
  slotsForMonth,
} from "../lib/model.js";
import { addDirectoryMember, addDirectoryVisit, applyDirectory, applyMinisteringGroups, assignDirectoryHousehold, directoryAddressKey, findDirectoryRecord, mergeDirectoryByAddress, moveDirectoryPerson, parseDirectory, removeDirectoryMember, setDirectoryCompanion, updateDirectoryHousehold } from "../lib/directory.js";
import { brotherSheetToState, calendarMarks, canonicalRosterStatus, isArchiveStatus, rosterStatusKey } from "../lib/roster.js";
import { createStore } from "../lib/store.js";
import { createPortalServer } from "../server.js";

function deps() {
  let n = 0;
  return {
    id: (prefix) => `${prefix}_${++n}`,
    now: () => "2026-09-29T12:00:00.000Z",
  };
}

test("September 2026 exposes Wednesday quarters and Sunday church windows", () => {
  const slots = slotsForMonth("2026-09", []);
  const wednesdays = ["2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30"];
  const sundays = ["2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27"];
  assert.deepEqual([...new Set(slots.filter((slot) => slot.dayType === "wednesday").map((slot) => slot.date))], wednesdays);
  assert.deepEqual([...new Set(slots.filter((slot) => slot.dayType === "sunday").map((slot) => slot.date))], sundays);
  assert.deepEqual(
    slots.filter((slot) => slot.date === "2026-09-02").map((slot) => slot.label),
    ["7:00 pm", "7:15 pm", "7:30 pm", "7:45 pm"],
  );
  assert.deepEqual(
    slots.filter((slot) => slot.date === "2026-09-06").map((slot) => slot.label),
    ["Before church", "After church"],
  );
  assert.equal(slots.length, wednesdays.length * 4 + sundays.length * 2);
  assert.equal(slots.every((slot) => slot.status === "open"), true);
});

test("scheduling records the reply channel and the Elders Quorum calendar audience", () => {
  let state = emptyState();
  state = {
    ...state,
    people: [{ id: "per_1", displayName: "Ada Example", phone: "", email: "", household: "", notes: "", sheetColumns: {}, createdAt: "2026-09-29T12:00:00.000Z", updatedAt: "2026-09-29T12:00:00.000Z" }],
  };
  state = scheduleVisit(state, {
    personId: "per_1",
    replyChannel: "text",
    replyDate: "2026-09-29",
    date: "2026-09-30",
    slotKey: "wed-1915",
    notes: "Can meet after the opening prayer window",
  }, deps());

  const visit = state.visits[0];
  assert.equal(visit.replyChannel, "text");
  assert.equal(visit.slotLabel, "7:15 pm");
  assert.equal(visit.calendar.name, CALENDAR_NAME);
  assert.equal(visit.calendar.externalEventId, null);
  assert.deepEqual(visit.calendar.intendedFor, PRESIDENCY);
  assert.equal(state.outreachAttempts[0].status, "replied");
  assert.equal(slotsForMonth("2026-09", state.visits).find((slot) => slot.id === "2026-09-30:wed-1915").status, "scheduled");
  assert.throws(() => scheduleVisit(state, {
    personId: "per_1",
    replyChannel: "phone",
    date: "2026-09-30",
    slotKey: "wed-1915",
  }, deps()), /already taken/);

  state = setVisitStatus(state, visit.id, "cancelled");
  assert.equal(slotsForMonth("2026-09", state.visits).find((slot) => slot.id === "2026-09-30:wed-1915").status, "open");
  assert.equal(personOutreachStatus("per_1", state.outreachAttempts, state.visits), "replied");
});

test("an appointment is a date and time that marks the brother scheduled", () => {
  let state = emptyState();
  state = {
    ...state,
    people: [{ id: "per_1", displayName: "Ada Example", phone: "", email: "", household: "", notes: "", sheetColumns: {}, createdAt: "2026-09-29T12:00:00.000Z", updatedAt: "2026-09-29T12:00:00.000Z" }],
  };
  assert.throws(() => setAppointment(state, "per_1", { date: "2026-10-21", time: "19:00" }), /Church, Home, or Driveby/);
  state = setAppointment(state, "per_1", { date: "2026-10-21", time: "19:00", place: "church" });
  assert.equal(state.people[0].sheetColumns["Apt Date"], "10/21 7:00 PM");
  assert.equal(state.people[0].sheetColumns["Apt Place"], "Church");
  assert.equal(state.people[0].sheetColumns.Status, "Scheduled");
  const view = presentState(state, "2026-10");
  assert.equal(view.people[0].appointment, "10/21 7:00 PM");
  assert.equal(view.people[0].appointmentPlace, "Church");
  assert.equal(view.people[0].rosterStatusKey, "scheduled");
  assert.deepEqual(view.calendarMarks["2026-10-21"], { kinds: ["scheduled"], people: ["per_1"] });
  state = setAppointment(state, "per_1", { date: "2026-10-21", time: "12:30", place: "home" });
  assert.equal(state.people[0].sheetColumns["Apt Place"], "Home");
  assert.equal(state.people[0].sheetColumns["Apt Date"], "10/21 12:30 PM");
  state = setAppointment(state, "per_1", { date: "2026-10-21", time: "00:00", place: "church" });
  assert.equal(state.people[0].sheetColumns["Apt Date"], "10/21 12:00 AM");
  state = setAppointment(state, "per_1", { date: "10/21/2027", time: "19:00", place: "church" });
  assert.equal(state.people[0].sheetColumns["Apt Date"], "10/21/2027 7:00 PM");
  assert.deepEqual(presentState(state, "2027-10").calendarMarks["2027-10-21"], { kinds: ["scheduled"], people: ["per_1"] });
  assert.equal(presentState(state, "2026-10").calendarMarks["2026-10-21"], undefined);
  assert.throws(() => setAppointment(state, "per_1", { date: "2026-10-21", time: "7pm" }), /HH:MM/);
  state = setPersonStatus(state, "per_1", "Re-Schedule");
  assert.deepEqual(presentState(state, "2027-10").calendarMarks["2027-10-21"], { kinds: ["reschedule"], people: ["per_1"] });
  state = setAppointment(state, "per_1", { date: "2026-10-20", time: "22:50", place: "home" });
  assert.equal(state.people[0].sheetColumns.Status, "Re-Schedule");
  assert.equal(state.people[0].sheetColumns["Apt Date"], "10/20 10:50 PM");
  assert.deepEqual(presentState(state, "2026-10").calendarMarks["2026-10-20"], { kinds: ["reschedule"], people: ["per_1"] });
  state = setReachOutDate(state, "per_1", { date: "2026-11-02" });
  assert.equal(state.people[0].sheetColumns.Status, "Reach Out");
  assert.equal(state.people[0].sheetColumns["Reach Out Date"], "11/2");
  assert.equal(state.people[0].sheetColumns["Apt Date"], undefined);
  assert.equal(state.people[0].sheetColumns["Apt Place"], undefined);
  assert.equal(presentState(state, "2026-10").calendarMarks["2026-10-20"], undefined);
  state = setAppointment(state, "per_1", { date: "2026-11-03", time: "19:00", kind: "scheduled", place: "church" });
  assert.equal(state.people[0].sheetColumns.Status, "Scheduled");
  assert.equal(state.people[0].sheetColumns["Reach Out Date"], undefined);
  state = setAppointment(state, "per_1", { date: "2026-11-04", time: "18:00", kind: "reschedule", place: "home" });
  assert.equal(state.people[0].sheetColumns.Status, "Re-Schedule");
  assert.equal(state.people[0].sheetColumns["Apt Date"], "11/4 6:00 PM");
  state = setAppointment(state, "per_1", { date: "2026-11-05", time: "18:30", kind: "scheduled", place: "drive-by" });
  assert.equal(state.people[0].sheetColumns["Apt Place"], "Drive by");
  assert.equal(state.people[0].sheetColumns.Status, "Drive by");
  const driveBy = presentState(state, "2026-11");
  assert.equal(driveBy.people[0].appointmentPlace, "Drive by");
  assert.equal(driveBy.people[0].rosterStatusKey, "driveby");
  assert.deepEqual(driveBy.calendarMarks["2026-11-05"], { kinds: ["driveby"], people: ["per_1"] });
});

test("a reach out needs a date and marks that calendar day", () => {
  let state = emptyState();
  state = {
    ...state,
    people: [{ id: "per_1", displayName: "Ada Example", phone: "", email: "", household: "", notes: "", sheetColumns: {}, createdAt: "2026-09-29T12:00:00.000Z", updatedAt: "2026-09-29T12:00:00.000Z" }],
  };
  state = setReachOutDate(state, "per_1", { date: "2026-10-05" });
  assert.equal(state.people[0].sheetColumns["Reach Out Date"], "10/5");
  assert.equal(state.people[0].sheetColumns.Status, "Reach Out");
  const view = presentState(state, "2026-10");
  assert.equal(view.people[0].reachOutDate, "10/5");
  assert.equal(view.people[0].rosterStatusKey, "reach_out");
  assert.deepEqual(view.calendarMarks["2026-10-05"], { kinds: ["reach_out"], people: ["per_1"] });
  state = setReachOutDate(state, "per_1", { date: "10/5/2027" });
  assert.equal(state.people[0].sheetColumns["Reach Out Date"], "10/5/2027");
  assert.deepEqual(presentState(state, "2027-10").calendarMarks["2027-10-05"], { kinds: ["reach_out"], people: ["per_1"] });
  state = setPersonStatus(state, "per_1", "Visited");
  assert.equal(presentState(state, "2027-10").calendarMarks["2027-10-05"], undefined);
  assert.throws(() => setReachOutDate(state, "per_1", { date: "soon" }), /Reach out date/);
});

test("a phone number and email can be saved on a person", () => {
  let state = emptyState();
  state = {
    ...state,
    people: [{ id: "per_1", displayName: "Ada Example", phone: "", email: "", household: "", notes: "Drive by and knock", sheetColumns: { Brother: "Example, Ada" }, createdAt: "2026-09-29T12:00:00.000Z", updatedAt: "2026-09-29T12:00:00.000Z" }],
  };
  state = setPersonContact(state, "per_1", { phone: " 555-0100 ", email: "ada@example.com" });
  assert.equal(state.people[0].phone, "555-0100");
  assert.equal(state.people[0].email, "ada@example.com");
  assert.equal(state.people[0].notes, "Drive by and knock");
  const hidden = presentState(state, "2026-09");
  assert.equal(hidden.people[0].phone, "");
  assert.equal(hidden.people[0].email, "");
  assert.equal(hidden.people[0].phoneOnFile, true);
  assert.equal(hidden.people[0].emailOnFile, true);
  const shown = presentState(state, "2026-09", { includePrivate: true });
  assert.equal(shown.people[0].phone, "555-0100");
  assert.equal(shown.people[0].email, "ada@example.com");
  state = setPersonContact(state, "per_1", { phone: " ", email: "" });
  assert.equal(state.people[0].phone, "");
  assert.equal(state.people[0].email, "");
  assert.equal(state.people[0].notes, "Drive by and knock");
  state = setPersonContact(state, "per_1", { notes: "  Knock first  " });
  assert.equal(state.people[0].notes, "Knock first");
  assert.equal(state.people[0].phone, "");
  state = setPersonContact(state, "per_1", { priesthood: "High Priest", age: " 46 ", birthday: "26 Jun 1979" });
  assert.equal(state.people[0].sheetColumns.Priesthood, "High Priest");
  assert.equal(state.people[0].sheetColumns.Age, "46");
  assert.equal(state.people[0].sheetColumns.Birthday, "06/26/1979");
  assert.equal(state.people[0].notes, "Knock first");
  const profile = presentState(state, "2026-09");
  assert.equal(profile.people[0].priesthood, "High Priest");
  assert.equal(profile.people[0].age, "46");
  assert.equal(profile.people[0].birthday, "06/26/1979");
  state = setPersonContact(state, "per_1", { birthday: "3 Jun 1996" });
  assert.equal(state.people[0].sheetColumns.Birthday, "06/03/1996");
  state = setPersonContact(state, "per_1", { birthday: "6/3/1996" });
  assert.equal(presentState(state, "2026-09").people[0].birthday, "06/03/1996");
  state = setPersonContact(state, "per_1", { priesthood: "" });
  assert.equal(state.people[0].sheetColumns.Priesthood, undefined);
  assert.equal(state.people[0].sheetColumns.Age, "46");
  state = setPersonContact(state, "per_1", { name: " Sample, Bea " });
  assert.equal(state.people[0].sheetColumns.Brother, "Sample, Bea");
  assert.equal(state.people[0].displayName, "Bea Sample");
  assert.equal(presentState(state, "2026-09").people[0].sheetName, "Sample, Bea");
  assert.equal(state.people[0].notes, "Knock first");
  assert.throws(() => setPersonContact(state, "per_1", { name: "  " }), /name is required/);
  state = setPersonContact(state, "per_1", { assigned: [" Ada Example ", "Bea Sample", "Cal Fixture"] });
  assert.equal(state.people[0].sheetColumns.Assigned, "Ada Example, Bea Sample");
  assert.deepEqual(presentState(state, "2026-09").people[0].assigned, ["Ada Example", "Bea Sample"]);
  assert.equal(state.people[0].phone, "");
  state = setPersonContact(state, "per_1", { assigned: ["Ada, Example", "Bea, Sample"] });
  assert.equal(state.people[0].sheetColumns.Assigned, "Ada, Example | Bea, Sample");
  assert.deepEqual(presentState(state, "2026-09").people[0].assigned, ["Ada, Example", "Bea, Sample"]);
  state = setPersonContact(state, "per_1", { assigned: ["Ada Example", "Ada Example"] });
  assert.equal(state.people[0].sheetColumns.Assigned, "Ada Example");
  state = setPersonContact(state, "per_1", { assigned: [] });
  assert.equal(state.people[0].sheetColumns.Assigned, undefined);
  state = setPersonContact(state, "per_1", { companion: " Companion " });
  assert.equal(state.people[0].sheetColumns.Companion, "Companion");
  state = setPersonContact(state, "per_1", { companion: "" });
  assert.equal(state.people[0].sheetColumns.Companion, undefined);
});

test("moved, mission, do not contact, not interested, no contact info, declined, and visited are archive statuses", () => {
  for (const label of ["Moved", "Mission", "Do Not Contact", "Not Interested", "No Contact Info", "Declined", "Visited"]) {
    assert.equal(isArchiveStatus(label), true);
    assert.equal(canonicalRosterStatus(label), label);
  }
  assert.equal(isArchiveStatus("Reach Out"), false);
  assert.equal(isArchiveStatus("Re-Schedule"), false);
  assert.equal(isArchiveStatus("Scheduled"), false);
  assert.equal(rosterStatusKey("Re-Schedule, Visited"), "visited");
  assert.equal(isArchiveStatus("Re-Schedule, Visited"), true);
  let state = emptyState();
  state = {
    ...state,
    people: [{ id: "per_1", displayName: "Ada Example", phone: "", email: "", household: "", notes: "", sheetColumns: {}, createdAt: "2026-09-29T12:00:00.000Z", updatedAt: "2026-09-29T12:00:00.000Z" }],
  };
  state = setPersonStatus(state, "per_1", "Mission");
  assert.equal(state.people[0].sheetColumns.Status, "Mission");
  assert.equal(presentState(state, "2026-09").people[0].rosterStatusKey, "mission");
  assert.equal(presentState(state, "2026-09").people[0].onMission, true);
  state = setPersonStatus(state, "per_1", "Visited");
  assert.equal(state.people[0].sheetColumns.Status, "Visited");
  assert.equal(state.people[0].sheetColumns["On Mission"], "Yes");
  const both = presentState(state, "2026-09").people[0];
  assert.equal(both.rosterStatusKey, "visited");
  assert.equal(both.onMission, true);
  state = setPersonStatus(state, "per_1", "Visited", { mission: false });
  assert.equal(state.people[0].sheetColumns.Status, "Visited");
  assert.equal(state.people[0].sheetColumns["On Mission"], undefined);
  assert.equal(presentState(state, "2026-09").people[0].onMission, false);
});

test("comments attach to a person or a visit", () => {
  let state = emptyState();
  state = {
    ...state,
    people: [{ id: "per_1", displayName: "Ada Example", phone: "", email: "", household: "", notes: "", sheetColumns: {}, createdAt: "2026-09-29T12:00:00.000Z", updatedAt: "2026-09-29T12:00:00.000Z" }],
  };
  state = scheduleVisit(state, { personId: "per_1", replyChannel: "email", date: "2026-09-06", slotKey: "sun-before" }, deps());
  state = addComment(state, { targetType: "person", targetId: "per_1", authorName: "Tyler Sanders", body: "I can host." }, deps());
  state = addComment(state, { targetType: "visit", targetId: state.visits[0].id, authorName: "Brad Conger", body: "I will be there after church." }, deps());
  assert.equal(state.comments.length, 2);
  state = addComment(state, { targetType: "person", targetId: "per_1", body: "See @Tyler Sanders" }, deps());
  assert.equal(state.comments[2].authorName, "");
  assert.equal(state.comments[2].body, "See @Tyler Sanders");
  state = setPersonStatus(state, "per_1", "Reach Out");
  assert.equal(state.people[0].sheetColumns.Status, "Reach Out");
  state = setPersonStatus(state, "per_1", "");
  assert.equal(state.people[0].sheetColumns.Status, undefined);
  assert.throws(() => addComment(state, { targetType: "person", targetId: "missing", authorName: "Josh Owens", body: "Hello" }, deps()), /not found/);
});

test("a mention needs a response or a resolve, and a comment can be corrected", () => {
  let state = emptyState();
  state = {
    ...state,
    people: [{ id: "per_1", displayName: "Ada Example", phone: "555-0100", email: "ada@example.com", household: "", notes: "", sheetColumns: { Brother: "Example, Ada" }, createdAt: "2026-09-29T12:00:00.000Z", updatedAt: "2026-09-29T12:00:00.000Z" }],
  };
  assert.deepEqual(mentionedMembers("@Tyler How many?", activePresidency(state)), ["Tyler Sanders"]);
  state = addComment(state, { targetType: "person", targetId: "per_1", body: "@Tyler How many?" }, deps());
  const question = state.comments[0];
  assert.equal(openMessages(state).length, 1);
  state = updateComment(state, question.id, { body: "@Tyler Sanders How many June bugs?" }, deps());
  assert.equal(state.comments[0].body, "@Tyler Sanders How many June bugs?");
  assert.equal(openMessages(state)[0].id, question.id);

  let view = presentState(state, "2026-09");
  assert.equal(view.openMessages.length, 1);
  assert.equal(view.openMessages[0].personName, "Example, Ada");
  assert.equal(view.openMessages[0].mentions[0], "Tyler Sanders");
  assert.equal(JSON.stringify(view.openMessages).includes("555-0100"), false);
  assert.equal(JSON.stringify(view.openMessages).includes("ada@example.com"), false);

  state = addComment(state, { parentId: question.id, body: "Plenty." }, deps());
  assert.equal(openMessages(state).length, 0);

  state = addComment(state, { targetType: "person", targetId: "per_1", body: "@Josh Owens Can you check?" }, deps());
  state = resolveComment(state, state.comments[2].id, deps());
  assert.equal(openMessages(state).length, 0);
  view = presentState(state, "2026-09");
  assert.equal(view.openMessages.length, 0);
  assert.equal(view.youthOpenMessages.length, 0);
  state = addComment(state, { targetType: "person", targetId: "per_1", body: "@Tyler youth", quorum: "youth" }, { id: (prefix) => `${prefix}_youth`, now: () => "2026-09-30T12:00:00.000Z" });
  view = presentState(state, "2026-09");
  assert.equal(view.openMessages.length, 0);
  assert.equal(view.youthOpenMessages.length, 1);

  const clock = deps();
  let threaded = { ...emptyState(), people: state.people };
  threaded = addComment(threaded, { targetType: "person", targetId: "per_1", body: "@Tyler question" }, clock);
  threaded = addComment(threaded, { parentId: threaded.comments[0].id, body: "Answer" }, clock);
  threaded = addComment(threaded, { targetType: "person", targetId: "per_1", body: "Keep me" }, clock);
  threaded = deleteComment(threaded, threaded.comments[0].id);
  assert.deepEqual(threaded.comments.map((comment) => comment.body), ["Keep me"]);
});

test("csv import keeps extra columns and does not invent blank rows", () => {
  const csv = [
    "Name,Phone,Email,Calling,Notes",
    `"Ada Example","CONTACT-TOKEN-PHONE","ada@example.com","Teacher","Left a message"`,
    ",,,,",
    "Bea Example,,,Secretary,",
  ].join("\n");
  const parsed = parseCsv(csv);
  assert.deepEqual(suggestMapping(parsed.headers).name, "Name");
  const preview = previewImport(parsed);
  assert.equal(preview.rowCount, 2);
  assert.equal(JSON.stringify(preview).includes("CONTACT-TOKEN-PHONE"), false);
  assert.equal(JSON.stringify(preview).includes("ada@example.com"), false);
  assert.deepEqual(preview.privateHeaders, ["Phone", "Email"]);
  assert.equal(preview.nonEmptyCounts.Calling, 2);

  const imported = importRows(emptyState(), {
    fileName: "outreach.csv",
    headers: parsed.headers,
    rows: parsed.rows,
    kind: "people",
    mapping: preview.suggestedMapping,
  }, deps());
  assert.equal(imported.imported, 2);
  assert.equal(imported.skipped.length, 0);
  assert.equal(imported.state.people[0].sheetColumns.Calling, "Teacher");
  assert.equal(imported.state.people[1].displayName, "Bea Example");
  assert.equal(imported.state.people[1].phone, "");

  const view = presentState(imported.state, "2026-09");
  assert.equal(JSON.stringify(view).includes("CONTACT-TOKEN-PHONE"), false);
  assert.equal(view.people[0].phoneOnFile, true);
  assert.equal(view.people[0].privateColumns.includes("Phone"), true);
  const revealed = presentState(imported.state, "2026-09", { includePrivate: true });
  assert.equal(revealed.people[0].phone, "CONTACT-TOKEN-PHONE");
});

test("a Not Contacted row stays in the not-contacted list", () => {
  const parsed = parseCsv("Name,Channel,Date,Status\nAda Example,Text,9/1/2026,Not Contacted\nBea Example,Text,9/2/2026,Contacted\n");
  const imported = importRows(emptyState(), {
    headers: parsed.headers,
    rows: parsed.rows,
    kind: "people",
    mapping: suggestMapping(parsed.headers),
  }, deps());
  const view = presentState(imported.state, "2026-09");
  const ada = view.people.find((person) => person.displayName === "Ada Example");
  const bea = view.people.find((person) => person.displayName === "Bea Example");
  assert.equal(ada.outreachStatus, "not_contacted");
  assert.equal(bea.outreachStatus, "awaiting_reply");
  assert.equal(imported.state.outreachAttempts.filter((attempt) => attempt.personId === ada.id).length, 0);

  const createdAt = "2026-09-01T00:00:00.000Z";
  const legacyPerson = {
    id: "per_legacy",
    displayName: "Legacy Example",
    phone: "",
    email: "",
    household: "",
    notes: "",
    sheetColumns: { Status: "Not Contacted" },
    createdAt,
    updatedAt: createdAt,
  };
  const legacyAttempts = [{
    id: "out_legacy",
    personId: legacyPerson.id,
    channel: "text",
    date: "2026-09-01",
    status: "contacted",
    notes: "",
    sheetColumns: {},
    createdAt,
  }];
  assert.equal(personOutreachStatus(legacyPerson.id, legacyAttempts, [], legacyPerson), "not_contacted");
});

test("a people row with a channel and date also becomes an outreach attempt", () => {
  const parsed = parseCsv("Name,Channel,Date,Status\nAda Example,Text,9/2/2026,No reply\n");
  const imported = importRows(emptyState(), {
    headers: parsed.headers,
    rows: parsed.rows,
    kind: "people",
    mapping: suggestMapping(parsed.headers),
  }, deps());
  assert.equal(imported.state.outreachAttempts[0].channel, "text");
  assert.equal(imported.state.outreachAttempts[0].date, "2026-09-02");
  assert.equal(imported.state.outreachAttempts[0].status, "no_reply");
  assert.equal(personOutreachStatus(imported.state.people[0].id, imported.state.outreachAttempts, []), "awaiting_reply");
});

test("a brother sheet keeps names filterable and hides contact details", () => {
  const sheet = [
    "Brother\tApt Date\tNOTES\tStatus\tPriesthood\tAge\tBirthday\tPhone Number\tEmail\tName\tDay\tType\tName\tDay\tType\tColumn 20\tColumn 21",
    "Example, Ada\t07/03 5:30 PM\tPrefers a text\tVisited\tElder\t40\t1 Jan 1986\t555-0100\tada@example.com\tJO\t06/02\tText\tDE\tMay 2026\t\t08/28\tText",
    "Sample, Bea\t\tNo number on file\tReach Out\tPriest\t22\t2 Feb 2004\tNo Phone\tNo Email\tJO\t09/29\tDriveby",
  ].join("\n");
  const state = brotherSheetToState(sheet, deps());
  assert.equal(state.people.length, 2);
  assert.equal(state.people[0].displayName, "Ada Example");
  assert.equal(state.people[0].phone, "555-0100");
  assert.equal(state.people[0].sheetColumns.Status, "Visited");
  assert.equal(state.people[0].sheetColumns["Phone Number"], undefined);
  assert.equal(state.outreachAttempts.filter((attempt) => attempt.personId === state.people[0].id).length, 3);
  assert.equal(state.outreachAttempts.some((attempt) => attempt.channel === "driveby"), true);
  assert.equal(state.people[1].phone, "");
  assert.equal(state.people[1].email, "");
  assert.match(state.people[1].notes, /No number on file/);

  const view = presentState(state, "2026-09");
  assert.equal(view.rosterMode, true);
  assert.equal(view.people[0].rosterStatusKey, "visited");
  assert.equal(view.people[0].priesthood, "Elder");
  assert.equal(view.people[0].birthday, "01/01/1986");
  assert.equal(view.people[0].appointment, "07/03 5:30 PM");
  assert.equal(view.people[0].phone, "");
  assert.equal(view.people[0].email, "");
  assert.equal(view.people[1].rosterStatus, "Reach Out");
  assert.equal(rosterStatusKey("Re-Schedule, Visited"), "visited");
  assert.equal(canonicalRosterStatus("Re-Schedule, Visited"), "Visited");
  const revealed = presentState(state, "2026-09", { includePrivate: true });
  assert.equal(revealed.people[0].phone, "555-0100");
  assert.equal(JSON.stringify(view).includes("555-0100"), false);
  assert.equal(JSON.stringify(view).includes("ada@example.com"), false);
});

test("calendar marks scheduled days and reach-out days", () => {
  const marks = calendarMarks({
    people: [
      { id: "ada", rosterStatusKey: "scheduled", appointment: "10/21 7:00 PM" },
      { id: "bea", rosterStatusKey: "visited", appointment: "07/03 5:30 PM" },
      { id: "cy", rosterStatusKey: "reach_out" },
      { id: "dee", rosterStatusKey: "none" },
    ],
    outreachAttempts: [
      { personId: "cy", date: "2026-09-29" },
      { personId: "cy", date: "2026-09-29" },
      { personId: "dee", date: "2026-09-10" },
      { personId: "ada", date: "2026-10-21" },
    ],
    visits: [
      { personId: "eve", date: "2026-09-16", status: "scheduled" },
      { personId: "finn", date: "2026-09-02", status: "completed" },
    ],
  });
  assert.deepEqual(marks["2026-10-21"], { kinds: ["scheduled"], people: ["ada"] });
  assert.equal(marks["2026-07-03"], undefined);
  assert.deepEqual(marks["2026-09-29"], { kinds: ["reach_out"], people: ["cy"] });
  assert.equal(marks["2026-09-10"], undefined);
  assert.deepEqual(marks["2026-09-16"], { kinds: ["scheduled"], people: ["eve"] });
  assert.equal(marks["2026-09-02"], undefined);

  const sheet = [
    "Brother\tApt Date\tNOTES\tStatus\tPriesthood\tAge\tBirthday\tPhone Number\tEmail\tName\tDay\tType",
    "Example, Ada\t10/21 7:00 PM\t\tScheduled\tElder\t40\t1 Jan 1986\t\t\tJO\t09/29\tText",
    "Sample, Bea\t\t\tReach Out\tPriest\t22\t2 Feb 2004\t\t\tJO\t09/10\tText",
  ].join("\n");
  const view = presentState(brotherSheetToState(sheet, deps()), "2026-09");
  assert.deepEqual(view.calendarMarks["2026-10-21"], { kinds: ["scheduled"], people: [view.people[0].id] });
  assert.equal(view.calendarMarks["2026-09-29"], undefined);
  assert.deepEqual(view.calendarMarks["2026-09-10"], { kinds: ["reach_out"], people: [view.people[1].id] });
});

test("an outreach row records a presidency member, how they reached out, and the date", () => {
  let state = emptyState();
  state = {
    ...state,
    people: [{ id: "per_1", displayName: "Ada Example", phone: "", email: "", household: "", notes: "", sheetColumns: {}, createdAt: "2026-09-29T12:00:00.000Z", updatedAt: "2026-09-29T12:00:00.000Z" }],
  };
  const clock = deps();
  state = logOutreach(state, {
    personId: "per_1",
    channel: "in_person",
    date: "2026-09-29",
    status: "contacted",
    by: "Josh Owens",
  }, clock);
  assert.equal(state.outreachAttempts[0].channel, "in_person");
  assert.equal(state.outreachAttempts[0].date, "2026-09-29");
  assert.equal(state.outreachAttempts[0].sheetColumns.By, "Josh Owens");
  state = logOutreach(state, {
    personId: "per_1",
    channel: "text",
    date: "2026-08-28",
    status: "contacted",
  }, clock);
  assert.equal(state.outreachAttempts[1].channel, "text");
  assert.equal(state.outreachAttempts[1].date, "2026-08-28");
  assert.equal(state.outreachAttempts[1].sheetColumns.By, undefined);
  const edited = updateOutreach(state, state.outreachAttempts[0].id, { by: "Tyler Sanders", channel: "phone", date: "2026-09-30" });
  assert.equal(edited.outreachAttempts[0].sheetColumns.By, "Tyler Sanders");
  assert.equal(edited.outreachAttempts[0].channel, "phone");
  assert.equal(edited.outreachAttempts[0].date, "2026-09-30");
  const cleared = updateOutreach(edited, edited.outreachAttempts[0].id, { by: "", channel: "text", date: "9/1/2026" });
  assert.equal(cleared.outreachAttempts[0].sheetColumns.By, undefined);
  const kept = cleared.outreachAttempts[1];
  const removed = removeOutreach(cleared, cleared.outreachAttempts[0].id);
  assert.equal(removed.outreachAttempts.length, 1);
  assert.equal(removed.outreachAttempts[0].id, kept.id);
  assert.equal(removed.people[0].displayName, "Ada Example");
  assert.throws(() => removeOutreach(removed, "missing"), /Outreach row not found/);
  assert.equal(cleared.outreachAttempts[0].date, "2026-09-01");
  assert.throws(() => logOutreach(state, {
    personId: "per_1",
    channel: "phone",
    date: "0002-08-10",
    status: "contacted",
  }, clock), /Outreach date/);

  state = setPresidency(state, [
    { name: "Mark Lillenberg", role: "changed" },
    { name: "Tyler Sanders" },
    { name: "Brad Conger" },
    { name: "Ada Example" },
    { name: "Harrison Bardo" },
  ]);
  const view = presentState(state, "2026-09");
  assert.deepEqual(view.presidency.map((member) => member.role), [
    "President",
    "1st Counselor",
    "2nd Counselor",
    "Secretary",
    "Asst. Secretary",
  ]);
  assert.equal(view.presidency[3].name, "Ada Example");
  assert.equal(view.presidency[0].phone, "");
  assert.equal(view.presidency[0].email, "");
  assert.equal(view.presidency.length, 5);
  state = setPresidency(state, view.presidency.map((member, index) => (
    index === 0 ? { ...member, phone: "555-0101", email: "ada@example.com" } : member
  )));
  assert.equal(presentState(state, "2026-09").presidency[0].phone, "555-0101");
  assert.equal(presentState(state, "2026-09").presidency[0].email, "ada@example.com");
  const withPhone = presentState(state, "2026-09");
  state = setPresidency(state, withPhone.presidency.map((member, index) => (
    index === 4 ? { ...member, phone: "5550101999" } : member
  )));
  assert.equal(presentState(state, "2026-09").presidency[4].phone, "(555) 010-1999");
  assert.equal(presentState(state, "2026-09").presidency[0].email, "ada@example.com");
  state = setPersonContact(state, "per_1", { phone: "1 (555) 010-2000" });
  assert.equal(state.people[0].phone, "(555) 010-2000");
  assert.equal(presentState(state, "2026-09").presidency[1].phone, "");

  const migrated = activePresidency({
    presidency: [
      { name: "Mark Lillenberg", role: "EQ President" },
      { name: "Tyler Sanders", role: "EQ Counselor" },
      { name: "Brad Conger", role: "EQ Counselor" },
      { name: "Josh Owens", role: "EQ Assistant Secretary" },
      { name: "Harrison Bardo", role: "EQ Secretary" },
    ],
  });
  assert.deepEqual(migrated.map((member) => `${member.role}: ${member.name}`), [
    "President: Mark Lillenberg",
    "1st Counselor: Tyler Sanders",
    "2nd Counselor: Brad Conger",
    "Secretary: Harrison Bardo",
    "Asst. Secretary: Josh Owens",
  ]);
});

test("an assignment card keeps the household and address", () => {
  const ids = deps();
  let state = emptyState();
  state = addPerson(state, { displayName: "Guest, Cam", list: "youth", sheetColumns: { Brother: "Guest, Cam" } }, ids);
  state = setPersonContact(state, "per_1", {
    phone: "555-0100",
    email: "cam@example.com",
    household: "Cam\nAda",
    address: "1 Main St\nTown WA 98607",
  });
  const person = state.people[0];
  assert.equal(person.phone, "555-0100");
  assert.equal(person.email, "cam@example.com");
  assert.equal(person.household, "Cam\nAda");
  assert.equal(person.sheetColumns["Household Members"], "Cam\nAda");
  assert.equal(person.sheetColumns.Address, "1 Main St\nTown WA 98607");
});

test("a youth ministry meeting and a family visit mark the calendar", () => {
  const ids = deps();
  let state = emptyState();
  state = addPerson(state, { displayName: "Example, Ada", group: "priests", sheetColumns: { Brother: "Example, Ada" } }, ids);
  state = addPerson(state, { displayName: "Guest, Cam", list: "youth", sheetColumns: { Brother: "Guest, Cam", Assigned: "Example, Ada" } }, ids);
  state = setPersonContact(state, "per_1", { meetingDate: { date: "2026-10-21", time: "19:00" }, companion: "Sample, Bea" });
  state = setPersonContact(state, "per_2", { response: "Responded", visitDate: { date: "2026-10-22", time: "18:30" } });
  assert.equal(state.people[0].sheetColumns["Meeting Date"], "10/21 7:00 PM");
  assert.equal(state.people[0].sheetColumns.Companion, "Sample, Bea");
  assert.equal(state.people[1].sheetColumns.Response, "Responded");
  assert.equal(state.people[1].sheetColumns["Visit Date"], "10/22 6:30 PM");
  const marks = presentState(state, "2026-10").calendarMarks;
  assert.deepEqual(marks["2026-10-21"], { kinds: ["scheduled"], people: ["per_1"] });
  assert.deepEqual(marks["2026-10-22"], { kinds: ["scheduled"], people: ["per_2"] });
  state = setPersonContact(state, "per_2", { response: "" });
  assert.equal(state.people[1].sheetColumns.Response, undefined);
});

test("removing a youth assignment deletes that household", () => {
  const ids = deps();
  let state = emptyState();
  state = addPerson(state, { displayName: "Example, Ada", group: "priests", sheetColumns: { Brother: "Example, Ada" } }, ids);
  state = addPerson(state, { displayName: "Guest, Cam", list: "youth", sheetColumns: { Brother: "Guest, Cam", Assigned: "Example, Ada" } }, ids);
  const removed = removePerson(state, "per_2");
  assert.equal(removed.people.map((person) => person.id).join(","), "per_1");
  assert.throws(() => removePerson(removed, "per_1"), /youth assignment/);
});

test("a youth member keeps a quorum and a blank leadership name", async () => {
  let state = emptyState();
  state = addPerson(state, {
    displayName: "Example, Ada",
    phone: "555-0101",
    email: "ada@example.com",
    group: "priests",
    sheetColumns: { Brother: "Example, Ada", Birthday: "14 Mar 2010", Priesthood: "Priest" },
  }, deps());
  state = addPerson(state, {
    displayName: "Sample, Bea",
    group: "teachers",
    sheetColumns: { Brother: "Sample, Bea", Birthday: "4 Oct 2011", Priesthood: "Teacher" },
  }, deps());
  state = setYouthLeadership(state, {
    priests: [
      { name: "Sample, Bea", phone: "555-0102", email: "bea@example.com" },
      { name: "Example, Ada" },
    ],
    teachers: [{ name: "Sample, Bea" }],
  });
  assert.equal(state.people[0].group, "priests");
  state = addPerson(state, { displayName: "Guest, Cam", list: "youth", sheetColumns: { Brother: "Guest, Cam" } }, deps());
  assert.equal(state.people[1].group, "teachers");
  assert.equal(state.people.find((person) => person.displayName === "Guest, Cam").list, "youth");
  assert.equal(state.people.find((person) => person.displayName === "Guest, Cam").group, undefined);
  assert.equal(state.youthLeadership.priests.length, 7);
  assert.equal(state.youthLeadership.teachers.length, 6);
  assert.equal(state.youthLeadership.priests[4].name, "");
  assert.equal(state.youthLeadership.teachers[5].name, "");
  const view = presentState(state, "2026-10", { includePrivate: true });
  const priests = view.people.filter((person) => person.group === "priests");
  assert.equal(priests.length, 1);
  assert.equal(priests[0].sheetName, "Example, Ada");
  assert.equal(priests[0].birthday, "03/14/2010");
  assert.equal(priests[0].rosterStatus, "");
  assert.equal(priests[0].phone, "555-0101");
  assert.equal(view.youthLeadership.priests[0].name, "Sample, Bea");
  assert.equal(view.youthLeadership.priests[4].role, "Adviser");
  assert.equal(view.youthLeadership.teachers[5].role, "Specialist");
  const directory = await mkdtemp(path.join(tmpdir(), "portal-youth-"));
  const store = createStore(path.join(directory, "portal.json"));
  await store.update(() => state);
  const saved = await store.read();
  assert.equal(saved.youthLeadership.priests[4].name, "");
  assert.equal(saved.people.filter((person) => person.group === "teachers").length, 1);
  assert.equal(JSON.stringify(saved).includes("555-0101"), true);
});

test("the fresh portal and the csv template contain no member rows", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "portal-"));
  const store = createStore(path.join(directory, "portal.json"));
  assert.equal((await store.read()).people.length, 0);
  const template = await readFile(new URL("../templates/outreach-import-template.csv", import.meta.url), "utf8");
  assert.deepEqual(template.trim().split(/\r?\n/), ["Name,Phone,Email,Household,Notes"]);
  const ignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(ignore, /data\/\*\.json/);
});

test("http api schedules a visit and hides contact details by default", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "portal-"));
  const server = createPortalServer(createStore(path.join(directory, "portal.json")));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/api/health`);
    assert.equal((await health.json()).ok, true);

    const created = await fetch(`${base}/api/people`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Ada Example", phone: "CONTACT-TOKEN-PHONE", email: "ada@example.com", month: "2026-09" }),
    });
    assert.equal(created.status, 201);
    const hidden = await created.json();
    assert.equal(JSON.stringify(hidden).includes("CONTACT-TOKEN-PHONE"), false);
    const personId = hidden.people[0].id;

    const scheduled = await fetch(`${base}/api/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personId,
        replyChannel: "phone",
        replyDate: "2026-09-29",
        date: "2026-09-30",
        slotKey: "wed-1900",
        month: "2026-09",
      }),
    });
    const body = await scheduled.json();
    assert.equal(scheduled.status, 201);
    assert.equal(body.visits[0].calendar.name, "Elders Quorum Calendar");
    assert.equal(body.visits[0].calendar.intendedFor.length, 5);
    assert.equal(body.slots.find((slot) => slot.slotKey === "wed-1900" && slot.date === "2026-09-30").status, "scheduled");

    const comment = await fetch(`${base}/api/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetType: "visit", targetId: body.visits[0].id, authorName: "Harrison Bardo", body: "On my calendar too.", month: "2026-09" }),
    });
    assert.equal(comment.status, 201);

    const page = await fetch(`${base}/`);
    assert.match(await page.text(), /Ministering visits/);
    const favicon = await fetch(`${base}/favicon.ico`);
    assert.equal(favicon.status, 204);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a member directory list fills an assignment card and keeps a brother phone", async () => {
  const text = `Name
Household Members\tAddress\tPhone Number\tE-mail

Example, Ana & Ben\t
Ana
Ben
10 Example St
Town WA 98607
(360) 555-0100\tana@example.com

Sample, Cam\t
Cam
Out-of-Unit
20 Other Ave
Apt 2
Town WA 98607
555-0199\t

Child, Dee\t
Dee
10 Example St
Town WA 98607
`;
  const records = parseDirectory(text);
  assert.equal(records.length, 3);
  assert.deepEqual(records[0].members, ["Ana", "Ben"]);
  assert.equal(records[0].address, "10 Example St\nTown WA 98607");
  assert.equal(records[0].phone, "(360) 555-0100");
  assert.equal(records[0].email, "ana@example.com");
  assert.deepEqual(records[1].members, ["Cam (Out-of-Unit)"]);
  assert.equal(records[1].phone, "555-0199");
  assert.equal(records[1].address.includes("Apt 2"), true);
  assert.equal(findDirectoryRecord("Example, Ana", records).name, "Example, Ana & Ben");
  assert.equal(findDirectoryRecord("Dee", records), null);

  const state = applyDirectory({
    people: [
      {
        id: "per_assignment",
        list: "youth",
        displayName: "Ana Example",
        phone: "",
        email: "",
        household: "",
        sheetColumns: { Brother: "Example, Ana & Ben" },
      },
      {
        id: "per_brother",
        displayName: "Ana Example",
        phone: "(360) 555-2222",
        email: "kept@example.com",
        household: "",
        sheetColumns: { Brother: "Example, Ana", Address: "Sheet address" },
      },
    ],
  }, records);
  const assignment = state.people.find((person) => person.id === "per_assignment");
  const brother = state.people.find((person) => person.id === "per_brother");
  assert.equal(assignment.household, "Ana\nBen");
  assert.equal(assignment.sheetColumns.Address, "10 Example St\nTown WA 98607");
  assert.equal(assignment.phone, "(360) 555-0100");
  assert.equal(assignment.email, "ana@example.com");
  assert.equal(brother.household, "Ana\nBen");
  assert.equal(brother.phone, "(360) 555-2222");
  assert.equal(brother.email, "kept@example.com");
  assert.equal(brother.sheetColumns.Address, "Sheet address");
  assert.equal(state.directory.length, 3);

  const hidden = presentState({ ...emptyState(), directory: state.directory, people: [] }, "2026-10", { includePrivate: false });
  assert.equal(hidden.directory[0].phone, "");
  assert.equal(hidden.directory[0].email, "");
  assert.equal(hidden.directory[0].address, "");
  assert.deepEqual(hidden.directory[0].members, ["Ana", "Ben"]);
  const shown = presentState({ ...emptyState(), directory: state.directory, people: [] }, "2026-10", { includePrivate: true });
  assert.equal(shown.directory[0].phone, "(360) 555-0100");

  const linked = {
    ...emptyState(),
    directory: [{
      id: "dir_1",
      name: "Example, Ana & Ben",
      members: ["Ana", "Ben"],
      address: "10 Example St",
      phone: "(360) 555-0100",
      email: "ana@example.com",
    }],
    people: [{
      id: "per_youth",
      group: "priests",
      displayName: "Ana Example",
      phone: "",
      email: "",
      household: "",
      sheetColumns: { Brother: "Example, Ana" },
    }],
  };
  const withCompanion = setDirectoryCompanion(linked, { directoryId: "dir_1", member: "Ana", companion: "Example, Ben" });
  assert.equal(withCompanion.directory[0].memberCompanions.ana, "Example, Ben");
  assert.equal(withCompanion.people[0].sheetColumns.Companion, "Example, Ben");
  const assigned = assignDirectoryHousehold(withCompanion, { directoryId: "dir_1", youth: "Example, Ana", companion: "Example, Ben" }, deps());
  const visits = assigned.people.filter((person) => person.list === "youth");
  assert.equal(visits.length, 1);
  assert.equal(visits[0].sheetColumns.Brother, "Example, Ana & Ben");
  assert.equal(visits[0].sheetColumns.Assigned, "Example, Ana | Example, Ben");
  assert.equal(visits[0].phone, "(360) 555-0100");
  assert.equal(visits[0].sheetColumns.Address, "10 Example St");
  const again = assignDirectoryHousehold(assigned, { directoryId: "dir_1", youth: "Example, Ana", companion: "Example, Cam" }, deps());
  const still = again.people.filter((person) => person.list === "youth");
  assert.equal(still.length, 1);
  assert.equal(still[0].sheetColumns.Assigned, "Example, Ana | Example, Cam");
  assert.equal(still[0].phone, "(360) 555-0100");
  const kept = applyDirectory(withCompanion, [{ name: "Example, Ana & Ben", members: ["Ana"], address: "10 Example St", phone: "(360) 555-0100", email: "ana@example.com" }]);
  assert.equal(kept.directory[0].memberCompanions.ana, "Example, Ben");
  const edited = updateDirectoryHousehold(withCompanion, {
    directoryId: "dir_1",
    name: "Example, Ana & Ben",
    members: "Example, Ana\nExample, Ben",
    address: "11 Example St",
    phone: "(360) 555-0100",
    email: "ana@example.com",
  });
  assert.equal(edited.directory[0].members.join("|"), "Ana|Ben");
  assert.equal(edited.directory[0].memberCompanions.ana, "Example, Ben");
  assert.equal(edited.directory[0].address, "11 Example St");
  assert.equal(edited.people.length, withCompanion.people.length);

  const folder = await mkdtemp(path.join(tmpdir(), "portal-directory-"));
  const store = createStore(path.join(folder, "portal.json"));
  await store.update(() => ({ ...emptyState(), ...state }));
  const saved = await store.read();
  assert.equal(saved.directory.length, 3);
  assert.equal(saved.people.find((person) => person.id === "per_brother").phone, "(360) 555-2222");

  const server = createPortalServer(store);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/directory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, includePrivate: true, month: "2026-10" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.directory.length, 3);
    assert.equal(body.directory[0].phone, "(360) 555-0100");
    const brother = body.people.find((person) => person.id === "per_brother");
    assert.equal(brother.phone, "(360) 555-2222");
    assert.equal(brother.household, "Ana\nBen");
    assert.equal(brother.sheetColumns.Address, "Sheet address");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("moving a directory person keeps both households and their companions", () => {
  const state = {
    ...emptyState(),
    directory: [
      {
        id: "dir_1",
        name: "Example, Ana & Ben",
        members: ["Ana", "Ben"],
        address: "10 Example St",
        phone: "(360) 555-0100",
        email: "ana@example.com",
        memberCompanions: { ana: "Example, Cam", ben: "Example, Dee" },
      },
      {
        id: "dir_2",
        name: "Sample, Cam",
        members: ["Cam"],
        address: "20 Other Ave",
        phone: "",
        email: "",
        memberCompanions: {},
      },
    ],
    people: [{ id: "per_1", displayName: "Keep" }],
  };
  const moved = moveDirectoryPerson(state, { directoryId: "dir_1", member: "Ben", householdId: "dir_2" });
  assert.deepEqual(moved.directory[0].members, ["Ana"]);
  assert.equal(moved.directory[0].address, "10 Example St");
  assert.equal(moved.directory[0].phone, "(360) 555-0100");
  assert.equal(moved.directory[0].memberCompanions.ana, "Example, Cam");
  assert.equal(moved.directory[0].memberCompanions.ben, undefined);
  assert.deepEqual(moved.directory[1].members, ["Cam", "Ben"]);
  assert.equal(moved.directory[1].address, "20 Other Ave");
  assert.equal(moved.directory[1].memberCompanions.ben, "Example, Dee");
  assert.equal(moved.people.length, 1);
  assert.equal(moved.people[0].displayName, "Keep");
  const joined = moveDirectoryPerson(moved, { directoryId: "dir_1", member: "Ana", householdId: "dir_2" });
  assert.equal(joined.directory.length, 1);
  assert.deepEqual(joined.directory[0].members, ["Cam", "Ben", "Ana"]);
  assert.equal(joined.directory[0].address, "20 Other Ave");
  assert.equal(joined.people[0].displayName, "Keep");
});

test("a directory member can be added or removed without touching the roster", () => {
  const state = {
    ...emptyState(),
    directory: [{
      id: "dir_1",
      name: "Example, Ana & Ben",
      members: ["Ana", "Ben"],
      address: "10 Example St",
      phone: "(360) 555-0100",
      email: "ana@example.com",
      memberCompanions: { ana: "Example, Cam" },
    }],
    people: [{ id: "per_1", displayName: "Keep" }],
  };
  const added = addDirectoryMember(state, { name: "Example, Dee", householdId: "dir_1" }, { id: () => "dir_new" });
  assert.deepEqual(added.directory[0].members, ["Ana", "Ben", "Dee"]);
  assert.equal(added.directory[0].address, "10 Example St");
  assert.equal(added.directory[0].memberCompanions.ana, "Example, Cam");
  assert.equal(added.people.length, 1);
  const created = addDirectoryMember(state, { name: "Sample, Cam", householdName: "Sample, Cam" }, { id: () => "dir_new" });
  assert.equal(created.directory.length, 2);
  assert.equal(created.directory[1].id, "dir_new");
  assert.deepEqual(created.directory[1].members, ["Cam"]);
  assert.equal(created.directory[0].members.join("|"), "Ana|Ben");
  const filled = addDirectoryMember(state, {
    name: "Sample, Cam",
    householdName: "Sample, Cam",
    address: "9 New St",
    phone: "3605550199",
    email: "cam@example.com",
    companion: "Example, Ana",
    visitHouseholdId: "dir_1",
  }, { id: () => "dir_new" });
  assert.equal(filled.directory[1].address, "9 New St");
  assert.equal(filled.directory[1].phone, "(360) 555-0199");
  assert.equal(filled.directory[1].email, "cam@example.com");
  assert.equal(filled.directory[1].memberCompanions.cam, "Example, Ana");
  assert.deepEqual(filled.directory[1].memberVisits.cam, [{ directoryId: "dir_1", label: "Example, Ana & Ben" }]);
  assert.equal(filled.directory[0].address, "10 Example St");
  assert.equal(filled.directory[0].phone, "(360) 555-0100");
  assert.equal(filled.people[0].displayName, "Keep");
  const removed = removeDirectoryMember(added, { directoryId: "dir_1", member: "Ben" });
  assert.deepEqual(removed.directory[0].members, ["Ana", "Dee"]);
  assert.equal(removed.directory[0].phone, "(360) 555-0100");
  assert.equal(removed.directory[0].memberCompanions.ana, "Example, Cam");
  assert.equal(removed.people[0].displayName, "Keep");
  const gone = removeDirectoryMember(state, { directoryId: "dir_1", member: "Ana" });
  const last = removeDirectoryMember(gone, { directoryId: "dir_1", member: "Ben" });
  assert.equal(last.directory.length, 0);
  assert.equal(last.people.length, 1);
});

test("people at the same address join that household", () => {
  assert.equal(
    directoryAddressKey("10 Example St\nSample WA 98607"),
    directoryAddressKey("10 Example St\nSample WA 98607-2618"),
  );
  assert.notEqual(
    directoryAddressKey("10 Example St\nApt A107\nSample WA 98607"),
    directoryAddressKey("10 Example St\nApt B-113\nSample WA 98607"),
  );
  const people = [{ id: "per_1", displayName: "Keep" }];
  const state = {
    ...emptyState(),
    people,
    directory: [
      {
        id: "dir_home",
        name: "Sample, Mike & Melinda",
        members: ["Mike", "Melinda"],
        address: "10 Example St\nSample WA 98607",
        phone: "(360) 555-0100",
        email: "home@example.com",
        memberCompanions: { mike: "Example, Ana" },
      },
      {
        id: "dir_jacob",
        name: "Sample, Jacob",
        members: ["Jacob"],
        address: "10 Example St\nSample WA 98607-2618",
        phone: "(360) 555-0199",
        email: "jacob@example.com",
        memberCompanions: { jacob: "Example, Ben" },
      },
      {
        id: "dir_other",
        name: "Other, Cam",
        members: ["Cam"],
        address: "10 Example St\nSample WA 98607",
        phone: "",
        email: "",
        memberCompanions: {},
      },
      {
        id: "dir_a",
        name: "Alone, Ann",
        members: ["Ann"],
        address: "20 Other Ave\nSample WA 98607",
        phone: "(360) 555-0111",
        email: "",
        memberCompanions: {},
      },
      {
        id: "dir_b",
        name: "Alone, Bob",
        members: ["Bob"],
        address: "20 Other Ave\nSample WA 98607",
        phone: "",
        email: "bob@example.com",
        memberCompanions: { bob: "Example, Dee" },
      },
      {
        id: "dir_c",
        name: "Separate, Carl",
        members: ["Carl"],
        address: "20 Other Ave\nSample WA 98607",
        phone: "(360) 555-0122",
        email: "",
        memberCompanions: {},
      },
      {
        id: "dir_left",
        name: "Left, Ada & Ben",
        members: ["Ada", "Ben"],
        address: "30 Shared Ct\nSample WA 98607",
        phone: "(360) 555-0133",
        email: "",
        memberCompanions: {},
      },
      {
        id: "dir_right",
        name: "Right, Cam & Dee",
        members: ["Cam", "Dee"],
        address: "30 Shared Ct\nSample WA 98607",
        phone: "(360) 555-0144",
        email: "",
        memberCompanions: {},
      },
      {
        id: "dir_apt",
        name: "Unit, Amy",
        members: ["Amy"],
        address: "40 Unit Rd\nApt A107\nSample WA 98607",
        phone: "",
        email: "",
        memberCompanions: {},
      },
      {
        id: "dir_apt2",
        name: "Unit, Bea",
        members: ["Bea"],
        address: "40 Unit Rd\nApt B-113\nSample WA 98607",
        phone: "",
        email: "",
        memberCompanions: {},
      },
    ],
  };
  const merged = mergeDirectoryByAddress(state);
  assert.equal(merged.people, people);
  const home = merged.directory.find((row) => row.id === "dir_home");
  assert.deepEqual(home.members, ["Mike", "Melinda", "Jacob", "Other, Cam"]);
  assert.equal(home.phone, "(360) 555-0100");
  assert.equal(home.email, "home@example.com");
  assert.equal(home.address, "10 Example St\nSample WA 98607");
  assert.equal(home.memberCompanions.mike, "Example, Ana");
  assert.equal(home.memberCompanions.jacob, "Example, Ben");
  assert.equal(merged.directory.find((row) => row.id === "dir_jacob"), undefined);
  assert.equal(merged.directory.find((row) => row.id === "dir_other"), undefined);
  const alone = merged.directory.find((row) => row.id === "dir_a");
  assert.equal(alone.name, "Alone, Ann & Bob");
  assert.deepEqual(alone.members, ["Ann", "Bob"]);
  assert.equal(alone.phone, "(360) 555-0111");
  assert.equal(alone.email, "bob@example.com");
  assert.equal(alone.memberCompanions.bob, "Example, Dee");
  assert.equal(merged.directory.find((row) => row.id === "dir_b"), undefined);
  const separate = merged.directory.find((row) => row.id === "dir_c");
  assert.equal(separate.name, "Separate, Carl");
  assert.deepEqual(separate.members, ["Carl"]);
  assert.deepEqual(merged.directory.find((row) => row.id === "dir_left").members, ["Ada", "Ben"]);
  assert.deepEqual(merged.directory.find((row) => row.id === "dir_right").members, ["Cam", "Dee"]);
  assert.equal(merged.directory.find((row) => row.id === "dir_apt").members[0], "Amy");
  assert.equal(merged.directory.find((row) => row.id === "dir_apt2").members[0], "Bea");
});

test("a ministering companionship keeps its companions and assigned households", () => {
  const people = [{ id: "per_1", displayName: "Keep" }];
  const state = {
    ...emptyState(),
    people,
    directory: [
      {
        id: "dir_home",
        name: "Sample, Mike & Melinda",
        members: ["Mike", "Melinda", "Jacob"],
        address: "10 Example St",
        phone: "",
        email: "",
        memberCompanions: {},
      },
      {
        id: "dir_ada",
        name: "Keeper, Ada & Bob",
        members: ["Ada", "Bob", "Cam"],
        address: "20 Other Ave",
        phone: "",
        email: "",
        memberCompanions: {},
      },
      {
        id: "dir_bea",
        name: "Alone, Bea",
        members: ["Bea"],
        address: "30 Side Ln",
        phone: "",
        email: "",
        memberCompanions: {},
      },
    ],
  };
  const trio = applyMinisteringGroups(state, [{
    members: ["Keeper, Ada", "Keeper, Bob", "Keeper, Cam"],
    households: ["Sample, Jacob", "Alone, Bea"],
  }]);
  assert.equal(trio.people, people);
  const keepers = trio.directory.find((row) => row.id === "dir_ada");
  assert.deepEqual(keepers.memberCompanions.ada, ["Keeper, Bob", "Keeper, Cam"]);
  assert.deepEqual(keepers.memberCompanions.bob, ["Keeper, Ada", "Keeper, Cam"]);
  assert.deepEqual(keepers.memberVisits.ada.map((item) => item.label), ["Sample, Jacob", "Alone, Bea"]);
  assert.equal(keepers.memberVisits.ada[0].directoryId, "dir_home");
  assert.equal(keepers.memberVisits.cam[1].directoryId, "dir_bea");
  const pair = applyMinisteringGroups(state, [{
    members: ["Sample, Mike", "Alone, Bea"],
    households: ["Keeper, Ada & Bob"],
  }]);
  const sample = pair.directory.find((row) => row.id === "dir_home");
  assert.equal(sample.memberCompanions.mike, "Alone, Bea");
  assert.equal(sample.memberVisits.mike[0].label, "Keeper, Ada & Bob");
  assert.equal(sample.memberVisits.mike[0].directoryId, "dir_ada");
  const bea = pair.directory.find((row) => row.id === "dir_bea");
  assert.equal(bea.memberCompanions.bea, "Sample, Mike");
  const added = addDirectoryVisit(pair, { directoryId: "dir_bea", member: "Bea", householdId: "dir_home" });
  assert.deepEqual(added.directory.find((row) => row.id === "dir_bea").memberVisits.bea.map((item) => item.label), ["Keeper, Ada & Bob", "Sample, Mike & Melinda"]);
  assert.equal(added.people[0].displayName, "Keep");
});
