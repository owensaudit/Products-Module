import { onRequest } from "firebase-functions/v2/https";
import { createCloudStore } from "./lib/cloud-store.js";
import { createPortalHandler } from "./server.js";

const handler = createPortalHandler(createCloudStore(), { requireAuth: true });

export const portal = onRequest({
  region: "us-west1",
  memory: "512MiB",
  timeoutSeconds: 60,
  maxInstances: 1,
  concurrency: 1,
  invoker: "public",
}, (request, response) => new Promise((resolve, reject) => {
  let settled = false;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    if (error) reject(error);
    else resolve();
  };
  response.on("finish", () => finish());
  response.on("error", finish);
  Promise.resolve(handler(request, response)).catch((error) => {
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Something went wrong" }));
    }
    finish(error);
  });
}));
