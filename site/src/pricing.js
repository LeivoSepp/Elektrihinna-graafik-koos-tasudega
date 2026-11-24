export const TIME_ZONE = "Europe/Tallinn";
export const TARIFF_YEAR = 2026;
export const PACKAGES = {
  VORK1: { name: "Võrk 1", day: 7.72, night: 7.72, peakDay: 7.72, peakRest: 7.72 },
  VORK2: { name: "Võrk 2", day: 6.07, night: 3.51, peakDay: 6.07, peakRest: 3.51 },
  VORK4: { name: "Võrk 4", day: 3.69, night: 2.10, peakDay: 3.69, peakRest: 2.10 },
  VORK5: { name: "Võrk 5", day: 5.29, night: 3.03, peakDay: 8.18, peakRest: 4.74 },
};
export const DEFAULT_SETTINGS = {
  package: "VORK2",
  interval: "15",
  margin: 0,
  renewable: 0.84,
  excise: 0.21,
  security: 0.758,
  balancing: 0.373,
  vat: 24,
};
export const COMPONENTS = [
  ["market", "Börsihind"],
  ["network", "Võrgutasu"],
  ["margin", "Müüja marginaal"],
  ["renewable", "Taastuvenergia tasu"],
  ["excise", "Elektriaktsiis"],
  ["security", "Varustuskindluse tasu"],
  ["balancing", "Tasakaalustamisvõimsuse kulu"],
  ["vat", "Käibemaks"],
];
const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function localParts(date) {
  return Object.fromEntries(partsFormatter.formatToParts(date)
    .filter(({ type }) => type !== "literal").map(({ type, value }) => [type, Number(value)]));
}

export function dayKey(date = new Date()) {
  const p = localParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function nextDayKey(key) {
  return new Date(Date.parse(`${key}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

export function dayBounds(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) ||
      !Number.isFinite(Date.parse(`${key}T00:00:00Z`)) ||
      new Date(`${key}T00:00:00Z`).toISOString().slice(0, 10) !== key) {
    throw new Error("Vigane kuupäev.");
  }
  function midnight(dateKey) {
    const target = Date.parse(`${dateKey}T00:00:00Z`);
    let result = target;
    for (let i = 0; i < 3; i++) {
      const p = localParts(new Date(result));
      result += target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    }
    return result / 1000;
  }
  return { start: midnight(key), end: midnight(nextDayKey(key)) };
}

export function validateDay(rows, key, { allowPartial = false } = {}) {
  const { start, end } = dayBounds(key);
  const expected = (end - start) / 900;
  if (!Array.isArray(rows) || (allowPartial
    ? rows.length === 0 || rows.length > expected
    : rows.length !== expected) ||
      rows.some((row, i) => row === null || typeof row !== "object" ||
        row.timestamp !== start + i * 900 || !Number.isFinite(row.price))) {
    throw new Error(`${key}: puudulikud või vigased 15 minuti hinnad.`);
  }
  return rows;
}

export function validateSnapshot(data) {
  if (data?.schemaVersion !== 1 || !Number.isFinite(Date.parse(data.updatedAt)) ||
      !data.days || typeof data.days !== "object" || Array.isArray(data.days) ||
      Object.keys(data.days).length === 0) {
    throw new Error("Hinnafaili vorming on vigane.");
  }
  const tomorrow = nextDayKey(dayKey(new Date(data.updatedAt)));
  const dayAfterTomorrow = nextDayKey(tomorrow);
  for (const [key, rows] of Object.entries(data.days)) {
    validateDay(rows, key, { allowPartial: key === tomorrow || key === dayAfterTomorrow });
  }
  return data;
}

export function validateSettings(settings) {
  if (!settings || !Object.hasOwn(PACKAGES, settings.package) ||
      !["15", "60"].includes(settings.interval) ||
      !["margin", "renewable", "excise", "security", "balancing", "vat"].every(
        (key) => Number.isFinite(settings[key]) && settings[key] >= 0 &&
          settings[key] <= (key === "vat" ? 100 : 1000))) {
    throw new Error("Kontrolli seadeid: tasud peavad olema arvud vahemikus 0–1000 ja käibemaks 0–100%.");
  }
  return settings;
}

function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return Date.UTC(year, month - 1, (h + l - 7 * m + 114) % 31 + 1);
}

export function isPublicHoliday(key) {
  const year = Number(key.slice(0, 4));
  if (["01-01", "02-24", "05-01", "06-23", "06-24", "08-20", "12-24", "12-25", "12-26"]
    .includes(key.slice(5))) return true;
  const easter = easterSunday(year);
  return [-2, 0, 49].some((offset) =>
    new Date(easter + offset * 86400000).toISOString().slice(0, 10) === key);
}

export function networkRate(timestamp, packageId) {
  const pack = PACKAGES[packageId];
  if (!pack) throw new Error("Tundmatu võrgupakett.");
  const date = new Date(timestamp * 1000);
  const { hour, month } = localParts(date);
  const key = dayKey(date);
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
  const rest = weekday === 0 || weekday === 6 || isPublicHoliday(key);
  const winter = month >= 11 || month <= 3;
  if (winter && rest && hour >= 16 && hour < 20) return pack.peakRest;
  if (winter && !rest && ((hour >= 9 && hour < 12) || (hour >= 16 && hour < 20))) {
    return pack.peakDay;
  }
  return rest || hour < 7 || hour >= 22 ? pack.night : pack.day;
}

export function calculatePrices(rows, settings) {
  validateSettings(settings);
  const quarters = rows.map(({ timestamp, price }) => {
    const result = {
      timestamp, duration: 900, market: price / 10,
      network: networkRate(timestamp, settings.package),
      ...Object.fromEntries(["margin", "renewable", "excise", "security", "balancing"]
        .map((key) => [key, settings[key]])),
    };
    const subtotal = COMPONENTS.filter(([key]) => key !== "vat")
      .reduce((sum, [key]) => sum + result[key], 0);
    result.vat = subtotal * settings.vat / 100;
    result.total = subtotal + result.vat;
    return result;
  });
  if (settings.interval === "15") return quarters;
  const hours = new Map();
  for (const row of quarters) {
    const key = Math.floor(row.timestamp / 3600);
    if (!hours.has(key)) hours.set(key, []);
    hours.get(key).push(row);
  }
  return [...hours.values()].map((group) => {
    if (group.length !== 4) throw new Error("Tunni arvutamiseks peavad olemas olema kõik neli veerandtundi.");
    return {
      timestamp: group[0].timestamp, duration: 3600,
      ...Object.fromEntries([...COMPONENTS.map(([key]) => key), "total"].map((key) =>
        [key, group.reduce((sum, row) => sum + row[key], 0) / group.length])),
    };
  });
}
