// --- "Show author" has to visibly do something --------------------------------------------
//
// Reported as doing nothing you can see, and it had two separate reasons to look that way.
// It gated the WHOLE banner rather than the author, so with no profile name and no collection
// there was no author to append, the scene name was suppressed along with it, and the tick
// changed nothing whichever way you set it. And the banner is only ever armed when a scene is
// SELECTED, so toggling it had no effect until the next time you picked one.
//
// Also `origin`: a scene copied from someone else keeps naming its first author, as
// "name · original author · collection-or-you" (New from a borrowed scene stamps it).
//
// Browser check: the banner is DOM chrome on a rendered-time countdown, so it is about what
// actually lands in #scenebanner. Deliberately NOT named *probe.js.
"use strict";
const fs = require("fs");
const path = require("path");
const NL = "\n";
const outDir = process.argv[2];
const appFile = process.argv[3] || "dev-index.html";
if (!outDir) { console.log("usage: node tools/author-check.js <outdir> [dev-index.html]"); process.exit(1); }
const app = fs.readFileSync(appFile, "utf8");

const seed = ["<script>",
  "try{localStorage.clear();"
  + "localStorage.setItem('burnTheWeb.v1',JSON.stringify({panelOpen:true,cycle:false,curPreset:0,presets:[{name:'Alpha',effect:'plasma',state:{},beat:{},extra:{}},{name:'Beta',collection:'Bob',origin:'Ann',effect:'plasma',state:{},beat:{},extra:{}},{name:'Gamma',collection:'Bob',origin:'Bob',effect:'plasma',state:{},beat:{},extra:{}},{name:'Delta',collection:'Shared with you',origin:'Cleo',effect:'plasma',state:{},beat:{},extra:{}},{name:'Eps',collection:'Shared with you',effect:'plasma',state:{},beat:{},extra:{}}]}));"
  + "localStorage.setItem('burnTheWeb.tutorial.v1','1');"
  + "localStorage.setItem('burnTheWeb.credits.v1','off');"
  // A profile name, so there IS an author to show -- the whole question is whether the tick
  // puts it on the banner, and with nobody to credit the check would prove nothing.
  + "localStorage.setItem('burnTheWeb.profile.v1','Testy');"
  + "localStorage.setItem('burnTheWeb.sync.v1',JSON.stringify({shows:9,done:true}))}catch(e){}",
  "var __n=0;requestAnimationFrame=function(f){return (++__n<10)?setTimeout(function(){f(performance.now())},16):0};",
  "</" + "script>"].join(NL);

const body = [
  "var fails=0;",
  "function ok(n,c,d){ if(typeof n!=='string'){console.log('\"BAD ASSERTION\"');fails++;return;}",
  "  if(!c)fails++; console.log('\"'+(c?'PASS':'FAIL')+' '+n+(d?'  ['+d+']':'')+'\"'); }",
  "var chk=document.getElementById('sceneTitleOn');",
  "var ban=document.getElementById('scenebanner');",
  "ok('the tick and the banner both exist', !!chk && !!ban);",
  "function pick(){ var rows=[].slice.call(document.querySelectorAll('.pl-scene'));",
  "  if(rows.length) rows[0].click(); return ban.textContent.trim(); }",
  // ---- ON: the author is appended -------------------------------------------------------
  "chk.checked=true; chk.dispatchEvent(new Event('change',{bubbles:true}));",
  "var onText=ban.textContent.trim();",
  "ok('ticking it puts the author on the banner AT ONCE', /Testy/.test(onText), onText||'(empty)');",
  "ok('...alongside the scene name', onText.replace(/\\s*·\\s*Testy$/,'').length>0, onText);",
  // ---- OFF: the name stays, the author goes ---------------------------------------------
  "chk.checked=false; chk.dispatchEvent(new Event('change',{bubbles:true}));",
  "var offText=ban.textContent.trim();",
  "ok('UNTICKING IT REMOVES THE AUTHOR', !/Testy/.test(offText), offText||'(empty)');",
  "ok('...but KEEPS the scene name -- it is not a switch for the whole banner',",
  "   offText.length>0, offText||'(empty)');",
  "ok('...and that name is the same one', offText===onText.replace(/\\s*·\\s*Testy$/,''),",
  "   JSON.stringify(offText)+' vs '+JSON.stringify(onText));",
  // ---- it survives a real scene selection too --------------------------------------------
  "chk.checked=true; chk.dispatchEvent(new Event('change',{bubbles:true}));",
  "var sel=pick();",
  "ok('selecting a scene still credits it', /Testy/.test(sel), sel||'(empty)');",
  // ---- the hint --------------------------------------------------------------------------
  "var hint=document.getElementById('sceneAuthorHint');",
  "ok('the hint names who the scene is credited to', !!hint && /Testy/.test(hint.textContent),",
  "   hint?hint.textContent:'missing');",
  // ---- origin: a copied scene keeps its FIRST author ----------------------------------
  // Seeded above: Beta is a borrowed scene (collection Bob) that Bob had copied from Ann.
  "var ps=document.getElementById('preset');",
  "function selScene(i){ ps.value=i; ps.dispatchEvent(new Event('change',{bubbles:true})); return ban.textContent.trim(); }",
  "var b1=selScene(1);",
  "ok('a borrowed scene names its ORIGINAL author between the name and the collection',",
  "   /^Beta\\s*·\\s*Ann\\s*·\\s*Bob$/.test(b1), b1||'(empty)');",
  "var b2=selScene(2);",
  "ok('an origin equal to the collection is shown once', /^Gamma\\s*·\\s*Bob$/.test(b2), b2||'(empty)');",
  "window.prompt=function(){return 'Beta copy'};",
  "selScene(1); document.getElementById('newpreset').click();",
  "var saved=JSON.parse(localStorage.getItem('burnTheWeb.v1')); var last=saved.presets[saved.presets.length-1];",
  "ok('New from a borrowed scene records its first author as origin', !!last&&last.name==='Beta copy'&&last.origin==='Ann',",
  "   JSON.stringify(last&&{name:last.name,origin:last.origin,collection:last.collection}));",
  "var b3=selScene(saved.presets.length-1);",
  "ok('...and the copy is credited to Ann AND you', /^Beta copy\\s*·\\s*Ann\\s*·\\s*Testy$/.test(b3), b3||'(empty)');",
  // ---- Shared with you is a folder, not an author --------------------------------------
  "var b4=selScene(3);",
  "ok('a shared scene is credited to its author ALONE, never to the folder Shared with you', /^Delta\\s*·\\s*Cleo$/.test(b4), b4||'(empty)');",
  "ok('...and the hint names that author', /^Credited to Cleo\\.$/.test(hint.textContent), hint.textContent);",
  "var b5=selScene(4);",
  "ok('a shared scene with no author is credited to NOBODY -- not the folder, not you', /^Eps$/.test(b5), b5||'(empty)');",
  "ok('...and the hint says so', /without an author/.test(hint.textContent) && !/Shared with you|Testy/.test(hint.textContent), hint.textContent);",
  "var b6=selScene(1);",
  "ok('the hint reads a two-part credit as the author, via the collection', /^Credited to Ann, via Bob\\.$/.test(hint.textContent), hint.textContent);",
  "console.log('\"DONE fails='+fails+'\"');",
].join(NL);

const inject = ["<script>",
  "(function(){function go(){setTimeout(function(){", body, "},2400);}",
  "if(window.__appReady)go(); else addEventListener('app:ready',go,{once:true});})();", "</" + "script>"].join(NL);
let s = app.split("<head>").join("<head>" + NL + seed);
s = s.split("</body>").join(inject + NL + "</body>");
const out = path.join(outDir, "author.html");
fs.writeFileSync(out, s);
console.log("wrote " + out);
console.log("run: msedge --headless=new --disable-extensions --enable-logging=stderr --v=0 "
  + "--window-size=1400,900 --virtual-time-budget=30000 "
  + '--user-data-dir="' + path.join(outDir, "ud-author") + '" "file:///' + out.replace(/\\/g, "/")
  + "\" 2>&1 | grep -oE '\"(PASS|FAIL|DONE)[^\"]*\"'");
