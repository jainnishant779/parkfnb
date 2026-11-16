/* ParkFNB pages: light or dark.  Light unless the person picked dark; the choice is remembered in this browser and shared by every
   ParkFNB page (and every open tab).  Load it in <head> WITHOUT defer/async, before the page's CSS paints, so nothing flashes:
       <script src="/static/js/theme.js"></script>
   Any element with the attribute data-theme-toggle becomes the switch (a button showing a moon, or a sun when dark).
   The pages' CSS defines the light colours on :root and the dark ones on :root[data-theme="dark"]. */
(function () {
  "use strict";
  var KEY = "pf.theme", root = document.documentElement;
  var SUN = "M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z";
  var MOON = "M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z";
  var NS = "http://www.w3.org/2000/svg";

  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function current() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  function apply(t) {
    root.setAttribute("data-theme", t === "dark" ? "dark" : "light");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0F0F0F" : "#F3F3F3");
    paint();
  }
  function set(t) { try { localStorage.setItem(KEY, t); } catch (e) { /* private mode: this page only */ } apply(t); }
  function toggle() { set(current() === "dark" ? "light" : "dark"); }

  function paint() {
    var dark = current() === "dark", btns = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], p = b.querySelector("path.pf-theme-ico");
      b.setAttribute("aria-pressed", dark ? "true" : "false");
      b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      b.title = dark ? "Light mode" : "Dark mode";
      if (p) p.setAttribute("d", dark ? SUN : MOON);
    }
  }
  function wire() {
    var btns = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.getAttribute("data-wired")) continue;
      b.setAttribute("data-wired", "1");
      if (b.tagName === "BUTTON" && !b.type) b.type = "button";
      b.classList.add("pf-theme");
      if (!b.querySelector("svg")) {
        var s = document.createElementNS(NS, "svg"), p = document.createElementNS(NS, "path");
        s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
        p.setAttribute("class", "pf-theme-ico"); s.appendChild(p); b.appendChild(s);
      }
      b.addEventListener("click", toggle);
    }
    paint();
  }

  // a plain default look for the switch; :where() keeps it weaker than any page rule, so a page can restyle it
  var st = document.createElement("style");
  st.textContent = ":where(.pf-theme){width:44px;height:44px;flex:none;display:inline-grid;place-items:center;padding:0;border:0;border-radius:50%;" +
    "background:var(--fill,rgba(127,127,127,.14));color:inherit;cursor:pointer}:where(.pf-theme):hover{background:var(--fill-2,rgba(127,127,127,.24))}" +
    ":where(.pf-theme) svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}";
  (document.head || root).appendChild(st);

  apply(saved());
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  window.addEventListener("storage", function (e) { if (e.key === KEY) apply(e.newValue); });
  window.PFTheme = { get: current, set: set, toggle: toggle, wire: wire };
})();
