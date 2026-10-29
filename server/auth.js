"use strict";
// Sign-in: verify a Google or Apple ID token ourselves, then hand out our OWN session token.
//
// The page gets the ID token from Google Identity Services or from Sign in with Apple's popup;
// what we check is the same for both. We verify the RS256 signature against the provider's
// published keys (JWKS) and the claims that make the token OURS: issuer, audience (our client
// id: Google's OAuth client, Apple's Services ID), expiry. No npm package -- node:crypto reads
// a JWK directly.
const crypto = require("node:crypto");

const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const APPLE_JWKS = "https://appleid.apple.com/auth/keys";
const APPLE_ISS = new Set(["https://appleid.apple.com"]);

class AuthError extends Error {}

function b64uJson(s) {
  return JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
}

// One provider's verifier. `issuers` is the set its tokens may name; the answer is the
// subject, plus the nonce the token carries (Apple's popup echoes the one the page passed).
function makeJwtVerifier({ clientId, jwksUrl, issuers, fetchImpl = fetch }) {
  let keys = new Map();
  let expires = 0;
  let lastFetch = 0;
  let inflight = null;

  // force = an unknown kid (the provider rotated keys). Allowed at most every 30 s, so a stream
  // of tokens with junk kids cannot make us hammer the provider.
  function load(force) {
    if (!force && keys.size && Date.now() < expires) return Promise.resolve();
    if (inflight) return inflight;
    if (force && Date.now() - lastFetch < 30000) return Promise.resolve();
    lastFetch = Date.now();
    inflight = (async () => {
      const r = await fetchImpl(jwksUrl);
      if (!r.ok) throw new Error("JWKS fetch failed (" + r.status + ")");
      const j = await r.json();
      const next = new Map();
      for (const k of (j && j.keys) || []) {
        if (k && k.kty === "RSA" && typeof k.kid === "string") {
          next.set(k.kid, crypto.createPublicKey({ key: k, format: "jwk" }));
        }
      }
      keys = next;
      const ma = /max-age=(\d+)/.exec(r.headers.get("cache-control") || "");
      expires = Date.now() + Math.min(86400, Math.max(300, ma ? +ma[1] : 3600)) * 1000;
    })().finally(() => { inflight = null; });
    return inflight;
  }

  return async function verify(token) {
    if (typeof token !== "string" || token.length > 8192) throw new AuthError("missing token");
    const parts = token.split(".");
    if (parts.length !== 3) throw new AuthError("malformed token");
    let header, claims;
    try {
      header = b64uJson(parts[0]);
      claims = b64uJson(parts[1]);
    } catch (e) {
      throw new AuthError("malformed token");
    }
    // Pin the algorithm: never let the token choose it ("none", HS256 with the public key...).
    if (!header || header.alg !== "RS256" || typeof header.kid !== "string") throw new AuthError("unsupported token");
    await load(false);
    if (!keys.has(header.kid)) await load(true);
    const key = keys.get(header.kid);
    if (!key) throw new AuthError("unknown signing key");
    const signed = Buffer.from(parts[0] + "." + parts[1]);
    if (!crypto.verify("RSA-SHA256", signed, key, Buffer.from(parts[2], "base64url"))) {
      throw new AuthError("bad signature");
    }
    const now = Date.now() / 1000;
    if (!claims || !issuers.has(claims.iss)) throw new AuthError("wrong issuer");
    if (claims.aud !== clientId) throw new AuthError("wrong audience");
    if (typeof claims.exp !== "number" || claims.exp < now - 60) throw new AuthError("token expired");
    if (typeof claims.iat === "number" && claims.iat > now + 300) throw new AuthError("token from the future");
    if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) throw new AuthError("no subject");
    return { sub: claims.sub, nonce: typeof claims.nonce === "string" ? claims.nonce : "" };
  };
}
const makeGoogleVerifier = ({ clientId, jwksUrl = GOOGLE_JWKS, fetchImpl }) =>
  makeJwtVerifier({ clientId, jwksUrl, issuers: GOOGLE_ISS, fetchImpl });
const makeAppleVerifier = ({ clientId, jwksUrl = APPLE_JWKS, fetchImpl }) =>
  makeJwtVerifier({ clientId, jwksUrl, issuers: APPLE_ISS, fetchImpl });

// Our session token: "kt1.<base64url JSON {u, v, e}>.<HMAC-SHA256>". u = uid, v = the user's
// token_ver (bumped to sign every device out), e = expiry in ms. Stateless to check; the
// token_ver comparison against the users row is what makes revocation work.
function makeSessions(secret, ttlMs) {
  const key = Buffer.from(secret, "utf8");
  const mac = s => crypto.createHmac("sha256", key).update(s).digest("base64url");
  return {
    ttlMs,
    issue(uid, ver) {
      const e = Date.now() + ttlMs;
      const body = Buffer.from(JSON.stringify({ u: uid, v: ver, e })).toString("base64url");
      return { token: "kt1." + body + "." + mac("kt1." + body), expires: e };
    },
    read(tok) {
      if (typeof tok !== "string" || tok.length > 1024) return null;
      const p = tok.split(".");
      if (p.length !== 3 || p[0] !== "kt1") return null;
      const want = Buffer.from(mac(p[0] + "." + p[1]));
      const got = Buffer.from(p[2]);
      if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
      let c;
      try { c = JSON.parse(Buffer.from(p[1], "base64url").toString("utf8")); } catch (e) { return null; }
      if (!c || typeof c.u !== "string" || typeof c.v !== "number" || typeof c.e !== "number") return null;
      if (c.e < Date.now()) return null;
      return c;
    },
  };
}

// Constant-time compare of two secrets of any length (hash first, so lengths never leak).
function secretEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// 20 characters of [A-Za-z0-9]: the same shape as a Firestore auto-id, so new #c= links look
// like the old ones. Rejection sampling keeps every character uniformly likely.
const ID_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function newId(len = 20) {
  let out = "";
  while (out.length < len) {
    for (const b of crypto.randomBytes(len * 2)) {
      if (b < 248 && out.length < len) out += ID_ALPHA[b % 62];
    }
  }
  return out;
}

module.exports = { makeGoogleVerifier, makeAppleVerifier, makeSessions, secretEqual, newId, AuthError, GOOGLE_JWKS, APPLE_JWKS };
