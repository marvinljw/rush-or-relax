// Finds bus services between two points using busrouter.sg's static data.
// Used to build the STOPS list in public/index.html.
// Usage: node tools/find-routes.js [fromLat fromLng toLat toLng radiusM]
const [fLat, fLng, tLat, tLng, radius] = process.argv.slice(2).map(Number);
const FROM = [fLat || 1.2805, fLng || 103.8395];  // Outram Park MRT
const TO = [tLat || 1.28273, tLng || 103.81818];  // Connection One Tower 5 (OneMap)
const R = radius || 450;

const dist = ([a, b], [c, d]) => {
  const r = Math.PI / 180, x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r;
  return Math.round(Math.hypot(x, y) * 6371e3);
};

(async () => {
  const get = f => fetch(`https://data.busrouter.sg/v1/${f}`).then(r => r.json());
  const [stops, services] = await Promise.all([get("stops.min.json"), get("services.min.json")]);
  const at = code => [stops[code][1], stops[code][0]]; // data is [lng, lat, name, road]

  const rows = [];
  for (const [no, svc] of Object.entries(services)) {
    for (const route of svc.routes) {
      route.forEach((board, i) => {
        const walkFrom = dist(FROM, at(board));
        if (walkFrom > R) return;
        const j = route.findIndex((c, k) => k > i && dist(TO, at(c)) <= R);
        if (j < 0) return;
        rows.push({ no, board, boardName: stops[board][2], walkFrom, alight: route[j],
          alightName: stops[route[j]][2], walkTo: dist(TO, at(route[j])), stops: j - i });
      });
    }
  }
  console.table(rows.sort((a, b) => a.walkFrom - b.walkFrom));
})();
