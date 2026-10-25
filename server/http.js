"use strict";
// Small HTTP plumbing: errors, bodies with hard limits, JSON replies, CORS, rate limits.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Read the whole body, refusing anything past `limit` bytes -- by Content-Length up front,
// and by counting as it streams (a chunked body has no Content-Length to check).
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = +req.headers["content-length"];
    if (declared > limit) {
      req.resume();
      return reject(new HttpError(413, "request body too large (limit " + limit + " bytes)"));
    }
    const chunks = [];
    let total = 0;
    let done = false;
    req.on("data", c => {
      if (done) return;
      total += c.length;
      if (total > limit) {
        done = true;
        req.resume();
        return reject(new HttpError(413, "request body too large (limit " + limit + " bytes)"));
      }
      chunks.push(c);
    });
    req.on("end", () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on("error", e => { if (!done) { done = true; reject(e); } });
  });
}

async function readJson(req, limit) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  let v;
  try { v = JSON.parse(buf.toString("utf8")); } catch (e) { throw new HttpError(400, "body is not valid JSON"); }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, "body must be a JSON object");
  return v;
}

function sendJson(res, status, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

// CORS. The API authenticates with a bearer token, never a cookie, so CORS is not what keeps
// a user's data safe (a foreign page has no way to read the token from kicktro.com's storage).
// The allowlist is there so other sites cannot build on the API from their visitors' browsers.
function makeCors(origins, allowDev) {
  const set = new Set(origins);
  const devRe = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  const allowed = o => !!o && (set.has(o) || (allowDev && (o === "null" || devRe.test(o))));
  return function cors(req, res) {
    const o = req.headers.origin;
    if (!allowed(o)) return false;
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Expose-Headers", "ETag");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    return true;
  };
}

// Fixed-window counters, in memory. One process serves the API, so memory is the right place;
// a restart forgets the windows, which only ever errs towards letting someone through.
class Limiter {
  constructor() {
    this.m = new Map();
    this.t = setInterval(() => this.sweep(), 60000);
    this.t.unref();
  }
  // true = allowed. key names the bucket (e.g. "share:<uid>").
  hit(key, max, windowMs) {
    const now = Date.now();
    let e = this.m.get(key);
    if (!e || now >= e.reset) {
      e = { n: 0, reset: now + windowMs };
      this.m.set(key, e);
    }
    e.n++;
    return e.n <= max;
  }
  sweep() {
    const now = Date.now();
    for (const [k, e] of this.m) if (now >= e.reset) this.m.delete(k);
  }
  stop() { clearInterval(this.t); }
}

module.exports = { HttpError, readBody, readJson, sendJson, makeCors, Limiter };
