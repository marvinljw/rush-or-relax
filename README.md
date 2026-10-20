# Next Bus · Outram Exit 4

Open it and it tells you the next bus you can make at **Outram Pk Stn Exit 4**
(147, 961, 961M) on the way to **Connection One Tower 5**, with one word of advice: Run, Walk fast or Relax.

- Big live countdown for the next bus you can still make after your walk from the train (default 4 min, editable).
- The following few buses, plus any bus that's too close to make.
- Warns when a time comes from the timetable instead of the bus's GPS.
- Optional map with live bus positions. Map tiles from [OneMap](https://www.onemap.gov.sg/).
- Add it to your home screen to open it like an app.
- Live arrivals from [arrivelah](https://arrivelah2.busrouter.sg); routes and stops from [busrouter.sg](https://busrouter.sg).

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
