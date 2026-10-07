// Headless probe for the DIALOG INVARIANTS — the four parallel lists every dialog has to
// appear in, and the header structure the shared CSS assumes.
//
// This probe exists because the same failure has now happened four separate times: the app
// grows a tenth dialog, it reuses `.pal-close` and `.hidden` and so it LOOKS finished, and
// nobody adds it to one of the lists that live somewhere else. Each time the result was
// invisible in a screenshot and only findable by reading the CSS:
//
//   * `#syncpop > h2` / `#carddlg > h2` — the <h2> is a GRANDCHILD of the id (every dialog
//     wraps its body in an inner box), so the sticky-header rules matched nothing at all and
//     those two titles scrolled away under their own content.
//   * `body.ui-hidden` — #help and #restoredlg were never added, so "hide all UI" left them
//     sitting on what was supposed to be a clean capture.
//   * the Escape branch — the gallery and the sync nudge were closable by mouse only.
//   * the padding-top waiver — declared ABOVE half the dialogs' own `padding:` shorthands,
//     which silently reinstate the top and put a band of scrolling content above the header.
//
// So: one table of dialogs here, checked against every list. Adding a dialog to the app and
// not to a list fails here rather than in the field.
//
// Usage: node tools/uiprobe.js dev-index.html
const fs = require("fs");
const html = fs.readFileSync(process.argv[2] || "dev-index.html", "utf8");
const s0 = html.indexOf("<script>"), s1 = html.indexOf("</script>", s0);
const c0 = html.indexOf("<style>"), c1 = html.indexOf("</style>", c0);
if (s0 < 0 || s1 < 0) throw new Error("probe: no inline <script> found");
if (c0 < 0 || c1 < 0) throw new Error("probe: no inline <style> found");
const js = html.slice(s0 + 8, s1);
const css = html.slice(c0 + 7, c1);
const body = html.slice(c1, s0);
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

let pass = 0, fail = 0;
const ok = (cond, name, detail) => {
  (cond ? pass++ : fail++);
  console.log((cond ? "PASS  " : "FAIL  ") + name + (detail ? "  [" + detail + "]" : ""));
};

// THE table. `box` is the inner wrapper the content actually lives in — the thing every CSS
// selector has to name, and the thing three of these rules got wrong by addressing the id.
// `modal` = has a backdrop and takes the keyboard; the rest are floating tool panels you use
// WHILE the scene runs, which must never trap focus. `closer` is what the Escape branch calls.
//
// `sticky` = the title paints a background and pins to the top. It is a property of the BOX,
// not a preference: only a near-opaque box with no backdrop-filter of its own can carry one.
// A translucent box (rgba .8 + its own blur) composites a nested backdrop-filter toward BLACK
// on real GPUs, so its title must paint nothing and simply scroll — #carddlg was put in the
// sticky list and turned up with a black bar under its title. A headless screenshot does NOT
// show this; the probe can only pin which list each dialog is in.
const DIALOGS = [
  { id: "paldlg",       box: "pal-box",  title: "pal-title",       modal: false, closer: "closePalDetail",   sticky: false },
  { id: "galdlg",       box: "gal-box",  title: "gal-title",       modal: true,  closer: "galOpen(false)",   sticky: true  },
  { id: "fltdlg",       box: "flt-box",  title: "flt-title",       modal: false, closer: "closeFilterPicker",sticky: false },
  { id: "transpickdlg", box: "flt-box",  title: "transpick-title", modal: false, closer: "closeTransPick",   sticky: false },
  { id: "palpickdlg",   box: "flt-box",  title: "palpick-title",   modal: false, closer: "closePalPick",     sticky: false },
  { id: "paledlg",      box: "pale-box", title: "pale-title",      modal: false, closer: "closePalEditor",   sticky: false },
  { id: "carddlg",      box: "card-box", title: "card-title",      modal: false, closer: "cardOpen(false)",  sticky: false },
  { id: "restoredlg",   box: "rst-box",  title: "rst-title",       modal: true,  closer: "closeRestore",     sticky: true  },
  { id: "syncpop",      box: "sync-box", title: "sync-title",      modal: true,  closer: "dismissSyncIfOpen",sticky: true  },
  { id: "tutdlg",       box: "tut-box",  title: "tut-title",       modal: true,  closer: "closeTutorial",    sticky: true  },
  // #help alone is built by JS on every open (four different openers), so its markup is
  // asserted against the HELP_HEAD string rather than the body.
  { id: "help",         box: "help-box", title: "help-title",      modal: true,  closer: "closeHelp",        sticky: true, js: true },
];

// ---- 1. Escape closes every one of them ------------------------------------------------
// Slice the branch and look for each closer by name. There is more than one
// `e.key === "Escape"` in the app (the cloud profile-name field commits on it, and it comes
// FIRST in the built file), so pick the branch by content, not by position.
//
// It spans several lines now, and NOT as an `else if`: Escape is handled ABOVE the
// INPUT/TEXTAREA/SELECT typing guard, because that guard is there to stop m/f/s/h eating
// characters in a field and was swallowing Escape inside the focus-trapped Restore dialog's
// checkboxes. So match the block, not a single `else if` line.
const escLine = (js.match(/if \(e\.key === "Escape"\) \{[\s\S]{0,400}?\n\s*\}/g) || [])
  .find(l => l.includes("closeHelp")) || "";
ok(escLine.length > 0, "the Escape branch is present in the key handler");
for (const d of DIALOGS) {
  ok(escLine.includes(d.closer), "Escape closes #" + d.id, d.closer);
}

// ---- 2. hide-all-UI hides every one of them --------------------------------------------
// One selector list, so there is one place to add the next dialog. It used to be two: a
// stray `body.ui-hidden #galdlg` sat 130 lines away from the rest.
const uiHidden = (cssNoComments.match(/body\.ui-hidden[^{]*\{\s*display:\s*none\s*!important;?\s*\}/g) || []);
ok(uiHidden.length === 1, "there is exactly ONE body.ui-hidden hide list", uiHidden.length + " found");
const uiHiddenSel = uiHidden.join(" ");
for (const d of DIALOGS) {
  ok(new RegExp("body\\.ui-hidden #" + d.id + "\\b").test(uiHiddenSel), "H hides #" + d.id);
}
// ...and the hint that says how to get back must NOT be in it, or it is hidden the instant
// it is shown and the menu item strands you again.
ok(!/body\.ui-hidden #uihint\b/.test(uiHiddenSel),
   "#uihint is deliberately NOT hidden by ui-hidden (it is the way back)");

// ---- 3. the header structure the shared CSS assumes ------------------------------------
// `.pal-close` is `float: right`, which only lands beside the title if it PRECEDES it. The
// Orbit editor had them the other way round and landed near-enough by accident of a -30px
// margin.
const CLOSE_CLASS = /class="(?:pal-close|card-close|help-close|sync-close)"|class="(?:sync-close)"/;
for (const d of DIALOGS) {
  const hay = d.js ? js : body;
  const at = d.js ? hay.indexOf("HELP_HEAD =") : hay.indexOf('id="' + d.id + '"');
  ok(at >= 0, "#" + d.id + " is in the " + (d.js ? "script" : "markup"));
  if (at < 0) continue;
  const chunk = hay.slice(at, at + 1200);
  const boxAt = chunk.indexOf(d.box);
  const closeAt = chunk.search(/(?:pal-close|card-close|help-close|sync-close)/);
  const h2At = chunk.indexOf("<h2");
  ok(boxAt >= 0, "#" + d.id + " wraps its body in ." + d.box);
  ok(closeAt >= 0 && h2At >= 0 && closeAt < h2At,
     "#" + d.id + ": the close button precedes its <h2>");
  ok(chunk.includes('aria-labelledby="' + d.title + '"'),
     "#" + d.id + " is labelled by its own title", d.title);
  ok(new RegExp('<h2 id="' + d.title + '"').test(chunk),
     "...and that title id is on the <h2>");
  // Read the box's OWN opening tag, not a window around it: an explanatory comment nearby
  // that quotes role="dialog" would otherwise satisfy the check (this probe did exactly that
  // on its first run, and passed #paldlg off the comment above it).
  const tag = (chunk.slice(boxAt).match(/^[^>]*>/) || [""])[0];
  ok(/role="dialog"/.test(tag), "#" + d.id + " box carries role=dialog", tag.trim().slice(0, 80));
  const isModal = /aria-modal="true"/.test(tag);
  ok(isModal === d.modal, "#" + d.id + (d.modal ? " is modal" : " is NOT modal (floating tool panel)"));
}

// ---- 4. the sticky-header selectors name the element the <h2> really sits in ------------
// The bug, twice: `#carddlg > h2` when the h2 is `#carddlg .card-box > h2`. A child
// combinator against the wrong parent matches nothing and fails silently.
const stickyRule = (cssNoComments.match(/([^{}]*)\{\s*position:\s*sticky;\s*top:\s*0;[^}]*box-shadow:\s*0 -30px[^}]*\}/) || [])[1] || "";
ok(stickyRule.length > 0, "the sticky dialog-title rule is present");
// ...and its counterpart: the titles that must paint NOTHING, because their box is translucent
// and a nested backdrop-filter composites toward black on a real GPU.
const flatRule = (cssNoComments.match(/([^{}]*)\{\s*position:\s*static;\s*background:\s*transparent;[^}]*\}/) || [])[1] || "";
ok(flatRule.length > 0, "the paints-nothing title override is present");
for (const d of DIALOGS) {
  const sel = "#" + d.id + " ." + d.box + " > h2";
  // Whichever list it belongs to, it must name the box — never the id, which is the h2's
  // GRANDparent and matches nothing.
  ok(!new RegExp("#" + d.id + "\\s*>\\s*h2").test(stickyRule + " " + flatRule),
     "#" + d.id + " title selector does not address the id directly");
  if (d.sticky) {
    ok(stickyRule.includes(sel), "sticky title selector names " + sel);
    ok(!flatRule.includes(sel), "...and it is not also opted out");
  } else {
    // A non-sticky title is in BOTH rules on purpose: the sticky one supplies the header's
    // `padding: 18px 0 9px`, which is what replaces the top padding the box gives up, and the
    // override then resets only position/background/blur/shadow. So the test is that it is
    // opted out at all — absent from both lists would look fine until someone adds it to the
    // sticky one "for consistency" and gets a black bar.
    ok(flatRule.includes(sel), "translucent box ⇒ " + sel + " is explicitly opted out of painting");
  }
}

// ---- 5. the padding waiver has to WIN --------------------------------------------------
// Same specificity everywhere, so source order decides, and a later `padding:` shorthand
// reinstates the top the sticky header is supposed to carry.
const cssLines = cssNoComments.split(/\r?\n/);
const waiverAt = cssLines.findIndex(l => /padding-top:\s*0;/.test(l) && /\.rst-box/.test(l));
ok(waiverAt >= 0, "the shared padding-top:0 waiver exists");
for (const d of DIALOGS) {
  const sel = d.id === "carddlg" ? "#carddlg" : "#" + d.id + " ." + d.box;
  ok(cssLines[waiverAt] && cssLines.slice(Math.max(0, waiverAt - 4), waiverAt + 1).join(" ").includes(sel),
     "the waiver names " + sel);
  // find any `padding:` shorthand declared on that same box, and check it is ABOVE the waiver
  let clash = -1;
  for (let i = 0; i < cssLines.length; i++) {
    if (!new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*(,|\\{)").test(cssLines[i])) continue;
    for (let j = i; j < Math.min(cssLines.length, i + 14); j++) {
      if (/[^-]padding:\s/.test(cssLines[j]) && j > waiverAt) clash = j + 1;
      if (cssLines[j].includes("}")) break;
    }
  }
  ok(clash < 0, "no `padding:` shorthand for " + sel + " is declared below the waiver",
     clash > 0 ? "line " + clash : "");
}

// ---- 6. the disabled-state helper is the only way a control is switched off -------------
// `.off` used to be paired with `pointer-events: none`, which blocks the mouse and nothing
// else: a dimmed button kept its tab stop and still fired on Enter.
// setOff's own toggle is the implementation, not a call site — everything else routing round
// it is what this catches. The ♪ is the one deliberate exception: dimmed when there is no
// audio source, but still live (clicking it is how you find out why).
const rawOff = (js.match(/classList\.toggle\("off"[^)]*\)/g) || [])
  .filter(m => !m.includes("!!off"));
ok(rawOff.length === 1 && rawOff[0].includes("audio.on"),
   "the only raw classList.toggle(\"off\") left is the ♪ (dimmed but deliberately live)",
   rawOff.length + ": " + rawOff.join(" | ").slice(0, 120));
ok(/function setOff\(/.test(js), "setOff() is the shared disabled-state helper");
ok(/node\.disabled = !!off/.test(js), "...and it sets the real `disabled`, not just the class");
// THE LAYER ROW CONTROLS ARE REAL BUTTONS. They were <b> with a click listener and no role or
// tabindex, so mute, delete, the blend steppers and the tint swatch were unreachable by keyboard
// and invisible to assistive tech -- with no other way to do any of the four. That also made
// `disabled` a no-op, which is why the CSS needed a pointer-events patch to stop a dimmed ✕
// confirming a removal the one-layer floor then refused. As buttons, setOff's real `disabled`
// does the blocking AND drops the tab stop, so the patch is gone. Assert the cause, not the
// workaround: if these ever revert to <b>, this goes red.
ok(/const (?:tint|mute|rm|up|dn) = document\.createElement\("b"\)/.test(js) === false,
   "no layer-row control is created as a <b>");
for (const nm of ["tint", "mute", "rm", "up", "dn"])
  ok(new RegExp("const " + nm + " = document\\.createElement\\(\"button\"\\)").test(js),
     "...the row's `" + nm + "` is a <button>");
ok(/#panel \.lyr \.lyr-b\.off, #panel \.lyr \.lyr-b:disabled/.test(cssNoComments),
   "...and the dimmed state is driven by :disabled, not a pointer-events patch");
for (const sel of ["#panel #addlayer.off", "#paledlg .audbtn.off", "#carddlg .cardmode.off"]) {
  const rule = (cssNoComments.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{[^}]*\\}")) || [""])[0];
  ok(rule && !/pointer-events:\s*none/.test(rule),
     sel + " relies on `disabled`, not pointer-events", rule.trim().slice(0, 70));
}

// ---- 7. the one-layer floor is checked BEFORE the confirm ------------------------------
// Otherwise a single-layer scene asks "Remove the Plasma layer?", takes your OK, and does
// nothing — removeStackItem refuses further down.
// Anchor on removeStackItem, not on `rm.addEventListener("click"` — the FILTER list has a
// remove button by the same local name, and it is built earlier in the file.
const rmAt = js.indexOf("removeStackItem(j); persist()");
const rmHandler = rmAt < 0 ? "" : js.slice(Math.max(0, rmAt - 800), rmAt);
ok(rmHandler.length > 0, "the layer ✕ handler is present");
const guardAt = rmHandler.indexOf("stack.length <= 1");
const confirmAt = rmHandler.indexOf("confirm(");
ok(guardAt >= 0, "the layer ✕ checks the one-layer floor");
ok(guardAt >= 0 && confirmAt >= 0 && guardAt < confirmAt,
   "...and checks it BEFORE raising the confirm");

// ---- 8. the modal focus trap is wired only to the modal ones ---------------------------
ok(/function dlgModal\(/.test(js) && /function dlgRelease\(/.test(js),
   "dlgModal/dlgRelease exist");
ok(/dlgRelease\(box\)/.test(js) || /dlgTrap\.box !== box/.test(js),
   "dlgRelease is box-scoped (an unconditional close must not steal focus back)");
for (const d of DIALOGS.filter(x => !x.modal)) {
  ok(!new RegExp("dlgModal\\([^)]*" + d.box).test(js),
     "#" + d.id + " does NOT trap focus (it is used while the scene runs)");
}

// ---- 9. HELP rows never shadow another control's ? -------------------------------------
// #8's first cut added Stained glass rows "Cell size" and "Shimmer" tagged "all"; ctlHelpBlurb
// takes the first row whose `w` the live effect carries, and every effect carries "all", so
// Gyroid's Cell size and Cymatics'/Aurora's Shimmer showed the filter's text. Review caught
// it, no probe did. Markers: `const HELP = {` .. `const helpEl` (pure data, so new Function).
const hA = js.indexOf("const HELP = {"), hB = js.indexOf("const helpEl", hA);
ok(hA >= 0 && hB > hA, "HELP literal found between its markers");
const HELP_ROWS = hA >= 0 && hB > hA ? new Function(js.slice(hA, hB) + "; return HELP;")().sliders : [];
const TAG_SETS = [...js.matchAll(/helpTags:\s*(\[[^\]]*\])/g)].map(m => JSON.parse(m[1]));
const CTLS = [...js.matchAll(/\{ key: "(\w+)", host: "(\w+)"[^\n]*?label: "([^"]+)"/g)]
  .map(m => ({ key: m[1], host: m[2], label: m[3] }));
ok(HELP_ROWS.length > 0 && TAG_SETS.length > 0 && CTLS.length > 0,
   "HELP rows, effect helpTags and CONTROLS labels all parsed",
   HELP_ROWS.length + " / " + TAG_SETS.length + " / " + CTLS.length);
const helpKey = n => n.split(" / ")[0];   // ctlHelpBlurb's own label match
// (a) two rows with one label that some effect sees both of: the earlier row wins the ?.
const pairs = [];
for (let i = 0; i < HELP_ROWS.length; i++) for (let j = i + 1; j < HELP_ROWS.length; j++) {
  const a = HELP_ROWS[i], b = HELP_ROWS[j];
  if (helpKey(a.n) === helpKey(b.n) && TAG_SETS.some(t => t.includes(a.w) && t.includes(b.w)))
    pairs.push(a.n + " [" + a.w + "] vs [" + b.w + "]");
}
ok(pairs.length === 0, "no two HELP rows an effect sees share a label", pairs.join(", "));
// (b) an "all" row for a filter param is never read by that param's ? (FILTERS[].help is),
// so all it can do is hijack a non-filter control of the same label — even one with no row.
const filterLabels = new Set(CTLS.filter(c => c.host === "filter").map(c => c.label));
const hijacks = HELP_ROWS.filter(s => s.w === "all" && filterLabels.has(helpKey(s.n)))
  .flatMap(s => CTLS.filter(c => c.host !== "filter" && c.label === helpKey(s.n)).map(c => s.n + " -> " + c.key));
ok(hijacks.length === 0, "no \"all\" HELP row named like a filter param shadows another control", hijacks.join(", "));

console.log("\n" + (fail ? fail + " FAILED, " + pass + " passed" : "all " + pass + " passed"));
process.exit(fail ? 1 : 0);
