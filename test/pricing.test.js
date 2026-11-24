import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS, calculatePrices, dayBounds, dayKey, nextDayKey,
  networkRate, validateDay, validateSettings, validateSnapshot,
} from "../site/src/pricing.js";
import { buildSnapshot } from "../scripts/update-prices.mjs";

function day(key, price = 100) {
  const { start, end } = dayBounds(key);
  return Array.from({ length: (end - start) / 900 }, (_, i) => ({ timestamp: start + i * 900, price }));
}
const epoch = (iso) => Date.parse(iso) / 1000;

test("Lõpphind sisaldab kõiki tasusid ja käibemaksu täpselt üks kord", () => {
  const timestamp = epoch("2026-11-16T08:00:00+02:00");
  const [row] = calculatePrices([{ timestamp, price: 100 }], { ...DEFAULT_SETTINGS, margin: 0.5 });
  const subtotal = 10 + 6.07 + 0.5 + 0.84 + 0.21 + 0.758 + 0.373;
  assert.ok(Math.abs(row.total - subtotal * 1.24) < 1e-10);
  assert.ok(Math.abs(row.vat - subtotal * 0.24) < 1e-10);
});

test("Negatiivset börsi- ega lõpphinda ei lõigata nulliks", () => {
  const [row] = calculatePrices([{ timestamp: epoch("2026-11-16T03:00:00+02:00"), price: -200 }], DEFAULT_SETTINGS);
  assert.equal(row.market, -20);
  assert.ok(row.total < 0);
});

test("Elektrilevi päeva-, öö- ja talvised tiputariifid vahetuvad õigel piiril", () => {
  for (const [time, price] of [
    ["06:45", 3.03], ["07:00", 5.29], ["08:45", 5.29], ["09:00", 8.18],
    ["11:45", 8.18], ["12:00", 5.29], ["16:00", 8.18], ["20:00", 5.29], ["22:00", 3.03],
  ]) assert.equal(networkRate(epoch(`2026-11-16T${time}:00+02:00`), "VORK5"), price, time);
  assert.equal(networkRate(epoch("2026-11-14T16:00:00+02:00"), "VORK5"), 4.74);
  assert.equal(networkRate(epoch("2026-11-14T20:00:00+02:00"), "VORK5"), 3.03);
  assert.equal(networkRate(epoch("2026-07-14T09:00:00+03:00"), "VORK5"), 5.29);
  assert.equal(networkRate(epoch("2026-07-14T22:00:00+03:00"), "VORK2"), 3.51);
});

test("Riiklikel pühadel, sh suurel reedel, kehtib puhkepäeva tariif", () => {
  assert.equal(networkRate(epoch("2026-02-24T10:00:00+02:00"), "VORK2"), 3.51);
  assert.equal(networkRate(epoch("2026-12-24T17:00:00+02:00"), "VORK5"), 4.74);
  assert.equal(networkRate(epoch("2026-04-03T10:00:00+03:00"), "VORK2"), 3.51);
  assert.equal(networkRate(epoch("2026-04-02T10:00:00+03:00"), "VORK2"), 6.07);
});

test("Kuupäev määratakse Eesti ajavööndis, mitte masina kohalikus ajas", () => {
  assert.equal(dayKey(new Date("2026-11-15T22:30:00Z")), "2026-11-16");
  assert.equal(dayKey(new Date("2026-06-15T21:30:00Z")), "2026-06-16");
  assert.equal(nextDayKey("2026-12-31"), "2027-01-01");
});

test("Suve- ja talveajale üleminekul on päevas 92 ja 100 veerandtundi", () => {
  for (const [key, count, hours] of [["2026-03-29", 92, 23], ["2026-10-25", 100, 25], ["2026-11-16", 96, 24]]) {
    const rows = day(key);
    assert.equal(rows.length, count);
    assert.equal(validateDay(rows, key), rows);
    const prices = calculatePrices(rows, { ...DEFAULT_SETTINGS, interval: "60" });
    assert.equal(prices.length, hours);
    assert.equal(new Set(prices.map((row) => row.timestamp)).size, hours);
    assert.ok(prices.every((row) => dayKey(new Date(row.timestamp * 1000)) === key));
  }
});

test("Tunni lõpphind on nelja veerandtunni hindade keskmine", () => {
  const start = epoch("2026-11-16T08:00:00+02:00");
  const rows = [10, 20, -30, 80].map((price, i) => ({ timestamp: start + i * 900, price }));
  const quarters = calculatePrices(rows, DEFAULT_SETTINGS);
  const [hour] = calculatePrices(rows, { ...DEFAULT_SETTINGS, interval: "60" });
  assert.equal(hour.market, 2);
  assert.ok(Math.abs(hour.total - quarters.reduce((sum, row) => sum + row.total, 0) / 4) < 1e-10);
  assert.throws(() => calculatePrices(rows.slice(1), { ...DEFAULT_SETTINGS, interval: "60" }), /neli veerandtundi/);
});

test("Puuduv, korduv, nihutatud või vigane hinnapunkt lükatakse tagasi", () => {
  const rows = day("2026-11-16");
  assert.throws(() => validateDay(rows.slice(1), "2026-11-16"), /puudulikud/);
  assert.throws(() => validateDay([...rows.slice(0, -1), rows[0]], "2026-11-16"), /puudulikud/);
  assert.throws(() => validateDay(rows.map((row, i) => i === 1 ? { ...row, timestamp: row.timestamp + 1 } : row), "2026-11-16"), /puudulikud/);
  assert.throws(() => validateDay(rows.map((row, i) => i === 1 ? { ...row, price: null } : row), "2026-11-16"), /puudulikud/);
  assert.throws(() => dayBounds("2026-02-30"), /kuupäev/);
});

test("Vigaseid seadeid ja hinnafaile ei kasutata", () => {
  for (const settings of [null, { ...DEFAULT_SETTINGS, package: "toString" },
    { ...DEFAULT_SETTINGS, margin: "" }, { ...DEFAULT_SETTINGS, vat: 101 }, { ...DEFAULT_SETTINGS, interval: "30" }]) {
    assert.throws(() => validateSettings(settings), /Kontrolli seadeid/);
  }
  assert.throws(() => validateSnapshot({ schemaVersion: 1, updatedAt: "invalid", days: {} }), /vorming/);
  assert.throws(() => validateSnapshot({ schemaVersion: 1, updatedAt: new Date().toISOString(), days: {} }), /vorming/);
});

test("Hinnauuendus lubab avaldamata homset, mitte poolikut tänast", () => {
  const now = new Date("2026-11-16T10:00:00Z");
  const today = day("2026-11-16"), tomorrow = day("2026-11-17");
  const response = (rows) => ({ success: true, data: { ee: rows } });
  const snapshot = buildSnapshot(response(today), now);
  assert.deepEqual(Object.keys(snapshot.days), ["2026-11-16"]);
  assert.equal(validateSnapshot(snapshot), snapshot);
  assert.throws(() => buildSnapshot(response(today.slice(1)), now), /puudulikud/);
  assert.throws(() => buildSnapshot({ success: false }, now), /Eesti hindu/);
});

test("Homse olemasolevad veerandtunnid avaldatakse ka kellakeeramise päevadel", () => {
  for (const [todayKey, tomorrowKey] of [
    ["2026-11-23", "2026-11-24"],
    ["2026-03-28", "2026-03-29"],
    ["2026-10-24", "2026-10-25"],
  ]) {
    const today = day(todayKey), tomorrow = day(tomorrowKey);
    const now = new Date(`${todayKey}T10:00:00Z`);
    for (const count of [1, 4, tomorrow.length - 1]) {
      const snapshot = buildSnapshot({
        success: true, data: { ee: [...today, ...tomorrow.slice(0, count)] },
      }, now);
      assert.deepEqual(snapshot.days, { [todayKey]: today, [tomorrowKey]: tomorrow.slice(0, count) });
      assert.equal(validateSnapshot(snapshot), snapshot);
      assert.equal(validateSnapshot(JSON.parse(JSON.stringify(snapshot))).days[tomorrowKey].length, count);
    }
  }
});

test("Poolik homne peab algama keskööst ning sisaldama järjestikuseid vigadeta hindu", () => {
  const today = day("2026-11-23"), tomorrow = day("2026-11-24").slice(0, 4);
  const now = new Date("2026-11-23T10:00:00Z");
  for (const invalid of [
    tomorrow.slice(1),
    [tomorrow[0], tomorrow[0], ...tomorrow.slice(2)],
    tomorrow.map((row, i) => i === 1 ? { ...row, price: null } : row),
  ]) {
    assert.throws(() => buildSnapshot({
      success: true, data: { ee: [...today, ...invalid] },
    }, now), /2026-11-24: puudulikud/);
    assert.throws(() => validateSnapshot({
      schemaVersion: 1, updatedAt: now.toISOString(),
      days: { "2026-11-23": today, "2026-11-24": invalid },
    }), /2026-11-24: puudulikud/);
  }
  assert.throws(() => validateSnapshot({
    schemaVersion: 1, updatedAt: now.toISOString(),
    days: { "2026-11-23": today.slice(0, 4) },
  }), /2026-11-23: puudulikud/);
  assert.throws(() => validateSnapshot({
    schemaVersion: 1, updatedAt: now.toISOString(),
    days: { "2026-11-24": [] },
  }), /2026-11-24: puudulikud/);
  const snapshot = buildSnapshot({ success: true, data: { ee: [...today, ...tomorrow] } }, now);
  const hours = calculatePrices(snapshot.days["2026-11-24"], { ...DEFAULT_SETTINGS, interval: "60" });
  assert.equal(hours.length, 1);
  assert.equal(hours[0].timestamp, tomorrow[0].timestamp);
});

test("Täieliku punktide arvuga vigased homsed hinnad katkestavad uuenduse", () => {
  const today = day("2026-11-23"), tomorrow = day("2026-11-24");
  tomorrow[0].price = null;
  assert.throws(() => buildSnapshot({
    success: true, data: { ee: [...today, ...tomorrow] },
  }, new Date("2026-11-23T10:00:00Z")), /2026-11-24: puudulikud/);
});

test("Ülehomse esimene tund säilib pärast keskööd homsel graafikul", () => {
  for (const todayKey of ["2026-11-23", "2026-03-28", "2026-10-24", "2026-12-31"]) {
    const tomorrowKey = nextDayKey(todayKey);
    const dayAfterTomorrowKey = nextDayKey(tomorrowKey);
    const today = day(todayKey), tomorrow = day(tomorrowKey);
    const firstHour = day(dayAfterTomorrowKey).slice(0, 4);
    const snapshot = buildSnapshot({
      success: true, data: { ee: [...today, ...tomorrow, ...firstHour] },
    }, new Date(`${todayKey}T12:13:00Z`));
    const saved = validateSnapshot(JSON.parse(JSON.stringify(snapshot)));
    assert.deepEqual(saved.days, {
      [todayKey]: today, [tomorrowKey]: tomorrow, [dayAfterTomorrowKey]: firstHour,
    });
    const nextMorning = new Date((dayBounds(tomorrowKey).start + 3600) * 1000);
    const displayedTomorrow = nextDayKey(dayKey(nextMorning));
    assert.deepEqual(saved.days[displayedTomorrow], firstHour);
    const hours = calculatePrices(saved.days[displayedTomorrow], { ...DEFAULT_SETTINGS, interval: "60" });
    assert.equal(hours.length, 1);
    assert.equal(hours[0].timestamp, dayBounds(displayedTomorrow).start);
  }
});

test("Vigased ülehomsed hinnad lükatakse tagasi nii laadimisel kui hinnafaili lugemisel", () => {
  const today = day("2026-11-23"), tomorrow = day("2026-11-24");
  const firstHour = day("2026-11-25").slice(0, 4);
  const now = new Date("2026-11-23T12:13:00Z");
  for (const invalid of [
    firstHour.slice(1),
    [firstHour[0], firstHour[0], ...firstHour.slice(2)],
    firstHour.map((row, i) => i === 1 ? { ...row, price: null } : row),
  ]) {
    assert.throws(() => buildSnapshot({
      success: true, data: { ee: [...today, ...tomorrow, ...invalid] },
    }, now), /2026-11-25: puudulikud/);
    assert.throws(() => validateSnapshot({
      schemaVersion: 1, updatedAt: now.toISOString(),
      days: { "2026-11-23": today, "2026-11-24": tomorrow, "2026-11-25": invalid },
    }), /2026-11-25: puudulikud/);
  }
});

test("Hinnauuendus järjestab kolm päeva ja ei kaasa ülejärgmise päeva lõpuhetke", () => {
  const today = day("2026-11-16"), tomorrow = day("2026-11-17");
  const dayAfterTomorrow = day("2026-11-18").slice(0, 4);
  const extra = { timestamp: dayBounds("2026-11-19").start, price: 999 };
  const snapshot = buildSnapshot({ success: true, data: { ee: [...today, ...tomorrow, ...dayAfterTomorrow, extra].reverse() } },
    new Date("2026-11-16T15:00:00Z"));
  assert.deepEqual(snapshot.days, {
    "2026-11-16": today, "2026-11-17": tomorrow, "2026-11-18": dayAfterTomorrow,
  });
});
