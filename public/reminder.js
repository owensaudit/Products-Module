export function reminderMessage({ name, kind, when, household, individual, companion } = {}) {
  const brother = String(name || "").trim();
  const visitKind = kind === "Youth Ministry" ? "Youth Ministry" : "Ministering Visit";
  const house = String(household || "").trim();
  const person = String(individual || "").trim();
  const targets = [];
  if (house) targets.push(house);
  if (person && person !== house) targets.push(person);
  const withWhom = targets.length ? ` with ${targets.join(" and ")}` : "";
  const companionName = String(companion || "").trim();
  const tail = companionName ? ` Your Companion for this will be ${companionName}.` : "";
  return `Brother ${brother}. Friendly reminder you have a scheduled ${visitKind} on ${String(when || "").trim()}${withWhom}.${tail}`;
}
