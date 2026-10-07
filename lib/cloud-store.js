import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { emptyState } from "./model.js";

const DOCUMENT = "portal/state";

function firebaseApp() {
  return getApps()[0] || initializeApp({ projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "prunehill" });
}

export function stateFromRecord(parsed) {
  const source = parsed && typeof parsed === "object" ? parsed : {};
  return {
    people: source.people ?? [],
    outreachAttempts: source.outreachAttempts ?? [],
    visits: source.visits ?? [],
    comments: source.comments ?? [],
    importMeta: source.importMeta ?? null,
    presidency: source.presidency ?? null,
    youthLeadership: source.youthLeadership ?? null,
    directory: Array.isArray(source.directory) ? source.directory : [],
    temporaryVisits: Array.isArray(source.temporaryVisits) ? source.temporaryVisits : [],
  };
}

function storedState(state) {
  return JSON.parse(JSON.stringify(stateFromRecord(state)));
}

export function createCloudStore() {
  const databaseId = process.env.FIRESTORE_DATABASE || "portal";
  const db = getFirestore(firebaseApp(), databaseId);
  db.settings({ preferRest: true, ignoreUndefinedProperties: true });
  const ref = db.doc(DOCUMENT);
  let chain = Promise.resolve();

  async function read() {
    const snap = await ref.get();
    return snap.exists ? stateFromRecord(snap.data()) : emptyState();
  }

  function update(mutator) {
    const run = chain.then(async () => {
      const snap = await ref.get();
      const current = snap.exists ? stateFromRecord(snap.data()) : emptyState();
      const next = await mutator(current);
      if (!next) return current;
      const saved = storedState(next);
      await ref.set(saved);
      return stateFromRecord(saved);
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return { read, update };
}
