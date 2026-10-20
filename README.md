# Next Bus · Outram Exit 4

Open it and it tells you the next bus you can make at **Outram Pk Stn Exit 4**
(147, 961, 961M) on the way to **Connection One Tower 5**, with one word of advice: Run, Walk fast or Relax.

- Big live countdown for the next bus you can still make after your walk from the train (default 4 min, editable).
- The following few buses, plus any bus that's too close to make.
- Warns when a time comes from the timetable instead of the bus's GPS.
- Optional map with live bus positions. Map tiles from [OneMap](https://www.onemap.gov.sg/).
- Add it to your home screen to open it like an app.
- Live arrivals from [arrivelah](https://arrivelah2.busrouter.sg); routes and stops from [busrouter.sg](https://busrouter.sg).

## Plan a trip tab

Pick a destination (OneMap search) and an arrive-by time; it tells you when to leave home by bus
and when to book a taxi.

- Bus routes are planned over [busrouter.sg](https://busrouter.sg) data (direct or one change, MRT not included).
  Ride time is estimated from distance (~18 km/h) plus a waiting allowance per bus.
- Within 90 min of leaving it switches to live arrivals at your first stop and names the exact bus to catch.
- Taxi time is the [OSRM](https://project-osrm.org/) driving time plus a peak-hour factor, plus your taxi wait (default 10 min).
- Home defaults to 530231; change it, the arrive-early buffer, bus wait and taxi wait on the page.

## Run locally

```bash
node server.js
```

Then open http://localhost:3000. No dependencies needed (Node 18+).

## Rebuild the map data

```bash
node tools/build-trip.js
```

`tools/find-routes.js` lists every bus between two points, for adapting the app to another trip.

## Deploy

Pushing to `main` publishes `public/` to GitHub Pages via `.github/workflows/pages.yml`.
