# Rush or Relax

Tells you whether to run, walk fast or take your time for the bus at **Outram Pk Stn Exit 4**
(147, 961, 961M) on the way from Kovan MRT to **Connection One Tower 5**.

- Live arrivals from [arrivelah](https://arrivelah2.busrouter.sg); routes and stops from [busrouter.sg](https://busrouter.sg).
- Map with the bus route and live GPS bus pins, coloured by pace. Map tiles from [OneMap](https://www.onemap.gov.sg/).
- "Leaving Kovan now" adds the train ride (default 18 min) so you can see which bus you'll make.
- Walk and ride times can be edited on the page and are saved in your browser.

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
