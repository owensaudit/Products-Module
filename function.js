import { onRequest } from "firebase-functions/v2/https";
import { createCloudStore } from "./lib/cloud-store.js";
import { createPortalServer } from "./server.js";

const server = createPortalServer(createCloudStore(), { requireAuth: true });

export const portal = onRequest({
  region: "us-west1",
  memory: "512MiB",
  timeoutSeconds: 60,
  maxInstances: 1,
  invoker: "public",
}, (request, response) => {
  server.emit("request", request, response);
});
