import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";
import { join } from "node:path";
import express from "express";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import * as libcurl from "@mercuryworkshop/libcurl-transport";
import * as epoxy from "@mercuryworkshop/epoxy-transport";

const app = express();
const publicPath = fileURLToPath(new URL("./public", import.meta.url));
const BUILD_ID = "portal-20261030-6";

// The browser needs these headers for the WebAssembly/transport stack.
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("X-Portal-Build", BUILD_ID);

  // Keep the shell, service worker, and version-coupled proxy bundles fresh.
  // This prevents an older Scramjet/BareMux script being mixed with a new page.
  if (
    req.path === "/" ||
    req.path === "/index.html" ||
    req.path === "/sw.js" ||
    req.path.startsWith("/scram/") ||
    req.path.startsWith("/baremux/") ||
    req.path.startsWith("/libcurl/") ||
    req.path.startsWith("/epoxy/")
  ) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, service: "portal-browser", build: BUILD_ID });
});

// A safe runtime check to confirm that Render deployed the intended build and
// that every static proxy bundle is actually present. No secrets or paths leak.
async function fileExists(base, name) {
  if (!base) return false;
  try {
    await access(join(base, name));
    return true;
  } catch {
    return false;
  }
}

app.get("/__portal/diagnostics", async (_req, res) => {
  const [scramjetAll, scramjetWasm, scramjetSync, baremuxWorker, libcurlEntry, epoxyEntry] = await Promise.all([
    fileExists(scramjetPath, "scramjet.all.js"),
    fileExists(scramjetPath, "scramjet.wasm.wasm"),
    fileExists(scramjetPath, "scramjet.sync.js"),
    fileExists(baremuxPath, "worker.js"),
    fileExists(libcurl.libcurlPath, "index.mjs"),
    fileExists(epoxy.epoxyPath, "index.mjs")
  ]);
  const assets = { scramjetAll, scramjetWasm, scramjetSync, baremuxWorker, libcurlEntry, epoxyEntry };
  const ok = Object.values(assets).every(Boolean);
  res.status(ok ? 200 : 503).json({
    ok,
    service: "portal-browser",
    build: BUILD_ID,
    node: process.version,
    assets
  });
});

app.use(express.static(publicPath));
app.use("/scram/", express.static(scramjetPath));
app.use("/baremux/", express.static(baremuxPath));
if (libcurl.libcurlPath) app.use("/libcurl/", express.static(libcurl.libcurlPath));
if (epoxy.epoxyPath) app.use("/epoxy/", express.static(epoxy.epoxyPath));

app.use((_req, res) => res.status(404).type("text/plain").send("Not found"));

const server = createServer(app);
server.on("upgrade", (req, socket, head) => {
  let pathname;
  try {
    pathname = new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    socket.destroy();
    return;
  }

  if (pathname.endsWith("/wisp/")) {
    // This matches the official Scramjet-App Wisp upgrade routing pattern.
    try {
      wisp.routeRequest(req, socket, head);
    } catch (error) {
      console.error("Wisp upgrade failed:", error);
      socket.destroy();
    }
    return;
  }

  socket.end();
});

const port = Number.parseInt(process.env.PORT || "", 10) || 8080;
server.listen(port, "0.0.0.0", () => {
  console.log(`Portal running on port ${port}`);
  console.log(`transports: libcurl=${Boolean(libcurl.libcurlPath)} epoxy=${Boolean(epoxy.epoxyPath)}`);
});

function shutdown() {
  console.log("Shutting down Portal Browser...");
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
