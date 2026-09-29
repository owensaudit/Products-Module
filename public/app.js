const STATUS_LABELS = {
  not_contacted: "Not contacted",
  awaiting_reply: "Awaiting reply",
  replied: "Replied",
  scheduled: "Visit scheduled",
  completed: "Visit complete",
  declined: "Declined",
  reach_out: "Reach Out",
  no_response: "No Response",
  reschedule: "Re-Schedule",
  reschedule_visited: "Re-Schedule, Visited",
  visited: "Visited",
  none: "No status",
};

const ROSTER_STATUS_ORDER = ["reach_out", "no_response", "reschedule", "reschedule_visited", "scheduled", "visited", "declined", "none"];

const WHO = { JO: "Josh Owens" };

const STATUS_ORDER = ["replied", "awaiting_reply", "not_contacted", "scheduled", "completed", "declined"];

const CHANNEL_LABELS = { text: "Text", phone: "Phone", email: "Email", driveby: "Drive-by" };

const app = document.querySelector("#app");
const notice = document.querySelector("#notice");
const monthInput = document.querySelector("#month");
const authorInput = document.querySelector("#author-name");
const revealInput = document.querySelector("#reveal-private");

let state = null;
let view = "people";
let statusFilter = "all";
let officeFilter = "all";
let appointmentFilter = "all";
let search = "";
let selectedPersonId = null;
let selectedSlotId = null;
let detailForm = null;
let importPreview = null;
let importCsv = "";
let importFileName = "";
let importResult = null;

authorInput.value = localStorage.getItem("mvp-author") || "";
revealInput.checked = sessionStorage.getItem("mvp-private") === "1";
monthInput.value = currentMonth();

authorInput.addEventListener("change", () => {
  localStorage.setItem("mvp-author", authorInput.value.trim());
});

revealInput.addEventListener("change", () => {
  sessionStorage.setItem("mvp-private", revealInput.checked ? "1" : "0");
  refresh().catch(showError);
});

monthInput.addEventListener("change", () => {
  selectedSlotId = null;
  refresh().catch(showError);
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.dataset.action === "office") officeFilter = target.value;
  if (target.dataset.action === "appointment") appointmentFilter = target.value;
  if (target.dataset.action === "office" || target.dataset.action === "appointment") {
    view = "people";
    const current = selectedPerson();
    if (current && !personMatchesFilters(current)) selectedPersonId = null;
    render();
  }
});

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "view") {
    view = button.dataset.view;
    detailForm = null;
    render();
  } else if (action === "filter") {
    statusFilter = button.dataset.status;
    search = "";
    view = "people";
    const current = selectedPerson();
    if (current && !personMatchesFilters(current)) selectedPersonId = null;
    render();
    document.querySelector("#people-card")?.scrollIntoView({ block: "start" });
  } else if (action === "select-person") {
    selectedPersonId = button.dataset.id;
    view = "people";
    detailForm = null;
    render();
  } else if (action === "form") {
    detailForm = button.dataset.form;
    render();
  } else if (action === "select-slot") {
    selectedSlotId = button.dataset.id;
    view = "month";
    detailForm = button.dataset.slotStatus === "open" ? "schedule-slot" : "visit";
    render();
  } else if (action === "show-month") {
    view = "month";
    const visit = selectedPerson()?.visits?.find((item) => item.status === "scheduled");
    if (visit) {
      monthInput.value = visit.date.slice(0, 7);
      selectedSlotId = `${visit.date}:${visit.slotKey}`;
      refresh().catch(showError);
      return;
    }
    render();
  } else if (action === "cancel-visit") {
    post(`/api/visits/${button.dataset.id}/cancel`, {}).then(() => render()).catch(showError);
  } else if (action === "complete-visit") {
    post(`/api/visits/${button.dataset.id}/complete`, {}).then(() => render()).catch(showError);
  } else if (action === "reset") {
    if (confirm("Clear everyone, outreach, visits, and comments stored in this portal?")) {
      post("/api/reset", {}).then(() => {
        importPreview = null;
        importCsv = "";
        importResult = null;
        selectedPersonId = null;
        selectedSlotId = null;
        render();
      }).catch(showError);
    }
  }
});

app.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = new FormData(form);
  const kind = form.dataset.form;
  if (kind === "add-person") {
    const known = new Set((state?.people || []).map((person) => person.id));
    post("/api/people", {
      displayName: data.get("displayName"),
      household: data.get("household"),
      phone: data.get("phone"),
      email: data.get("email"),
      notes: data.get("notes"),
    }).then((next) => {
      state = next;
      selectedPersonId = next.people.find((person) => !known.has(person.id))?.id || selectedPersonId;
      detailForm = null;
      render();
    }).catch(showError);
  } else if (kind === "outreach") {
    post("/api/outreach", {
      personId: selectedPersonId,
      channel: data.get("channel"),
      date: data.get("date"),
      status: data.get("status"),
      notes: data.get("notes"),
    }).then(() => {
      detailForm = null;
      render();
    }).catch(showError);
  } else if (kind === "schedule" || kind === "schedule-slot") {
    const slotValue = kind === "schedule-slot" ? selectedSlotId : data.get("slot");
    const [date, slotKey] = String(slotValue || "").split(":");
    post("/api/schedule", {
      personId: kind === "schedule-slot" ? data.get("personId") : selectedPersonId,
      replyChannel: data.get("replyChannel"),
      replyDate: data.get("replyDate"),
      date,
      slotKey,
      notes: data.get("notes"),
    }).then((next) => {
      state = next;
      selectedPersonId = kind === "schedule-slot" ? data.get("personId") : selectedPersonId;
      selectedSlotId = slotValue;
      view = "month";
      detailForm = "visit";
      render();
    }).catch(showError);
  } else if (kind === "comment") {
    post("/api/comments", {
      targetType: data.get("targetType"),
      targetId: data.get("targetId"),
      authorName: data.get("authorName") || authorInput.value,
      body: data.get("body"),
    }).then(() => {
      if (data.get("authorName")) {
        authorInput.value = data.get("authorName");
        localStorage.setItem("mvp-author", authorInput.value.trim());
      }
      detailForm = detailForm === "comment" ? null : detailForm;
      render();
    }).catch(showError);
  } else if (kind === "import") {
    post("/api/import", {
      csv: importCsv,
      fileName: importFileName,
      kind: data.get("kind"),
      defaultChannel: data.get("defaultChannel"),
      mapping: mappingFromForm(data),
    }).then((next) => {
      importResult = next.importResult;
      state = next;
      view = "people";
      detailForm = null;
      render();
    }).catch(showError);
  }
});

app.addEventListener("input", (event) => {
  if (event.target.id === "search") {
    search = event.target.value;
    renderPeopleList();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.id === "csv-file") {
    const file = event.target.files?.[0];
    if (!file) return;
    importFileName = file.name;
    file.text().then((csv) => {
      importCsv = csv;
      return post("/api/import/preview", { csv, includePrivate: false });
    }).then((preview) => {
      importPreview = preview;
      importResult = null;
      render();
    }).catch(showError);
  }
});

refresh().catch(showError);

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function showError(error) {
  notice.hidden = false;
  notice.textContent = error instanceof Error ? error.message : "Something went wrong";
}

function clearError() {
  notice.hidden = true;
  notice.textContent = "";
}

async function refresh() {
  const next = await api(`/api/state?month=${monthInput.value}&private=${revealInput.checked ? "1" : "0"}`);
  state = next;
  if (selectedPersonId && !state.people.some((person) => person.id === selectedPersonId)) selectedPersonId = null;
  render();
}

function post(path, body) {
  clearError();
  return api(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, month: monthInput.value, includePrivate: revealInput.checked }),
  }).then((next) => {
    if (next.slots && next.people) state = next;
    return next;
  });
}

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function selectedPerson() {
  return state?.people.find((person) => person.id === selectedPersonId) || null;
}

function mappingFromForm(data) {
  const mapping = {};
  for (const field of ["name", "phone", "email", "household", "notes", "channel", "date", "status"]) {
    const value = data.get(`map-${field}`);
    if (value) mapping[field] = value;
  }
  return mapping;
}

function render() {
  if (!state) {
    app.innerHTML = `<p class="empty">Loading the portal…</p>`;
    return;
  }
  if (!state.people.length && view === "people") {
    app.innerHTML = `${tabs()}${rosterNeeded()}`;
    return;
  }
  app.innerHTML = `${tabs()}${summary()}${view === "people" ? peopleView() : view === "month" ? monthView() : importView()}`;
}

function rosterNeeded() {
  return `<section class="card stack">
    <h2>The quorum list is not here yet</h2>
    <p>The outreach Google Sheet is still private, so this page has no names, no contact history, and no phone numbers or email addresses. Nothing was filled in as a sample.</p>
    <p>What is needed from that sheet is one CSV export: File, Download, Comma-separated values. Import it and the people list, outreach status, and open visit slots can be used.</p>
    <div class="actions">
      <button type="button" class="primary" data-action="view" data-view="import">Import a CSV</button>
    </div>
  </section>`;
}

function renderPeopleList() {
  const list = document.querySelector("#person-list");
  if (!list) return;
  list.innerHTML = personButtons();
}

function tabs() {
  return `<nav class="tabs" aria-label="Portal sections">
    ${tab("people", "People")}
    ${tab("month", "Month schedule")}
    ${tab("import", "Import")}
  </nav>`;
}

function tab(id, label) {
  return `<button type="button" data-action="view" data-view="${id}" aria-selected="${view === id}">${label}</button>`;
}

function summary() {
  if (state.rosterMode) return rosterSummary();
  const counts = countStatuses();
  const open = state.slots.filter((slot) => slot.status === "open").length;
  const taken = state.slots.length - open;
  return `<div class="summary" aria-label="Outreach summary">
    ${filterButton("all", state.people.length, "Everyone")}
    ${filterButton("not_contacted", counts.not_contacted)}
    ${filterButton("awaiting_reply", counts.awaiting_reply)}
    ${filterButton("replied", counts.replied)}
    ${filterButton("scheduled", counts.scheduled)}
    ${filterButton("completed", counts.completed)}
    ${filterButton("declined", counts.declined)}
    <span class="pill open">${open} open</span>
    <span class="pill taken">${taken} taken</span>
  </div>`;
}

function rosterSummary() {
  const counts = {};
  for (const person of state.people) {
    const key = person.rosterStatusKey || "none";
    counts[key] = (counts[key] || 0) + 1;
  }
  const keys = ROSTER_STATUS_ORDER.filter((key) => counts[key]);
  for (const key of Object.keys(counts)) {
    if (!keys.includes(key)) keys.push(key);
  }
  const offices = [...new Set(state.people.map((person) => person.priesthood).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const withAppointment = state.people.filter((person) => person.appointment).length;
  return `<div class="summary" aria-label="Brother filters">
    ${filterButton("all", state.people.length, "Everyone")}
    ${keys.map((key) => filterButton(key, counts[key] || 0, STATUS_LABELS[key] || key)).join("")}
    <label class="inline-filter">Priesthood
      <select data-action="office" aria-label="Filter by priesthood">
        <option value="all" ${officeFilter === "all" ? "selected" : ""}>All offices</option>
        ${offices.map((office) => `<option value="${esc(office)}" ${officeFilter === office ? "selected" : ""}>${esc(office)}</option>`).join("")}
      </select>
    </label>
    <label class="inline-filter">Appointment
      <select data-action="appointment" aria-label="Filter by appointment">
        <option value="all" ${appointmentFilter === "all" ? "selected" : ""}>All brothers</option>
        <option value="yes" ${appointmentFilter === "yes" ? "selected" : ""}>Has a date (${withAppointment})</option>
        <option value="no" ${appointmentFilter === "no" ? "selected" : ""}>No date yet</option>
      </select>
    </label>
  </div>`;
}

function filterButton(status, count, label = STATUS_LABELS[status]) {
  return `<button type="button" data-action="filter" data-status="${status}" aria-pressed="${statusFilter === status}">${esc(label)} ${count}</button>`;
}

function countStatuses() {
  const counts = { not_contacted: 0, awaiting_reply: 0, replied: 0, scheduled: 0, completed: 0, declined: 0 };
  for (const person of state.people) counts[person.outreachStatus] += 1;
  return counts;
}

function peopleView() {
  const people = filteredPeople();
  const title = statusFilter === "all" ? "People" : STATUS_LABELS[statusFilter];
  return `<section class="layout">
    <div class="card" id="people-card">
      <div class="row">
        <h2>${esc(title)}</h2>
        <button type="button" class="ghost" data-action="form" data-form="add-person">Add a person</button>
      </div>
      <p class="muted">${people.length} ${state.rosterMode ? (people.length === 1 ? "brother" : "brothers") : "in this list"}</p>
      <input id="search" class="search" type="search" placeholder="Search by name" value="${esc(search)}" aria-label="Search by name">
      <div id="person-list" class="person-list">${personButtons(people)}</div>
    </div>
    <div class="card">${detailForm === "add-person" ? addPersonForm() : personDetail()}</div>
  </section>`;
}

function personButtons(people = filteredPeople()) {
  if (!state.people.length) {
    return `<p class="empty">No one is loaded yet. The outreach spreadsheet is not readable from here, so this list starts empty. Import a CSV or add a person. No sample members are included.</p>`;
  }
  if (!people.length) {
    const label = statusFilter === "all" ? "this search" : STATUS_LABELS[statusFilter];
    return `<p class="empty">No one is in ${esc(label)}. Choose Everyone to see the full roster.</p>`;
  }
  return people.map((person) => `<button type="button" class="person ${state.rosterMode ? person.rosterStatusKey : person.outreachStatus}" data-action="select-person" data-id="${esc(person.id)}" aria-current="${person.id === selectedPersonId}">
      <strong>${esc(personLabel(person))}</strong>
      <span class="pill ${state.rosterMode ? person.rosterStatusKey : person.outreachStatus}">${esc(state.rosterMode ? (person.rosterStatus || "No status") : STATUS_LABELS[person.outreachStatus])}</span>
      <small>${esc(state.rosterMode ? rosterLine(person) : latestLine(person))}</small>
    </button>`).join("");
}

function rosterLine(person) {
  const bits = [person.priesthood, person.appointment ? `Appt ${person.appointment}` : ""].filter(Boolean);
  const touch = lastTouch(person);
  if (touch) bits.push(touch);
  return bits.join(" · ") || person.sheetName || "";
}

function personMatchesFilters(person) {
  if (statusFilter !== "all") {
    const key = state.rosterMode ? person.rosterStatusKey || "none" : person.outreachStatus;
    if (key !== statusFilter) return false;
  }
  if (state.rosterMode && officeFilter !== "all" && person.priesthood !== officeFilter) return false;
  if (state.rosterMode && appointmentFilter === "yes" && !person.appointment) return false;
  if (state.rosterMode && appointmentFilter === "no" && person.appointment) return false;
  return true;
}

function filteredPeople() {
  const needle = search.trim().toLowerCase();
  return state.people
    .filter((person) => personMatchesFilters(person))
    .filter((person) => {
      if (!needle) return true;
      const name = String(person.displayName || "").toLowerCase();
      const sheetName = String(person.sheetName || "").toLowerCase();
      const household = String(person.household || "").toLowerCase();
      return name.includes(needle) || sheetName.includes(needle) || household.includes(needle);
    })
    .slice()
    .sort((a, b) => {
      if (state.rosterMode) return String(a.sheetName || a.displayName).localeCompare(String(b.sheetName || b.displayName));
      return STATUS_ORDER.indexOf(a.outreachStatus) - STATUS_ORDER.indexOf(b.outreachStatus) || String(a.displayName).localeCompare(String(b.displayName));
    });
}

function personLabel(person) {
  const duplicates = state.people.filter((item) => item.displayName === person.displayName).length > 1;
  return duplicates && person.household ? `${person.displayName} (${person.household})` : person.displayName;
}

function latestLine(person) {
  if (person.nextVisit) return person.nextVisit;
  const visit = person.visits.find((item) => item.status === "scheduled");
  if (visit) return `${formatDate(visit.date)} · ${visit.slotLabel}`;
  if (!person.latestAttempt) return "No outreach logged";
  const attempt = person.latestAttempt;
  return `${CHANNEL_LABELS[attempt.channel] || attempt.channel} · ${formatDate(attempt.date)} · ${STATUS_LABELS[attempt.status] || attempt.status}`;
}

function personDetail() {
  const person = selectedPerson();
  if (!person) {
    if (state.rosterMode) return `<h2>Brothers</h2><p class="empty">Choose a name. Status, priesthood, appointment, and each text or drive-by show here. Phone numbers and email addresses stay hidden until you turn on contact details.</p>`;
    return `<h2>Outreach record</h2><p class="empty">Select a person to see contact history, log a reply, and schedule a visit. Phone numbers and email addresses stay hidden until you turn on contact details.</p>`;
  }
  if (state.rosterMode) return rosterDetail(person);
  return `<h2>${esc(person.displayName)}</h2>
    ${person.household ? `<p class="muted">${esc(person.household)}</p>` : ""}
    <p><span class="pill ${person.outreachStatus}">${STATUS_LABELS[person.outreachStatus]}</span></p>
    ${stepper(person)}
    <p>${esc(statusSentence(person))}</p>
    <div class="actions">${personActions(person)}</div>
    ${detailForm === "outreach" ? outreachForm() : ""}
    ${detailForm === "schedule" ? scheduleForm(person) : ""}
    ${contactBlock(person)}
    <h3>Outreach</h3>
    ${attemptList(person)}
    <h3>Comments <span class="muted">${person.commentCount}</span></h3>
    ${commentList("person", person.id)}
    ${commentForm("person", person.id)}`;
}

function rosterDetail(person) {
  const facts = [person.priesthood, person.age ? `Age ${person.age}` : "", person.birthday ? `Birthday ${person.birthday}` : ""].filter(Boolean);
  return `<h2>${esc(person.displayName)}</h2>
    ${person.sheetName && person.sheetName !== person.displayName ? `<p class="muted">${esc(person.sheetName)}</p>` : ""}
    <p><span class="pill ${person.rosterStatusKey}">${esc(person.rosterStatus || "No status")}</span></p>
    ${facts.length ? `<p>${esc(facts.join(" · "))}</p>` : ""}
    ${person.appointment ? `<p><strong>Appointment</strong> ${esc(person.appointment)}</p>` : `<p class="muted">No appointment date yet.</p>`}
    ${person.notes ? `<p>${esc(person.notes)}</p>` : ""}
    ${contactLine(person)}
    <div class="actions"><button type="button" class="ghost" data-action="form" data-form="outreach">Log outreach</button></div>
    ${detailForm === "outreach" ? outreachForm() : ""}
    <h3>Outreach</h3>
    ${attemptList(person)}
    <h3>Comments <span class="muted">${person.commentCount}</span></h3>
    ${commentList("person", person.id)}
    ${commentForm("person", person.id)}`;
}

function contactLine(person) {
  const revealed = state.privateVisible;
  const phone = person.phoneOnFile ? (revealed ? person.phone : "Hidden") : "None on file";
  const email = person.emailOnFile ? (revealed ? person.email : "Hidden") : "None on file";
  return `<p>Phone: ${esc(phone)} · Email: ${esc(email)}</p>`;
}

function lastTouch(person) {
  const attempt = personTouches(person)[0];
  if (!attempt) return "";
  const who = whoLabel(attempt);
  return `${who ? `${who} · ` : ""}${CHANNEL_LABELS[attempt.channel] || attempt.channel} · ${formatShortDate(attempt.date)}`;
}

function whoLabel(attempt) {
  const by = attempt.sheetColumns?.By || "";
  return WHO[by] || by;
}

function personTouches(person) {
  return state.outreachAttempts
    .filter((attempt) => attempt.personId === person.id)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function stepper(person) {
  if (person.outreachStatus === "declined") return `<p class="pill declined">Declined</p>`;
  const status = person.outreachStatus;
  const steps = [
    ["Contacted", ["awaiting_reply", "replied", "scheduled", "completed"].includes(status)],
    ["Replied", ["replied", "scheduled", "completed"].includes(status)],
    ["On the quorum calendar", ["scheduled", "completed"].includes(status)],
  ];
  return `<div class="steps">${steps.map(([label, done]) => `<span class="step${done ? " done" : ""}">${done ? "Done · " : ""}${label}</span>`).join("")}</div>`;
}

function statusSentence(person) {
  const attempt = person.latestAttempt;
  const visit = person.visits.find((item) => item.status === "scheduled");
  if (person.outreachStatus === "not_contacted") return "No outreach is logged yet.";
  if (person.outreachStatus === "awaiting_reply" && attempt) {
    return `Contacted by ${CHANNEL_LABELS[attempt.channel].toLowerCase()} on ${formatDate(attempt.date)}. Waiting for a reply.`;
  }
  if (person.outreachStatus === "replied" && attempt) {
    return `Replied by ${CHANNEL_LABELS[attempt.channel].toLowerCase()} on ${formatDate(attempt.date)}. Choose an open slot to record the visit.`;
  }
  if (visit) {
    return `Visit scheduled ${formatDate(visit.date)} · ${visit.slotLabel}, after a ${CHANNEL_LABELS[visit.replyChannel].toLowerCase()} reply. Recorded for the ${state.calendarName}.`;
  }
  if (person.outreachStatus === "completed") return "The last scheduled visit is marked complete.";
  if (person.outreachStatus === "declined" && attempt) return `Declined on ${formatDate(attempt.date)}.`;
  return "";
}

function personActions(person) {
  if (person.outreachStatus === "scheduled") {
    return `<button type="button" class="primary" data-action="show-month">Show the scheduled slot</button>
      <button type="button" class="ghost" data-action="form" data-form="outreach">Log outreach</button>`;
  }
  if (person.outreachStatus === "replied" || person.outreachStatus === "awaiting_reply") {
    return `<button type="button" class="primary" data-action="form" data-form="schedule">They replied — schedule the visit</button>
      <button type="button" class="ghost" data-action="form" data-form="outreach">Log outreach</button>`;
  }
  return `<button type="button" class="primary" data-action="form" data-form="outreach">Log outreach</button>
    <button type="button" class="ghost" data-action="form" data-form="schedule">They replied — schedule the visit</button>`;
}

function addPersonForm() {
  return `<h2>Add a person</h2>
    <form class="stack" data-form="add-person">
      <label>Name <input name="displayName" required></label>
      <label>Household <input name="household"></label>
      <label>Phone <span class="private-flag">Private</span><input name="phone" type="tel" autocomplete="off"></label>
      <label>Email <span class="private-flag">Private</span><input name="email" type="email" autocomplete="off"></label>
      <label>Notes <textarea name="notes"></textarea></label>
      <button class="primary" type="submit">Save person</button>
    </form>`;
}

function outreachForm() {
  return `<form class="stack banner" data-form="outreach">
      <h3>Log outreach</h3>
      ${channelFields("channel")}
      <label>Date <input name="date" type="date" required value="${todayIso()}"></label>
      <label>Status
        <select name="status">
          <option value="contacted">Contacted</option>
          <option value="no_reply">No reply</option>
          <option value="replied">Replied, time not chosen</option>
          <option value="declined">Declined</option>
          <option value="planned">Planned</option>
        </select>
      </label>
      <label>Notes <textarea name="notes"></textarea></label>
      <button class="primary" type="submit">Save outreach</button>
    </form>`;
}

function scheduleForm(person) {
  const openSlots = state.slots.filter((slot) => slot.status === "open");
  return `<form class="stack banner" data-form="schedule">
      <h3>Schedule ${esc(person.displayName)}</h3>
      <p>They replied. Recording the visit saves the reply channel, the slot, and that it belongs on the ${esc(state.calendarName)} for the presidency. Nothing is sent to Google Calendar.</p>
      ${channelFields("replyChannel")}
      <label>Reply date <input name="replyDate" type="date" required value="${todayIso()}"></label>
      <fieldset>
        <legend>Open slots in ${esc(formatMonth(state.month))}</legend>
        ${openSlots.length ? openSlots.map((slot) => `<label class="check"><input type="radio" name="slot" value="${esc(slot.id)}" required> ${esc(formatDate(slot.date))} · ${esc(slot.label)}</label>`).join("") : `<p>No open slots this month. Change the month and try again.</p>`}
      </fieldset>
      <label>Notes <textarea name="notes"></textarea></label>
      ${presidencyList()}
      <button class="primary" type="submit" ${openSlots.length ? "" : "disabled"}>Record visit for the Elders Quorum Calendar</button>
    </form>`;
}

function channelFields(name) {
  return `<fieldset>
    <legend>Channel</legend>
    <label class="check"><input type="radio" name="${name}" value="text" required checked> Text</label>
    <label class="check"><input type="radio" name="${name}" value="phone"> Phone</label>
    <label class="check"><input type="radio" name="${name}" value="email"> Email</label>
  </fieldset>`;
}

function presidencyList() {
  return `<div>
    <strong>Intended for</strong>
    <ul class="presidency">${state.presidency.map((member) => `<li>${esc(member.name)} — ${esc(member.role)}</li>`).join("")}</ul>
  </div>`;
}

function contactBlock(person) {
  const revealed = state.privateVisible;
  const phone = person.phoneOnFile ? (revealed ? person.phone : "Hidden") : "None on file";
  const email = person.emailOnFile ? (revealed ? person.email : "Hidden") : "None on file";
  return `<details>
    <summary>Contact details and sheet columns</summary>
    <p>Phone: ${esc(phone)}</p>
    <p>Email: ${esc(email)}</p>
    ${person.notes ? `<p>Notes: ${esc(person.notes)}</p>` : ""}
    ${sheetColumnList(person.sheetColumns, person.privateColumns)}
  </details>`;
}

function sheetColumnList(columns, privateColumns = []) {
  const names = Object.keys(columns || {});
  const hidden = (privateColumns || []).filter((name) => !names.includes(name));
  if (!names.length && !hidden.length) return "";
  const items = names.map((name) => `<li>${esc(name)}: ${esc(columns[name])}</li>`);
  hidden.forEach((name) => items.push(`<li>${esc(name)}: Hidden</li>`));
  return `<p>Columns kept from the sheet</p><ul>${items.join("")}</ul>`;
}

function attemptList(person) {
  const attempts = personTouches(person).slice().reverse();
  if (!attempts.length) return `<p class="empty">No attempts yet.</p>`;
  return `<ul class="history">${attempts.map((attempt) => `<li>
      <strong>${esc(whoLabel(attempt) || CHANNEL_LABELS[attempt.channel] || attempt.channel)}</strong>
      · ${esc(CHANNEL_LABELS[attempt.channel] || attempt.channel)}
      · ${esc(formatShortDate(attempt.date))}
      ${state.rosterMode ? "" : ` · ${esc(STATUS_LABELS[attempt.status] || attempt.status)}`}
      ${attempt.notes ? `<div>${esc(attempt.notes)}</div>` : ""}
    </li>`).join("")}</ul>`;
}

function commentList(targetType, targetId) {
  const comments = state.comments.filter((comment) => comment.targetType === targetType && comment.targetId === targetId);
  if (!comments.length) return `<p class="empty">No comments yet. Anyone using this portal can add one.</p>`;
  return comments.map((comment) => `<article class="comment"><strong>${esc(comment.authorName)}</strong><div>${esc(comment.body)}</div></article>`).join("");
}

function commentForm(targetType, targetId) {
  return `<form class="stack" data-form="comment">
    <input type="hidden" name="targetType" value="${esc(targetType)}">
    <input type="hidden" name="targetId" value="${esc(targetId)}">
    ${authorInput.value ? "" : `<label>Your name <input name="authorName" required></label>`}
    <label>Comment <textarea name="body" required placeholder="A note others can read"></textarea></label>
    <button class="primary" type="submit">Add comment</button>
  </form>`;
}

function monthView() {
  const groups = groupSlots(state.slots);
  const selected = state.slots.find((slot) => slot.id === selectedSlotId);
  return `<section class="layout">
    <div>
      <div class="card" style="margin-bottom:12px">
        <h2>${esc(formatMonth(state.month))}</h2>
        <p class="muted">Wednesday slots are 7:00, 7:15, 7:30, and 7:45 pm. Sunday slots are before church and after church. Sacrament meeting starts ${esc(state.sacrament.starts)} and concludes ${esc(state.sacrament.concludes)}.</p>
      </div>
      ${groups.map((group) => `<article class="card day">
        <h3>${esc(formatDate(group.date))}${group.date === todayIso() ? " · today" : ""}</h3>
        ${group.dayType === "sunday" ? `<p class="muted">Sacrament meeting ${esc(state.sacrament.starts)} – ${esc(state.sacrament.concludes)}</p>` : ""}
        <div class="slots">${group.slots.map((slot) => slotButton(slot)).join("")}</div>
      </article>`).join("")}
    </div>
    <div class="card">${selected ? slotDetail(selected) : `<h2>Slots</h2><p class="empty">Choose an open slot to schedule a reply, or a taken slot to read comments.</p>${presidencyList()}`}</div>
  </section>`;
}

function groupSlots(slots) {
  const groups = [];
  for (const slot of slots) {
    let group = groups.find((item) => item.date === slot.date);
    if (!group) {
      group = { date: slot.date, dayType: slot.dayType, slots: [] };
      groups.push(group);
    }
    group.slots.push(slot);
  }
  return groups;
}

function slotButton(slot) {
  const person = state.people.find((item) => item.id === slot.personId);
  const occupied = slot.status !== "open";
  const availability = slot.status === "completed" ? "Done" : occupied ? "Taken" : "Open";
  return `<button type="button" class="slot ${slot.status}" data-action="select-slot" data-id="${esc(slot.id)}" data-slot-status="${esc(slot.status)}" aria-pressed="${slot.id === selectedSlotId}">
    <strong>${esc(slot.label)}</strong>
    <span class="pill ${occupied ? "taken" : "open"}">${availability}</span>
    <small>${occupied ? esc(person?.displayName || "Scheduled") : esc(slot.detail || "Available")}</small>
  </button>`;
}

function slotDetail(slot) {
  if (slot.status === "open" || detailForm === "schedule-slot") {
    return scheduleSlotForm(slot);
  }
  const visit = state.visits.find((item) => item.id === slot.visitId);
  const person = state.people.find((item) => item.id === slot.personId);
  if (!visit) return `<p>That slot is no longer taken.</p>`;
  return `<h2>${esc(formatDate(visit.date))}</h2>
    <p><strong>${esc(visit.slotLabel)}</strong> · ${esc(person?.displayName || "Person")}</p>
    <p>Reply by ${esc(CHANNEL_LABELS[visit.replyChannel] || visit.replyChannel)}. Status: ${esc(visit.status)}.</p>
    <p>Recorded for the ${esc(visit.calendar.name)}. ${visit.calendar.externalEventId ? "Linked to Google Calendar." : "Not sent to Google Calendar yet."}</p>
    ${presidencyList()}
    <div class="actions">
      ${visit.status === "scheduled" ? `<button type="button" class="primary" data-action="complete-visit" data-id="${esc(visit.id)}">Mark complete</button>` : ""}
      ${visit.status !== "cancelled" ? `<button type="button" class="ghost" data-action="cancel-visit" data-id="${esc(visit.id)}">Cancel visit</button>` : ""}
      <button type="button" class="ghost" data-action="select-person" data-id="${esc(visit.personId)}">Open person</button>
    </div>
    <h3>Comments</h3>
    ${commentList("visit", visit.id)}
    ${commentForm("visit", visit.id)}`;
}

function scheduleSlotForm(slot) {
  return `<form class="stack" data-form="schedule-slot">
    <h2>${esc(formatDate(slot.date))}</h2>
    <p><strong>${esc(slot.label)}</strong> is open. ${esc(slot.detail || "")}</p>
    ${state.people.length ? `<label>Who replied
      <select name="personId" required>
        <option value="">Choose a person</option>
        ${state.people.map((person) => `<option value="${esc(person.id)}" ${person.id === selectedPersonId ? "selected" : ""}>${esc(personLabel(person))}</option>`).join("")}
      </select>
    </label>` : `<p>Add or import a person before scheduling this slot.</p>`}
    ${channelFields("replyChannel")}
    <label>Reply date <input name="replyDate" type="date" required value="${todayIso()}"></label>
    <label>Notes <textarea name="notes"></textarea></label>
    ${presidencyList()}
    <button class="primary" type="submit" ${state.people.length ? "" : "disabled"}>Record visit for the Elders Quorum Calendar</button>
  </form>`;
}

function importView() {
  const preview = importPreview;
  return `<section class="card stack">
    <h2>Import a spreadsheet export</h2>
    <p>Export the outreach sheet as CSV and upload it here. Extra columns stay on each person. Phone and email columns stay hidden until you show contact details.</p>
    <p>This portal has no login. Do not import phone numbers or email addresses unless only people you trust can open this site.</p>
    <p><a href="/template.csv">Download a header-only template</a>. It has no member rows.</p>
    <label>CSV file <input id="csv-file" type="file" accept=".csv,text/csv"></label>
    ${preview ? previewBlock(preview) : ""}
    ${importResult ? `<p class="banner">Imported ${importResult.imported}. Skipped ${importResult.skipped.length}.${skipReasons(importResult.skipped)}</p>` : ""}
    <button type="button" class="ghost" data-action="reset">Clear portal data</button>
  </section>`;
}

function previewBlock(preview) {
  const fields = [
    ["name", "Name"],
    ["phone", "Phone"],
    ["email", "Email"],
    ["household", "Household"],
    ["notes", "Notes"],
    ["channel", "Channel"],
    ["date", "Date"],
    ["status", "Status"],
  ];
  return `<form class="stack" data-form="import">
    <p><strong>${preview.rowCount}</strong> data rows · ${preview.headers.length} columns. Cell values are not shown here.</p>
    <div class="counts">${preview.headers.map((header) => `<span class="count">${esc(header)}: ${preview.nonEmptyCounts[header] || 0}${preview.privateHeaders.includes(header) ? " · private" : ""}</span>`).join("")}</div>
    <label>These rows are
      <select name="kind">
        <option value="people">People</option>
        <option value="outreach">Outreach attempts</option>
      </select>
    </label>
    <p class="muted">If a people row also has a channel and a date, an outreach attempt is saved with that person.</p>
    ${fields.map(([field, label]) => `<label>${label}
      <select name="map-${field}">${headerOptions(preview.headers, preview.suggestedMapping[field])}</select>
    </label>`).join("")}
    <label>If an outreach row has no channel, record it as
      <select name="defaultChannel">
        <option value="">Skip the row</option>
        <option value="text">Text</option>
        <option value="phone">Phone</option>
        <option value="email">Email</option>
      </select>
    </label>
    <button class="primary" type="submit">Import into the portal</button>
  </form>`;
}

function headerOptions(headers, selected) {
  const options = [`<option value="">Skip</option>`];
  for (const header of headers) {
    options.push(`<option value="${esc(header)}"${header === selected ? " selected" : ""}>${esc(header)}</option>`);
  }
  return options.join("");
}

function skipReasons(skipped) {
  if (!skipped.length) return "";
  const counts = {};
  for (const item of skipped) counts[item.reason] = (counts[item.reason] || 0) + 1;
  return ` ${Object.entries(counts).map(([reason, count]) => `${count} ${reason}`).join(", ")}.`;
}

function formatShortDate(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDate(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}
