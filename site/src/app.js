import {
  TIME_ZONE, TARIFF_YEAR, PACKAGES, DEFAULT_SETTINGS, COMPONENTS,
  dayKey, dayBounds, nextDayKey, calculatePrices, validateSettings, validateSnapshot,
} from "./pricing.js";

const $ = (id) => document.getElementById(id);
const number = new Intl.NumberFormat("et-EE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const precise = new Intl.NumberFormat("et-EE", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const time = new Intl.DateTimeFormat("et-EE", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const date = new Intl.DateTimeFormat("et-EE", { timeZone: TIME_ZONE, day: "numeric", month: "short" });
const stamp = new Intl.DateTimeFormat("et-EE", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const zoneFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, timeZoneName: "shortOffset" });
const storageKey = "elektrihind.settings.v1";
let settings = { ...DEFAULT_SETTINGS };
let snapshot;
let selectedOffset = 0;
let rows = [];
let selectedTimestamp;
let loading = false;
let loadError = "";
let graphBars = [];
let chartLayout = { left: 0, slot: 1 };
let chartWidth = 0;

function settingsMessage(message, error = false) {
  $("settings-message").textContent = message;
  $("settings-message").classList.toggle("error", error);
}

try {
  const saved = localStorage.getItem(storageKey);
  if (saved !== null) settings = validateSettings(JSON.parse(saved));
} catch (error) {
  console.error("Seadete laadimine ebaõnnestus.", error);
  settingsMessage("Salvestatud seadeid ei saanud lugeda. Kasutan vaikeseadeid; kontrolli ja salvesta need uuesti.", true);
}
for (const [key, value] of Object.entries(settings)) {
  const field = $(key);
  if (field) field.value = value;
}

function saveSettings(next) {
  settings = validateSettings(next);
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
    settingsMessage("Muudatus rakendatud ja salvestatud sellesse brauserisse.");
  } catch (error) {
    console.error("Seadete salvestamine ebaõnnestus.", error);
    settingsMessage("Seaded rakendatud, kuid brauser ei luba neid salvestada. Need kaovad lehe sulgemisel.", true);
  }
  render();
}

function applyForm() {
  const next = { ...settings, package: $("package").value };
  for (const key of ["margin", "renewable", "excise", "security", "balancing", "vat"]) {
    next[key] = $(key).valueAsNumber;
  }
  try { saveSettings(next); }
  catch (error) { settingsMessage(error.message, true); }
}
$("settings-form").addEventListener("submit", (event) => event.preventDefault());
$("settings-form").addEventListener("input", applyForm);
$("package-quick").replaceChildren(...[...$("package").options].map((option) => option.cloneNode(true)));
$("package-quick").addEventListener("change", () => {
  $("package").value = $("package-quick").value;
  applyForm();
});
document.querySelectorAll("[data-interval]").forEach((button) => {
  button.addEventListener("click", () => saveSettings({ ...settings, interval: button.dataset.interval }));
});
for (const [id, offset] of [["today", 0], ["tomorrow", 1]]) {
  $(id).addEventListener("click", () => {
    selectedOffset = offset;
    selectedTimestamp = undefined;
    render();
  });
}

function intervalLabel(row) {
  const start = new Date(row.timestamp * 1000);
  const end = new Date((row.timestamp + row.duration) * 1000);
  const zone = (value) => zoneFormatter.formatToParts(value).find((part) => part.type === "timeZoneName").value;
  const startZone = zone(start), endZone = zone(end);
  return `${time.format(start)}${startZone !== endZone ? ` (${startZone})` : ""}–${dayKey(end) !== dayKey(start) ? "24:00" : time.format(end)} (${endZone})`;
}

function svgElement(name, attributes = {}, text) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderChart() {
  const width = Math.max(280, Math.round($("chart").clientWidth || 840));
  const height = width < 500 ? 250 : 272;
  const left = 40, right = 12, top = 23, bottom = 32;
  const values = rows.map((row) => row.total);
  const step = 10;
  const low = Math.min(0, Math.floor(Math.min(...values) / step) * step);
  const high = Math.max(100, Math.ceil(Math.max(...values) / step) * step);
  const y = (value) => top + (high - value) / (high - low) * (height - top - bottom);
  const plotWidth = width - left - right;
  const { start, end } = dayBounds(dayKey(new Date(rows[0].timestamp * 1000)));
  const duration = rows[0].duration;
  const slots = (end - start) / duration;
  const slot = plotWidth / slots;
  const gap = slot > 6 ? 1.6 : 0.6;
  chartLayout = { left, slot };
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true" });
  for (let value = low; value <= high; value += step) {
    svg.append(svgElement("line", { x1: left, x2: width - right, y1: y(value), y2: y(value), class: "grid-line" }));
    svg.append(svgElement("text", { x: left - 9, y: y(value) + 3, "text-anchor": "end", class: "axis-label" }, String(value)));
  }
  svg.append(svgElement("line", { x1: left, x2: width - right, y1: y(0), y2: y(0), class: "zero-line" }));
  const now = Date.now() / 1000;
  graphBars = rows.map((row, i) => {
    const bar = svgElement("rect", {
      x: left + i * slot + gap / 2, y: Math.min(y(0), y(row.total)),
      width: Math.max(1, slot - gap), height: Math.max(1, Math.abs(y(row.total) - y(0))),
      rx: slot > 6 ? 1.5 : 0.5, class: `bar${row.total < 0 ? " negative" : ""}${now >= row.timestamp && now < row.timestamp + row.duration ? " now" : ""}`,
      "data-index": i,
    });
    bar.append(svgElement("title", {}, `${intervalLabel(row)}: ${number.format(row.total)} senti/kWh`));
    svg.append(bar);
    return bar;
  });
  for (let i = 0; i < slots; i++) {
    const label = time.format(new Date((start + i * duration) * 1000));
    if (label.endsWith(":00") && Number(label.slice(0, 2)) % 3 === 0) {
      svg.append(svgElement("text", { x: left + i * slot, y: height - 8, class: "axis-label" }, label));
    }
  }
  $("chart").replaceChildren(svg);
}

function selectAt(clientX) {
  const svg = $("chart").firstElementChild;
  if (!svg || !rows.length) return;
  const bounds = svg.getBoundingClientRect();
  const x = (clientX - bounds.left) * svg.viewBox.baseVal.width / bounds.width - chartLayout.left;
  const index = Math.floor(x / chartLayout.slot);
  if (index >= 0 && index < rows.length) selectRow(index);
}

function selectRow(index) {
  const row = rows[index];
  if (!row) {
    $("selected-time").textContent = "Hinnad pole saadaval";
    $("selected-total").textContent = "—";
  } else {
    selectedTimestamp = row.timestamp;
    $("selected-time").textContent = `${date.format(new Date(row.timestamp * 1000))} · ${intervalLabel(row)}`;
    $("selected-total").textContent = number.format(row.total);
  }
  $("chart-selected-start").textContent = row ? time.format(new Date(row.timestamp * 1000)) : "—";
  $("chart-selected-price").textContent = $("selected-total").textContent;
  $("chart-selected-price").title = $("selected-time").textContent;
  graphBars.forEach((bar, i) => bar.classList.toggle("active", i === index));
  const fragment = document.createDocumentFragment();
  for (const [key, label] of COMPONENTS) {
    const item = document.createElement("div");
    item.className = "component";
    const name = document.createElement("span");
    name.textContent = key === "vat" ? `${label} (${settings.vat}%)` : label;
    const value = document.createElement("strong");
    value.textContent = row ? precise.format(row[key]) : "—";
    item.append(name, value);
    fragment.append(item);
  }
  $("breakdown").replaceChildren(fragment);
}

$("chart").addEventListener("pointermove", (event) => selectAt(event.clientX));
$("chart").addEventListener("pointerdown", (event) => selectAt(event.clientX));
$("chart").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !rows.length) return;
  event.preventDefault();
  const current = Math.max(0, rows.findIndex((row) => row.timestamp === selectedTimestamp));
  selectRow(event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 :
    Math.min(rows.length - 1, Math.max(0, current + (event.key === "ArrowRight" ? 1 : -1))));
});

function renderTable() {
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const value of [intervalLabel(row), number.format(row.market), number.format(row.network), number.format(row.total)]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    fragment.append(tr);
  }
  $("price-table").replaceChildren(fragment);
}

function pricesForDay(key) {
  const source = snapshot?.days[key] || [];
  const completeHours = source.slice(0, source.length - source.length % 4);
  return calculatePrices(settings.interval === "60" ? completeHours : source, settings);
}

function render() {
  const now = new Date();
  const today = dayKey(now), tomorrow = nextDayKey(today);
  const key = selectedOffset === 0 ? today : tomorrow;
  $("clock").textContent = `${time.format(now)} · Eesti aeg`;
  $("today-date").textContent = date.format(new Date(`${today}T12:00:00Z`));
  $("tomorrow-date").textContent = date.format(new Date(`${tomorrow}T12:00:00Z`));
  $("today").setAttribute("aria-pressed", String(selectedOffset === 0));
  $("tomorrow").setAttribute("aria-pressed", String(selectedOffset === 1));
  document.querySelectorAll("[data-interval]").forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.interval === settings.interval)));
  const tariffExpired = Number(key.slice(0, 4)) !== TARIFF_YEAR;
  $("tariff-warning").hidden = !tariffExpired;
  $("tariff-warning").textContent = `Vaikimisi tasud pärinevad ${TARIFF_YEAR}. aastast. ${key.slice(0, 4)}. aasta hindade jaoks kontrolli makse ja võrgutariife.`;
  $("data-message").hidden = !loadError && !!snapshot;
  $("data-message").textContent = loadError || "Laen Eleringi hindu…";
  $("data-message").classList.toggle("error", !!loadError);
  $("updated-at").textContent = snapshot ? `Uuendatud ${stamp.format(new Date(snapshot.updatedAt))}` : "Uuendusaeg puudub";
  rows = pricesForDay(key);
  const todayPrices = pricesForDay(today);
  const { start, end } = dayBounds(key);
  const partial = rows.length > 0 && rows.length * rows[0].duration < end - start;
  $("average-label").textContent = partial ? "OLEMASOLEVATE HINDADE KESKMINE" : "PÄEVA KESKMINE";
  const current = todayPrices.find((row) => now / 1000 >= row.timestamp && now / 1000 < row.timestamp + row.duration);
  $("current-price").textContent = current ? number.format(current.total) : "—";
  $("current-time").textContent = current ? intervalLabel(current) : "Hetkehind pole saadaval";
  $("chart-title").textContent = selectedOffset === 0 ? "Tänane hinnagraafik" : "Homne hinnagraafik";
  $("chart-subtitle").textContent = `Elektrilevi ${PACKAGES[settings.package].name} · ${settings.interval === "15" ? "15 minuti" : "Tunni keskmised"} hinnad · senti/kWh${partial ? " · Osaline päev" : ""}`;
  $("package-quick").value = settings.package;
  $("package").value = settings.package;
  $("chart-empty").hidden = rows.length > 0;
  $("chart-content").hidden = rows.length === 0;
  $("empty-title").textContent = selectedOffset ? "Homse päeva hinnad pole veel avaldatud" : "Tänased hinnad pole saadaval";
  $("empty-description").textContent = selectedOffset ?
    "Kui hinnad on Eleringist alla laaditud ja avaldatud, ilmub graafik siia automaatselt." :
    "Kontrolli internetiühendust ja hinnafaili viimast uuendusaega. Proovi lehte värskendada.";
  if (settings.interval === "60" && snapshot?.days[key]?.length > 0 && rows.length === 0) {
    $("empty-title").textContent = "Täieliku tunni hinnad pole veel saadaval";
    $("empty-description").textContent = "Tunni kuvamiseks on vaja kõiki nelja veerandtundi. Olemasolevaid hindu näed 15 minuti vaates.";
  }
  if (rows.length) {
    const min = rows.reduce((a, b) => a.total <= b.total ? a : b);
    const max = rows.reduce((a, b) => a.total >= b.total ? a : b);
    $("average-price").textContent = number.format(rows.reduce((sum, row) => sum + row.total, 0) / rows.length);
    $("min-price").textContent = number.format(min.total);
    $("max-price").textContent = number.format(max.total);
    $("min-time").textContent = intervalLabel(min);
    $("max-time").textContent = intervalLabel(max);
    renderChart();
    const selection = rows.findIndex((row) => selectedTimestamp >= row.timestamp && selectedTimestamp < row.timestamp + row.duration);
    const currentIndex = rows.findIndex((row) => now / 1000 >= row.timestamp && now / 1000 < row.timestamp + row.duration);
    selectRow(selection >= 0 ? selection : currentIndex >= 0 ? currentIndex : 0);
  } else {
    for (const id of ["average-price", "min-price", "max-price", "min-time", "max-time"]) $(id).textContent = "—";
    graphBars = [];
    $("chart").replaceChildren();
    selectRow(-1);
  }
  $("table-caption").textContent = `${date.format(new Date(`${key}T12:00:00Z`))} · hinnad senti/kWh`;
  renderTable();
}

async function loadPrices() {
  if (loading) return;
  loading = true;
  $("refresh").disabled = true;
  try {
    const response = await fetch(`./data/prices.json?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Hinnafaili laadimine ebaõnnestus (HTTP ${response.status}).`);
    snapshot = validateSnapshot(await response.json());
    loadError = "";
  } catch (error) {
    console.error("Hindade laadimine ebaõnnestus.", error);
    loadError = `${error.message} ${snapshot ? "Kuvan viimati edukalt laaditud andmeid nende kuupäeva järgi." : "Kontrolli ühendust ja käivita projekti hinnauuendus."}`;
  } finally {
    loading = false;
    $("refresh").disabled = false;
    render();
  }
}

$("refresh").addEventListener("click", loadPrices);
render();
loadPrices();
setInterval(loadPrices, 5 * 60000);
setInterval(render, 60000);
window.addEventListener("resize", () => {
  const width = $("chart").clientWidth;
  if (width && width !== chartWidth) { chartWidth = width; render(); }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadPrices(); });
