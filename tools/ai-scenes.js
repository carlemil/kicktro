// The "AI-Generated" scene collection: twenty-five beat-synced scenes built from shipped effects and
// filters, authored SPARSELY in the wire format (string effect + palette ids, [lo,hi] pairs)
// and handed out as a #zp= bundle link. Everything not named here is the effect's default
// (mergeState/mergeBeat/mergePulse/mergePlen overlay only the supplied keys), so the file
// stays readable and a registry default that moves later moves these scenes with it.
//
//   node tools/ai-scenes.js                       print the https://kicktro.com/#zp= link
//   node tools/ai-scenes.js --json                print the bundle blob
//   node tools/ai-scenes.js --emit                write src/gallery-builtin.js (the built-in gallery)
//   node tools/ai-scenes.js --check <outdir>      vocabulary check + one probe page per scene,
//                                                 then the msedge lines to run
//   node tools/ai-scenes.js --check <outdir> --run  ...and run them (real GPU headless Edge),
//                                                 printing AISCENE|i|name|scenenow|errors|glErr
//                                                 (--only 3,7 renders just those)
//
// Install: open the link in a browser signed in as the target account, choose Replace,
// Restore, Save to cloud, tick Publish to gallery.
//
// Authoring shorthand, expanded by build(): a state value is  v  (pinned, stored [v, v]),
// [lo, hi]  (drifts between the thumbs), or  [lo, hi, "band/shape/len"]  (armed on that
// band — low/mid/high — with that pulse shape and length in seconds). Only reactive shapes
// (snap pluck sustain ease bounce steps swell bloom): the anticipatory ones need tempo lock,
// which ships off. Never arm a `single` control (counts, enums) — they have no chips.
// Layer 0 is the bottom; the shared filter keys (bloom, vignette, grain, scan, scancount,
// barrel, burn) are read from layer 0's state on load, so they live there.
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib"), { spawnSync } = require("child_process");

const L = (effect, palette, state, filters, blend, gain) => ({ effect, palette, state, filters, blend, gain });

const DESIGN = [
  ["Neon Reef", [
    L("voronoi", "electric", { vocells: [5, 9], voedge: [0.3, 0.9, "mid/pluck/0.25"], vojit: 0.8, vospeed: 0.4,
      zfb: 1.015, zfbkeep: 0.85, bloom: 0.35 }, ["zoomfb", "bloom"], "max", 1),
    L("metaballs", "ice", { mbcount: 6, mbradius: [0.10, 0.22, "low/swell/0.35"], mbspeed: 0.7, mbgain: 1.1,
      chroma: [0.5, 4, "high/snap/0.2"] }, ["chroma", "bloom"], "add", 0.6),
  ]],
  ["Storm Front", [
    L("clouds", "sunset", { clcover: 0.6, clscale: 1.2, cllight: [0.8, 2.4, "low/ease/0.5"], clspeed: 1.2,
      vignette: 0.45, grain: 0.06, bloom: 0.4 }, ["vignette", "grain"], "max", 1),
    L("lightning", "electric", { ltstrike: [0, 1, "low/snap/0.3"], ltrate: 0.3, ltbolts: 3, ltglow: [0.3, 0.9, "high/pluck/0.2"],
      diffuse: 2.5, diffkeep: 0.9 }, ["diffuse", "bloom"], "add", 0.9),
  ]],
  ["Slime Cathedral", [
    L("physarum", "greenhaze", { phcount: 3500, phsense: [6, 20, "mid/snap/0.3"], phspeed: [0.8, 2.4, "low/sustain/0.4"],
      phdecay: 0.92, phscatter: 0.35, fade: 0.97, edge: 0.5, bloom: 0.45 }, ["fade", "edge", "bloom"], "max", 1),
    L("gyroid", "copper", { gyfreq: 1.8, gythick: [0.25, 0.6, "low/ease/0.35"], gyglow: [0.3, 1.2, "high/pluck/0.2"],
      gywarp: 0.5, gyspeed: 0.6 }, [], "ddg", 0.6),
  ]],
  ["Ember Attractor", [
    // Two de Jong attractors: the coefficients ARE the shape, so a beat on a coefficient morphs
    // the whole figure. The lower one is mirrored fourfold and swirls its trail; the upper one
    // has jitter that puffs it on the highs.
    L("attractor", "ember", { ata: [1.2, 1.7, "low/ease/0.5"], atb: -2.3, atc: [2.2, 2.6, "mid/sustain/0.4"], atd: -2.1,
      atjit: 0.3, points: 20000, swirl: [2, 9, "low/snap/0.3"], swirlkeep: 0.95, mirror: 3, bloom: 0.5 },
      ["swirl", "mirror", "bloom"], "max", 1),
    L("attractor", "fire", { ata: -1.9, atb: [1.6, 2.1, "low/pluck/0.35"], atc: -0.7, atd: -2.4,
      atjit: [0.2, 1.4, "high/pluck/0.2"], points: 14000, fade: 0.96 }, ["fade"], "add", 0.8),
  ]],
  ["Deep Sea Glass", [
    L("ocean", "ice", { gosurf: 2, goheight: [0.8, 1.5, "low/ease/0.6"], goreflect: 0.8, gofoam: [0.3, 0.8, "high/pluck/0.2"],
      gochop: 2.5, bloom: 1.2, vignette: 0.35 }, ["bloom", "vignette"], "max", 1),
    L("glass", "chrome", { gbcount: 2, gbsize: 0.5, gbmat: 0, gbior: [1.3, 1.9, "low/sustain/0.4"], gbglow: [0.5, 1.4, "mid/snap/0.2"],
      chroma: 1.2 }, ["chroma"], "add", 1),
  ]],
  ["Mandelbox Drive", [
    L("mbox", "purple", { bxscale: [-1.75, -1.55, "low/ease/0.5"], bxglow: [0.4, 1.4, "high/pluck/0.2"], bxspeed: 0.8,
      rblamt: [0.3, 1.8, "low/snap/0.3"], rblmix: 0.6, bloom: 0.4 }, ["rblur", "bloom"], "max", 1),
    L("starfield", "chrome", { stspeed: [0.6, 3, "low/swell/0.3"], stwarp: [0, 0.7, "mid/ease/0.35"], stdensity: 1.4,
      diffuse: 2, diffkeep: 0.93 }, ["diffuse"], "add", 0.7),
  ]],
  ["Truchet Circuit", [
    L("truchet", "c64", { trucells: [6, 10, "mid/steps/0.4"], truwidth: [0.2, 0.5, "low/pluck/0.25"], truspeed: 1.5,
      pixel: 6, crtmask: 0.5, crtbleed: 0.4, bloom: 0.3, scan: 0.4, scancount: 240 }, ["pixelate", "crt"], "max", 1),
    L("munch", "cga", { xorspeed: [10, 50, "low/snap/0.2"], xorscale: 0.5, poster: 4 }, ["poster"], "xor", 0.4),
    L("copperbars", "rainbow", { cbcount: 4, cbspeed: [0.5, 2, "high/pluck/0.2"], cbwidth: 0.06 }, ["scanlines"], "add", 0.3),
  ]],
  ["Galaxy Bloom", [
    L("aurora", "verdant", { aucurtains: 3, ausway: 0.4, aushimmer: [0.6, 2.5, "high/snap/0.2"],
      soften: -0.3, softrad: 2.5, bloom: 0.45 }, ["soften"], "max", 1),
    L("galaxy", "purple", { gxarms: 3, gxspin: [0.3, 1.2, "low/ease/0.5"], gxcore: [0.2, 0.9, "high/pluck/0.2"], gxscatter: 0.35,
      points: 20000, zoom: 2, fade: 0.965 }, ["fade", "bloom"], "add", 0.9),
    L("harmonograph", "electric", { hgratio: 2.5, hgdetune: [0.005, 0.04, "mid/bounce/0.4"], hgmorph: [0.2, 1.4, "low/sustain/0.35"],
      points: 20000, fade: 0.98, chroma: 1.5 }, ["fade", "chroma"], "add", 0.5),
  ]],
  ["Event Horizon", [
    L("bhole", "amber", { bhtilt: 18, bhspin: [0.8, 2.5, "low/ease/0.45"], bhbeam: [0.6, 1.4, "mid/pluck/0.25"], bhorbit: 0.1,
      shock: [0, 1, "low/snap/0.6"], shockamp: 0.08, shockwidth: 0.14, bloom: 0.5, vignette: 0.4 }, ["shock", "bloom", "vignette"], "max", 1),
    L("cymatics", "ice", { cymode: [3, 7, "low/steps/0.5"], cysharp: 6, cyshimmer: [0.3, 1.5, "high/pluck/0.2"],
      edge: 0.6, dithlvl: 5 }, ["edge", "dither"], "diff", 0.55),
  ]],
  ["Menger Bass", [
    L("menger", "toxic", { mgdive: [0.4, 1.6, "low/sustain/0.5"], mgglow: [0.3, 1.1, "high/pluck/0.2"], mgrot: 0.3,
      chroma: [0.3, 3.5, "low/snap/0.2"], bloom: 0.4, grain: 0.05 }, ["chroma", "bloom", "grain"], "max", 1),
    L("ribbons", "tricolor", { rbcount: 5, rbwidth: [0.25, 0.7, "low/ease/0.3"], rbtwist: [1.5, 6, "mid/bounce/0.5"], rbspeed: 1.2,
      echo: 3, echoang: 90, echokeep: 0.9 }, ["echo"], "add", 0.75),
  ]],

  // ---- 1.84.0: Contours, Smoke, Wobble, Heat haze, VHS tracking --------------------------
  ["Survey Lines", [
    // A living topographic map: the contour count re-slices on the kick, the line thickens on
    // the mid band, and a grid of faint survey markers twinkles over it on the highs.
    L("contours", "verdant", { cnlines: [10, 18, "low/steps/0.4"], cnwidth: [2, 5, "mid/pluck/0.25"], cnscale: 1.6,
      cndrift: 0.5, cnfill: 0.25, bloom: 0.4, vignette: 0.3 }, ["bloom", "vignette"], "max", 1),
    L("shapegrid", "amber", { sgcells: 14, sgdot: [0.08, 0.2, "high/snap/0.2"], sgsquare: 0, sgpulse: 0.3, sgspeed: 1.2 },
      [], "add", 0.4),
  ]],
  ["Chimney", [
    // One plume thickening on the bass through a heat shimmer weighted to the hearth, with
    // curl-flow sparks that leap on the highs.
    L("smoke", "ember", { smrise: [0.8, 1.6, "low/ease/0.5"], smturb: [1.2, 2.6, "mid/sustain/0.4"], smscale: 2.2,
      smdensity: [0.5, 0.8, "low/swell/0.4"], smheight: 0.85, hazeamt: 18, hazescale: 4, hazerise: 1.2, hazegrad: 0.8,
      bloom: 0.5, vignette: 0.4, grain: 0.05 }, ["haze", "bloom", "vignette", "grain"], "max", 1),
    L("curl", "ember", { cucount: 600, cuscale: 2, cuspeed: [0.6, 2, "high/pluck/0.2"], culife: 2, fade: 0.95 },
      ["fade"], "add", 0.4),
  ]],
  ["Tape Rewind", [
    // A demo recorded off air: copper bars and Kefrens bars on a tape whose tracking jumps on
    // the kick, with a starfield bleeding through the same worn heads.
    L("copperbars", "c64", { cbcount: 6, cbspeed: [0.6, 2, "low/snap/0.25"], cbwidth: 0.1,
      vhsjit: [2, 10, "low/snap/0.3"], vhsband: 0.6, vhsbleed: 8, scan: 0.4, scancount: 300, bloom: 0.3 },
      ["vhs", "scanlines", "bloom"], "max", 1),
    L("kefrens", "cga", { kfbars: 5, kfsway: [0.1, 0.35, "mid/ease/0.4"], kfspeed: 1, kfwidth: 0.05 }, [], "add", 0.7),
    L("starfield", "grayscale", { stdensity: 1, stspeed: [0.5, 2, "low/pluck/0.3"], stwarp: 0.2, sttwinkle: 1,
      vhsjit: 4, vhsband: 0.3, vhsbleed: 4 }, ["vhs"], "add", 0.5),
  ]],
  ["Jelly Cathedral", [
    // The gyroid's vaults shudder on every kick; the metaballs inside ripple at a finer, faster
    // wobble so the two never move as one sheet.
    L("gyroid", "purple", { gyfreq: 2, gythick: [0.25, 0.55, "low/ease/0.4"], gyglow: [0.4, 1.2, "high/pluck/0.2"],
      gywarp: 0.6, gyspeed: 0.7, wobamp: [6, 30, "low/snap/0.35"], wobfreq: 3, wobspeed: 1, bloom: 0.45 },
      ["wobble", "bloom"], "max", 1),
    L("metaballs", "ice", { mbcount: 5, mbradius: [0.1, 0.2, "mid/swell/0.3"], mbspeed: 0.8, mbgain: 1.2,
      wobamp: 10, wobfreq: 5, wobspeed: 1.5 }, ["wobble"], "add", 0.6),
  ]],
  ["Mirage Highway", [
    // Flying over hot ground: the terrain's haze thickens on the kick and the shimmer kicks up
    // on the mids, with god rays breathing through the dust.
    L("terrain", "sunset", { teheight: 1.4, tescale: 0.6, teoct: 5, tefog: [0.8, 1.6, "low/ease/0.5"],
      tespeed: [0.8, 1.8, "low/sustain/0.4"], hazeamt: [10, 32, "mid/pluck/0.3"], hazescale: 5, hazerise: 1, hazegrad: 0.9,
      bloom: 0.4, vignette: 0.35, grain: 0.04 }, ["haze", "bloom", "vignette", "grain"], "max", 1),
    L("godray", "amber", { grdecay: 0.96, grweight: [0.8, 1.6, "low/swell/0.4"], grscale: 2.5, grspread: 1, grspeed: 0.8 },
      [], "add", 0.5),
  ]],
  ["Weather Map", [
    // Isobars drawn over a cloud deck, re-gridded on the mids, with lightning striking on the
    // kick and smearing through a short diffuse.
    L("clouds", "grayscale", { clcover: 0.5, clscale: 1.4, cloct: 4, cllight: [0.7, 1.8, "low/ease/0.5"], clspeed: 1,
      bloom: 0.3, vignette: 0.3 }, ["bloom", "vignette"], "max", 1),
    L("contours", "electric", { cnlines: [8, 16, "mid/steps/0.4"], cnwidth: 1.8, cnscale: 1.2, cndrift: 0.4, cnfill: 0 },
      [], "add", 0.8),
    L("lightning", "electric", { ltstrike: [0, 1, "low/snap/0.3"], ltrate: 0.2, ltbolts: 2, ltglow: 0.5,
      diffuse: 2, diffkeep: 0.9 }, ["diffuse"], "add", 0.9),
  ]],
  ["Incense", [
    // A harmonograph's slow pendulum figure under a thin thread of smoke, the plume stirred
    // harder on the bass and the drawing detuned on the mids.
    L("harmonograph", "purple", { hgratio: 2, hgdetune: [0.004, 0.03, "mid/bounce/0.4"], hgdecay: 0.02,
      hgmorph: [0.2, 1, "low/sustain/0.4"], points: 18000, fade: 0.975, bloom: 0.5, vignette: 0.4 },
      ["fade", "bloom", "vignette"], "max", 1),
    L("smoke", "grayscale", { smrise: 0.6, smturb: [0.8, 2, "low/ease/0.5"], smscale: 3, smdensity: 0.5, smheight: 1.2,
      hazeamt: 12, hazescale: 3, hazerise: 0.8, hazegrad: 0.3 }, ["haze"], "add", 0.7),
  ]],
  ["Broken Broadcast", [
    // Four signals fighting for one channel: posterised plasma on a tape that loses tracking
    // on the kick, munching squares XORed in, a twister torn by slice glitch on the highs,
    // and a blocky test-card grid overlaid.
    L("plasma", "rainbow", { pspeed: [0.6, 1.8, "low/ease/0.4"], pscale: 1.2, pwarp: [0.3, 1.2, "mid/pluck/0.3"],
      poster: 5, vhsjit: [3, 14, "low/snap/0.3"], vhsband: [0.4, 0.9, "high/snap/0.2"], vhsbleed: 10,
      scan: 0.35, scancount: 260, bloom: 0.3 }, ["poster", "vhs", "scanlines", "bloom"], "max", 1),
    L("munch", "cga", { xorspeed: [10, 40, "low/snap/0.2"], xorscale: 0.44 }, [], "xor", 0.5),
    L("twister", "chrome", { twcols: 1, twwidth: 0.2, twtwist: [1, 4, "mid/ease/0.4"], twspeed: 1,
      glitch: [0.05, 0.3, "high/pluck/0.2"], glitchrows: 8 }, ["glitch"], "add", 0.7),
    L("shapegrid", "c64", { sgcells: 6, sgdot: [0.1, 0.3, "low/pluck/0.25"], sgsquare: 1, sgpulse: 0.2, sgspeed: 1 },
      [], "ovl", 0.35),
  ]],
  ["Desert Glass", [
    // Two glass balls over a shimmering Voronoi pavement: standalone glass reflects the layer
    // beneath it, so the heat haze on the floor shows up bent in the balls.
    L("voronoi", "amber", { vocells: [4, 8, "mid/steps/0.4"], voedge: 0.7, vojit: 0.8, vospeed: [0.3, 0.9, "low/ease/0.4"],
      hazeamt: 16, hazescale: 4, hazerise: 1, hazegrad: 0.5, bloom: 0.4, vignette: 0.45 },
      ["haze", "bloom", "vignette"], "max", 1),
    L("glass", "chrome", { gbcount: 2, gbsize: 0.55, gbmat: 0, gbior: [1.3, 1.8, "low/sustain/0.4"],
      gbglow: [0.4, 1.2, "high/pluck/0.2"] }, [], "over", 1),
  ]],
  ["Jelly Reef", [
    // Slime-mould coral that sways on the kick, a flock that scatters on it and darts on the
    // highs, and soft bouncing anemones with their own fast wobble.
    L("physarum", "verdant", { phcount: 3000, phsense: [6, 18, "mid/snap/0.3"], phspeed: [0.8, 2, "low/sustain/0.4"],
      phdecay: 0.9, phscatter: 0.3, fade: 0.97, wobamp: [4, 20, "low/pluck/0.35"], wobfreq: 2.5, wobspeed: 0.8,
      bloom: 0.4, vignette: 0.3 }, ["fade", "wobble", "bloom", "vignette"], "max", 1),
    L("boids", "electric", { bdcount: 120, bdspeed: [0.8, 2, "high/pluck/0.25"], bdcoh: 1.2, bdfear: [0, 0.6, "low/snap/0.3"],
      fade: 0.95 }, ["fade"], "add", 1),
    L("bounce", "purple", { bncount: 3, bnrad: [0.06, 0.14, "low/swell/0.3"], bnsquare: 0.2, bnspin: 0.5, bnspeed: 0.8,
      wobamp: 8, wobfreq: 6, wobspeed: 2 }, ["wobble"], "add", 0.7),
  ]],
  ["Steam Room", [
    // Cold-palette steam filling the whole frame, thickening on the bass through a rising
    // shimmer, with soft concentric rings marching out on the mids.
    L("smoke", "ice", { smrise: [0.5, 1.2, "low/ease/0.5"], smturb: 1, smscale: 2.6, smdensity: [0.55, 0.85, "low/swell/0.5"],
      smheight: 1.2, hazeamt: 20, hazescale: 3.5, hazerise: 1.5, hazegrad: 0.4, bloom: 0.5, vignette: 0.45, grain: 0.05 },
      ["haze", "bloom", "vignette", "grain"], "max", 1),
    L("concentric", "grayscale", { cosides: 6, cocount: 8, cothick: 0.2, cospeed: [0.3, 1, "mid/pluck/0.3"], cospin: 0.1,
      zoom: 1.2, soften: -0.5, softrad: 3 }, ["soften"], "add", 0.4),
  ]],
  ["Contour Reactor", [
    // Reaction-diffusion spots breathing on the bass, contour lines over them that wobble on
    // the highs and re-slice on the kick, and a Voronoi mesh overlaid for the cell walls.
    L("reactdiff", "toxic", { rdfeed: 0.03, rdkill: 0.062, rdspeed: 8, rdgain: [0.9, 1.4, "low/swell/0.4"],
      bloom: 0.4, vignette: 0.3 }, ["bloom", "vignette"], "max", 1),
    L("contours", "copper", { cnlines: [6, 14, "low/steps/0.5"], cnwidth: [1.5, 4, "mid/pluck/0.25"], cnscale: 2.5,
      cndrift: 0.8, cnfill: 0.1, wobamp: [3, 16, "high/snap/0.2"], wobfreq: 4, wobspeed: 1.2 }, ["wobble"], "add", 0.8),
    L("voronoi", "electric", { vocells: 10, voedge: [0.6, 0.95, "high/pluck/0.2"], vojit: 0.6, vospeed: 0.6 }, [], "ovl", 0.35),
  ]],
  ["Pirate Signal", [
    // A tunnel on a bad tape: the tracking band tears on the kick through a curved CRT,
    // a thresholded rotozoomer XORed over it and copper bars flashing on the highs.
    L("tunnel", "blood", { tunspeed: [0.6, 2, "low/sustain/0.4"], tuntwist: [0, 0.8, "mid/ease/0.5"], tunrings: 12,
      vhsjit: 5, vhsband: [0.3, 0.9, "low/snap/0.4"], vhsbleed: 12, crtmask: 0.4, crtbleed: 0.4,
      bloom: 0.35, barrel: 0.2, vignette: 0.4 }, ["vhs", "crt", "bloom", "barrel", "vignette"], "max", 1),
    L("rotozoom", "chrome", { rzrot: [0.2, 1, "low/pluck/0.3"], rzzoom: 0.5, rztile: 5, threshlvl: 0.5, threshamt: 0.8 },
      ["thresh"], "xor", 0.4),
    L("copperbars", "tricolor", { cbcount: 3, cbspeed: [0.5, 2.5, "high/snap/0.2"], cbwidth: 0.08 }, [], "add", 0.4),
  ]],
  ["Ash Cloud", [
    // An eruption column, dense and torn, with volcanic lightning inside it on the kick and
    // embers streaming up on the highs.
    L("smoke", "blood", { smrise: [1, 2, "low/ease/0.4"], smturb: [1.6, 3, "mid/sustain/0.4"], smscale: 1.8, smdensity: 0.7,
      smheight: 1, hazeamt: 24, hazescale: 4, hazerise: 1.5, hazegrad: 0.7, bloom: 0.55, vignette: 0.4, grain: 0.08 },
      ["haze", "bloom", "vignette", "grain"], "max", 1),
    L("lightning", "ember", { ltstrike: [0, 1, "low/snap/0.3"], ltrate: 0.15, ltbolts: 2, ltglow: 0.6,
      diffuse: 2, diffkeep: 0.88 }, ["diffuse"], "add", 0.8),
    L("curl", "fire", { cucount: 500, cuscale: 2.5, cuspeed: [0.5, 2, "high/pluck/0.2"], culife: 1.5, fade: 0.94 },
      ["fade"], "add", 0.6),
  ]],
  ["Static Garden", [
    // Four layers: a drifting contour map for the ground, trees swaying on the kick, mist
    // rising through them, and a field of fireflies on a tape that jitters on the bass.
    L("contours", "matrix", { cnlines: 14, cnwidth: 1.5, cnscale: 1.4, cndrift: [0.2, 1, "low/ease/0.5"], cnfill: 0.15,
      bloom: 0.35, vignette: 0.35 }, ["bloom", "vignette"], "max", 1),
    L("trees", "verdant", { trcount: 3, trdepth: 8, trsplit: 2, trangle: [22, 36, "mid/ease/0.4"],
      trsway: [0.2, 0.9, "low/pluck/0.4"], trspeed: 1, fade: 0.9 }, ["fade"], "add", 0.8),
    L("smoke", "grayscale", { smrise: 0.7, smturb: 1.4, smscale: 3, smdensity: 0.45, smheight: 0.9,
      hazeamt: 10, hazescale: 4, hazerise: 0.8, hazegrad: 0.6 }, ["haze"], "add", 0.5),
    L("shapegrid", "amber", { sgcells: 10, sgdot: [0.05, 0.15, "high/snap/0.2"], sgsquare: 0, sgpulse: 0.4, sgspeed: 1.5,
      vhsjit: [1, 6, "low/snap/0.3"], vhsband: 0.2, vhsbleed: 4 }, ["vhs"], "add", 0.45),
  ]],
];

// Expand the shorthand into a wire-format layer item.
function layerOut(l) {
  const state = {}, beat = {}, pulse = {}, plen = {};
  for (const k in l.state) {
    const v = l.state[k];
    if (!Array.isArray(v)) { state[k] = [v, v]; continue; }
    state[k] = [v[0], v[1]];
    if (v[2]) {
      const [band, shape, len] = v[2].split("/");
      beat[k] = { low: band === "low", mid: band === "mid", high: band === "high" };
      pulse[k] = shape; plen[k] = +len;
    }
  }
  return { effect: l.effect, state, beat, pulse, plen, palette: l.palette, filters: l.filters, blend: l.blend, gain: l.gain };
}
function build() {
  return DESIGN.map(([name, layers]) => {
    const out = layers.map(layerOut), l0 = out[0];
    // validatePresetList needs truthy state/beat/extra and a known top-level effect; the
    // rest of the picture rides in `layers`.
    return { name, effect: l0.effect, state: l0.state, beat: l0.beat, pulse: l0.pulse, plen: l0.plen,
             extra: { palette: l0.palette, filters: l0.filters }, layers: out };
  });
}
const SCENES = build();
// A built-in card's id is 'builtin:' + this, so it must stay stable: favourites are stored under it.
function builtinSlug(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); }
const blob = { presets: SCENES, cycle: true, curPreset: 0 };
const link = "https://kicktro.com/#zp=" + zlib.deflateRawSync(Buffer.from(JSON.stringify(blob))).toString("base64url");

// ---- vocabulary check against the built page: every id and key must exist ----
function checkVocab(html) {
  const ids = re => new Set([...html.matchAll(re)].map(m => m[1]));
  const all = ids(/\{ id: "([a-z0-9]+)"/g);                         // effects + filters (+ others, harmless)
  const keys = ids(/\{ key: "([a-z0-9]+)", host: "(?:fx|filter|pal)"/g);
  const pals = new Set((html.match(/const PAL_IDS = \[([^\]]*)\]/) || ["", ""])[1].match(/"([a-z0-9]+)"/g).map(s => s.slice(1, -1)));
  const single = ids(/\{ key: "([a-z0-9]+)", host: "(?:fx|filter)"[^\n]*single: true/g);
  const shapes = new Set(["snap", "pluck", "sustain", "ease", "bounce", "steps", "swell", "bloom"]);
  const blends = new Set((html.match(/const BLEND_MODES = \[[\s\S]*?\n  \];/) || [""])[0].match(/id: "([a-z]+)"/g).map(s => s.slice(5, -1)));
  const bad = [];
  for (const [name, layers] of DESIGN) for (const l of layers) {
    if (!all.has(l.effect)) bad.push(name + ": effect " + l.effect);
    if (!pals.has(l.palette)) bad.push(name + ": palette " + l.palette);
    if (!blends.has(l.blend)) bad.push(name + ": blend " + l.blend);
    for (const f of l.filters) if (!all.has(f)) bad.push(name + ": filter " + f);
    for (const k in l.state) {
      if (!keys.has(k)) bad.push(name + ": key " + k);
      const v = l.state[k];
      if (Array.isArray(v) && v[2]) {
        if (single.has(k)) bad.push(name + ": armed single control " + k);
        if (!shapes.has(v[2].split("/")[1])) bad.push(name + ": shape " + v[2]);
      }
    }
  }
  return bad;
}

// ---- probe pages: seed the library into localStorage, land on scene i, report ----
function probePage(html, i) {
  const NL = String.fromCharCode(10);
  const seed = JSON.stringify({ presets: SCENES, curPreset: i, cycle: false, tdur: [0, 0], panelOpen: false, audio: "off" });
  const head = [
    "<script>",
    "localStorage.setItem('burnTheWeb.tutorial.v1','true');",
    "localStorage.setItem('burnTheWeb.sync.v1',JSON.stringify({shows:3,sinceLast:0,used:true}));",
    "localStorage.setItem('burnTheWeb.credits.v1','off');",
    "localStorage.setItem('burnTheWeb.v1'," + JSON.stringify(seed) + ");",
    // curPreset only SELECTS; the one-shot the Restore dialog writes is what makes startup APPLY it.
    "sessionStorage.setItem('btw.applyPreset','" + i + "');",
    "var errs=0, glc=null; window.addEventListener('error',function(){errs++});",
    "var ce=console.error; console.error=function(){errs++; ce.apply(console,arguments)};",
    "var gc=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(t){var c=gc.apply(this,arguments); if(t==='webgl2'&&c) glc=c; return c;};",
    "setTimeout(function(){ requestAnimationFrame(function(){",
    "  var now=(document.getElementById('scenenow')||{}).textContent||'';",
    "  console.log('AISCENE|" + i + "|" + SCENES[i].name + "|'+now+'|'+errs+'|'+(glc?glc.getError():'nogl'));",
    "}); }, 3000);",
    "</script>",
  ].join(NL);
  return html.replace("<head>", "<head>" + head);
}

const argv = process.argv.slice(2);
if (argv[0] === "--emit") {
  // The BUILT-IN gallery: the same deflated blob the #zp= link carries, shipped inside the app
  // so the gallery lists these scenes without an account or a network. Two lists from it:
  // BUILTIN_GALLERY, the collection row (Collections tab, and what a follow of
  // 'builtin:ai-generated' resolves to), and BUILTIN_SCENES, one card per scene ('at' is its
  // index in that blob). A card's thumbnail is thumbs/<slug>.webp + .mp4 beside the page,
  // rendered by tools/thumbs.js --builtin; 'thumb' is a hash of both files (cache-busting the
  // URL), empty when they have not been rendered yet. Run thumbs.js, then this, then build.
  const payload = zlib.deflateRawSync(Buffer.from(JSON.stringify(blob))).toString("base64url");
  // The date is when the SCENES last changed: it is what orders the built-in cards under
  // Newest, so re-emitting for new thumbnails alone must not make them look freshly published.
  const out = path.join(__dirname, "..", "src", "gallery-builtin.js");
  const prev = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  const kept = prev.indexOf("payload: \"" + payload + "\"") >= 0 && /updated: "(\d{4}-\d\d-\d\d)"/.exec(prev);
  const updated = kept ? kept[1] : new Date().toISOString().slice(0, 10);
  const thumbs = path.join(__dirname, "..", "thumbs");
  const cards = SCENES.map((sc, at) => {
    const slug = builtinSlug(sc.name);
    const files = ["webp", "mp4"].map(x => path.join(thumbs, slug + "." + x));
    const thumb = files.every(f => fs.existsSync(f))
      ? require("crypto").createHash("sha1").update(Buffer.concat(files.map(f => fs.readFileSync(f)))).digest("hex").slice(0, 10)
      : "";
    return "    { id: " + JSON.stringify("builtin:" + slug) + ", name: " + JSON.stringify(sc.name)
      + ", at: " + at + ", thumb: " + JSON.stringify(thumb) + " },";
  });
  const src = [
    "  // ---- built-in gallery entries ----------------------------------------------------",
    "  // GENERATED by 'node tools/ai-scenes.js --emit' -- do not hand-edit. Listed by the Public",
    "  // scenes dialog WITHOUT any network. 'payload' is the same deflated libraryUrl-shaped blob",
    "  // a cloud profile carries, so galFetchLibrary decodes it through the one path and a follow",
    "  // of it (uid 'builtin:...') resolves offline too. BUILTIN_SCENES is one gallery card per",
    "  // scene in it ('at' = its index), with the hash of its shipped thumbnail ('' = none yet).",
    "  const BUILTIN_GALLERY = [",
    "    { uid: \"builtin:ai-generated\", name: \"AI-Generated\", count: " + SCENES.length
      + ", updated: \"" + updated + "\",",
    "      payload: \"" + payload + "\" },",
    "  ];",
    "  const BUILTIN_SCENES = [",
    ...cards,
    "  ];",
    "",
  ].join("\n");
  fs.writeFileSync(out, src);
  console.log("wrote " + out + " (" + SCENES.length + " scenes, " + payload.length + " chars, "
    + cards.filter(c => !/thumb: ""/.test(c)).length + " with thumbnails)");
} else if (argv[0] === "--json") {
  console.log(JSON.stringify(blob));
} else if (argv[0] === "--check") {
  const out = argv[1], page = argv[2] && !argv[2].startsWith("--") ? argv[2] : path.join(__dirname, "..", "dev-index.html");
  const html = fs.readFileSync(page, "utf8");
  const bad = checkVocab(html);
  if (bad.length) { console.error("VOCAB FAIL:" + String.fromCharCode(10) + bad.join(String.fromCharCode(10))); process.exit(1); }
  console.log("vocab ok: " + SCENES.length + " scenes, " + DESIGN.reduce((n, d) => n + d[1].length, 0) + " layers");
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const lines = SCENES.map((s, i) => {
    const p = path.join(out, "ai-" + i + ".html");
    fs.writeFileSync(p, probePage(html, i));
    const url = "file:///" + p.split(String.fromCharCode(92)).join("/") + "?hideui&credits=0";
    const args = ["--headless=new", "--disable-extensions", "--enable-logging=stderr", "--v=0", "--window-size=1280,800",
      "--virtual-time-budget=6000", "--screenshot=" + path.join(out, "ai-" + i + ".png"), url];
    return { args, line: "msedge " + args.map(a => a.includes(" ") ? JSON.stringify(a) : a).join(" ") };
  });
  const only = argv.indexOf("--only") >= 0 ? argv[argv.indexOf("--only") + 1].split(",").map(Number) : null;
  if (!argv.includes("--run")) { lines.forEach(l => console.log(l.line)); }
  else for (const [i, l] of lines.entries()) {
    if (only && !only.includes(i)) continue;
    const r = spawnSync(edge, l.args, { encoding: "utf8", timeout: 120000, maxBuffer: 64 << 20 });
    const m = String(r.stderr || "").match(/AISCENE\|[^\n"]*/);
    console.log(m ? m[0] : "NO RESULT for " + l.args[l.args.length - 1]);
  }
} else {
  console.log(link);
  console.log(link.length + " chars, " + SCENES.length + " scenes");
}
