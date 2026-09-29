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
  addComment,
  emptyState,
  importRows,
  personOutreachStatus,
  previewImport,
  presentState,
  scheduleVisit,
  setVisitStatus,
  slotsForMonth,
} from "../lib/model.js";
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
  assert.throws(() => addComment(state, { targetType: "person", targetId: "missing", authorName: "Josh Owens", body: "Hello" }, deps()), /not found/);
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
