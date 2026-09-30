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
  setAppointment,
  setReachOutDate,
  setPersonStatus,
  setPresidency,
  personOutreachStatus,
  previewImport,
  presentState,
  scheduleVisit,
  setVisitStatus,
  slotsForMonth,
} from "../lib/model.js";
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
  state = setAppointment(state, "per_1", { date: "2026-10-21", time: "19:00" });
  assert.equal(state.people[0].sheetColumns["Apt Date"], "10/21 7:00 PM");
  assert.equal(state.people[0].sheetColumns.Status, "Scheduled");
  const view = presentState(state, "2026-10");
  assert.equal(view.people[0].appointment, "10/21 7:00 PM");
  assert.equal(view.people[0].rosterStatusKey, "scheduled");
  assert.deepEqual(view.calendarMarks["2026-10-21"], { kinds: ["scheduled"], people: ["per_1"] });
  state = setAppointment(state, "per_1", { date: "2026-10-21", time: "12:30" });
  assert.equal(state.people[0].sheetColumns["Apt Date"], "10/21 12:30 PM");
  state = setAppointment(state, "per_1", { date: "2026-10-21", time: "00:00" });
  assert.equal(state.people[0].sheetColumns["Apt Date"], "10/21 12:00 AM");
  state = setAppointment(state, "per_1", { date: "10/21/2027", time: "19:00" });
  assert.equal(state.people[0].sheetColumns["Apt Date"], "10/21/2027 7:00 PM");
  assert.deepEqual(presentState(state, "2027-10").calendarMarks["2027-10-21"], { kinds: ["scheduled"], people: ["per_1"] });
  assert.equal(presentState(state, "2026-10").calendarMarks["2026-10-21"], undefined);
  assert.throws(() => setAppointment(state, "per_1", { date: "2026-10-21", time: "7pm" }), /HH:MM/);
  state = setPersonStatus(state, "per_1", "Re-Schedule");
  assert.deepEqual(presentState(state, "2027-10").calendarMarks["2027-10-21"], { kinds: ["reschedule"], people: ["per_1"] });
  state = setAppointment(state, "per_1", { date: "2026-10-20", time: "22:50" });
  assert.equal(state.people[0].sheetColumns.Status, "Re-Schedule");
  assert.equal(state.people[0].sheetColumns["Apt Date"], "10/20 10:50 PM");
  assert.deepEqual(presentState(state, "2026-10").calendarMarks["2026-10-20"], { kinds: ["reschedule"], people: ["per_1"] });
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

test("moved, mission, do not contact, not interested, no contact info, and visited are archive statuses", () => {
  for (const label of ["Moved", "Mission", "Do Not Contact", "Not Interested", "No Contact Info", "Visited"]) {
    assert.equal(isArchiveStatus(label), true);
    assert.equal(canonicalRosterStatus(label), label);
  }
  assert.equal(isArchiveStatus("Reach Out"), false);
  assert.equal(isArchiveStatus("Re-Schedule"), false);
  assert.equal(isArchiveStatus("Declined"), false);
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

test("calendar marks visit days in green and reach-out days in gold", () => {
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
  state = logOutreach(state, {
    personId: "per_1",
    channel: "in_person",
    date: "2026-09-29",
    status: "contacted",
    by: "Josh Owens",
  }, deps());
  assert.equal(state.outreachAttempts[0].channel, "in_person");
  assert.equal(state.outreachAttempts[0].date, "2026-09-29");
  assert.equal(state.outreachAttempts[0].sheetColumns.By, "Josh Owens");
  state = logOutreach(state, {
    personId: "per_1",
    channel: "text",
    date: "2026-08-28",
    status: "contacted",
  }, deps());
  assert.equal(state.outreachAttempts[1].channel, "text");
  assert.equal(state.outreachAttempts[1].date, "2026-08-28");
  assert.equal(state.outreachAttempts[1].sheetColumns.By, undefined);

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
  assert.equal(view.presidency.length, 5);

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
