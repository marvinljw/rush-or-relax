// "Plan a trip" tab: when to leave (bus) or book a taxi to arrive by a set time.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const fmt = t => new Date(t).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false });
  const r = m => Math.max(1, Math.round(m));
  const getJson = url => fetch(url).then(res => { if (!res.ok) throw new Error(res.status); return res.json(); });

  const TOWER5 = { label: "Connection One Tower 5", sub: "167 Jalan Bukit Merah", lat: 1.28273, lng: 103.81818 };
  // Location from OpenStreetMap (OneMap search does not list this outlet).
  const DEFAULT_HOME = { label: "McDonald's Hougang St 21", sub: "Hougang Street 21", lat: 1.35854, lng: 103.88634 };
  const LIVE_WITHIN_MIN = 90;   // use live arrivals when you'd leave within this window

  let home = load("plan.home", DEFAULT_HOME);
  if (home.label === "231 Hougang St 21") { home = DEFAULT_HOME; save("plan.home", home); }   // old default
  let dest = load("plan.dest", null);
  let recents = load("plan.recents", [TOWER5]);
  let prefs = load("plan.prefs", { arriveBy: "09:00", early: 5, busWait: 6, taxiWait: 10 });

  let net = null, netLoading = null;
  let result = null;          // { deadline, bus: [...], taxi }
  let live = null;            // { leaveAt, bus, no, arriveAt } for the top bus option
  let runId = 0;

  // ---- OneMap search ----
  async function search(q) {
    const data = await getJson(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(q)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`);
    return (data.results || []).slice(0, 6).map(x => {
      const building = x.BUILDING && x.BUILDING !== "NIL" ? x.BUILDING : "";
      const street = [x.BLK_NO, x.ROAD_NAME].filter(v => v && v !== "NIL").join(" ");
      return { label: titleCase(building || street || x.SEARCHVAL), sub: titleCase(building ? street : "") + (x.POSTAL && x.POSTAL !== "NIL" ? ` · ${x.POSTAL}` : ""),
        lat: +x.LATITUDE, lng: +x.LONGITUDE };
    });
  }
  const titleCase = s => s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\bSt\b/g, "St");

  function wireSearch(input, list, onPick) {
    let timer, seq = 0;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { list.innerHTML = ""; return; }
      timer = setTimeout(async () => {
        const mine = ++seq;
        try {
          const res = await search(q);
          if (mine !== seq) return;
          list.innerHTML = res.length ? res.map((p, i) => `<button type="button" class="pick" data-i="${i}"><b>${esc(p.label)}</b><span>${esc(p.sub)}</span></button>`).join("")
            : '<p class="hint">No matches.</p>';
          list.querySelectorAll(".pick").forEach(b => b.onclick = () => { list.innerHTML = ""; input.value = ""; onPick(res[+b.dataset.i]); });
        } catch { if (mine === seq) list.innerHTML = '<p class="hint">Search unavailable.</p>'; }
      }, 300);
    });
  }

  // ---- Planning ----
  function deadlineFor(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  function ensureNet() {
    if (net) return Promise.resolve(net);
    netLoading ||= Promise.all(["stops", "services"].map(f => getJson(`https://data.busrouter.sg/v1/${f}.min.json`)))
      .then(([stops, services]) => (net = Planner.build(stops, services)));
    return netLoading;
  }

  // OSRM gives free-flow driving time; Singapore traffic is slower, more so at peak.
  async function taxiPlan(deadline) {
    const data = await getJson(`https://router.project-osrm.org/route/v1/driving/${home.lng},${home.lat};${dest.lng},${dest.lat}?overview=false`);
    const route = data.routes && data.routes[0];
    if (!route) throw new Error("no route");
    const d = new Date(deadline), h = d.getHours() + d.getMinutes() / 60, weekday = d.getDay() > 0 && d.getDay() < 6;
    const peak = weekday && ((h >= 7 && h <= 10) || (h >= 17 && h <= 20.5));
    const ride = (route.duration / 60) * (peak ? 1.4 : 1.15) + 2;
    return { ride, km: route.distance / 1000, peak };
  }

  async function run() {
    const id = ++runId;
    live = null;
    if (!dest) { result = null; render(); return; }
    const deadline = deadlineFor(prefs.arriveBy);
    result = { deadline, loading: true };
    render();

    const [busRes, taxiRes] = await Promise.allSettled([
      ensureNet().then(n => Planner.plan(n, home, dest, { waitMin: +prefs.busWait })),
      taxiPlan(deadline),
    ]);
    if (id !== runId) return;
    result = { deadline,
      bus: busRes.status === "fulfilled" ? busRes.value : null, busError: busRes.status === "rejected",
      taxi: taxiRes.status === "fulfilled" ? taxiRes.value : null };
    render();
    refreshLive(id);
  }

  // If you'd leave soon, look up the real buses at your first stop and pick the latest one that still works.
  async function refreshLive(id = runId) {
    const top = result && result.bus && result.bus[0];
    if (!top) return;
    const arriveBy = result.deadline - prefs.early * 60000;
    const leaveEst = arriveBy - top.total * 60000;
    if (leaveEst - Date.now() > LIVE_WITHIN_MIN * 60000) return;
    const walk0 = top.legs[0].min, bus = top.legs[1];
    const afterBoard = top.total - walk0 - bus.wait;   // minutes from boarding to arrival
    try {
      const data = await getJson(`https://arrivelah2.busrouter.sg/?id=${bus.from.code}`);
      if (id !== runId) return;
      const times = [];
      for (const s of data.services || []) if (bus.alts.includes(s.no))
        for (const b of [s.next, s.next2, s.next3]) if (b && b.time) times.push({ no: s.no, t: new Date(b.time).getTime(), live: b.monitored === 1 });
      times.sort((a, b) => a.t - b.t);
      const now = Date.now();
      const reachable = times.filter(x => x.t - (walk0 + 1) * 60000 >= now);
      const fits = reachable.filter(x => x.t + afterBoard * 60000 <= arriveBy);
      const pick = fits.at(-1) || reachable[0];
      live = pick ? { ...pick, leaveAt: pick.t - (walk0 + 1) * 60000, arriveAt: pick.t + afterBoard * 60000, late: !fits.length, stop: bus.from.name } : { none: true };
      render();
    } catch { /* estimates still shown */ }
  }

  // ---- Rendering ----
  function legHtml(l) {
    if (l.type === "walk") return `<li class="walk">Walk ${r(l.min)} min${l.to.name === "Destination" ? " to destination" : ` to ${esc(l.to.name)}`}</li>`;
    return `<li class="bus"><span class="no">${l.alts.map(esc).join(" / ")}</span> from ${esc(l.from.name)} → ${esc(l.to.name)}
      <span class="sub">${l.stops} stop${l.stops > 1 ? "s" : ""} · ~${r(l.ride)} min ride · allow ${r(l.wait)} min wait</span></li>`;
  }

  function countdown(t) {
    const m = (t - Date.now()) / 60000;
    if (m < -1) return `<span class="late">${r(-m)} min ago</span>`;
    if (m < 1) return "now";
    if (m < 90) return `in ${r(m)} min`;
    return `in ${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
  }

  function render() {
    $("homeLabel").textContent = home.label;
    $("homeSub").textContent = home.sub || "";
    $("destLabel").textContent = dest ? dest.label : "Choose a destination";
    $("destSub").textContent = dest ? dest.sub || "" : "";
    $("recents").innerHTML = recents.filter(p => !dest || p.label !== dest.label).map((p, i) =>
      `<button type="button" class="chip" data-i="${recents.indexOf(p)}">${esc(p.label)}</button>`).join("");
    $("recents").querySelectorAll(".chip").forEach(b => b.onclick = () => pickDest(recents[+b.dataset.i]));

    const out = $("planOut");
    if (!dest) { out.innerHTML = '<p class="hint pad">Pick where you\'re going and when you need to be there.</p>'; return; }
    if (!result) { out.innerHTML = ""; return; }

    const arriveBy = result.deadline - prefs.early * 60000;
    const day = new Date(result.deadline).toDateString() === new Date().toDateString() ? "today" : "tomorrow";
    $("dayNote").textContent = `${day}${prefs.early ? ` · aiming ${prefs.early} min early (${fmt(arriveBy)})` : ""}`;
    if (result.loading) { out.innerHTML = '<p class="hint pad">Working it out…</p>'; return; }

    const top = result.bus && result.bus[0];
    const busLeave = top ? (live && !live.none ? live.leaveAt : arriveBy - top.total * 60000) : null;
    const taxiBook = result.taxi ? arriveBy - (result.taxi.ride + +prefs.taxiWait) * 60000 : null;

    const tile = (cls, title, t, sub, note) => `<div class="tile ${cls}"><div class="k">${title}</div>
      <div class="v">${t ? fmt(t) : "—"}</div><div class="s">${t ? countdown(t) : sub}</div>${t && note ? `<div class="n">${note}</div>` : ""}</div>`;
    const topBuses = top ? top.legs.filter(l => l.type === "bus").map(l => esc(live && !live.none && l === top.legs[1] ? live.no : l.alts.join("/"))).join(" → ") : "";
    const taxiNote = result.taxi ? `${prefs.taxiWait} min wait + ${r(result.taxi.ride)} min ride` : "";
    let html = `<div class="tiles">
      ${tile("bus", "Bus: leave by", busLeave, result.busError ? "Bus data unavailable" : "No bus route found", "Bus " + topBuses)}
      ${tile("taxi", "Taxi: book by", taxiBook, "Driving time unavailable", taxiNote)}
    </div>`;

    if (live && !live.none) {
      html += `<p class="livebox ${live.late ? "late" : ""}">${live.late
        ? `<b>Running late:</b> the next ${esc(live.no)} (${fmt(live.t)}) gets you there around <b>${fmt(live.arriveAt)}</b>.`
        : `<b>Live:</b> catch the <b>${esc(live.no)}</b> at ${fmt(live.t)} from ${esc(live.stop)} — leave at <b>${fmt(live.leaveAt)}</b>, arrive ~${fmt(live.arriveAt)}.`}
        ${live.live ? "" : " <span class='tag'>timetable</span>"}</p>`;
    }

    if (result.bus && result.bus.length) {
      html += '<h3>By bus</h3>' + result.bus.map((o, i) => {
        const leave = i === 0 && live && !live.none ? live.leaveAt : arriveBy - o.total * 60000;
        const changes = o.legs.filter(l => l.type === "bus").length - 1;
        return `<details class="opt" ${i === 0 ? "open" : ""}><summary>
          <span class="when">Leave ${fmt(leave)}</span>
          <span class="what">${o.legs.filter(l => l.type === "bus").map(l => `<span class="no">${l.alts.map(esc).join(" / ")}</span>`).join(" → ")}</span>
          <span class="dur">~${r(o.total)} min${changes ? " · 1 change" : ""}</span></summary>
          <ol>${o.legs.map(legHtml).join("")}</ol></details>`;
      }).join("");
    }

    if (result.taxi) {
      const t = result.taxi;
      html += `<h3>By taxi</h3><div class="taxi">
        <p>Book by <b>${fmt(taxiBook)}</b> · allow <b>${prefs.taxiWait} min</b> for the taxi to arrive, then ~<b>${r(t.ride)} min</b> ride (${t.km.toFixed(1)} km${t.peak ? ", peak-hour traffic" : ""}).</p>
        ${top ? `<p class="sub">${taxiBook > busLeave ? `Saves you ${r((taxiBook - busLeave) / 60000)} min at home vs the bus.` : "The bus lets you leave later."}</p>` : ""}
      </div>`;
    }
    html += '<p class="hint">Bus times are estimates from distance (no timetables; MRT not included). Live times kick in when you\'re within 90 min of leaving.</p>';
    out.innerHTML = html;
  }

  function pickDest(p) {
    dest = p; save("plan.dest", dest);
    recents = [p, ...recents.filter(x => x.label !== p.label)].slice(0, 5); save("plan.recents", recents);
    run();
  }

  function init() {
    wireSearch($("destSearch"), $("destResults"), pickDest);
    wireSearch($("homeSearch"), $("homeResults"), p => { home = p; save("plan.home", home); $("homeEdit").open = false; run(); });

    const bind = (id, key, num) => {
      const el = $(id); el.value = prefs[key];
      el.addEventListener("change", () => { prefs[key] = num ? Math.max(0, +el.value || 0) : el.value; save("plan.prefs", prefs); run(); });
    };
    bind("arriveBy", "arriveBy");
    bind("early", "early", true);
    bind("busWait", "busWait", true);
    bind("taxiWait", "taxiWait", true);

    run();
    setInterval(() => { if (!document.getElementById("tab-plan").hidden) render(); }, 15000);
    setInterval(() => { if (!document.getElementById("tab-plan").hidden) refreshLive(); }, 60000);
  }

  let started = false;
  window.PlanTab = { open() { if (!started) { started = true; init(); } else render(); } };
})();
