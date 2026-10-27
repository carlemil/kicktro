// tempoui-check.js — the TEMPO feature's DOM surface. A browser check, deliberately NOT named
// *probe.js (/deploy runs `node tools/*probe.js` over the whole directory, and this one needs a
// real browser).
//
// tempoprobe covers the tracker's maths. What it cannot see is whether any of it is reachable:
// whether the Tempo rows render, whether the anticipatory shapes are offered, and — the one
// that matters — whether the pulse PLOT agrees with what the slider will actually do. The plot
// is drawn from the same formula updateAnims applies precisely so it cannot disagree, and a
// predictive shape has to read as a RISE INTO the beat rather than a fall away from it.
//
// Usage: node tools/tempoui-check.js <scratchdir> [built.html]   then run the printed msedge line
const fs = require("fs");
const path = require("path");
const NL = "\n";
const outDir = process.argv[2] || ".";
const app = fs.readFileSync(process.argv[3] || "dev-index.html", "utf8");

const seed = ["<script>",
  "try{localStorage.clear();localStorage.setItem('burnTheWeb.v1',JSON.stringify({panelOpen:true,cycle:false,tdur:[0,0]}));",
  "localStorage.setItem('burnTheWeb.tutorial.v1','1');localStorage.setItem('burnTheWeb.credits.v1','off');",
  "localStorage.setItem('burnTheWeb.sync.v1',JSON.stringify({shows:9,done:true}));}catch(e){}",
  "window.__e=0;var ce=console.error;console.error=function(){window.__e++;ce.apply(console,arguments)};",
  "window.addEventListener('error',function(){window.__e++});",
  "</" + "script>"].join(NL);

const body = ["<script>", "setTimeout(function(){",
  "var P=0,F=0;",
  // Hard-fail a swapped ok(name, cond): a name is always truthy, so the swap passes everything.
  "function ok(n,c,d){ if(typeof n!=='string'){console.log('CHK FAIL probe bug: ok() name not a string');F++;return;}",
  "  if(c){P++;console.log('CHK PASS '+n+(d?'  ['+d+']':''));} else {F++;console.log('CHK FAIL '+n+(d?'  ['+d+']':''));} }",
  "function vis(q){return [].slice.call(document.querySelectorAll(q)).filter(function(n){return n.offsetParent!==null})}",

  // ---- 1. the global Tempo rows in the Beat tuning box ----------------------------------
  "var bd=document.getElementById('beatDetails'); bd.open=true;",
  "setTimeout(function(){",
  "  var secs=[].slice.call(document.querySelectorAll('#beatBody .beat-sec')).map(function(n){return n.textContent});",
  "  ok('Beat tuning box has a Tempo section', secs.some(function(t){return /Tempo/i.test(t)}), secs.length+' sections');",
  "  var names=[].slice.call(document.querySelectorAll('#beatBody .beat-name')).map(function(n){return n.textContent});",
  "  ok('...with a lead row', names.indexOf('lead')>=0);",
  "  ok('...and a lock tick', names.indexOf('lock')>=0 && !!document.querySelector('#beatBody input[type=checkbox]'));",
  "  ok('...and a live BPM readout', !!document.getElementById('beatBpm'));",
  "  bd.open=false;",

  // ---- 2. the anticipatory shapes are offered ---------------------------------------------
  "  var row=vis('select.lyr-name')[0];",
  "  var o=[].slice.call(row.options).filter(function(x){return x.textContent.trim()==='Plasma'})[0];",
  "  row.value=o.value; row.dispatchEvent(new Event('change',{bubbles:true}));",
  "  var chev=document.querySelector('#panel .lyr button.lyr-pop'); if(chev) chev.click();",
  "  setTimeout(function(){",
  // Pop a slider out: the Triggers section (shape picker + plot) exists only in a break-out box.
  // The launchers live in the LAYER BOX, which itself lives in #breakout -- the layer block
  // moved out of the panel, so scoping this to #panel found nothing.
  "    var launch=vis('.ctl-row button')[0]; if(launch) launch.click();",
  // THE TRIGGER BODY IS HIDDEN UNTIL A CHIP IS ARMED, so the shape picker and the plot do not
  // exist to be measured until one is. Arm the low band on this slider first -- and note the
  // chips live beside the label in the BOX, not in the menu row.
  "    setTimeout(function(){ var chip=vis('#breakout .bandchips button')[0]; if(chip) chip.click(); },150);",
  "    setTimeout(function(){",
  "      var sel=vis('#breakout select.pulse-pick')[0] || vis('#breakout .trig-body select')[0];",
  "      if(!sel){ var alls=vis('#breakout select'); sel=alls.filter(function(s){return [].slice.call(s.options).some(function(o){return /Snap/i.test(o.textContent)})})[0]; }",
  "      ok('the shape picker is reachable in a break-out box', !!sel);",
  "      if(!sel){ console.log('CHK DONE fails='+(F+1)); return; }",
  "      var keys=[].slice.call(sel.options).map(function(o){return o.value});",
  "      ok('the anticipatory shapes are offered', keys.indexOf('rise')>=0 && keys.indexOf('swoop')>=0 && keys.indexOf('breathe')>=0, keys.join(','));",

  // ---- 3. A PINNED SLIDER STILL PLOTS ITS SHAPE ----------------------------------------------
  // Every shipped slider is pinned (lo == hi). The plot used to draw that as a flat line, which
  // read as a broken plot; it now draws the shape dimmed, with a tooltip saying why.
  "      var box=sel.closest('.ctl');",
  "      var cv0=box.querySelector('canvas.pulse-plot');",
  "      function spanY(cv){ var c=cv.getContext('2d'), d=c.getImageData(0,0,cv.width,cv.height).data, ys={};",
  "        for(var x=0;x<cv.width;x++){ for(var y=0;y<cv.height;y++){ var p=((y*cv.width)+x)*4;",
  "          if(d[p+3]>90 && d[p]>200 && d[p+1]>110 && d[p+1]<190 && d[p+2]<110) ys[y]=1; } }",
  "        var k=Object.keys(ys).map(Number); return k.length ? Math.max.apply(null,k)-Math.min.apply(null,k) : 0; }",
  "      setShape0('snap');",
  "      function setShape0(k){ sel.value=k; sel.dispatchEvent(new Event('change',{bubbles:true})); }",
  "      var sp0=cv0?spanY(cv0):0;",
  "      ok('a PINNED slider still plots the shape, not a flat line', !!cv0 && sp0 > cv0.height*0.4, 'orange rows span '+sp0+' of '+(cv0&&cv0.height));",
  "      ok('...and says why the shape will not move it', !!cv0 && /Spread/.test(cv0.title||''), cv0&&cv0.title);",

  // ---- 4. THE PLOT MUST NOT CONTRADICT THE SLIDER -------------------------------------------
  // Spread the thumbs first, so the plot is the slider's real travel.
  "      var lo=box.querySelector('.thumb-lo')||box.querySelector('input[type=range]');",
  "      var hi=box.querySelector('.thumb-hi');",
  "      if(lo&&hi){ lo.value=lo.min; hi.value=hi.max; lo.dispatchEvent(new Event('input',{bubbles:true})); hi.dispatchEvent(new Event('input',{bubbles:true})); }",
  "      var cv=box.querySelector('canvas.pulse-plot');",
  "      ok('the box has a pulse plot', !!cv);",
  "      function tilt(){",  // mean y of lit pixels, left third vs right third; smaller y = higher
  "        var c=cv.getContext('2d'), d=c.getImageData(0,0,cv.width,cv.height).data;",
  "        var L={s:0,n:0},R={s:0,n:0};",
  "        for(var x=0;x<cv.width;x++){ for(var y=0;y<cv.height;y++){ var a=d[((y*cv.width)+x)*4+3];",
  "          if(a>40){ var t=(x<cv.width/3)?L:(x>cv.width*2/3?R:null); if(t){t.s+=y;t.n++;} } } }",
  "        return {l:L.n?L.s/L.n:-1, r:R.n?R.s/R.n:-1, ln:L.n, rn:R.n};",
  "      }",
  "      function setShape(k){ sel.value=k; sel.dispatchEvent(new Event('change',{bubbles:true})); }",
  "      setShape('snap');",
  "      var A=tilt();",
  "      setShape('rise');",
  "      var B=tilt();",
  "      ok('both plots actually drew something', A.ln>0&&A.rn>0&&B.ln>0&&B.rn>0, 'snap '+A.ln+'/'+A.rn+'  rise '+B.ln+'/'+B.rn);",
  // Snap: the beat is near the LEFT, so the curve is high on the left and decays rightward.
  "      ok('a RELEASE shape plots high on the left, falling right', A.l < A.r, 'meanY L '+A.l.toFixed(0)+' R '+A.r.toFixed(0));",
  // Rise: the beat is near the RIGHT, so the curve climbs into it -- the opposite tilt.
  "      ok('an ANTICIPATORY shape plots the other way: rising INTO the beat', B.r < B.l, 'meanY L '+B.l.toFixed(0)+' R '+B.r.toFixed(0));",
  "      ok('no console errors', window.__e===0, 'errs='+window.__e);",
  "      console.log('CHK DONE fails='+F+' passes='+P);",
  "    },700);",
  "  },500);",
  "},400);",
  "},1800);", "</" + "script>"].join(NL);

let s = app.split("<head>").join("<head>" + NL + seed);
s = s.split("</body>").join(body + NL + "</body>");
const file = path.join(outDir, "tempoui.html");
fs.writeFileSync(file, s);
console.log("wrote " + file);
console.log('Run: msedge --headless=new --disable-extensions --enable-logging=stderr --v=0 ' +
  '--window-size=1600,1000 --virtual-time-budget=40000 --user-data-dir=<tmp> "file:///' +
  file.replace(/\\/g, "/") + '"');
