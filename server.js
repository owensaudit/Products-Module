import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/csv.js";
import {
  PortalError,
  addComment,
  deleteComment,
  resolveComment,
  updateComment,
  addPerson,
  removePerson,
  emptyState,
  importRows,
  logOutreach,
  removeOutreach,
  updateOutreach,
  presentState,
  setAppointment,
  setReachOutDate,
  setPersonContact,
  setPresidency,
  setYouthLeadership,
  previewImport,
  scheduleVisit,
  setPersonStatus,
  setVisitStatus,
} from "./lib/model.js";
import { emailAllowed, parseAllowlist } from "./lib/allowlist.js";
import { addDirectoryMember, addDirectoryVisit, applyDirectory, assignDirectoryHousehold, moveDirectoryPerson, parseDirectory, removeDirectoryMember, setDirectoryCompanion, updateDirectoryHousehold } from "./lib/directory.js";
import { createStore } from "./lib/store.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const templatePath = path.join(root, "templates", "outreach-import-template.csv");

const staticFiles = {
  "/": { file: path.join(publicDir, "index.html"), type: "text/html; charset=utf-8" },
  "/index.html": { file: path.join(publicDir, "index.html"), type: "text/html; charset=utf-8" },
  "/styles.css": { file: path.join(publicDir, "styles.css"), type: "text/css; charset=utf-8" },
  "/app.js": { file: path.join(publicDir, "app.js"), type: "text/javascript; charset=utf-8" },
  "/template.csv": { file: templatePath, type: "text/csv; charset=utf-8" },
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(new PortalError("Upload is too large", 413));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new PortalError("Request body must be JSON"));
      }
    });
    request.on("error", reject);
  });
}

async function sendFile(response, file) {
  try {
    await readFile(file.file);
  } catch {
    sendJson(response, 404, { error: "Not found" });
    return;
  }
  response.writeHead(200, { "content-type": file.type, "cache-control": "no-store" });
  createReadStream(file.file).pipe(response);
}

function firebaseWebConfig() {
  const raw = process.env.PORTAL_WEB_CONFIG;
  if (!raw) return null;
  try {
    const config = JSON.parse(raw);
    return config && typeof config === "object" ? config : null;
  } catch {
    return null;
  }
}

async function verifyGoogleToken(request) {
  const header = String(request.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new PortalError("Sign in required", 401);
  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "prunehill" });
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    if (!decoded.email_verified) throw new PortalError("Sign in required", 401);
    return String(decoded.email || "");
  } catch (error) {
    if (error instanceof PortalError) throw error;
    throw new PortalError("Sign in required", 401);
  }
}

export function createPortalServer(store, options = {}) {
  const authRequired = options.requireAuth === true || process.env.REQUIRE_AUTH === "1";
  const allow = options.allow || parseAllowlist(process.env.ALLOWED_EMAILS);
  const authenticate = options.authenticate || verifyGoogleToken;
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const { pathname } = url;

      if (request.method === "GET" && staticFiles[pathname]) {
        await sendFile(response, staticFiles[pathname]);
        return;
      }

      if (request.method === "GET" && pathname === "/favicon.ico") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && pathname === "/api/config") {
        sendJson(response, 200, { auth: authRequired, firebase: firebaseWebConfig() });
        return;
      }

      if (authRequired && pathname.startsWith("/api/")) {
        const email = await authenticate(request);
        if (!emailAllowed(email, allow)) throw new PortalError("This Google account cannot open this portal", 403);
      }

      if (request.method === "POST" && pathname === "/api/reset" && authRequired) {
        throw new PortalError("Clearing the shared portal is turned off", 403);
      }

      if (request.method === "GET" && pathname === "/api/state") {
        const month = url.searchParams.get("month") || currentMonth();
        const state = await store.read();
        sendJson(response, 200, presentState(state, month, { includePrivate: url.searchParams.get("private") === "1" }));
        return;
      }

      if (request.method === "POST" && pathname === "/api/reset") {
        const next = await store.update(() => emptyState());
        sendJson(response, 200, presentState(next, currentMonth()));
        return;
      }

      if (request.method === "POST") {
        const body = await readBody(request);
        const month = body.month || currentMonth();
        const viewOptions = { includePrivate: body.includePrivate === true };

        const personReachOut = pathname.match(/^\/api\/people\/([^/]+)\/reach-out$/);
        if (personReachOut) {
          const next = await store.update((state) => setReachOutDate(state, decodeURIComponent(personReachOut[1]), body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        const personAppointment = pathname.match(/^\/api\/people\/([^/]+)\/appointment$/);
        if (personAppointment) {
          const next = await store.update((state) => setAppointment(state, decodeURIComponent(personAppointment[1]), body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        const personContact = pathname.match(/^\/api\/people\/([^/]+)\/contact$/);
        if (personContact) {
          const next = await store.update((state) => setPersonContact(state, decodeURIComponent(personContact[1]), body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        const personStatus = pathname.match(/^\/api\/people\/([^/]+)\/status$/);
        if (personStatus) {
          const options = Object.hasOwn(body, "mission") ? { mission: body.mission } : {};
          const next = await store.update((state) => setPersonStatus(state, decodeURIComponent(personStatus[1]), body.status, options));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        const personDelete = pathname.match(/^\/api\/people\/([^/]+)\/delete$/);
        if (personDelete) {
          const next = await store.update((state) => removePerson(state, decodeURIComponent(personDelete[1])));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/people") {
          const next = await store.update((state) => addPerson(state, body));
          sendJson(response, 201, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/presidency") {
          const next = await store.update((state) => setPresidency(state, body.members));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/youth/leadership") {
          const next = await store.update((state) => setYouthLeadership(state, body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        const outreachDelete = pathname.match(/^\/api\/outreach\/([^/]+)\/delete$/);
        if (outreachDelete) {
          const next = await store.update((state) => removeOutreach(state, decodeURIComponent(outreachDelete[1])));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        const outreachEdit = pathname.match(/^\/api\/outreach\/([^/]+)$/);
        if (outreachEdit) {
          const next = await store.update((state) => updateOutreach(state, decodeURIComponent(outreachEdit[1]), body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/outreach") {
          const next = await store.update((state) => logOutreach(state, body));
          sendJson(response, 201, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/schedule") {
          const next = await store.update((state) => scheduleVisit(state, body));
          sendJson(response, 201, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/comments") {
          const next = await store.update((state) => addComment(state, body));
          sendJson(response, 201, presentState(next, month, viewOptions));
          return;
        }

        const commentEdit = pathname.match(/^\/api\/comments\/([^/]+)$/);
        if (commentEdit) {
          const next = await store.update((state) => updateComment(state, decodeURIComponent(commentEdit[1]), body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        const commentResolve = pathname.match(/^\/api\/comments\/([^/]+)\/resolve$/);
        if (commentResolve) {
          const next = await store.update((state) => resolveComment(state, decodeURIComponent(commentResolve[1])));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        const commentDelete = pathname.match(/^\/api\/comments\/([^/]+)\/delete$/);
        if (commentDelete) {
          const next = await store.update((state) => deleteComment(state, decodeURIComponent(commentDelete[1])));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        const complete = pathname.match(/^\/api\/visits\/([^/]+)\/(complete|cancel)$/);
        if (complete) {
          const status = complete[2] === "complete" ? "completed" : "cancelled";
          const next = await store.update((state) => setVisitStatus(state, decodeURIComponent(complete[1]), status));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/directory/companion") {
          const next = await store.update((state) => setDirectoryCompanion(state, body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/directory/household") {
          const next = await store.update((state) => updateDirectoryHousehold(state, body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/directory/assign") {
          const next = await store.update((state) => assignDirectoryHousehold(state, body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/directory/visits") {
          const next = await store.update((state) => addDirectoryVisit(state, body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/directory/move") {
          const next = await store.update((state) => moveDirectoryPerson(state, body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/directory/member") {
          const next = await store.update((state) => addDirectoryMember(state, body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/directory/remove") {
          const next = await store.update((state) => removeDirectoryMember(state, body));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/directory") {
          const records = parseDirectory(body.text || "");
          if (!records.length) throw new PortalError("Directory text has no households");
          const next = await store.update((state) => applyDirectory(state, records));
          sendJson(response, 200, presentState(next, month, viewOptions));
          return;
        }

        if (pathname === "/api/import/preview") {
          const parsed = parseCsv(body.csv || "");
          sendJson(response, 200, previewImport(parsed));
          return;
        }

        if (pathname === "/api/import") {
          const parsed = parseCsv(body.csv || "");
          let summary = { imported: 0, skipped: [] };
          const result = await store.update((state) => {
            const imported = importRows(state, {
              fileName: body.fileName,
              headers: parsed.headers,
              rows: parsed.rows,
              mapping: body.mapping,
              kind: body.kind,
              defaultChannel: body.defaultChannel,
            });
            summary = { imported: imported.imported, skipped: imported.skipped };
            return imported.state;
          });
          sendJson(response, 201, {
            ...presentState(result, month, viewOptions),
            importResult: summary,
          });
          return;
        }
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      if (error instanceof PortalError) {
        sendJson(response, error.status, { error: error.message });
        return;
      }
      console.error(error instanceof Error ? error.message : "Request failed");
      sendJson(response, 500, { error: "Something went wrong" });
    }
  });
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const dataFile = process.env.DATA_FILE || path.join(root, "data", "portal.json");
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || "127.0.0.1";
  const server = createPortalServer(createStore(dataFile));
  server.listen(port, host, () => {
    console.log(`Ministering Visit Portal at http://${host}:${port}`);
  });
}
