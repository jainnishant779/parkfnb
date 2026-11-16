/* ParkFNB console: the shell, the helpers and the live pages (Dashboard, Live Operations, Parking Lots,
   Vehicles / ANPR, Devices).  Reports, Sessions, Violations and Settings are in console-reports.js.
   Everything is drawn with textContent, never innerHTML, so nothing a camera or an operator typed can run as markup. */
(function () {
  "use strict";
  var PF = window.PF = { pages: {}, S: { cam: null, cameras: [], site: null, state: null, openViolations: 0 }, cleanup: null };
  var S = PF.S;

  // ---------------------------------------------------------------- helpers
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) {
      var k = arguments[i];
      if (k === null || k === undefined || k === false) continue;
      parent.appendChild(typeof k === "string" || typeof k === "number" ? document.createTextNode(String(k)) : k);
    }
    return parent;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  var SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, text) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in (attrs || {})) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function icon(path) {   // a 24x24 line icon from path data
    var s = svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
    s.appendChild(svg("path", { d: path }));
    return s;
  }
  var ICON = {
    layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
    car: "M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16M4 16h16v3h-2.5v-1.5h-11V19H4zM7.5 13h.01M16.5 13h.01",
    park: "M5 3h9a5 5 0 0 1 0 10H9v8M9 3v10",
    warn: "M12 3l10 18H2zM12 10v4M12 17.5h.01",
    check: "M5 12l5 5 9-10", clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
    help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01",
    flag: "M5 21V4M5 4h11l-2 4 2 4H5"
  };

  // The page used to carry on showing the last numbers, with a green "Live", when the network or the server had gone.  Every call
  // here reports whether the server answered; two misses in a row put one bar across the top of every page until it does.
  var net = { misses: 0, lastOk: Date.now(), bar: null };
  function netSeen(ok) {
    if (ok) { net.misses = 0; net.lastOk = Date.now(); if (net.bar) net.bar.hidden = true; return; }
    net.misses += 1;
    if (net.misses < 2) return;
    if (!net.bar) {
      net.bar = document.createElement("div"); net.bar.setAttribute("role", "alert");
      net.bar.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:9999;padding:8px 16px;text-align:center;font-weight:600;background:var(--red,#c0392b);color:#fff";
      document.body.appendChild(net.bar);
    }
    net.bar.hidden = false;
    net.bar.textContent = "Cannot reach the server. What you see on this page is " + Math.round((Date.now() - net.lastOk) / 1000) + " s old.";
  }
  async function api(path, opts) {
    var r;
    try { r = await fetch(path, Object.assign({ credentials: "same-origin", cache: "no-store" }, opts || {})); }
    catch (e) { netSeen(false); throw e; }
    netSeen(r.status !== 502 && r.status !== 503 && r.status !== 504);
    if (r.status === 403) { location.href = "/admin?next=" + encodeURIComponent("/" + location.hash); throw new Error("Signed out"); }
    var data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) throw new Error((data && data.error) || ("Server said " + r.status));
    return data;
  }
  function post(path, body) {
    return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  }
  function q(params) {
    var out = [];
    for (var k in params) if (params[k] !== undefined && params[k] !== null && params[k] !== "") out.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
    return out.join("&");
  }

  function two(n) { return n < 10 ? "0" + n : String(n); }
  function dur(s) {
    if (s === null || s === undefined || isNaN(s)) return "–";
    s = Math.max(0, Math.round(s));
    if (s < 60) return s + " s";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min";
    var h = Math.floor(m / 60), r = m % 60;
    return h + " h " + two(r) + " min";
  }
  // Every time on these pages is the lot's time (the server's ANPR_TIMEZONE), not the time of whatever laptop is looking: the reports
  // count days in it, so a clock in another zone would show a violation under the wrong day.  A zone name the browser does not know
  // falls back to the browser's own.
  function withZone(o) {
    var tz = S.site && S.site.timezone;
    if (!tz) return o;
    try { new Intl.DateTimeFormat([], { timeZone: tz }); o.timeZone = tz; } catch (e) { /* the browser's own */ }
    return o;
  }
  function clockOf(epoch) { var d = new Date(epoch * 1000); return d.toLocaleTimeString([], withZone({ hour: "numeric", minute: "2-digit" })); }
  function dateTimeOf(epoch) {
    if (epoch === null || epoch === undefined) return "–";
    var d = new Date(epoch * 1000);
    return d.toLocaleDateString([], withZone({ day: "numeric", month: "short" })) + ", " + d.toLocaleTimeString([], withZone({ hour: "numeric", minute: "2-digit" }));
  }
  // "YYYY-MM-DD" of the lot's day, `n` days ago
  function dayAgo(n) {
    var d = new Date(Date.now() - n * 86400000);
    try { var s = d.toLocaleDateString("en-CA", withZone({ year: "numeric", month: "2-digit", day: "2-digit" })); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; } catch (e) { /* below */ }
    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
  }
  function bayLabel(id) { return /^\d+$/.test(String(id)) ? "P" + id : String(id); }
  function pct(v, d) { return v === null || v === undefined ? "–" : (+v).toFixed(d === undefined ? 0 : d) + "%"; }
  function todayStr() { return dayAgo(0); }
  function camName(id) {
    var c = ((S.site && S.site.cameras) || []).filter(function (x) { return x.id === id; })[0];
    return (c && c.name) || id;
  }
  function tile(cls, iconKey, label, value, sub) {
    var t = el("div", "tile " + cls);
    var k = el("div", "k"); k.appendChild(icon(ICON[iconKey])); k.appendChild(document.createTextNode(label));
    add(t, k, el("div", "v" + (String(value).length > 6 ? " sm" : ""), value));
    if (sub) t.appendChild(el("div", "s", sub));
    return t;
  }
  function card(title, right) {
    var c = el("section", "card"), h = el("header"), body = el("div", "body");
    add(h, el("h2", "", title));
    if (right) h.appendChild(right);
    add(c, h, body);
    c.body = body;
    return c;
  }
  function empty(text) { return el("div", "empty", text); }
  function note(text, kind) { return el("div", "note" + (kind ? " " + kind : ""), text); }
  function btn(text, cls, fn) { var b = el("button", "btn" + (cls ? " " + cls : ""), text); b.type = "button"; if (fn) b.onclick = fn; return b; }
  function tag(text, cls) { return el("span", "tag" + (cls ? " " + cls : ""), text); }

  // ---------------------------------------------------------------- live data shared by pages
  var STREAM = { live: ["Live", "ok"], stale: ["Stalled", "bad"], offline: ["Offline", "bad"], error: ["Error", "bad"], not_started: ["Not started", "warn"] };

  // The plate of a parked car, with the picture it was read from and a box to say what it is.  A person reads what the machine could
  // not (a plate that is small, slanted or in shadow): "Save" makes it confirmed, and nothing read later changes it.
  function plateEditor(a, onSaved) {
    var box = el("div", "pl-edit"), suggestion = a.text || a.guess || "";
    if (a.plate_photo) {
      var im = el("img"); im.alt = "The plate cut from the photo";
      im.src = "/console/api/arrival/" + encodeURIComponent(a.id) + ".jpg?" + q({ camera_id: S.cam, kind: "plate", v: a.last_look || a.arrived });
      im.style.height = "84px"; im.title = "Open it full size"; im.style.cursor = "zoom-in";
      im.onclick = function () { window.open(im.src, "_blank", "noopener"); };
      box.appendChild(im);
    }
    // What the machine thinks, with the letters it is NOT sure of picked out.  The box below is left EMPTY on purpose: when it came
    // filled in with the machine's guess, pressing Confirm took a wrong letter for a person's check (28 Oct, Bay-06: U read as D).
    var hint = el("div", "pl-hint");
    if (suggestion) {
      var doubt = {}; (a.doubts || []).forEach(function (d) { doubt[d.pos] = d.chars; });
      add(hint, el("span", "muted", "The system thinks: "));
      suggestion.split("").forEach(function (ch, i) {
        var s = el("b", doubt[i] ? "dbt" : "", ch); if (doubt[i]) s.title = "Not sure of this letter: " + doubt[i].join(" / ") + ". Check it."; hint.appendChild(s);
      });
      if ((a.doubts || []).length) hint.appendChild(el("small", "muted", "  Check the orange letter" + (a.doubts.length > 1 ? "s" : "") + ": " +
        a.doubts.map(function (d) { return "letter " + (d.pos + 1) + ": " + d.chars.join(" / "); }).join("; ")));
    }
    if (a.machine && a.machine.text && a.text && a.machine.text !== a.text && a.source === "operator")
      hint.appendChild(el("small", "pl-warn", "  The reader now says " + a.machine.text + (a.machine.confirmed ? " (confirmed). Look again." : ".")));
    box.appendChild(hint);
    var state = a.source === "operator" ? tag("set by a person", "blue") : a.confirmed ? tag("confirmed · " + (a.reads || []).length + " reads", "green")
      : a.text ? tag("one read, checking", "amber") : a.guess ? tag("a guess: check it against the picture", "amber") : tag("not read", "");
    var inp = el("input", "fld"); inp.type = "text"; inp.maxLength = 12; inp.style.textTransform = "uppercase"; inp.value = ""; inp.spellcheck = false; inp.autocapitalize = "characters";
    inp.setAttribute("aria-label", "Number plate, as you read it from the picture"); inp.placeholder = "Type it as you read it";
    var msg = el("small", "muted", ""), save = btn("Save what I typed", "", function () {
      if (!inp.value.trim()) { msg.textContent = "Type the plate as you read it from the picture."; inp.focus(); return; }
      save.disabled = true; msg.textContent = "Saving…";
      post("/console/api/arrival/" + encodeURIComponent(a.id) + "/plate?" + q({ camera_id: S.cam }), { plate: inp.value })
        .then(function (r) { msg.textContent = "Saved."; if (onSaved) onSaved(r.arrival); })
        .catch(function (e) { msg.textContent = e.message; })
        .then(function () { save.disabled = false; });
    });
    var row = el("div", "bar"); add(row, inp, save);
    if (suggestion && a.plate_photo) {
      // agreeing with the machine is a choice too, but a separate and deliberate one, never the default
      var yes = btn("It is right: " + suggestion, "", function () { inp.value = suggestion; save.click(); });
      yes.style.cssText = "padding:4px 10px;min-height:0"; row.appendChild(yes);
    }
    if (a.source === "operator") {
      // a plate typed by mistake can be taken back: the server clears it and the reader's own answer stands again
      var undo = btn("Remove my plate", "", function () {
        undo.disabled = true; msg.textContent = "Removing…";
        post("/console/api/arrival/" + encodeURIComponent(a.id) + "/plate?" + q({ camera_id: S.cam }), { plate: "" })
          .then(function (r) { msg.textContent = "Removed."; if (onSaved) onSaved(r.arrival); })
          .catch(function (e) { msg.textContent = e.message; undo.disabled = false; });
      });
      undo.style.cssText = "padding:4px 10px;min-height:0"; row.appendChild(undo);
    }
    add(box, state, row, msg);
    return box;
  }

  // One word and colour for the camera's health, the same in the header, the sidebar, the camera table and the health chips.  The
  // server says "live" while pictures arrive; a picture that is old, or a processor that is behind, is not "Live" to a person.
  function streamView(o) {
    var st = STREAM[o.stream_status] || ["–", ""];
    if (o.stream_status !== "live") return st;
    if (o.frozen) return ["Frozen", "bad"];
    var recv = o.age_s !== undefined && o.age_s !== null ? o.age_s : 0, done = o.frame_age_s !== undefined && o.frame_age_s !== null ? o.frame_age_s : 0;
    if (recv > 8) return ["Delayed", "warn"];
    if (done > 8) return ["Behind", "warn"];
    return st;
  }

  function bayView(slot) {
    // one word and a colour for what a bay is, the way the public page says it
    var p = slot.parking && slot.parking.verdict;
    if (slot.status === "VACANT") return { cls: "free", word: "Available", tag: "green" };
    if (slot.status === "OCCUPIED") {
      if (slot.flag === "blocked") return { cls: "unclear", word: "Blocked", tag: "amber" };      // free, but a car lies across it
      if (p === "over_line") return { cls: "taken", word: p && slot.parking.side === "across" ? "Across bays" : "Over the line", tag: "red" };
      // colour by what a manager has to do: blue is a car in its bay (nothing to do), amber a car near its line, red a car to speak to
      if (p === "close_to_line") return { cls: "close", word: "Close to line", tag: "amber" };
      if (p === "correct") return { cls: "parked", word: "Parked correctly", tag: "green" };
      return { cls: "parked", word: "Occupied", tag: "blue" };
    }
    if (slot.status === "STALE") return { cls: "stale", word: "No signal", tag: "" };
    return { cls: "unclear", word: "Unclear", tag: "amber" };
  }

  function activity(ev) {
    var who = ev.bay_id !== undefined && ev.bay_id !== null ? bayLabel(String(ev.bay_id)) : "";
    switch (ev.type) {
      case "in": return { c: "var(--green)", g: "→", t: "Car came in", s: "Car #" + ev.track_id };
      case "out": return { c: "var(--amber)", g: "←", t: "Car went out", s: "Car #" + ev.track_id };
      case "bay_occupied": return { c: "var(--red)", g: "●", t: who + " occupied", s: "A car parked" };
      case "bay_freed": return { c: "var(--green)", g: "✓", t: who + " available", s: "The car left" };
      case "parking_over_line": return { c: "var(--red)", g: "!", t: who + " parked over the line", s: ev.detail || "" };
      case "parking_ok": return { c: "var(--green)", g: "✓", t: who + " parked correctly again", s: "" };
      case "operator": return { c: "var(--blue)", g: "✎", t: who + (ev.status === "CLEARED" ? " answer cleared" : " marked " + (ev.status === "VACANT" ? "available" : "occupied")), s: "Set by an operator" };
      case "feed_offline": return { c: "var(--red)", g: "✕", t: "Camera went offline", s: "No pictures arriving" };
      case "feed_online": return { c: "var(--green)", g: "✓", t: "Camera back online", s: "Pictures are arriving again" };
      case "low_light": return { c: "var(--amber)", g: "☾", t: "Too dark to judge bays", s: "Empty bays show as unclear" };
      case "light_ok": return { c: "var(--green)", g: "☀", t: "Light is back", s: "Bays are being judged again" };
      case "camera_moved": return { c: "var(--amber)", g: "⚠", t: "Camera view changed", s: "Bay layout needs a check" };
      case "camera_ok": return { c: "var(--green)", g: "✓", t: "Camera view back in place", s: "" };
    }
    return { c: "var(--grey)", g: "•", t: ev.type, s: "" };
  }
  function timeline(events, max) {
    var ul = el("ul", "tl");
    var evs = (events || []).slice().reverse().slice(0, max || 8);
    if (!evs.length) { ul.appendChild(el("li", "", "Nothing yet")); return ul; }
    evs.forEach(function (ev) {
      var a = activity(ev), li = el("li"), ic = el("div", "ai", a.g), tx = el("div", "tx");
      ic.style.setProperty("--c", a.c);
      add(tx, el("b", "", a.t)); if (a.s) tx.appendChild(el("small", "", a.s));
      add(li, ic, tx, el("span", "tm", clockOf(ev.t)));
      ul.appendChild(li);
    });
    return ul;
  }
  function chip(label, value, level) {
    var c = el("span", "chip" + (level ? " " + level : ""));
    add(c, el("small", "", label), el("b", "", value));
    return c;
  }
  function healthChips(s) {
    var wrap = el("div", "chips"), st = streamView(s), up = s.uplink;
    add(wrap, chip("Stream", st[0], st[1]),
      up ? chip("Upload", (up.p50_ms / 1000).toFixed(1) + " s", up.p95_ms > 4000 ? "warn" : "") : el("span"),
      chip("Frame age", s.frame_age_s === null || s.frame_age_s === undefined ? "–" : s.frame_age_s + " s", s.frame_age_s > 8 ? "warn" : ""),
      chip("Speed", (s.fps_processed || 0).toFixed(1) + " fps"),
      chip("Latency", s.ms_per_frame ? s.ms_per_frame + " ms" : "–"),
      chip("Light", s.light === "low" ? "Low" : "OK", s.light === "low" ? "warn" : "ok"),
      chip("View", s.calibration === "moved" ? "Moved" : "In place", s.calibration === "moved" ? "warn" : "ok"));
    var sc = s.site_calibration;
    if (sc) add(wrap, chip("3D", sc.ready ? "Ready · " + sc.good_bays + "/" + sc.total + " bays good" : "Not calibrated", sc.ready ? "ok" : "warn"));
    return wrap;
  }

  // a poller that stops when the page is left
  function poller(fn, ms) {
    var stopped = false, timer = null;
    async function tick() {
      if (stopped) return;
      try { await fn(); } catch (e) { /* the next tick tries again */ }
      if (!stopped) timer = setTimeout(tick, document.hidden ? ms * 3 : ms);
    }
    tick();
    return function () { stopped = true; clearTimeout(timer); };
  }
  PF.u = { el: el, add: add, clear: clear, svg: svg, icon: icon, ICON: ICON, api: api, post: post, q: q, dur: dur, clockOf: clockOf,
           dateTimeOf: dateTimeOf, bayLabel: bayLabel, pct: pct, todayStr: todayStr, camName: camName, tile: tile, card: card,
           empty: empty, note: note, btn: btn, tag: tag, bayView: bayView, timeline: timeline, chip: chip, healthChips: healthChips,
           poller: poller, STREAM: STREAM, two: two, dayAgo: dayAgo };

  // ---------------------------------------------------------------- charts
  var chartN = 0;
  function lineChart(buckets, opts) {
    // occupancy % per bucket; a gap (no data) breaks the line instead of falling to zero.  Point at it to read a time and a value.
    // a full-width card gets a wider drawing, so the text stays the same size instead of growing with the card
    var W = opts && opts.wide ? 1200 : 720, H = opts && opts.wide ? 260 : 240, L = 40, R = 12, T = 16, B = 28, n = buckets.length, gid = "pfg" + (++chartN);
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, "class": "chart", role: "img", "aria-label": (opts && opts.label) || "Occupancy over time" });
    var xs = function (i) { return L + (n <= 1 ? 0 : (W - L - R) * i / (n - 1)); };
    var ys = function (v) { return T + (H - T - B) * (1 - v / 100); };
    var defs = svg("defs"), grad = svg("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
    var s1 = svg("stop", { offset: "0" }), s2 = svg("stop", { offset: "1" });
    s1.style.stopColor = "var(--blue)"; s1.style.stopOpacity = ".28"; s2.style.stopColor = "var(--blue)"; s2.style.stopOpacity = "0";
    add(grad, s1, s2); defs.appendChild(grad); s.appendChild(defs);
    [0, 50, 100].forEach(function (g) {
      s.appendChild(svg("line", { x1: L, x2: W - R, y1: ys(g), y2: ys(g), "class": g ? "guide" : "base" }));
      s.appendChild(svg("text", { x: L - 8, y: ys(g) + 4, "text-anchor": "end" }, g + "%"));
    });
    var step = Math.max(1, Math.ceil(n / 8));
    buckets.forEach(function (b, i) {
      if (i % step === 0) s.appendChild(svg("text", { x: xs(i), y: H - 8, "text-anchor": "middle" }, (opts && opts.xlabel ? opts.xlabel(b) : b.label.slice(11, 16))));
      if (!b.future && b.occupancy_pct === null) s.appendChild(svg("rect", { x: xs(i) - 2, y: ys(0) - 6, width: 4, height: 6, rx: 1, "class": "gap" }));
    });
    var seg = [];
    function flush() {
      if (seg.length > 1) {
        var d = seg.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
        s.appendChild(svg("path", { d: d + " L" + seg[seg.length - 1][0].toFixed(1) + " " + ys(0) + " L" + seg[0][0].toFixed(1) + " " + ys(0) + " Z", fill: "url(#" + gid + ")" }));
        s.appendChild(svg("path", { d: d, "class": "line" }));
      } else if (seg.length === 1) s.appendChild(svg("circle", { cx: seg[0][0], cy: seg[0][1], r: 3, "class": "pt" }));
      seg = [];
    }
    buckets.forEach(function (b, i) {
      if (b.future || b.occupancy_pct === null) { flush(); return; }
      seg.push([xs(i), ys(b.occupancy_pct)]);
    });
    flush();
    // today: a line where "now" is, so the empty right-hand side reads as "still to come", not "empty"
    var lastPast = -1;
    buckets.forEach(function (b, i) { if (!b.future) lastPast = i; });
    if (lastPast >= 0 && lastPast < n - 1) {
      s.appendChild(svg("line", { x1: xs(lastPast), x2: xs(lastPast), y1: T, y2: ys(0), "class": "now" }));
      s.appendChild(svg("text", { x: xs(lastPast) + 6, y: T + 10, "class": "nowlbl" }, "now"));
    }
    // the read-out
    var hov = svg("g", { "class": "hov", visibility: "hidden" });
    var vl = svg("line", { y1: T, y2: ys(0) }), dot = svg("circle", { r: 5 }), box = svg("rect", { height: 26, rx: 13 }), txt = svg("text", { y: 0 });
    add(hov, vl, dot, box, txt); s.appendChild(hov);
    var hit = svg("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "transparent" });
    s.appendChild(hit);
    function show(e) {
      var r = s.getBoundingClientRect(); if (!r.width || n < 1) return;
      var x = (e.clientX - r.left) / r.width * W, i = Math.max(0, Math.min(n - 1, Math.round((x - L) / (W - L - R) * (n - 1))));
      var bk = buckets[i]; if (!bk || bk.future) { hov.setAttribute("visibility", "hidden"); return; }
      var has = bk.occupancy_pct !== null, cx = xs(i), cy = has ? ys(bk.occupancy_pct) : ys(0);
      var lab = (opts && opts.xlabel ? opts.xlabel(bk) : bk.label.slice(11, 16)) + " · " + (has ? bk.occupancy_pct + "% occupied" : "no data");
      vl.setAttribute("x1", cx); vl.setAttribute("x2", cx); dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
      dot.setAttribute("visibility", has ? "visible" : "hidden");
      txt.textContent = lab;
      var bw = lab.length * 6.6 + 24, bx = Math.max(L, Math.min(W - R - bw, cx - bw / 2)), by = Math.max(0, cy - 40);
      box.setAttribute("x", bx); box.setAttribute("y", by); box.setAttribute("width", bw);
      txt.setAttribute("x", bx + bw / 2); txt.setAttribute("y", by + 17);
      hov.setAttribute("visibility", "visible");
    }
    hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", function () { hov.setAttribute("visibility", "hidden"); });
    return s;
  }
  PF.u.lineChart = lineChart;

  // ---------------------------------------------------------------- shell: camera picker, site chip, badge
  function labelOf(c) { return camName(c.id) + (c.bays ? " · " + c.bays + " bays" : ""); }
  async function refreshShell() {
    try {
      var results = await Promise.all([api("/console/api/cameras"), api("/console/api/site")]);
      S.cameras = results[0].cameras; S.site = results[1];
    } catch (e) { return; }
    var pick = $("camPick"), keep = S.cam;
    var ids = S.cameras.map(function (c) { return c.id; });
    if (!keep || ids.indexOf(keep) < 0) keep = ids.indexOf("phone-1") >= 0 ? "phone-1" : (ids[0] || "phone-1");
    if (!S.cameras.length) S.cameras = [{ id: keep, bays: 0, stream_status: "not_started" }];
    clear(pick);
    // old test cameras that never sent a picture (gate-1, venue-lot) stay in Parking Lots and Devices but are not offered here, where
    // they only invite a click on an empty page
    var anyLive = S.cameras.some(function (c) { return c.stream_status !== "not_started"; });
    S.cameras.filter(function (c) { return !anyLive || c.stream_status !== "not_started" || c.id === keep; })
      .forEach(function (c) { var o = el("option", "", labelOf(c)); o.value = c.id; pick.appendChild(o); });
    pick.value = S.cam = keep;
    pageLinks();
    var cur = S.cameras.filter(function (c) { return c.id === keep; })[0] || {};
    var st = streamView(cur);
    var pill = $("statePill"); pill.textContent = st[0]; pill.className = "pill " + st[1];
    $("siteName").textContent = (S.site && S.site.site_name) || "ParkFNB";
    $("siteSub").textContent = camName(keep) + " · " + st[0];
    try {
      var v = await api("/console/api/violations?" + q({ camera_id: keep, status: "open" }));
      S.openViolations = v.open_count; S.goingOn = v.going_on || 0;
      ["vbadge", "vbadge2"].forEach(function (id) { var b = $(id); if (b) { b.textContent = v.open_count; b.hidden = !v.open_count; } });
    } catch (e) { /* the badge just stays as it was */ }
  }
  PF.refreshShell = refreshShell;
  $("camPick").addEventListener("change", function () {
    S.cam = $("camPick").value;
    try { localStorage.setItem("pf.cam", S.cam); } catch (e) { /* private mode */ }
    refreshShell(); route();
  });
  try { S.cam = localStorage.getItem("pf.cam"); } catch (e) { /* no storage */ }

  function tickClock() { var d = new Date(); $("clock").textContent = d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
  tickClock(); setInterval(tickClock, 15000);

  // ---------------------------------------------------------------- pages
  var P = PF.pages;

  // What a manager has to do now, worst first: the camera, then bays to deal with, then violations to review.  Built from the same
  // /live/state and violations count the rest of the page uses; nothing here is invented.
  function actionItems(s) {
    var items = [], st = streamView(s), slots = s.slots || [], down = s.stream_status !== "live" || s.frozen;
    if (down) {
      items.push({ lvl: "red", g: "✕", href: "#/devices", act: "Devices",
        t: s.frozen ? "The camera picture is frozen" : s.stream_status === "not_started" ? "No picture from the camera yet" : "The camera is " + st[0].toLowerCase(),
        s: "Check the phone: screen on, the camera page open and in front, Wi-Fi on." });
    } else if (st[1] === "warn") {
      items.push({ lvl: "amber", g: "!", href: "#/devices", act: "Devices", t: "The camera is " + st[0].toLowerCase(), s: "Pictures arrive late, so the numbers may lag." });
    }
    if (s.calibration === "moved") items.push({ lvl: "amber", g: "⚠", href: "/occupancy?camera=" + encodeURIComponent(S.cam), act: "Bay layout",
      t: "The camera view has changed", s: "The bays may no longer line up with the picture. Check the bay layout." });
    if (s.light === "low") items.push({ lvl: "amber", g: "☾", t: "Too dark to judge the bays", s: "Empty bays show as unclear until there is more light." });
    if (!down) {
      var unclear = [];
      slots.forEach(function (slot) {
        var v = bayView(slot), name = bayLabel(slot.id), href = "#/live?bay=" + encodeURIComponent(slot.id);
        if (v.cls === "taken") items.push({ lvl: "red", g: "!", href: href, act: "Open bay", t: name + ": " + v.word.toLowerCase(), s: "Speak to the driver, or open the bay to check the picture." });
        else if (v.word === "Blocked") items.push({ lvl: "amber", g: "⛔", href: href, act: "Open bay", t: name + " is blocked", s: "It is free, but a car lies across it." });
        else if (v.cls === "close") items.push({ lvl: "amber", g: "~", href: href, act: "Open bay", t: name + ": close to the line", s: "Nothing to do yet; keep an eye on it." });
        else if (v.cls === "unclear") unclear.push(name);
      });
      if (unclear.length) items.push({ lvl: "amber", g: "?", href: "#/live", act: "Live", t: unclear.length === 1 ? unclear[0] + " is unclear" : unclear.length + " bays are unclear",
        s: (unclear.length > 1 ? unclear.join(", ") + ". " : "") + "The camera cannot tell; you can mark them by hand on Live Operations." });
    }
    if (S.openViolations) items.push({ lvl: S.goingOn ? "red" : "amber", g: "⚑", href: "#/violations", act: "Review",
      t: S.openViolations + (S.openViolations === 1 ? " violation to review" : " violations to review"),
      s: S.goingOn ? S.goingOn + " happening now" + (S.openViolations > S.goingOn ? ", " + (S.openViolations - S.goingOn) + " already over" : "") : "All already over: resolve or dismiss them." });
    var rank = { red: 0, amber: 1 };
    return items.sort(function (x, y) { return rank[x.lvl] - rank[y.lvl]; });
  }
  function todoList(items) {
    var ul = el("ul", "todo");
    if (!items.length) {
      var li = el("li", "clear"), ic = el("span", "ai", "✓"), tx = el("span", "tx");
      ic.style.setProperty("--c", "var(--green)");
      add(tx, el("b", "", "All clear"), el("small", "", "Nothing needs you right now."));
      add(li, ic, tx); ul.appendChild(li); return ul;
    }
    items.forEach(function (it) {
      var li = el("li"), row = el(it.href ? "a" : "div", "row " + it.lvl), ic = el("span", "ai", it.g), tx = el("span", "tx");
      if (it.href) row.href = it.href;
      ic.style.setProperty("--c", "var(--" + it.lvl + ")");
      add(tx, el("b", "", it.t), el("small", "", it.s));
      add(row, ic, tx);
      if (it.act) row.appendChild(el("span", "go", it.act + " →"));
      li.appendChild(row); ul.appendChild(li);
    });
    return ul;
  }
  function mini(label, value, sub) {
    var m = el("div", "mini");
    add(m, el("small", "", label), el("b", "num", value));
    if (sub) m.appendChild(el("span", "", sub));
    return m;
  }

  P.dashboard = { title: "Dashboard", render: function (view) {
    var tiles = el("div", "tiles");
    var todoCard = card("Needs your action", tag("…", "")), todayCard = card("Today"), actCard = card("Latest activity"), healthCard = card("Camera health");
    var grid = el("div", "grid g2"), left = el("div", "grid"), right = el("div", "grid");
    var todoTag = todoCard.querySelector("header .tag"), minis = el("div", "minis"), chartBox = el("div");
    todoCard.body.style.padding = "0";
    add(todayCard.body, minis, chartBox);
    add(left, todoCard, todayCard); add(right, actCard, healthCard);
    add(grid, left, right);
    add(view, tiles, grid);

    function paintState(s) {
      var sm = s.slot_summary || {}, total = sm.total || 0;
      clear(tiles);
      add(tiles,
        tile("", "layers", "Total bays", total, ""),
        tile("blue", "car", "Occupied", sm.occupied_confirmed || 0, total ? pct((sm.occupied_confirmed || 0) / total * 100) + " of bays" : ""),
        tile("green", "park", "Available", sm.vacant || 0, total ? pct((sm.vacant || 0) / total * 100) + " of bays" : ""),
        tile("green", "check", "Parked correctly", sm.parked_correctly || 0, (sm.parked_correctly || 0) + (sm.close_to_line || 0) + (sm.over_line || 0) + " cars judged"),
        tile(sm.over_line ? "red" : "", "warn", "Over the line", sm.over_line || 0, (sm.close_to_line || 0) + " close to a line"),
        tile((sm.uncertain || 0) + (sm.stale || 0) ? "amber" : "", "help", "Unclear", (sm.uncertain || 0) + (sm.stale || 0), (sm.not_judged || 0) + " parked cars not judged"));
      var items = actionItems(s), worst = items.length ? items[0].lvl : "green";
      clear(todoCard.body); todoCard.body.appendChild(todoList(items));
      todoTag.textContent = items.length ? items.length + (items.length === 1 ? " thing" : " things") : "All clear";
      todoTag.className = "tag " + worst;
      clear(healthCard.body); add(healthCard.body, s.stream_status ? healthChips(s) : empty("No picture yet"));
      healthCard.body.style.padding = "0";
      clear(actCard.body); add(actCard.body, timeline(s.events, 6)); actCard.body.style.padding = "0";
    }
    async function paintToday() {
      var r = await api("/console/api/report?" + q({ camera_id: S.cam }));
      var days = r.cars_per_day, cars = days.length ? days[days.length - 1].cars : 0;
      clear(minis);
      add(minis,
        mini("Cars parked", cars, "bays turning occupied"),
        mini("Average stay", r.dwell.n ? dur(r.dwell.avg_s) : "–", r.dwell.n ? r.dwell.n + (r.dwell.n === 1 ? " full stay" : " full stays") : "no full stay yet"),
        mini("Busiest", r.peak ? r.peak.label.slice(11, 16) : "–", r.peak ? pct(r.peak.occupancy_pct) + " occupied" : "no data yet"),
        mini("Camera seen", pct(r.coverage * 100), "of today so far"));
      clear(chartBox);
      add(chartBox, r.coverage === 0 ? empty("No readings yet today.") : lineChart(r.occupancy));
      if (r.coverage > 0 && r.coverage < 0.5) add(chartBox, note("The camera was seen for only " + pct(r.coverage * 100) + " of today so far; gaps are drawn as gaps, not as empty bays.", "warn"));
    }
    var stop1 = poller(async function () { S.state = await api("/live/state?" + q({ camera_id: S.cam })); paintState(S.state); }, 3000);
    var stop2 = poller(paintToday, 60000);
    return function () { stop1(); stop2(); };
  } };

  P.live = { title: "Live Operations", render: function (view) {
    var img = el("img"); img.alt = "Live view of the lot";
    var wrap = el("div", "cam"); wrap.appendChild(img);
    var shade = el("div", "shade"); shade.hidden = true; wrap.appendChild(shade);
    // full screen: the picture fills the screen with the counts along the top, for a guard room or a wall display
    var fsbar = el("div", "fsbar"); wrap.appendChild(fsbar);
    function toggleFs() {
      if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); return; }
      if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () {});
    }
    var fsBtn = el("button", "fsbtn"); fsBtn.type = "button"; fsBtn.title = "Full screen (F)"; fsBtn.setAttribute("aria-label", "Full screen");
    fsBtn.appendChild(icon("M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5")); fsBtn.onclick = toggleFs;
    wrap.appendChild(fsBtn);
    img.ondblclick = toggleFs;
    function onKey(e) {
      if ((e.key === "f" || e.key === "F") && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "")) toggleFs();
    }
    document.addEventListener("keydown", onKey);
    function onFsChange() { fsBtn.title = document.fullscreenElement ? "Exit full screen (F or Esc)" : "Full screen (F)"; }
    document.addEventListener("fullscreenchange", onFsChange);
    var camCard = card("Live camera", btn("⛶  Full screen", "", toggleFs));
    camCard.removeChild(camCard.body);
    var health = el("div"); add(camCard, wrap, health);
    var actCard = card("Activity timeline"); actCard.body.style.padding = "0";
    var tiles = el("div", "tiles t4"), gateCard = card("Gate tripwire counter"), zone = card("Parking zone"), detail = card("Selected bay");
    var bays = el("div", "bays"), legend = el("div", "legend");
    add(zone.body, bays, legend);
    var grid = el("div", "grid g2"), left = el("div", "grid"), right = el("div", "grid");
    add(left, camCard, actCard); add(right, tiles, gateCard, zone, detail); add(grid, left, right);
    add(view, grid);
    var askedBay = /(?:\?|&)bay=([^&]*)/.exec(location.hash);
    var selected = askedBay ? decodeURIComponent(askedBay[1]) : null, seq = -1;

    // Which car is in which bay: the plate of the car that stopped there, written on the picture over the car, on the bay's tile and
    // in the bay's details.  Only operators get these (the public picture and /live/state carry no plates).
    var plateByBay = {}, plateLayer = el("div", "plates"); wrap.appendChild(plateLayer);
    function paintPlates() {
      clear(plateLayer);
      var cw = wrap.clientWidth, ch = wrap.clientHeight;
      if (!cw || !ch) return;
      Object.keys(plateByBay).forEach(function (bay) {
        var a = plateByBay[bay];
        if (!a.box || !a.frame_size) return;
        var fw = a.frame_size[0], fh = a.frame_size[1], sc = Math.min(cw / fw, ch / fh);
        var offx = (cw - fw * sc) / 2, offy = (ch - fh * sc) / 2;
        var t = el("div", "plate-tag" + (a.confirmed ? "" : " guess"), a.text || (a.guess + " ?"));
        t.style.left = (offx + (a.box[0] + a.box[2]) / 2 * sc) + "px"; t.style.top = (offy + (a.box[1] + a.box[3]) / 2 * sc) + "px";
        t.title = bayLabel(bay) + (a.confirmed ? " · plate confirmed" : " · one read so far, still checking");
        plateLayer.appendChild(t);
      });
    }
    var stopPlates = poller(async function () {
      var r = await api("/console/api/arrivals?" + q({ camera_id: S.cam, limit: 40 }));
      var m = {};
      r.arrivals.forEach(function (a) { if (!a.left && (a.text || a.guess) && !m[a.bay]) m[a.bay] = a; });       // newest first: the car in each bay now
      plateByBay = m; paintPlates();
      if (S.state) paint(S.state);
    }, 5000);
    // the labels follow the picture: a window resize, fullscreen, a collapsed sidebar (the picture's box changes, the window's does
    // not) and the first picture arriving (before it the box has no height and nothing was placed until the next 5 s poll)
    var plateTimer = null;
    function onPlateFs() { clearTimeout(plateTimer); plateTimer = setTimeout(paintPlates, 150); }
    var plateRO = window.ResizeObserver ? new ResizeObserver(paintPlates) : null;
    window.addEventListener("resize", paintPlates);
    document.addEventListener("fullscreenchange", onPlateFs);
    if (plateRO) plateRO.observe(wrap);
    img.addEventListener("load", paintPlates);

    function overrideButtons(slot) {
      var wrapB = el("div", "bar"), mins = el("select", "fld");
      [5, 15, 30, 60].forEach(function (m) { var o = el("option", "", m + " min"); o.value = m; if (m === 15) o.selected = true; mins.appendChild(o); });
      function send(status) {
        post("/live/bay-override", { camera_id: S.cam, bay_id: slot.id, status: status, minutes: +mins.value })
          .then(function () { return api("/live/state?" + q({ camera_id: S.cam })); })
          .then(function (s) { S.state = s; detailSig = null; paint(s); })
          .catch(function (e) { wrapB.appendChild(el("small", "muted", "Could not save: " + e.message)); });
      }
      add(wrapB, btn("Mark available", "", function () { send("VACANT"); }), btn("Mark occupied", "", function () { send("OCCUPIED"); }), mins,
        (function () { var c = btn("Clear", "", function () { send("CLEAR"); }); c.disabled = slot.flag !== "operator"; return c; })());
      return wrapB;
    }
    // The panel is rebuilt only when what it shows changed, and never under someone who is typing in it: it used to be rebuilt on
    // every poll (1.5 s), which emptied a plate being typed, put the "5/15/30/60 min" box back to 15 and dropped keyboard focus.
    var detailSig = null, sinceEl = null;
    function sinceText(slot) { return clockOf(Date.parse(slot.since) / 1000) + (slot.held_s !== null && slot.held_s !== undefined ? " · " + dur(slot.held_s) : ""); }
    function paintDetail(s, force) {
      var slot = (s.slots || []).filter(function (x) { return x.id === selected; })[0];
      var pa0 = slot && slot.status === "OCCUPIED" ? plateByBay[slot.id] : null;
      var sig = JSON.stringify([selected, slot ? Object.assign({}, slot, { held_s: null }) : null,
        pa0 ? [pa0.id, pa0.text, pa0.guess, pa0.confirmed, pa0.source, pa0.left] : null]);
      if (!force && sig === detailSig) { if (sinceEl && slot && slot.since) sinceEl.textContent = sinceText(slot); return; }   // only the clock moves
      var ae = document.activeElement;
      if (!force && detailSig !== null && ae && detail.body.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;   // typing: later
      detailSig = sig; sinceEl = null;
      clear(detail.body);
      if (!slot) { add(detail.body, empty("Tap a bay to see its details.")); return; }
      var v = bayView(slot), dl = el("dl", "kv");
      function row(k, val) { var dd0 = el("dd", "", val); add(dl, el("dt", "", k), dd0); return dd0; }
      row("Bay", bayLabel(slot.id)); row("Status", v.word);
      if (slot.since) sinceEl = row("Since", sinceText(slot));
      row("Why", slot.reason_text || "–");
      var p = slot.parking;
      if (p && p.verdict && p.verdict !== "not_judged") {
        if (p.clearance) row("Clearance", ["left", "right"].filter(function (k) { return p.clearance[k] !== undefined && p.clearance[k] !== null; })
          .map(function (k) { return (+p.clearance[k]).toFixed(2) + " m to the " + k + " line"; }).join(", ") || "–");
        if (p.crossing_m) row("Over by", (+p.crossing_m).toFixed(2) + " m (" + (p.side || "") + ")");
      }
      var pa = plateByBay[slot.id];
      if (slot.status !== "OCCUPIED") row("Plate", "–");
      else if (pa) { var dd = el("dd"); dd.appendChild(plateEditor(pa, function () { api("/console/api/arrivals?" + q({ camera_id: S.cam, limit: 40 })).then(function (r) {
        var m = {}; r.arrivals.forEach(function (a) { if (!a.left && (a.text || a.guess) && !m[a.bay]) m[a.bay] = a; }); plateByBay = m; paintPlates(); detailSig = null; paint(S.state); }); }));
        add(dl, el("dt", "", "Plate"), dd); }
      else row("Plate", "not read yet");
      add(detail.body, dl, el("div", "", ""), overrideButtons(slot));
    }
    function paint(s) {
      var sm = s.slot_summary || {}, total = sm.total || 0;
      clear(tiles);
      add(tiles, tile("", "layers", "Total bays", total), tile("blue", "car", "Occupied", sm.occupied_confirmed || 0, total ? pct((sm.occupied_confirmed || 0) / total * 100) : ""),
        tile("green", "park", "Available", sm.vacant || 0, total ? pct((sm.vacant || 0) / total * 100) : ""), tile("amber", "help", "Unclear", (sm.uncertain || 0) + (sm.stale || 0)));
      clear(health); add(health, healthChips(s));
      clear(actCard.body); add(actCard.body, timeline(s.events, 12));
      var c = s.counts;
      clear(gateCard.body);
      if (c) add(gateCard.body, (function () { var t = el("div", "tiles t3"); add(t, tile("green", "check", "In", c.in), tile("red", "check", "Out", c.out), tile("", "car", "Inside", c.inside)); return t; })());
      else add(gateCard.body, empty("No entry line is set for this camera."));
      var focused = document.activeElement && document.activeElement.parentNode === bays ? document.activeElement.getAttribute("data-bay") : null;   // keyboard focus survives the repaint
      clear(bays);
      (s.slots || []).forEach(function (slot) {
        var v = bayView(slot), b = el("div", "bay " + v.cls + (slot.id === selected ? " sel" : ""));
        b.tabIndex = 0; b.setAttribute("role", "button"); b.setAttribute("data-bay", slot.id);
        b.setAttribute("aria-label", bayLabel(slot.id) + ": " + v.word);
        add(b, el("b", "", bayLabel(slot.id)), icon(ICON.car), el("small", "", v.word));
        var pt = slot.status === "OCCUPIED" ? plateByBay[slot.id] : null;
        if (pt) { var pe = el("small", "plate" + (pt.confirmed ? "" : " guess"), pt.text || (pt.guess + " ?")); pe.title = pt.confirmed ? "plate confirmed" : "not sure yet: open the bay to check it"; b.appendChild(pe); }
        b.onclick = b.onkeydown = function (e) { if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return; if (e.type === "keydown") e.preventDefault(); selected = slot.id; paint(S.state); };
        bays.appendChild(b);
        if (focused === slot.id) b.focus();
      });
      if (!(s.slots || []).length) bays.appendChild(empty("No bays are drawn for this camera yet. Use Bay layout."));
      clear(legend);
      [["var(--green)", "Available"], ["var(--blue)", "Occupied"], ["var(--red)", "Over the line"], ["var(--amber)", "Close to line / unclear"], ["var(--grey)", "No signal"]].forEach(function (l) {
        var i = el("span"); var d = el("span", "dot"); d.style.background = l[0]; add(i, d, l[1]); legend.appendChild(i);
      });
      paintDetail(s);
      var none = s.stream_status === "not_started" || !s.frames_received;
      shade.hidden = !(none || s.stream_status === "offline");
      shade.hidden = !(none || s.stream_status === "offline" || s.frozen);
      shade.textContent = none ? "Waiting for the first picture from the phone."
        : s.frozen ? "The phone's camera is frozen: it keeps sending the same picture. Reload the phone's camera page. Showing the last real picture."
        : "The camera is offline. Showing the last picture.";
      if (s.frame_seq !== seq && !none) { seq = s.frame_seq; img.src = "/live/frame.jpg?" + q({ camera_id: S.cam, seq: seq }); }
      clear(fsbar);
      var st = streamView(s);
      function fs(cls, label, value) { var d = el("span", "fs " + cls); add(d, label, el("b", "", value)); return d; }
      add(fsbar, fs("", (S.site && S.site.site_name) || "ParkFNB", ""), fs("", camName(S.cam), ""),
        fs("b", "Occupied", sm.occupied_confirmed || 0), fs("g", "Available", sm.vacant || 0),
        fs("a", "Unclear", (sm.uncertain || 0) + (sm.stale || 0)), el("span", "grow"),
        fs(st[1] === "ok" ? "g" : "r", st[0], ""), fs("", new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), ""));
    }
    var stop = poller(async function () { S.state = await api("/live/state?" + q({ camera_id: S.cam })); paint(S.state); }, 1500);
    return function () {
      stop(); stopPlates();
      window.removeEventListener("resize", paintPlates);
      document.removeEventListener("fullscreenchange", onPlateFs); clearTimeout(plateTimer); if (plateRO) plateRO.disconnect();
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    };
  } };

  P.lots = { title: "Parking Lots", render: function (view) {
    var c = card("Sites and cameras"), body = c.body; body.style.padding = "0";
    add(view, c);
    var sc = el("div", "scroll"); body.appendChild(sc);
    return poller(async function () {
      await refreshShell();
      clear(sc);
      if (!S.cameras.length) { sc.appendChild(empty("No cameras yet. Open the phone camera page to start one.")); return; }
      var t = el("table", "tbl"), h = el("tr");
      ["Camera", "Zone", "Bays", "Occupied", "Available", "Status", "Picture"].forEach(function (x) { h.appendChild(el("th", "", x)); });
      var th = el("thead"); th.appendChild(h); t.appendChild(th);
      var tb = el("tbody");
      S.cameras.forEach(function (cam) {
        var sm = cam.slot_summary || {}, st = streamView(cam);
        var siteCam = ((S.site && S.site.cameras) || []).filter(function (x) { return x.id === cam.id; })[0] || {};
        var tr = el("tr", "click");
        add(tr, el("td", "", camName(cam.id)), el("td", "", siteCam.zone || "–"), el("td", "num", cam.bays),
          el("td", "num", sm.occupied_confirmed === undefined ? "–" : sm.occupied_confirmed), el("td", "num", sm.vacant === undefined ? "–" : sm.vacant));
        var s = el("td"); s.appendChild(tag(st[0], st[1] === "ok" ? "green" : st[1] === "bad" ? "red" : "amber")); tr.appendChild(s);
        tr.appendChild(el("td", "", cam.frame_age_s === null || cam.frame_age_s === undefined ? "–" : cam.frame_age_s + " s ago"));
        tr.onclick = function () { S.cam = cam.id; try { localStorage.setItem("pf.cam", cam.id); } catch (e) { /* none */ } location.hash = "#/live"; };
        tb.appendChild(tr);
      });
      t.appendChild(tb); sc.appendChild(t);
    }, 5000);
  } };

  P.vehicles = { title: "Vehicles / ANPR", render: function (view) {
    var plates = card("Number plates");
    add(plates.body, note("Each car that parks gets a full-resolution photo; its plate is found, read by a small model, and checked against the Indian plate format. " +
      "A number is shown as confirmed only when two photos agree (or one is read with very high certainty); anything that is not a valid plate is dropped, never guessed. " +
      "It works when the plate is about 20 px tall or more in the photo (about 100 px wide); from a far or very slanted view the plate stays unread.", "ok"));
    var hqRow = el("div", "bar"); hqRow.style.marginTop = "12px";
    var hqInfo = el("span", "muted", "Full-resolution photo: checking…");
    var hqBtn = btn("Take a full-resolution photo now", "", function () {
      hqBtn.disabled = true;
      post("/console/api/still-request?" + q({ camera_id: S.cam })).then(function () { hqInfo.textContent = "Asked the phone; it sends it on its next picture."; })
        .catch(function (e) { hqInfo.textContent = "Could not ask: " + e.message; }).then(function () { setTimeout(function () { hqBtn.disabled = false; }, 20000); });
    });
    var hqOpen = el("a", "btn", "Open the latest photo"); hqOpen.target = "_blank"; hqOpen.rel = "noopener";
    hqOpen.href = "/console/api/still.jpg?" + q({ camera_id: S.cam });
    add(hqRow, hqBtn, hqOpen, hqInfo); plates.body.appendChild(hqRow);

    // The trial: cut the lot's area out of the latest full-resolution photo and measure every plate in it.  It reads
    // nothing; it answers "is this camera ever going to be able to read a plate?" with numbers.
    var trial = card("Can this camera read plates? Measure on the latest photo");
    var trialOut = el("div"), trialInfo = el("span", "muted", "Measures the plates in the lot's area, at the photo's own resolution (takes a few seconds).");
    var trialBtn = btn("Measure plates now", "primary", function () {
      trialBtn.disabled = true; clear(trialOut); trialInfo.textContent = "Measuring… this can take up to a minute.";
      post("/console/api/plate-trial?" + q({ camera_id: S.cam })).then(function (r) {
        trialInfo.textContent = "Photo " + r.still.w + "×" + r.still.h + " (" + dur(r.still.age_s) + " old); looked at the lot's area, " + r.crop.w + "×" + r.crop.h +
          " px, in " + (r.ms / 1000).toFixed(1) + " s. Found " + r.vehicles + " vehicle(s) and " + r.plates.length + " plate(s); " + r.readable + " big enough to read.";
        if (!r.plates.length) {
          trialOut.appendChild(note("No plate found at all, even at a low confidence. From this camera position the plates are too small or not facing the camera. " +
            "The way to a readable plate is a camera 2 to 4 m from where cars stop, or this camera's main (not ultra-wide) lens.", "warn"));
          return;
        }
        var t = el("table", "tbl"), th = el("thead"), h = el("tr");
        ["Plate", "Size in the photo", "Letters are about", "Enough to read?"].forEach(function (x) { h.appendChild(el("th", "", x)); });
        th.appendChild(h); t.appendChild(th);
        var tb = el("tbody");
        r.plates.forEach(function (p) {
          var tr = el("tr"), im = el("img"), c0 = el("td"), v = el("td");
          im.alt = "A plate cut from the photo"; im.style.cssText = "height:44px;max-width:180px;object-fit:contain;border-radius:6px;background:#000;display:block";
          im.src = "/console/api/plate-trial/" + encodeURIComponent(p.file) + ".jpg?" + q({ camera_id: S.cam }); c0.appendChild(im);
          v.appendChild(tag(p.verdict === "readable" ? "Yes" : p.verdict === "marginal" ? "Borderline" : "Too small", p.verdict === "readable" ? "green" : p.verdict === "marginal" ? "amber" : "red"));
          add(tr, c0, el("td", "num", p.width_px + " × " + p.height_px + " px"), el("td", "num", p.char_px + " px high (needs about 20)"), v);
          tb.appendChild(tr);
        });
        t.appendChild(tb); var sc2 = el("div", "scroll"); sc2.appendChild(t); trialOut.appendChild(sc2);
      }).catch(function (e) { trialInfo.textContent = "Could not measure: " + e.message; })
        .then(function () { trialBtn.disabled = false; });
    });
    var tbar = el("div", "bar"); add(tbar, trialBtn, trialInfo); trial.body.appendChild(tbar); trial.body.appendChild(trialOut);
    trialOut.style.marginTop = "12px";
    // Each car that parks gets a full-resolution photo taken as it stopped, cut around the car, with its plate measured.
    // The phone is the same wide camera, so the plate is often too small for a machine, but the photo is there to read by eye.
    var plateByBay = {};
    var arr = card("Arrivals: a sharp photo of each car as it parked, and its number plate"); arr.body.style.padding = "0";
    var asc = el("div", "scroll"); arr.body.appendChild(asc);
    // How accurate is it?  Measured from what the operators did, not from our own opinion of the system: a plate someone typed is a
    // test sample, a violation someone resolved was real and one they dismissed was a false alarm.
    var acc = card("How accurate is it? Measured from your corrections");
    var accBody = el("div", "grid"); acc.body.appendChild(accBody);
    function range(lo, hi) { return lo === null || lo === undefined ? "" : " (95% sure it is between " + lo + "% and " + hi + "%)"; }
    var stopAcc = poller(async function () {
      var a = await api("/console/api/accuracy?" + q({ camera_id: S.cam }));
      clear(accBody);
      var p = a.plates, v = a.violations, b = a.bays || {}, rows = el("dl", "kv");
      function row(k, val) { add(rows, el("dt", "", k), el("dd", "", val)); }
      row("Number plates", p.checked
        ? p.exact + " of " + p.checked + " right without help = " + p.exact_pct + "%" + range(p.ci_low_pct, p.ci_high_pct) + ". Letters right: " + p.char_pct + "%. " +
          (p.confirmed_wrong ? p.confirmed_wrong + " plate(s) the system had CONFIRMED were wrong. " : "Nothing it confirmed was wrong. ") + (p.no_answer ? p.no_answer + " it could not read." : "")
        : "No plate has been corrected yet. When you confirm or fix a plate (Live Operations, click the bay) it becomes a test sample.");
      row("Plates read on its own", p.read_by_machine + " (" + p.confirmed_by_machine + " confirmed)");
      row("Violations", v.reviewed
        ? v.real + " real, " + v.false_alarms + " false alarms among " + v.reviewed + " you reviewed: " + v.precision_pct + "% were real" + range(v.ci_low_pct, v.ci_high_pct) + ". " + v.open + " still waiting for you."
        : v.open + " waiting for you. Press Resolve (it was real) or Dismiss (false alarm) on each: that is how we learn how often it is wrong.");
      row("Bays today", b.error ? "–" : (b.flickers_today || 0) + " times a bay flipped for under 3 minutes (the camera losing a car); you overruled a bay " + (b.operator_overrides_today || 0) + " times.");
      accBody.appendChild(rows);
      if ((p.checked || 0) < 30) accBody.appendChild(note("Too few checked plates to quote an accuracy yet: " + (p.checked || 0) + " of the 30 needed for a rough figure, 200 for a firm one. " +
        "Each plate you confirm or fix on Live Operations counts.", "warn"));
    }, 20000);

    // Who has been here: one row per number plate, a car seen again later (or straddling two bays) is one vehicle.
    var reg = card("Vehicles seen, by number plate"); reg.body.style.padding = "0";
    var rsc = el("div", "scroll"); reg.body.appendChild(rsc);
    var stop4 = poller(async function () {
      var r = await api("/console/api/vehicles?" + q({ camera_id: S.cam }));
      clear(rsc);
      if (!r.vehicles.length) { rsc.appendChild(empty("No plate has been read yet. A car that parks gets its plate read from its photo.")); return; }
      var t = el("table", "tbl"), th = el("thead"), h = el("tr");
      ["Plate", "Visits", "First seen", "Last seen", "Time here", "Bays", "Now"].forEach(function (x) { h.appendChild(el("th", "", x)); });
      th.appendChild(h); t.appendChild(th);
      var tb = el("tbody");
      r.vehicles.forEach(function (v) {
        var tr = el("tr"), pc = el("td"), nowc = el("td");
        var pn = el("b", "", v.plate); pn.style.cssText = "letter-spacing:.06em;margin-right:6px"; pc.appendChild(pn);
        if (v.by_person) pc.appendChild(tag("set by a person", "blue"));
        else if (!v.confirmed) pc.appendChild(tag("unconfirmed", "amber"));
        nowc.appendChild(v.inside ? tag("inside · " + bayLabel(v.last_bay), "green") : tag("left", ""));
        add(tr, pc, el("td", "num", v.visits), el("td", "", dateTimeOf(v.first_seen)), el("td", "", v.inside ? "now" : dateTimeOf(v.last_seen)),
          el("td", "num", dur(v.total_s)), el("td", "", v.bays.map(bayLabel).join(", ")), nowc);
        tb.appendChild(tr);
      });
      t.appendChild(tb); rsc.appendChild(t);
    }, 8000);
    var list = card("Cars in the lot now"); list.body.style.padding = "0";
    add(view, plates, acc, reg, trial, arr, list);
    var sc = el("div", "scroll"); list.body.appendChild(sc);
    var stop3 = poller(async function () {
      var r = await api("/console/api/arrivals?" + q({ camera_id: S.cam, limit: 30 }));
      plateByBay = {};
      r.arrivals.forEach(function (a) { if (!a.left && a.text && !plateByBay[a.bay]) plateByBay[a.bay] = a; });   // the car in each bay now
      // a plate being typed is not rebuilt out from under the person (the table repainted every 6 s and dropped the editor)
      if (asc.querySelector(".pl-edit input:focus") || (asc.querySelector(".pl-edit input") && asc.querySelector(".pl-edit input").value)) return;
      clear(asc);
      if (!r.enabled) { asc.appendChild(empty("Arrival photos are switched off on the server.")); return; }
      if (!r.arrivals.length) { asc.appendChild(empty("No car has parked since this was switched on. The next one gets a photo.")); return; }
      var t = el("table", "tbl"), th = el("thead"), h = el("tr");
      ["Arrived", "Bay", "Car", "Plate", "Plate size", "Read as", "Left"].forEach(function (x) { h.appendChild(el("th", "", x)); });
      th.appendChild(h); t.appendChild(th);
      var tb = el("tbody");
      r.arrivals.forEach(function (a) {
        var tr = el("tr"), car = el("td"), pl = el("td"), size = "–";
        function pic(kind) {
          var link = el("a"), im = el("img");
          link.href = "/console/api/arrival/" + encodeURIComponent(a.id) + ".jpg?" + q({ camera_id: S.cam, kind: kind }); link.target = "_blank"; link.rel = "noopener";
          im.alt = kind === "car" ? "The car as it parked" : "The plate cut from the photo"; im.loading = "lazy";
          im.style.cssText = "height:" + (kind === "car" ? 56 : 40) + "px;max-width:" + (kind === "car" ? 120 : 150) + "px;object-fit:contain;border-radius:6px;background:#000;display:block";
          im.src = link.href; link.appendChild(im); return link;
        }
        if (a.car_photo) car.appendChild(pic("car"));
        else car.appendChild(tag(a.plate_state === "pending" ? "waiting for the photo" : "no photo", "amber"));
        if (a.plate_state === "found" && a.plate) {
          if (a.plate_photo) pl.appendChild(pic("plate"));
          pl.appendChild(tag({ readable: "Big enough", marginal: "Borderline", unclear_photo: "Dark or blurred" }[a.plate.verdict] || "Too small",
            a.plate.verdict === "readable" ? "green" : a.plate.verdict === "marginal" || a.plate.verdict === "unclear_photo" ? "amber" : "red"));
          size = a.plate.width_px + " × " + a.plate.height_px + " px (letters ~" + a.plate.char_px + ")";
        } else if (a.plate_state !== "pending") {
          pl.appendChild(tag({ none_found: "no plate found", error: "could not check" }[a.plate_state] || a.plate_state, a.plate_state === "none_found" ? "amber" : "red"));
        }
        var rd = el("td", "num");
        if (a.text || a.guess) {
          var strong = el("b", "", a.text || (a.guess + " ?")); strong.style.cssText = "letter-spacing:.06em;font-variant-numeric:tabular-nums";
          rd.appendChild(strong); rd.appendChild(document.createElement("br"));
          rd.appendChild(tag(a.source === "operator" ? "set by a person" : a.confirmed ? "confirmed (" + (a.reads || []).length + " reads)" : a.text ? "one read, checking" : "a guess", a.confirmed ? "green" : "amber"));
        } else rd.textContent = "–";
        if (a.plate_photo) {
          var ed = btn(a.text || a.guess ? "Edit" : "Enter", "", function () { clear(rd); rd.appendChild(plateEditor(a, function () { var i = rd.querySelector("input"); if (i) i.value = ""; })); });   // saved: the next refresh shows it
          ed.style.cssText = "margin-top:6px;padding:4px 10px;min-height:0"; rd.appendChild(document.createElement("br")); rd.appendChild(ed);
        }
        add(tr, el("td", "", dateTimeOf(a.arrived) + (a.initial ? " (first seen)" : "")), el("td", "", bayLabel(a.bay)), car, pl, el("td", "num", size), rd, el("td", "", a.left ? dateTimeOf(a.left) : "still there"));
        tb.appendChild(tr);
      });
      t.appendChild(tb); asc.appendChild(t);
    }, 6000);
    var stop1 = poller(async function () {
      var s = await api("/live/state?" + q({ camera_id: S.cam })); S.state = s;
      clear(sc);
      var cars = (s.slots || []).filter(function (x) { return x.status === "OCCUPIED"; });
      if (!cars.length) { sc.appendChild(empty("No parked cars in view.")); return; }
      var t = el("table", "tbl"), th = el("thead"), h = el("tr");
      ["Bay", "Since", "Parked for", "Parking", "Plate"].forEach(function (x) { h.appendChild(el("th", "", x)); });
      th.appendChild(h); t.appendChild(th);
      var tb = el("tbody");
      cars.forEach(function (x) {
        var v = bayView(x), tr = el("tr");
        add(tr, el("td", "", bayLabel(x.id)), el("td", "", x.since ? clockOf(Date.parse(x.since) / 1000) : "–"), el("td", "num", dur(x.held_s)));
        var pk = el("td"); pk.appendChild(tag(v.word, v.tag)); if (x.parking && x.parking.verdict === "not_judged") pk.appendChild(tag("not judged", ""));
        tr.appendChild(pk);
        var pl = el("td"), known = plateByBay[x.id];
        if (known) {
          var pn = el("b", "", known.text); pn.style.cssText = "letter-spacing:.06em;margin-right:6px";
          pl.appendChild(pn); pl.appendChild(tag(known.confirmed ? "confirmed" : "checking", known.confirmed ? "green" : "amber"));
        } else pl.appendChild(tag("not read yet", ""));
        tr.appendChild(pl);
        tb.appendChild(tr);
      });
      t.appendChild(tb); sc.appendChild(t);
    }, 3000);
    var stop2 = poller(async function () {
      var m = await api("/console/api/still-meta?" + q({ camera_id: S.cam }));
      hqInfo.textContent = m.still ? "Latest: " + m.still.w + "×" + m.still.h + ", " + dur(m.still.age_s) + " ago" + (m.every_s ? " (one about every " + Math.round(m.every_s / 60) + " min)" : "")
                                   : "No photo yet. The phone sends one while its camera page is open.";
    }, 10000);
    return function () { stop1(); stop2(); stop3(); stop4(); stopAcc(); };
  } };

  P.devices = { title: "Devices", render: function (view) {
    var c = card("Cameras"); c.body.style.padding = "0";
    var sc = el("div", "scroll"); c.body.appendChild(sc);
    var barrier = card("Barriers and locks");
    add(barrier.body, note("Gate barriers and smart locks are controlled through the booking backend, which this console does not touch yet. They will appear here when it is connected."));
    var health = card("Bay health: is every bay drawn where the camera can judge it?"); health.body.style.padding = "0";
    var hsc = el("div", "scroll"); health.body.appendChild(hsc);
    var sizes = card("Stall sizes: the metres every distance is measured in");
    add(view, c, health, sizes, barrier);

    // The system assumes every stall is 2.5 × 5.0 m.  If the real ones are smaller or bigger, every "over the line by X m" is off by
    // the same share.  Measure a few with a tape and say so here; the bays stay where they are drawn.
    async function paintSizes() {
      var r;
      try { r = await api("/console/api/bay-sizes?" + q({ camera_id: S.cam })); }
      catch (e) { clear(sizes.body); add(sizes.body, empty("No bays are drawn for this camera yet.")); return; }
      clear(sizes.body);
      add(sizes.body, note("With a tape: the width between the two painted side lines, and the length from the road-side line to the back line. " +
        "Leave a bay empty to use " + r.default[0] + " × " + r.default[1] + " m. Only the metres change; the bays stay where they are drawn.", "info"));
      var t = el("table", "tbl"), th = el("thead"), h = el("tr"), inputs = {};
      ["Bay", "Width (m)", "Length (m)", "Now"].forEach(function (x) { h.appendChild(el("th", "", x)); });
      th.appendChild(h); t.appendChild(th);
      var tb = el("tbody");
      Object.keys(r.bays).forEach(function (id) {
        var b = r.bays[id], tr = el("tr"), wI = el("input", "fld"), lI = el("input", "fld");
        [wI, lI].forEach(function (i) { i.type = "number"; i.step = "0.05"; i.style.width = "90px"; });
        wI.min = r.ranges.width_m[0]; wI.max = r.ranges.width_m[1]; lI.min = r.ranges.length_m[0]; lI.max = r.ranges.length_m[1];
        wI.placeholder = String(r.default[0]); lI.placeholder = String(r.default[1]);
        wI.setAttribute("aria-label", bayLabel(id) + " width in metres"); lI.setAttribute("aria-label", bayLabel(id) + " length in metres");
        if (b.measured) { wI.value = b.width_m; lI.value = b.length_m; }
        inputs[id] = [wI, lI, b.measured];
        var w1 = el("td"), l1 = el("td"), st1 = el("td");
        w1.appendChild(wI); l1.appendChild(lI); st1.appendChild(tag(b.measured ? "measured" : "default", b.measured ? "green" : ""));
        add(tr, el("td", "", bayLabel(id)), w1, l1, st1); tb.appendChild(tr);
      });
      t.appendChild(tb); var sc2 = el("div", "scroll"); sc2.appendChild(t); sizes.body.appendChild(sc2);
      var msg = el("small", "muted", ""), save = btn("Save the sizes", "primary", function () {
        var out = {}, bad = null;
        Object.keys(inputs).forEach(function (id) {
          var w = inputs[id][0].value.trim(), l = inputs[id][1].value.trim();
          if (!w && !l) { if (inputs[id][2]) out[id] = null; return; }                 // emptied: back to the default
          if (!w || !l) { bad = bayLabel(id) + ": give both the width and the length, or leave both empty."; return; }
          out[id] = [parseFloat(w), parseFloat(l)];
        });
        if (bad) { msg.textContent = bad; return; }
        save.disabled = true; msg.textContent = "Saving…";
        post("/console/api/bay-sizes?" + q({ camera_id: S.cam }), { sizes: out })
          .then(function () { msg.textContent = "Saved. The camera is fitted again with these sizes; verdicts follow within a minute."; return paintSizes(); })
          .catch(function (e) { msg.textContent = e.message; })
          .then(function () { save.disabled = false; });
      });
      var bar = el("div", "bar"); add(bar, save, msg); sizes.body.appendChild(bar);
    }
    paintSizes();

    // A bay that is drawn wrongly, is too far from the camera, or is hidden by other cars shows up here as a poor 3D fit
    // or as a bay that keeps changing between occupied and free.  This is the check to run after moving the camera or
    // re-marking a layout, and for every new site.
    async function paintHealth() {
      var cam = S.cameras.filter(function (x) { return x.id === S.cam; })[0] || {};
      var bays = (cam.site_calibration && cam.site_calibration.bays) || {};
      var rep = await api("/console/api/report?" + q({ camera_id: S.cam }));
      var flick = rep.dwell.flickers_by_bay || {}, minMin = Math.round(rep.dwell.min_stay_s / 60);
      clear(hsc);
      var ids = Object.keys(bays);
      if (!ids.length) { hsc.appendChild(empty(cam.site_calibration ? "No bays are drawn." : "No picture has been analysed yet.")); return; }
      var t = el("table", "tbl"), th = el("thead"), h = el("tr");
      ["Bay", "3D fit", "Error", "Flickers today", "Verdict", "What to do"].forEach(function (x) { h.appendChild(el("th", "", x)); });
      th.appendChild(h); t.appendChild(th);
      var tb = el("tbody");
      ids.forEach(function (id) {
        var b = bays[id], f = flick[bayLabel(id)] || 0, bad = b.status === "rejected" || f >= 6, watch = b.status === "degraded" || f >= 2;
        var tr = el("tr"), fit = el("td"), ver = el("td"), why = [];
        fit.appendChild(tag(b.status === "good" ? "Good" : b.status === "degraded" ? "Rough" : "Rejected", b.status === "good" ? "green" : b.status === "degraded" ? "amber" : "red"));
        ver.appendChild(tag(bad ? "Check layout" : watch ? "Watch" : "OK", bad ? "red" : watch ? "amber" : "green"));
        if (b.status === "rejected") why.push("The painted shape does not fit one 2.5 × 5 m stall: re-mark its corners on the full-resolution photo.");
        else if (b.status === "degraded") why.push("Far from the camera: parking is only judged for clear cases.");
        if (f >= 6) why.push("It keeps losing and finding its car (" + f + " times under " + minMin + " min): another car may hide it, or the bay is drawn off the car.");
        else if (f >= 2) why.push("A few short flickers: keep an eye on it.");
        add(tr, el("td", "", bayLabel(id)), fit, el("td", "num", b.reproj_px === null || b.reproj_px === undefined ? "–" : b.reproj_px + " px" + (b.margin_m ? " · ±" + b.margin_m + " m" : "")),
          el("td", "num", f), ver, el("td", "", why.join(" ") || "Nothing to do."));
        tb.appendChild(tr);
      });
      t.appendChild(tb); hsc.appendChild(t);
    }
    var stopHealth = poller(paintHealth, 30000);
    var stopCams = poller(async function () {
      await refreshShell();
      clear(sc);
      var t = el("table", "tbl"), th = el("thead"), h = el("tr");
      ["Camera", "Stream", "Speed", "Last picture", "Light", "View", "3D parking", "Full-res photo", ""].forEach(function (x) { h.appendChild(el("th", "", x)); });
      th.appendChild(h); t.appendChild(th);
      var tb = el("tbody");
      S.cameras.forEach(function (cam) {
        var st = streamView(cam), sc3 = cam.site_calibration, tr = el("tr");
        add(tr, el("td", "", camName(cam.id)));
        var s = el("td"); s.appendChild(tag(st[0], st[1] === "ok" ? "green" : st[1] === "bad" ? "red" : "amber")); tr.appendChild(s);
        add(tr, el("td", "num", cam.fps === null || cam.fps === undefined ? "–" : cam.fps.toFixed(1) + " fps"),
          el("td", "", cam.frame_age_s === null || cam.frame_age_s === undefined ? "–" : cam.frame_age_s + " s ago"));
        var l = el("td"); l.appendChild(tag(cam.light === "low" ? "Low" : "OK", cam.light === "low" ? "amber" : "green")); tr.appendChild(l);
        var v = el("td"); v.appendChild(tag(cam.calibration === "moved" ? "Moved" : "In place", cam.calibration === "moved" ? "amber" : "green")); tr.appendChild(v);
        var d = el("td"); d.appendChild(sc3 ? tag(sc3.ready ? sc3.good_bays + "/" + sc3.total + " bays good" : "Not calibrated", sc3.ready ? "green" : "amber") : tag("–", "")); tr.appendChild(d);
        tr.appendChild(el("td", "", cam.still ? cam.still.w + "×" + cam.still.h + ", " + dur(cam.still.age_s) + " ago" : "none yet"));
        var act = el("td");
        act.appendChild(btn("Phone link", "", function () {
          api("/console/api/camera-link?" + q({ camera_id: cam.id })).then(function (j) {
            var url = location.origin + j.phone_page;
            (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { alert("Link copied. Open it on the phone."); },
              function () { prompt("Open this on the phone:", url); });
          });
        }));
        tr.appendChild(act);
        tb.appendChild(tr);
      });
      t.appendChild(tb); sc.appendChild(t);
    }, 5000);
    return function () { stopHealth(); stopCams(); };
  } };

  // The bay editor and the log are pages of their own: the menu links straight to them (see pageLinks), and an old
  // "#/layout" bookmark is replaced, not pushed, so the browser's Back button never bounces into them again.
  P.layout = { title: "Bay layout", render: function () { location.replace("/occupancy?camera=" + encodeURIComponent(S.cam)); } };
  P.log = { title: "Activity log", render: function () { location.replace("/live/log?camera_id=" + encodeURIComponent(S.cam)); } };
  function pageLinks() {
    var lay = document.querySelector('#nav a[data-r="layout"]'), log = document.querySelector('#nav a[data-r="log"]');
    if (lay) lay.href = "/occupancy?camera=" + encodeURIComponent(S.cam || "phone-1");
    if (log) log.href = "/live/log?camera_id=" + encodeURIComponent(S.cam || "phone-1");
  }

  // ---------------------------------------------------------------- the menu folded to icons, remembered
  var appEl = document.querySelector(".app");
  function setMini(on) {
    appEl.classList.toggle("mini", on);
    $("collapse").title = $("collapse").ariaLabel = on ? "Expand the menu" : "Collapse the menu";
    try { localStorage.setItem("pf.mini", on ? "1" : "0"); } catch (e) { /* private mode */ }
  }
  try { if (localStorage.getItem("pf.mini") === "1") setMini(true); } catch (e) { /* no storage */ }
  $("collapse").onclick = function () { setMini(!appEl.classList.contains("mini")); };

  // ---------------------------------------------------------------- on a phone: the tab bar, and "More" pulls the full menu up as a sheet
  var moreBtn = $("more");
  function setMenu(open) {
    appEl.classList.toggle("menu-open", open);
    if (moreBtn) moreBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (moreBtn) moreBtn.onclick = function () { setMenu(!appEl.classList.contains("menu-open")); };
  $("menuBg").onclick = function () { setMenu(false); };
  $("nav").addEventListener("click", function (e) { if (e.target.closest && e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && appEl.classList.contains("menu-open")) setMenu(false); });

  // ---------------------------------------------------------------- router
  function route() {
    setMenu(false);
    if (PF.cleanup) { try { PF.cleanup(); } catch (e) { /* leaving a page */ } PF.cleanup = null; }
    var name = (location.hash.replace(/^#\/?/, "").split("?")[0]) || "dashboard";
    if (!P[name]) name = "dashboard";
    pageLinks();
    var links = document.querySelectorAll("#nav a[data-r], #tabbar a[data-r]"), onTab = false;
    for (var i = 0; i < links.length; i++) {
      var here = links[i].getAttribute("data-r") === name;
      links[i].classList.toggle("on", here);
      if (here) links[i].setAttribute("aria-current", "page"); else links[i].removeAttribute("aria-current");
      if (here && links[i].parentNode.id === "tabbar") onTab = true;
    }
    if (moreBtn) moreBtn.classList.toggle("on", !onTab);   // a page that has no tab of its own lights "More"
    $("title").textContent = P[name].title;
    document.title = P[name].title + " · ParkFNB";
    var view = clear($("view"));
    try { PF.cleanup = P[name].render(view) || null; }
    catch (e) { view.appendChild(note("This page could not be drawn: " + e.message, "bad")); }
  }
  PF.route = route;
  window.addEventListener("hashchange", route);
  window.addEventListener("load", async function () {
    await refreshShell();
    route();
    setInterval(refreshShell, 20000);
  });
})();
