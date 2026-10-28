"use strict";
// Kicktro API: cloud profiles, #c= share links, the scene gallery and its favourites.
// Plain Node (node:http + node:sqlite + node:crypto), no npm packages. Configuration comes
// from the environment only -- see server/.env.example for every variable.
//
//   node --disable-warning=ExperimentalWarning server/main.js
//
// Prints "kicktro-api listening on :<port>" once it accepts connections (tools/serverprobe.js
// waits for that line, which is how PORT=0 works there).
const http = require("node:http");
const { openDb } = require("./db");
const { makeGoogleVerifier, makeSessions, GOOGLE_JWKS } = require("./auth");
const { HttpError, sendJson, makeCors, Limiter } = require("./http");
const { makeRoutes, LIMIT } = require("./routes");

const env = process.env;
const list = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
const cfg = {
  port: env.PORT == null || env.PORT === "" ? 8080 : +env.PORT,
  host: env.HOST || "0.0.0.0",
  dbPath: env.DB_PATH || "./kicktro.db",
  thumbDir: env.THUMB_DIR || "",
  clientId: env.GOOGLE_CLIENT_ID || "",
  jwksUrl: env.GOOGLE_JWKS_URL || GOOGLE_JWKS,
  sessionSecret: env.SESSION_SECRET || "",
  sessionDays: +env.SESSION_DAYS || 60,
  adminToken: env.ADMIN_TOKEN || "",
  // Google-signed-in accounts (our uids, public in every gallery listing) that may delete ANY
  // gallery card -- moderation. Not a secret; compose.yml names them.
  admins: list(env.ADMIN_UIDS),
  origins: list(env.ALLOWED_ORIGINS || "https://kicktro.com,https://carlemil.github.io"),
  allowDev: env.ALLOW_DEV_ORIGINS !== "0",
  // Only behind Caddy, which REPLACES any X-Forwarded-For a visitor sends. Off by default, so
  // a server reached directly can never be told a client address by the client.
  trustXff: env.TRUST_XFF === "1",
  rev: env.GIT_REV || "dev",
  // How long an edit waits before others see it (gallery-sync.js). An hour; the probe shortens it.
  pendingMs: env.PENDING_MS == null || env.PENDING_MS === "" ? 3600000 : +env.PENDING_MS,
};

function fail(msg) {
  console.error("kicktro-api: " + msg);
  process.exit(1);
}
if (!cfg.clientId) fail("GOOGLE_CLIENT_ID is not set");
if (cfg.sessionSecret.length < 32) fail("SESSION_SECRET must be at least 32 characters");
if (cfg.adminToken && cfg.adminToken.length < 24) fail("ADMIN_TOKEN must be at least 24 characters");
if (!Number.isInteger(cfg.port) || cfg.port < 0 || cfg.port > 65535) fail("PORT is not a valid port");
if (!(cfg.pendingMs >= 0)) fail("PENDING_MS is not a number of milliseconds");

const db = openDb(cfg.dbPath);
const limiter = new Limiter();
const ctx = {
  db, cfg, limiter,
  verifyGoogle: makeGoogleVerifier({ clientId: cfg.clientId, jwksUrl: cfg.jwksUrl }),
  sessions: makeSessions(cfg.sessionSecret, cfg.sessionDays * 86400000),
};
const routes = makeRoutes(ctx);
const cors = makeCors(cfg.origins, cfg.allowDev);

function clientIp(req) {
  if (cfg.trustXff) {
    const x = String(req.headers["x-forwarded-for"] || "").split(",").pop().trim();
    if (x) return x;
  }
  return req.socket.remoteAddress || "?";
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  let status = 0;
  res.on("finish", () => {
    status = res.statusCode;
    if (env.QUIET !== "1") {
      console.log(new Date().toISOString() + " " + req.method + " " + String(req.url).split("?")[0]
        + " " + status + " " + (Date.now() - t0) + "ms");
    }
  });
  try {
    cors(req, res);
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const ip = clientIp(req);
    const [ipMax, ipWin] = LIMIT.ip;
    if (!limiter.hit("ip:" + ip, ipMax, ipWin)) throw new HttpError(429, "too many requests, try again later");
    const url = new URL(req.url, "http://api");
    const method = req.method === "HEAD" ? "GET" : req.method;
    let pathMatched = false;
    for (const rt of routes) {
      const m = rt.re.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (rt.method !== method) continue;
      return await rt.fn({ req, res, url, m, ip });
    }
    throw new HttpError(pathMatched ? 405 : 404, pathMatched ? "method not allowed" : "not found");
  } catch (e) {
    if (res.headersSent) { res.destroy(); return; }
    if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message });
    console.error(e && e.stack || e);
    sendJson(res, 500, { error: "internal error" });
  }
});
server.headersTimeout = 20000;
server.requestTimeout = 60000;

server.listen(cfg.port, cfg.host, () => {
  console.log("kicktro-api listening on :" + server.address().port + " (rev " + cfg.rev + ")");
});

function shutdown(sig) {
  console.log("kicktro-api: " + sig + ", closing");
  limiter.stop();
  server.close(() => {
    try { db.close(); } catch (e) { /* already closed */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
