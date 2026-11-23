import { mkdir, writeFile, rename } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { dayKey, dayBounds, nextDayKey, validateDay } from "../site/src/pricing.js";

export function buildSnapshot(response, now = new Date()) {
  if (response?.success !== true || !Array.isArray(response.data?.ee)) {
    throw new Error("Elering ei tagastanud Eesti hindu.");
  }
  const today = dayKey(now);
  const tomorrow = nextDayKey(today);
  const days = {};
  for (const key of [today, tomorrow]) {
    const { start, end } = dayBounds(key);
    const rows = response.data.ee.filter((row) =>
      Number.isFinite(row?.timestamp) && row.timestamp >= start && row.timestamp < end)
      .map(({ timestamp, price }) => ({ timestamp, price }))
      .sort((a, b) => a.timestamp - b.timestamp);
    if (key === tomorrow && rows.length === 0) continue;
    days[key] = validateDay(rows, key, { allowPartial: key === tomorrow });
  }
  return { schemaVersion: 1, updatedAt: now.toISOString(), days };
}

async function main() {
  const now = new Date();
  const today = dayKey(now);
  const { start } = dayBounds(today);
  const { end } = dayBounds(nextDayKey(today));
  const url = new URL("https://dashboard.elering.ee/api/nps/price");
  url.searchParams.set("start", new Date(start * 1000).toISOString());
  url.searchParams.set("end", new Date(end * 1000).toISOString());
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Eleringi päring ebaõnnestus: HTTP ${response.status}`);
  const snapshot = buildSnapshot(await response.json(), now);
  const directory = new URL("../site/data/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const target = new URL("prices.json", directory);
  const temporary = new URL("prices.json.tmp", directory);
  await writeFile(temporary, `${JSON.stringify(snapshot)}\n`);
  await rename(temporary, target);
  console.log(`Uuendatud: ${Object.entries(snapshot.days).map(([key, rows]) => `${key} (${rows.length})`).join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
