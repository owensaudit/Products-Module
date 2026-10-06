const STATUS_LABELS = {
  not_contacted: "Not contacted",
  awaiting_reply: "Awaiting reply",
  replied: "Replied",
  scheduled: "Scheduled",
  completed: "Visit complete",
  declined: "Declined",
  reach_out: "Reach Out",
  driveby: "Drive by",
  no_response: "No Response",
  reschedule: "Re-Schedule",
  reschedule_visited: "Visited",
  visited: "Visited",
  none: "No status",
  moved: "Moved",
  mission: "Mission",
  do_not_contact: "Do Not Contact",
  not_interested: "Not Interested",
  no_contact_info: "No Contact Info",
};

const PRIESTHOOD_OFFICES = ["Unordained", "Deacon", "Teacher", "Priest", "Elder", "High Priest"];
const ROSTER_STATUS_ORDER = ["reach_out", "no_response", "reschedule", "scheduled", "driveby", "none"];
const ARCHIVE_STATUS_ORDER = ["moved", "mission", "do_not_contact", "not_interested", "no_contact_info", "declined", "visited"];

const WHO = { JO: "Josh Owens" };

const STATUS_ORDER = ["replied", "awaiting_reply", "not_contacted", "scheduled", "completed", "declined"];

const CHANNEL_LABELS = { text: "Text", phone: "Call", email: "Email", driveby: "Drive-by", in_person: "In person" };

function completeOutreachDate(value) {
  const raw = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const year = Number(raw.slice(0, 4));
  if (year < 1900 || year > 2100) return "";
  return raw;
}

function formatPhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return raw;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

const app = document.querySelector("#app");
const presidencyHost = document.querySelector("#presidency");
const notice = document.querySelector("#notice");
const monthInput = document.querySelector("#month");
const authorInput = document.querySelector("#author-name");
const revealInput = document.querySelector("#reveal-private");

let state = null;
let view = "people";
let statusFilter = "all";
let archiveOpen = false;
let archiveChoicesFor = "";
let officeFilter = "all";
let search = "";
let dayFilter = "";
let viewAll = false;
let assigneeFilter = "";
let preserveListScroll = true;
let blankPlanFor = "";
let focusReachOutDate = false;
let inbox = "";
let page = "elders";
let directoryFocus = null;
let directoryFilter = "all";
let directoryAdding = false;
let youthGroup = "priests";
let youthList = "all";
let commentFor = "";
let editingCommentId = "";
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedPersonId = null;
let selectedSlotId = null;
let detailForm = null;
let importPreview = null;
let importCsv = "";
let importFileName = "";
let importResult = null;

if (authorInput) {
  authorInput.value = localStorage.getItem("mvp-author") || "";
  authorInput.addEventListener("change", () => {
    localStorage.setItem("mvp-author", authorInput.value.trim());
  });
}
if (revealInput) {
  revealInput.checked = sessionStorage.getItem("mvp-private") === "1";
  revealInput.addEventListener("change", () => {
    sessionStorage.setItem("mvp-private", revealInput.checked ? "1" : "0");
    refresh().catch(showError);
  });
}
if (monthInput) {
  monthInput.value = currentMonth();
  monthInput.addEventListener("change", () => {
    selectedSlotId = null;
    refresh().catch(showError);
  });
}

app.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name === "place" && target.value === "driveby" && target.form?.dataset.form === "plan") {
    applyStatus(selectedPersonId, "Drive by");
    return;
  }
  if (target instanceof HTMLSelectElement && target.classList.contains("status-pill")) {
    if (target.value === "Mission") applyMission(target.dataset.personId, true);
    else applyStatus(target.dataset.personId, target.value);
    return;
  }
  if (target instanceof HTMLSelectElement && target.form?.dataset.form === "directory-companion") {
    post("/api/directory/companion", {
      directoryId: target.form.dataset.id,
      member: target.form.dataset.member,
      companion: target.value,
    }).then((next) => {
      state = next;
      render();
    }).catch(showError);
    return;
  }
  if (target instanceof HTMLSelectElement && target.form?.dataset.form === "directory-home") {
    const householdId = target.value;
    const member = target.form.dataset.member;
    if (!householdId || householdId === target.form.dataset.id) return;
    post("/api/directory/move", {
      directoryId: target.form.dataset.id,
      member,
      householdId,
    }).then((next) => {
      state = next;
      directoryFocus = { directoryId: householdId, member };
      render();
    }).catch(showError);
    return;
  }
  if (target instanceof HTMLSelectElement && target.form?.dataset.form === "directory-visit") {
    const householdId = target.value;
    const entry = directoryFocusedEntry();
    if (!householdId || !entry) return;
    const companion = document.querySelector("form[data-form='directory-companion'] [name=companion]")?.value.trim() || "";
    post("/api/directory/assign", {
      directoryId: householdId,
      youth: entry.name,
      companion,
    }).then((next) => {
      state = next;
      render();
    }).catch(showError);
    return;
  }
  if (target instanceof HTMLSelectElement && target.form?.dataset.form === "directory-assign") {
    if (target.name === "youth") {
      const companion = directoryCompanionFor(target.value);
      const field = target.form.querySelector("[name=companion]");
      if (field && companion) field.value = companion;
    }
    saveDirectoryAssignment(target.form);
    return;
  }
  if (target instanceof HTMLSelectElement && target.form?.dataset.form === "assign") {
    saveAssignment(target.form);
    return;
  }
  const editRow = target.closest?.("[data-outreach-edit]");
  if (editRow) {
    const by = editRow.querySelector("[name=by]").value;
    const channel = editRow.querySelector("[name=channel]").value;
    const date = completeOutreachDate(editRow.querySelector("[name=date]").value);
    if (target instanceof HTMLInputElement && target.name === "date" && !date) return;
    if (channel && date) {
      post(`/api/outreach/${editRow.dataset.id}`, { by, channel, date }).then((next) => {
        state = next;
        render();
      }).catch(showError);
    }
    return;
  }
  const addRow = target.closest?.("[data-outreach-add]");
  if (addRow) {
    const by = addRow.querySelector("[name=by]").value;
    const channel = addRow.querySelector("[name=channel]").value;
    const date = completeOutreachDate(addRow.querySelector("[name=date]").value);
    if (!channel || !date || addRow.dataset.saving === "1") return;
    addRow.dataset.saving = "1";
    post("/api/outreach", {
      personId: addRow.dataset.personId,
      by,
      channel,
      date,
      status: "contacted",
    }).then((next) => {
      state = next;
      render();
    }).catch((error) => {
      delete addRow.dataset.saving;
      showError(error);
    });
    return;
  }
  if (target.closest?.("form[data-form='facts']")) {
    clearTimeout(contactTimer);
    saveContactFields();
    return;
  }
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.dataset.action === "office") {
    officeFilter = target.value;
    dayFilter = "";
    view = "people";
    const current = selectedPerson();
    if (current && !personMatchesFilters(current)) selectedPersonId = null;
    render();
  }
});

app.addEventListener("input", (event) => {
  const area = event.target;
  if (!(area instanceof HTMLTextAreaElement) || area.name !== "body") return;
  area.dataset.caret = String(area.selectionStart);
  const typed = area.value.slice(0, area.selectionStart);
  const match = typed.match(/@([^@\n]*)$/);
  const menu = area.closest("form")?.querySelector(".mention-menu");
  if (!menu) return;
  if (!match) {
    menu.hidden = true;
    menu.innerHTML = "";
    return;
  }
  const query = match[1].toLowerCase();
  const people = (state?.presidency || []).filter((member) => member.name.toLowerCase().includes(query));
  menu.hidden = people.length === 0;
  menu.innerHTML = people.map((member) => `<button type="button" data-action="mention" data-name="${esc(member.name)}">${esc(member.name)} <span class="muted">${esc(member.role)}</span></button>`).join("");
});

app.addEventListener("click", (event) => {
  if (event.target.closest("select, input, textarea, a.address-pill")) return;
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "mention") {
    const area = button.closest("form")?.querySelector("textarea[name=body]");
    if (!area) return;
    const caret = Number(area.dataset.caret ?? area.selectionStart);
    const name = button.dataset.name;
    const before = area.value.slice(0, caret).replace(/@([^@\n]*)$/, `@${name} `);
    const after = area.value.slice(caret);
    area.value = before + after;
    area.dataset.caret = String(before.length);
    area.focus();
    const menu = button.closest(".mention-menu");
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = "";
    }
    return;
  } else if (action === "comment-for") {
    commentFor = button.dataset.name || "";
    render();
  } else if (action === "open-comment-person") {
    const person = state.people.find((item) => item.id === button.dataset.id);
    if (!person) return;
    page = person?.list === "youth" ? "youth" : "elders";
    inbox = "";
    selectedPersonId = person.id;
    archiveOpen = personIsArchived(person);
    archiveChoicesFor = "";
    statusFilter = "all";
    search = "";
    dayFilter = "";
    officeFilter = "all";
    assigneeFilter = "";
    viewAll = false;
    view = "people";
    detailForm = null;
    render();
    document.getElementById(`comment-${button.dataset.comment}`)?.scrollIntoView({ block: "nearest" });
  } else if (action === "view") {
    view = button.dataset.view;
    detailForm = null;
    render();
  } else if (action === "view-all") {
    if (page === "youth") youthList = "all";
    viewAll = true;
    archiveOpen = false;
    archiveChoicesFor = "";
    statusFilter = "all";
    search = "";
    dayFilter = "";
    officeFilter = "all";
    assigneeFilter = "";
    view = "people";
    render();
  } else if (action === "show-people") {
    if (page === "youth") youthList = "visits";
    viewAll = false;
    archiveOpen = false;
    archiveChoicesFor = "";
    statusFilter = "all";
    search = "";
    dayFilter = "";
    assigneeFilter = "";
    view = "people";
    const current = selectedPerson();
    if (current && personIsArchived(current)) selectedPersonId = null;
    render();
  } else if (action === "youth-list") {
    youthList = button.dataset.list || "all";
    viewAll = false;
    archiveOpen = false;
    archiveChoicesFor = "";
    statusFilter = "all";
    search = "";
    dayFilter = "";
    assigneeFilter = "";
    officeFilter = "all";
    selectedPersonId = null;
    view = "people";
    render();
  } else if (action === "archive") {
    if (page === "youth") youthList = "visits";
    viewAll = false;
    archiveOpen = !archiveOpen;
    statusFilter = "all";
    archiveChoicesFor = "";
    search = "";
    dayFilter = "";
    assigneeFilter = "";
    view = "people";
    const current = selectedPerson();
    if (current && personIsArchived(current) !== archiveOpen) selectedPersonId = null;
    render();
  } else if (action === "toggle-archive") {
    archiveChoicesFor = archiveChoicesFor === selectedPersonId ? "" : selectedPersonId;
    render();
  } else if (action === "mark-visited") {
    applyStatus(button.dataset.personId, "Visited", { keepView: true });
  } else if (action === "set-status") {
    if (button.dataset.status === "Mission") applyMission(button.dataset.personId);
    else applyStatus(button.dataset.personId, button.dataset.status);
  } else if (action === "filter") {
    viewAll = false;
    statusFilter = button.dataset.status;
    search = "";
    dayFilter = "";
    assigneeFilter = "";
    view = "people";
    const current = selectedPerson();
    if (current && !personMatchesFilters(current)) selectedPersonId = null;
    render();
  } else if (action === "select-person") {
    const pageTop = window.scrollY;
    selectedPersonId = button.dataset.id;
    view = "people";
    detailForm = null;
    render();
    window.scrollTo(0, pageTop);
    requestAnimationFrame(() => window.scrollTo(0, pageTop));
  } else if (action === "form") {
    if (page === "youth" && button.dataset.form === "add-person") return;
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
      if (monthInput) monthInput.value = visit.date.slice(0, 7);
      selectedSlotId = `${visit.date}:${visit.slotKey}`;
      refresh().catch(showError);
      return;
    }
    render();
  } else if (action === "cancel-visit") {
    post(`/api/visits/${button.dataset.id}/cancel`, {}).then(() => render()).catch(showError);
  } else if (action === "complete-visit") {
    post(`/api/visits/${button.dataset.id}/complete`, {}).then(() => render()).catch(showError);
  } else if (action === "edit-comment") {
    editingCommentId = button.dataset.id;
    render();
    document.querySelector(`form[data-form="edit-comment"] textarea`)?.focus();
  } else if (action === "cancel-edit") {
    editingCommentId = "";
    render();
  } else if (action === "resolve-comment") {
    post(`/api/comments/${button.dataset.id}/resolve`, {}).then(() => {
      editingCommentId = "";
      render();
    }).catch(showError);
  } else if (action === "delete-comment") {
    if (!confirm("Delete this comment?")) return;
    post(`/api/comments/${button.dataset.id}/delete`, {}).then(() => {
      if (editingCommentId === button.dataset.id) editingCommentId = "";
      render();
    }).catch(showError);
  } else if (action === "open-directory-person") {
    const pageTop = window.scrollY;
    directoryAdding = false;
    directoryFocus = { directoryId: button.dataset.id, member: button.dataset.member };
    render();
    window.scrollTo(0, pageTop);
    requestAnimationFrame(() => window.scrollTo(0, pageTop));
  } else if (action === "directory-add") {
    directoryAdding = true;
    directoryFocus = null;
    render();
  } else if (action === "remove-directory-member") {
    if (!confirm("Remove this member from the directory?")) return;
    post("/api/directory/remove", {
      directoryId: button.dataset.id,
      member: button.dataset.member,
    }).then((next) => {
      state = next;
      directoryFocus = null;
      directoryAdding = false;
      render();
    }).catch(showError);
  } else if (action === "directory-filter") {
    const next = button.dataset.filter || "all";
    directoryFilter = directoryFilter === next ? "all" : next;
    render();
  } else if (action === "open-youth-assignment") {
    page = "youth";
    youthList = "assignments";
    archiveOpen = false;
    viewAll = false;
    assigneeFilter = "";
    dayFilter = "";
    search = "";
    statusFilter = "all";
    selectedPersonId = button.dataset.id;
    detailForm = null;
    directoryFocus = null;
    render();
  } else if (action === "clear-assignment") {
    post(`/api/people/${button.dataset.id}/delete`, {}).then(render).catch(showError);
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
  if (kind === "directory-companion") {
    post("/api/directory/companion", {
      directoryId: form.dataset.id,
      member: form.dataset.member,
      companion: data.get("companion"),
    }).then((next) => {
      state = next;
      render();
    }).catch(showError);
    return;
  }
  if (kind === "directory-contact") {
    saveDirectoryContact();
    return;
  }
  if (kind === "directory-add") {
    const name = String(data.get("name") || "").trim();
    const householdId = String(data.get("householdId") || "").trim();
    const householdName = String(data.get("householdName") || "").trim();
    post("/api/directory/member", { name, householdId, householdName }).then((next) => {
      state = next;
      directoryAdding = false;
      const record = householdId
        ? (next.directory || []).find((row) => row.id === householdId)
        : (next.directory || []).find((row) => String(row.name).toLowerCase() === (householdName || name).toLowerCase());
      const member = (record?.members || []).find((item) => directoryPersonName(record, item).toLowerCase() === name.toLowerCase())
        || (record?.members || []).at(-1)
        || "";
      directoryFocus = record && member ? { directoryId: record.id, member } : null;
      render();
    }).catch(showError);
    return;
  }
  if (kind === "directory-assign") {
    post("/api/directory/assign", {
      directoryId: form.dataset.id,
      youth: data.get("youth"),
      companion: data.get("companion"),
    }).then((next) => {
      state = next;
      render();
    }).catch(showError);
    return;
  }
  if (kind === "youth-companion") {
    saveYouthCompanion(selectedPersonId, data.get("companion")).catch(showError);
    return;
  }
  if (kind === "youth-meeting") {
    post(`/api/people/${selectedPersonId}/contact`, {
      meetingDate: { date: data.get("date"), time: data.get("time") },
    }).then(render).catch(showError);
    return;
  }
  if (kind === "assignment-visit") {
    post(`/api/people/${form.dataset.id}/contact`, {
      visitDate: { date: data.get("date"), time: data.get("time") },
    }).then(render).catch(showError);
    return;
  }
  if (kind === "add-person") {
    const known = new Set((state?.people || []).map((person) => person.id));
    const payload = {
      displayName: data.get("displayName"),
      household: data.get("household"),
      phone: formatPhone(data.get("phone")),
      email: data.get("email"),
      notes: data.get("notes"),
    };
    if (page === "youth") {
      payload.list = "youth";
      payload.sheetColumns = { Brother: String(data.get("displayName") || "").trim() };
      youthList = "visits";
      viewAll = false;
      archiveOpen = false;
    }
    post("/api/people", payload).then((next) => {
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
      status: data.get("status") || "contacted",
      by: data.get("by"),
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
  } else if (kind === "contact" || kind === "facts") {
    clearTimeout(contactTimer);
    saveContactFields();
  } else if (kind === "plan") {
    const date = String(data.get("date") || "");
    const plan = String(data.get("kind") || "");
    const time = String(data.get("time") || "");
    const place = String(data.get("place") || "");
    if (place === "driveby") {
      if (date && !time) {
        showError(new Error("Add a time for a scheduled appointment"));
        return;
      }
      const path = date ? `/api/people/${selectedPersonId}/appointment` : `/api/people/${selectedPersonId}/status`;
      const body = date ? { date, time, kind: plan, place } : { status: "Drive by" };
      post(path, body).then(() => {
        if (date) blankPlanFor = selectedPersonId;
        render();
      }).catch(showError);
      return;
    }
    if (!plan) {
      showError(new Error("Choose Reach out, Scheduled Appt, or Re-Schedule"));
      return;
    }
    if ((plan === "scheduled" || plan === "reschedule") && !time) {
      showError(new Error("Add a time for a scheduled appointment"));
      return;
    }
    if ((plan === "scheduled" || plan === "reschedule") && place !== "church" && place !== "home") {
      showError(new Error("Choose Church, Home, or Driveby"));
      return;
    }
    const path = plan === "reach_out" ? `/api/people/${selectedPersonId}/reach-out` : `/api/people/${selectedPersonId}/appointment`;
    const body = plan === "reach_out" ? { date } : { date, time, kind: plan, place };
    post(path, body).then(() => {
      blankPlanFor = selectedPersonId;
      render();
    }).catch(showError);
  } else if (kind === "comment") {
    post("/api/comments", {
      targetType: data.get("targetType"),
      targetId: data.get("targetId"),
      body: data.get("body"),
    }).then(() => {
      detailForm = detailForm === "comment" ? null : detailForm;
      render();
    }).catch(showError);
  } else if (kind === "edit-comment") {
    post(`/api/comments/${data.get("id")}`, { body: data.get("body") }).then(() => {
      editingCommentId = "";
      render();
    }).catch(showError);
  } else if (kind === "reply") {
    post("/api/comments", { parentId: data.get("parentId"), body: data.get("body") }).then(() => {
      editingCommentId = "";
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
    if (page === "directory") renderDirectoryList();
    else renderPeopleList();
  }
  if (page === "directory" && event.target.closest?.("form[data-form='directory-contact']")) {
    const contact = event.target.closest("form[data-form='directory-contact']");
    if (contact) syncContactLinks(contact);
    clearTimeout(contactTimer);
    contactTimer = setTimeout(saveDirectoryContact, 400);
    return;
  }
  if (event.target.closest?.("form[data-form='contact'], form[data-form='facts'], .special-notes, .person-name")) {
    const contact = event.target.closest("form[data-form='contact']");
    if (contact) syncContactLinks(contact);
    clearTimeout(contactTimer);
    contactTimer = setTimeout(saveContactFields, 400);
  }
});

app.addEventListener("focusout", (event) => {
  const youthCompanion = event.target.closest?.("form[data-form='youth-companion'] [name=companion]");
  if (youthCompanion) {
    saveYouthCompanion(selectedPersonId, youthCompanion.value).catch(showError);
    return;
  }
  const companion = event.target.closest?.(".companion-input");
  if (companion) {
    const card = companion.closest(".ministering-card");
    const stay = event.relatedTarget instanceof Node && card?.contains(event.relatedTarget);
    saveYouthCompanion(companion.dataset.youthId, companion.value, { render: !stay }).catch(showError);
    if (stay) event.stopPropagation();
    return;
  }
  const assignment = event.target.closest?.("[data-assignment-id]");
  if (assignment) {
    saveAssignmentName(assignment.dataset.assignmentId, assignment.value).catch(showError);
    return;
  }
  if (page === "directory" && event.target.closest?.("form[data-form='directory-contact']")) {
    clearTimeout(contactTimer);
    saveDirectoryContact();
    return;
  }
  if (!event.target.closest?.("form[data-form='contact'], form[data-form='facts'], .special-notes, .person-name")) return;
  clearTimeout(contactTimer);
  saveContactFields();
});

app.addEventListener("change", (event) => {
  const response = event.target.closest?.("[data-response-id]");
  if (response) {
    post(`/api/people/${response.dataset.responseId}/contact`, { response: response.checked ? "Responded" : "" }).then(render).catch(showError);
    return;
  }
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
  const next = await api(`/api/state?month=${encodeURIComponent(monthValue())}&private=${privateOn() ? "1" : "0"}`);
  state = next;
  if (selectedPersonId && !state.people.some((person) => person.id === selectedPersonId)) selectedPersonId = null;
  render();
}

function post(path, body) {
  clearError();
  return api(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, month: monthValue(), includePrivate: privateOn() }),
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

let presidencySaveTimer = null;

function memberField(name) {
  const match = String(name).match(/^(?:name|phone|email)-member-(.+)$/);
  return match ? match[1] : "";
}

function saveYouthMember(id) {
  const person = state?.people?.find((item) => item.id === id);
  if (!person || !presidencyHost) return;
  const typedName = String(presidencyHost.querySelector(`[name="name-member-${id}"]`)?.value ?? "").trim();
  const phoneInput = presidencyHost.querySelector(`[name="phone-member-${id}"]`);
  const phone = formatPhone(phoneInput?.value ?? "");
  if (phoneInput && phoneInput.value !== phone) phoneInput.value = phone;
  const email = String(presidencyHost.querySelector(`[name="email-member-${id}"]`)?.value ?? "").trim();
  const payload = {};
  if (typedName && typedName !== nameKey(person)) payload.name = typedName;
  if (phone !== (person.phone || "")) payload.phone = phone;
  if (email !== (person.email || "")) payload.email = email;
  if (!Object.keys(payload).length) return;
  post(`/api/people/${id}/contact`, payload).then((next) => {
    state = next;
  }).catch(showError);
}

function youthFieldName(name) {
  return /^(name|phone|email)-(priests|teachers)-\d+$/.test(name);
}

function youthLeadershipFromForm() {
  const readQuorum = (quorum) => {
    const rows = state?.youthLeadership?.[quorum] || [];
    return rows.map((row, index) => ({
      name: String(presidencyHost?.querySelector(`[name="name-${quorum}-${index}"]`)?.value ?? row.name ?? "").trim(),
      phone: readPhoneField(presidencyHost?.querySelector(`[name="phone-${quorum}-${index}"]`), row.phone),
      email: String(presidencyHost?.querySelector(`[name="email-${quorum}-${index}"]`)?.value ?? row.email ?? "").trim(),
    }));
  };
  return { priests: readQuorum("priests"), teachers: readQuorum("teachers") };
}

function saveYouthLeadership() {
  const payload = youthLeadershipFromForm();
  const current = state?.youthLeadership || {};
  const same = (quorum) => (payload[quorum] || []).every((row, index) => {
    const saved = current[quorum]?.[index] || {};
    return row.name === (saved.name || "") && row.phone === (saved.phone || "") && row.email === (saved.email || "");
  });
  if (same("priests") && same("teachers")) return;
  post("/api/youth/leadership", payload).then((next) => {
    state = next;
    syncPresidencyDropdowns();
  }).catch(showError);
}

function readPhoneField(input, fallback = "") {
  const formatted = formatPhone(input ? input.value : fallback);
  if (input && input.value !== formatted) input.value = formatted;
  return formatted;
}

function presidencyMembersFromForm() {
  return (state?.presidency || []).map((member, index) => ({
    name: String(presidencyHost?.querySelector(`[name="name-${index}"]`)?.value ?? member.name).trim(),
    phone: readPhoneField(presidencyHost?.querySelector(`[name="phone-${index}"]`), member.phone),
    email: String(presidencyHost?.querySelector(`[name="email-${index}"]`)?.value ?? "").trim(),
  }));
}

function syncPresidencyDropdowns() {
  const names = leaderNamesFor(selectedPerson());
  document.querySelectorAll("select[name='by']").forEach((select) => {
    const current = select.value;
    select.innerHTML = names.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("");
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  });
}

function savePresidencyNames() {
  const members = presidencyMembersFromForm();
  if (!members.length || members.some((member) => !member.name)) return;
  const unchanged = members.every((member, index) => {
    const current = state.presidency[index] || {};
    return member.name === current.name && member.phone === (current.phone || "") && member.email === (current.email || "");
  });
  if (unchanged) return;
  post("/api/presidency", { members }).then((next) => {
    state = next;
    syncPresidencyDropdowns();
  }).catch(showError);
}

presidencyHost?.addEventListener("input", (event) => {
  const name = event.target?.name || "";
  if (!(event.target instanceof HTMLInputElement) || !/^(name|phone|email)-/.test(name)) return;
  clearTimeout(presidencySaveTimer);
  const memberId = memberField(name);
  if (memberId) {
    presidencySaveTimer = setTimeout(() => saveYouthMember(memberId), 400);
    return;
  }
  presidencySaveTimer = setTimeout(youthFieldName(name) ? saveYouthLeadership : savePresidencyNames, 400);
});

presidencyHost?.addEventListener("focusout", (event) => {
  const name = event.target?.name || "";
  if (!(event.target instanceof HTMLInputElement) || !/^(name|phone|email)-/.test(name)) return;
  clearTimeout(presidencySaveTimer);
  const memberId = memberField(name);
  if (memberId) saveYouthMember(memberId);
  else if (youthFieldName(name)) saveYouthLeadership();
  else savePresidencyNames();
});

presidencyHost?.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-action='toggle-youth-section']");
  if (toggle) {
    const id = toggle.dataset.section || "";
    if (openYouthSections.has(id)) openYouthSections.delete(id);
    else openYouthSections.add(id);
    render();
    return;
  }
  const button = event.target.closest("[data-action='show-assigned']");
  if (!button) return;
  const name = button.dataset.name || "";
  if (button.dataset.quorum === "priests" || button.dataset.quorum === "teachers") {
    page = "youth";
    youthGroup = button.dataset.quorum;
  }
  assigneeFilter = assigneeFilter === name ? "" : name;
  viewAll = false;
  archiveOpen = false;
  inbox = "";
  dayFilter = "";
  search = "";
  officeFilter = "all";
  statusFilter = assigneeFilter ? "scheduled" : "all";
  view = "people";
  const current = selectedPerson();
  if (!current || !personMatchesFilters(current)) {
    selectedPersonId = null;
    detailForm = null;
  }
  preserveListScroll = false;
  render();
  preserveListScroll = true;
});

presidencyHost?.addEventListener("submit", (event) => {
  event.preventDefault();
});

document.querySelector("#open-elders")?.addEventListener("click", () => openPage("elders"));
document.querySelector("#open-elders-title")?.addEventListener("click", () => openPage("elders"));
document.querySelector("[data-page-header='elders'] .eyebrow")?.addEventListener("click", () => openPage("elders"));
document.querySelector("#open-youth")?.addEventListener("click", () => openPage("youth"));
document.querySelector("#open-youth-title")?.addEventListener("click", () => openPage("youth"));
document.querySelector("[data-page-header='youth'] .eyebrow")?.addEventListener("click", () => openPage("youth"));
document.querySelector("#open-directory")?.addEventListener("click", () => openPage("directory"));

document.querySelector("#message-inbox")?.addEventListener("click", () => {
  toggleInbox("elders");
});

document.querySelector("#youth-message-inbox")?.addEventListener("click", () => {
  toggleInbox("youth");
});

function inboxMessages(which = inbox) {
  if (which === "youth") return state?.youthOpenMessages || [];
  return state?.openMessages || [];
}

function openPage(next) {
  if (page === next) return;
  page = next;
  youthList = "all";
  selectedPersonId = null;
  detailForm = null;
  inbox = "";
  commentFor = "";
  search = "";
  statusFilter = "all";
  archiveOpen = false;
  viewAll = false;
  assigneeFilter = "";
  dayFilter = "";
  view = "people";
  if (next === "youth") officeFilter = "all";
  if (next !== "directory") {
    directoryFocus = null;
    directoryAdding = false;
  }
  render();
}

function toggleInbox(which) {
  const messages = inboxMessages(which);
  if (!messages.length) return;
  inbox = inbox === which ? "" : which;
  commentFor = "";
  render();
}

document.querySelector("#month-calendar")?.addEventListener("click", (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  if (control.dataset.action === "shift-month") {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + Number(control.dataset.delta), 1);
    renderCalendar();
    return;
  }
  if (control.dataset.action === "open-day") openCalendarDay(control.dataset.date);
});

let contactTimer = null;

function contactCard() {
  return document.querySelector(".layout .card:last-child");
}

function readContactDraft() {
  const card = contactCard();
  const field = document.activeElement;
  if (!card || !field || !card.contains(field)) return null;
  if (!field.closest?.("form[data-form='contact'], form[data-form='facts'], .special-notes, .person-name")) return null;
  return {
    personId: selectedPersonId,
    field: field.name || "",
    name: card.querySelector("[name=name]")?.value ?? "",
    notes: card.querySelector(".special-notes [name=notes]")?.value ?? "",
    phone: card.querySelector("form[data-form='contact'] [name=phone]")?.value ?? "",
    email: card.querySelector("form[data-form='contact'] [name=email]")?.value ?? "",
    household: card.querySelector("form[data-form='contact'] [name=household]")?.value ?? "",
    address: card.querySelector("form[data-form='contact'] [name=address]")?.value ?? "",
    priesthood: card.querySelector("form[data-form='facts'] [name=priesthood]")?.value ?? "",
    age: card.querySelector("form[data-form='facts'] [name=age]")?.value ?? "",
    birthday: card.querySelector("form[data-form='facts'] [name=birthday]")?.value ?? "",
    start: field.selectionStart,
    end: field.selectionEnd,
  };
}

function restoreContactDraft(draft) {
  if (!draft || draft.personId !== selectedPersonId) return;
  const card = contactCard();
  if (!card) return;
  const name = card.querySelector("[name=name]");
  const notes = card.querySelector(".special-notes [name=notes]");
  const phone = card.querySelector("form[data-form='contact'] [name=phone]");
  const email = card.querySelector("form[data-form='contact'] [name=email]");
  const household = card.querySelector("form[data-form='contact'] [name=household]");
  const address = card.querySelector("form[data-form='contact'] [name=address]");
  const priesthood = card.querySelector("form[data-form='facts'] [name=priesthood]");
  const age = card.querySelector("form[data-form='facts'] [name=age]");
  const birthday = card.querySelector("form[data-form='facts'] [name=birthday]");
  if (name) name.value = draft.name;
  if (notes) notes.value = draft.notes;
  if (phone) phone.value = draft.phone;
  if (email) email.value = draft.email;
  if (household) household.value = draft.household;
  if (address) address.value = draft.address;
  if (priesthood) priesthood.value = draft.priesthood;
  if (age) age.value = draft.age;
  if (birthday) birthday.value = draft.birthday;
  const contact = card.querySelector("form[data-form='contact']");
  if (contact) syncContactLinks(contact);
  const field = card.querySelector(`[name="${draft.field}"]`);
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement) && !(field instanceof HTMLSelectElement)) return;
  field.focus();
  if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && typeof draft.start === "number" && typeof draft.end === "number") {
    field.setSelectionRange(draft.start, draft.end);
  }
}

function saveYouthCompanion(youthId, companion, options = {}) {
  const youth = (state?.people || []).find((person) => person.id === youthId);
  if (!youth) return Promise.resolve();
  const next = String(companion || "").trim();
  const current = ministeringCompanionValue(youth, ministeringForYouth(nameKey(youth)).families);
  if (next === current) return Promise.resolve();
  const families = ministeringForYouth(nameKey(youth)).families;
  const saved = post(`/api/people/${youthId}/contact`, { companion: next }).then(async () => {
    for (const family of families) {
      const assigned = [nameKey(youth)];
      if (next) assigned.push(next);
      await post(`/api/people/${family.id}/contact`, { assigned });
    }
  });
  return options.render === false ? saved : saved.then(render);
}

function saveAssignmentName(personId, name) {
  const person = (state?.people || []).find((item) => item.id === personId);
  const next = String(name || "").trim();
  if (!person || !next || next === nameKey(person)) return Promise.resolve();
  return post(`/api/people/${personId}/contact`, { name: next }).then(render);
}

function saveDirectoryAssignment(form) {
  const youth = form.querySelector("[name=youth]")?.value.trim() || "";
  if (!youth) return;
  const companion = form.querySelector("[name=companion]")?.value.trim() || "";
  post("/api/directory/assign", {
    directoryId: form.dataset.id,
    youth,
    companion,
  }).then((next) => {
    state = next;
    render();
  }).catch(showError);
}

function readDirectoryDraft() {
  if (page !== "directory") return null;
  const card = contactCard();
  const field = document.activeElement;
  if (!card || !field || !card.contains(field)) return null;
  if (!field.closest("form[data-form='directory-contact']")) return null;
  return {
    id: directoryFocus?.directoryId || "",
    member: directoryFocus?.member || "",
    field: field.name || "",
    address: card.querySelector("[name=address]")?.value ?? "",
    phone: card.querySelector("[name=phone]")?.value ?? "",
    email: card.querySelector("[name=email]")?.value ?? "",
    start: field.selectionStart,
    end: field.selectionEnd,
  };
}

function restoreDirectoryDraft(draft) {
  if (!draft || draft.id !== directoryFocus?.directoryId || draft.member !== directoryFocus?.member) return;
  const card = contactCard();
  if (!card) return;
  const address = card.querySelector("[name=address]");
  const phone = card.querySelector("[name=phone]");
  const email = card.querySelector("[name=email]");
  if (address) address.value = draft.address;
  if (phone) phone.value = draft.phone;
  if (email) email.value = draft.email;
  const form = card.querySelector("form[data-form='directory-contact']");
  if (form) syncContactLinks(form);
  const field = card.querySelector(`[name="${draft.field}"]`);
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement)) return;
  field.focus();
  if (typeof draft.start === "number" && typeof draft.end === "number") field.setSelectionRange(draft.start, draft.end);
}

function saveDirectoryContact() {
  const card = contactCard();
  const entry = directoryFocusedEntry();
  if (!card || !entry || page !== "directory") return;
  const record = entry.record;
  const address = card.querySelector("[name=address]")?.value.trim() ?? "";
  const phoneInput = card.querySelector("[name=phone]");
  const phone = formatPhone(phoneInput?.value ?? "");
  const email = card.querySelector("[name=email]")?.value.trim() ?? "";
  const same = address === String(record.address || "").trim()
    && phone === String(record.phone || "").trim()
    && email === String(record.email || "").trim();
  if (same) return;
  const members = (record.members || []).map((member) => directoryPersonName(record, member)).join("\n");
  post("/api/directory/household", {
    directoryId: record.id,
    name: record.name,
    members,
    address,
    phone,
    email,
  }).then((next) => {
    state = next;
    render();
  }).catch(showError);
}

function saveContactFields() {
  const card = contactCard();
  if (!card || !selectedPersonId) return;
  const nameInput = card.querySelector("[name=name]");
  const typedName = nameInput?.value.trim() ?? "";
  const notes = card.querySelector(".special-notes [name=notes]")?.value.trim() ?? "";
  const phoneInput = card.querySelector("form[data-form='contact'] [name=phone]");
  const phone = formatPhone(phoneInput?.value ?? "");
  if (phoneInput && phoneInput.value !== phone) phoneInput.value = phone;
  const email = card.querySelector("form[data-form='contact'] [name=email]")?.value.trim() ?? "";
  const householdInput = card.querySelector("form[data-form='contact'] [name=household]");
  const addressInput = card.querySelector("form[data-form='contact'] [name=address]");
  const household = householdInput ? householdInput.value.trim() : "";
  const address = addressInput ? addressInput.value.trim() : "";
  const priesthood = card.querySelector("form[data-form='facts'] [name=priesthood]")?.value.trim() ?? "";
  const age = card.querySelector("form[data-form='facts'] [name=age]")?.value.trim() ?? "";
  const birthday = card.querySelector("form[data-form='facts'] [name=birthday]")?.value.trim() ?? "";
  const person = selectedPerson();
  const currentName = person ? nameKey(person) : "";
  if (!typedName && nameInput && currentName) nameInput.value = currentName;
  const payload = { notes, phone, email, priesthood, age, birthday };
  if (householdInput) payload.household = household;
  if (addressInput) payload.address = address;
  if (typedName && typedName !== currentName) payload.name = typedName;
  const sameHousehold = !householdInput || household === (person?.household || "");
  const sameAddress = !addressInput || address === (person?.sheetColumns?.Address || "");
  if (person && !payload.name && sameHousehold && sameAddress && notes === (person.notes || "") && phone === (person.phone || "") && email === (person.email || "") && priesthood === (person.priesthood || "") && age === (person.age || "") && birthday === (person.birthday || "")) return;
  post(`/api/people/${selectedPersonId}/contact`, payload).then((next) => {
    state = next;
    render();
  }).catch(showError);
}

function render() {
  if (blankPlanFor && blankPlanFor !== selectedPersonId) blankPlanFor = "";
  if (inbox && !inboxMessages().length) inbox = "";
  const contactDraft = readContactDraft();
  renderPageChrome();
  renderPresidency();
  renderCalendar();
  renderMessageInbox();
  if (!state) {
    app.innerHTML = `<p class="empty">Loading the portal…</p>`;
    return;
  }
  if (inbox) {
    app.innerHTML = commentsView();
    return;
  }
  if (page === "directory") {
    const listScroll = preserveListScroll ? (document.querySelector("#person-list")?.scrollTop ?? 0) : 0;
    const directoryDraft = readDirectoryDraft();
    app.innerHTML = directoryView();
    restoreDirectoryDraft(directoryDraft);
    const list = document.querySelector("#person-list");
    if (list) list.scrollTop = listScroll;
    return;
  }
  if (page !== "youth" && !eldersPeople().length && view === "people") {
    app.innerHTML = `${tabs()}${rosterNeeded()}`;
    return;
  }
  const listScroll = preserveListScroll ? (document.querySelector("#person-list")?.scrollTop ?? 0) : 0;
  app.innerHTML = `${tabs()}${summary()}${view === "people" ? peopleView() : view === "month" ? monthView() : importView()}`;
  restoreContactDraft(contactDraft);
  const list = document.querySelector("#person-list");
  if (list) {
    list.scrollTop = listScroll;
    requestAnimationFrame(() => {
      const current = document.querySelector("#person-list");
      if (current) current.scrollTop = listScroll;
    });
  }
  if (focusReachOutDate) {
    focusReachOutDate = false;
    document.querySelector('form[data-form="plan"] input[name="date"]')?.focus();
  }
}

function renderPageChrome() {
  document.body.dataset.page = page;
  document.querySelectorAll("[data-page-header]").forEach((block) => {
    block.hidden = false;
  });
  document.querySelectorAll("[data-page-link]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.pageLink === page ? "true" : "false");
  });
  presidencyHost?.setAttribute("aria-label", page === "youth" ? "Youth quorums" : "EQ Presidency");
}

function isYouthMember(person) {
  return person?.group === "priests" || person?.group === "teachers";
}

function isYouthVisit(person) {
  return person?.list === "youth";
}

function eldersPeople() {
  return (state?.people || []).filter((person) => !isYouthMember(person) && !isYouthVisit(person));
}

function youthMembers(group = "all") {
  return (state?.people || []).filter((person) => isYouthMember(person) && (group === "all" || person.group === group));
}

function youthVisits() {
  return (state?.people || []).filter((person) => isYouthVisit(person));
}

function pagePeople() {
  return page === "youth" ? youthVisits() : eldersPeople();
}

function renderPresidency() {
  if (!presidencyHost) return;
  const active = document.activeElement;
  if (active && presidencyHost.contains(active) && active.matches("input, textarea, select")) return;
  if (page === "youth") {
    presidencyHost.innerHTML = renderYouthRosters();
    return;
  }
  const members = state?.presidency || [];
  if (!members.length) {
    presidencyHost.innerHTML = "";
    return;
  }
  presidencyHost.innerHTML = `<form class="presidency-board">
    <p class="eyebrow">EQ Presidency</p>
    <span class="pres-head">Name</span>
    <span class="pres-head">Phone</span>
    <span class="pres-head">Email</span>
    <span class="pres-head">Position</span>
    ${members.map((member, index) => `<span class="pres-name-line"><input id="pres-name-${index}" class="pres-name${index === 0 ? " is-president" : ""}" name="name-${index}" value="${esc(member.name)}" required autocomplete="off" aria-label="${esc(member.role)} name">${assignedCountButton(member.name, eldersPeople())}</span>
      <input name="phone-${index}" type="tel" inputmode="tel" autocomplete="off" value="${esc(formatPhone(member.phone || ""))}" aria-label="${esc(member.role)} phone" placeholder="Phone">
      <input name="email-${index}" type="email" inputmode="email" autocomplete="off" value="${esc(member.email || "")}" aria-label="${esc(member.role)} email" placeholder="Email">
      <p class="position${index === 0 ? " is-president" : ""}">${esc(member.role)}</p>`).join("")}
  </form>`;
}

function renderCalendar() {
  const host = document.querySelector("#month-calendar");
  if (!host) return;
  const now = new Date();
  const year = calendarMonth.getFullYear();
  const monthIndex = calendarMonth.getMonth();
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const title = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const viewingNow = year === now.getFullYear() && monthIndex === now.getMonth();
  const marks = state?.calendarMarks || {};
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
  const cells = weekdays.map((label) => `<span class="cal-dow">${label}</span>`);
  for (let index = 0; index < firstWeekday; index += 1) cells.push(`<span class="cal-day is-empty"></span>`);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${monthKey}-${String(day).padStart(2, "0")}`;
    const mark = marks[iso] || {};
    const kinds = mark.kinds || [];
    const people = mark.people || [];
    const dots = kinds.map((kind) => {
      const label = kind === "scheduled" ? "Scheduled" : kind === "reschedule" ? "Re-Schedule" : kind === "driveby" ? "Drive by" : "Reach out";
      return `<span class="cal-dot ${kind}" title="${label}"></span>`;
    }).join("");
    const described = [`${title} ${day}`];
    if (kinds.includes("scheduled")) described.push("scheduled");
    if (kinds.includes("reschedule")) described.push("re-schedule");
    if (kinds.includes("reach_out")) described.push("reach out");
    if (kinds.includes("driveby")) described.push("drive by");
    const today = viewingNow && day === now.getDate() ? " is-today" : "";
    const open = dayFilter === iso ? " is-open" : "";
    const inner = `<span class="cal-marks">${dots}</span><span class="cal-num">${day}</span>`;
    if (people.length) {
      described.push("show the brothers for this day");
      cells.push(`<button type="button" class="cal-day${today}${open}" data-action="open-day" data-date="${iso}" data-marks="${esc(kinds.join(" "))}" aria-pressed="${dayFilter === iso}" aria-label="${esc(described.join(", "))}">${inner}</button>`);
    } else {
      cells.push(`<span class="cal-day${today}${open}" data-date="${iso}" data-marks="${esc(kinds.join(" "))}" aria-label="${esc(described.join(", "))}">${inner}</span>`);
    }
  }
  host.innerHTML = `<div class="cal-nav">
      <button type="button" class="cal-shift" data-action="shift-month" data-delta="-1" aria-label="Previous month">‹</button>
      <p class="cal-title">${esc(title)}</p>
      <button type="button" class="cal-shift" data-action="shift-month" data-delta="1" aria-label="Next month">›</button>
    </div>
    <div class="cal-grid">${cells.join("")}</div>`;
}

const YOUTH_SECTIONS = [
  ["priests-presidency", "priests", "presidency", "Priests Quorum"],
  ["priests-adults", "priests", "adults", "Priests Quorum Adult Leaders"],
  ["teachers-presidency", "teachers", "presidency", "Teachers Quorum"],
  ["teachers-adults", "teachers", "adults", "Teachers Quorum Adult Leaders"],
];

const YOUTH_LISTS = [
  ["priests-quorum", "Priests Quorum", "priests"],
  ["teachers-quorum", "Teachers Quorum", "teachers"],
  ["leaders", "Leaders", ""],
];

const openYouthSections = new Set();

function renderYouthRosters() {
  const leadership = state?.youthLeadership || { priests: [], teachers: [] };
  return `<div class="youth-boards">${YOUTH_SECTIONS.map(([id, quorum, section, label]) => {
    const open = openYouthSections.has(id);
    const rows = (leadership[quorum] || []).map((row, index) => ({ row, index })).filter((item) => item.row.section === section);
    const members = section === "presidency" ? quorumMembers(quorum, leadership[quorum] || []) : [];
    return `<section class="youth-section">
      <button type="button" class="roster-title" data-action="toggle-youth-section" data-section="${id}" aria-expanded="${open}">${esc(label)}</button>
      ${open ? youthSectionBoard(quorum, label, rows, members) : ""}
    </section>`;
  }).join("")}</div>`;
}

function quorumMembers(quorum, leaders) {
  const used = new Set(leaders.map((row) => String(row.name || "").trim().toLowerCase()).filter(Boolean));
  return youthMembers(quorum).filter((person) => !used.has(nameKey(person).trim().toLowerCase()));
}

function youthSectionBoard(quorum, label, rows, members) {
  const visits = youthVisits();
  const leaderRows = rows.map(({ row, index }) => {
    const president = index === 0 ? " is-president" : "";
    return `<span class="pres-name-line"><input class="pres-name${president}" name="name-${quorum}-${index}" value="${esc(row.name || "")}" autocomplete="off" aria-label="${esc(label)} ${esc(row.role)} name">${assignedCountButton(row.name, visits, quorum)}</span>
      <input name="phone-${quorum}-${index}" type="tel" inputmode="tel" autocomplete="off" value="${esc(formatPhone(row.phone || ""))}" aria-label="${esc(row.role)} phone" placeholder="Phone">
      <input name="email-${quorum}-${index}" type="email" inputmode="email" autocomplete="off" value="${esc(row.email || "")}" aria-label="${esc(row.role)} email" placeholder="Email">
      <p class="position${president}">${esc(row.role)}</p>`;
  }).join("");
  const memberLabel = members.length ? `<span class="pres-section">Members</span>` : "";
  const memberRows = members.map((person) => `<span class="pres-name-line"><input class="pres-name" name="name-member-${esc(person.id)}" value="${esc(nameKey(person))}" autocomplete="off" aria-label="${esc(nameKey(person))} name">${assignedCountButton(nameKey(person), visits, quorum)}</span>
      <input name="phone-member-${esc(person.id)}" type="tel" inputmode="tel" autocomplete="off" value="${esc(formatPhone(person.phone || ""))}" aria-label="${esc(nameKey(person))} phone" placeholder="Phone">
      <input name="email-member-${esc(person.id)}" type="email" inputmode="email" autocomplete="off" value="${esc(person.email || "")}" aria-label="${esc(nameKey(person))} email" placeholder="Email">
      <p class="position">${esc(person.priesthood || (quorum === "teachers" ? "Teacher" : "Priest"))}</p>`).join("");
  return `<form class="presidency-board quorum-${quorum}" data-quorum="${quorum}">
    <span class="pres-head">Name</span>
    <span class="pres-head">Phone</span>
    <span class="pres-head">Email</span>
    <span class="pres-head">Position</span>
    ${leaderRows}
    ${memberLabel}
    ${memberRows}
  </form>`;
}

function openCalendarDay(iso) {
  const fromDirectory = page === "directory";
  if (fromDirectory) page = "elders";
  const people = peopleForDay(iso);
  if (!people.length) {
    if (fromDirectory) page = "directory";
    return;
  }
  inbox = "";
  viewAll = false;
  assigneeFilter = "";
  dayFilter = iso;
  archiveOpen = people.every((person) => personIsArchived(person));
  archiveChoicesFor = "";
  statusFilter = "all";
  officeFilter = "all";
  search = "";
  view = "people";
  detailForm = null;
  selectedPersonId = people[0].id;
  render();
  const current = document.querySelector("#person-list .person[aria-current='true']");
  const list = document.querySelector("#person-list");
  if (current && list) {
    const top = current.offsetTop - list.offsetTop;
    const bottom = top + current.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }
}

function peopleForDay(iso) {
  const mark = state?.calendarMarks?.[iso] || {};
  const ids = new Set(mark.people || []);
  const prefer = new Set(mark.kinds || []);
  const source = page === "youth" ? [...youthMembers(), ...youthVisits()] : pagePeople();
  return source
    .filter((person) => ids.has(person.id))
    .slice()
    .sort((a, b) => {
      const rank = (person) => (prefer.has(person.rosterStatusKey) ? 0 : 1);
      return rank(a) - rank(b) || nameKey(a).localeCompare(nameKey(b), "en", { sensitivity: "base" });
    });
}

function commentsView() {
  const youth = inbox === "youth";
  const messages = inboxMessages();
  const members = youth ? [] : (state.presidency || []).filter((member) => member.name);
  const visible = commentFor ? messages.filter((message) => (message.mentions || []).includes(commentFor)) : messages;
  const nameButton = (name, count) => {
    const pressed = commentFor === name;
    return `<button type="button" data-action="comment-for" data-name="${esc(name)}" aria-pressed="${pressed}">${esc(name || "All")} ${count}</button>`;
  };
  return `<section class="comment-list" aria-label="${youth ? "Youth comments" : "Comments"}">
    <div class="comment-filters" role="group" aria-label="Whose comments">
      ${nameButton("", messages.length)}
      ${members.map((member) => nameButton(member.name, messages.filter((message) => (message.mentions || []).includes(member.name)).length)).join("")}
    </div>
    ${visible.map((message) => `<article class="comment" id="comment-${esc(message.id)}">
      ${message.personName ? `<button type="button" class="comment-who" data-action="open-comment-person" data-id="${esc(message.personId)}" data-comment="${esc(message.id)}">${esc(message.personName)}</button>` : ""}
      <div class="comment-text">${mentionHtml(message.body)}</div>
      <p class="needs-answer">Needs an answer</p>
      ${answerTools(message.id)}
    </article>`).join("")}
    ${commentFor && !visible.length ? `<p class="empty">No comments for ${esc(commentFor)}.</p>` : ""}
  </section>`;
}

function renderMessageInbox() {
  paintInboxButton(document.querySelector("#message-inbox"), "elders");
  paintInboxButton(document.querySelector("#youth-message-inbox"), "youth");
}

function paintInboxButton(button, which) {
  if (!button) return;
  button.setAttribute("aria-pressed", inbox === which ? "true" : "false");
  const count = inboxMessages(which).length;
  const bubble = button.querySelector(".message-bubble");
  if (bubble) {
    bubble.hidden = count === 0;
    bubble.textContent = String(count);
  }
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
  const assignments = showingAssignments();
  const youthLists = showingYouthLists();
  list.innerHTML = youthLists ? youthListMarkup() : assignments ? assignmentListMarkup() : personButtons();
  const count = document.querySelector("#people-card .muted");
  if (count && (youthLists || assignments)) {
    const total = assignments ? visibleAssignments().length : youthVisibleEntries().length;
    const noun = assignments ? (total === 1 ? "assignment" : "assignments") : (total === 1 ? "person" : "people");
    count.textContent = `${total} ${noun}`;
  }
}

function monthValue() {
  return monthInput?.value || currentMonth();
}

function privateOn() {
  return true;
}

function savedAuthor() {
  return (authorInput?.value || localStorage.getItem("mvp-author") || "").trim();
}

function tabs() {
  if (state?.rosterMode) return "";
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

function personIsArchived(person) {
  return ARCHIVE_STATUS_ORDER.includes(person?.rosterStatusKey || "") || Boolean(person?.onMission);
}

function applyMission(personId, force) {
  const person = (state?.people || []).find((item) => item.id === personId);
  const currently = Boolean(person?.onMission || person?.rosterStatusKey === "mission");
  const on = force === true ? true : force === false ? false : !currently;
  viewAll = false;
  assigneeFilter = "";
  dayFilter = "";
  search = "";
  officeFilter = "all";
  if (on) {
    archiveOpen = true;
    statusFilter = "mission";
  }
  const status = on ? "Mission" : (person?.rosterStatusKey === "mission" ? "" : (person?.rosterStatus || ""));
  archiveChoicesFor = "";
  post(`/api/people/${personId}/status`, { status, mission: on }).then((next) => {
    state = next;
    selectedPersonId = personId;
    render();
  }).catch(showError);
}

function applyStatus(personId, status, options = {}) {
  if (status === "Reach Out") focusReachOutDate = true;
  if (!options.keepView) {
    const archiveKey = {
      Moved: "moved",
      Mission: "mission",
      "Do Not Contact": "do_not_contact",
      "Not Interested": "not_interested",
      "No Contact Info": "no_contact_info",
      Declined: "declined",
      Visited: "visited",
    }[status];
    if (archiveKey) {
      viewAll = false;
      assigneeFilter = "";
      archiveOpen = true;
      statusFilter = archiveKey;
      dayFilter = "";
      search = "";
      officeFilter = "all";
    } else {
      const activeKey = {
        "Reach Out": "reach_out",
        "No Response": "no_response",
        "Re-Schedule": "reschedule",
        Scheduled: "scheduled",
        "Drive by": "driveby",
      }[status] || "none";
      viewAll = false;
      assigneeFilter = "";
      if (archiveOpen) archiveOpen = false;
      if (statusFilter !== "all" && statusFilter !== activeKey) statusFilter = "all";
    }
  }
  archiveChoicesFor = "";
  post(`/api/people/${personId}/status`, { status }).then((next) => {
    state = next;
    selectedPersonId = personId;
    const person = selectedPerson();
    if (options.keepView && (!person || !personMatchesFilters(person))) selectedPersonId = null;
    render();
  }).catch(showError);
}

function rosterSummary() {
  if (page === "youth") return youthRosterSummary();
  const source = eldersPeople();
  const cohort = source.filter((person) => personIsArchived(person) === archiveOpen);
  const counts = {};
  for (const person of cohort) {
    const key = person.rosterStatusKey || "none";
    counts[key] = (counts[key] || 0) + 1;
  }
  if (archiveOpen) counts.mission = cohort.filter((person) => person.onMission || person.rosterStatusKey === "mission").length;
  const archivedCount = source.filter((person) => personIsArchived(person)).length;
  const activeCount = source.length - archivedCount;
  const keys = archiveOpen ? ARCHIVE_STATUS_ORDER : ROSTER_STATUS_ORDER.filter((key) => counts[key]);
  const offices = [...new Set(cohort.map((person) => person.priesthood).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const archiveButton = `<button type="button" class="archive-toggle" data-action="archive" aria-pressed="${!viewAll && archiveOpen}">Archive ${archivedCount}</button>`;
  const visitButton = archiveOpen && !viewAll
    ? `<button type="button" data-action="show-people">To Visit ${activeCount}</button>`
    : filterButton("all", activeCount, "To Visit");
  const statusButtons = keys.map((key) => filterButton(key, counts[key] || 0, STATUS_LABELS[key] || key)).join("");
  const allButton = `<button type="button" data-action="view-all" aria-pressed="${viewAll}">All ${source.length}</button>`;
  return `<div class="summary" aria-label="${page === "youth" ? "Youth filters" : "Brother filters"}">
    ${allButton}
    ${visitButton}
    ${archiveOpen ? `${archiveButton}${statusButtons}` : `${statusButtons}${archiveButton}`}
    <label class="inline-filter">Priesthood
      <select data-action="office" aria-label="Filter by priesthood">
        <option value="all" ${officeFilter === "all" ? "selected" : ""}>All offices</option>
        ${offices.map((office) => `<option value="${esc(office)}" ${officeFilter === office ? "selected" : ""}>${esc(office)}</option>`).join("")}
      </select>
    </label>
  </div>`;
}

function filterButton(status, count, label = STATUS_LABELS[status]) {
  const pressed = !viewAll && !dayFilter && statusFilter === status && (status === "all" ? !archiveOpen : true);
  return `<button type="button" data-action="filter" data-status="${status}" aria-pressed="${pressed}">${esc(label)} ${count}</button>`;
}

function countStatuses() {
  const counts = { not_contacted: 0, awaiting_reply: 0, replied: 0, scheduled: 0, completed: 0, declined: 0 };
  for (const person of state.people) counts[person.outreachStatus] += 1;
  return counts;
}

function listTitle() {
  if (assigneeFilter) return assigneeFilter;
  if (viewAll) return "All";
  if (dayFilter) return formatDate(dayFilter);
  if (archiveOpen && statusFilter === "all") return "Archive";
  if (statusFilter !== "all") return STATUS_LABELS[statusFilter];
  return "To Visit";
}

function peopleView() {
  const youthLists = showingYouthLists();
  const assignments = showingAssignments();
  const people = youthLists || assignments ? [] : filteredPeople();
  const title = assignments ? "Assignments" : youthLists ? youthListTitle() : listTitle();
  const total = assignments ? visibleAssignments().length : youthLists ? youthVisibleEntries().length : people.length;
  const addingPerson = detailForm === "add-person" && page !== "youth";
  const showDetail = !state.rosterMode || Boolean(selectedPersonId) || addingPerson;
  const noun = assignments
    ? (total === 1 ? "assignment" : "assignments")
    : page === "youth" ? (total === 1 ? "person" : "people") : (total === 1 ? "brother" : "brothers");
  const markup = youthLists ? youthListMarkup() : assignments ? assignmentListMarkup() : personButtons(people);
  return `<section class="layout${showDetail ? "" : " layout-single"}">
    <div class="card" id="people-card">
      <div class="row">
        <h2>${esc(title)}</h2>
        ${page === "youth" ? "" : `<button type="button" class="ghost" data-action="form" data-form="add-person">Add a person</button>`}
      </div>
      <p class="muted">${total} ${state.rosterMode ? noun : "in this list"}</p>
      <input id="search" class="search" type="search" placeholder="Search by name" value="${esc(search)}" aria-label="Search by name">
      <div id="person-list" class="person-list">${markup}</div>
    </div>
    ${showDetail ? `<div class="card">${addingPerson ? addPersonForm() : personDetail()}</div>` : ""}
  </section>`;
}

function showingAssignments() {
  return page === "youth" && youthList === "assignments" && !archiveOpen && !assigneeFilter && !dayFilter;
}

function showingYouthLists() {
  return page === "youth" && youthList !== "visits" && youthList !== "assignments" && !archiveOpen && !assigneeFilter && !dayFilter;
}

function visibleAssignments() {
  const needle = search.trim().toLowerCase();
  return youthVisits()
    .filter((person) => !personIsArchived(person))
    .filter((person) => {
      if (!needle) return true;
      const name = nameKey(person).toLowerCase();
      const household = String(person.household || "").toLowerCase();
      const address = String(person.sheetColumns?.Address || "").toLowerCase();
      return name.includes(needle) || household.includes(needle) || address.includes(needle);
    })
    .sort((a, b) => nameKey(a).localeCompare(nameKey(b), "en", { sensitivity: "base" }));
}

function assignmentListMarkup() {
  const people = visibleAssignments();
  if (!people.length) return `<p class="empty">No assignments${search.trim() ? " match this search" : ""}.</p>`;
  return `<div class="ministering-cards assignment-cards">${people.map((person) => roleCard(person, "Assignment")).join("")}</div>`;
}

function youthListTitle() {
  if (youthList === "none") return "None";
  return YOUTH_LISTS.find(([id]) => id === youthList)?.[1] || "All";
}

function youthWithoutCompanions(quorum = "all") {
  const needle = search.trim().toLowerCase();
  return youthMembers(quorum)
    .filter((person) => !hasCompanionPair(nameKey(person)))
    .filter((person) => !needle || nameKey(person).toLowerCase().includes(needle))
    .sort((a, b) => nameKey(a).localeCompare(nameKey(b), "en", { sensitivity: "base" }));
}

function youthRosterEntries(quorum, section) {
  const leadership = state?.youthLeadership?.[quorum] || [];
  const entries = [];
  const used = new Set();
  leadership.forEach((row, index) => {
    if (row.section !== section) return;
    const name = String(row.name || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (used.has(key)) return;
    used.add(key);
    const person = youthMembers(quorum).find((item) => nameKey(item).trim().toLowerCase() === key);
    if (person) entries.push({ kind: "person", person, role: row.role });
    else entries.push({ kind: "leader", name, role: row.role, quorum, index });
  });
  if (section === "presidency") {
    for (const person of youthMembers(quorum)) {
      const key = nameKey(person).trim().toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      entries.push({ kind: "person", person, role: person.priesthood || "" });
    }
  }
  return entries;
}

function youthEntryName(entry) {
  return entry.kind === "person" ? nameKey(entry.person) : entry.name;
}

function youthEntryVisible(entry) {
  const needle = search.trim().toLowerCase();
  if (needle && !youthEntryName(entry).toLowerCase().includes(needle)) return false;
  if (officeFilter !== "all") {
    if (entry.kind !== "person" || entry.person.priesthood !== officeFilter) return false;
  }
  return true;
}

function ministeringForYouth(name) {
  const key = String(name || "").trim().toLowerCase();
  const visits = youthVisits().filter((person) => String(person.assigned?.[0] || "").trim().toLowerCase() === key);
  const companion = visits.map((person) => person.assigned?.[1]).find((item) => String(item || "").trim()) || "";
  return { companion, families: visits };
}

function ministeringCompanionValue(person, families) {
  const fromVisit = (families || []).map((item) => item.assigned?.[1]).find((item) => String(item || "").trim());
  return fromVisit || person.sheetColumns?.Companion || "";
}

function ministeringRows(quorum) {
  const needle = search.trim().toLowerCase();
  return youthMembers(quorum)
    .map((person) => ({ person, ...ministeringForYouth(nameKey(person)) }))
    .filter((row) => {
      if (officeFilter !== "all" && row.person.priesthood !== officeFilter) return false;
      if (!needle) return true;
      const haystack = [nameKey(row.person), row.companion, ...row.families.map((person) => nameKey(person))].join(" ").toLowerCase();
      return haystack.includes(needle);
    })
    .sort((a, b) => nameKey(a.person).localeCompare(nameKey(b.person), "en", { sensitivity: "base" }));
}

function findPersonByName(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  return (state?.people || []).find((person) => nameKey(person).trim().toLowerCase() === key) || null;
}

function mapsHref(address) {
  const query = String(address || "").replace(/\s+/g, " ").trim();
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function addressPill(address) {
  const text = String(address || "").trim();
  const href = mapsHref(text);
  if (!href) return "";
  return `<a class="tiny address-pill" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Map</a>`;
}

function contactLines(person) {
  if (!person) return "";
  const parts = [];
  const household = String(person.household || "").trim();
  const address = String(person.sheetColumns?.Address || "").trim();
  const phone = String(person.phone || "").trim();
  const email = String(person.email || "").trim();
  if (household) parts.push(`<small class="contact-line">${esc(household)}</small>`);
  if (address) parts.push(`<small class="contact-line">${esc(address)}</small>`);
  if (phone) parts.push(`<small class="contact-line">${esc(phone)}</small>`);
  if (email) parts.push(`<small class="contact-line">${esc(email)}</small>`);
  return parts.join("");
}

function householdLine(person) {
  const text = String(person?.household || "").trim();
  if (!text) return "";
  return `<p class="household-line"><span>Household</span>${esc(text)}</p>`;
}

function directoryPersonName(record, member) {
  const given = String(member || "").replace(/\s*\(out-of-unit\)\s*/ig, " ").replace(/\s+/g, " ").trim();
  if (!given) return "";
  if (given.includes(",")) return given;
  const last = String(record?.name || "").split(",")[0].trim();
  if (last && given.toLowerCase().endsWith(` ${last.toLowerCase()}`)) {
    const first = given.slice(0, given.length - last.length).trim();
    if (first) return `${last}, ${first}`;
  }
  return last ? `${last}, ${given}` : given;
}

function directoryEntries() {
  const people = [];
  for (const row of state?.directory || []) {
    for (const member of row.members || []) {
      const name = directoryPersonName(row, member);
      if (!name) continue;
      people.push({ name, member, directoryId: row.id, household: row.name, record: row });
    }
  }
  return people.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.household.localeCompare(b.household, "en", { sensitivity: "base" }));
}

function directoryFocusedEntry() {
  if (!directoryFocus?.directoryId || !directoryFocus.member) return null;
  const record = (state?.directory || []).find((row) => row.id === directoryFocus.directoryId);
  if (!record || !(record.members || []).includes(directoryFocus.member)) return null;
  return {
    record,
    member: directoryFocus.member,
    name: directoryPersonName(record, directoryFocus.member),
    household: record.name,
    directoryId: record.id,
  };
}

function directoryPeople() {
  const people = [];
  const seen = new Set();
  for (const row of state?.directory || []) {
    for (const member of row.members || []) {
      const name = directoryPersonName(row, member);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      people.push({ name, directoryId: row.id, member, companion: directoryCompanionFor(name) });
    }
  }
  return people.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

function directoryCompanionFor(fullName) {
  const key = String(fullName || "").trim().toLowerCase();
  if (!key) return "";
  for (const row of state?.directory || []) {
    for (const member of row.members || []) {
      if (directoryPersonName(row, member).toLowerCase() !== key) continue;
      const saved = row.memberCompanions?.[member.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ")];
      if (saved) return saved;
    }
  }
  const youth = (state?.people || []).find((person) => (person.group === "priests" || person.group === "teachers") && directoryNameMatches(nameKey(person), fullName));
  return youth?.sheetColumns?.Companion || "";
}

function pairedCompanionName(fullName) {
  const direct = directoryCompanionFor(fullName);
  if (direct) return direct;
  for (const row of state?.directory || []) {
    for (const member of row.members || []) {
      const key = member.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
      const saved = row.memberCompanions?.[key];
      if (saved && directoryNameMatches(saved, fullName)) return directoryPersonName(row, member);
    }
  }
  for (const person of state?.people || []) {
    const companion = person.sheetColumns?.Companion;
    if (companion && directoryNameMatches(nameKey(person), fullName)) return companion;
    if (companion && directoryNameMatches(companion, fullName)) return nameKey(person);
    const assigned = person.list === "youth" ? person.assigned || [] : [];
    if (assigned[0] && assigned[1] && directoryNameMatches(assigned[0], fullName)) return assigned[1];
    if (assigned[0] && assigned[1] && directoryNameMatches(assigned[1], fullName)) return assigned[0];
  }
  return "";
}

function directoryVisitHomes(fullName) {
  return (state?.people || []).filter((person) => person.list === "youth" && (person.assigned || []).some((item) => directoryNameMatches(item, fullName)));
}

function directoryVisitNames(fullName) {
  const names = [];
  for (const person of directoryVisitHomes(fullName)) {
    const label = nameKey(person);
    if (label && !names.some((item) => directoryNameMatches(item, label))) names.push(label);
  }
  return names;
}

function nameVariants(value) {
  const raw = String(value || "").trim();
  const fold = (item) => String(item || "").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  const keys = [];
  const add = (item) => {
    const key = fold(item);
    if (key && !keys.includes(key)) keys.push(key);
  };
  add(raw);
  const comma = raw.indexOf(",");
  if (comma !== -1) add(`${raw.slice(comma + 1)} ${raw.slice(0, comma)}`);
  return keys;
}

let companionMarkState = null;
let companionMarkSet = null;

function peopleWithCompanions() {
  if (companionMarkState === state && companionMarkSet) return companionMarkSet;
  const set = new Set();
  const add = (value) => {
    for (const key of nameVariants(value)) set.add(key);
  };
  for (const row of state?.directory || []) {
    for (const member of row.members || []) {
      const key = member.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
      const companion = row.memberCompanions?.[key];
      if (!companion) continue;
      add(directoryPersonName(row, member));
      add(companion);
    }
  }
  for (const person of state?.people || []) {
    const companion = person.sheetColumns?.Companion;
    if (companion) {
      add(nameKey(person));
      add(companion);
    }
    if (person.list === "youth" && person.assigned?.[0] && person.assigned?.[1]) {
      add(person.assigned[0]);
      add(person.assigned[1]);
    }
  }
  companionMarkState = state;
  companionMarkSet = set;
  return set;
}

function hasCompanionPair(name) {
  const set = peopleWithCompanions();
  return nameVariants(name).some((key) => set.has(key));
}

function companionPill(name) {
  return hasCompanionPair(name) ? `<span class="pill companion-pair">Companion</span>` : "";
}

function noCompanionPill(name) {
  const youth = (state?.people || []).find((person) => (person.group === "priests" || person.group === "teachers") && nameVariants(nameKey(person)).some((key) => nameVariants(name).includes(key)));
  if (!youth || hasCompanionPair(name)) return "";
  return `<span class="pill no-companion">No companion</span>`;
}

function directoryNameMatches(left, right) {
  const fold = (value) => String(value || "").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  const variants = (value) => {
    const raw = String(value || "").trim();
    const keys = [fold(raw)];
    const comma = raw.indexOf(",");
    if (comma !== -1) keys.push(fold(`${raw.slice(comma + 1)} ${raw.slice(0, comma)}`));
    return keys;
  };
  const rightKeys = new Set(variants(right));
  return variants(left).some((key) => key && rightKeys.has(key));
}

function directoryOptions(selected) {
  const names = directoryPeople().map((person) => person.name);
  if (selected && !names.some((name) => name.toLowerCase() === String(selected).toLowerCase())) names.push(selected);
  names.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  return [`<option value="">—</option>`, ...names.map((name) => `<option value="${esc(name)}" ${name === selected ? "selected" : ""}>${esc(name)}</option>`)].join("");
}

function directoryMinister(name) {
  return (state?.people || []).find((person) => {
    if (isYouthVisit(person) || isYouthMember(person)) return false;
    return directoryNameMatches(nameKey(person), name) || directoryNameMatches(person.displayName, name);
  });
}

function directoryCompanionNotRequired(name) {
  const person = directoryMinister(name);
  if (!person) return false;
  return Boolean(person.onMission || person.rosterStatusKey === "mission" || person.rosterStatusKey === "do_not_contact");
}

function directoryStatusPills(name) {
  const person = directoryMinister(name);
  if (!person) return "";
  const pills = [];
  if (person.onMission || person.rosterStatusKey === "mission") pills.push(`<span class="pill mission">Mission</span>`);
  if (person.rosterStatusKey === "do_not_contact") pills.push(`<span class="pill do-not-contact">Do Not Contact</span>`);
  return pills.join("");
}

function directoryMissingCompanion(entry) {
  if (directoryCompanionNotRequired(entry.name)) return false;
  return !pairedCompanionName(entry.name);
}

function directorySharesHousehold(entry) {
  return (entry.record?.members || []).length > 1;
}

function directoryMissingHousehold(entry) {
  return !directorySharesHousehold(entry);
}

function directoryEntryVisible(entry, needle) {
  if (directoryFilter === "companion" && !directoryMissingCompanion(entry)) return false;
  if (directoryFilter === "household" && !directoryMissingHousehold(entry)) return false;
  if (!needle) return true;
  const haystack = [entry.name, entry.household, entry.record.address, entry.record.phone, entry.record.email, pairedCompanionName(entry.name)].join(" ").toLowerCase();
  return haystack.includes(needle);
}

function directoryVisibleEntries() {
  const needle = search.trim().toLowerCase();
  return directoryEntries().filter((entry) => directoryEntryVisible(entry, needle));
}

function directoryGapCount(kind) {
  return directoryEntries().filter((entry) => (kind === "companion" ? directoryMissingCompanion(entry) : directoryMissingHousehold(entry))).length;
}

function directoryHouseholdOptions(selectedId, sharedOnly = false) {
  return (state?.directory || [])
    .filter((row) => !sharedOnly || (row.members || []).length > 1)
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "en", { sensitivity: "base" }))
    .map((row) => `<option value="${esc(row.id)}" ${row.id === selectedId ? "selected" : ""}>${esc(row.name)}</option>`)
    .join("");
}

function directoryListMarkup(rows) {
  if (!rows.length) {
    if (!(state?.directory || []).length) return `<p class="empty">The directory has not been loaded.</p>`;
    if (search.trim()) return `<p class="empty">No people match this search.</p>`;
    if (directoryFilter === "companion") return `<p class="empty">Everyone in the directory has a companion.</p>`;
    if (directoryFilter === "household") return `<p class="empty">Everyone in the directory belongs to a household.</p>`;
    return `<p class="empty">No people are in the directory.</p>`;
  }
  return rows.map((entry) => {
    const open = directoryFocus?.directoryId === entry.directoryId && directoryFocus?.member === entry.member;
    const home = directorySharesHousehold(entry) ? `<small>${esc(entry.household)}</small>` : "";
    return `<div class="person" data-action="open-directory-person" data-id="${esc(entry.directoryId)}" data-member="${esc(entry.member)}" aria-current="${open ? "true" : "false"}">
      <strong>${esc(entry.name)}</strong>
      ${directoryStatusPills(entry.name)}
      ${home}
    </div>`;
  }).join("");
}

function directoryPersonCard(entry) {
  const record = entry.record;
  const phone = String(record.phone || "").trim();
  const email = String(record.email || "").trim();
  const address = String(record.address || "").trim();
  const companion = pairedCompanionName(entry.name);
  const visits = directoryVisitNames(entry.name);
  const visitLine = visits.length ? `<p class="muted">Visiting ${esc(visits.join(" · "))}</p>` : "";
  const status = directoryStatusPills(entry.name);
  return `<h2>${esc(entry.name)}</h2>
    ${status ? `<p class="status-row">${status}</p>` : ""}
    <form class="assign-row" data-form="directory-home" data-id="${esc(record.id)}" data-member="${esc(entry.member)}">
      <span>Household</span>
      <select name="household" aria-label="Household">${directorySharesHousehold(entry) ? "" : `<option value="">—</option>`}${directoryHouseholdOptions(directorySharesHousehold(entry) ? record.id : "", true)}</select>
    </form>
    <form class="contact-fields" data-form="directory-contact" data-id="${esc(record.id)}">
      <label class="wide">Address
        <textarea name="address" rows="3" aria-label="Address">${esc(address)}</textarea>
        <span class="contact-actions">${addressPill(address)}</span>
      </label>
      <div>
        <label>Phone <input name="phone" type="tel" autocomplete="off" inputmode="tel" value="${esc(formatPhone(phone))}" class="${phone ? "" : "is-missing"}" aria-label="Phone"></label>
        <span class="contact-actions">
          <a class="tiny" data-contact="call" href="${phone ? `tel:${esc(phone)}` : ""}" ${phone ? "" : "hidden"}>Call</a>
          <a class="tiny" data-contact="text" href="${phone ? `sms:${esc(phone)}` : ""}" ${phone ? "" : "hidden"}>Text</a>
        </span>
      </div>
      <div>
        <label>Email <input name="email" type="email" autocomplete="off" inputmode="email" value="${esc(email)}" class="${email ? "" : "is-missing"}" aria-label="Email"></label>
        <span class="contact-actions">
          <a class="tiny" data-contact="mail" href="${email ? `mailto:${esc(email)}` : ""}" ${email ? "" : "hidden"}>Email</a>
        </span>
      </div>
    </form>
    <form class="assign-row" data-form="directory-companion" data-id="${esc(record.id)}" data-member="${esc(entry.member)}">
      <span>Companion</span>
      <select name="companion" aria-label="Companion">${directoryOptions(companion)}</select>
    </form>
    <form class="assign-row" data-form="directory-visit" data-id="${esc(record.id)}" data-member="${esc(entry.member)}">
      <span>Household to visit</span>
      <select name="visit" aria-label="Household to visit"><option value="">—</option>${directoryHouseholdOptions("")}</select>
    </form>
    ${visitLine}
    <button type="button" class="ghost" data-action="remove-directory-member" data-id="${esc(record.id)}" data-member="${esc(entry.member)}">Remove member</button>`;
}

function directoryAddForm() {
  return `<h2>Add member</h2>
    <form class="stack" data-form="directory-add">
      <label>Name <input name="name" required autocomplete="off"></label>
      <label>Household
        <select name="householdId" aria-label="Household">
          <option value="">New household</option>
          ${directoryHouseholdOptions("")}
        </select>
      </label>
      <label>New household <input name="householdName" autocomplete="off" placeholder="Leave blank to use the name"></label>
      <button class="primary" type="submit">Save member</button>
    </form>`;
}

function directoryDetail() {
  if (directoryAdding) return directoryAddForm();
  const entry = directoryFocusedEntry();
  if (!entry) return `<h2>Directory</h2><p class="empty">Choose a person.</p>`;
  return directoryPersonCard(entry);
}

function directorySummary() {
  const companionCount = directoryGapCount("companion");
  const householdCount = directoryGapCount("household");
  return `<div class="summary" aria-label="Directory filters">
    <button type="button" data-action="directory-filter" data-filter="companion" aria-pressed="${directoryFilter === "companion"}">No companion ${companionCount}</button>
    <button type="button" data-action="directory-filter" data-filter="household" aria-pressed="${directoryFilter === "household"}">No household ${householdCount}</button>
  </div>`;
}

function directoryView() {
  const rows = directoryVisibleEntries();
  const noun = rows.length === 1 ? "person" : "people";
  return `<section class="layout">
    <div class="card">
      <div class="row">
        <h2>Member directory</h2>
        <button type="button" class="ghost" data-action="directory-add">Add member</button>
      </div>
      ${directorySummary()}
      <p class="muted" id="directory-count">${rows.length} ${noun}</p>
      <input id="search" class="search" type="search" placeholder="Search the directory" value="${esc(search)}" aria-label="Search the directory">
      <div id="person-list" class="person-list directory-list">${directoryListMarkup(rows)}</div>
    </div>
    <div class="card">${directoryDetail()}</div>
  </section>`;
}

function renderDirectoryList() {
  const list = document.querySelector("#person-list");
  if (!list) return;
  const rows = directoryVisibleEntries();
  list.innerHTML = directoryListMarkup(rows);
  const count = document.querySelector("#directory-count");
  if (count) count.textContent = `${rows.length} ${rows.length === 1 ? "person" : "people"}`;
}

function roleCard(person, kind, fallback = "") {
  const title = person ? nameKey(person) : fallback;
  if (!title) return "";
  const paired = hasCompanionPair(title) ? " has-companion" : "";
  const tone = `${kind === "Assignment" ? " role-assignment" : ""}${paired}`;
  const facts = kind === "Assignment" ? contactLines(person) : "";
  const body = `<span class="role-kicker">${esc(kind)}</span><strong>${esc(title)}</strong>${companionPill(title)}${kind === "Priest" || kind === "Teacher" ? noCompanionPill(title) : ""}${facts}`;
  if (!person) return `<article class="role-card${tone}">${body}</article>`;
  if (kind === "Assignment") return `<div class="role-card${tone}" data-action="select-person" data-id="${esc(person.id)}">${body}</div>`;
  return `<button type="button" class="role-card${tone}" data-action="select-person" data-id="${esc(person.id)}">${body}</button>`;
}

function ministeringCards(quorum, membersOnly = false) {
  const rows = ministeringRows(quorum);
  if (!rows.length) return "";
  const role = quorum === "teachers" ? "Teacher" : "Priest";
  if (membersOnly) {
    return `<div class="ministering-cards quorum-${quorum}">
      ${rows.map((row) => roleCard(row.person, role)).join("")}
    </div>`;
  }
  return `<div class="ministering-cards quorum-${quorum}">
    ${rows.map((row) => {
      const companionName = ministeringCompanionValue(row.person, row.families);
      const companion = findPersonByName(companionName);
      return `<section class="ministering-set">
        ${roleCard(row.person, role)}
        ${roleCard(companion, "Companion", companionName)}
        ${row.families.map((family) => roleCard(family, "Assignment")).join("")}
      </section>`;
    }).join("")}
  </div>`;
}

function youthVisibleLists() {
  if (youthList === "all") return YOUTH_LISTS;
  return YOUTH_LISTS.filter(([id]) => id === youthList);
}

function youthLeaders() {
  const entries = [];
  for (const quorum of ["priests", "teachers"]) {
    (state?.youthLeadership?.[quorum] || []).forEach((row, index) => {
      const name = String(row.name || "").trim();
      if (!name) return;
      const role = String(row.role || "").trim();
      if (role.toLowerCase() !== "president" && row.section !== "adults") return;
      entries.push({ kind: "leader", name, role, quorum, index });
    });
  }
  return entries;
}

function visibleLeaders() {
  const needle = search.trim().toLowerCase();
  return youthLeaders().filter((entry) => {
    if (!needle) return true;
    return `${entry.name} ${entry.role} ${entry.quorum}`.toLowerCase().includes(needle);
  });
}

function youthListSize(id, quorum) {
  if (id === "leaders") return youthLeaders().length;
  return youthMembers(quorum).length;
}

function youthVisibleEntries() {
  if (youthList === "none") return [...youthWithoutCompanions("priests"), ...youthWithoutCompanions("teachers")];
  if (youthList === "all") {
    const seen = new Set();
    const rows = [];
    const add = (key, row) => {
      const name = key.trim().toLowerCase();
      if (!name || seen.has(name)) return;
      seen.add(name);
      rows.push(row);
    };
    for (const quorum of ["priests", "teachers"]) {
      for (const row of ministeringRows(quorum)) add(nameKey(row.person), row);
    }
    for (const leader of visibleLeaders()) add(leader.name, leader);
    return rows;
  }
  if (youthList === "leaders") return visibleLeaders();
  const quorum = youthList === "teachers-quorum" ? "teachers" : "priests";
  return ministeringRows(quorum);
}

function noneListMarkup() {
  const blocks = [
    ["priests", "Priests Quorum", "Priest"],
    ["teachers", "Teachers Quorum", "Teacher"],
  ].map(([quorum, label, role]) => {
    const people = youthWithoutCompanions(quorum);
    if (!people.length) return "";
    return `<section class="youth-list-block">
      <h3>${esc(label)}</h3>
      <div class="ministering-cards quorum-${quorum}">
        ${people.map((person) => roleCard(person, role)).join("")}
      </div>
    </section>`;
  }).join("");
  if (blocks) return blocks;
  const message = search.trim() ? "No priests or teachers without a companion match this search." : "Every priest and teacher has a companion.";
  return `<p class="empty">${message}</p>`;
}

function youthListMarkup() {
  if (youthList === "none") return noneListMarkup();
  const lists = youthVisibleLists();
  const single = lists.length === 1;
  return lists.map(([id, label, quorum]) => {
    const membersOnly = single && (id === "priests-quorum" || id === "teachers-quorum");
    const body = id === "leaders"
      ? visibleLeaders().map((entry) => youthEntryButton(entry, entry.quorum)).join("")
      : ministeringCards(quorum, membersOnly);
    if (!body) return "";
    return `<section class="youth-list-block">
      ${single ? "" : `<h3>${esc(label)}</h3>`}
      ${body}
    </section>`;
  }).join("");
}

function youthEntryButton(entry, quorum = "") {
  const tone = quorum === "priests" || quorum === "teachers" ? ` quorum-${quorum}` : "";
  if (entry.kind === "person") {
    const person = entry.person;
    return `<div class="person ${state.rosterMode ? person.rosterStatusKey : person.outreachStatus}${tone}${hasCompanionPair(nameKey(person)) ? " has-companion" : ""}" data-action="select-person" data-id="${esc(person.id)}" aria-current="${person.id === selectedPersonId}">
      ${outreachMarks(person) ? `<span class="card-marks">${outreachMarks(person)}</span>` : ""}
      <strong>${esc(personLabel(person))}</strong>
      ${companionPill(nameKey(person))}
      ${noCompanionPill(nameKey(person))}
      ${visitedMark(person)}
      ${state.rosterMode ? statusSelect(person) : `<span class="pill ${person.outreachStatus}">${esc(STATUS_LABELS[person.outreachStatus])}</span>`}
      <small>${state.rosterMode ? rosterLine(person) : esc(latestLine(person))}</small>
      ${ministeringLines(nameKey(person))}
    </div>`;
  }
  const place = entry.quorum === "teachers" ? "Teachers" : "Priests";
  const person = findPersonByName(entry.name);
  const open = person ? ` data-action="select-person" data-id="${esc(person.id)}" aria-current="${person.id === selectedPersonId}"` : "";
  return `<div class="person leader-row${tone}${hasCompanionPair(entry.name) ? " has-companion" : ""}"${open}><strong>${esc(entry.name)}</strong>${companionPill(entry.name)}<small>${esc(entry.role)}${entry.role ? ` · ${place}` : place}</small>${ministeringLines(entry.name)}</div>`;
}

function ministeringLines(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return "";
  const visits = youthVisits().filter((person) => String(person.assigned?.[0] || "").trim().toLowerCase() === key);
  if (!visits.length) return "";
  const companions = [];
  for (const visit of visits) {
    for (const item of visit.assigned || []) {
      if (item.trim().toLowerCase() === key || companions.includes(item)) continue;
      companions.push(item);
    }
  }
  const companion = companions.length ? `<small>Companion ${esc(companions.join(" · "))}</small>` : "";
  const families = visits.map((person) => nameKey(person)).filter(Boolean);
  const assignments = families.length ? `<small>${esc(families.join(" · "))}</small>` : "";
  return `${companion}${assignments}`;
}

function youthRosterSummary() {
  const visits = youthVisits();
  const archivedCount = visits.filter((person) => personIsArchived(person)).length;
  const activeCount = visits.length - archivedCount;
  const listsOpen = showingYouthLists();
  const names = new Set();
  for (const person of [...youthMembers("priests"), ...youthMembers("teachers")]) names.add(nameKey(person).trim().toLowerCase());
  for (const leader of youthLeaders()) names.add(leader.name.trim().toLowerCase());
  const allCount = names.size;
  const listButtons = YOUTH_LISTS.map(([id, label, quorum]) => {
    const pressed = listsOpen && youthList === id;
    return `<button type="button" data-action="youth-list" data-list="${id}" aria-pressed="${pressed}">${esc(label)} ${youthListSize(id, quorum)}</button>`;
  }).join("");
  const allPressed = listsOpen && youthList === "all";
  const nonePressed = listsOpen && youthList === "none";
  const noneCount = youthMembers().filter((person) => !hasCompanionPair(nameKey(person))).length;
  const assignmentPressed = showingAssignments();
  const visitPressed = youthList === "visits" && !archiveOpen && !viewAll && !assigneeFilter && !dayFilter && statusFilter === "all";
  return `<div class="summary" aria-label="Youth lists">
    <button type="button" data-action="view-all" aria-pressed="${allPressed}">All ${allCount}</button>
    ${listButtons}
    <button type="button" data-action="youth-list" data-list="none" aria-pressed="${nonePressed}">None ${noneCount}</button>
    <button type="button" data-action="youth-list" data-list="assignments" aria-pressed="${assignmentPressed}">Assignments ${activeCount}</button>
    <button type="button" data-action="show-people" data-list="to-visit" aria-pressed="${visitPressed}">To Visit ${activeCount}</button>
    <button type="button" class="archive-toggle" data-action="archive" aria-pressed="${archiveOpen}">Archive ${archivedCount}</button>
  </div>`;
}

function personButtons(people = filteredPeople()) {
  const loaded = page === "youth" ? youthVisits() : eldersPeople();
  if (!loaded.length) {
    if (page === "youth") return "";
    return `<p class="empty">No one is loaded yet. The outreach spreadsheet is not readable from here, so this list starts empty. Import a CSV or add a person. No sample members are included.</p>`;
  }
  if (!people.length) {
    if (dayFilter && statusFilter === "all" && !search.trim()) return "";
    if (archiveOpen && statusFilter === "all" && !search.trim()) return `<p class="empty">No one is in the archive.</p>`;
    const label = statusFilter === "all" ? "this search" : STATUS_LABELS[statusFilter];
    return `<p class="empty">No one is in ${esc(label)}.${archiveOpen ? "" : " Choose Everyone to see the full roster."}</p>`;
  }
  return people.map((person) => {
    const youthVisit = person.list === "youth";
    const confirmVisit = youthVisit && state.rosterMode && person.rosterStatusKey === "scheduled";
    const statusControl = state.rosterMode
      ? (confirmVisit ? `<span class="status-line">${statusSelect(person)}${visitCheck(person)}</span>` : statusSelect(person))
      : `<span class="pill ${person.outreachStatus}">${esc(STATUS_LABELS[person.outreachStatus])}</span>`;
    return `<div class="person ${state.rosterMode ? person.rosterStatusKey : person.outreachStatus}${youthVisit ? " to-visit" : ""}${hasCompanionPair(nameKey(person)) ? " has-companion" : ""}" data-action="select-person" data-id="${esc(person.id)}" aria-current="${person.id === selectedPersonId}">
      ${outreachMarks(person) ? `<span class="card-marks">${outreachMarks(person)}</span>` : ""}
      <strong>${esc(personLabel(person))}</strong>
      ${companionPill(nameKey(person))}
      ${confirmVisit ? "" : visitedMark(person)}
      ${statusControl}
      ${missionPill(person)}
      ${youthVisit ? contactLines(person) : ""}
      <small>${state.rosterMode ? rosterLine(person) : esc(latestLine(person))}</small>
    </div>`;
  }).join("");
}

const ACTIVE_CHOICES = [
  ["", "No status"],
  ["Reach Out", "Reach Out"],
  ["No Response", "No Response"],
  ["Re-Schedule", "Re-Schedule"],
  ["Scheduled", "Scheduled"],
  ["Drive by", "Drive by"],
];

const ARCHIVE_CHOICES = [
  ["Moved", "Moved"],
  ["Mission", "Mission"],
  ["Do Not Contact", "Do Not Contact"],
  ["Not Interested", "Not Interested"],
  ["No Contact Info", "No Contact Info"],
  ["Declined", "Declined"],
  ["Visited", "Visited"],
];

function statusSelect(person) {
  const current = person.rosterStatus || "";
  const option = ([value, label]) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(label)}</option>`;
  return `<select class="status-pill ${person.rosterStatusKey}" data-person-id="${esc(person.id)}" aria-label="Status for ${esc(personLabel(person))}">
    ${ACTIVE_CHOICES.map(option).join("")}
    <optgroup label="Archive">${ARCHIVE_CHOICES.map(option).join("")}</optgroup>
  </select>`;
}

function archiveControl(person) {
  const open = archiveChoicesFor === person.id;
  const archived = personIsArchived(person);
  return `<span class="archive-control">
    <button type="button" class="tiny archive-card${archived ? " is-archived" : ""}" data-action="toggle-archive" aria-expanded="${open}" aria-pressed="${archived}">Archive</button>
    ${open ? `<span class="archive-choices">${ARCHIVE_CHOICES.map(([value, label]) => `<button type="button" class="tiny status-choice ${rosterKey(value)}" data-action="set-status" data-person-id="${esc(person.id)}" data-status="${esc(value)}" aria-pressed="${value === "Mission" ? Boolean(person.onMission) : currentStatus(person) === value}">${esc(label)}</button>`).join("")}</span>` : ""}
  </span>`;
}

function currentStatus(person) {
  return person.rosterStatus || "";
}

function missionPill(person) {
  if (!person?.onMission || person.rosterStatusKey === "mission") return "";
  return `<span class="pill mission">Mission</span>`;
}

function rosterKey(label) {
  return ARCHIVE_STATUS_ORDER.find((key) => STATUS_LABELS[key] === label) || "none";
}

function hasBeenVisited(person) {
  if (state.rosterMode) return person.rosterStatusKey === "visited" || person.rosterStatusKey === "reschedule_visited";
  return person.outreachStatus === "completed";
}

function visitedMark(person) {
  if (hasBeenVisited(person)) return `<span class="visited-check" aria-label="Visited">✓</span>`;
  if (state.rosterMode && person.rosterStatusKey === "scheduled") return visitCheck(person);
  return "";
}

function outreachMarks(person) {
  const attempts = (state.outreachAttempts || []).filter((attempt) => attempt.personId === person.id);
  const texts = attempts.filter((attempt) => attempt.channel === "text").length;
  const calls = attempts.filter((attempt) => attempt.channel === "phone").length;
  const drives = attempts.filter((attempt) => attempt.channel === "driveby").length;
  return [
    texts ? touchMark("text", texts, `${texts} ${texts === 1 ? "text" : "texts"}`, textIcon()) : "",
    calls ? touchMark("phone", calls, `${calls} ${calls === 1 ? "call" : "calls"}`, phoneIcon()) : "",
    drives ? touchMark("drive", drives, drives === 1 ? "Drove by" : `${drives} drive-bys`, drivebyIcon()) : "",
  ].join("");
}

function touchMark(kind, count, label, icon) {
  const number = kind === "drive" ? "" : `<span>${count}</span>`;
  return `<span class="touch-mark ${kind}" title="${esc(label)}" aria-label="${esc(label)}">${icon}${number}</span>`;
}

function textIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14v9H8.5L5 18.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

function phoneIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 5.2h2l1 2.8-1.5 1a11 11 0 0 0 5.3 5.3l1-1.5 2.8 1v2a1.8 1.8 0 0 1-2 1.8A13.2 13.2 0 0 1 6.4 7.2a1.8 1.8 0 0 1 1.8-2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

function visitCheck(person) {
  return `<button type="button" class="mark-visited" data-action="mark-visited" data-person-id="${esc(person.id)}" aria-label="Confirm visit">✓</button>`;
}

function rosterLine(person) {
  const bits = [];
  if (person.priesthood) bits.push(esc(person.priesthood));
  if (person.reachOutDate) bits.push(`Reach out ${esc(person.reachOutDate)}`);
  if (person.appointment) bits.push(`Appt ${esc(person.appointment)}${placeMark(person.appointmentPlace)}`);
  if (person.list === "youth" && person.assigned?.length) bits.push(esc(person.assigned.join(" · ")));
  const touch = lastTouch(person);
  if (touch) bits.push(esc(touch));
  return bits.join(" · ") || esc(person.sheetName || "");
}

function personMatchesFilters(person) {
  if (viewAll) {
    if (state.rosterMode && officeFilter !== "all" && person.priesthood !== officeFilter) return false;
    return true;
  }
  if (state.rosterMode && !dayFilter && personIsArchived(person) !== archiveOpen) return false;
  if (statusFilter !== "all") {
    if (state.rosterMode && statusFilter === "mission") {
      if (!(person.onMission || person.rosterStatusKey === "mission")) return false;
    } else {
      const key = state.rosterMode ? person.rosterStatusKey || "none" : person.outreachStatus;
      if (key !== statusFilter) return false;
    }
  }
  if (state.rosterMode && officeFilter !== "all" && person.priesthood !== officeFilter) return false;
  if (assigneeFilter && !(person.assigned || []).includes(assigneeFilter)) return false;
  return true;
}

function filteredPeople() {
  const needle = search.trim().toLowerCase();
  const dayIds = viewAll || !dayFilter ? null : new Set(state.calendarMarks?.[dayFilter]?.people || []);
  const source = page === "youth" && dayFilter ? [...youthMembers(), ...youthVisits()] : pagePeople();
  return source
    .filter((person) => !dayIds || dayIds.has(person.id))
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
      if (state.rosterMode) return nameKey(a).localeCompare(nameKey(b), "en", { sensitivity: "base" });
      return STATUS_ORDER.indexOf(a.outreachStatus) - STATUS_ORDER.indexOf(b.outreachStatus) || String(a.displayName).localeCompare(String(b.displayName));
    });
}

function nameKey(person) {
  return String((state.rosterMode && person.sheetName) || person.displayName || "");
}

function personNameField(person) {
  return `<input class="person-name" name="name" value="${esc(nameKey(person))}" aria-label="Name" autocomplete="off">`;
}

function personLabel(person) {
  const name = nameKey(person);
  const duplicates = state.people.filter((item) => nameKey(item) === name).length > 1;
  return duplicates && person.household ? `${name} (${person.household})` : name;
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
  return `${personNameField(person)}
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
    <h3>Comments${person.commentCount ? ` <span class="muted">${person.commentCount}</span>` : ""}</h3>
    ${commentList("person", person.id)}
    ${commentForm("person", person.id)}`;
}

function meetingParts(value) {
  return appointmentParts(value);
}

function youthMemberDetail(person) {
  const families = ministeringForYouth(nameKey(person)).families;
  const companion = ministeringCompanionValue(person, families);
  const meeting = person.sheetColumns?.["Meeting Date"] || "";
  const responded = families.filter((family) => family.sheetColumns?.Response === "Responded").length;
  return `${personNameField(person)}
    ${specialNotes(person)}
    ${householdLine(person)}
    ${contactFields(person, false, true)}
    ${factsForm(person)}
    <form class="companion-row" data-form="youth-companion">
      <label>Companion <input name="companion" value="${esc(companion)}" autocomplete="off" aria-label="Companion"></label>
    </form>
    <h3>Youth ministry meeting</h3>
    <p class="muted">Meet with ${esc(companion || "the companion")} to see which assignments respond, then give a date and time to visit.</p>
    ${meeting ? `<p class="plan-line"><strong>Meeting</strong> ${esc(meeting)}${companion ? ` with ${esc(companion)}` : ""}</p>` : ""}
    <form class="appointment-row" data-form="youth-meeting">
      <input name="date" type="date" aria-label="Meeting date" required value="${esc(meetingParts(meeting).date)}">
      <input name="time" type="time" aria-label="Meeting time" required value="${esc(meetingParts(meeting).time)}">
      <button class="tiny primary" type="submit">Schedule meeting</button>
    </form>
    <h3>Assignments</h3>
    <p class="muted">${responded} of ${families.length} responded</p>
    ${families.map((family) => youthAssignmentVisit(family)).join("")}
    <h3>Outreach</h3>
    ${attemptList(person)}
    <h3>Comments${person.commentCount ? ` <span class="muted">${person.commentCount}</span>` : ""}</h3>
    ${commentList("person", person.id)}
    ${commentForm("person", person.id)}`;
}

function youthAssignmentVisit(family) {
  const responded = family.sheetColumns?.Response === "Responded";
  const visit = family.sheetColumns?.["Visit Date"] || "";
  const parts = meetingParts(visit);
  return `<div class="assignment-visit${responded ? " is-responded" : ""}">
    <input data-assignment-id="${esc(family.id)}" value="${esc(nameKey(family))}" aria-label="Assignment">
    <label class="responded"><input type="checkbox" data-response-id="${esc(family.id)}" ${responded ? "checked" : ""}> Responded</label>
    ${visit ? `<p class="plan-line"><strong>Visit</strong> ${esc(visit)}</p>` : ""}
    <form class="appointment-row" data-form="assignment-visit" data-id="${esc(family.id)}">
      <input name="date" type="date" aria-label="Visit date" required value="${esc(parts.date)}">
      <input name="time" type="time" aria-label="Visit time" required value="${esc(parts.time)}">
      <button class="tiny primary" type="submit">Schedule visit</button>
    </form>
    <button type="button" class="text-button" data-action="clear-assignment" data-id="${esc(family.id)}">Remove</button>
  </div>`;
}

function assignmentDetail(person) {
  const confirm = person.rosterStatusKey === "scheduled" ? visitCheck(person) : "";
  return `${personNameField(person)}
    <p class="muted">Assignment</p>
    <p class="status-row">${statusSelect(person)}${confirm}${missionPill(person)}</p>
    ${contactFields(person, true)}
    ${assignmentFields(person)}
    <h3>Outreach</h3>
    ${attemptList(person)}
    <h3>Comments${person.commentCount ? ` <span class="muted">${person.commentCount}</span>` : ""}</h3>
    ${commentList("person", person.id)}
    ${commentForm("person", person.id)}`;
}

function rosterDetail(person) {
  if (isYouthMember(person)) return youthMemberDetail(person);
  if (isYouthVisit(person)) return assignmentDetail(person);
  return `${personNameField(person)}
    ${specialNotes(person)}
    ${householdLine(person)}
    <p class="status-row">${statusSelect(person)}${archiveControl(person)}${missionPill(person)}${person.rosterStatusKey === "scheduled" ? visitCheck(person) : ""}</p>
    ${contactFields(person, false, true)}
    ${factsForm(person)}
    ${planLine(person)}
    ${assignmentFields(person)}
    ${planForm(person)}
    <h3>Outreach</h3>
    ${attemptList(person)}
    <h3>Comments${person.commentCount ? ` <span class="muted">${person.commentCount}</span>` : ""}</h3>
    ${commentList("person", person.id)}
    ${commentForm("person", person.id)}`;
}

function churchIcon() {
  return `<svg class="place-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5v3.2M9.8 5.7h4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.5 20.5V11L12 6.2 19.5 11v9.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 20.5v-5.2h4v5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

function homeIcon() {
  return `<svg class="place-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.2 12 4.2l8.5 7V20.5h-6.2v-5.4H9.7v5.4H3.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

function drivebyIcon() {
  return `<svg class="place-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15.5h16M6.2 15.5 7.6 11.3h8.8L17.8 15.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7.5" cy="16.4" r="1.3" fill="currentColor"/><circle cx="16.5" cy="16.4" r="1.3" fill="currentColor"/></svg>`;
}

function placeIcon(place) {
  if (place === "Church") return churchIcon();
  if (place === "Home") return homeIcon();
  if (place === "Driveby") return drivebyIcon();
  return "";
}

function placeMark(place) {
  const icon = placeIcon(place);
  if (!icon) return "";
  return `<span class="place-mark">${icon}${esc(place)}</span>`;
}

function placeChoice(place) {
  const option = (value, label, icon) => `<label class="place-option">
    <input type="radio" name="place" value="${value}" ${place === label ? "checked" : ""}>
    ${icon}${label}
  </label>`;
  return `<span class="place-choices">${option("church", "Church", churchIcon())}${option("home", "Home", homeIcon())}${option("driveby", "Drive by", drivebyIcon())}</span>`;
}

function planLine(person) {
  const key = person.rosterStatusKey;
  const where = placeMark(person.appointmentPlace);
  if (key === "reach_out" && person.reachOutDate) return `<p><strong>Reach out</strong> ${esc(person.reachOutDate)}</p>`;
  if (key === "scheduled" && person.appointment) return `<p class="plan-line"><strong>Scheduled Appt</strong> ${esc(person.appointment)}${where}</p>`;
  if (key === "reschedule" && person.appointment) return `<p class="plan-line"><strong>Re-Schedule</strong> ${esc(person.appointment)}${where}</p>`;
  if (key === "driveby" && person.appointment) return `<p class="plan-line"><strong>Drive by</strong> ${esc(person.appointment)}${where}</p>`;
  if (person.appointment) return `<p class="plan-line"><strong>Scheduled Appt</strong> ${esc(person.appointment)}${where}</p>`;
  if (person.reachOutDate) return `<p><strong>Reach out</strong> ${esc(person.reachOutDate)}</p>`;
  return "";
}

function planParts(person) {
  const key = person.rosterStatusKey;
  if (key === "reach_out" && person.reachOutDate) return { date: reachOutParts(person.reachOutDate), time: "", kind: "reach_out", place: "" };
  if (key === "driveby") {
    const parts = person.appointment ? appointmentParts(person.appointment) : { date: "", time: "" };
    return { ...parts, kind: "", place: "Drive by" };
  }
  if (person.appointment && (key === "scheduled" || key === "reschedule")) {
    return { ...appointmentParts(person.appointment), kind: key === "reschedule" ? "reschedule" : "scheduled", place: person.appointmentPlace || "" };
  }
  if (person.reachOutDate) return { date: reachOutParts(person.reachOutDate), time: "", kind: "", place: "" };
  if (person.appointment) return { ...appointmentParts(person.appointment), kind: "", place: person.appointmentPlace || "" };
  return { date: "", time: "", kind: "", place: "" };
}

function youthVisitorNames() {
  const names = [];
  for (const quorum of ["priests", "teachers"]) {
    for (const row of state?.youthLeadership?.[quorum] || []) {
      if (row.name) names.push(row.name);
    }
    for (const person of youthMembers(quorum)) {
      const name = nameKey(person);
      if (name) names.push(name);
    }
  }
  return [...new Set(names)];
}

function leaderNamesFor(person) {
  if (person?.list === "youth") return youthVisitorNames();
  return (state.presidency || []).map((member) => member.name).filter(Boolean);
}

function assignedCountButton(name, people = eldersPeople(), quorum = "") {
  if (!name) return "";
  const count = people.filter((person) => person.rosterStatusKey === "scheduled" && (person.assigned || []).includes(name)).length;
  if (!count) return "";
  const quorumAttr = quorum ? ` data-quorum="${esc(quorum)}"` : "";
  return `<button type="button" class="assign-count" data-action="show-assigned" data-name="${esc(name)}"${quorumAttr} aria-pressed="${assigneeFilter === name}" aria-label="${count} scheduled ${count === 1 ? "person" : "people"} assigned to ${esc(name)}">${count}</button>`;
}

function assignmentFields(person) {
  const youthVisit = person.list === "youth";
  const assigned = person.assigned || [];
  const members = leaderNamesFor(person);
  const options = (selected) => {
    const extra = selected && !members.includes(selected) ? [selected] : [];
    return ["", ...members, ...extra].map((name) => `<option value="${esc(name)}" ${name === selected ? "selected" : ""}>${esc(name || "—")}</option>`).join("");
  };
  const firstLabel = youthVisit ? "Assigned youth" : "First assigned presidency member";
  const secondLabel = youthVisit ? "Companion" : "Second assigned presidency member";
  return `<form class="assign-row" data-form="assign">
    <span>Assigned</span>
    <select name="assigned-1" aria-label="${firstLabel}">${options(assigned[0] || "")}</select>
    <select name="assigned-2" aria-label="${secondLabel}">${options(assigned[1] || "")}</select>
  </form>`;
}

function saveAssignment(form) {
  if (!selectedPersonId) return;
  const first = form.querySelector("[name=assigned-1]")?.value.trim() || "";
  const second = form.querySelector("[name=assigned-2]")?.value.trim() || "";
  const assigned = [...new Set([first, second].filter(Boolean))].slice(0, 2);
  post(`/api/people/${selectedPersonId}/contact`, { assigned }).then((next) => {
    state = next;
    render();
  }).catch(showError);
}

function planForm(person) {
  const current = blankPlanFor === person.id ? { date: "", time: "", kind: "", place: "" } : planParts(person);
  const choice = (value, label) => `<option value="${value}" ${current.kind === value ? "selected" : ""}>${label}</option>`;
  return `<form class="appointment-row" data-form="plan">
    <input name="date" type="date" aria-label="Date" required value="${esc(current.date)}">
    <input name="time" type="time" aria-label="Time" value="${esc(current.time)}">
    <select name="kind" aria-label="What this date is" required>
      <option value="" ${current.kind ? "" : "selected"}>What</option>
      ${choice("reach_out", "Reach out")}
      ${choice("scheduled", "Scheduled Appt")}
      ${choice("reschedule", "Re-Schedule")}
    </select>
    ${placeChoice(current.place)}
    <button class="tiny primary" type="submit">Schedule</button>
  </form>`;
}

function reachOutParts(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!match) return "";
  let year = match[3] ? Number(match[3]) : 2026;
  if (year < 100) year += 2000;
  return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function appointmentParts(appointment) {
  const match = String(appointment || "").match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return { date: "", time: "" };
  let year = match[3] ? Number(match[3]) : 2026;
  if (year < 100) year += 2000;
  let hour = Number(match[4]);
  if (match[6].toUpperCase() === "PM" && hour < 12) hour += 12;
  if (match[6].toUpperCase() === "AM" && hour === 12) hour = 0;
  return {
    date: `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`,
    time: `${String(hour).padStart(2, "0")}:${match[5]}`,
  };
}

function factsForm(person) {
  const current = person.priesthood || "";
  const offices = PRIESTHOOD_OFFICES.includes(current) || !current ? PRIESTHOOD_OFFICES : [current, ...PRIESTHOOD_OFFICES];
  const option = (office) => `<option value="${esc(office)}" ${office === current ? "selected" : ""}>${esc(office)}</option>`;
  return `<form class="facts-row" data-form="facts">
    <label>Priesthood
      <select name="priesthood" aria-label="Priesthood">
        <option value="" ${current ? "" : "selected"}></option>
        ${offices.map(option).join("")}
      </select>
    </label>
    <label>Age <input name="age" inputmode="numeric" autocomplete="off" value="${esc(person.age || "")}" aria-label="Age"></label>
    <label>Birthday <input name="birthday" autocomplete="off" value="${esc(person.birthday || "")}" aria-label="Birthday"></label>
  </form>`;
}

function specialNotes(person) {
  return `<label class="special-notes">Special notes
    <textarea name="notes" rows="2">${esc(person.notes || "")}</textarea>
  </label>`;
}

function addressField(person) {
  const address = String(person.sheetColumns?.Address || "").trim();
  return `<label class="wide">Address
      <textarea name="address" rows="3">${esc(address)}</textarea>
      <span class="contact-actions">${addressPill(address)}</span>
    </label>`;
}

function contactFields(person, details = false, withAddress = false) {
  const phone = String(person.phone || "").trim();
  const email = String(person.email || "").trim();
  const household = details ? `<label class="wide">Household
      <textarea name="household" rows="4">${esc(person.household || "")}</textarea>
    </label>` : "";
  const address = details || withAddress ? addressField(person) : "";
  return `<form class="contact-fields" data-form="contact">
    ${household}
    ${address}
    <div>
      <label>Phone <input name="phone" type="tel" autocomplete="off" inputmode="tel" value="${esc(formatPhone(phone))}" class="${phone ? "" : "is-missing"}"></label>
      <span class="contact-actions">
        <a class="tiny" data-contact="call" href="${phone ? `tel:${esc(phone)}` : ""}" ${phone ? "" : "hidden"}>Call</a>
        <a class="tiny" data-contact="text" href="${phone ? `sms:${esc(phone)}` : ""}" ${phone ? "" : "hidden"}>Text</a>
      </span>
    </div>
    <div>
      <label>Email <input name="email" type="email" autocomplete="off" inputmode="email" value="${esc(email)}" class="${email ? "" : "is-missing"}"></label>
      <span class="contact-actions">
        <a class="tiny" data-contact="mail" href="${email ? `mailto:${esc(email)}` : ""}" ${email ? "" : "hidden"}>Email</a>
      </span>
    </div>
  </form>`;
}

function syncContactLinks(form) {
  const phoneInput = form.querySelector("[name=phone]");
  const emailInput = form.querySelector("[name=email]");
  const phone = phoneInput?.value.trim() || "";
  const email = emailInput?.value.trim() || "";
  const addressInput = form.querySelector("[name=address]");
  const addressLink = form.querySelector("a.address-pill");
  if (addressInput && addressLink) {
    const address = addressInput.value.trim();
    addressLink.hidden = !address;
    addressLink.href = mapsHref(address) || "#";
  }
  phoneInput?.classList.toggle("is-missing", !phone);
  emailInput?.classList.toggle("is-missing", !email);
  const call = form.querySelector("[data-contact=call]");
  const text = form.querySelector("[data-contact=text]");
  const mail = form.querySelector("[data-contact=mail]");
  if (call) {
    call.hidden = !phone;
    call.href = phone ? `tel:${phone}` : "";
  }
  if (text) {
    text.hidden = !phone;
    text.href = phone ? `sms:${phone}` : "";
  }
  if (mail) {
    mail.hidden = !email;
    mail.href = email ? `mailto:${email}` : "";
  }
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
    return `Scheduled ${formatDate(visit.date)} · ${visit.slotLabel}, after a ${CHANNEL_LABELS[visit.replyChannel].toLowerCase()} reply. Recorded for the ${state.calendarName}.`;
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
      <h3>Schedule ${esc(personLabel(person))}</h3>
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
  const attempts = personTouches(person);
  if (state.rosterMode) return outreachTable(attempts);
  if (!attempts.length) return "";
  return `<ul class="history">${attempts.map((attempt) => `<li>
      <strong>${esc(whoLabel(attempt) || CHANNEL_LABELS[attempt.channel] || attempt.channel)}</strong>
      · ${esc(CHANNEL_LABELS[attempt.channel] || attempt.channel)}
      · ${esc(formatShortDate(attempt.date))}
      ${state.rosterMode ? "" : ` · ${esc(STATUS_LABELS[attempt.status] || attempt.status)}`}
      ${attempt.notes ? `<div>${esc(attempt.notes)}</div>` : ""}
    </li>`).join("")}</ul>`;
}

function outreachTable(attempts) {
  const person = selectedPerson();
  const members = leaderNamesFor(person).map((name) => ({ name }));
  const rows = attempts.map((attempt) => outreachEditRow(attempt)).join("");
  return `<div class="cell-table">
    <div class="cell-row outreach-add" data-outreach-add data-person-id="${esc(person?.id || "")}">
      <select name="by" aria-label="Who">
        <option value="">Who</option>
        ${members.map((member) => `<option value="${esc(member.name)}">${esc(member.name)}</option>`).join("")}
      </select>
      <select name="channel" aria-label="How">
        <option value="">How</option>
        <option value="text">Text</option>
        <option value="phone">Call</option>
        <option value="email">Email</option>
        <option value="in_person">In person</option>
      </select>
      <input name="date" type="date" aria-label="Date">
    </div>
    ${rows}
  </div>`;
}

function outreachEditRow(attempt) {
  const members = leaderNamesFor(selectedPerson()).map((name) => ({ name }));
  const who = whoLabel(attempt);
  const names = [...new Set([who, ...members.map((member) => member.name)].filter(Boolean))];
  const channels = ["text", "phone", "email", "in_person"];
  if (attempt.channel === "driveby") channels.push("driveby");
  const option = (value, label, selected) => `<option value="${esc(value)}" ${selected ? "selected" : ""}>${esc(label)}</option>`;
  return `<div class="cell-row outreach-edit" data-outreach-edit data-id="${esc(attempt.id)}">
    <select name="by" aria-label="Who">
      ${option("", "—", !who)}
      ${names.map((name) => option(name, name, name === who)).join("")}
    </select>
    <select name="channel" aria-label="How">
      ${channels.map((key) => option(key, CHANNEL_LABELS[key] || key, key === attempt.channel)).join("")}
    </select>
    <input name="date" type="date" aria-label="Date" value="${esc(attempt.date || "")}">
  </div>`;
}

function commentThreads(targetType, targetId) {
  const all = state.comments.filter((comment) => comment.targetType === targetType && comment.targetId === targetId);
  const replies = new Map();
  for (const comment of all) {
    if (!comment.parentId) continue;
    if (!replies.has(comment.parentId)) replies.set(comment.parentId, []);
    replies.get(comment.parentId).push(comment);
  }
  for (const list of replies.values()) list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return all
    .filter((comment) => !comment.parentId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((comment) => ({ comment, replies: replies.get(comment.id) || [] }));
}

function commentList(targetType, targetId) {
  const threads = commentThreads(targetType, targetId);
  if (!threads.length) return "";
  return threads.map(({ comment, replies }) => `<article class="comment" id="comment-${esc(comment.id)}">
    ${commentBody(comment)}
    ${commentNeedsAnswer(comment) ? `<p class="needs-answer">Needs an answer</p>${answerTools(comment.id)}` : ""}
    ${comment.resolvedAt ? `<p class="muted">Resolved</p>` : ""}
    ${replies.map((reply) => `<div class="reply">${commentBody(reply)}</div>`).join("")}
  </article>`).join("");
}

function commentNeedsAnswer(comment) {
  return (state.openMessages || []).some((message) => message.id === comment.id);
}

function commentBody(comment) {
  if (editingCommentId === comment.id) {
    return `<form class="stack" data-form="edit-comment">
      <input type="hidden" name="id" value="${esc(comment.id)}">
      <label>Correct this note <textarea name="body" required>${esc(comment.body)}</textarea></label>
      <div class="mention-menu" hidden></div>
      <div class="comment-actions">
        <button class="tiny primary" type="submit">Save</button>
        <button type="button" class="tiny" data-action="cancel-edit">Cancel</button>
      </div>
    </form>`;
  }
  return `<div class="comment-text">${mentionHtml(comment.body)}</div>
    <div class="comment-actions">
      <button type="button" class="tiny" data-action="edit-comment" data-id="${esc(comment.id)}">Edit</button>
      <button type="button" class="tiny" data-action="delete-comment" data-id="${esc(comment.id)}">Delete</button>
    </div>`;
}

function answerTools(commentId) {
  return `<form class="stack reply-form" data-form="reply">
    <input type="hidden" name="parentId" value="${esc(commentId)}">
    <label>Response <textarea name="body" required placeholder="Write a response"></textarea></label>
    <div class="mention-menu" hidden></div>
    <div class="comment-actions">
      <button class="tiny primary" type="submit">Respond</button>
      <button type="button" class="tiny" data-action="resolve-comment" data-id="${esc(commentId)}">Resolve</button>
    </div>
  </form>`;
}

function mentionHtml(body) {
  const names = (state.presidency || []).map((member) => member.name).sort((a, b) => b.length - a.length);
  let html = esc(body);
  for (const name of names) {
    html = html.replaceAll(`@${esc(name)}`, `<span class="mention">@${esc(name)}</span>`);
  }
  return html;
}

function commentForm(targetType, targetId) {
  return `<form class="stack" data-form="comment">
    <input type="hidden" name="targetType" value="${esc(targetType)}">
    <input type="hidden" name="targetId" value="${esc(targetId)}">
    <label>Comment <textarea name="body" required placeholder="Write a note. Type @ to ask someone a question."></textarea></label>
    <div class="mention-menu" hidden></div>
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
    <p><strong>${esc(visit.slotLabel)}</strong> · ${esc(person ? personLabel(person) : "Person")}</p>
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
        ${state.people.slice().sort((a, b) => nameKey(a).localeCompare(nameKey(b), "en", { sensitivity: "base" })).map((person) => `<option value="${esc(person.id)}" ${person.id === selectedPersonId ? "selected" : ""}>${esc(personLabel(person))}</option>`).join("")}
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
