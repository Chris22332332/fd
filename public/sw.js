// Portal Browser service worker.
importScripts("/scram/scramjet.all.js?v=portal-20261030-6");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const SCRAMJET_PREFIX = "/~/sj/";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function getScramjetDatabaseInfo() {
  try {
    if (typeof indexedDB.databases !== "function") return [];
    const entries = await indexedDB.databases();
    return entries
      .filter((entry) => entry.name && /scramjet/i.test(entry.name))
      .map((entry) => ({ name: entry.name, version: entry.version }));
  } catch (error) {
    return [{ error: error && error.message ? error.message : String(error) }];
  }
}

async function handleRequest(event) {
  const requestUrl = new URL(event.request.url);
  // Do not touch Scramjet's IndexedDB for Portal's own shell, JS, CSS, or
  // transport files. Only proxied iframe URLs need Scramjet configuration.
  if (!requestUrl.pathname.startsWith(SCRAMJET_PREFIX)) {
    return fetch(event.request);
  }

  try {
    await scramjet.loadConfig();
    if (scramjet.route(event)) return await scramjet.fetch(event);
    return fetch(event.request);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const details = {
      message,
      name: error && error.name ? error.name : "Error",
      stack: error && error.stack ? error.stack : null,
      databases: await getScramjetDatabaseInfo(),
      url: event.request.url
    };
    console.error("Portal Scramjet request failed:", details);
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: "PORTAL_SCRAMJET_ERROR", details });
    }
    return new Response(
      "Portal proxy request failed: " + message + "\\nDatabase diagnostics: " + JSON.stringify(details.databases),
      {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
});
