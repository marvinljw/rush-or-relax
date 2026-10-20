// Tiny zero-dependency server: serves public/ and proxies arrivelah so the page
// works even if the API's CORS policy changes. Run: node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/arrivals") {
      const id = url.searchParams.get("id") || "";
      if (!/^\d{5}$/.test(id)) {
        res.writeHead(400).end("bad stop id");
        return;
      }
      try {
        const r = await fetch(`https://arrivelah2.busrouter.sg/?id=${id}`);
        res.writeHead(r.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(await r.text());
      } catch (e) {
        res.writeHead(502).end(JSON.stringify({ error: String(e) }));
      }
      return;
    }

    const file = path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname);
    if (!file.startsWith(PUBLIC)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end("not found");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Bus timing app on http://localhost:${PORT}`));
