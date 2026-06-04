const cars = (window.FH6_CARS || []).map((car, index) => ({
  ...car,
  id: `car:${car.make}:${car.car_name}:${index}`,
  manual: false,
}));

const state = {
  pool: [],
  wheelItems: [],
  rotation: 0,
  spinning: false,
  history: readJson("fh6-history", []),
  removedIds: new Set(readJson("fh6-removed", [])),
};

const palette = [
  "#f62f5e",
  "#ffc545",
  "#30d6ff",
  "#3ee28c",
  "#8d70ff",
  "#ff7a3d",
  "#e8eef9",
  "#1b9aaa",
  "#df367c",
  "#b8f05a",
];

const wheel = document.querySelector("#wheel");
const ctx = wheel.getContext("2d");
const spinButton = document.querySelector("#spinButton");
const quickPickButton = document.querySelector("#quickPickButton");
const resetButton = document.querySelector("#resetButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const clearExcludedTypesButton = document.querySelector("#clearExcludedTypesButton");
const addExcludedTypeButton = document.querySelector("#addExcludedTypeButton");
const poolCount = document.querySelector("#poolCount");
const winnerName = document.querySelector("#winnerName");
const winnerMeta = document.querySelector("#winnerMeta");
const historyList = document.querySelector("#historyList");
const excludedTypesList = document.querySelector("#excludedTypesList");
const modeSelect = document.querySelector("#modeSelect");
const searchInput = document.querySelector("#searchInput");
const makeSelect = document.querySelector("#makeSelect");
const classSelect = document.querySelector("#classSelect");
const typeSelect = document.querySelector("#typeSelect");
const excludeTypeSelect = document.querySelector("#excludeTypeSelect");
const countrySelect = document.querySelector("#countrySelect");
const noRepeatToggle = document.querySelector("#noRepeatToggle");
const durationInput = document.querySelector("#durationInput");
const manualInput = document.querySelector("#manualInput");
const excludedTypes = new Set(readJson("fh6-excluded-types", []));

const controls = [
  modeSelect,
  searchInput,
  makeSelect,
  classSelect,
  typeSelect,
  countrySelect,
  noRepeatToggle,
  durationInput,
  manualInput,
];

hydrateSettings();
populateFilters();
bindEvents();
updatePool();
renderHistory();
renderExcludedTypes();
fitCanvas();

function bindEvents() {
  spinButton.addEventListener("click", spin);
  quickPickButton.addEventListener("click", quickPick);
  resetButton.addEventListener("click", resetRemoved);
  clearHistoryButton.addEventListener("click", clearHistory);
  clearExcludedTypesButton.addEventListener("click", clearExcludedTypes);
  addExcludedTypeButton.addEventListener("click", addExcludedType);
  excludeTypeSelect.addEventListener("input", () => setExcludeDisabled(modeSelect.value === "manual"));
  window.addEventListener("resize", fitCanvas);

  controls.forEach((control) => {
    control.addEventListener("input", () => {
      saveSettings();
      updatePool();
    });
  });
}

function hydrateSettings() {
  const settings = readJson("fh6-settings", {});
  modeSelect.value = settings.mode || "all";
  searchInput.value = settings.search || "";
  noRepeatToggle.checked = settings.noRepeat ?? true;
  durationInput.value = settings.duration || "6";
  manualInput.value = localStorage.getItem("fh6-manual") || "";
}

function saveSettings() {
  const settings = {
    mode: modeSelect.value,
    search: searchInput.value,
    make: makeSelect.value,
    carClass: classSelect.value,
    carType: typeSelect.value,
    country: countrySelect.value,
    noRepeat: noRepeatToggle.checked,
    duration: durationInput.value,
  };

  localStorage.setItem("fh6-settings", JSON.stringify(settings));
  localStorage.setItem("fh6-manual", manualInput.value);
}

function populateFilters() {
  const settings = readJson("fh6-settings", {});
  const carTypes = unique(cars.map((car) => car.car_type));
  fillSelect(makeSelect, "Qualquer marca", unique(cars.map((car) => car.make)), settings.make);
  fillSelect(classSelect, "Qualquer classe", unique(cars.map((car) => car.car_class)), settings.carClass);
  fillSelect(typeSelect, "Qualquer tipo", carTypes, settings.carType);
  fillSelect(excludeTypeSelect, "Escolha um tipo", carTypes, "all");
  fillSelect(countrySelect, "Qualquer país", unique(cars.map((car) => car.country)), settings.country);
}

function fillSelect(select, label, values, selected) {
  select.replaceChildren();
  select.append(new Option(label, "all"));
  values.forEach((value) => select.append(new Option(value, value)));
  select.value = selected || "all";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { numeric: true })
  );
}

function updatePool() {
  const mode = modeSelect.value;
  const filteredCars = filterCars();
  const manualCars = parseManualCars();
  let pool;

  if (mode === "all") {
    pool = [...cars];
  } else if (mode === "manual") {
    pool = manualCars;
  } else if (mode === "mixed") {
    pool = [...filteredCars, ...manualCars];
  } else {
    pool = filteredCars;
  }

  if (mode !== "manual" && excludedTypes.size) {
    pool = pool.filter((item) => item.manual || !excludedTypes.has(item.car_type));
  }

  if (noRepeatToggle.checked) {
    pool = pool.filter((item) => !state.removedIds.has(item.id));
  }

  state.pool = pool;
  poolCount.textContent = String(pool.length);
  setFilterDisabled(mode === "all" || mode === "manual");
  setExcludeDisabled(mode === "manual");
  setButtonsEnabled();

  if (!state.spinning) {
    state.wheelItems = sampleItems(pool, Math.min(pool.length, 64));
    drawWheel();
  }
}

function setFilterDisabled(disabled) {
  [searchInput, makeSelect, classSelect, typeSelect, countrySelect].forEach((control) => {
    control.disabled = disabled;
  });
}

function setExcludeDisabled(disabled) {
  excludeTypeSelect.disabled = disabled;
  addExcludedTypeButton.disabled =
    disabled || excludeTypeSelect.value === "all" || excludedTypes.has(excludeTypeSelect.value);
  clearExcludedTypesButton.disabled = disabled || excludedTypes.size === 0;
}

function setButtonsEnabled() {
  const hasItems = state.pool.length > 0;
  spinButton.disabled = !hasItems || state.spinning;
  quickPickButton.disabled = !hasItems || state.spinning;
  resetButton.disabled = state.removedIds.size === 0 || state.spinning;
}

function filterCars() {
  const term = normalize(searchInput.value);

  return cars.filter((car) => {
    const matchesSearch =
      !term ||
      normalize(
        `${car.make} ${car.car_name} ${car.car_type} ${car.car_class} ${car.country}`
      ).includes(term);

    return (
      matchesSearch &&
      matchesSelect(makeSelect, car.make) &&
      matchesSelect(classSelect, car.car_class) &&
      matchesSelect(typeSelect, car.car_type) &&
      matchesSelect(countrySelect, car.country)
    );
  });
}

function matchesSelect(select, value) {
  return select.value === "all" || select.value === value;
}

function parseManualCars() {
  return manualInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name, index) => ({
      id: `manual:${normalize(name)}:${index}`,
      make: "Manual",
      car_name: name,
      car_type: "Manual",
      performance_index: null,
      car_class: "-",
      country: "-",
      collection: [],
      manual: true,
    }));
}

function addExcludedType() {
  const type = excludeTypeSelect.value;

  if (type === "all" || excludedTypes.has(type)) {
    return;
  }

  excludedTypes.add(type);
  saveExcludedTypes();
  renderExcludedTypes();
  updatePool();
}

function removeExcludedType(type) {
  excludedTypes.delete(type);
  saveExcludedTypes();
  renderExcludedTypes();
  updatePool();
}

function clearExcludedTypes() {
  excludedTypes.clear();
  saveExcludedTypes();
  renderExcludedTypes();
  updatePool();
}

function saveExcludedTypes() {
  localStorage.setItem("fh6-excluded-types", JSON.stringify([...excludedTypes]));
}

function spin() {
  if (state.spinning || state.pool.length === 0) {
    return;
  }

  const winner = pickRandom(state.pool);
  const wheelItems = buildSpinItems(winner);
  const winnerIndex = wheelItems.findIndex((item) => item.id === winner.id);
  const slice = (Math.PI * 2) / wheelItems.length;
  const current = mod(state.rotation, Math.PI * 2);
  const target = mod(-Math.PI / 2 - (winnerIndex + 0.5) * slice, Math.PI * 2);
  const turns = 7 + randomInt(4);
  const delta = mod(target - current, Math.PI * 2) + turns * Math.PI * 2;
  const start = state.rotation;
  const end = start + delta;
  const duration = Number(durationInput.value) * 1000;
  const startedAt = performance.now();

  state.spinning = true;
  state.wheelItems = wheelItems;
  setButtonsEnabled();

  function frame(now) {
    const progress = Math.min((now - startedAt) / duration, 1);
    state.rotation = start + (end - start) * easeOutCubic(progress);
    drawWheel();

    if (progress < 1) {
      requestAnimationFrame(frame);
      return;
    }

    state.rotation = end;
    state.spinning = false;
    finishPick(winner);
  }

  requestAnimationFrame(frame);
}

function quickPick() {
  if (state.spinning || state.pool.length === 0) {
    return;
  }

  finishPick(pickRandom(state.pool));
}

function finishPick(winner) {
  winnerName.textContent = titleFor(winner);
  winnerMeta.textContent = metaFor(winner);

  if (noRepeatToggle.checked) {
    state.removedIds.add(winner.id);
    localStorage.setItem("fh6-removed", JSON.stringify([...state.removedIds]));
  }

  state.history.unshift({
    title: titleFor(winner),
    meta: metaFor(winner),
    at: new Date().toLocaleString("pt-BR"),
  });
  state.history = state.history.slice(0, 15);
  localStorage.setItem("fh6-history", JSON.stringify(state.history));

  renderHistory();
  updatePool();
}

function buildSpinItems(winner) {
  const maxSegments = Math.min(state.pool.length, 48);
  const others = state.pool.filter((item) => item.id !== winner.id);
  const selected = [winner, ...sampleItems(others, maxSegments - 1)];
  return shuffle(selected);
}

function sampleItems(items, amount) {
  if (amount <= 0) {
    return [];
  }

  return shuffle([...items]).slice(0, amount);
}

function drawWheel() {
  const items = state.wheelItems.length ? state.wheelItems : [];
  const size = wheel.width;
  const center = size / 2;
  const radius = center - 18;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(center, center);

  if (!items.length) {
    drawEmptyWheel(radius);
    ctx.restore();
    return;
  }

  const slice = (Math.PI * 2) / items.length;
  items.forEach((item, index) => {
    const start = state.rotation + index * slice;
    const end = start + slice;
    const color = palette[index % palette.length];

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.36)";
    ctx.lineWidth = Math.max(1, size * 0.002);
    ctx.stroke();

    if (items.length <= 64) {
      drawSegmentLabel(item, start + slice / 2, radius, color);
    }
  });

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.lineWidth = 18;
  ctx.strokeStyle = "#10131b";
  ctx.stroke();

  ctx.restore();
}

function drawSegmentLabel(item, angle, radius, color) {
  ctx.save();
  ctx.rotate(angle);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = readableText(color);
  ctx.font = `800 ${Math.max(11, Math.floor(radius * 0.036))}px Inter, Segoe UI, sans-serif`;

  const label = truncate(titleFor(item), radius > 320 ? 30 : 22);
  ctx.fillText(label, radius - 28, 0);
  ctx.restore();
}

function drawEmptyWheel(radius) {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#141824";
  ctx.fill();
  ctx.strokeStyle = "#343949";
  ctx.lineWidth = 18;
  ctx.stroke();

  ctx.fillStyle = "#aeb6c7";
  ctx.font = `800 ${Math.max(16, Math.floor(radius * 0.075))}px Inter, Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Sem itens", 0, 0);
}

function fitCanvas() {
  const rect = wheel.getBoundingClientRect();
  const cssSize = Math.floor(rect.width);
  wheel.width = cssSize;
  wheel.height = cssSize;
  drawWheel();
}

function resetRemoved() {
  state.removedIds.clear();
  localStorage.removeItem("fh6-removed");
  updatePool();
}

function clearHistory() {
  state.history = [];
  localStorage.removeItem("fh6-history");
  renderHistory();
}

function renderHistory() {
  historyList.replaceChildren();

  state.history.forEach((entry) => {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const meta = document.createElement("span");

    title.textContent = entry.title;
    meta.textContent = entry.meta ? ` - ${entry.meta}` : "";
    item.append(title, meta);
    historyList.append(item);
  });
}

function renderExcludedTypes() {
  excludedTypesList.replaceChildren();

  [...excludedTypes].sort((a, b) => a.localeCompare(b, "pt-BR")).forEach((type) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = `${type} ×`;
    chip.title = `Voltar a incluir ${type}`;
    chip.addEventListener("click", () => removeExcludedType(type));
    excludedTypesList.append(chip);
  });

  setExcludeDisabled(modeSelect.value === "manual");
}

function titleFor(item) {
  return item.car_name || item.make || "Item manual";
}

function metaFor(item) {
  if (item.manual) {
    return "Adicionado manualmente";
  }

  const classText = item.performance_index
    ? `${item.performance_index} ${item.car_class}`
    : item.car_class;

  return [item.make, item.car_type, classText, item.country].filter(Boolean).join(" • ");
}

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function pickRandom(items) {
  return items[randomInt(items.length)];
}

function randomInt(max) {
  if (max <= 0) {
    return 0;
  }

  if (!window.crypto?.getRandomValues) {
    return Math.floor(Math.random() * max);
  }

  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }

  return items;
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function readableText(hex) {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 145 ? "#11131a" : "#ffffff";
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
