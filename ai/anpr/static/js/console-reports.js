/* ParkFNB console: Reports, Sessions, Violations and Settings.  Uses the helpers console.js puts in PF.u. */
(function () {
  "use strict";
  var PF = window.PF, S = PF.S, u = PF.u, P = PF.pages;
  var el = u.el, add = u.add, clear = u.clear, api = u.api, post = u.post, q = u.q, card = u.card, tile = u.tile;
  var dur = u.dur, pct = u.pct, tag = u.tag, btn = u.btn, empty = u.empty, note = u.note, bayLabel = u.bayLabel;

  // ---------------------------------------------------------------- the date range bar
  function daysAgo(n) { return u.dayAgo(n); }                  // the lot's day, in the lot's time zone (the server counts days there too)
  var PRESETS = [["Today", 0, 0], ["Yesterday", 1, 1], ["7 days", 6, 0], ["30 days", 29, 0]];

  // range = { from, to }; onChange() is called when it changes.  `allowAll` adds an "All time" choice (no dates).
  function rangeBar(range, onChange, allowAll) {
    var bar = el("div", "bar"), seg = el("div", "seg"), from = el("input"), to = el("input");
    from.type = to.type = "date";
    var buttons = [];
    function mark(name) { buttons.forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-n") === name); }); }
    function set(f, t, name) { range.from = f; range.to = t; from.value = f || ""; to.value = t || ""; mark(name); onChange(); }
    PRESETS.forEach(function (p) {
      var b = el("button", "", p[0]); b.type = "button"; b.setAttribute("data-n", p[0]);
      b.onclick = function () { set(daysAgo(p[1]), daysAgo(p[2]), p[0]); };
      buttons.push(b); seg.appendChild(b);
    });
    if (allowAll) {
      var all = el("button", "", "All time"); all.type = "button"; all.setAttribute("data-n", "All");
      all.onclick = function () { set("", "", "All"); }; buttons.push(all); seg.appendChild(all);
    }
    function custom() {
      var f = from.value, t = to.value || f;
      if (f && t && f > t) { var x = f; f = t; t = x; from.value = f; to.value = t; }        // "from" after "to": the person meant the other way round
      if (!f) { if (allowAll) set("", "", "All"); return; }                                  // cleared: all time, not a silent nothing
      range.from = f; range.to = t; mark("custom"); onChange();
    }
    from.onchange = to.onchange = custom;
    add(bar, seg, from, el("span", "muted", "to"), to);
    from.value = range.from || ""; to.value = range.to || "";
    mark(range.from === daysAgo(0) && range.to === daysAgo(0) ? "Today" : range.from ? "custom" : "All");
    return bar;
  }
  function csvLink(text, path, params) { var a = el("a", "btn", text); a.href = path + "?" + q(params); return a; }

  // bays the camera keeps losing and finding again: say so, so nobody reads their numbers as cars coming and going
  function unstableNote(d) {
    var names = d.unstable_bays.map(function (b) { return b.label + " (" + b.flickers + " times)"; }).join(", ");
    return note(names + " kept changing between occupied and free for less than " + Math.round(d.min_stay_s / 60) +
      " minutes at a time. That is the camera losing and finding a car again (usually another car in front of it), not cars coming and going, " +
      "so these short changes are not counted as cars or stays and the bay's own numbers are less certain.", "warn");
  }

  // ---------------------------------------------------------------- Reports
  function heatGrid(grid) {
    var wrap = el("div", "heat");
    wrap.appendChild(el("div"));
    for (var h = 0; h < 24; h++) wrap.appendChild(el("div", "l", h % 3 === 0 ? String(h) : ""));
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(function (d, r) {
      wrap.appendChild(el("div", "l", d));
      for (var c = 0; c < 24; c++) {
        var v = grid[r][c], cell = el("div", "c");
        if (v !== null) cell.style.background = "color-mix(in srgb, var(--blue) " + Math.max(8, Math.round(v)) + "%, var(--grey-soft))";
        cell.title = d + " " + c + ":00 · " + (v === null ? "no data" : v + "% occupied");
        wrap.appendChild(cell);
      }
    });
    return wrap;
  }
  function stackBar(parts) {       // [{v, color, label}]
    var total = parts.reduce(function (a, p) { return a + p.v; }, 0), bar = el("div", "stack");
    parts.forEach(function (p) { if (!p.v) return; var i = el("i"); i.style.width = (p.v / total * 100) + "%"; i.style.background = p.color; i.title = p.label + ": " + p.v + " min"; bar.appendChild(i); });
    return bar;
  }

  P.reports = { title: "Reports", render: function (view) {
    var range = { from: daysAgo(0), to: daysAgo(0) }, out = el("div", "grid"), last = null;
    // the downloads sit in one "Export" menu instead of five buttons in a row
    var csvBar = el("details", "menu noprint"), sum = el("summary", "btn", "Export ▾"), pop = el("div", "pop");
    add(csvBar, sum, pop);
    function csvs() {
      clear(pop);
      ["occupancy", "bays", "stays", "episodes"].forEach(function (t) {
        pop.appendChild(csvLink("CSV: " + t, "/console/api/report.csv", { camera_id: S.cam, from: range.from, to: range.to, table: t }));
      });
      pop.appendChild(btn("Print / save as PDF", "primary", function () { csvBar.open = false; window.print(); }));
    }
    function shut(e) { if (csvBar.open && !csvBar.contains(e.target)) csvBar.open = false; }
    document.addEventListener("click", shut);
    var bar = rangeBar(range, function () { load(); }, false);
    var head = el("div", "bar"); add(head, bar, el("span", "grow"), csvBar);
    add(view, head, out);

    async function load() {
      clear(out); out.appendChild(empty("Loading…")); csvs();
      var r;
      try { r = await api("/console/api/report?" + q({ camera_id: S.cam, from: range.from, to: range.to })); }
      catch (e) { clear(out); out.appendChild(note(e.message, "bad")); return; }
      last = r; clear(out);
      var pcts = r.occupancy.filter(function (b) { return b.occupancy_pct !== null; }).map(function (b) { return b.occupancy_pct; });
      var avg = pcts.length ? pcts.reduce(function (a, b) { return a + b; }, 0) / pcts.length : null;
      var cars = r.cars_per_day.reduce(function (a, d) { return a + d.cars; }, 0);
      var tiles = el("div", "tiles");
      add(tiles,
        tile(r.coverage < 0.5 ? "amber" : "green", "check", "Camera seen", pct(r.coverage * 100), "of the period"),
        tile("blue", "layers", "Average occupancy", avg === null ? "–" : pct(avg), "when the camera saw it"),
        tile("blue", "clock", "Busiest", !r.peak ? "–" : r.bucket === "day" ? r.peak.label.slice(5, 10) : r.from === r.to ? r.peak.label.slice(11, 16) : r.peak.label.slice(5, 16).replace("T", " "),
          r.peak ? pct(r.peak.occupancy_pct) + " occupied" : "no data"),
        tile("blue", "car", "Cars parked", cars, "stayed over " + Math.round(r.dwell.min_stay_s / 60) + " min"),
        tile("blue", "clock", "Average stay", r.dwell.n ? dur(r.dwell.avg_s) : "–", r.dwell.n ? r.dwell.n + (r.dwell.n === 1 ? " full stay" : " full stays") + ", longest " + dur(r.dwell.max_s) : "no full stay seen"),
        tile(r.quality.correct_pct !== null && r.quality.correct_pct < 80 ? "amber" : "green", "check", "Parked correctly", r.quality.correct_pct === null ? "–" : pct(r.quality.correct_pct), r.quality.judged_minutes ? "of " + Math.round(r.quality.judged_minutes) + " judged car-minutes" : "no car judged yet"));
      out.appendChild(tiles);
      if (r.coverage < 0.5) out.appendChild(note("The camera was seen for only " + pct(r.coverage * 100) + " of this period. Gaps are shown as gaps, never as empty bays, and every figure below counts only what was seen.", "warn"));
      if (r.dwell.unstable_bays.length) out.appendChild(unstableNote(r.dwell));

      var occ = card("Occupancy over time"); occ.body.appendChild(r.coverage === 0 ? empty("No readings in this period.") : u.lineChart(r.occupancy, { wide: true, xlabel: function (b) { return r.bucket === "day" ? b.label.slice(5, 10) : b.label.slice(11, 16); } }));
      out.appendChild(occ);

      var two = el("div", "grid g2"), heat = card("When it is busy (average % occupied)"), util = card("Each bay");
      heat.body.appendChild(pcts.length ? heatGrid(r.heat) : empty("No readings yet."));
      if (r.bays.length) r.bays.forEach(function (b) {
        var row = el("div", "hbar"), t = el("div", "t"), i = el("i");
        i.style.width = (b.utilisation_pct || 0) + "%"; t.appendChild(i);
        add(row, el("span", "", b.label), t, el("span", "num", b.utilisation_pct === null ? "no data" : pct(b.utilisation_pct)));
        util.body.appendChild(row);
      }); else util.body.appendChild(empty("No bay readings yet."));
      add(two, heat, util); out.appendChild(two);

      var two2 = el("div", "grid g2"), qual = card("Parking quality"), up = card("Camera uptime");
      var m = r.quality.minutes;
      if (r.quality.judged_minutes) {
        add(qual.body, stackBar([{ v: m.correct, color: "var(--green)", label: "Correct" }, { v: m.close_to_line, color: "var(--amber)", label: "Close to a line" }, { v: m.over_line, color: "var(--red)", label: "Over a line" }]),
          el("div", "legend", "Correct " + Math.round(m.correct) + " min · close to a line " + Math.round(m.close_to_line) + " min · over a line " + Math.round(m.over_line) + " min (car-minutes, only bays where the 3D camera fit is good)"));
      } else qual.body.appendChild(empty("No parked car could be judged in this period."));
      var u0 = r.uptime;
      add(up.body, (function () {
        var dl = el("dl", "kv");
        [["Offline", u0.offline], ["Too dark to judge", u0.dark], ["View moved", u0.moved]].forEach(function (x) { add(dl, el("dt", "", x[0]), el("dd", "", dur(x[1].total_s) + " (" + pct(x[1].pct, 1) + ")")); });
        return dl;
      })());
      add(two2, qual, up); out.appendChild(two2);

      var ep = card("Over-the-line episodes"); ep.body.style.padding = "0";
      if (!r.episodes.length) ep.body.appendChild(empty("None in this period."));
      else {
        var t = el("table", "tbl"), th = el("thead"), h = el("tr");
        ["Bay", "From", "To", "Minutes", "Ended by", "What was seen"].forEach(function (x) { h.appendChild(el("th", "", x)); });
        th.appendChild(h); t.appendChild(th);
        var tb = el("tbody");
        r.episodes.forEach(function (e) {
          var tr = el("tr");
          add(tr, el("td", "", e.label), el("td", "", u.dateTimeOf(e.start)), el("td", "", e.end ? u.dateTimeOf(e.end) : "now"), el("td", "num", (e.duration_s / 60).toFixed(1)), el("td", "", e.ended_by), el("td", "", e.detail));
          tb.appendChild(tr);
        });
        t.appendChild(tb); var sc = el("div", "scroll"); sc.appendChild(t); ep.body.appendChild(sc);
      }
      out.appendChild(ep);
      out.appendChild(el("p", "muted", "Times are in " + r.timezone + ". Numbers come from the camera's own log, one reading a minute."));
    }
    load();
    return function () { document.removeEventListener("click", shut); };
  } };

  // ---------------------------------------------------------------- Sessions (how long cars stay)
  P.sessions = { title: "Sessions", render: function (view) {
    var range = { from: daysAgo(0), to: daysAgo(0) }, out = el("div", "grid"), showShort = false, last = null;
    var bar = rangeBar(range, function () { load(); }, false);
    var sw = el("label", "bar"), cb = el("input"); cb.type = "checkbox";
    cb.onchange = function () { showShort = cb.checked; if (last) paint(last); };
    add(sw, cb, el("span", "", "Show the short flickers too"));
    var head = el("div", "bar"); add(head, bar, el("span", "grow"), sw);
    add(view, head, out);
    async function load() {
      clear(out); out.appendChild(empty("Loading…"));
      try { last = await api("/console/api/report?" + q({ camera_id: S.cam, from: range.from, to: range.to })); }
      catch (e) { clear(out); out.appendChild(note(e.message, "bad")); return; }
      paint(last);
    }
    function paint(r) {
      clear(out);
      var d = r.dwell, tiles = el("div", "tiles"), real = r.stays.filter(function (s) { return !s.flicker; });
      add(tiles, tile("blue", "car", "Stays", real.length, d.still_parked + " still parked · " + d.cut_short + " cut short"),
        tile("blue", "clock", "Average stay", d.n ? dur(d.avg_s) : "–", d.n ? "median " + dur(d.median_s) : "no full stay seen"),
        tile("blue", "clock", "Longest stay", d.n ? dur(d.max_s) : "–", ""),
        tile(d.flickers ? "amber" : "", "help", "Short flickers", d.flickers, "under " + Math.round(d.min_stay_s / 60) + " min, not cars"));
      out.appendChild(tiles);
      if (d.unstable_bays.length) out.appendChild(unstableNote(d));
      var shown = showShort ? r.stays : real;
      var c = card("Every time a car sat in a bay", csvLink("CSV", "/console/api/report.csv", { camera_id: S.cam, from: range.from, to: range.to, table: "stays" }));
      c.body.style.padding = "0";
      if (!shown.length) c.body.appendChild(empty("No stay in this period."));
      else {
        var t = el("table", "tbl"), th = el("thead"), h = el("tr");
        ["Bay", "Arrived", "Left", "Stayed", "Plate", ""].forEach(function (x) { h.appendChild(el("th", "", x)); });
        th.appendChild(h); t.appendChild(th);
        var tb = el("tbody");
        shown.slice().reverse().slice(0, 500).forEach(function (s) {
          var tr = el("tr");
          add(tr, el("td", "", s.label), el("td", "", u.dateTimeOf(s.start)), el("td", "", s.open ? "still parked" : u.dateTimeOf(s.end)), el("td", "num", dur(s.dwell_s)));
          var pl = el("td");
          if (s.plate) {
            var pn = el("b", "", s.plate); pn.style.cssText = "letter-spacing:.06em;margin-right:6px"; pl.appendChild(pn);
            if (!s.plate_confirmed) pl.appendChild(tag("unconfirmed", "amber"));
          } else pl.appendChild(tag("not read", ""));
          tr.appendChild(pl);
          var nt = el("td");
          if (s.open) nt.appendChild(tag("still parked", "blue"));
          else if (s.flicker) { var fl = tag("flicker", "amber"); fl.title = "Over in seconds: the camera lost and found the car again. Not counted as a car."; nt.appendChild(fl); }
          else if (s.interrupted) { var tg = tag("cut short", "amber"); tg.title = "The camera went offline, it got too dark, the view moved or the server restarted during this stay, so its real length is not known and it is left out of the averages."; nt.appendChild(tg); }
          tr.appendChild(nt); tb.appendChild(tr);
        });
        t.appendChild(tb); var sc = el("div", "scroll"); sc.appendChild(t); c.body.appendChild(sc);
      }
      out.appendChild(c);
    }
    load();
    return null;
  } };

  // ---------------------------------------------------------------- Violations
  var TYPE = { over_line: "Over the line", overstay: "Overstay" };
  P.violations = { title: "Violations", render: function (view) {
    var f = { status: "open", type: "" }, range = { from: "", to: "" };
    var seg = el("div", "seg"), typeSel = el("select", "fld"), out = el("div", "grid"), csv = el("span");
    [["open", "Open"], ["resolved", "Resolved"], ["dismissed", "Dismissed"], ["", "All"]].forEach(function (p) {
      var b = el("button", "", p[1]); b.type = "button"; b.setAttribute("data-s", p[0]);
      b.onclick = function () { f.status = p[0]; mark(); clear(out); load(); };
      seg.appendChild(b);
    });
    function mark() { var bs = seg.querySelectorAll("button"); for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("on", bs[i].getAttribute("data-s") === f.status); }
    [["", "All types"], ["over_line", "Over the line"], ["overstay", "Overstay"]].forEach(function (p) { var o = el("option", "", p[1]); o.value = p[0]; typeSel.appendChild(o); });
    typeSel.onchange = function () { f.type = typeSel.value; clear(out); load(); };
    var bar = rangeBar(range, function () { clear(out); load(); }, true);
    // It acts on EVERY ended, unhandled violation of the camera (not only the ones in the filter below), cannot be undone in one go
    // and is left out of the accuracy figures: so it asks first, once.
    var DISMISS_LABEL = "Dismiss all that have ended", armTimer = null;
    var dismissBtn = btn(DISMISS_LABEL, "", function () {
      if (!armTimer) {
        dismissBtn.textContent = "Sure? Every ended one on this camera. Click again";
        armTimer = setTimeout(function () { armTimer = null; dismissBtn.textContent = DISMISS_LABEL; }, 6000);
        return;
      }
      clearTimeout(armTimer); armTimer = null;
      dismissBtn.disabled = true;
      post("/console/api/violations-dismiss-ended?" + q({ camera_id: S.cam })).then(function (r) {
        dismissBtn.textContent = r.dismissed + " dismissed (not counted in the accuracy figures)";
        if (PF.refreshShell) PF.refreshShell();
        load();
      }).catch(function (e) { dismissBtn.textContent = "Could not: " + e.message; })
        .then(function () { setTimeout(function () { dismissBtn.disabled = false; dismissBtn.textContent = DISMISS_LABEL; }, 4000); });
    });
    dismissBtn.title = "Violations that are already over and that nobody dealt with. Ones still going on stay open. They are not counted as false alarms.";
    var drawerBg = null, loadSeq = 0;
    function closeDrawer() { if (drawerBg) { drawerBg.remove(); drawerBg = null; } }
    function onEsc(e) { if (e.key === "Escape") closeDrawer(); }
    document.addEventListener("keydown", onEsc);
    var head = el("div", "bar"); add(head, seg, typeSel, bar, el("span", "grow"), dismissBtn, csv);
    add(view, head, out); mark();

    function params() { return { camera_id: S.cam, status: f.status, type: f.type, from: range.from, to: range.to }; }
    function openDrawer(v, reload) {
      closeDrawer();
      var bg = el("div", "drawer-bg"), d = el("div", "drawer");
      d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", v.label + " · " + (TYPE[v.type] || v.type));
      bg.onclick = function (e) { if (e.target === bg) closeDrawer(); };
      var top = el("div", "bar"); add(top, el("h2", "grow", v.label + " · " + (TYPE[v.type] || v.type)), btn("Close", "", closeDrawer));
      d.appendChild(top);
      if (v.evidence) {
        var im = el("img"); im.alt = "Picture kept with this violation";
        im.src = "/console/api/evidence/" + encodeURIComponent(v.id) + ".jpg?" + q({ camera_id: S.cam, hq: v.evidence_hq ? 1 : 0 });
        d.appendChild(im);
        if (!v.evidence_hq) d.appendChild(el("small", "muted", "A full-resolution photo is added when the phone sends the next one."));
      }
      var dl = el("dl", "kv");
      [["Car", v.plate ? v.plate + (v.plate_confirmed ? "" : " (not confirmed)") : "plate not read"], ["Status", v.status], ["Opened", u.dateTimeOf(v.opened)], ["Ended", v.closed ? u.dateTimeOf(v.closed) : "still going"], ["Lasted", dur(v.duration_s)],
       ["What was seen", v.detail || "–"], ["Over by", v.max_crossing_m ? v.max_crossing_m.toFixed(2) + " m" + (v.side ? " (" + v.side + ")" : "") : "–"],
       ["Reviewed by", v.handled_by ? v.handled_by + ", " + u.dateTimeOf(v.handled_at) : "not yet"]].forEach(function (x) { add(dl, el("dt", "", x[0]), el("dd", "", x[1])); });
      d.appendChild(dl);
      var ta = el("textarea"); ta.placeholder = "A note: who you spoke to, what was done"; ta.value = v.note || ""; ta.maxLength = 500;
      var msg = el("small", "muted");
      function save(status, prefix) {
        post("/console/api/violations/" + encodeURIComponent(v.id) + "?" + q({ camera_id: S.cam }), { status: status, note: (prefix || "") + ta.value })
          .then(function () { closeDrawer(); reload(); PF.refreshShell(); })
          .catch(function (e) { msg.textContent = "Could not save: " + e.message; });
      }
      var acts = el("div", "bar");
      if (v.status === "open") {
        var rb = btn("Resolve: it was real", "primary", function () { save("resolved"); }), db = btn("Dismiss: false alarm", "", function () { save("dismissed"); });
        rb.title = "The car really was over the line and you dealt with it. Counts towards how accurate the system is.";
        db.title = "The system was wrong: nobody was over the line. Counts as a false alarm in the accuracy figures.";
        add(acts, rb, db);
        if (v.closed) {
          // real, but the car has gone and there is nothing to do: the system was right, so it is a "real" sample, not a false alarm
          var gb = btn("Real, car already left", "", function () { save("resolved", "Real, the car had already left. "); });
          gb.title = "The car was really over the line, but it has gone. Counts as a real violation in the accuracy figures.";
          acts.appendChild(gb);
        }
      }
      else add(acts, btn("Reopen", "", function () { save("open"); }));
      add(d, el("label", "f", "Note"), ta, acts, msg);
      bg.appendChild(d); document.body.appendChild(bg); drawerBg = bg;
    }
    async function load() {
      var mine = ++loadSeq;                                    // a slow answer for an older filter must not paint over a newer one
      if (!out.firstChild) out.appendChild(empty("Loading…"));  // later refreshes keep the table (and the scroll place) until the new one is there
      clear(csv); csv.appendChild(csvLink("CSV", "/console/api/violations.csv", params()));
      var r;
      try { r = await api("/console/api/violations?" + q(params())); }
      catch (e) { if (mine !== loadSeq) return; clear(out); out.appendChild(note(e.message, "bad")); return; }
      if (mine !== loadSeq) return;
      clear(out);
      var c = card(r.violations.length + (r.violations.length === 1 ? " violation" : " violations")); c.body.style.padding = "0";
      if (!r.violations.length) c.body.appendChild(empty(f.status === "open" ? "Nothing open. Every violation has been dealt with." : "No violation matches."));
      else {
        var t = el("table", "tbl"), th = el("thead"), h = el("tr");
        ["", "Status", "Bay", "Car", "What", "Opened", "Lasted", "Over by"].forEach(function (x) { h.appendChild(el("th", "", x)); });   // status first: on a phone the right-hand columns are off screen
        th.appendChild(h); t.appendChild(th);
        var tb = el("tbody");
        r.violations.forEach(function (v) {
          var tr = el("tr", "click"), th0 = el("td");
          if (v.evidence) { var im = el("img"); im.loading = "lazy"; im.alt = ""; im.style.cssText = "width:88px;height:56px;object-fit:cover;border-radius:8px;display:block";
            im.src = "/console/api/evidence/" + encodeURIComponent(v.id) + ".jpg?" + q({ camera_id: S.cam }); th0.appendChild(im); }
          tr.appendChild(th0);
          var st = el("td"); st.appendChild(tag(v.status, v.status === "open" ? "red" : v.status === "resolved" ? "green" : ""));
          var bayTd = el("td", "", v.label); bayTd.style.whiteSpace = "nowrap";
          var carTd = el("td");
          if (v.plate) { var pn = el("b", "", v.plate); pn.style.cssText = "letter-spacing:.06em;white-space:nowrap"; carTd.appendChild(pn);
            if (!v.plate_confirmed) { carTd.appendChild(document.createElement("br")); carTd.appendChild(tag("unconfirmed", "amber")); } }
          else carTd.appendChild(tag("not read", ""));
          add(tr, st, bayTd, carTd, el("td", "", (TYPE[v.type] || v.type) + (v.detail ? ": " + v.detail : "")), el("td", "", u.dateTimeOf(v.opened)),
            el("td", "num", v.closed ? dur(v.duration_s) : dur(v.duration_s) + " so far"), el("td", "num", v.max_crossing_m ? v.max_crossing_m.toFixed(2) + " m" : "–"));
          tr.onclick = function () { openDrawer(v, load); };
          tb.appendChild(tr);
        });
        t.appendChild(tb); var sc = el("div", "scroll"); sc.appendChild(t); c.body.appendChild(sc);
      }
      out.appendChild(c);
    }
    load();
    var stopPoll = poller2(load);
    return function () { stopPoll(); closeDrawer(); document.removeEventListener("keydown", onEsc); clearTimeout(armTimer); };
  } };
  function poller2(fn) { var t = setInterval(fn, 30000); return function () { clearInterval(t); }; }

  // ---------------------------------------------------------------- Settings
  var STILL_CHOICES = [["", "Server default"], ["0", "Off"], ["60", "Every minute"], ["120", "Every 2 minutes"], ["300", "Every 5 minutes"], ["900", "Every 15 minutes"]];
  P.settings = { title: "Settings", render: function (view) {
    var out = el("div", "grid");
    add(view, out);
    api("/console/api/site").then(function (site) {
      var c = card("Site"), form = el("div", "grid"), nameIn = el("input"), stillSel = el("select", "fld");
      nameIn.type = "text"; nameIn.maxLength = 60; nameIn.value = site.site_name;
      STILL_CHOICES.forEach(function (p) { var o = el("option", "", p[1]); o.value = p[0]; stillSel.appendChild(o); });
      stillSel.value = site.still_every_s === null ? "" : String(site.still_every_s);
      var l1 = el("label", "f", "Name of the lot"); l1.appendChild(nameIn);
      var l2 = el("label", "f", "Full-resolution photo from the phone"); l2.appendChild(stillSel);
      add(form, l1, l2);
      form.style.gridTemplateColumns = "repeat(auto-fit, minmax(220px, 1fr))";
      c.body.appendChild(form);

      var cams = card("Cameras"); cams.body.style.padding = "0";
      var t = el("table", "tbl"), th = el("thead"), h = el("tr");
      ["Camera", "Name", "Zone", "Overstay after (hours, 0 = off)"].forEach(function (x) { h.appendChild(el("th", "", x)); });
      th.appendChild(h); t.appendChild(th);
      var tb = el("tbody"), rows = [];
      site.cameras.forEach(function (cam) {
        var tr = el("tr"), n = el("input"), z = el("input"), o = el("input");
        n.type = z.type = "text"; n.maxLength = z.maxLength = 40; o.type = "number"; o.min = 0; o.max = 72; o.step = 0.5; o.style.width = "90px";
        n.value = cam.name; z.value = cam.zone; o.value = cam.overstay_h;
        add(tr, el("td", "", cam.id)); [n, z, o].forEach(function (i) { var td = el("td"); td.appendChild(i); tr.appendChild(td); });
        tb.appendChild(tr); rows.push({ id: cam.id, n: n, z: z, o: o });
      });
      t.appendChild(tb); var sc = el("div", "scroll"); sc.appendChild(t); cams.body.appendChild(sc);

      var msg = el("span", "muted"), save = btn("Save settings", "primary", function () {
        var body = { site_name: nameIn.value, still_every_s: stillSel.value === "" ? null : +stillSel.value, cameras: {} };
        rows.forEach(function (r) { body.cameras[r.id] = { name: r.n.value, zone: r.z.value, overstay_h: +r.o.value || 0 }; });
        msg.textContent = "Saving…";
        post("/console/api/site", body).then(function () { msg.textContent = "Saved."; PF.refreshShell(); })
          .catch(function (e) { msg.textContent = "Not saved: " + e.message; });
      });
      var bar = el("div", "bar"); add(bar, save, msg);

      var keep = card("What is kept, and for how long");
      add(keep.body, (function () {
        var dl = el("dl", "kv");
        [["Activity log", site.retention.log_days + " days"], ["Violation pictures", site.retention.evidence_days + " days"], ["Number plates and the car photos they were read from", site.retention.evidence_days + " days (then deleted)"],
         ["Who can see this", "Only signed-in operators. Visitors see the public live page only."]].forEach(function (x) { add(dl, el("dt", "", x[0]), el("dd", "", x[1])); });
        return dl;
      })());
      add(out, c, cams, bar, keep);
    }).catch(function (e) { out.appendChild(note("Could not load the settings: " + e.message, "bad")); });
    return null;
  } };
})();
