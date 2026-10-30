import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const files = ["server.js", "public/sw.js"];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `${file}: syntax check failed\n`);
    process.exit(result.status || 1);
  }
  console.log(`PASS syntax: ${file}`);
}

const html = readFileSync("public/index.html", "utf8");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim());
if (!inlineScripts.length) throw new Error("No inline application script was found in public/index.html");
for (let index = 0; index < inlineScripts.length; index += 1) {
  new vm.Script(inlineScripts[index], { filename: `public/index.html:inline-script-${index + 1}` });
  console.log(`PASS syntax: public/index.html inline script ${index + 1}`);
}

for (const required of [
  "public/index.html",
  "public/sw.js",
  "package.json",
  "server.js",
  "render.yaml",
  ".node-version"
]) {
  readFileSync(required);
  console.log(`PASS file exists: ${required}`);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (pkg.scripts?.start !== "node server.js") throw new Error("package.json must start server.js");
if (!pkg.dependencies?.["@mercuryworkshop/bare-mux"] || !pkg.dependencies?.["@mercuryworkshop/scramjet"]) {
  throw new Error("BareMux and Scramjet dependencies must be declared");
}
if (!pkg.dependencies?.["@mercuryworkshop/wisp-js"] || pkg.dependencies?.["wisp-server-node"]) {
  throw new Error("The maintained wisp-js server must replace deprecated wisp-server-node");
}
if (!pkg.dependencies?.ws) throw new Error("The WebSocket runtime dependency ws must be declared");
console.log("PASS package metadata and maintained Wisp dependency");

if (!html.includes("websocket: wisp") || !html.includes("wisp: wisp")) {
  throw new Error("Both transport option shapes must be present");
}
if (!html.includes("setTransport(transportPath, transportOptions)")) {
  throw new Error("BareMux transport must be configured during setup");
}
const workerWait = html.indexOf("await waitForServiceWorker()");
const initAwait = html.indexOf("await initializeScramjet(Controller)");
if (workerWait < 0 || initAwait < 0 || workerWait > initAwait) {
  throw new Error("Service worker must take control before Scramjet initialization");
}
if (!html.includes("scramjet.createFrame(tab.frame)") || !html.includes("tab.scramFrame.go(url)")) {
  throw new Error("Navigation must use the Scramjet Frame API");
}
console.log("PASS proxy transport, worker initialization order, and Scramjet Frame API");

const server = readFileSync("server.js", "utf8");
if (!server.includes("/__portal/diagnostics") || !server.includes("portal-20261030-6")) {
  throw new Error("Runtime diagnostic route or build marker is missing");
}
console.log("PASS deployed-build diagnostic endpoint");

const worker = readFileSync("public/sw.js", "utf8");
if (!worker.includes("portal-20261030-6")) throw new Error("Service worker build identifier is missing");
if (!html.includes("portal-20261030-6")) throw new Error("HTML build identifier is missing");
if (!worker.includes("Portal proxy request failed: ")) throw new Error("Service worker must expose diagnostic proxy errors");
if (!worker.includes("requestUrl.pathname.startsWith(SCRAMJET_PREFIX)")) throw new Error("Service worker should only load Scramjet config for actual proxy paths");
if (!html.includes("portal-scramjet-idb-repair-v5") || !html.includes("findScramjetDatabases")) throw new Error("One-time Scramjet IndexedDB repair is missing");
if (!html.includes("scramjet.openIDB()")) throw new Error("Scramjet's database initializer should run before init");
console.log("PASS one-time targeted Scramjet IndexedDB migration and explicit schema initialization");
if (!worker.includes("requestUrl.pathname.startsWith(SCRAMJET_PREFIX)")) throw new Error("Service worker should only load Scramjet config for actual proxy paths");
if (!worker.includes("PORTAL_SCRAMJET_ERROR") || !worker.includes("getScramjetDatabaseInfo")) throw new Error("Service-worker diagnostics are missing");
console.log("PASS service-worker request filtering and IndexedDB error diagnostics");
console.log("PASS matching cache-busting build identifiers");


// UI upgrade checks: assert the new workspace controls are real elements and
// the old preset quick-link/recommendation strip is gone.
for (const requiredUi of [
  'id="settings-btn"',
  'id="settings-backdrop"',
  'data-settings-tab="general"',
  'data-settings-tab="search"',
  'data-settings-tab="privacy"',
  'data-settings-tab="proxy"',
  'id="engine-select"',
  'id="transport-select"',
  'id="run-diagnostics"',
  'id="repair-storage"',
  'id="bookmark-page"',
  'data-role="bookmarks"',
  'data-role="history"',
  'id="fullscreen-btn"',
  "event.key==='Escape'",
  "key==='l'",
  "key==='t'",
  "key==='w'"
]) {
  if (!html.includes(requiredUi)) throw new Error(`Missing UI feature: ${requiredUi}`);
}
if (html.includes('class="quick"') || html.includes('data-u="https://www.youtube.com"')) {
  throw new Error('Preset recommendation/quick-link tiles must be removed');
}
if (!html.includes('bookmarks you save') && !html.includes('YOUR BOOKMARKS')) {
  throw new Error('User-managed bookmark area is missing');
}
if (!html.includes('settings.transport') || !html.includes('settings.searchEngine')) {
  throw new Error('Settings controls are not connected to application state');
}
if (!html.includes('saveHistory(url,tab.title)')) {
  throw new Error('Recent pages are not connected to successful navigation');
}
if (!html.includes('portal-20261030-6')) throw new Error('UI build marker is missing');
console.log('PASS v6 UI controls, user-managed start page, settings, and removal of preset tiles');
