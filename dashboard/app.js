"use strict";
/* Token Radar dashboard — model comps-1.
   Reads window.RADAR from data.js (loaded beside this page). No network:
   no fetch, no outside resources, everything renders from the snapshot data.
   priceRow() below is the page copy of the build-time model: the board's
   implied values and the drawer's recomputed values must agree. */

function data() { return (typeof globalThis !== "undefined" && globalThis.RADAR) || null; }
function model() { var r = data(); return (r && r.model) || null; }

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function fmtInt(n) {
  if (n == null || !isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}
function fmtMoney(n) {
  if (n == null || !isFinite(n)) return "—";
  var a = Math.abs(n), sign = n < 0 ? "−$" : "$";
  if (a >= 1e9) return sign + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return sign + (a / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return sign + (a / 1e3).toFixed(1) + "k";
  return sign + fmtInt(a);
}
function fmtMoneyFull(n) {
  if (n == null || !isFinite(n)) return "—";
  return (n < 0 ? "−$" : "$") + fmtInt(Math.abs(n));
}
function fmtPct(n, digits) {
  if (n == null || !isFinite(n)) return "—";
  var d = digits == null ? 1 : digits;
  return (n > 0 ? "+" : "") + n.toFixed(d) + "%";
}
function fmtFactor(f) { return "×" + Number(f).toFixed(2); }

/* ---- model arithmetic (mirrors the build-time model in main.ts) ---- */

/* main.ts rounds every multiplier to 4 decimals before pricing a row, so
   the page rounds the same way — otherwise the drawer's recomputed value
   drifts from the board's by a few thousand dollars on the biggest rows. */
function round4(n) { return Math.round(n * 1e4) / 1e4; }

function ageDays(row) {
  if (row.age_days != null) return row.age_days;
  var r = data();
  if (row.listed_at && r && r.as_of) {
    var ms = Date.parse(r.as_of) - Date.parse(row.listed_at);
    if (isFinite(ms) && ms >= 0) return Math.floor(ms / 86400000);
  }
  var m = model();
  return (m && m.maturity && m.maturity.unknown_age_days) || 365;
}

function growthParts(row) {
  var m = model();
  var g = (m && m.growth) || { floor: -60, cap: 120, weight: 0.5 };
  var raw = row.change_7d == null ? 0 : row.change_7d;
  var cl = clamp(raw, g.floor, g.cap);
  return {
    raw: raw, reported: row.change_7d != null, clamped: cl,
    mult: round4(1 + (cl / 100) * g.weight),
    floor: g.floor, cap: g.cap, weight: g.weight
  };
}

function maturityParts(row) {
  var m = model();
  var mt = (m && m.maturity) || { floor: 0.6, range: 0.4, days: 1095, unknown_age_days: 365 };
  var age = ageDays(row);
  var unknown = row.age_days == null && !row.listed_at;
  var capped = Math.min(age, mt.days);
  return {
    age: age, unknown: unknown,
    mult: round4(mt.floor + (capped / mt.days) * mt.range),
    floor: mt.floor, range: mt.range, days: mt.days
  };
}

function categoryParts(row) {
  var m = model();
  var map = (m && m.category_multipliers) || {};
  var cat = row.category || null;
  var mult = (cat != null && map[cat] != null) ? map[cat] : 1;
  return { category: cat, mult: mult, known: cat != null && map[cat] != null };
}

function baseParts(row) {
  var m = model();
  var a = m ? m.a : 0, b = m ? m.b : 0;
  return { a: a, b: b, value: Math.exp(a + b * Math.log(row.tvl_usd)) };
}

/* The one function that prices a row: base curve x category x growth x maturity. */
function priceRow(row) {
  var bv = baseParts(row), cm = categoryParts(row),
      gr = growthParts(row), mt = maturityParts(row);
  return {
    base: bv.value, a: bv.a, b: bv.b,
    category: cm.category, catMult: cm.mult, catKnown: cm.known,
    growth: gr, growthMult: gr.mult,
    maturity: mt, maturityMult: mt.mult,
    implied: bv.value * cm.mult * gr.mult * mt.mult
  };
}

function impliedLow(row, p) {
  if (row.implied_low_usd != null) return row.implied_low_usd;
  var m = model();
  var f = (m && m.validation && m.validation.loo_factor) || 2;
  return p.implied / f;
}

/* ---- state ---- */
var state = { tab: "pre", q: "", cat: "", sort: "rank", dir: 1 };
var SORT_DEFAULT_DIR = { rank: 1, implied: -1, tvl: -1, change: -1, age: -1 };
var SORT_LABEL = { rank: "rank", implied: "implied value", tvl: "TVL", change: "7d change", age: "age" };

function sortValue(row, key) {
  if (key === "rank") return row.rank;
  if (key === "implied") return row.implied_value_usd;
  if (key === "tvl") return row.tvl_usd;
  if (key === "change") return row.change_7d == null ? -1e12 : row.change_7d;
  if (key === "age") return ageDays(row);
  return row.rank;
}

function visibleRows() {
  var r = data();
  var rows = (r.rows || []).slice();
  var q = state.q.trim().toLowerCase();
  if (q) rows = rows.filter(function (row) {
    return (row.name || "").toLowerCase().indexOf(q) !== -1 ||
           (row.slug || "").toLowerCase().indexOf(q) !== -1;
  });
  if (state.cat) rows = rows.filter(function (row) { return row.category === state.cat; });
  var key = state.sort, dir = state.dir;
  rows.sort(function (x, y) {
    var d = sortValue(x, key) - sortValue(y, key);
    if (d === 0) d = x.rank - y.rank;
    return d * dir;
  });
  return rows;
}

function logBarPct(value, lo, hi) {
  if (!(value > 0)) return 0;
  var lv = Math.log(value);
  if (hi <= lo) return 100;
  return clamp(((lv - lo) / (hi - lo)) * 100, 2, 100);
}

function verdictChip(v) {
  var cls = v === "farm" ? "chip-farm" : v === "thin" ? "chip-thin" : "chip-skip";
  return '<span class="chip ' + cls + '">' + esc(v || "skip") + "</span>";
}

/* ---- header ---- */

function renderHeader() {
  var r = data(), m = model();
  var badge = document.getElementById("modelBadge");
  if (m && m.version) badge.textContent = m.version;
  var v = (m && m.validation) || {};
  var ts = v.time_split || {};
  var bs = v.bootstrap || {};
  var rows = r.rows || [];
  var wl = Array.isArray(r.watchlist) ? r.watchlist : null;
  var rowSlugs = {};
  rows.forEach(function (row) { rowSlugs[row.slug] = true; });
  var wlTotal = wl ? wl.length : (r.watchlist_size || 40);
  var wlCovered = wl
    ? wl.filter(function (s) { return rowSlugs[s]; }).length
    : (r.watchlist_size || 40);
  var stats = [
    ["Model", m ? esc(m.version || "comps-1") : "comps-1",
      m ? "log(mcap) = " + m.a.toFixed(2) + " + " + m.b.toFixed(3) + " · log(TVL), R² " + (m.r2 != null ? m.r2.toFixed(2) : "—") : "log-log comps fit"],
    ["Out-of-sample error", v.loo_factor ? fmtFactor(v.loo_factor) : "—",
      v.loo_median_abs_log_err != null ? "LOO median |log err| " + v.loo_median_abs_log_err.toFixed(2) : "leave-one-out"],
    ["Time-split error", ts.factor ? fmtFactor(ts.factor) : "—",
      ts.train_n != null ? "fit on " + ts.train_n + " early tokens, tested on " + ts.test_n : "fit early, tested late"],
    ["Bootstrap slope", (bs.slope_lo != null ? "[" + bs.slope_lo.toFixed(2) + ", " + bs.slope_hi.toFixed(2) + "]" : "—"),
      bs.reps ? bs.reps.toLocaleString("en-US") + " resamples" : "slope interval"],
    ["Board", rows.length + " rows",
      "watchlist " + wlCovered + "/" + wlTotal + " covered"],
    ["Comps", m && m.comps_n ? m.comps_n + " traded tokens" : "—",
      m ? "median multiple " + fmtFactor(m.overall_median_multiple) + ", " + (m.comps_excluded || 0) + " outliers excluded" : ""]
  ];
  document.getElementById("stats").innerHTML = stats.map(function (s) {
    return "<div><dt>" + s[0] + "</dt><dd>" + s[1] + "<small>" + s[2] + "</small></dd></div>";
  }).join("");
  var loo = v.loo_factor || 2;
  var capPct = (m && m.capture_pct != null ? m.capture_pct : 0.01);
  document.getElementById("honestNote").innerHTML =
    "<b>How to read this board:</b> the implied value is this entry&rsquo;s own claim, priced at the " +
    "low end of the model&rsquo;s error band — implied-low = implied &divide; " + fmtFactor(loo) +
    " out-of-sample. Farm verdicts are netted at that low end: " + capPct + "% assumed capture minus farm cost. " +
    "Click any row to see the full model breakdown and the recomputed value.";
  document.getElementById("footNote").textContent =
    "Snapshot " + (r.as_of || "") + " · " + (r.source || "DefiLlama protocols snapshot") +
    " · watchlist floor " + fmtMoneyFull(r.floor_usd || 50000000) + " TVL. " +
    "This page renders with no network from data.js; the live-token tab shows market values only and is never mixed into the ranked board.";
}

/* ---- board ---- */

function renderBoard() {
  var r = data();
  var rows = visibleRows();
  var all = r.rows || [];
  var vals = all.map(function (row) { return Math.log(row.implied_value_usd); });
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  var body = document.getElementById("boardBody");
  document.getElementById("emptyState").classList.toggle("hidden", rows.length > 0);
  body.innerHTML = rows.map(function (row) {
    var age = ageDays(row);
    var chg = row.change_7d;
    var chgCls = chg == null ? "" : chg >= 0 ? "pos" : "neg";
    return '<tr class="row" data-slug="' + esc(row.slug) + '">' +
      '<td class="num num-main">' + row.rank + "</td>" +
      '<td><div class="name">' + esc(row.name) + '</div><div class="slug">' + esc(row.slug) + "</div></td>" +
      '<td class="cat">' + esc(row.category || "—") + "</td>" +
      '<td class="num num-main">' + fmtMoney(row.tvl_usd) + "</td>" +
      '<td class="num ' + chgCls + '">' + fmtPct(chg) + "</td>" +
      '<td class="num">' + age + "d</td>" +
      '<td class="num"><span class="num-main">' + fmtMoney(row.implied_value_usd) + "</span>" +
        '<div class="bar"><i style="width:' + logBarPct(row.implied_value_usd, lo, hi).toFixed(1) + '%"></i></div></td>' +
      "<td>" + verdictChip(row.verdict) + "</td></tr>";
  }).join("");
  document.querySelectorAll("#boardBody tr.row").forEach(function (tr) {
    tr.addEventListener("click", function () { openDrawer(tr.getAttribute("data-slug")); });
  });
  document.getElementById("metaLine").textContent =
    "Showing " + rows.length + " of " + all.length + " pre-token protocols" +
    (state.q ? ' · matching "' + state.q + '"' : "") +
    (state.cat ? " · " + state.cat : "") +
    " · sorted by " + SORT_LABEL[state.sort] + (state.dir === 1 ? " ↑" : " ↓") +
    ". Click a row for the model breakdown and farm plan.";
  document.querySelectorAll("#board thead th.sortable").forEach(function (th) {
    var key = th.getAttribute("data-sort");
    th.classList.toggle("sorted", key === state.sort);
    var base = th.textContent.replace(/ [↑↓]$/, "");
    th.textContent = base + (key === state.sort ? (state.dir === 1 ? " ↑" : " ↓") : "");
  });
  document.getElementById("preCount").textContent = "(" + all.length + ")";
  document.getElementById("liveCount").textContent = "(" + ((r.live || []).length) + ")";
}

function renderLive() {
  var live = ((data().live) || []).slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); });
  document.getElementById("liveBody").innerHTML = live.map(function (row) {
    var mult = (row.mcap_usd && row.tvl_usd) ? (row.mcap_usd / row.tvl_usd) : null;
    var chg = row.change_7d;
    var chgCls = chg == null ? "" : chg >= 0 ? "pos" : "neg";
    return "<tr>" +
      '<td><div class="name">' + esc(row.name) + '</div><div class="slug">' + esc(row.slug) + "</div></td>" +
      '<td class="cat">' + esc(row.category || "—") + "</td>" +
      '<td class="num num-main">' + fmtMoney(row.tvl_usd) + "</td>" +
      '<td class="num num-main">' + fmtMoney(row.mcap_usd) + "</td>" +
      '<td class="num ' + chgCls + '">' + fmtPct(chg) + "</td>" +
      '<td class="num num-main">' + (mult == null ? "—" : fmtFactor(mult)) + "</td></tr>";
  }).join("");
  document.getElementById("metaLine").textContent =
    "Live tokens: " + live.length + " protocols whose token already trades — market values, shown for comparison only, never ranked on this board.";
}

function setTab(tab) {
  state.tab = tab;
  var pre = tab === "pre";
  document.getElementById("tabPre").classList.toggle("active", pre);
  document.getElementById("tabLive").classList.toggle("active", !pre);
  document.getElementById("tabPre").setAttribute("aria-selected", pre ? "true" : "false");
  document.getElementById("tabLive").setAttribute("aria-selected", !pre ? "true" : "false");
  document.getElementById("board").classList.toggle("hidden", !pre);
  document.getElementById("liveTable").classList.toggle("hidden", pre);
  document.getElementById("emptyState").classList.toggle("hidden", true);
  if (pre) renderBoard(); else renderLive();
}

/* ---- detail drawer ---- */

function stepText(step) {
  if (typeof step === "string") return { text: step, cost: null, time: null };
  if (step && typeof step === "object") {
    return {
      text: step.text || step.step || step.action || "",
      cost: step.cost || step.cost_usd || null,
      time: step.time || step.days || step.duration || null
    };
  }
  return { text: String(step), cost: null, time: null };
}

function openDrawer(slug) {
  var r = data();
  var row = (r.rows || []).find(function (x) { return x.slug === slug; });
  if (!row) return;
  var p = priceRow(row);
  var m = model();
  var loo = (m && m.validation && m.validation.loo_factor) || 2;
  var low = impliedLow(row, p);
  var capturePct = (m && m.capture_pct != null ? m.capture_pct : 1) / 100;
  var captureLow = low * capturePct;
  var captureCentral = row.implied_value_usd * capturePct;
  var board = row.implied_value_usd;
  var diff = Math.abs(p.implied - board) / board;
  var agree = diff < 0.02;
  var netBoard = row.net_usd;
  var netRecomputed = captureLow - (row.farm_cost_usd || 0);
  var steps = (row.farm_steps || []).map(stepText);
  var chains = (row.chains || []).join(", ");
  var drawer = document.getElementById("drawer");
  drawer.innerHTML =
    '<button class="close" id="drawerClose" aria-label="Close detail">✕ Close</button>' +
    "<h2>" + esc(row.name) + "</h2>" +
    '<p class="d-slug">' + esc(row.slug) + " · rank #" + row.rank + "</p>" +
    '<p class="d-meta">' + esc(row.category || "No category recorded") + (chains ? " · " + esc(chains) : "") +
    " · TVL " + fmtMoneyFull(row.tvl_usd) + "</p>" +
    '<p class="verdict-line">Verdict ' + verdictChip(row.verdict) +
    ' &nbsp; Net <span class="' + (netBoard != null && netBoard < 0 ? "net-neg" : "net-pos") + '">' +
    fmtMoneyFull(netBoard) + "</span></p>" +

    "<h3>Model breakdown — recomputed in this page</h3>" +
    '<table class="kv"><tbody>' +
    "<tr><td>Base value<br><span class=\"note\">exp(a + b · ln TVL), a = " + p.a.toFixed(2) + ", b = " + p.b.toFixed(3) + ", TVL " + fmtMoneyFull(row.tvl_usd) + "</span></td><td>" + fmtMoneyFull(p.base) + "</td></tr>" +
    "<tr><td>Category multiplier<br><span class=\"note\">" + esc(p.category || "no category recorded") + (p.catKnown ? "" : " — no comps multiplier, ×1.00") + "</span></td><td>×" + p.catMult.toFixed(3) + "</td></tr>" +
    "<tr><td>Growth multiplier<br><span class=\"note\">7d " + (p.growth.reported ? fmtPct(p.growth.raw) : "unreported → 0%") + " clamped to [" + p.growth.floor + "%, " + p.growth.cap + "%] → " + fmtPct(p.growth.clamped) + ", weight " + p.growth.weight + "</span></td><td>×" + p.growthMult.toFixed(3) + "</td></tr>" +
    "<tr><td>Maturity multiplier<br><span class=\"note\">age " + p.maturity.age + "d" + (p.maturity.unknown ? " (unknown — " + m.maturity.unknown_age_days + "d assumed)" : "") + ", floor " + p.maturity.floor + " + min(age, " + p.maturity.days + ")/" + p.maturity.days + " × " + p.maturity.range + "</span></td><td>×" + p.maturityMult.toFixed(3) + "</td></tr>" +
    "<tr><td><b>Recomputed implied value</b><br><span class=\"note\">base × category × growth × maturity, computed here from the snapshot figures</span></td><td><b>" + fmtMoneyFull(p.implied) + "</b></td></tr>" +
    "<tr><td>Board implied value</td><td>" + fmtMoneyFull(board) + "</td></tr>" +
    "<tr><td>Agreement</td><td>" + (agree
      ? '<span class="badge-ok">✓ agree</span><span class="note">within ' + (diff * 100).toFixed(1) + '%</span>'
      : '<span class="badge-bad">Δ differs by ' + (diff * 100).toFixed(1) + '%</span>') + "</td></tr>" +
    "<tr><td>Implied low-end value<br><span class=\"note\">implied ÷ out-of-sample factor " + fmtFactor(loo) + "</span></td><td>" + fmtMoneyFull(low) + "</td></tr>" +
    "<tr><td>Assumed capture<br><span class=\"note\">" + (capturePct * 100) + "% of the low-end value (" + (capturePct * 100) + "% of central implied would be " + fmtMoneyFull(captureCentral) + ")</span></td><td>" + fmtMoneyFull(captureLow) + "</td></tr>" +
    "<tr><td>Farm cost</td><td>" + fmtMoneyFull(row.farm_cost_usd) + "</td></tr>" +
    "<tr><td>Net (board)</td><td>" + fmtMoneyFull(netBoard) + "</td></tr>" +
    "<tr><td>Net recomputed<br><span class=\"note\">capture at low end − farm cost</span></td><td>" + fmtMoneyFull(netRecomputed) + "</td></tr>" +
    "</tbody></table>" +

    "<h3>Farm plan — " + steps.length + " steps</h3>" +
    '<ol class="steps">' + steps.map(function (s, i) {
      var extra = "";
      if (s.cost != null || s.time != null) {
        extra = '<p><span class="step-cost">' + esc(s.cost != null ? String(s.cost) : "") + "</span>" +
          (s.time != null ? " · " + esc(String(s.time)) : "") + "</p>";
      }
      return "<li><b>Step " + (i + 1) + ".</b> " + esc(s.text) + extra + "</li>";
    }).join("") + "</ol>" +
    '<p class="foot">Verdict ' + esc(row.verdict) + ": net " + fmtMoneyFull(netBoard) +
    " at the low end of the error band. Farm only if the net stays positive after your own gas and time.</p>";
  drawer.classList.remove("hidden");
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("drawerClose").addEventListener("click", closeDrawer);
}

function closeDrawer() {
  document.getElementById("drawer").classList.add("hidden");
  document.getElementById("overlay").classList.add("hidden");
}

/* ---- init ---- */

function init() {
  var r = data();
  if (!r || !Array.isArray(r.rows) || r.rows.length === 0) {
    document.getElementById("boardBody").innerHTML =
      '<tr><td colspan="8"><div class="error">No board data loaded. data.js did not set window.RADAR with rows.</div></td></tr>';
    return;
  }
  var cats = [];
  r.rows.forEach(function (row) { if (row.category && cats.indexOf(row.category) === -1) cats.push(row.category); });
  cats.sort();
  var sel = document.getElementById("catFilter");
  cats.forEach(function (c) {
    var o = document.createElement("option");
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });

  var params = new URLSearchParams(window.location.search || "");
  if (params.get("q")) state.q = params.get("q");
  if (params.get("cat")) state.cat = params.get("cat");
  if (params.get("tab") === "live") state.tab = "live";
  if (params.get("sort") && SORT_LABEL[params.get("sort")]) {
    state.sort = params.get("sort");
    state.dir = params.get("dir") === "asc" ? 1 : params.get("dir") === "desc" ? -1 : SORT_DEFAULT_DIR[state.sort];
  }

  document.getElementById("search").value = state.q;
  sel.value = state.cat;

  document.getElementById("search").addEventListener("input", function (e) {
    state.q = e.target.value;
    if (state.tab === "pre") renderBoard();
  });
  sel.addEventListener("change", function (e) {
    state.cat = e.target.value;
    if (state.tab === "pre") renderBoard();
  });
  document.getElementById("tabPre").addEventListener("click", function () { setTab("pre"); });
  document.getElementById("tabLive").addEventListener("click", function () { setTab("live"); });
  document.querySelectorAll("#board thead th.sortable").forEach(function (th) {
    th.addEventListener("click", function () {
      var key = th.getAttribute("data-sort");
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = SORT_DEFAULT_DIR[key]; }
      renderBoard();
    });
  });
  document.getElementById("overlay").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

  renderHeader();
  setTab(state.tab);
  if (params.get("row")) openDrawer(params.get("row"));
}

/* Exposed for the render test and for deep-linking: window.RadarApp. */
if (typeof globalThis !== "undefined") {
  globalThis.RadarApp = {
    priceRow: priceRow, ageDays: ageDays, visibleRows: visibleRows,
    openDrawer: openDrawer, closeDrawer: closeDrawer, setTab: setTab,
    state: state
  };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}
