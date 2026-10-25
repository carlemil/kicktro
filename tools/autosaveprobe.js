// --- Automatic cloud save: the three scheduling rules ------------------------------------
//
// The user's rules, exactly: save only when something actually changed; wait two hours after
// the LAST change, with each new change restarting that; and at most once a day.
//
// None of that is testable by watching the app -- the shortest interesting case takes two
// hours of wall clock. But the decision is a PURE FUNCTION of three stored timestamps and the
// clock, which is why it was written as one: autoSaveDue(state, now, signedIn) can be asked
// about any moment in any order.
//
// Slices real source by markers -- keep them:
//   "const AUTOSAVE_KEY"    ...  "const AUTOSAVE_TICK_MS"   (boot-globals: the constants)
//   "function autoSaveRead(" ...  "function autoSaveTick("  (the scheduler)
"use strict";
const fs = require("fs");
const file = process.argv[2] || "dev-index.html";
const src = fs.readFileSync(file, "utf8");

let fails = 0, passes = 0;
function ok(name, cond, note) {
  if (typeof name !== "string") { console.log("BAD ASSERTION: name must be a string"); process.exit(1); }
  if (cond) { passes++; console.log("PASS  " + name + (note ? "  [" + note + "]" : "")); }
  else { fails++; console.log("FAIL  " + name + (note ? "  [" + note + "]" : "")); }
}
function slice(from, to) {
  const a = src.indexOf(from);
  if (a < 0) throw new Error("marker missing: " + from);
  const b = src.indexOf(to, a);
  if (b < 0) throw new Error("marker missing: " + to);
  return src.slice(a, b);
}

// The real constants and the real decision, taken from the built file rather than retyped --
// a probe that carries its own copy of "two hours" cannot notice the app changing its mind.
const consts = slice("const AUTOSAVE_KEY", "const AUTOSAVE_TICK_MS") + "const AUTOSAVE_TICK_MS = 0;";
const sched = slice("function autoSaveRead(", "function autoSaveTick(");
// A localStorage stub, so autoSaveRead/Write are exercised for real rather than modelled.
const store = {};
const api = new Function("localStorage",
  consts + "\n" + sched +
  "\nreturn { read: autoSaveRead, write: autoSaveWrite, due: autoSaveDue," +
  "  nextAt: autoSaveNextAt, span: autoSaveSpan, text: autoSaveText," +
  "  noteChange: autoSaveNoteChange, noteSaved: autoSaveNoteSaved," +
  "  enabled: autoSaveEnabled, setEnabled: autoSaveSetEnabled," +
  "  KEY: AUTOSAVE_KEY, DELAY: AUTOSAVE_DELAY_MS, GAP: AUTOSAVE_GAP_MS, RETRY: AUTOSAVE_RETRY_MS };"
)({
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
});

console.log("--- automatic cloud save (" + file + ")\n");

const H = 60 * 60 * 1000, D = 24 * H;
ok("the quiet time after a change is 2 hours", api.DELAY === 2 * H, api.DELAY + "ms");
ok("the minimum gap between saves is a day", api.GAP === D, api.GAP + "ms");
ok("its state has its own localStorage key", /^burnTheWeb\./.test(api.KEY), api.KEY);
ok("...and that key is NOT the scene blob", api.KEY !== "burnTheWeb.v1", api.KEY);

const T = 1000000000000;                    // an arbitrary fixed "now"
const st = (o) => Object.assign({ changed: 0, saved: 0, tried: 0, on: true }, o);

// ---- rule 1: only when something actually changed ------------------------------------
ok("RULE 1 nothing ever changed -> never saves",
   !api.due(st({}), T, true));
ok("RULE 1 already saved since the last change -> does not save again",
   !api.due(st({ changed: T - 5 * H, saved: T - 4 * H }), T, true));
ok("...and a change AFTER that save does arm it again",
   api.due(st({ changed: T - 3 * H, saved: T - 4 * H - D }), T, true),
   "changed after the save, both old enough");

// ---- rule 2: two hours after the LAST change -----------------------------------------
ok("RULE 2 one hour after the change -> too soon",
   !api.due(st({ changed: T - 1 * H }), T, true));
ok("RULE 2 just under two hours -> still too soon",
   !api.due(st({ changed: T - api.DELAY + 1000 }), T, true));
ok("RULE 2 just past two hours -> saves",
   api.due(st({ changed: T - api.DELAY - 1000 }), T, true));
// The restart is the half that a naive "save 2h after the first change" gets wrong.
{
  const s = st({ changed: T - 5 * H });
  ok("...and a NEW change restarts the two hours", api.due(s, T, true) &&
     !api.due(st({ changed: T - 10 * 60 * 1000 }), T, true),
     "old change fires, fresh change waits");
}

// ---- rule 3: at most once a day -------------------------------------------------------
ok("RULE 3 saved an hour ago -> will not save again today",
   !api.due(st({ changed: T - 3 * H, saved: T - 1 * H }), T, true));
ok("RULE 3 saved 23 hours ago -> still not yet",
   !api.due(st({ changed: T - 3 * H, saved: T - 23 * H }), T, true));
ok("RULE 3 saved just over a day ago -> saves",
   api.due(st({ changed: T - 3 * H, saved: T - D - 1000 }), T, true));

// ---- signed out, and switched off ------------------------------------------------------
const ripe = st({ changed: T - 3 * H, saved: T - D - 1000 });
ok("signed out -> never saves (and does not queue)", !api.due(ripe, T, false));
ok("switched off -> never saves", !api.due(st(Object.assign({}, ripe, { on: false })), T, true));
ok("...and it is ON unless it was switched off", api.read().on === true, "fresh state");

// ---- a failure must not hammer the network --------------------------------------------
ok("an attempt a minute ago -> does not retry immediately",
   !api.due(st({ changed: T - 3 * H, tried: T - 60 * 1000 }), T, true));
ok("...and does retry after the backoff",
   api.due(st({ changed: T - 3 * H, tried: T - api.RETRY - 1000 }), T, true),
   "retry after " + (api.RETRY / H) + "h");
// The stamp goes on BEFORE the attempt, so a save that throws or hangs still backs off. That
// is a property of autoSaveTick, which is read as text here since calling it would save.
{
  const tick = src.slice(src.indexOf("function autoSaveTick("), src.indexOf("setInterval(autoSaveTick"));
  const stamp = tick.indexOf("s.tried"), call = tick.indexOf("cloudSave()");
  ok("the attempt is stamped BEFORE cloudSave is called", stamp > 0 && call > 0 && stamp < call,
     "tried@" + stamp + " cloudSave@" + call);
  ok("...and the tick refuses to run when not signed in", /cloudSess/.test(tick));
}

// ---- the round trip through localStorage ----------------------------------------------
{
  api.setEnabled(false);
  ok("the on/off preference persists", api.enabled() === false);
  api.setEnabled(true);
  ok("...and comes back on", api.enabled() === true);
  const before = api.read().changed;
  api.noteChange();
  ok("noteChange stamps the change", api.read().changed > before);
  api.noteSaved();
  const s2 = api.read();
  ok("noteSaved stamps the save without clearing the change", s2.saved > 0 && s2.changed > 0);
  ok("...and that pair reads as 'nothing to do'", !api.due(s2, s2.saved + 1000, true));
  // Junk in the store must not arm a save -- this value survives page loads and could be
  // anything by the time it is read back.
  store[api.KEY] = "{not json";
  const j = api.read();
  ok("a corrupt stored state reads as blank and never fires",
     j.changed === 0 && j.saved === 0 && j.on === true && !api.due(j, T, true));
}

// ---- the wiring: it must not have invented a second notion of "changed" ---------------
{
  const persistFn = src.slice(src.indexOf("function persist()"), src.indexOf("function persist()") + 700);
  ok("persist() is what signals a change", /autoSaveNoteChange\(\)/.test(persistFn));
  const guard = persistFn.indexOf("persistReady"), note = persistFn.indexOf("autoSaveNoteChange");
  ok("...and it signals AFTER the persistReady guard, so loading a scene is not an edit",
     guard > 0 && note > guard, "guard@" + guard + " note@" + note);
  ok("every successful cloud save is recorded, manual ones included",
     /cloudNoteDocTime\(res\.updated\);\s*(\/\/[^\n]*\n\s*)*autoSaveNoteSaved\(\);/.test(src));
  ok("the schedule is NOT in fullSnapshot()",
     !src.slice(src.indexOf("function fullSnapshot()"), src.indexOf("function fullSnapshot()") + 1200)
        .includes("autoSave"));
}

// ---- what the cloud box SAYS -------------------------------------------------------------
// The schedule is measured in hours, so it is invisible without being told: before this line
// the only way to find out whether anything had been saved was to press Save and watch. The
// wording is a pure function of the stored state and the clock, so it can be read back for
// any moment rather than waited for.
{
  ok("a span reads in whole units", api.span(90 * 60 * 1000) === "1 hour 30 min", api.span(90 * 60 * 1000));
  ok("...and singular where it should be", api.span(60 * 60 * 1000) === "1 hour", api.span(60 * 60 * 1000));
  ok("...and minutes below the hour", api.span(35 * 60 * 1000) === "35 minutes", api.span(35 * 60 * 1000));
  ok("...and never a bare zero", api.span(400) === "less than a minute", api.span(400));
}
{
  // NEXT-SAVE TIME is the same three limits read the other way round, and the LATEST wins --
  // all three have to be satisfied at once. Getting max/min the wrong way round here would
  // promise a save that autoSaveDue then refuses, which is worse than saying nothing.
  const quiet = st({ changed: T - 1 * H });
  ok("with only the quiet time pending, that is when it lands",
     api.nextAt(quiet) === quiet.changed + api.DELAY);
  const daily = st({ changed: T - 3 * H, saved: T - 5 * H });
  ok("with a save five hours ago, the DAILY gap is what binds",
     api.nextAt(daily) === daily.saved + api.GAP,
     "quiet would allow " + new Date(daily.changed + api.DELAY).toISOString().slice(11, 16));
  const failed = st({ changed: T - 3 * H, tried: T - 10 * 60 * 1000 });
  ok("after a failed attempt, the back-off is what binds",
     api.nextAt(failed) === failed.tried + api.RETRY);
  ok("nothing to save -> no next time at all", api.nextAt(st({})) === 0);
  ok("...nor when the last save is newer than the last change",
     api.nextAt(st({ changed: T - 5 * H, saved: T - 1 * H })) === 0);
  // The claim that ties the two together: the moment it says is the moment due() agrees.
  const s2 = st({ changed: T - 3 * H, saved: T - 20 * H });
  const at = api.nextAt(s2);
  ok("THE TIME IT REPORTS IS THE TIME IT ACTUALLY SAVES",
     !api.due(s2, at - 1000, true) && api.due(s2, at + 1000, true),
     "not due a second before, due a second after");
}
{
  const now = T;
  ok("with nothing saved yet it says so",
     /Not saved to your profile yet/.test(api.text(st({}), now, true)));
  ok("...and reports how long ago the last save was",
     /Last saved to cloud 3 hours ago/.test(api.text(st({ saved: now - 3 * H }), now, true)),
     api.text(st({ saved: now - 3 * H }), now, true));
  ok("...and how long until the next one",
     /Earliest next save in 1 hour/.test(api.text(st({ changed: now - 1 * H }), now, true)),
     api.text(st({ changed: now - 1 * H }), now, true));
  ok("...and says nothing is pending when nothing changed",
     /Nothing has changed since then/.test(api.text(st({ saved: now - 2 * H, changed: now - 3 * H }), now, true)));
  ok("...and that it is due when it is due",
     /due now/.test(api.text(st({ changed: now - 5 * H }), now, true)),
     api.text(st({ changed: now - 5 * H }), now, true));
  ok("switched off, it says that instead of a time",
     /Automatic saving is off/.test(api.text(st({ changed: now - 5 * H, on: false }), now, true)));
  ok("signed out, it says that instead of a time",
     /Sign in to save automatically/.test(api.text(st({ changed: now - 5 * H }), now, false)));
}

console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
