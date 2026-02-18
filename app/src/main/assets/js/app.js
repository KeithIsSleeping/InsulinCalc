/* ============================================================
   Insulin Calc – Application Logic
   ============================================================
   Features:
   - Unlimited named profiles (replace Day/Night tabs)
   - Time-based auto-profile selection
   - Settings: theme override, glucose unit switching
   - All glucose values stored internally in mg/dL
   ============================================================ */

// ---- Constants ----
const MGDL_TO_MMOL = 18.018;

// ---- State ----
let activeProfileId = null;
let profiles = [];
let settings = { theme: "system", units: "mgdl", rounding: 0.5 };
let editingProfileId = null;

// ---- DOM Helper ----
const $ = id => document.getElementById(id);

// ---- Utility ----
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
}

function formatTime12(time24) {
    if (!time24) return "";
    const [h, m] = time24.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return h12 + ":" + m + " " + ampm;
}

// ---- Unit Conversion ----
// Internal storage is always mg/dL. These convert for display.
function mgToDisplay(mg) {
    const v = parseFloat(mg);
    if (isNaN(v)) return "";
    if (settings.units === "mmol") return +(v / MGDL_TO_MMOL).toFixed(1);
    return Math.round(v);
}

function displayToMg(val) {
    const v = parseFloat(val);
    if (isNaN(v)) return "";
    if (settings.units === "mmol") return v * MGDL_TO_MMOL;
    return v;
}

function unitLabel() {
    return settings.units === "mmol" ? "mmol/L" : "mg/dL";
}

// ---- Profile Factory ----
function createProfile(name, startTime, endTime) {
    return {
        id: generateId(),
        name: name || "Profile",
        startTime: startTime || "",
        endTime: endTime || "",
        carbRatio: "",
        correctionFactor: "",   // mg/dL
        target: "",             // mg/dL
        dexcomValue: NaN
    };
}

// ---- Profile Helpers ----
function getProfile(id) { return profiles.find(p => p.id === id); }
function activeProfile() { return getProfile(activeProfileId); }

// ---- Field Info Definitions ----
const fieldInfo = {
    carbsToEat: {
        title: "Carbs To Eat",
        body: `The total grams of carbohydrates you are about to eat in this meal or snack.
            <b>Check nutrition labels</b> or use a carb-counting reference to determine this value.
            <span class="info-popup-example">Example: A sandwich with 30g carbs + an apple with 15g = enter <b>45</b></span>`
    },
    currentGlucose: {
        title: "Glucose",
        body: `Your current blood glucose reading from your glucose meter or CGM.
            <br><br>If you use a <b>Dexcom CGM</b>, tap the trend icon to factor in the
            trending arrow direction, which adjusts the calculation based on whether your glucose
            is rising or falling.
            <span class="info-popup-example">Example: Your meter reads 180 → enter <b>180</b></span>`
    },
    carbRatio: {
        title: "Carb Ratio (ICR)",
        body: `Your <b>Insulin-to-Carb Ratio</b> — the number of grams of carbohydrate covered by
            1 unit of rapid-acting insulin. This value is prescribed by your doctor or endocrinologist
            and may differ between profiles.
            <br><br>Decimals are supported (e.g., 7.5).
            <span class="info-popup-example">Example: A ratio of 1:10 means 1 unit covers 10g of carbs → enter <b>10</b></span>
            <span class="info-popup-example">Formula: Carb Dose = Carbs &divide; Carb Ratio</span>`
    },
    correctionFactor: {
        title: "Correction Factor (ISF)",
        body: `Your <b>Insulin Sensitivity Factor</b> — how much one unit of insulin will lower
            your blood glucose. Also called the <b>correction factor</b>, set by your
            healthcare provider. It varies by person and time of day.
            <br><br>Decimals are supported.
            <span class="info-popup-example">Example: If 1 unit drops you 50 → enter <b>50</b></span>
            <span class="info-popup-example">Formula: Correction = (Current − Target) &divide; Factor</span>`
    },
    target: {
        title: "Target Glucose",
        body: `Your <b>target blood glucose level</b> — the number your healthcare provider
            wants you to aim for. If your current glucose is above this, a correction dose is added.
            If below, the correction will subtract (potentially reducing your total dose or recommending
            extra carbs).
            <span class="info-popup-example">Example: Your doctor says aim for 120 → enter <b>120</b></span>`
    }
};

// ---- Info Popup ----
function showInfo(fieldId) {
    const info = fieldInfo[fieldId];
    if (!info) return;
    $("infoTitle").textContent = info.title;
    $("infoBody").innerHTML = info.body;
    $("infoOverlay").classList.add("active");
}

function closeInfo() {
    $("infoOverlay").classList.remove("active");
}

// ---- Input Helpers ----
function getInputVal(id) {
    const el = $(id);
    const val = parseFloat(el.value);
    if (isNaN(val) || val < 0) {
        el.classList.add("error");
        return null;
    }
    el.classList.remove("error");
    return val;
}

function setFieldReadonly(id, value, readonly) {
    const el = $(id);
    if (value !== "" && value !== undefined) {
        el.value = value;
    }
    el.readOnly = readonly;
    if (!readonly) {
        el.value = "";
        el.focus();
    }
}

// ---- Persistence ----
function saveAll() {
    localStorage.setItem("ic_profiles", JSON.stringify(profiles));
    localStorage.setItem("ic_settings", JSON.stringify(settings));
    localStorage.setItem("ic_activeProfileId", activeProfileId);
}

function loadAll() {
    try {
        const p = localStorage.getItem("ic_profiles");
        if (p) {
            profiles = JSON.parse(p);
            // NaN becomes null in JSON — restore it
            profiles.forEach(prof => {
                if (prof.dexcomValue === null || prof.dexcomValue === undefined) {
                    prof.dexcomValue = NaN;
                }
            });
        }
        const s = localStorage.getItem("ic_settings");
        if (s) settings = { ...settings, ...JSON.parse(s) };
        const a = localStorage.getItem("ic_activeProfileId");
        if (a) activeProfileId = a;
    } catch (e) { /* ignore corrupt data */ }
}

// ---- Migration from old Day/Night presets ----
function migrateOldPresets() {
    if (localStorage.getItem("ic_profiles")) return;

    const dayRaw = localStorage.getItem("preset_day");
    const nightRaw = localStorage.getItem("preset_night");
    if (!dayRaw && !nightRaw) return;

    const dayProfile = createProfile("Day", "06:00", "20:00");
    const nightProfile = createProfile("Night", "20:00", "06:00");

    try {
        if (dayRaw) {
            const d = JSON.parse(dayRaw);
            dayProfile.carbRatio = d.carbRatio || "";
            const cf = parseFloat(d.correctionFactor);
            dayProfile.correctionFactor = !isNaN(cf) ? cf : "";
            const tg = parseFloat(d.target);
            dayProfile.target = !isNaN(tg) ? tg : "";
            dayProfile.dexcomValue = (d.dexcomValue !== undefined && d.dexcomValue !== null)
                ? d.dexcomValue : NaN;
        }
    } catch (e) {}

    try {
        if (nightRaw) {
            const n = JSON.parse(nightRaw);
            nightProfile.carbRatio = n.carbRatio || "";
            const cf = parseFloat(n.correctionFactor);
            nightProfile.correctionFactor = !isNaN(cf) ? cf : "";
            const tg = parseFloat(n.target);
            nightProfile.target = !isNaN(tg) ? tg : "";
            nightProfile.dexcomValue = (n.dexcomValue !== undefined && n.dexcomValue !== null)
                ? n.dexcomValue : NaN;
        }
    } catch (e) {}

    profiles = [dayProfile, nightProfile];
    activeProfileId = dayProfile.id;

    // Clean up old keys
    localStorage.removeItem("preset_day");
    localStorage.removeItem("preset_night");
    saveAll();
}

// ---- Theme ----
function applyTheme(theme) {
    const html = document.documentElement;
    html.removeAttribute("data-theme");
    if (theme === "light" || theme === "dark") {
        html.setAttribute("data-theme", theme);
    }
}

function setTheme(theme) {
    settings.theme = theme;
    applyTheme(theme);
    saveAll();
    renderThemeOptions();
}

function renderThemeOptions() {
    document.querySelectorAll("#themeOptions .settings-toggle").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.value === settings.theme);
    });
}

// ---- Units ----
function setUnits(unit) {
    if (unit === settings.units) return;
    saveFormToProfile();
    settings.units = unit;
    saveAll();
    renderUnitOptions();
    updateUnitLabels();
    renderTrendStrip();
    loadProfileToForm();
    clearResults();
}

function renderUnitOptions() {
    document.querySelectorAll("#unitOptions .settings-toggle").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.value === settings.units);
    });
}

function setRounding(val) {
    settings.rounding = val;
    saveAll();
    renderRoundingOptions();
}

function renderRoundingOptions() {
    document.querySelectorAll("#roundingOptions .settings-toggle").forEach(btn => {
        btn.classList.toggle("active", parseFloat(btn.dataset.value) === settings.rounding);
    });
}

function updateUnitLabels() {
    const label = unitLabel();
    document.querySelectorAll(".glucose-unit").forEach(el => {
        el.textContent = label;
    });
}

// ---- Profile Bar ----
function renderProfileTabs() {
    const container = $("profileTabs");
    container.innerHTML = "";
    profiles.forEach(p => {
        const btn = document.createElement("button");
        btn.className = "profile-tab" + (p.id === activeProfileId ? " active" : "");
        btn.textContent = p.name;
        btn.onclick = () => switchProfile(p.id);

        container.appendChild(btn);
    });
}

// ---- Profile Switching ----
function switchProfile(id) {
    if (id === activeProfileId) return;
    saveFormToProfile();
    activeProfileId = id;
    saveAll();
    renderProfileTabs();
    loadProfileToForm();

    // Collapse trend panel & clear results
    $("trendPanel").classList.remove("open");
    $("trendToggle").classList.remove("open");
    clearResults();
}

function saveFormToProfile() {
    const p = activeProfile();
    if (!p) return;
    p.carbRatio = $("carbRatio").value;

    const cfVal = $("correctionFactor").value;
    p.correctionFactor = cfVal !== "" ? displayToMg(parseFloat(cfVal)) : "";

    const tgVal = $("target").value;
    p.target = tgVal !== "" ? displayToMg(parseFloat(tgVal)) : "";
}

function loadProfileToForm() {
    const p = activeProfile();
    if (!p) return;

    // Carb ratio (unit-independent)
    if (p.carbRatio && p.carbRatio !== "") {
        setFieldReadonly("carbRatio", p.carbRatio, true);
    } else {
        $("carbRatio").value = "";
        $("carbRatio").readOnly = false;
    }

    // Correction factor (stored mg/dL → display)
    if (p.correctionFactor !== "" && p.correctionFactor !== undefined) {
        setFieldReadonly("correctionFactor", mgToDisplay(p.correctionFactor), true);
    } else {
        $("correctionFactor").value = "";
        $("correctionFactor").readOnly = false;
    }

    // Target (stored mg/dL → display)
    if (p.target !== "" && p.target !== undefined) {
        setFieldReadonly("target", mgToDisplay(p.target), true);
    } else {
        $("target").value = "";
        $("target").readOnly = false;
    }

    // Reset per-calculation fields
    $("carbsToEat").value = "";
    $("currentGlucose").value = "";

    // Restore trend
    restoreTrendSelection(p.dexcomValue);
}

// ---- Profile CRUD ----
var pendingNewProfile = null;

function addProfile() {
    const name = "Profile " + (profiles.length + 1);
    const p = createProfile(name);
    pendingNewProfile = p;
    editingProfileId = p.id;
    $("profileEditorTitle").textContent = "Create Profile";
    $("profileEditorName").value = p.name;
    $("profileEditorStart").value = "";
    $("profileEditorEnd").value = "";
    $("profileEditorCarbRatio").value = "";
    $("profileEditorCF").value = "";
    $("profileEditorTarget").value = "";
    $("profileEditor").classList.add("active");
}

function deleteProfile(id) {
    if (profiles.length <= 1) return;
    profiles = profiles.filter(p => p.id !== id);
    if (activeProfileId === id) {
        activeProfileId = profiles[0].id;
        loadProfileToForm();
    }
    saveAll();
    renderProfileTabs();
    renderProfileList();
    renderTimeline();
}

function openProfileEditor(id) {
    editingProfileId = id;
    const p = getProfile(id);
    if (!p) return;
    $("profileEditorTitle").textContent = "Edit Profile";
    $("profileEditorName").value = p.name;
    $("profileEditorStart").value = p.startTime || "";
    $("profileEditorEnd").value = p.endTime || "";
    $("profileEditorCarbRatio").value = p.carbRatio || "";
    $("profileEditorCF").value = (p.correctionFactor !== "" && p.correctionFactor !== undefined) ? mgToDisplay(p.correctionFactor) : "";
    $("profileEditorTarget").value = (p.target !== "" && p.target !== undefined) ? mgToDisplay(p.target) : "";
    $("profileEditor").classList.add("active");
}

function closeProfileEditor() {
    pendingNewProfile = null;
    $("profileEditor").classList.remove("active");
    editingProfileId = null;
}

function saveProfileEditor() {
    if (pendingNewProfile && editingProfileId === pendingNewProfile.id) {
        profiles.push(pendingNewProfile);
        pendingNewProfile = null;
    }
    const p = getProfile(editingProfileId);
    if (!p) return;
    p.name = $("profileEditorName").value.trim() || p.name;
    p.startTime = $("profileEditorStart").value || "";
    p.endTime = $("profileEditorEnd").value || "";

    const crVal = $("profileEditorCarbRatio").value;
    p.carbRatio = crVal !== "" ? crVal : "";
    const cfVal = $("profileEditorCF").value;
    p.correctionFactor = cfVal !== "" ? displayToMg(parseFloat(cfVal)) : "";
    const tgVal = $("profileEditorTarget").value;
    p.target = tgVal !== "" ? displayToMg(parseFloat(tgVal)) : "";
    saveAll();
    renderProfileTabs();
    renderProfileList();
    renderTimeline();
    if (editingProfileId === activeProfileId) {
        loadProfileToForm();
    }
    closeProfileEditor();
}

// ---- Profile List (Settings) ----
function renderProfileList() {
    const container = $("profileList");
    container.innerHTML = "";
    profiles.forEach(p => {
        const item = document.createElement("div");
        item.className = "profile-list-item";

        let timeLabel = "";
        if (p.startTime && p.endTime) {
            timeLabel = '<span class="profile-list-time">' +
                formatTime12(p.startTime) + " \u2013 " + formatTime12(p.endTime) + "</span>";
        }

        let constants = [];
        if (p.carbRatio) constants.push("CR: " + p.carbRatio);
        if (p.correctionFactor !== "" && p.correctionFactor !== undefined) constants.push("CF: " + mgToDisplay(p.correctionFactor));
        if (p.target !== "" && p.target !== undefined) constants.push("T: " + mgToDisplay(p.target));
        let constantsLabel = constants.length
            ? '<span class="profile-list-time">' + constants.join(" &middot; ") + "</span>"
            : "";

        const deleteBtn = profiles.length > 1
            ? '<button class="profile-list-delete" onclick="deleteProfile(\'' + p.id + '\')" aria-label="Delete">' +
              '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
            : "";

        item.innerHTML =
            '<div class="profile-list-info">' +
                '<span class="profile-list-name">' + escapeHtml(p.name) + "</span>" +
                timeLabel +
                constantsLabel +
            "</div>" +
            '<div class="profile-list-actions">' +
                '<button class="profile-list-edit" onclick="openProfileEditor(\'' + p.id + '\')" aria-label="Edit">' +
                    '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
                "</button>" +
                deleteBtn +
            "</div>";

        container.appendChild(item);
    });
}

// ---- Time-based Profile Selection ----
// When multiple profiles cover the current time, pick the one whose
// start time is closest-before "now" (most recently started).
function findProfileByTime() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let bestId = null;
    let bestDistance = Infinity; // minutes since this profile started

    for (const p of profiles) {
        if (!p.startTime || !p.endTime) continue;
        const [sh, sm] = p.startTime.split(":").map(Number);
        const [eh, em] = p.endTime.split(":").map(Number);
        const start = sh * 60 + sm;
        const end = eh * 60 + em;

        let active = false;
        if (start <= end) {
            active = currentMinutes >= start && currentMinutes < end;
        } else {
            active = currentMinutes >= start || currentMinutes < end;
        }

        if (active) {
            // How many minutes ago did this profile start?
            let dist = currentMinutes - start;
            if (dist < 0) dist += 1440; // wrapped past midnight
            if (dist < bestDistance) {
                bestDistance = dist;
                bestId = p.id;
            }
        }
    }
    return bestId;
}

// ---- Settings ----
function openSettings() {
    renderThemeOptions();
    renderUnitOptions();
    renderRoundingOptions();
    renderProfileList();
    renderTimeline();
    $("settingsOverlay").classList.add("active");
}

// ---- 24-Hour Timeline ----
function renderTimeline() {
    const container = $("timelineContainer");
    if (!container) return;
    container.innerHTML = "";

    // Collect profiles with time ranges
    const timed = profiles.filter(p => p.startTime && p.endTime);
    if (timed.length === 0) {
        container.innerHTML = '<div class="timeline-empty">No profiles have time ranges configured.</div>';
        return;
    }

    // Palette for profile colors
    const palette = [
        "var(--accent)",
        "var(--green)",
        "var(--red)",
        "var(--yellow)",
        "#a371f7",
        "#f778ba",
        "#79c0ff"
    ];

    // Build the timeline track
    const track = document.createElement("div");
    track.className = "timeline-track";

    // Now-line
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowPct = (nowMinutes / 1440) * 100;
    const nowLine = document.createElement("div");
    nowLine.className = "timeline-now";
    nowLine.style.left = nowPct + "%";
    track.appendChild(nowLine);

    // For each profile, determine which one "wins" at each minute
    // Build segment bars per profile
    timed.forEach((p, i) => {
        const color = palette[i % palette.length];
        const [sh, sm] = p.startTime.split(":").map(Number);
        const [eh, em] = p.endTime.split(":").map(Number);
        const start = sh * 60 + sm;
        const end = eh * 60 + em;

        if (start <= end) {
            addSegment(track, start, end, color, p.name);
        } else {
            // Overnight: two segments
            addSegment(track, start, 1440, color, p.name);
            addSegment(track, 0, end, color, p.name);
        }
    });

    container.appendChild(track);

    // Hour labels
    const labels = document.createElement("div");
    labels.className = "timeline-labels";
    for (let h = 0; h < 24; h += 3) {
        const lbl = document.createElement("span");
        lbl.className = "timeline-label";
        lbl.style.left = ((h / 24) * 100) + "%";
        const display = h === 0 ? "12a" : h < 12 ? h + "a" : h === 12 ? "12p" : (h - 12) + "p";
        lbl.textContent = display;
        labels.appendChild(lbl);
    }
    container.appendChild(labels);

    // Legend
    const legend = document.createElement("div");
    legend.className = "timeline-legend";
    timed.forEach((p, i) => {
        const color = palette[i % palette.length];
        const dot = document.createElement("span");
        dot.className = "timeline-legend-item";
        dot.innerHTML = '<span class="timeline-legend-dot" style="background:' + color + '"></span>' + escapeHtml(p.name);
        legend.appendChild(dot);
    });
    container.appendChild(legend);
}

function addSegment(track, startMin, endMin, color, name) {
    const left = (startMin / 1440) * 100;
    const width = ((endMin - startMin) / 1440) * 100;
    if (width <= 0) return;
    const seg = document.createElement("div");
    seg.className = "timeline-segment";
    seg.style.left = left + "%";
    seg.style.width = width + "%";
    seg.style.background = color;
    seg.title = name;
    track.appendChild(seg);
}

function closeSettings() {
    $("settingsOverlay").classList.remove("active");
    var egg = $("easterEgg");
    if (egg) { egg.classList.remove("visible"); egg.style.opacity = "0"; }
    easterEggTaps = 0;
}

// ---- Trend Strip (Dynamic) ----
function renderTrendStrip() {
    const container = $("trendStrip");
    container.innerHTML = "";

    const trendData = [
        { mg: -75, cls: "arrow-down", label: "Rapidly falling",
          svg: '<line x1="8" y1="4" x2="8" y2="18"/><polyline points="4 14 8 18 12 14"/><line x1="16" y1="4" x2="16" y2="18"/><polyline points="12 14 16 18 20 14"/>' },
        { mg: -50, cls: "arrow-down", label: "Falling",
          svg: '<line x1="12" y1="4" x2="12" y2="20"/><polyline points="6 14 12 20 18 14"/>' },
        { mg: -25, cls: "arrow-down", label: "Slowly falling",
          svg: '<line x1="6" y1="6" x2="18" y2="18"/><polyline points="10 18 18 18 18 10"/>' },
        { mg:  0,  cls: "",          label: "Steady",
          svg: '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/>' },
        { mg:  25, cls: "arrow-up",  label: "Slowly rising",
          svg: '<line x1="6" y1="18" x2="18" y2="6"/><polyline points="10 6 18 6 18 14"/>' },
        { mg:  50, cls: "arrow-up",  label: "Rising",
          svg: '<line x1="12" y1="20" x2="12" y2="4"/><polyline points="6 10 12 4 18 10"/>' },
        { mg:  75, cls: "arrow-up",  label: "Rapidly rising",
          svg: '<line x1="8" y1="20" x2="8" y2="6"/><polyline points="4 10 8 6 12 10"/><line x1="16" y1="20" x2="16" y2="6"/><polyline points="12 10 16 6 20 10"/>' }
    ];

    trendData.forEach(t => {
        const displayVal = mgToDisplay(Math.abs(t.mg));
        const sign = t.mg < 0 ? "\u2212" : t.mg > 0 ? "+" : "";
        const spanText = t.mg === 0 ? "0" : sign + displayVal;

        const btn = document.createElement("button");
        btn.className = "trend-btn" + (t.cls ? " " + t.cls : "");
        btn.dataset.value = t.mg;
        btn.setAttribute("aria-label", t.label);
        btn.onclick = function () { selectTrend(this); };
        btn.innerHTML =
            '<svg class="trend-icon" viewBox="0 0 24 24">' + t.svg + "</svg>" +
            "<span>" + spanText + "</span>";
        container.appendChild(btn);
    });
}

// ---- Trend Panel Toggle ----
function toggleTrendPanel() {
    $("trendPanel").classList.toggle("open");
    $("trendToggle").classList.toggle("open");
}

// ---- Dexcom Trend Selection ----
function selectTrend(btn) {
    const value = parseInt(btn.dataset.value);

    // Toggle off if already selected
    if (btn.classList.contains("selected")) {
        clearTrend();
        return;
    }

    document.querySelectorAll(".trend-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");

    const p = activeProfile();
    if (p) p.dexcomValue = value;

    updateTrendBadge(value);

    // Auto-collapse
    $("trendPanel").classList.remove("open");
    $("trendToggle").classList.remove("open");
}

function clearTrend() {
    const p = activeProfile();
    if (p) p.dexcomValue = NaN;
    document.querySelectorAll(".trend-btn").forEach(b => b.classList.remove("selected"));
    updateTrendBadge(NaN);
    $("trendToggle").classList.remove("has-trend");
}

function updateTrendBadge(value) {
    const badge = $("trendBadge");
    const toggle = $("trendToggle");
    badge.classList.remove("active", "negative", "positive", "neutral");

    if (isNaN(value)) {
        toggle.classList.remove("has-trend");
        return;
    }

    toggle.classList.add("has-trend");
    badge.classList.add("active");

    const displayVal = mgToDisplay(Math.abs(value));
    if (value < 0) {
        badge.classList.add("negative");
        badge.textContent = "\u2212" + displayVal;
    } else if (value > 0) {
        badge.classList.add("positive");
        badge.textContent = "+" + displayVal;
    } else {
        badge.classList.add("neutral");
        badge.textContent = "0";
    }
}

function restoreTrendSelection(value) {
    if (isNaN(value)) {
        clearTrend();
        return;
    }
    document.querySelectorAll(".trend-btn").forEach(btn => {
        btn.classList.toggle("selected", parseInt(btn.dataset.value) === value);
    });
    updateTrendBadge(value);
}

// ---- Calculation ----
function calculate() {
    document.querySelectorAll(".input-field").forEach(el => el.classList.remove("error"));

    const carbsToEat     = getInputVal("carbsToEat");
    const glucoseDisplay = getInputVal("currentGlucose");
    const carbRatio      = getInputVal("carbRatio");
    const cfDisplay      = getInputVal("correctionFactor");
    const targetDisplay  = getInputVal("target");

    const p = activeProfile();
    const dexcomMg = p ? p.dexcomValue : NaN;

    if (carbsToEat === null || glucoseDisplay === null || carbRatio === null ||
        cfDisplay === null || targetDisplay === null) {
        return;
    }

    // Convert to mg/dL for internal math
    const glucoseMg = displayToMg(glucoseDisplay);
    const cfMg      = displayToMg(cfDisplay);
    const targetMg  = displayToMg(targetDisplay);

    const unit = unitLabel();

    // --- Carb dose ---
    const carbDose = carbsToEat / carbRatio;
    const carbDose3 = carbDose.toFixed(3);

    $("resultCarb").innerHTML =
        "<strong>Carb Dose</strong><br>" +
        "Carbs (" + carbsToEat + ") &divide; Ratio (" + carbRatio + ") = " + carbDose3;

    // --- Correction dose ---
    let glucoseDiffMg = glucoseMg - targetMg;
    let dexExplanation = "";

    if (!isNaN(dexcomMg)) {
        glucoseDiffMg = glucoseMg + dexcomMg - targetMg;
        const dexDisplay = mgToDisplay(Math.abs(dexcomMg));
        const sign = dexcomMg < 0 ? "\u2212" : "+";
        dexExplanation = " " + sign + " Trend (" + dexDisplay + ")";
    }

    const correctionDose = glucoseDiffMg / cfMg;
    const correctionDose3 = correctionDose.toFixed(3);

    $("resultCorrection").innerHTML =
        "<strong>Correction Dose</strong><br>" +
        "(Current (" + glucoseDisplay + ")" + dexExplanation +
        " \u2212 Target (" + targetDisplay + ")) &divide; Factor (" + cfDisplay + ") = " + correctionDose3;

    // --- Total dose ---
    const rawTotal = carbDose + correctionDose;
    const rawTotal3 = rawTotal.toFixed(3);
    const step = settings.rounding || 0.5;
    const rounded = Math.floor(rawTotal / step) * step;
    const decimals = step < 0.1 ? 2 : 1;
    const finalDose = rounded.toFixed(decimals);

    let totalHTML = "";
    let mathHTML = '<div class="result-math">Carb (' + carbDose3 + ') + Correction (' + correctionDose3 + ') = ' + rawTotal3 + '</div>';

    if (rounded < 0) {
        const carbDeficit = Math.abs(Math.round(carbRatio * rawTotal));
        totalHTML += '<span class="result-highlight" style="background:var(--red-bg);color:var(--red);">0.0u \u2014 ' +
            carbDeficit + "g carb deficit</span>" + mathHTML;

        if (glucoseMg < 56) {
            totalHTML += '<br><span class="result-danger">\u26A0 Below ' + mgToDisplay(55) + " " + unit +
                " \u2014 take immediate action to raise blood sugar.</span>";
        } else if (glucoseMg < 70) {
            totalHTML += '<br><span class="result-warning">\u26A0 Below ' + mgToDisplay(70) + " " + unit +
                " \u2014 take 15g fast-acting carbs, recheck in 15 min.</span>";
        }
    } else {
        totalHTML += '<span class="result-highlight">' + finalDose + "u</span>" + mathHTML;
        if (glucoseMg > 249) {
            totalHTML += '<br><span class="result-warning">\u26A0 Above ' + mgToDisplay(250) + " " + unit +
                " \u2014 consider checking ketone levels.</span>";
        }
    }

    $("resultTotal").innerHTML = totalHTML;
    $("resultTotal").classList.add("visible");
    $("resultsCard").classList.add("visible");

    // Lock fields with display values
    setFieldReadonly("carbRatio", carbRatio, true);
    setFieldReadonly("correctionFactor", cfDisplay, true);
    setFieldReadonly("target", targetDisplay, true);

    // Save to profile in mg/dL
    if (p) {
        p.carbRatio = String(carbRatio);
        p.correctionFactor = cfMg;
        p.target = targetMg;
        saveAll();
    }
}

function clearResults() {
    $("resultCarb").innerHTML = "<strong>Carb Dose</strong>";
    $("resultCorrection").innerHTML = "<strong>Correction Dose</strong>";
    $("resultTotal").innerHTML = "";
    $("resultTotal").classList.remove("visible");
    $("resultsCard").classList.remove("visible");
}

// ---- Unlock (edit) field ----
function unlockField(id) {
    setFieldReadonly(id, "", false);
    const p = activeProfile();
    if (p) {
        p[id] = "";
        saveAll();
    }
}

// ---- Easter Egg ----
var easterEggTaps = 0;
var easterEggTimer = null;

function easterEggTap() {
    easterEggTaps++;
    clearTimeout(easterEggTimer);
    easterEggTimer = setTimeout(function() { easterEggTaps = 0; }, 2000);
    if (easterEggTaps >= 5) {
        easterEggTaps = 0;
        var el = $("easterEgg");
        el.classList.add("visible");
        // Force reflow then fade in
        el.offsetHeight;
        el.style.opacity = "1";
    }
}

// ---- Terms ----
function acceptTerms() {
    localStorage.setItem("acceptedTerms", "true");
    $("termsOverlay").classList.add("hidden");
}

// ---- Init ----
function init() {
    // Terms gate
    if (localStorage.getItem("acceptedTerms") === "true") {
        $("termsOverlay").classList.add("hidden");
    }

    // Migrate old Day/Night presets if present
    migrateOldPresets();

    // Load persisted data
    loadAll();

    // Backfill times on existing Day/Night profiles if missing
    let needsSave = false;
    profiles.forEach(p => {
        if (p.name === "Day" && !p.startTime && !p.endTime) {
            p.startTime = "06:00"; p.endTime = "20:00"; needsSave = true;
        }
        if (p.name === "Night" && !p.startTime && !p.endTime) {
            p.startTime = "20:00"; p.endTime = "06:00"; needsSave = true;
        }
    });
    if (needsSave) saveAll();

    // Create default profiles if none exist
    if (profiles.length === 0) {
        profiles = [
            createProfile("Day", "06:00", "20:00"),
            createProfile("Night", "20:00", "06:00")
        ];
        activeProfileId = profiles[0].id;
        saveAll();
    }

    // Auto-select by time of day, fall back to first profile
    const timeMatch = findProfileByTime();
    if (timeMatch) {
        activeProfileId = timeMatch;
    } else if (!activeProfileId || !getProfile(activeProfileId)) {
        activeProfileId = profiles[0].id;
    }

    // Apply settings
    applyTheme(settings.theme);
    updateUnitLabels();
    renderTrendStrip();
    renderProfileTabs();
    loadProfileToForm();
}

document.addEventListener("DOMContentLoaded", init);
