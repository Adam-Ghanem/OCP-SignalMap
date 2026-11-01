let rowsRaw = [];
let rowsClean = [];
let currentTech = "4G";
let heatGroup = null;
let pointLayer = L.layerGroup();
let bounds = null;
const map = L.map("map", { preferCanvas: true }).setView([32.88, -6.90], 10);
const esriCredit = '&copy; <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a> &mdash; Esri, HERE, Garmin, USGS, and the GIS User Community';
const tiles = {
    osm: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, attribution: esriCredit, crossOrigin: 'anonymous', keepBuffer: 2
    }),
    sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, attribution: 'Imagery &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a> and imagery partners', crossOrigin: 'anonymous', keepBuffer: 2
    }),
    dark: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, attribution: esriCredit, crossOrigin: 'anonymous', keepBuffer: 2, className: 'signalmap-dark-tiles'
    }),
    carto: L.tileLayer("https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>', crossOrigin: 'anonymous', keepBuffer: 2
    })
};
let activeTile = null;
const mapNotice = document.getElementById('mapNotice');
let tilesLoaded = 0;
let tilesFailed = 0;
let didSwitchBasemap = false;
function mapWarn(message) {
    mapNotice.textContent = message;
    mapNotice.style.display = message ? 'block' : 'none';
}
function useBasemap(style, fromFallback = false) {
    if (activeTile)
        map.removeLayer(activeTile);
    tilesLoaded = 0;
    tilesFailed = 0;
    activeTile = tiles[style] || tiles.osm;
    if (fromFallback)
        document.getElementById('mapStyle').value = style;
    mapWarn(fromFallback ? 'Primary map tiles unavailable. Showing an alternative street map.' : '');
    activeTile.addTo(map);
}
Object.entries(tiles).forEach(([style, layer]) => {
    layer.on('tileload', () => {
        if (layer !== activeTile)
            return;
        tilesLoaded++;
        if (mapNotice.textContent && !didSwitchBasemap)
            mapWarn('');
    });
    layer.on('tileerror', () => {
        if (layer !== activeTile)
            return;
        tilesFailed++;
        if (tilesLoaded > 0 || tilesFailed < 3)
            return;
        if (!didSwitchBasemap && style !== 'carto') {
            didSwitchBasemap = true;
            useBasemap('carto', true);
        }
        else {
            mapWarn('Basemap could not load. Check internet / firewall, or select another Map style. CSV analysis and heatmap remain available.');
        }
    });
});
useBasemap('sat');
pointLayer.addTo(map);
const metricEl = document.getElementById("metric");
const statusEl = document.getElementById("status");
function setStatus(msg) { statusEl.textContent = msg; }
function cleanName(s) {
    return String(s ?? "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/[àáâä]/g, "a").replace(/[éèêë]/g, "e").replace(/[îï]/g, "i").replace(/[ôö]/g, "o").replace(/[ùûü]/g, "u")
        .replace(/[^a-z0-9]+/g, "");
}
function num(v) {
    if (v === undefined || v === null)
        return NaN;
    if (typeof v === "number")
        return Number.isFinite(v) ? v : NaN;
    const s = String(v).trim();
    const match = s.match(/^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))(?:\s*(?:dBm|dB|ms|Mbps|km\/h|%|m))?$/i);
    if (!match)
        return NaN;
    const n = Number(match[1].replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
}
function getValue(row, names) {
    const m = Object.create(null);
    Object.keys(row).forEach(k => m[cleanName(k)] = k);
    for (const n of names) {
        const k = m[cleanName(n)];
        if (k !== undefined)
            return row[k];
    }
    return undefined;
}
function getCol(cols, names) {
    const m = Object.create(null);
    cols.forEach(c => m[cleanName(c)] = c);
    for (const n of names) {
        const c = m[cleanName(n)];
        if (c !== undefined)
            return c;
    }
    return null;
}
function tech(row) {
    const s = String(getValue(row, ["LA TECHNOLOGIE", "TECHNOLOGIE", "technology", "tech", "RAT", "network type", "radio"]) || "").toUpperCase();
    if (s.includes("LTE") || s.includes("4G"))
        return "4G";
    if (s.includes("UMTS") || s.includes("WCDMA") || s.includes("HSPA") || s.includes("3G"))
        return "3G";
    if (s.includes("GSM") || s.includes("EDGE") || s.includes("GPRS") || s.includes("2G"))
        return "2G";
    return s || "UNKNOWN";
}
function metricType(m) {
    const x = cleanName(m);
    if (x.includes("rsrp"))
        return "RSRP";
    if (x.includes("rsrq"))
        return "RSRQ";
    if (x.includes("sinr") || x.includes("snr"))
        return "SINR";
    if (x.includes("rscp"))
        return "RSCP";
    if (x.includes("rxlev"))
        return "RXLEV";
    if (x.includes("ping") || x.includes("latency") || x.includes("jitter"))
        return "LOWER";
    return "HIGHER";
}
function quality(metric, value) {
    const t = metricType(metric);
    if (t === "RSRP") {
        if (value >= -90)
            return ["Excellent", "good", "#18d47a"];
        if (value >= -105)
            return ["Good", "mid", "#ffd400"];
        return ["Weak", "bad", "#094cff"];
    }
    if (t === "RSRQ") {
        if (value >= -10)
            return ["Excellent", "good", "#18d47a"];
        if (value >= -15)
            return ["Good", "mid", "#ffd400"];
        return ["Weak", "bad", "#094cff"];
    }
    if (t === "SINR") {
        if (value >= 13)
            return ["Excellent", "good", "#18d47a"];
        if (value >= 0)
            return ["Good", "mid", "#ffd400"];
        return ["Weak", "bad", "#094cff"];
    }
    if (t === "RSCP") {
        if (value >= -85)
            return ["Excellent", "good", "#18d47a"];
        if (value >= -100)
            return ["Good", "mid", "#ffd400"];
        return ["Weak", "bad", "#094cff"];
    }
    if (t === "RXLEV") {
        if (value >= -80)
            return ["Excellent", "good", "#18d47a"];
        if (value >= -95)
            return ["Good", "mid", "#ffd400"];
        return ["Weak", "bad", "#094cff"];
    }
    if (t === "LOWER") {
        if (value <= 40)
            return ["Excellent", "good", "#18d47a"];
        if (value <= 90)
            return ["Good", "mid", "#ffd400"];
        return ["Weak", "bad", "#094cff"];
    }
    return ["Info", "mid", "#ffd400"];
}
function isValidMetric(metric, value) {
    const t = metricType(metric);
    if (t === "RSRP")
        return value >= -150 && value <= -30;
    if (t === "RSRQ")
        return value >= -35 && value <= 0;
    if (t === "SINR")
        return value >= -30 && value <= 60;
    if (t === "RSCP")
        return value >= -130 && value <= -20;
    if (t === "RXLEV")
        return value >= -130 && value <= -20;
    return true;
}
function metricCandidates(data) {
    if (!data.length)
        return [];
    const cols = Object.keys(data[0]).map(c => c.replace(/^\uFEFF/, "").trim());
    const preferred = ["RSRP", "RSRQ", "SINR", "RSCP", "RXLEV", "RXQUAL", "download", "upload", "ping", "latency", "jitter", "signal"];
    const out = [];
    for (const p of preferred) {
        const c = getCol(cols, [p]);
        if (c && !out.includes(c))
            out.push(c);
    }
    for (const c of cols) {
        if (out.includes(c))
            continue;
        const cn = cleanName(c);
        if (["latitude", "lat", "longitude", "lon", "lng", "long", "technologie", "latechnologie"].includes(cn))
            continue;
        let ok = 0;
        for (let i = 0; i < Math.min(data.length, 100); i++) {
            if (!Number.isNaN(num(data[i][c])))
                ok++;
        }
        if (ok >= 8)
            out.push(c);
    }
    return out;
}
const MAX_CSV_BYTES = 25 * 1024 * 1024;
const MAX_CSV_ROWS = 125000;
const MAX_CSV_COLUMNS = 120;
const MAX_CSV_FIELD_CHARS = 8192;
const MAX_CSV_HEADER_CHARS = 256;
let csvImportGeneration = 0;
function csvError(message) {
    setStatus(message);
    alert(message);
}
function parseFile(file) {
    if (!file)
        return;
    const gen = ++csvImportGeneration;
    if (!/\.csv$/i.test(file.name || "")) {
        csvError("Unsupported file. Select a .csv file.");
        return;
    }
    if (file.size === 0 || file.size > MAX_CSV_BYTES) {
        csvError("CSV must be between 1 byte and 25 MiB. Split larger files before importing.");
        return;
    }
    setStatus("Validating and reading CSV locally...");
    let parsedRows = [];
    let rejected = false;
    let parsErrors = 0;
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        delimiter: "",
        chunkSize: 256 * 1024,
        chunk: function (results, parser) {
            if (gen !== csvImportGeneration) {
                parser.abort();
                return;
            }
            if (rejected)
                return;
            const fields = results.meta && results.meta.fields;
            if (fields && (fields.length > MAX_CSV_COLUMNS ||
                fields.some(f => typeof f !== "string" || f.length > MAX_CSV_HEADER_CHARS ||
                    !cleanName(f) || /[\u0000-\u001f\u007f]/.test(f)) ||
                new Set(fields.map(cleanName)).size !== fields.length)) {
                rejected = true;
                parser.abort();
                csvError("Invalid CSV headers (too many, duplicate, empty or oversized names).");
                return;
            }
            parsErrors += (results.errors || []).length;
            if (parsErrors > 100) {
                rejected = true;
                parser.abort();
                csvError("CSV has too many parsing errors.");
                return;
            }
            for (const row of (results.data || [])) {
                if (!row || Object.keys(row).length <= 1)
                    continue;
                if (Object.keys(row).length > MAX_CSV_COLUMNS ||
                    Object.values(row).some(value => String(value ?? "").length > MAX_CSV_FIELD_CHARS)) {
                    rejected = true;
                    parser.abort();
                    csvError("CSV contains an oversized field or too many columns.");
                    return;
                }
                parsedRows.push(row);
                if (parsedRows.length > MAX_CSV_ROWS) {
                    rejected = true;
                    parser.abort();
                    csvError("CSV exceeds 125,000 rows. Split the dataset.");
                    return;
                }
            }
        },
        complete: function () {
            if (gen !== csvImportGeneration || rejected)
                return;
            if (!parsedRows.length) {
                csvError("CSV is empty or unreadable.");
                return;
            }
            const metrics = metricCandidates(parsedRows);
            if (!metrics.length) {
                csvError("No numeric metric found. Check CSV columns.");
                return;
            }
            metricEl.replaceChildren();
            for (const metric of metrics) {
                const option = document.createElement("option");
                option.value = metric;
                option.textContent = metric;
                metricEl.appendChild(option);
            }
            const def = metrics.find(m => cleanName(m).includes("rsrp")) || metrics[0];
            metricEl.value = def;
            rowsRaw = parsedRows;
            document.getElementById("fileName").textContent = file.name.slice(0, 120);
            const datasetNameEl = document.getElementById('datasetFile');
            if (datasetNameEl)
                datasetNameEl.textContent = file.name.slice(0, 120);
            setStatus(`CSV loaded: ${rowsRaw.length.toLocaleString()} rows. Metric: ${def}`);
            render();
        },
        error: function (e) {
            if (gen !== csvImportGeneration || rejected)
                return;
            console.error("CSV parser failure", e);
            csvError("CSV could not be parsed. Check its formatting.");
        }
    });
}
function buildRows() {
    const metric = metricEl.value;
    const out = [];
    for (const r of rowsRaw) {
        const lat = num(getValue(r, ["latitude", "lat", "gps latitude", "y", "latitudewgs84", "latitude wgs84"]));
        const lon = num(getValue(r, ["longitude", "lon", "lng", "long", "gps longitude", "x", "longitudewgs84", "longitude wgs84"]));
        const val = num(r[metric]);
        const tec = tech(r);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(val))
            continue;
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180)
            continue;
        if (currentTech !== "ALL" && tec !== currentTech)
            continue;
        if (!isValidMetric(metric, val))
            continue;
        out.push({ lat, lon, val, tech: tec, raw: r });
    }
    return out;
}
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
}
function popup(r) {
    const m = metricEl.value;
    const [q, cls] = quality(m, r.val);
    const raw = r.raw || {};
    const fields = [];
    function addField(label, value) {
        if (value === undefined || value === null)
            return;
        const s = String(value).trim();
        if (s === "" || ["nan", "null", "undefined"].includes(s.toLowerCase()))
            return;
        if (!fields.some(f => f[0].toLowerCase() === label.toLowerCase()))
            fields.push([label, s]);
    }
    function addFrom(label, names) { addField(label, getValue(raw, names)); }
    addField("Technology", r.tech);
    addField(m, r.val);
    addField("Latitude", r.lat.toFixed(6));
    addField("Longitude", r.lon.toFixed(6));
    addFrom("Time", ["time", "temps", "date", "datetime", "timestamp", "heure"]);
    addFrom("Speed", ["speed", "la vitesse", "vitesse", "speed km/h"]);
    addFrom("Altitude", ["altitude", "elevation", "height"]);
    addFrom("Cell ID", ["cellid", "cell id", "cell_id", "cid", "eci", "enodeb", "lac", "tac", "cell"]);
    addFrom("PCI", ["pci"]);
    addFrom("Band", ["band", "bande"]);
    addFrom("EARFCN", ["earfcn", "arfcn"]);
    addFrom("Operator", ["operator", "operateur", "opérateur", "provider", "network operator", "plmn"]);
    addFrom("RSRQ", ["rsrq"]);
    addFrom("SINR", ["sinr", "snr"]);
    addFrom("RSCP", ["rscp"]);
    addFrom("RXLEV", ["rxlev"]);
    const explain = metricType(m) === "RSRP"
        ? "RSRP: higher is better. Weak < -105 dBm, Good -105 to -90 dBm, Excellent ≥ -90 dBm."
        : "Signal quality is calculated from the selected metric using fixed telecom thresholds.";
    return `<div class="popup">
    <span class="badge ${escapeHtml(cls)}">${escapeHtml(q)}</span>
    <h3>Measurement details</h3>
    ${fields.map(([a, b]) => `<div class="kv"><b>${escapeHtml(a)}</b><span>${escapeHtml(b)}</span></div>`).join("")}
    <div class="explainBox">${escapeHtml(explain)}</div>
  </div>`;
}
function updateDashboardKpis(total, weak, good, excellent) {
    const fmt = n => Number(n).toLocaleString();
    document.getElementById('kpiTotal').textContent = fmt(total);
    document.getElementById('kpiWeak').textContent = fmt(weak);
    document.getElementById('kpiGood').textContent = fmt(good);
    document.getElementById('kpiExcellent').textContent = fmt(excellent);
    const hasData = rowsRaw.length > 0;
    const status = document.getElementById('importState');
    status.classList.toggle('ready', hasData);
    status.lastChild.textContent = hasData ? ' CSV imported' : ' Waiting for CSV';
    document.getElementById('mapEmpty').classList.toggle('hide', total > 0);
    document.getElementById('activeMetricBadge').textContent = total ? metricEl.value : 'Awaiting data';
    document.getElementById('activeTechBadge').textContent = currentTech;
    const safeTotal = Math.max(0, Number(total) || 0);
    const parts = [Math.max(0, Number(weak) || 0), Math.max(0, Number(good) || 0), Math.max(0, Number(excellent) || 0)];
    const ids = ['Weak', 'Good', 'Excellent'];
    parts.forEach((count, i) => {
        const pct = safeTotal ? count / safeTotal * 100 : 0;
        const bar = document.getElementById('dist' + ids[i]);
        const label = document.getElementById('dist' + ids[i] + 'Pct');
        if (bar)            bar.style.width = pct.toFixed(3) + '%';
        if (label)
            label.textContent = safeTotal ? pct.toFixed(1) + '%' : '—';
    });
    const desc = document.getElementById('distributionDescription');
    const met = document.getElementById('distributionMetric');
    if (desc)
        desc.textContent = safeTotal ? safeTotal.toLocaleString() + ' valid measurements in the active filter' : 'Import your measurements to see the quality breakdown.';
    if (met)
        met.textContent = safeTotal && metricEl.value ? metricEl.value : 'NO DATA';
    const dtech = document.getElementById('datasetTech');
    if (dtech)
        dtech.textContent = currentTech + ' selected';
    const dmeta = document.getElementById('datasetMeta');
    if (dmeta)
        dmeta.textContent = rowsRaw.length ? rowsRaw.length.toLocaleString() + ' imported rows' : 'Upload a CSV to begin analysis';
}
function render() {
    if (!rowsRaw.length || !metricEl.value)
        return;
    rowsClean = buildRows();
    if (heatGroup) {
        map.removeLayer(heatGroup);
        heatGroup = null;
    }
    pointLayer.clearLayers();
    if (!rowsClean.length) {
        updateDashboardKpis(0, 0, 0, 0);
        document.getElementById("rows").textContent = "0";
        document.getElementById("weak").textContent = "0";
        document.getElementById("best").textContent = "—";
        setStatus("No valid rows for this filter/metric. Try ALL technology or another metric.");
        return;
    }
    const metric = metricEl.value;
    const weakOnly = document.getElementById("weakOnly").checked;
    const opacity = Number(document.getElementById("opacity").value) / 100;
    const radius = Number(document.getElementById("radius").value);
    const weakData = [], goodData = [], excellentData = [];
    for (const r of rowsClean) {
        const label = quality(metric, r.val)[0];
        if (label === "Weak")
            weakData.push([r.lat, r.lon, 1]);
        else if (label === "Good")
            goodData.push([r.lat, r.lon, 1]);
        else
            excellentData.push([r.lat, r.lon, 1]);
    }
    updateDashboardKpis(rowsClean.length, weakData.length, goodData.length, excellentData.length);
    heatGroup = L.layerGroup();
    if (!weakOnly && excellentData.length) {
        L.heatLayer(excellentData, { radius: radius + 8, blur: 42, minOpacity: Math.min(.95, opacity * .95), maxZoom: 17, gradient: { 0: "#18d47a", 1: "#18d47a" } }).addTo(heatGroup);
    }
    if (!weakOnly && goodData.length) {
        L.heatLayer(goodData, { radius: radius + 8, blur: 42, minOpacity: Math.min(.95, opacity * .98), maxZoom: 17, gradient: { 0: "#ffd400", 1: "#ffd400" } }).addTo(heatGroup);
    }
    if (weakData.length) {
        L.heatLayer(weakData, { radius: radius + 10, blur: 44, minOpacity: Math.min(.98, opacity * 1.05), maxZoom: 17, gradient: { 0: "#094cff", 1: "#094cff" } }).addTo(heatGroup);
    }
    heatGroup.addTo(map);
    bounds = L.latLngBounds(rowsClean.map(r => [r.lat, r.lon]));
    if (bounds.isValid())
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    const showPoints = document.getElementById("showPoints").checked;
    const step = Math.max(1, Math.ceil(rowsClean.length / 3500));
    rowsClean.forEach((r, i) => {
        if (i % step !== 0)
            return;
        const [, , col] = quality(metric, r.val);
        L.circleMarker([r.lat, r.lon], {
            radius: showPoints ? 4 : 7,
            color: showPoints ? "rgba(255,255,255,.95)" : "transparent",
            weight: showPoints ? 1 : 0,
            fillColor: showPoints ? col : "transparent",
            fillOpacity: showPoints ? .9 : 0
        }).bindPopup(popup(r)).addTo(pointLayer);
    });
    const vals = rowsClean.map(r => r.val);
    const best = vals.reduce((result, value) => metricType(metric) === "LOWER" ? Math.min(result, value) : Math.max(result, value), metricType(metric) === "LOWER" ? Infinity : -Infinity);
    document.getElementById("rows").textContent = rowsClean.length.toLocaleString();
    document.getElementById("weak").textContent = weakData.length.toLocaleString();
    document.getElementById("best").textContent = best.toFixed(1);
    setStatus(`Loaded: ${rowsClean.length.toLocaleString()} valid rows · Weak: ${weakData.length.toLocaleString()} · Good: ${goodData.length.toLocaleString()} · Excellent: ${excellentData.length.toLocaleString()}`);
}
function nearest(latlng) {
    if (!rowsClean.length)
        return null;
    let best = null, bd = Infinity;
    for (const r of rowsClean) {
        const d = map.distance(latlng, L.latLng(r.lat, r.lon));
        if (d < bd) {
            bd = d;
            best = r;
        }
    }
    const z = map.getZoom();
    const limit = z >= 15 ? 220 : z >= 13 ? 550 : 1400;
    return bd <= limit ? best : null;
}
async function downloadHeatmap() {
    if (!rowsClean.length) {
        alert("Upload CSV first.");
        return;
    }
    const oldStatus = statusEl.textContent;
    setStatus("Preparing map export...");
    try {
        const panel = document.getElementById("panel");
        const top = document.querySelector(".top");
        const legend = document.querySelector(".legend");
        const oldPanelDisplay = panel ? panel.style.display : "";
        const oldTopDisplay = top ? top.style.display : "";
        const oldLegendDisplay = legend ? legend.style.display : "";
        if (panel)
            panel.style.display = "none";
        if (top)
            top.style.display = "none";
        if (legend)
            legend.style.display = "none";
        await new Promise(r => setTimeout(r, 300));
        const mapEl = document.getElementById("map");
        const canvasMap = await html2canvas(mapEl, {
            useCORS: true,
            allowTaint: false,
            backgroundColor: null,
            logging: false,
            scale: 2
        });
        if (panel)
            panel.style.display = oldPanelDisplay;
        if (top)
            top.style.display = oldTopDisplay;
        if (legend)
            legend.style.display = oldLegendDisplay;
        const W = canvasMap.width;
        const H = canvasMap.height;
        const headerH = 132;
        const footerH = 118;
        const out = document.createElement("canvas");
        out.width = W;
        out.height = H + headerH + footerH;
        const ctx = out.getContext("2d");
        const headerGrad = ctx.createLinearGradient(0, 0, W, headerH);
        headerGrad.addColorStop(0, "#07101f");
        headerGrad.addColorStop(1, "#101827");
        ctx.fillStyle = headerGrad;
        ctx.fillRect(0, 0, W, headerH);
        const cardX = 24;
        const cardY = 18;
        const cardW = Math.min(620, W - 48);
        const cardH = 96;
        ctx.fillStyle = "rgba(255,255,255,.03)";
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 24);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.08)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const logoBoxX = cardX + 18;
        const logoBoxY = cardY + 12;
        const logoBoxSize = 72;
        ctx.fillStyle = "rgba(255,255,255,.96)";
        ctx.beginPath();
        ctx.roundRect(logoBoxX, logoBoxY, logoBoxSize, logoBoxSize, 18);
        ctx.fill();
        const logoImg = document.querySelector(".logoBox img, .signalMapLogo img, .cleanOcpLogo img, .realOcpLogo img");
        if (logoImg && logoImg.complete) {
            ctx.drawImage(logoImg, logoBoxX + 7, logoBoxY + 7, logoBoxSize - 14, logoBoxSize - 14);
        }
        else {
            ctx.fillStyle = "#0b7a42";
            ctx.font = "900 22px Arial";
            ctx.fillText("OCP", logoBoxX + 13, logoBoxY + 42);
        }
        const textX = logoBoxX + logoBoxSize + 22;
        const titleY = cardY + cardH / 2 + 2;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#f3f7ff";
        ctx.font = `900 ${Math.max(28, Math.floor(W / 42))}px Arial`;
        ctx.fillText("OCP SignalMap", textX, titleY);
        ctx.drawImage(canvasMap, 0, headerH);
        const footerY = H + headerH;
        ctx.fillStyle = "#07101f";
        ctx.fillRect(0, footerY, W, footerH);
        ctx.strokeStyle = "rgba(255,255,255,.12)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, footerY + 1);
        ctx.lineTo(W, footerY + 1);
        ctx.stroke();
        const metric = metricEl.value || "RSRP";
        const weak = rowsClean.filter(r => quality(metric, r.val)[0] === "Weak").length;
        const good = rowsClean.filter(r => quality(metric, r.val)[0] === "Good").length;
        const excellent = rowsClean.filter(r => quality(metric, r.val)[0] === "Excellent").length;
        const footerCardX = 42;
        const footerCardY = footerY + 24;
        const footerCardW = W - 84;
        const footerCardH = 70;
        ctx.fillStyle = "rgba(255,255,255,.075)";
        ctx.beginPath();
        ctx.roundRect(footerCardX, footerCardY, footerCardW, footerCardH, 20);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.10)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const textY = footerCardY + 45;
        ctx.fillStyle = "#f3f7ff";
        ctx.font = `900 ${Math.max(18, Math.floor(W / 86))}px Arial`;
        const statsText = `Rows: ${rowsClean.length.toLocaleString()}   Weak: ${weak.toLocaleString()}   Good: ${good.toLocaleString()}   Excellent: ${excellent.toLocaleString()}`;
        ctx.fillText(statsText, footerCardX + 26, textY);
        const items = [
            ["#094cff", "Weak"],
            ["#ffd400", "Good"],
            ["#18d47a", "Excellent"]
        ];
        ctx.font = `900 ${Math.max(16, Math.floor(W / 100))}px Arial`;
        const itemGap = Math.max(110, Math.floor(W / 12));
        const totalLegendW = itemGap * 3;
        const lx = footerCardX + footerCardW - totalLegendW - 20;
        const cy = footerCardY + 38;
        items.forEach((it, idx) => {
            const x = lx + idx * itemGap;
            ctx.fillStyle = it[0];
            ctx.beginPath();
            ctx.arc(x, cy, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#f3f7ff";
            ctx.fillText(it[1], x + 20, textY);
        });
        const a = document.createElement("a");
        a.download = "ocp_signalmap_map_view_clean_title.png";
        a.href = out.toDataURL("image/png");
        a.click();
        setStatus("Map exported.");
        setTimeout(() => setStatus(oldStatus), 1600);
    }
    catch (e) {
        console.error(e);
        setStatus(oldStatus);
        const panel = document.getElementById("panel");
        const top = document.querySelector(".top");
        const legend = document.querySelector(".legend");
        if (panel)
            panel.style.display = "";
        if (top)
            top.style.display = "";
        if (legend)
            legend.style.display = "";
        alert("Export failed. Make sure internet is working and the map is fully loaded.");
    }
}
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { this.beginPath(); this.moveTo(x + r, y); this.lineTo(x + w - r, y); this.quadraticCurveTo(x + w, y, x + w, y + r); this.lineTo(x + w, y + h - r); this.quadraticCurveTo(x + w, y + h, x + w - r, y + h); this.lineTo(x + r, y + h); this.quadraticCurveTo(x, y + h, x, y + h - r); this.lineTo(x, y + r); this.quadraticCurveTo(x, y, x + r, y); this.closePath(); return this; };
}
document.getElementById("csvFile").addEventListener("change", e => {
    const f = e.target.files[0];
    if (f)
        parseFile(f);
});
const dz = document.getElementById("dropZone");
["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.style.borderColor = "rgba(255,138,29,.85)"; }));
["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.style.borderColor = "rgba(255,255,255,.28)"; }));
dz.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f)
    parseFile(f); });
document.getElementById("techTabs").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b)
        return;
    currentTech = b.dataset.tech;
    document.querySelectorAll("#techTabs button").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    render();
});
["metric", "radius", "opacity", "weakOnly", "showPoints"].forEach(id => {
    const el = document.getElementById(id);
    if (el)
        el.addEventListener("change", render);
});
let sliderRenderTimer;
for (const id of ["radius", "opacity"]) {
    document.getElementById(id).addEventListener("input", () => {
        clearTimeout(sliderRenderTimer);
        sliderRenderTimer = setTimeout(render, 140);
    });
}
document.getElementById("mapStyle").addEventListener("change", e => {
    didSwitchBasemap = false;
    useBasemap(e.target.value);
});
map.on("click", e => {
    if (!document.getElementById("clickMap").checked)
        return;
    const r = nearest(e.latlng);
    if (r)
        L.popup().setLatLng([r.lat, r.lon]).setContent(popup(r)).openOn(map);
});
document.getElementById("panelBtn").addEventListener("click", () => document.getElementById("panel").classList.toggle("hide"));
document.getElementById("fitBtn").addEventListener("click", () => { if (bounds && bounds.isValid())
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 }); });
document.getElementById("downloadBtn").addEventListener("click", downloadHeatmap);
function smPdfGet(row, names) {
    try {
        const v = getValue(row.raw || {}, names);
        if (v === undefined || v === null || String(v).trim() === "")
            return "—";
        return String(v).trim().slice(0, 160);
    }
    catch (e) {
        return "—";
    }
}
function smPdfMapUrl(lat, lon) {
    return "https://www.google.com/maps?q=" + lat + "," + lon;
}
function smQualityColor(label) {
    if (label === "Excellent")
        return [24, 212, 122];
    if (label === "Good")
        return [255, 212, 0];
    return [9, 76, 255];
}
function smAddTopBar(pdf, titleRight) {
    const w = pdf.internal.pageSize.getWidth();
    pdf.setFillColor(7, 16, 31);
    pdf.rect(0, 0, w, 18, "F");
    pdf.setTextColor(243, 247, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text("OCP SignalMap Report", 10, 11.5);
    pdf.setTextColor(170, 182, 200);
    pdf.setFont("helvetica", "normal");
    pdf.text(titleRight || "4G Coverage Quality - RSRP", w - 60, 11.5);
}
function smAddFooter(pdf, page, total) {
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    pdf.setDrawColor(230, 235, 242);
    pdf.line(10, h - 13, w - 10, h - 13);
    pdf.setTextColor(120, 130, 150);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text("OCP SignalMap | Coverage report", 10, h - 7);
    pdf.text("Page " + page + " / " + total, w - 28, h - 7);
}
function smCard(pdf, x, y, w, h, label, value, sub, rgb) {
    const cardH = Math.max(h, sub ? 27 : 23);
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(x, y, w, cardH, 3.5, 3.5, "FD");
    pdf.setTextColor(100, 116, 139);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.2);
    pdf.text(String(label).toUpperCase(), x + 3.2, y + 6.3);
    pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
    pdf.setFont("helvetica", "bold");
    const valueText = String(value);
    const valueSize = valueText.length > 10 ? 11 : 14;
    pdf.setFontSize(valueSize);
    pdf.text(valueText, x + 3.2, y + 15.8);
    if (sub) {
        pdf.setTextColor(100, 116, 139);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.2);
        pdf.text(String(sub), x + 3.2, y + 23.4);
    }
}
function smSectionTitle(pdf, text, y) {
    pdf.setTextColor(17, 24, 39);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(17);
    pdf.text(text, 14, y);
    return y + 7;
}
function smWrap(pdf, text, x, y, maxW, lineH) {
    const lines = pdf.splitTextToSize(text, maxW);
    pdf.text(lines, x, y);
    return y + lines.length * lineH;
}
function smDrawStatBarChart(pdf, x, y, w, h, weak, good, excellent) {
    const max = Math.max(weak, good, excellent, 1);
    const labels = [
        ["Weak", weak, [9, 76, 255]],
        ["Good", good, [255, 212, 0]],
        ["Excellent", excellent, [24, 212, 122]]
    ];
    pdf.setDrawColor(229, 231, 235);
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(7);
    for (let i = 0; i <= 4; i++) {
        const yy = y + h - (i * h / 4);
        pdf.line(x, yy, x + w, yy);
        pdf.text(String(Math.round(max * i / 4)), x - 11, yy + 2);
    }
    const barW = w / 7;
    labels.forEach((b, idx) => {
        const bx = x + (idx * 2 + 1) * barW;
        const bh = (b[1] / max) * h;
        pdf.setFillColor(b[2][0], b[2][1], b[2][2]);
        pdf.rect(bx, y + h - bh, barW, bh, "F");
        pdf.setTextColor(17, 24, 39);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        pdf.text(b[0], bx - 1, y + h + 7);
        pdf.setFont("helvetica", "normal");
        pdf.text(String(b[1].toLocaleString()), bx - 1, y + h + 13);
    });
}
function smInfoTable(pdf, rows, x, y, w) {
    const labelW = 38;
    const rowH = 12;
    rows.forEach((r, i) => {
        pdf.setDrawColor(226, 232, 240);
        pdf.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
        pdf.rect(x, y + i * rowH, w, rowH, "FD");
        pdf.setTextColor(55, 65, 81);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.text(r[0], x + 3, y + i * rowH + 7.5);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(31, 41, 55);
        const wrapped = pdf.splitTextToSize(r[1], w - labelW - 8);
        pdf.text(wrapped, x + labelW + 3, y + i * rowH + 7.5);
    });
    return y + rows.length * rowH;
}
function smPointsTable(pdf, points, metric, x, y, w, title, pageNum, totalPages) {
    smAddTopBar(pdf, "4G Coverage Quality - " + metric);
    let yy = smSectionTitle(pdf, title, 30);
    pdf.setTextColor(55, 65, 81);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.2);
    const desc = title.includes("Weak")
        ? "The table below lists the weakest measured points. Each Map link opens the coordinate in Google Maps."
        : "Strong zones indicate places where RSRP was excellent. These points can be used as reference areas when comparing coverage behavior across sectors and terrain.";
    yy = smWrap(pdf, desc, x, yy + 1, w, 4.5) + 4;
    const cols = [
        ["#", 8],
        ["Quality", 21],
        [metric, 16],
        ["Latitude", 25],
        ["Longitude", 26],
        ["Time", 40],
        ["Map", 18]
    ];
    pdf.setFillColor(7, 16, 31);
    pdf.rect(x, yy, w, 8, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.2);
    let cx = x + 2;
    cols.forEach(c => {
        pdf.text(c[0], cx, yy + 5.2);
        cx += c[1];
    });
    yy += 8;
    pdf.setFontSize(7.2);
    points.forEach((r, i) => {
        if (i % 2 === 0) {
            pdf.setFillColor(248, 250, 252);
            pdf.rect(x, yy, w, 8, "F");
        }
        pdf.setDrawColor(229, 231, 235);
        pdf.line(x, yy + 8, x + w, yy + 8);
        const label = quality(metric, r.val)[0];
        const c = smQualityColor(label);
        const t = smPdfGet(r, ["time", "temps", "date", "datetime", "timestamp", "heure"]);
        cx = x + 2;
        pdf.setTextColor(17, 24, 39);
        pdf.setFont("helvetica", "normal");
        pdf.text(String(i + 1), cx, yy + 5.2);
        cx += cols[0][1];
        pdf.setTextColor(c[0], c[1], c[2]);
        pdf.setFont("helvetica", "bold");
        pdf.text(label, cx, yy + 5.2);
        cx += cols[1][1];
        pdf.setTextColor(17, 24, 39);
        pdf.text(String(r.val), cx, yy + 5.2);
        cx += cols[2][1];
        pdf.setFont("helvetica", "normal");
        pdf.text(r.lat.toFixed(5), cx, yy + 5.2);
        cx += cols[3][1];
        pdf.text(r.lon.toFixed(5), cx, yy + 5.2);
        cx += cols[4][1];
        pdf.text(String(t).slice(0, 18), cx, yy + 5.2);
        cx += cols[5][1];
        pdf.setTextColor(37, 99, 235);
        pdf.setFont("helvetica", "bold");
        pdf.textWithLink("Open", cx, yy + 5.2, { url: smPdfMapUrl(r.lat, r.lon) });
        yy += 8;
    });
    smAddFooter(pdf, pageNum, totalPages);
}
async function downloadCoveragePdfReport() {
    if (!rowsClean || !rowsClean.length) {
        alert("Upload CSV first.");
        return;
    }
    const oldStatus = statusEl ? statusEl.textContent : "";
    if (typeof setStatus === "function")
        setStatus("Preparing coverage report...");
    try {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert("PDF library not loaded. Check internet and reload the page.");
            if (typeof setStatus === "function")
                setStatus(oldStatus);
            return;
        }
        const panel = document.getElementById("panel");
        const top = document.querySelector(".top");
        const legend = document.querySelector(".legend");
        const oldPanelDisplay = panel ? panel.style.display : "";
        const oldTopDisplay = top ? top.style.display : "";
        const oldLegendDisplay = legend ? legend.style.display : "";
        if (panel)
            panel.style.display = "none";
        if (top)
            top.style.display = "none";
        if (legend)
            legend.style.display = "none";
        await new Promise(r => setTimeout(r, 350));
        const mapCanvas = await html2canvas(document.getElementById("map"), {
            useCORS: true,
            allowTaint: false,
            backgroundColor: "#ffffff",
            logging: false,
            scale: 1.6
        });
        if (panel)
            panel.style.display = oldPanelDisplay;
        if (top)
            top.style.display = oldTopDisplay;
        if (legend)
            legend.style.display = oldLegendDisplay;
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const metric = metricEl.value || "RSRP";
        const lowerBetter = metricType(metric) === "LOWER";
        const weakRows = rowsClean.filter(r => quality(metric, r.val)[0] === "Weak");
        const goodRows = rowsClean.filter(r => quality(metric, r.val)[0] === "Good");
        const excellentRows = rowsClean.filter(r => quality(metric, r.val)[0] === "Excellent");
        const values = rowsClean.map(r => Number(r.val)).filter(v => !Number.isNaN(v));
        const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        const best = values.length ? (lowerBetter ? Math.min(...values) : Math.max(...values)) : 0;
        const worst = values.length ? (lowerBetter ? Math.max(...values) : Math.min(...values)) : 0;
        const weakPct = rowsClean.length ? (weakRows.length / rowsClean.length * 100) : 0;
        const goodPct = rowsClean.length ? (goodRows.length / rowsClean.length * 100) : 0;
        const excellentPct = rowsClean.length ? (excellentRows.length / rowsClean.length * 100) : 0;
        const weakest = [...rowsClean]
            .sort((a, b) => lowerBetter ? b.val - a.val : a.val - b.val)
            .slice(0, 12);
        const strongest = [...rowsClean]
            .sort((a, b) => lowerBetter ? a.val - b.val : b.val - a.val)
            .slice(0, 12);
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const totalPages = 5;
        pdf.setFillColor(246, 248, 252);
        pdf.rect(0, 0, pageW, pageH, "F");
        pdf.setFillColor(7, 16, 31);
        pdf.rect(0, 0, pageW, 86, "F");
        try {
            const coverLogo = document.querySelector(".logoBox img, .signalMapLogo img, .cleanOcpLogo img, .realOcpLogo img");
            pdf.setFillColor(255, 255, 255);
            pdf.roundedRect(18, 22, 30, 30, 7, 7, "F");
            if (coverLogo && coverLogo.src) {
                pdf.addImage(coverLogo.src, "PNG", 22, 26, 22, 22);
            }
            else {
                pdf.setTextColor(10, 120, 66);
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(10);
                pdf.text("OCP", 24, 40);
            }
        }
        catch (e) { }
        pdf.setTextColor(243, 247, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(28);
        pdf.text("OCP SignalMap Report", 56, 37);
        pdf.setTextColor(170, 182, 200);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(12);
        pdf.text("Professional 4G Coverage Quality Analysis", 56, 49);
        pdf.setTextColor(170, 182, 200);
        pdf.setFontSize(8.8);
        pdf.text("Generated from uploaded CSV processed by OCP SignalMap", 56, 59);
        const coverX = 18;
        const coverY = 104;
        const coverW = pageW - 36;
        const coverH = 136;
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(226, 232, 240);
        pdf.roundedRect(coverX, coverY, coverW, coverH, 7, 7, "FD");
        pdf.setTextColor(100, 116, 139);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text("METRIC", coverX + 12, coverY + 18);
        pdf.setTextColor(17, 24, 39);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(30);
        pdf.text(metric, coverX + 12, coverY + 39);
        pdf.setTextColor(100, 116, 139);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.5);
        pdf.text("Signal strength measured in dBm", coverX + 12, coverY + 52);
        function coverMiniCard(x, y, label, value, color) {
            pdf.setFillColor(248, 250, 252);
            pdf.setDrawColor(229, 231, 235);
            pdf.roundedRect(x, y, 75, 30, 4, 4, "FD");
            pdf.setTextColor(100, 116, 139);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(7.3);
            pdf.text(label, x + 5, y + 8);
            pdf.setTextColor(color[0], color[1], color[2]);
            pdf.setFont("helvetica", "bold");
            const valueText = String(value);
            pdf.setFontSize(valueText.length > 12 ? 12 : 15);
            pdf.text(valueText, x + 5, y + 21);
        }
        const c1x = coverX + 12;
        const c2x = coverX + 92;
        const cY1 = coverY + 66;
        const cY2 = coverY + 101;
        coverMiniCard(c1x, cY1, "TOTAL MEASUREMENTS", rowsClean.length.toLocaleString(), [17, 24, 39]);
        coverMiniCard(c2x, cY1, "WEAK ZONES", weakRows.length.toLocaleString() + " / " + weakPct.toFixed(1) + "%", [9, 76, 255]);
        coverMiniCard(c1x, cY2, "AVERAGE " + metric, avg.toFixed(1) + " dBm", [17, 24, 39]);
        coverMiniCard(c2x, cY2, "BEST SIGNAL", best.toFixed(1) + " dBm", [10, 150, 80]);
        pdf.setTextColor(100, 116, 139);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text("Source: imported CSV | OCP SignalMap", 18, 270);
        pdf.addPage();
        smAddTopBar(pdf, "4G Coverage Quality - " + metric);
        let y = smSectionTitle(pdf, "Executive Dashboard", 32);
        pdf.setTextColor(55, 65, 81);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.2);
        y = smWrap(pdf, "This report summarizes the 4G coverage quality from the uploaded CSV using RSRP thresholds. It highlights overall coverage health, weak coverage clusters, strong reference zones, and operational actions for field teams.", 14, y + 1, 180, 4.5) + 6;
        smCard(pdf, 14, y, 35, 28, "Rows", rowsClean.length.toLocaleString(), "", [17, 24, 39]);
        smCard(pdf, 52, y, 35, 28, "Weak", weakRows.length.toLocaleString(), weakPct.toFixed(1) + "%", [9, 76, 255]);
        smCard(pdf, 90, y, 35, 28, "Good", goodRows.length.toLocaleString(), goodPct.toFixed(1) + "%", [180, 135, 0]);
        smCard(pdf, 128, y, 35, 28, "Excellent", excellentRows.length.toLocaleString(), excellentPct.toFixed(1) + "%", [10, 150, 80]);
        smCard(pdf, 166, y, 30, 28, "Average", avg.toFixed(1), "dBm", [17, 24, 39]);
        y += 36;
        smCard(pdf, 14, y, 42, 28, "Best", best.toFixed(1), "dBm", [10, 150, 80]);
        smCard(pdf, 60, y, 42, 28, "Worst", worst.toFixed(1), "dBm", [9, 76, 255]);
        smCard(pdf, 106, y, 42, 28, "Metric", metric, "", [17, 24, 39]);
        y += 38;
        smDrawStatBarChart(pdf, 28, y, 150, 52, weakRows.length, goodRows.length, excellentRows.length);
        pdf.setTextColor(17, 24, 39);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text("Measurements by quality class", 65, y + 72);
        y += 86;
        pdf.setTextColor(17, 24, 39);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text("Signal classification thresholds", 14, y);
        y += 7;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.2);
        smInfoTable(pdf, [
            ["Weak", "RSRP < -105 dBm - Poor coverage, high risk of dropped/slow data sessions."],
            ["Good", "-105 to -90 dBm - Usable coverage, may need monitoring in busy hours."],
            ["Excellent", "RSRP >= -90 dBm - Strong signal, reference areas for best network experience."]
        ], 14, y, 182);
        smAddFooter(pdf, 2, totalPages);
        pdf.addPage();
        smAddTopBar(pdf, "4G Coverage Quality - " + metric);
        y = smSectionTitle(pdf, "Map View & Spatial Reading", 32);
        pdf.setTextColor(55, 65, 81);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.2);
        y = smWrap(pdf, "The map view shows a continuous measurement path with a visible heat layer over the surveyed area. Darker/high-density areas indicate where repeated measurements were collected along the route.", 14, y + 1, 180, 4.5) + 5;
        const mapImg = mapCanvas.toDataURL("image/png");
        const imgW = 168;
        const imgH = Math.min(78, mapCanvas.height * imgW / mapCanvas.width);
        pdf.addImage(mapImg, "PNG", 21, y, imgW, imgH);
        y += imgH + 7;
        y = smInfoTable(pdf, [
            ["Key finding", "Weak coverage represents " + weakPct.toFixed(1) + "% of all valid points (" + weakRows.length.toLocaleString() + " out of " + rowsClean.length.toLocaleString() + "). This is the main optimization priority."],
            ["Average quality", "The average RSRP is " + avg.toFixed(1) + " dBm, which is close to the weak/good boundary. Small improvements can move many points into the Good class."],
            ["Best reference", "The best measured signal is " + best.toFixed(1) + " dBm, showing that excellent service is achievable in parts of the route."]
        ], 21, y, 168) + 11;
        pdf.setTextColor(17, 24, 39);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.text("Recommended field actions", 14, y);
        y += 8;
        pdf.setTextColor(31, 41, 55);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.2);
        const actions = [
            "Prioritize the first weak clusters for drive-test verification and antenna optimization checks.",
            "Compare weak points against terrain, road corridor, sector azimuth, and cell load during the same time window.",
            "Repeat measurements after any radio parameter or tilt/power change to validate improvement.",
            "Use the strong zones as a reference baseline for expected performance in the same geography."
        ];
        actions.forEach(a => { y = smWrap(pdf, "• " + a, 16, y, 178, 4.5); });
        smAddFooter(pdf, 3, totalPages);
        pdf.addPage();
        smPointsTable(pdf, weakest, metric, 14, 32, 182, "Priority Weak Zones", 4, totalPages);
        pdf.setTextColor(17, 24, 39);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text("Interpretation", 14, 174);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.2);
        pdf.setTextColor(55, 65, 81);
        smWrap(pdf, "Several weakest points are repeated at very close coordinates and times. This suggests localized weak clusters rather than isolated measurement noise. They should be grouped by location before network optimization work begins.", 14, 182, 178, 4.5);
        pdf.addPage();
        smPointsTable(pdf, strongest, metric, 14, 32, 182, "Top Strong Zones & Final Recommendations", 5, totalPages);
        pdf.setTextColor(17, 24, 39);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text("Operational next steps", 14, 174);
        y = 183;
        pdf.setFillColor(7, 16, 31);
        pdf.rect(14, y, 182, 8, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(8);
        pdf.text("Step", 17, y + 5.2);
        pdf.text("Action", 33, y + 5.2);
        pdf.text("Purpose", 80, y + 5.2);
        y += 8;
        const steps = [
            ["1", "Cluster weak points", "Group nearby weak coordinates and rank clusters by number of weak samples and worst RSRP."],
            ["2", "Check radio layer", "Review serving cell, neighbor cells, antenna tilt, azimuth, power, and overshooting."],
            ["3", "Validate on site", "Run a focused drive test on the top weak clusters during similar hours."],
            ["4", "Plan optimization", "Apply parameter/antenna changes, then regenerate the report to compare before vs after."]
        ];
        steps.forEach((s, idx) => {
            if (idx % 2 === 0) {
                pdf.setFillColor(248, 250, 252);
                pdf.rect(14, y, 182, 12, "F");
            }
            pdf.setTextColor(17, 24, 39);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(8);
            pdf.text(s[0], 17, y + 7);
            pdf.text(s[1], 33, y + 7);
            pdf.setFont("helvetica", "normal");
            pdf.text(pdf.splitTextToSize(s[2], 108), 80, y + 5);
            y += 12;
        });
        smAddFooter(pdf, 5, totalPages);
        pdf.save("ocp_signalmap_coverage_report.pdf");
        if (typeof setStatus === "function") {
            setStatus("PDF report downloaded successfully.");
            setTimeout(() => setStatus(oldStatus), 1800);
        }
    }
    catch (e) {
        console.error(e);
        if (typeof setStatus === "function")
            setStatus(oldStatus);
        alert("PDF report failed. Make sure internet is working and the map is fully loaded.");
    }
}
const pdfReportBtn = document.getElementById("pdfReportBtn");
if (pdfReportBtn) {
    pdfReportBtn.addEventListener("click", downloadCoveragePdfReport);
}
window.addEventListener("error", function (ev) {
    try {
        const st = document.getElementById("status");
        if (st) {
            st.textContent = "Program error: " + (ev.message || "unknown error") + ". Reload and try again.";
        }
    }
    catch (e) { }
});
window.addEventListener("unhandledrejection", function (ev) {
    try {
        const st = document.getElementById("status");
        if (st) {
            st.textContent = "Program error: " + ((ev.reason && ev.reason.message) || ev.reason || "unknown error") + ". Reload and try again.";
        }
    }
    catch (e) { }
});
setTimeout(function () {
    try {
        const st = document.getElementById("status");
        if (st && st.textContent.includes("Ready")) {
            st.textContent = "OCP SignalMap is ready. Upload your CSV.";
        }
    }
    catch (e) { }
}, 400);
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        const view = link.dataset.view;
        if (view === 'reports') {
            document.getElementById('pdfReportBtn').click();
            return;
        }
        document.querySelectorAll('.nav-link').forEach(x => x.classList.toggle('selected', x === link));
        if (view === 'dashboard') {
            document.getElementById('panel').classList.remove('hide');
            document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (view === 'map') {
            document.querySelector('.map-frame').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setTimeout(() => { map.invalidateSize(); if (bounds && bounds.isValid())
                map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 }); }, 100);
        }
        if (view === 'analysis') {
            document.getElementById('panel').classList.remove('hide');
            document.getElementById('techTabs').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
});
document.getElementById('panelBtn').addEventListener('click', () => {
    setTimeout(() => map.invalidateSize(), 40);
});
(function () {
    const fileLabel = document.getElementById('datasetFile');
    const datasetCard = document.querySelector('.dataset-overview');
    const distributionCard = document.querySelector('.distribution-card');
    if (!fileLabel || !datasetCard)
        return;
    let previous = fileLabel.textContent;
    const observer = new MutationObserver(function () {
        const next = fileLabel.textContent;
        if (next === previous)
            return;
        previous = next;
        if (next === 'No file imported')
            return;
        datasetCard.classList.remove('sm-updated');
        if (distributionCard)
            distributionCard.classList.remove('sm-updated');
        void datasetCard.offsetWidth;
        datasetCard.classList.add('sm-updated');
        if (distributionCard)
            distributionCard.classList.add('sm-updated');
        setTimeout(() => {
            datasetCard.classList.remove('sm-updated');
            if (distributionCard)
                distributionCard.classList.remove('sm-updated');
        }, 760);
    });
    observer.observe(fileLabel, { childList: true, characterData: true, subtree: true });
})();
