  // ---- Error reports: the moderators' view of what armCrashReport sent ---------------------
  // The page posts its own errors to /api/errors (src/config.js); this reads them back with the
  // moderator's own session -- the API answers GET/DELETE /api/errors to the admin token or a
  // session whose uid is in ADMIN_UIDS, and refuses everyone else, so hiding the button is
  // tidiness, not the guard. The button is in the profile popover and shows only while
  // gal.admin is true (galMineFetch, from /api/me/favs).
  //
  // errLinkSync and closeErrors are DECLARATIONS: cloud-profile.js (an earlier slice) calls the
  // first while it starts up, the Escape branch (ui-diagnostics) the second.
  function errLinkSync() {
    const b = el("cloud-errors");
    const on = !!cloudSess && gal.admin === true;
    if (b) b.hidden = !on;
    if (!on) closeErrors();                 // signed out, or no longer a moderator
  }
  function closeErrors() {
    const d = el("errdlg");
    if (!d || d.classList.contains("hidden")) return;
    d.classList.add("hidden");
    dlgRelease(d.querySelector(".err-box"));
  }
  function errOpen() {
    const d = el("errdlg");
    if (!d || !cloudSess || gal.admin !== true) return;
    popClose();                             // the profile popover it was opened from
    d.classList.remove("hidden");
    dlgModal(d.querySelector(".err-box"));
    errLoad();
  }

  // "3 min ago" -- the reports are read to decide what to fix NOW, so recency is the point.
  function errAgo(t) {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 90) return "just now";
    if (s < 5400) return Math.round(s / 60) + " min ago";
    if (s < 129600) return Math.round(s / 3600) + " h ago";
    return Math.round(s / 86400) + " d ago";
  }
  function errNote(s, bad) {
    const n = el("err-sum");
    if (!n) return;
    n.textContent = s;
    n.style.color = bad ? "#ff8b6a" : "";
  }
  function errNode(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  let errSeq = 0;                           // a slow answer for an old sort must not win
  function errLoad() {
    const sort = el("err-sort") ? el("err-sort").value : "last";
    const seq = ++errSeq;
    errNote("Loading…");
    apiFetch("/api/errors?sort=" + sort + "&limit=200", { method: "GET" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status === 403 ? "Moderators only." : "The API answered " + r.status + "."))))
      .then(j => { if (seq === errSeq) errRender(j); })
      .catch(e => { if (seq === errSeq) { el("err-list").textContent = ""; errNote("Could not load the reports. " + (e.message || ""), true); } });
  }
  function errRender(j) {
    const list = el("err-list");
    list.textContent = "";
    const items = Array.isArray(j.items) ? j.items : [];
    errNote(items.length
      ? (j.n || items.length) + " kind" + ((j.n || items.length) === 1 ? "" : "s") + " of error, "
        + (j.reports || 0) + " report" + (j.reports === 1 ? "" : "s") + (j.n > items.length ? " (showing " + items.length + ")" : "") + "."
      : "No reports. Nothing has gone wrong since the list was last cleared.");
    for (const it of items) list.appendChild(errItem(it));
  }
  function errItem(it) {
    const d = errNode("details", "err-item");
    d.dataset.fp = it.fp;
    const s = errNode("summary");
    s.appendChild(errNode("span", "err-n", it.count + "×"));
    if (it.stalled > 0) s.appendChild(errNode("span", "err-stop", "stopped " + it.stalled));
    s.appendChild(errNode("span", "err-msg", (it.kind === "rejection" ? "(promise) " : "") + it.msg));
    s.appendChild(errNode("span", "err-when", errAgo(it.last)));
    d.appendChild(s);
    const b = errNode("div", "err-body");
    const dl = errNode("dl");
    const row = (k, v) => { if (!v) return; dl.appendChild(errNode("dt", "", k)); dl.appendChild(errNode("dd", "", v)); };
    row("Version", it.version);
    row("Where", it.src);
    row("Scene", it.ctx);
    row("Page", it.path);
    row("Browser", it.ua);
    row("First", new Date(it.first).toLocaleString() + " (" + errAgo(it.first) + ")");
    row("Last", new Date(it.last).toLocaleString() + " (" + errAgo(it.last) + ")");
    row("Stopped", it.stalled > 0 ? it.stalled + " of " + it.count + " times the picture froze" : "");
    b.appendChild(dl);
    if (it.stack) b.appendChild(errNode("pre", "", it.stack));
    const f = errNode("button", "audbtn", "Forget");
    f.type = "button";
    f.title = "Fixed: drop this one. If it happens again it comes back as new.";
    f.addEventListener("click", () => errForget(it, d));
    b.appendChild(f);
    d.appendChild(b);
    return d;
  }
  function errForget(it, node) {
    apiFetch("/api/errors/" + it.fp, { method: "DELETE" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("The API answered " + r.status + "."))))
      .then(() => { node.remove(); errLoad(); })
      .catch(e => errNote("Could not forget it. " + (e.message || ""), true));
  }
  function errForgetAll() {
    if (!confirm("Forget every error report?\n\nOnes that happen again come back as new.")) return;
    apiFetch("/api/errors", { method: "DELETE" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("The API answered " + r.status + "."))))
      .then(() => errLoad())
      .catch(e => errNote("Could not clear them. " + (e.message || ""), true));
  }

  if (el("cloud-errors")) el("cloud-errors").addEventListener("click", errOpen);
  if (el("err-close")) el("err-close").addEventListener("click", closeErrors);
  if (el("errdlg")) el("errdlg").addEventListener("click", e => { if (e.target === el("errdlg")) closeErrors(); });
  if (el("err-sort")) el("err-sort").addEventListener("change", errLoad);
  if (el("err-refresh")) el("err-refresh").addEventListener("click", errLoad);
  if (el("err-clear")) el("err-clear").addEventListener("click", errForgetAll);
  errLinkSync();
