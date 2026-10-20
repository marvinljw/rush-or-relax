// Builds public/trip-data.json: stop coordinates and the road path each bus takes
// from Outram Park to Bukit Merah, cut out of busrouter.sg's route polylines.
// Usage: node tools/build-trip.js
const fs = require("fs");
const path = require("path");

const PLACES = {
  mrt: { name: "Outram Park MRT", lat: 1.2802, lng: 103.8395 },
  dest: { name: "Connection One Tower 5", lat: 1.28273, lng: 103.81818 },
};
// go = morning (Outram Park -> Tower 5), back = evening (Tower 5 -> Outram Park).
// One drawn line per leg; the first service's road path is used for the line.
const DIRECTIONS = {
  go: { start: "mrt", end: "dest", services: ["147", "961", "961M"], from: "05069", to: "10091" },
  back: { start: "dest", end: "mrt", services: ["147", "197", "961", "961M"], from: "10099", to: "10018" },
};

function decode(str) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

const d2 = (a, b) => (a[0] - b[0]) ** 2 + ((a[1] - b[1]) * Math.cos(a[0] * Math.PI / 180)) ** 2;
const nearest = (pts, p, from = 0) => {
  let best = from;
  for (let i = from; i < pts.length; i++) if (d2(pts[i], p) < d2(pts[best], p)) best = i;
  return best;
};

(async () => {
  const get = f => fetch(`https://data.busrouter.sg/v1/${f}`).then(r => r.json());
  const [stops, services, routes] = await Promise.all(
    ["stops.min.json", "services.min.json", "routes.min.json"].map(get));
  const stop = c => ({ code: c, name: stops[c][2], road: stops[c][3], lat: stops[c][1], lng: stops[c][0] });

  const directions = {};
  for (const [key, { start, end, services: svcs, from, to }] of Object.entries(DIRECTIONS)) {
    const no = svcs[0];
    const dir = services[no].routes.findIndex(r => r.includes(from) && r.indexOf(to) > r.indexOf(from));
    const pts = decode(routes[no][dir]);
    const s = stop(from), e = stop(to);
    const i = nearest(pts, [s.lat, s.lng]);
    const j = nearest(pts, [e.lat, e.lng], i);
    directions[key] = { start, end, board: s, alight: e,
      line: { services: svcs, pts: pts.slice(i, j + 1).map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]) } };
  }

  const out = { places: PLACES, directions };
  const file = path.join(__dirname, "..", "public", "trip-data.json");
  fs.writeFileSync(file, JSON.stringify(out));
  console.log("wrote", file, Object.entries(directions).map(([k, d]) => `${k}: ${d.board.name} -> ${d.alight.name}, ${d.line.pts.length} pts`));
})();
