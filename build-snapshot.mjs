// Fetches the public location feed from the Apps Script backend and saves it to
// data/locations.snapshot.json, which the site falls back to if the live Sheet is unreachable.
// Run by .github/workflows/snapshot.yml; you can also run it by hand: node scripts/build-snapshot.mjs
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { CONFIG } from "../js/config.js";

const OUT = new URL("../data/locations.snapshot.json", import.meta.url);
const notes = [];
const summary = async () => {
  const text = notes.map(n => `- ${n}`).join("\n");
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Location snapshot\n${text}\n`);
};
const fail = async msg => { notes.push(`FAILED: ${msg}`); await summary(); process.exit(1); };

let body;
try {
  const res = await fetch(`${CONFIG.gasUrl}?action=locations`, { redirect: "follow" });
  if (!res.ok) await fail(`The backend answered HTTP ${res.status}.`);
  body = await res.json();
} catch (err) {
  await fail(`Could not reach the backend: ${err.message}`);
}
if (!body.ok || !Array.isArray(body.locations)) await fail(`The backend returned an error: ${body.error || "unexpected response"}`);

let old = { locations: [] };
try { old = JSON.parse(await readFile(OUT, "utf8")); } catch { /* first run */ }

// Safety net: never replace a good snapshot with an empty or suspiciously small one.
if (old.locations.length >= 4 && body.locations.length < old.locations.length * 0.5) {
  await fail(`The feed has ${body.locations.length} locations but the saved copy has ${old.locations.length}. Not overwriting; check the Sheet.`);
}
if (!body.locations.length) await fail("The feed is empty. Not writing a snapshot.");

// Data-quality hints (warnings only; they show on the workflow run page).
const seen = new Map();
for (const l of body.locations) {
  const key = `${l.name}|${l.town}`.toLowerCase();
  if (seen.has(key)) notes.push(`Possible duplicate: "${l.name}" in ${l.town || "(no town)"}`);
  seen.set(key, true);
  if (!l.town) notes.push(`No town: "${l.name}"`);
  if (!l.description) notes.push(`No description: "${l.name}"`);
}

const changed = JSON.stringify(old.locations) !== JSON.stringify(body.locations);
if (changed) {
  await writeFile(OUT, JSON.stringify({ generated: new Date().toISOString(), locations: body.locations }, null, 1) + "\n");
  notes.unshift(`Snapshot updated: ${body.locations.length} locations.`);
} else {
  notes.unshift(`No changes (${body.locations.length} locations).`);
}
await summary();
