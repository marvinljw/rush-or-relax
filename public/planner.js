// Bus trip planner over busrouter.sg data (stops + service stop sequences).
// No timetables exist in the data, so ride time is estimated from distance and
// waiting is a fixed allowance. Works in the browser (window.Planner) and Node.
(function (root) {
  const WALK_M_PER_MIN = 75;      // ~4.5 km/h
  const WALK_DETOUR = 1.3;        // streets aren't straight lines
  const BUS_M_PER_MIN = 300;      // ~18 km/h average including stops
  const ROUTE_DETOUR = 1.1;
  const NEAR_M = 600;             // how far you'd walk to/from a stop
  const TRANSFER_M = 200;         // walk between stops when changing bus
  const TRANSFER_PENALTY = 5;     // a direct bus is worth a few minutes

  const dist = (lat1, lng1, lat2, lng2) => {
    const r = Math.PI / 180, x = (lng2 - lng1) * r * Math.cos(((lat1 + lat2) / 2) * r), y = (lat2 - lat1) * r;
    return Math.hypot(x, y) * 6371e3;
  };
  const walkMin = m => (m * WALK_DETOUR) / WALK_M_PER_MIN;

  function build(stops, services) {
    const at = {};       // stop -> [{no, dir, idx}]
    const cum = {};      // "no|dir" -> cumulative metres along route at each idx
    for (const [no, svc] of Object.entries(services)) {
      svc.routes.forEach((route, dir) => {
        const c = [0];
        for (let i = 1; i < route.length; i++) {
          const a = stops[route[i - 1]], b = stops[route[i]];
          c.push(c[i - 1] + (a && b ? dist(a[1], a[0], b[1], b[0]) : 0));
        }
        cum[no + "|" + dir] = c;
        route.forEach((code, idx) => (at[code] ||= []).push({ no, dir, idx }));
      });
    }
    // Coarse grid so "stops near a point" doesn't scan all ~5000 stops each time.
    const grid = {};
    const cell = (lat, lng) => Math.floor(lat / 0.005) + ":" + Math.floor(lng / 0.005);
    for (const [code, s] of Object.entries(stops)) (grid[cell(s[1], s[0])] ||= []).push(code);
    const near = (lat, lng, m) => {
      const out = [], cy = Math.floor(lat / 0.005), cx = Math.floor(lng / 0.005);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        for (const code of grid[(cy + dy) + ":" + (cx + dx)] || []) {
          const s = stops[code], d = dist(lat, lng, s[1], s[0]);
          if (d <= m) out.push({ code, d });
        }
      return out.sort((a, b) => a.d - b.d);
    };
    return { stops, services, at, cum, near };
  }

  const rideMin = (net, no, dir, i, j) => {
    const c = net.cum[no + "|" + dir];
    return ((c[j] - c[i]) * ROUTE_DETOUR) / BUS_M_PER_MIN;
  };

  // from/to: {lat, lng}; waitMin: allowance per boarding. Returns options sorted best first.
  function plan(net, from, to, { waitMin = 6, maxOptions = 3 } = {}) {
    const { stops, services, at, near } = net;
    const stopInfo = c => ({ code: c, name: stops[c][2], road: stops[c][3], lat: stops[c][1], lng: stops[c][0] });

    const destWalk = {};
    for (const { code, d } of near(to.lat, to.lng, NEAR_M)) destWalk[code] = walkMin(d);

    // For every (service, direction, index): best way to finish the trip staying on that bus.
    const finish = {};
    for (const code of Object.keys(destWalk)) for (const { no, dir, idx: j } of at[code] || []) {
      const route = services[no].routes[dir];
      for (let i = 0; i < j; i++) {
        const t = rideMin(net, no, dir, i, j) + destWalk[code];
        const key = no + "|" + dir + "|" + i;
        if (!finish[key] || t < finish[key].t) finish[key] = { t, ride: t - destWalk[code], j, alight: route[j], stopsCount: j - i };
      }
    }
    // stop -> best finishing legs boarding there
    const finishAt = {};
    for (const [key, f] of Object.entries(finish)) {
      const [no, dir, i] = key.split("|");
      const code = services[no].routes[+dir][+i];
      (finishAt[code] ||= []).push({ no, dir: +dir, i: +i, ...f });
    }

    const options = [];
    const add = o => options.push(o);
    const origins = near(from.lat, from.lng, NEAR_M);

    for (const { code: o, d } of origins) {
      const w0 = walkMin(d);
      // Direct
      for (const f of finishAt[o] || []) {
        add({ total: w0 + waitMin + f.t, legs: [
          { type: "walk", min: w0, to: stopInfo(o) },
          { type: "bus", no: f.no, dir: f.dir, from: stopInfo(o), to: stopInfo(f.alight), stops: f.stopsCount, wait: waitMin, ride: f.ride },
          { type: "walk", min: f.t - f.ride, to: { name: "Destination" } },
        ] });
      }
      // One transfer
      for (const { no, dir, idx: i } of at[o] || []) {
        const route = services[no].routes[dir];
        for (let k = i + 1; k < route.length; k++) {
          const r1 = rideMin(net, no, dir, i, k);
          const s = stops[route[k]];
          if (!s) continue;
          for (const { code: t2, d: dd } of near(s[1], s[0], TRANSFER_M)) {
            for (const f of finishAt[t2] || []) {
              if (f.no === no) continue;
              const tw = walkMin(dd);
              add({ total: w0 + waitMin + r1 + tw + waitMin + f.t + TRANSFER_PENALTY, penalty: TRANSFER_PENALTY, legs: [
                { type: "walk", min: w0, to: stopInfo(o) },
                { type: "bus", no, dir, from: stopInfo(o), to: stopInfo(route[k]), stops: k - i, wait: waitMin, ride: r1 },
                ...(tw > 0.5 ? [{ type: "walk", min: tw, to: stopInfo(t2) }] : []),
                { type: "bus", no: f.no, dir: f.dir, from: stopInfo(t2), to: stopInfo(f.alight), stops: f.stopsCount, wait: waitMin, ride: f.ride },
                { type: "walk", min: f.t - f.ride, to: { name: "Destination" } },
              ] });
            }
          }
        }
      }
    }

    // A transfer whose first bus barely moves you isn't worth it; walking is simpler.
    const sensible = options.filter(o => {
      const bus = o.legs.filter(l => l.type === "bus");
      return bus.length === 1 || bus[0].ride >= 4;
    });

    // Buses that run between the same stops are one option ("107 / 153": take whichever comes first).
    sensible.sort((a, b) => a.total - b.total);
    const groups = new Map(), seenBuses = new Set(), out = [];
    for (const o of sensible) {
      const bus = o.legs.filter(l => l.type === "bus");
      const shape = bus.map(l => l.from.code + ">" + l.to.code).join("|");
      const g = groups.get(shape);
      if (g) {
        if (o.total - g.total <= 3) bus.forEach((l, n) => {
          const leg = g.legs.filter(x => x.type === "bus")[n];
          if (!leg.alts.includes(l.no)) leg.alts.push(l.no);
        });
        continue;
      }
      const combo = bus.map(l => l.no).join(">");
      if (seenBuses.has(combo) || out.length >= maxOptions) continue;
      // Skip slower variants of an option already shown (same first or last bus).
      const raw = x => x.total - (x.penalty || 0);
      const busesOf = x => x.legs.filter(l => l.type === "bus");
      if (out.some(c => raw(c) <= raw(o) + 0.5 && (
        busesOf(c)[0].alts.includes(bus[0].no) || busesOf(c).at(-1).alts.includes(bus.at(-1).no)))) continue;
      seenBuses.add(combo);
      bus.forEach(l => (l.alts = [l.no]));
      groups.set(shape, o);
      out.push(o);
    }
    out.forEach(o => (o.total -= o.penalty || 0));
    return out;
  }

  const api = { build, plan, dist };
  if (typeof module !== "undefined") module.exports = api; else root.Planner = api;
})(this);
