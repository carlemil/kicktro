  //  WebGL2 renderer — mirrors the CPU pipeline exactly (see initGL shaders).
  //  Heat lives in a ping-ponged R8 texture at fw×fh; propagation is a fragment
  //  shader; the CPU chaos game is uploaded as GL_POINTS (MAX-blended); Julia is
  //  a fragment shader; the display maps heat→palette and adds a blurred glow.
  // -----------------------------------------------------------------------
  function glCompile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error("shader: " + gl.getShaderInfoLog(s) + "\n" + src);
    return s;
  }
  function glLink(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error("link: " + gl.getProgramInfoLog(p));
    return p;
  }
  // Camera: every EFFECT shader samples a rotated coordinate instead of the raw
  // fragment position, so the effect's own space turns rather than the finished
  // picture (no black corners — the fields are procedural and defined everywhere).
  // Rather than edit 12 shaders by hand, camProg() rewrites the source at compile
  // time: gl_FragCoord becomes `fragCam`, and main() opens by computing it. The
  // rotation is orthographic (rotate as a 3D point about the screen centre, drop
  // z), so X/Y read as a lean and Z as a spin, and it is always well defined —
  // a perspective divide would put a horizon on screen with nothing beyond it.
  // NB this must NOT be applied to the pipeline shaders (prop/pal/zoom/blur/comp/
  // pts): rotating those would rotate the fire sim and the glow composite.
  // A hoisted function, not a const: initGL() is called above this line, so a const
  // would still be in its temporal dead zone when camProg() first runs.
  function camGlsl() { return `
    uniform vec4 uCam; uniform vec2 uCamSize;
    vec4 camFrag4() {
      vec2 c = gl_FragCoord.xy - 0.5 * uCamSize;
      // FIELD OF VIEW (uCam.w) — a radial scale on the SAMPLE coordinate, applied before the
      // rotation so the two compose the same way here and in camPix. Normalised by the half
      // diagonal, so the same slider gives the same lens at any resolution or aspect.
      if (uCam.w != 0.0) c *= 1.0 + uCam.w*dot(c, c)/(0.25*dot(uCamSize, uCamSize));
      vec3 q = vec3(c, 0.0);
      float s, k;
      s = sin(uCam.x); k = cos(uCam.x); q = vec3(q.x, q.y * k - q.z * s, q.y * s + q.z * k);
      s = sin(uCam.y); k = cos(uCam.y); q = vec3(q.x * k + q.z * s, q.y, -q.x * s + q.z * k);
      s = sin(uCam.z); k = cos(uCam.z); q = vec3(q.x * k - q.y * s, q.x * s + q.y * k, q.z);
      return vec4(q.xy + 0.5 * uCamSize, gl_FragCoord.z, gl_FragCoord.w);
    }`; }
  function camProg(vsSrc, fsSrc, names) {
    // rewrite first, then inject — so the injected block's own gl_FragCoord survives
    const src = fsSrc.replace(/gl_FragCoord/g, "fragCam")
      .replace("void main(){", camGlsl() + "\n    void main(){ vec4 fragCam = camFrag4();");
    return makeProg(vsSrc, src, names.concat(["uCam", "uCamSize"]));
  }
  // THE VERTEX SHADER IS COMPILED ONCE PER SOURCE, NOT ONCE PER PROGRAM. There are only two
  // (VS_QUAD and VS_PTS) across ~72 programs, so compiling per call meant ~71 redundant
  // compiles of one identical string at boot — each with its own synchronous COMPILE_STATUS
  // read, which is the call that forces the driver to finish.
  //
  // Keyed by source text and rebuilt by initGL: a shader object belongs to the context that
  // created it, and initGL runs again on `webglcontextrestored`, so a stale entry here would
  // hand a dead shader to every program built after a context loss.
  //
  // `var` WITH NO INITIALISER, exactly like worldProgs/worldPar — initGL() is called from
  // palette.js, a slice ABOVE this one, so a `const` here is read in its temporal dead zone
  // on the very first call and the page dies with "Cannot access 'vsCache' before
  // initialization" (measured: it does). A `var` WITH an initialiser would be worse still —
  // initGL would fill it, then this line would run later and silently wipe it. vsClearCache
  // is what creates it, and initGL calls that before it builds anything.
  var vsCache;
  function vsClearCache() { vsCache = new Map(); }
  function vsFor(src) {
    let s = vsCache.get(src);
    if (!s) { s = glCompile(gl.VERTEX_SHADER, src); vsCache.set(src, s); }
    return s;
  }
  function makeProg(vsSrc, fsSrc, names) {
    const fs = glCompile(gl.FRAGMENT_SHADER, fsSrc);
    const p = glLink(vsFor(vsSrc), fs);
    // The linked program keeps its own reference, so this only drops the app's — without it
    // ~72 fragment shader objects leak for the life of the context. The cached VERTEX shader
    // is deliberately NOT deleted: it is reused by every program still to be built.
    gl.deleteShader(fs);
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }
  function createTex(internal, format, type, filter, wrap) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, 1, 1, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    t._i = internal; t._f = format; t._t = type;
    return t;
  }
  function resizeTex(t, w, h) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, t._i, w, h, 0, t._f, t._t, null);
  }
  function createFbo(tex) {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return f;
  }
  // The current render target, tracked so a pass that needs to borrow a buffer can put the
  // caller's back. Only glBloomPass needs it — it runs two blur passes into its own FBOs in
  // the middle of a chain and must return to whatever the chain had bound — but tracking it
  // here is the only place that cannot go stale.
  // `var`, not `let` — the same reason `card` and `beatUi` are vars. bindFbo is a hoisted
  // function declaration and is CALLED during startup from code that runs before this line,
  // so a `let` here is in the temporal dead zone at that moment and the assignment throws
  // "Cannot access 'curFbo' before initialization", taking the whole IIFE with it. `var`
  // hoists to undefined, which the only reader (glBloomPass) treats as "no target" anyway.
  var curFbo = null, curW = 0, curH = 0;
  function bindFbo(f, w, h) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.viewport(0, 0, w, h); curFbo = f; curW = w; curH = h; }
  function bindDefault(w, h) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); curFbo = null; curW = w; curH = h; }
  function rebindCur() { if (curFbo) bindFbo(curFbo, curW, curH); else bindDefault(curW, curH); }
  function bindTexUnit(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }
  function drawQuad() { gl.bindVertexArray(quadVao); gl.drawArrays(gl.TRIANGLES, 0, 3); }

  function initGL() {
    // A fresh context invalidates every shader object the old one made, and this runs again
    // on `webglcontextrestored` — so drop the cache before anything asks it for a shader.
    vsClearCache();
    // full-screen triangle (no vertex buffer; positions from gl_VertexID)
    const VS_QUAD = `#version 300 es
    out vec2 vUv;
    void main(){
      vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2));
      vUv = p;
      gl_Position = vec4(p*2.0-1.0, 0.0, 1.0);
    }`;
    // propagation — cgtutor averaging, integer-exact vs the CPU (recover the
    // stored byte, sum the 4 taps below, *32/decay, floor, clamp 255).
    const FS_PROP = `#version 300 es
    precision highp float;
    uniform highp sampler2D uHeat;
    uniform vec2 uSize;
    uniform float uDecay;
    out vec4 o;
    void main(){
      int fw = int(uSize.x), fh = int(uSize.y);
      int x = int(gl_FragCoord.x), y = int(gl_FragCoord.y);
      // crop a 1px black border so heat can't smear a bright trail along the
      // edges (the wrapped/clamped boundary rows used to accumulate one).
      if (x == 0 || x == fw-1 || y == 0 || y == fh-1) { o = vec4(0.0); return; }
      int xl = x - 1;   // clamp horizontally (was wrap, which trailed the sides)
      int xr = x + 1;
      int y1 = min(y+1, fh-1);
      int y2 = min(y+2, fh-1);
      int y3 = min(y+3, fh-1);
      float a = floor(texelFetch(uHeat, ivec2(xl, y1), 0).r*255.0 + 0.5);
      float b = floor(texelFetch(uHeat, ivec2(x , y2), 0).r*255.0 + 0.5);
      float c = floor(texelFetch(uHeat, ivec2(xr, y1), 0).r*255.0 + 0.5);
      float d = floor(texelFetch(uHeat, ivec2(x , y3), 0).r*255.0 + 0.5);
      float v = floor((a+b+c+d) * 32.0 / uDecay);
      v = min(v, 255.0);
      o = vec4(v/255.0, 0.0, 0.0, 1.0);
    }`;
    // chaos-game point stamps (MAX-blended into the heat texture)
    const VS_PTS = `#version 300 es
    layout(location=0) in vec3 aPt;   // x, y, value(0..255) in fire-pixel space
    uniform vec2 uSize; uniform float uPtSize;
    out float vVal;
    void main(){
      vVal = aPt.z / 255.0;
      vec2 c = (aPt.xy + 0.5) / uSize * 2.0 - 1.0;
      gl_Position = vec4(c, 0.0, 1.0);
      // HOW BIG EACH STAMP IS DRAWN. It was pinned at 1, so an effect that wanted a fatter
      // mark had to stamp a block of points -- paying per pixel for what the rasteriser
      // does per point. One point at size 5 costs a point; 25 points cost 25 points.
      gl_PointSize = uPtSize;
    }`;
    const FS_PTS = `#version 300 es
    precision highp float;
    uniform float uGain; uniform float uPtSize;
    in float vVal; out vec4 o;
    void main(){
      // A point sprite is a SQUARE. At size 1 that is a pixel and nobody can tell, but a fat
      // square mark turns every vein into a chain of boxes with staircased diagonals, so
      // anything bigger gets rounded off. The discard costs nothing at size 1 -- the branch
      // is not even taken.
      if (uPtSize > 1.5 && length(gl_PointCoord - 0.5) > 0.5) discard;
      o = vec4(vVal * uGain, 0.0, 0.0, 1.0);
    }`;
    // Flying ribbons: real triangles, not points. Same idea as VS_PTS -- fire-pixel space in,
    // clip space out -- but it carries a DEPTH so the rasteriser can sort the bands against
    // each other, which is the whole difference between a surface and a cloud. The heat is
    // computed per VERTEX on the CPU (facing, depth) and interpolated across the triangle,
    // so the shading is smooth without the shader knowing anything about the geometry.
    const VS_RIB = `#version 300 es
    layout(location=0) in vec4 aV;   // xy fire-pixel space, z depth 0..1, w heat 0..255
    uniform vec2 uSize;
    out float vVal;
    void main(){
      vVal = aV.w / 255.0;
      vec2 c = (aV.xy + 0.5) / uSize * 2.0 - 1.0;
      gl_Position = vec4(c, aV.z * 2.0 - 1.0, 1.0);
    }`;
    const FS_RIB = `#version 300 es
    precision highp float;
    in float vVal; out vec4 o;
    void main(){ o = vec4(vVal, 0.0, 0.0, 1.0); }`;
    // Composite one stack item's heat into the shared buffer. The gain HAS to be a
    // multiply in here rather than a blend factor: blendEquation(MAX) ignores blendFunc
    // entirely, so a gain applied through blend state would work for Add and be
    // silently ignored for Max. That asymmetry is the whole reason this pass exists
    // instead of the effect shaders blending straight into the heat buffer.
    const FS_MERGE = `#version 300 es
    precision highp float;
    uniform highp sampler2D uSrc; uniform float uGain;
    in vec2 vUv; out vec4 o;
    void main(){ o = vec4(texture(uSrc, vUv).r * uGain, 0.0, 0.0, 1.0); }`;
    // ---- OKLab per-layer colour merge (multi-layer stacks only) ----------------
    // Each stacked effect keeps its OWN palette: its scratch heat is mapped through
    // its own LUT to an sRGB colour, then blended into an accumulator in OKLab so
    // hues combine perceptually instead of turning to grey. The accumulator ping-pongs
    // (a colour blend is not a GPU blend-func); its alpha carries the running brightness
    // weight, scaled by WMAX so it fits an 8-bit channel (≤ STACK_MAX layers). Björn
    // Ottosson's sRGB↔OKLab. uBlend: 0 = brightness-weighted (screen L + weighted-mean
    // hue), 1 = max (the brighter layer wins the pixel). Gain scales each layer's weight.
    const OKLAB_GLSL = `
      const float WMAX = 4.0;   // >= STACK_MAX: the running weight is stored as alpha·WMAX
      float s2l(float c){ return c <= 0.04045 ? c/12.92 : pow((c+0.055)/1.055, 2.4); }
      float l2s(float c){ return c <= 0.0031308 ? 12.92*c : 1.055*pow(c, 1.0/2.4) - 0.055; }
      vec3 srgb2oklab(vec3 c){
        vec3 lin = vec3(s2l(c.r), s2l(c.g), s2l(c.b));
        float l = 0.4122214708*lin.r + 0.5363325363*lin.g + 0.0514459929*lin.b;
        float m = 0.2119034982*lin.r + 0.6806995451*lin.g + 0.1073969566*lin.b;
        float s = 0.0883024619*lin.r + 0.2817188376*lin.g + 0.6299787005*lin.b;
        float l_=pow(l,1.0/3.0), m_=pow(m,1.0/3.0), s_=pow(s,1.0/3.0);
        return vec3(0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
                    1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
                    0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_);
      }
      vec3 oklab2srgb(vec3 lab){
        float l_ = lab.x + 0.3963377774*lab.y + 0.2158037573*lab.z;
        float m_ = lab.x - 0.1055613458*lab.y - 0.0638541728*lab.z;
        float s_ = lab.x - 0.0894841775*lab.y - 1.2914855480*lab.z;
        float l=l_*l_*l_, m=m_*m_*m_, s=s_*s_*s_;
        vec3 lin = vec3( 4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
                        -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
                        -0.0041960863*l - 0.7034186147*m + 1.7076147010*s);
        return clamp(vec3(l2s(lin.r), l2s(lin.g), l2s(lin.b)), 0.0, 1.0);
      }`;
    const FS_OKMERGE = `#version 300 es
    precision highp float;
    uniform sampler2D uLayer; uniform sampler2D uAcc;
    uniform float uGain; uniform int uBlend; uniform float uCover;
    in vec2 vUv; out vec4 o;` + OKLAB_GLSL + `
    void main(){
      vec4 lay = texture(uLayer, vUv);
      vec3 col = lay.rgb;                                // this layer's finished colour
      vec4 acc = texture(uAcc, vUv);
      float accW = acc.a * WMAX;
      // OVER (20): COVERAGE, not brightness, decides -- and then how opaque that coverage
      // is. lay.a is 1 where the effect drew a surface and 0 where it drew nothing (FS_PAL
      // writes it), so a dark ball still covers a bright layer beneath it and the empty space
      // around it still shows that layer. It is the one mode that ignores the gain weighting:
      // an object is either there or not.
      //
      // uCover is HOW SOLID the thing covering is, and it exists because one effect ships
      // three materials with different answers. A metal ball is opaque; a glass ball and a
      // soap bubble are things you look THROUGH, and a flat coverage test hid the layer
      // beneath them exactly as completely as it hid it behind the metal one.
      //
      // WITH NOTHING BENEATH, EVERYTHING IS OPAQUE. Transparency needs something to be
      // transparent TO, and mixing toward an empty accumulator is mixing toward black -- so a
      // lone glass layer would simply render at half brightness. That guard is also what
      // keeps the single-layer path pixel-identical to before.
      if (uBlend == 20) {
        vec3 c = clamp(col * uGain, 0.0, 1.0);
        float a = lay.a > 0.5 ? (accW < 1.0e-4 ? 1.0 : uCover) : 0.0;
        o = mix(acc, vec4(c, 1.0), a);
        return;
      }
      // KEY (21): the same idea as OVER, but BRIGHTNESS decides how much this layer covers
      // rather than the bare did-it-draw flag. OVER keys on heat being exactly non-zero,
      // which is the right test for a stamped point cloud or a ray that missed -- and the
      // wrong one for a full-screen pattern shader, which writes SOMETHING at every pixel
      // and therefore covers the whole frame under OVER. Here its dark regions fall away
      // and the layers below show through them.
      //
      // Still gated on lay.a, and that is not redundant: heat 0 maps to palette index 0,
      // which is a real colour and can be BRIGHT (paletteBg defaults to the palette's own
      // low end, and may be white). Keying on brightness alone would let a pale background
      // cover everything beneath it -- the exact opposite of what the mode is for.
      //
      // OKLab L, not Rec.709 luma: L is perceptual lightness, so a saturated blue and a
      // saturated red that look equally bright key the same. Luma would rate the blue far
      // darker and punch a hole through it.
      //
      // A RAMP, not a hard cut. A step would alias every edge into a staircase and would
      // make the exact threshold critical; a soft one degrades gracefully if it sits a
      // little wrong for a given palette. The window is deliberately wide for that reason.
      // The empty-accumulator guard is OVER's, for OVER's reason -- mixing toward nothing
      // is mixing toward black, so a lone layer would render dimmed rather than as itself.
      if (uBlend == 21) {
        vec3 c = clamp(col * uGain, 0.0, 1.0);
        float lum = srgb2oklab(col).x;
        float a = lay.a > 0.5
          ? (accW < 1.0e-4 ? 1.0 : smoothstep(0.05, 0.40, lum)*uCover)
          : 0.0;
        o = mix(acc, vec4(c, 1.0), a);
        return;
      }
      vec3 labC = srgb2oklab(col);
      float w = clamp(labC.x * uGain, 0.0, WMAX);        // weight = perceptual L · gain
      if (accW + w < 1.0e-4) { o = vec4(0.0); return; }  // nothing lit here yet
      // Per-channel (RGB) screen: blend red, green and blue INDEPENDENTLY so overlapping
      // layers keep their full colour instead of collapsing to one OKLab lightness+hue.
      // Straight on sRGB, no colour-space round-trip — that is what preserves the detail.
      // First layer is handled for free: screening against the empty (black) accumulator
      // returns the gained layer exactly. Alpha just marks the pixel lit, like the other modes.
      if (uBlend == 5) {
        vec3 c = clamp(col * uGain, 0.0, 1.0);
        o = vec4(1.0 - (1.0 - acc.rgb) * (1.0 - c), clamp((accW + w) / WMAX, 0.0, 1.0));
        return;
      }
      float Lc = clamp(labC.x * uGain, 0.0, 0.999);      // this layer's gained lightness
      vec3 layerLab = vec3(Lc, labC.yz);
      // Nothing underneath yet ⇒ every mode just shows the layer. add/max already reduce
      // to exactly this; colour/luminosity/difference need something below to act on, and
      // without this guard would render the first layer black (they read the empty acc's L).
      if (accW < 1.0e-4) { o = vec4(oklab2srgb(layerLab), clamp(w / WMAX, 0.0, 1.0)); return; }
      // Per-channel sRGB blends (8–15): operate straight on the two sRGB triples, no OKLab
      // round-trip — that is what gives them their characteristic per-channel behaviour. All
      // sit past the guard above, so a (below) is always a real, lit colour. c is this
      // layer's gained colour. Each returns directly; alpha marks the pixel lit for the next.
      {
        vec3 a = clamp(acc.rgb, 0.0, 1.0), c = clamp(col * uGain, 0.0, 1.0);
        float wUp = clamp((accW + w) / WMAX, 0.0, 1.0), wKeep = clamp(max(accW, w) / WMAX, 0.0, 1.0);
        if (uBlend == 8)  { o = vec4(a * c, wKeep); return; }                                  // multiply: darken, rich saturated overlaps
        if (uBlend == 9)  { vec3 lo = 2.0*a*c, hi = 1.0 - 2.0*(1.0-a)*(1.0-c);                 // overlay: multiply on dark, screen on light
                            o = vec4(mix(lo, hi, step(0.5, a)), wUp); return; }
        if (uBlend == 10) { o = vec4(clamp(a / max(1.0 - c, 1.0e-3), 0.0, 1.0), wUp); return; } // colour dodge: neon blowout
        if (uBlend == 11) { o = vec4(clamp(1.0 - (1.0 - a) / max(c, 1.0e-3), 0.0, 1.0), wKeep); return; } // colour burn: crushed shadows
        if (uBlend == 12) { uvec3 ai = uvec3(a*255.0 + 0.5), ci = uvec3(c*255.0 + 0.5);        // XOR: bitwise interference (munching-squares)
                            o = vec4(vec3(ai ^ ci) / 255.0, wUp); return; }
        if (uBlend == 13) { o = vec4(clamp(c*c / max(1.0 - a, 1.0e-3), 0.0, 1.0), wUp); return; } // reflect/glow: this layer's highlights flare
        if (uBlend == 14) { o = vec4(clamp(1.0 - abs(1.0 - a - c), 0.0, 1.0), wUp); return; }   // negation: bright where they agree, inverted where they collide
        if (uBlend == 15) { bool even = mod(floor(gl_FragCoord.y), 2.0) < 1.0;                  // interleave: scanline A/B, zero colour mixing
                            o = vec4(even ? c : a, wKeep); return; }
        if (uBlend == 19) { o = vec4(max(a, c), wKeep); return; }                               // channel max (Lighten): per-channel max, unlike MAX's whole-layer compare
      }
      vec3 labA = srgb2oklab(acc.rgb);
      vec3 outLab; float outW;
      if (uBlend == 1) {                                 // max: brighter layer wins
        outLab = Lc > labA.x ? layerLab : labA;
        outW = max(accW, w);
      } else if (uBlend == 2) {                          // difference: |below − this|, per channel
        outLab = abs(labA - layerLab);
        outW = max(accW, w);
      } else if (uBlend == 3) {                          // colour: below's lightness, this layer's hue
        outLab = vec3(labA.x, labC.yz);
        outW = max(accW, w);
      } else if (uBlend == 4) {                          // luminosity: this layer's lightness, below's hue
        outLab = vec3(Lc, labA.yz);
        outW = max(accW, w);
      } else if (uBlend == 6) {                          // OKLCh vivid: blend hue on the RIM, chroma = max
        // Straight (a,b) averaging cancels toward the grey centre for near-opposite hues
        // (red vs green) — the muddiness. Instead average the two UNIT hue directions
        // (chroma×brightness weighted) and renormalise, which walks the hue around the
        // wheel's rim, then scale by the LARGER of the two chromas so the overlap stays
        // as saturated as its most saturated input. Lightness screens like add.
        float Ca = length(labA.yz), Cb = length(labC.yz);
        vec2 da = Ca > 1.0e-5 ? labA.yz / Ca : vec2(0.0);
        vec2 db = Cb > 1.0e-5 ? labC.yz / Cb : vec2(0.0);
        vec2 dir = da * (Ca * accW) + db * (Cb * w);      // chroma·brightness pulls the hue
        float dl = length(dir);
        vec2 hue = dl > 1.0e-5 ? dir / dl : (Ca >= Cb ? da : db);   // hues cancel ⇒ keep the punchier one
        float Lout = 1.0 - (1.0 - labA.x) * (1.0 - Lc);   // screen lightness
        outLab = vec3(Lout, hue * max(Ca, Cb));
        outW = accW + w;
      } else if (uBlend == 7) {                          // dominant hue: no mixing — the punchier layer's colour wins
        // At each pixel whichever layer has the greater chroma×brightness keeps its EXACT
        // hue+chroma; only lightness screens. No third hue is ever produced, so the two
        // palettes stay pure with a crisp boundary — maximum saturation, hard edges.
        bool layerWins = length(labC.yz) * w >= length(labA.yz) * accW;
        vec2 abWin = layerWins ? labC.yz : labA.yz;      // winner's hue + chroma, unmixed
        float Lout = 1.0 - (1.0 - labA.x) * (1.0 - Lc);   // screen lightness
        outLab = vec3(Lout, abWin);
        outW = accW + w;
      } else if (uBlend == 16) {                         // HSV hyper-vivid: max L, max chroma, punchier hue
        // Louder than OKL: take the greater lightness AND the greater chroma, and point that
        // chroma along whichever layer is punchier (chroma×brightness). Overlaps read as the
        // brightest, most saturated resolution of the two — no rim averaging to soften it.
        float Ca = length(labA.yz), Cb = length(labC.yz);
        vec2 da = Ca > 1.0e-5 ? labA.yz / Ca : vec2(0.0);
        vec2 db = Cb > 1.0e-5 ? labC.yz / Cb : vec2(0.0);
        vec2 hue = (Cb * w >= Ca * accW) ? db : da;       // punchier layer's hue direction
        if (Ca < 1.0e-5 && Cb < 1.0e-5) hue = vec2(0.0);
        outLab = vec3(max(labA.x, Lc), hue * max(Ca, Cb));
        outW = accW + w;
      } else if (uBlend == 17) {                         // average: plain 50/50 perceptual mean
        // The calm opposite of screen/add — an even mean of both layers in OKLab. Soft and
        // painterly; on near-opposite hues it will pass a little toward grey, by design.
        outLab = 0.5 * (labA + layerLab);
        outW = max(accW, w);
      } else if (uBlend == 18) {                         // complement push: overlap → dominant hue's opposite
        // Rotate the overlap 180° from the DOMINANT layer's hue — a colour you cannot reach by
        // mixing the two (reds bleed cyan, greens bleed magenta). Chroma = max, lightness screens.
        float Ca = length(labA.yz), Cb = length(labC.yz);
        vec2 domAB = (Cb * w >= Ca * accW) ? labC.yz : labA.yz;
        float dc = length(domAB);
        vec2 comp = dc > 1.0e-5 ? -domAB / dc : vec2(1.0, 0.0);   // opposite direction on the wheel
        float Lout = 1.0 - (1.0 - labA.x) * (1.0 - Lc);   // screen lightness
        outLab = vec3(Lout, comp * max(Ca, Cb));
        outW = accW + w;
      } else {                                           // 0 = add: brightness-weighted screen
        float Lout = 1.0 - (1.0 - labA.x) * (1.0 - Lc);  // screen lightness
        vec2 ab = (labA.yz * accW + labC.yz * w) / (accW + w);   // hue ∝ brightness
        outLab = vec3(Lout, ab);
        outW = accW + w;
      }
      o = vec4(oklab2srgb(outLab), clamp(outW / WMAX, 0.0, 1.0));
    }`;
    // Julia escape-time, ported 1:1 from julia()
    const FS_JULIA = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform vec2 uC; uniform vec2 uSpan;
    out vec4 o;
    const float INVLN2 = 1.4426950408889634;
    void main(){
      float fw = uSize.x, fh = uSize.y;
      float xx = floor(gl_FragCoord.x), yy = floor(gl_FragCoord.y);
      float zx = (xx/fw - 0.5) * uSpan.x;
      float zy = (yy/fh - 0.5) * uSpan.y;
      float zx2 = zx*zx, zy2 = zy*zy;
      int i = 0;
      for (int k = 0; k < 160; k++) {
        if (zx2 + zy2 > 4.0) break;
        zy = 2.0*zx*zy + uC.y;
        zx = zx2 - zy2 + uC.x;
        zx2 = zx*zx; zy2 = zy*zy;
        i++;
      }
      float v;
      if (i >= 160) { v = 255.0; }
      else {
        float nu = log(0.5 * log(zx2 + zy2) * INVLN2) * INVLN2;
        float f = (float(i) + 1.0 - nu) / 160.0;
        v = f <= 0.0 ? 0.0 : 255.0 * sqrt(f);
      }
      o = vec4(clamp(v, 0.0, 255.0)/255.0, 0.0, 0.0, 1.0);
    }`;
    // old-school plasma: overloaded sin/cos interference, animated by uTime, with
    // an optional domain warp for swirl. Writes heat in .r like FS_JULIA.
    const FS_PLASMA = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uScale; uniform float uWarp; uniform float uZoom;
    out vec4 o;
    void main(){
      float fw = uSize.x, fh = uSize.y;
      float ar = fw / fh;
      float k = uScale / uZoom * 6.2831853;
      float x = (gl_FragCoord.x/fw - 0.5) * ar * k;
      float y = (gl_FragCoord.y/fh - 0.5) * k;
      float t = uTime;
      float wx = x + uWarp * sin(y*0.5 + t*0.7);      // domain warp ⇒ swirl
      float wy = y + uWarp * cos(x*0.5 + t*0.9);
      float v = sin(wx + t)
              + sin(wy*1.3 - t*0.8)
              + sin((wx + wy)*0.7 + t*1.1)
              + sin(length(vec2(wx, wy))*0.9 - t*1.3);
      // wrap the summed value through a final sine ⇒ classic full-range plasma
      // colour-cycling (distinct bands incl. darks) instead of a washed-out blob.
      o = vec4(0.5 + 0.5 * sin(v * 1.6), 0.0, 0.0, 1.0);
    }`;
    // Tunnel: polar map (angle, 1/radius) → rings rushing toward the vanishing point.
    const FS_TUNNEL = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uTwist; uniform float uRings; uniform float uZoom;
    out vec4 o;
    void main(){
      float fw=uSize.x, fh=uSize.y;
      vec2 p = vec2((gl_FragCoord.x/fw - 0.5) * (fw/fh), gl_FragCoord.y/fh - 0.5) / uZoom;
      float r = length(p) + 1e-4;
      float a = atan(p.y, p.x) + uTwist*6.2831853;
      float v = 1.0/r + uTime;
      float ang = 0.5 + 0.5*sin(a*6.0);
      float dep = 0.5 + 0.5*sin(v*uRings*6.2831853);
      float heat = dep * (0.55 + 0.45*ang) * clamp(r/0.5, 0.0, 1.0);
      o = vec4(clamp(heat,0.0,1.0), 0.0, 0.0, 1.0);
    }`;
    // Metaballs: sum of inverse-square fields from moving centres, soft-saturated.
    const FS_METABALL = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uCount; uniform float uRadius; uniform float uGain; uniform float uZoom;
    out vec4 o;
    void main(){
      float fw=uSize.x, fh=uSize.y;
      vec2 p = vec2((gl_FragCoord.x/fw-0.5)*(fw/fh), gl_FragCoord.y/fh-0.5) / uZoom;
      float t=uTime, field=0.0; int n=int(uCount);
      // GLSL ES needs a constant loop bound, so this literal is the HARD ceiling
      // on ball count — uCount only gates it down. It must stay >= the mbcount
      // slider's max (CONTROLS), or raising that max silently caps the render here.
      for (int i=0;i<16;i++){
        if (i>=n) break;
        float fi=float(i);
        vec2 c = vec2(0.32*sin(t*(0.5+fi*0.17)+fi*2.1), 0.32*cos(t*(0.4+fi*0.23)+fi*1.3));
        vec2 d = p-c;
        field += exp(-dot(d,d)/(uRadius*uRadius));   // wide Gaussian blob ⇒ smooth merging
      }
      float heat = 1.0 - exp(-field*uGain);
      o = vec4(clamp(heat,0.0,1.0),0.0,0.0,1.0);
    }`;
    // Burning Ship: FS_JULIA but fold Re·Im to its absolute value each step.
    const FS_BURNING = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform vec2 uC; uniform vec2 uSpan;
    out vec4 o;
    const float INVLN2 = 1.4426950408889634;
    void main(){
      float fw = uSize.x, fh = uSize.y;
      float zx = (floor(gl_FragCoord.x)/fw - 0.5) * uSpan.x;
      float zy = (floor(gl_FragCoord.y)/fh - 0.5) * uSpan.y;
      float zx2 = zx*zx, zy2 = zy*zy;
      int i = 0;
      for (int k = 0; k < 160; k++) {
        if (zx2 + zy2 > 4.0) break;
        zy = 2.0*abs(zx*zy) + uC.y;
        zx = zx2 - zy2 + uC.x;
        zx2 = zx*zx; zy2 = zy*zy;
        i++;
      }
      float v;
      if (i >= 160) { v = 255.0; }
      else { float nu = log(0.5 * log(zx2 + zy2) * INVLN2) * INVLN2; float f = (float(i) + 1.0 - nu) / 160.0; v = f <= 0.0 ? 0.0 : 255.0 * sqrt(f); }
      o = vec4(clamp(v, 0.0, 255.0)/255.0, 0.0, 0.0, 1.0);
    }`;
    // Kaleidoscope: fold the plane into mirror wedges, sample a plasma-like field.
    const FS_KALEIDO = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uSeg; uniform float uRot; uniform float uZoom;
    out vec4 o;
    void main(){
      float fw=uSize.x, fh=uSize.y;
      vec2 p = vec2((gl_FragCoord.x/fw-0.5)*(fw/fh), gl_FragCoord.y/fh-0.5) / uZoom;
      float r = length(p);
      float wedge = 6.2831853/uSeg;
      float a = atan(p.y, p.x) + uRot;
      a = abs(mod(a, wedge) - wedge*0.5);          // fold + mirror
      vec2 q = vec2(cos(a), sin(a)) * r * 3.0;
      float t = uTime;
      float v = sin(q.x + t) + sin(q.y*1.3 - t*0.8) + sin((q.x+q.y)*0.7 + t*1.1) + sin(length(q)*1.5 - t);
      o = vec4(0.5 + 0.5*sin(v*1.3), 0.0, 0.0, 1.0);
    }`;
    // Rotozoomer: rotate + pulse-zoom the plane, sample a tiled grid texture.
    const FS_ROTOZOOM = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uAngle; uniform float uScale; uniform float uTile; uniform float uZoom;
    out vec4 o;
    void main(){
      float fw=uSize.x, fh=uSize.y;
      vec2 p = vec2((gl_FragCoord.x/fw-0.5)*(fw/fh), gl_FragCoord.y/fh-0.5) / uZoom;
      float c=cos(uAngle), s=sin(uAngle);
      vec2 uv = mat2(c,-s,s,c) * p * uScale;
      float k = uTile * 3.14159265;
      o = vec4(0.5 + 0.5*sin(uv.x*k)*sin(uv.y*k), 0.0, 0.0, 1.0);
    }`;
    // Munching squares: the classic (x XOR y)+t & mask hypnotic pattern.
    const FS_MUNCH = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uScale; uniform float uMask; uniform float uZoom;
    out vec4 o;
    void main(){
      vec2 c = gl_FragCoord.xy / uZoom * uScale;
      int xi = int(c.x), yi = int(c.y), m = int(uMask), ti = int(uTime);
      int val = ((xi ^ yi) + ti) & m;
      o = vec4(float(val)/float(m), 0.0, 0.0, 1.0);
    }`;
    // Moiré: two drifting concentric-ring sets, blended multiply↔add for shimmer.
    const FS_MOIRE = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uFreq; uniform float uMix; uniform float uZoom;
    out vec4 o;
    void main(){
      float fw=uSize.x, fh=uSize.y;
      vec2 p = vec2((gl_FragCoord.x/fw-0.5)*(fw/fh), gl_FragCoord.y/fh-0.5) / uZoom;
      float t=uTime;
      vec2 c1 = vec2(0.3*sin(t*0.6), 0.3*cos(t*0.5));
      vec2 c2 = vec2(0.3*cos(t*0.4), 0.3*sin(t*0.7));
      float a = 0.5 + 0.5*sin(length(p-c1)*uFreq*6.2831853);
      float b = 0.5 + 0.5*sin(length(p-c2)*uFreq*6.2831853);
      float heat = mix(a*b, 0.5*(a+b), uMix);
      o = vec4(heat, 0.0, 0.0, 1.0);
    }`;
    // Newton fractal: basins of z³−1 under Newton's method, coloured by root + iters.
    const FS_NEWTON = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uSpin; uniform float uRelax; uniform float uZoom;
    out vec4 o;
    vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x-a.y*b.y, a.x*b.y+a.y*b.x); }
    void main(){
      float fw=uSize.x, fh=uSize.y;
      vec2 z = vec2((gl_FragCoord.x/fw-0.5)*(fw/fh), gl_FragCoord.y/fh-0.5) * 3.0 / uZoom;
      float c=cos(uSpin), s=sin(uSpin); z = mat2(c,-s,s,c)*z;
      int iter=0;
      for (int k=0;k<40;k++){
        vec2 z2=cmul(z,z);
        vec2 f = cmul(z2,z) - vec2(1.0,0.0);
        if (dot(f,f) < 1e-6) break;
        vec2 fp = 3.0*z2; float dd = dot(fp,fp)+1e-9;
        z -= uRelax*vec2(f.x*fp.x+f.y*fp.y, f.y*fp.x-f.x*fp.y)/dd;
        iter++;
      }
      float root = floor(mod(atan(z.y,z.x)/6.2831853*3.0 + 3.0, 3.0));
      float heat = (root + 1.0 - float(iter)/40.0)/3.0;
      o = vec4(clamp(heat,0.0,1.0), 0.0, 0.0, 1.0);
    }`;
    // Multibrot: Julia-orbit z^d + c (polar power); animate d to morph the bulb count.
    const FS_MULTIBROT = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform vec2 uC; uniform vec2 uSpan; uniform float uPower;
    out vec4 o;
    const float INVLN2 = 1.4426950408889634;
    void main(){
      float fw = uSize.x, fh = uSize.y;
      float zx = (floor(gl_FragCoord.x)/fw - 0.5) * uSpan.x;
      float zy = (floor(gl_FragCoord.y)/fh - 0.5) * uSpan.y;
      float mag2 = zx*zx + zy*zy; int i = 0;
      for (int k = 0; k < 160; k++) {
        if (mag2 > 4.0) break;
        float r = pow(sqrt(mag2), uPower);
        float th = atan(zy, zx) * uPower;
        zx = r*cos(th) + uC.x;
        zy = r*sin(th) + uC.y;
        mag2 = zx*zx + zy*zy;
        i++;
      }
      float v;
      if (i >= 160) { v = 255.0; }
      // Renormalized escape count: the OUTER log base is the degree d (uPower), not 2 —
      // hard-coding INVLN2 here left the fractional term unable to cancel the integer
      // iteration bands whenever d != 2, so each contour reset to a darker shade. The
      // inner INVLN2 stays: it normalizes by the bailout radius (2), independent of d.
      else { float nu = log(0.5 * log(mag2) * INVLN2) / log(uPower); float f = (float(i) + 1.0 - nu) / 160.0; v = f <= 0.0 ? 0.0 : 255.0 * sqrt(f); }
      o = vec4(clamp(v, 0.0, 255.0)/255.0, 0.0, 0.0, 1.0);
    }`;
    // Copper bars: horizontal gradient bars sliding up/down on sine motion.
    const FS_COPPER = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uCount; uniform float uWidth; uniform float uZoom;
    out vec4 o;
    void main(){
      float y = (gl_FragCoord.y/uSize.y - 0.5)/uZoom + 0.5;
      float heat = 0.0; int n = int(uCount);
      for (int i=0;i<12;i++){
        if (i>=n) break;
        float fi = float(i);
        float by = 0.5 + 0.4*sin(uTime*(0.6+fi*0.13) + fi*1.7);
        float bar = max(0.0, 1.0 - abs(y - by)/uWidth);
        heat = max(heat, bar*bar);
      }
      o = vec4(heat, 0.0, 0.0, 1.0);
    }`;
    // ---- Geometric shape effects: SDF fragment shaders that write heat, coloured by
    // the palette + glow like every other effect. All aspect-correct against fw/fh and
    // bake their own zoom (uZoom). camProg wraps them, so gl_FragCoord carries the camera.
    // Polygon: one rotating regular N-gon; uThick hollows it (1 = filled, →0 = thin ring).
    // Shape grid: a tiled lattice of one shape (circle↔square via uSquare), each cell
    // pulsing in size out of phase with its neighbours.
    // ---- THE SHARED NOISE TOOLKIT ---------------------------------------------------
    // There was no hash/noise/fbm anywhere in this file before: every pattern effect here is
    // built from sines (Plasma, Moire, Copper bars) or from an exact map (the fractals), and
    // sines cannot make the soft irregular fields the last decade of shader work is built on.
    // Written ONCE and interpolated into the sources below; the volumetric effects want the
    // same block, so it is deliberately general rather than tuned to any one caller.
    //
    // Value noise, not gradient noise: one hash and a smoothstep blend per cell, which is
    // about half the cost of Perlin and indistinguishable once it is inside an fbm.
    const SH_NOISE = `
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
    vec2 h22(vec2 p){
      return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453123);
    }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
                 mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
    float vnoise3(vec3 p){
      vec3 i = floor(p), f = fract(p);
      vec3 u = f * f * (3.0 - 2.0 * f);
      float a = mix(mix(h31(i), h31(i + vec3(1.0, 0.0, 0.0)), u.x),
                    mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), u.x), u.y);
      float b = mix(mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), u.x),
                    mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0, 1.0, 1.0)), u.x), u.y);
      return mix(a, b, u.z);
    }
    float fbm3(vec3 p, int oct){
      float a = 0.5, s = 0.0, n = 0.0;
      for (int i = 0; i < 8; i++) {
        if (i >= oct) break;
        s += a * vnoise3(p); n += a; p *= 2.03; a *= 0.5;
      }
      return n > 0.0 ? s / n : 0.0;
    }
    float fbm(vec2 p, int oct){
      float a = 0.5, s = 0.0, n = 0.0;
      for (int i = 0; i < 8; i++) {
        if (i >= oct) break;
        s += a * vnoise(p); n += a; p *= 2.03; a *= 0.5;   // 2.03, not 2: an exact
      }                                                     // doubling lines the octaves up
      return n > 0.0 ? s / n : 0.0;                         // and the lattice shows through
    }`;
    // VORONOI / WORLEY. Nothing here measures cellular distance -- Reaction-diffusion is a
    // PDE and Cellular automaton is a filter over heat. F1 alone gives blobs; F2 - F1 is the
    // crack between cells, which is the shattered-glass look, and Edge crossfades the two.
    const FS_VORONOI = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uTime; uniform float uCells;
    uniform float uEdge; uniform float uJit; uniform float uZoom;
    in vec2 vUv; out vec4 o;
    ${SH_NOISE}
    void main(){
      float asp = uSize.x / uSize.y;
      vec2 p = vec2((vUv.x - 0.5) * asp, vUv.y - 0.5) / uZoom * max(1.0, uCells);
      vec2 g = floor(p), f = p - g;
      float f1 = 8.0, f2 = 8.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 off = vec2(float(i), float(j));
        vec2 seed = h22(g + off);
        // each cell's point wanders on its own phase, so the pattern is never static
        vec2 pt = off + 0.5 + (sin(uTime + seed * 6.2831) * 0.5) * clamp(uJit, 0.0, 1.0);
        float d = length(pt - f);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
      }
      float blob = 1.0 - clamp(f1, 0.0, 1.0);
      float crack = clamp((f2 - f1) * 1.6, 0.0, 1.0);
      o = vec4(mix(blob, crack, clamp(uEdge, 0.0, 1.0)), 0.0, 0.0, 1.0);
    }`;
    // DOMAIN-WARPED FBM -- noise whose INPUT is displaced by more noise, twice. It is the
    // difference between "clouds" and the marbled, flowing fields modern shader work is full
    // of, and it cannot be approximated with sines however many you stack.
    const FS_WARPNOISE = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uTime; uniform float uScale;
    uniform float uWarp; uniform float uOct; uniform float uZoom;
    in vec2 vUv; out vec4 o;
    ${SH_NOISE}
    void main(){
      float asp = uSize.x / uSize.y;
      vec2 p = vec2((vUv.x - 0.5) * asp, vUv.y - 0.5) / uZoom * max(0.2, uScale);
      int oct = int(clamp(uOct, 1.0, 8.0));
      vec2 q = vec2(fbm(p + vec2(0.0, uTime * 0.15), oct), fbm(p + vec2(5.2, 1.3), oct));
      vec2 r = vec2(fbm(p + uWarp * q + vec2(1.7, 9.2) + uTime * 0.1, oct),
                    fbm(p + uWarp * q + vec2(8.3, 2.8), oct));
      float v = fbm(p + uWarp * r, oct);
      o = vec4(clamp(v * 1.4, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // TRUCHET TILES: each cell holds one of two quarter-arc pairs, chosen by a hash, and the
    // arcs meet at every edge -- so an endless woven maze falls out of a per-cell coin flip.
    // Cheap, and completely unlike anything else in the registry.
    const FS_TRUCHET = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uTime; uniform float uCells;
    uniform float uWidth; uniform float uFlip; uniform float uZoom;
    in vec2 vUv; out vec4 o;
    ${SH_NOISE}
    void main(){
      float asp = uSize.x / uSize.y;
      vec2 p = vec2((vUv.x - 0.5) * asp, vUv.y - 0.5) / uZoom * max(1.0, uCells);
      vec2 g = floor(p), f = p - g - 0.5;
      // The flip is a hash THRESHOLD, not a hash: sliding the threshold with time makes tiles
      // turn over one at a time instead of the whole grid re-rolling at once.
      float hv = h21(g);
      if (hv < fract(uTime * 0.07 + uFlip)) f.x = -f.x;
      // two quarter arcs of radius 1/2, centred on opposite corners
      float d = min(abs(length(f - vec2(0.5, 0.5)) - 0.5),
                    abs(length(f + vec2(0.5, 0.5)) - 0.5));
      float w = max(0.01, uWidth * 0.5);
      o = vec4(1.0 - smoothstep(w * 0.5, w, d), 0.0, 0.0, 1.0);
    }`;
    // ---- Batch B: three modern fractal distance estimators ---------------------------
    // Shared camera: a slow orbit looking at the origin. All three are centred solids, so
    // there is no flight path to solve (unlike the Mandelbulb, which has to thread canyons) --
    // the camera simply circles and the fractal turns inside the frame.
    const SH_ORBIT = `
    void orbitCam(float t, float dist, float lift, out vec3 ro, out mat3 basis){
      ro = vec3(sin(t) * dist, lift + sin(t * 0.37) * dist * 0.25, cos(t) * dist);
      vec3 f = normalize(-ro);
      vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
      basis = mat3(r, cross(f, r), f);
    }`;
    // APOLLONIAN GASKET: invert the point through a sphere, fold it back into the unit cell,
    // repeat. Every iteration multiplies a scale factor, and dividing by it at the end turns
    // the folded distance back into a real one -- which is what makes an infinitely recursive
    // sphere packing marchable at all.
    const FS_APOLLO = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uScale; uniform float uIter;
    uniform float uGlow; uniform float uZoom; uniform float uThin;
    out vec4 o;
    ${SH_ORBIT}
    float apolloDE(vec3 p, float k, int it){
      float s = 1.0;
      for (int i = 0; i < 12; i++) {
        if (i >= it) break;
        p = -1.0 + 2.0 * fract(0.5 * p + 0.5);      // fold into the unit cell
        float r2 = dot(p, p);
        float f = k / max(r2, 0.02);                 // sphere inversion
        p *= f; s *= f;
      }
      return 0.35 * abs(p.y) / s;                    // undo the accumulated scale
    }
    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5 * uSize) / uSize.y / uZoom;
      vec3 ro; mat3 b; orbitCam(uTime * 0.2, 3.4, 0.35, ro, b);
      vec3 rd = normalize(b * vec3(uv, 1.7));
      int it = int(clamp(uIter, 3.0, 12.0));
      float t = 0.0, halo = 9.0, heat = 0.0;
      for (int i = 0; i < 90; i++) {
        vec3 p = ro + rd * t;
        float d = apolloDE(p, uScale, it);
        halo = min(halo, d / max(t, 0.25));
        if (d < 0.0015 * max(t, 0.3)) {
          float e = 0.002 * max(t, 0.3);
          vec2 h = vec2(1.0, -1.0) * 0.5773;
          vec3 nrm = normalize(h.xyy * apolloDE(p + h.xyy * e, uScale, it) + h.yyx * apolloDE(p + h.yyx * e, uScale, it) + h.yxy * apolloDE(p + h.yxy * e, uScale, it) + h.xxx * apolloDE(p + h.xxx * e, uScale, it));
          float dif = max(0.0, dot(nrm, normalize(vec3(0.5, 0.75, -0.4))));
          heat = (0.20 + 0.65 * dif) * (1.0 - smoothstep(0.6, 9.0, t));
          break;
        }
        t += d * 0.85;
        if (t > 9.0) break;
      }
      heat += uGlow * 0.45 * exp(-halo * 16.0);
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // MANDELBOX: box-fold then sphere-fold then scale, which is a completely different family
    // from the Mandelbulb's power map -- it makes hard architectural shells rather than organic
    // lobes. Negative Scale values give the classic hollow forms.
    const FS_MBOX = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uScale; uniform float uIter;
    uniform float uGlow; uniform float uZoom; uniform float uFold;
    out vec4 o;
    ${SH_ORBIT}
    float mboxDE(vec3 p, float sc, float fold, int it){
      vec3 z = p; float dr = 1.0;
      float minR2 = 0.25;
      for (int i = 0; i < 12; i++) {
        if (i >= it) break;
        z = clamp(z, -fold, fold) * 2.0 * fold - z;            // box fold
        float r2 = dot(z, z);
        if (r2 < minR2) { float g = 1.0 / minR2; z *= g; dr *= g; }
        else if (r2 < 1.0) { float g = 1.0 / r2; z *= g; dr *= g; }   // sphere fold
        z = z * sc + p; dr = dr * abs(sc) + 1.0;
      }
      return length(z) / abs(dr);
    }
    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5 * uSize) / uSize.y / uZoom;
      vec3 ro; mat3 b; orbitCam(uTime * 0.17, 6.5, 0.6, ro, b);
      vec3 rd = normalize(b * vec3(uv, 1.4));
      int it = int(clamp(uIter, 3.0, 12.0));
      float t = 0.0, halo = 9.0, heat = 0.0;
      for (int i = 0; i < 90; i++) {
        vec3 p = ro + rd * t;
        float d = mboxDE(p, uScale, max(0.5, uFold), it);
        halo = min(halo, d / max(t, 0.25));
        if (d < 0.0015 * max(t, 0.3)) {
          float e = 0.002 * max(t, 0.3);
          vec2 h = vec2(1.0, -1.0) * 0.5773;
          vec3 nrm = normalize(h.xyy * mboxDE(p + h.xyy * e, uScale, max(0.5, uFold), it) + h.yyx * mboxDE(p + h.yyx * e, uScale, max(0.5, uFold), it) + h.yxy * mboxDE(p + h.yxy * e, uScale, max(0.5, uFold), it) + h.xxx * mboxDE(p + h.xxx * e, uScale, max(0.5, uFold), it));
          float dif = max(0.0, dot(nrm, normalize(vec3(0.5, 0.75, -0.4))));
          heat = (0.20 + 0.65 * dif) * (1.0 - smoothstep(0.6, 20.0, t));
          break;
        }
        t += d * 0.85;
        if (t > 20.0) break;
      }
      heat += uGlow * 0.45 * exp(-halo * 16.0);
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // GYROID: a triply-periodic minimal surface, and the whole distance estimator is one line.
    // It is not a fractal at all -- it is an infinite smooth lattice -- which is exactly why it
    // sits well beside the other two rather than competing with them.
    const FS_GYROID = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uFreq; uniform float uThick;
    uniform float uGlow; uniform float uZoom; uniform float uWarp;
    out vec4 o;
    ${SH_ORBIT}
    float gyroidDE(vec3 p, float f, float th, float w, float t){
      vec3 q = p * f + vec3(sin(t * 0.3) * w, cos(t * 0.23) * w, 0.0);
      float g = dot(sin(q), cos(q.zxy));
      float sheet = (abs(g) - th) / (f * 1.7);     // /f keeps it a usable distance bound
      return max(sheet, length(p) - 1.7);          // clipped to a ball, so it can be FRAMED
    }
    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5 * uSize) / uSize.y / uZoom;
      vec3 ro; mat3 b; orbitCam(uTime * 0.15, 4.6, 0.0, ro, b);   // clear of the 1.7 clip ball, so it frames
      vec3 rd = normalize(b * vec3(uv, 1.5));
      float t = 0.0, halo = 9.0, heat = 0.0;
      for (int i = 0; i < 80; i++) {
        vec3 p = ro + rd * t;
        float d = gyroidDE(p, max(0.4, uFreq), uThick, uWarp, uTime);
        halo = min(halo, d / max(t, 0.25));
        if (d < 0.0015 * max(t, 0.3)) {
          float e = 0.002 * max(t, 0.3);
          vec2 h = vec2(1.0, -1.0) * 0.5773;
          vec3 nrm = normalize(h.xyy * gyroidDE(p + h.xyy * e, max(0.4, uFreq), uThick, uWarp, uTime) + h.yyx * gyroidDE(p + h.yyx * e, max(0.4, uFreq), uThick, uWarp, uTime) + h.yxy * gyroidDE(p + h.yxy * e, max(0.4, uFreq), uThick, uWarp, uTime) + h.xxx * gyroidDE(p + h.xxx * e, max(0.4, uFreq), uThick, uWarp, uTime));
          float dif = max(0.0, dot(nrm, normalize(vec3(0.5, 0.75, -0.4))));
          heat = (0.20 + 0.65 * dif) * (1.0 - smoothstep(0.6, 12.0, t));
          break;
        }
        t += d * 0.85;
        if (t > 12.0) break;
      }
      heat += uGlow * 0.45 * exp(-halo * 16.0);
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // SMOOTH CSG. After the godotshaders 'Fullscreen SDF raymarching with smooth CSG' demo:
    // three studies in a row -- a sphere smooth-UNIONED into a box, a spinning torus kept
    // separate, and a box with a sphere smooth-SUBTRACTED out of it. The operators carry
    // (brightness, distance) pairs and blend BOTH with the same IQ smooth-min factor, so the
    // tone melts across a join exactly as the surface does -- the original blends colours the
    // same way; here the palette owns colour, so brightness is the seam. Plastic lighting:
    // lambert + a tight specular + a rim, both widened by uWidth, both scaled by uShine.
    const FS_CSG = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uOrbit; uniform float uBlend;
    uniform float uShine; uniform float uWidth; uniform float uZoom;
    out vec4 o;
    ${SH_ORBIT}
    float sdSphere(vec3 p, float r){ return length(p) - r; }
    float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
    float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
    vec3 rotE(vec3 p, vec3 deg){
      vec3 a = radians(deg);
      float cx = cos(a.x), sx = sin(a.x), cy = cos(a.y), sy = sin(a.y), cz = cos(a.z), sz = sin(a.z);
      p = vec3(p.x, cx*p.y - sx*p.z, sx*p.y + cx*p.z);
      p = vec3(cy*p.x + sy*p.z, p.y, -sy*p.x + cy*p.z);
      return vec3(cz*p.x - sz*p.y, sz*p.x + cz*p.y, p.z);
    }
    vec2 sUnion(vec2 a, float d, float l, float k){
      k = max(k, 1e-4);
      float h = clamp(0.5 + 0.5*(d - a.y)/k, 0.0, 1.0);
      return vec2(mix(l, a.x, h), mix(d, a.y, h) - k*h*(1.0 - h));
    }
    vec2 sSub(vec2 a, float d, float k){
      k = max(k, 1e-4);
      float h = clamp(0.5 - 0.5*(d + a.y)/k, 0.0, 1.0);
      return vec2(a.x, mix(a.y, -d, h) + k*h*(1.0 - h));
    }
    vec2 map(vec3 p, float t, float k){
      // left: a sphere bobbing into a slowly rocking box, smooth union
      vec2 left = vec2(0.85, sdSphere(p - vec3(-1.9 + 0.35*sin(t*0.7), 0.35*sin(t*1.6), 0.0), 0.5));
      vec3 lb = rotE(p - vec3(-0.77, -0.02, 0.02), vec3(8.0, -12.0 + 12.0*sin(t), -10.0));
      left = sUnion(left, sdBox(lb, vec3(0.43)), 0.55, k*0.8);
      // centre: an independent torus, hard union
      vec3 ring = rotE(p - vec3(0.57, 0.02, 0.0), vec3(72.0, t*18.0, 8.0));
      vec2 mid = vec2(0.95, sdTorus(ring, vec2(0.55, 0.15)));
      // right: a box with a wandering spherical cavity, smooth subtraction
      vec3 rb = rotE(p - vec3(1.9, 0.0, 0.0), vec3(6.0, -8.0, 8.0));
      vec2 right = vec2(0.45, sdBox(rb, vec3(0.5)));
      vec3 cav = vec3(1.9 - 0.18 + 0.25*sin(t*1.2), 0.12 + 0.15*cos(t*0.9), 0.42);
      right = sSub(right, sdSphere(p - cav, 0.3), k*0.45);
      vec2 r = mid.y < left.y ? mid : left;
      return right.y < r.y ? right : r;
    }
    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5 * uSize) / uSize.y / uZoom;
      vec3 ro; mat3 b; orbitCam(0.55 * sin(uOrbit * 0.25), 6.2, 0.6, ro, b);   // sways about the front
      vec3 rd = normalize(b * vec3(-uv.x, uv.y, 1.5));   // orbit basis puts +x on the left; the demo reads sphere-box-torus-cavity
      float k = uBlend;
      float t = 0.0, heat = 0.0;
      for (int i = 0; i < 96; i++) {
        vec3 p = ro + rd * t;
        vec2 m = map(p, uTime, k);
        if (m.y < 0.002 * max(t, 0.5)) {
          float e = 0.002 * max(t, 0.5);
          vec2 h = vec2(1.0, -1.0) * 0.5773;
          vec3 n = normalize(h.xyy * map(p + h.xyy * e, uTime, k).y + h.yyx * map(p + h.yyx * e, uTime, k).y + h.yxy * map(p + h.yxy * e, uTime, k).y + h.xxx * map(p + h.xxx * e, uTime, k).y);
          vec3 l = normalize(vec3(-0.64, 0.68, 0.36)), v = -rd, hv = normalize(l + v);
          float ndl = max(0.0, dot(n, l)), w = clamp(uWidth, 0.0, 1.0);
          float spec = pow(max(0.0, dot(n, hv)), mix(256.0, 4.0, w)) * uShine;
          float rim = pow(1.0 - max(0.0, dot(n, v)), mix(6.0, 1.0, w)) * 0.35 * uShine;
          heat = m.x * (0.3 + 0.7 * ndl) + (spec + rim) * 0.5;
          break;
        }
        t += max(m.y, 0.001);
        if (t > 16.0) break;
      }
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // ---- Batch C: participating media, scattering, and a landscape ---------------------
    // VOLUMETRIC CLOUDS. The first effect here with genuine participating media: the ray does
    // not look for a SURFACE, it integrates density along its length and lets light through
    // according to how much it has already passed. Ocean is a height field and Metaballs is an
    // implicit surface -- both answer "where does this ray stop"; this one answers "how much
    // did it collect on the way", which is a different question and the reason clouds have
    // never been possible here before.
    const FS_CLOUDS = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uCover; uniform float uScale;
    uniform float uOct; uniform float uLight; uniform float uZoom;
    out vec4 o;
    ${SH_NOISE}
    float density(vec3 p, float sc, float cov, int oct, float t){
      float d = fbm3(p * sc + vec3(0.0, 0.0, t * 0.12), oct);
      return clamp((d - (1.0 - cov)) * 2.4, 0.0, 1.0);
    }
    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5 * uSize) / uSize.y / uZoom;
      vec3 ro = vec3(0.0, 0.0, uTime * 0.35);
      vec3 rd = normalize(vec3(uv, 1.2));
      int oct = int(clamp(uOct, 1.0, 6.0));
      float sc = max(0.15, uScale);
      vec3 sun = normalize(vec3(0.6, 0.7, -0.3));
      float trans = 1.0, acc = 0.0, t = 0.6;
      for (int i = 0; i < 48; i++) {
        vec3 p = ro + rd * t;
        float d = density(p, sc, uCover, oct, uTime);
        if (d > 0.01) {
          // A SHORT LIGHT MARCH, not a shadow ray: a few taps toward the sun are enough to make
          // a cloud look lit from one side, and it is the whole difference between a volume
          // and a grey fog.
          //
          // THIS LOOP WAS THE WHOLE COST OF THE EFFECT -- measured, not guessed. Every dense
          // step ran five more density() calls at the full octave count, and clouds was the
          // one effect over the 60 fps budget on the dev 4090 at 4K: 21.3 ms, five times the
          // next slowest. Two changes, both judged from a same-frame A/B (tools/abshot.js):
          //   - the shadow samples run at HALF the octaves (min 1). A shadow is a soft
          //     occlusion integral and does not need the detail the density itself needs;
          //   - three taps instead of five over the same 0.80 reach, the sum rescaled by 5/3
          //     so the exponent sees the same integral.
          // Together: 21.3 -> 9.5 ms at 4K (-56%), a mean pixel difference of 3.7 in 255,
          // invisible side by side at 800 px. Either alone is -40% / -32%.
          int soct = max(1, oct / 2);
          float sh = 0.0;
          for (int j = 1; j <= 3; j++) sh += density(p + sun * float(j) * 0.2667, sc, uCover, soct, uTime);
          sh *= 1.6667;
          float lit = exp(-sh * 0.55 * uLight);
          acc += d * trans * (0.15 + 0.95 * lit) * 0.30;
          trans *= exp(-d * 0.55);
          if (trans < 0.02) break;
        }
        t += 0.13;
      }
      o = vec4(clamp(acc, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // GOD RAYS / light shafts. Screen-space radial scatter: step from each pixel TOWARD the
    // light, sampling an occluder as you go, so wherever something blocks the view you get the
    // shadow cast through the air rather than on a surface. Anamorphic streaks (a filter)
    // spreads a highlight sideways; this builds the beam back to its source.
    const FS_GODRAY = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uDecay; uniform float uWeight;
    uniform float uScale; uniform float uSpread; uniform float uZoom;
    out vec4 o;
    ${SH_NOISE}
    float occl(vec2 p, float sc, float t){
      float f = fbm(p * sc + vec2(t * 0.06, t * 0.03), 5);
      return smoothstep(0.46, 0.62, f);            // the silhouette that blocks the light
    }
    void main(){
      float asp = uSize.x / uSize.y;
      vec2 uv = vec2((gl_FragCoord.x / uSize.x - 0.5) * asp, gl_FragCoord.y / uSize.y - 0.5) / uZoom;
      vec2 lp = vec2(sin(uTime * 0.21) * 0.30, cos(uTime * 0.17) * 0.18);
      vec2 step = (uv - lp) * (max(0.05, uSpread) / 40.0);
      vec2 p = uv;
      float illum = 0.0, decay = 1.0;
      for (int i = 0; i < 40; i++) {
        p -= step;
        illum += (1.0 - occl(p, max(0.2, uScale), uTime)) * decay;
        decay *= clamp(uDecay, 0.80, 0.999);
      }
      illum *= uWeight / 40.0;
      // the source itself, so the shafts have something to come from
      float core = exp(-length(uv - lp) * 9.0);
      o = vec4(clamp(illum + core, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // RAYMARCHED TERRAIN: the landscape counterpart to Ocean, and it borrows Ocean's idea of
    // a geometric step law -- near ground wants fine sampling, far ground is a few pixels --
    // rather than a fixed step, which is what keeps a horizon from costing 500 samples.
    const FS_TERRAIN = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uHeight; uniform float uScale;
    uniform float uOct; uniform float uFog; uniform float uZoom;
    out vec4 o;
    ${SH_NOISE}
    float land(vec2 p, float sc, float h, int oct){ return fbm(p * sc, oct) * h; }
    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5 * uSize) / uSize.y / uZoom;
      uv.y = -uv.y;                                // the heat buffer is Y-FLIPPED (see CLAUDE.md)
      int oct = int(clamp(uOct, 1.0, 7.0));
      float sc = max(0.05, uScale), h = max(0.05, uHeight);
      vec3 ro = vec3(0.0, h * 0.55 + 0.6, uTime * 0.5);
      vec3 rd = normalize(vec3(uv, 1.3));
      float t = 0.4, hit = -1.0;
      for (int i = 0; i < 90; i++) {
        vec3 p = ro + rd * t;
        float d = p.y - land(p.xz, sc, h, oct);
        if (d < 0.003 * t) { hit = t; break; }
        t += max(0.02, d * 0.45);                  // geometric: far ground costs less
        if (t > 40.0) break;
      }
      float heat;
      if (hit < 0.0) {
        heat = 0.06 + 0.16 * (1.0 - smoothstep(-0.1, 0.4, uv.y));   // sky, brighter toward the horizon
      } else {
        vec3 p = ro + rd * hit;
        float e = 0.02 * max(1.0, hit);
        vec3 n = normalize(vec3(land(p.xz - vec2(e, 0.0), sc, h, oct) - land(p.xz + vec2(e, 0.0), sc, h, oct),
                                2.0 * e,
                                land(p.xz - vec2(0.0, e), sc, h, oct) - land(p.xz + vec2(0.0, e), sc, h, oct)));
        float dif = max(0.0, dot(n, normalize(vec3(0.6, 0.55, -0.4))));
        heat = 0.18 + 0.75 * dif;
        heat = mix(heat, 0.16, clamp(hit * uFog * 0.04, 0.0, 1.0));   // distance fog
      }
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    const FS_SHAPEGRID = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uCells; uniform float uDot; uniform float uSquare; uniform float uPulse; uniform float uZoom;
    out vec4 o;
    void main(){
      vec2 p = gl_FragCoord.xy/uSize - 0.5; p.x *= uSize.x/uSize.y; p /= uZoom;
      vec2 g = p * uCells; vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
      float rad = uDot * (1.0 + uPulse*sin(uTime + cell.x*0.7 + cell.y*1.3));
      float d = mix(length(f), max(abs(f.x), abs(f.y)), uSquare);
      float aa = 1.5/uSize.y * uCells;
      o = vec4(clamp(1.0 - smoothstep(rad-aa, rad+aa, d), 0.0, 1.0), 0.0, 0.0, 1.0);   // ascend + invert (GLSL smoothstep needs edge0<edge1)
    }`;
    // Concentric rings: nested N-gon (or circle) contours marching outward over time.
    const FS_CONCENTRIC = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uSides; uniform float uCount; uniform float uThick; uniform float uSpin; uniform float uZoom;
    out vec4 o;
    const float TAU = 6.2831853;
    void main(){
      vec2 p = gl_FragCoord.xy/uSize - 0.5; p.x *= uSize.x/uSize.y; p /= uZoom;
      float a = atan(p.y, p.x) + uSpin, seg = TAU/uSides;
      float rp = length(p) * cos(mod(a, seg) - seg*0.5) / cos(seg*0.5);
      float band = abs(fract(rp*uCount - uTime) - 0.5) * 2.0;            // 0 at a ring centre, 1 between
      float th = clamp(uThick, 0.02, 0.98);
      o = vec4(clamp(1.0 - smoothstep(1.0 - th, 1.0, band), 0.0, 1.0), 0.0, 0.0, 1.0);   // ascend + invert
    }`;
    // Bouncing shapes: a few shapes whose centres (uPos, computed on the CPU) drift and
    // bounce off the edges. Tick on a Fade / Fire feedback filter for glow trails.
    // SEVEN SHAPE KINDS, not one. It used to draw the same superellipse for every object, so
    // Squareness was the only variety there was and a screen of eight read as one shape
    // repeated. Shape mix follows Bouncing solids' sdmix exactly: it is how many KINDS are in
    // play, each object picking one by hash, so 1 is the old behaviour and 7 is all of them.
    //
    // Kind 0 is the original circle<->square blend, deliberately first: at Shape mix 1 every
    // object is kind 0 and the effect renders exactly as it always did.
    const FS_BOUNCE = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform vec2 uPos[8]; uniform float uCount; uniform float uRad;
    uniform float uSquare; uniform float uZoom; uniform float uMix; uniform float uTime; uniform float uSpin;
    out vec4 o;
    float bnHash(float i){ return fract(sin(i * 78.233 + 1.7) * 43758.5453123); }
    // A regular n-gon, by folding the angle into one wedge -- the same construction the old
    // Polygon effect used before it was retired.
    float bnNgon(vec2 d, float n){
      float seg = 6.28318 / n;
      float a = atan(d.y, d.x) + 1.5708;                 // +90deg so a triangle points UP
      return length(d) * cos(mod(a, seg) - seg * 0.5) / cos(seg * 0.5);
    }
    // Every kind returns a distance-like value that is < r inside the shape, so one threshold
    // and one antialias band serve all seven.
    float bnShape(int k, vec2 d, float r, float sq){
      if (k == 1) return bnNgon(d, 3.0);
      if (k == 2) return bnNgon(d, 5.0);
      if (k == 3) return bnNgon(d, 6.0);
      if (k == 4) {                                       // five-pointed star
        float a = atan(d.y, d.x);
        return length(d) / (0.62 + 0.38 * cos(5.0 * a + 1.5708));
      }
      if (k == 5) return abs(length(d) - r * 0.68) * 2.6; // ring
      if (k == 6) return min(max(abs(d.x), abs(d.y) * 2.8),
                             max(abs(d.x) * 2.8, abs(d.y)));   // cross
      return mix(length(d), max(abs(d.x), abs(d.y)), sq);  // 0: the original blend
    }
    void main(){
      vec2 uv = (gl_FragCoord.xy/uSize - 0.5)/uZoom + 0.5;
      float asp = uSize.x/uSize.y, aa = 2.0/uSize.y, heat = 0.0; int n = int(uCount);
      float kinds = clamp(uMix, 1.0, 7.0);
      for (int i=0;i<8;i++){
        if (i>=n) break;
        vec2 d = uv - uPos[i]; d.x *= asp;
        float h = bnHash(float(i));
        int k = int(floor(h * kinds));
        // Spin, per object, in its own direction and at its own rate -- a static triangle
        // reads as a texture, a turning one reads as an object.
        float ang = uTime * uSpin * (0.6 + h) * (h > 0.5 ? 1.0 : -1.0);
        float c = cos(ang), s = sin(ang);
        d = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
        heat = max(heat, 1.0 - smoothstep(uRad-aa, uRad+aa, bnShape(k, d, uRad, uSquare)));
      }
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Bouncing solids: the 3D one. A raymarched SDF scene of up to 8 primitives whose
    // pose is computed on the CPU (solidsSeed) and handed over per frame — uPos.xyz the
    // centre, uPos.w the radius, uQuat the orientation, uShape which primitive. Nothing
    // about the motion lives in here, so the Canvas2D mirror marches the identical scene.
    // Every primitive is authored to fit inside radius r, which is what lets the physics
    // use ONE bounding-sphere radius for all six (see solidStep).
    const FS_SOLIDS = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uZoom; uniform float uCount; uniform float uRim;
    uniform vec4 uPos[8]; uniform vec4 uQuat[8]; uniform float uShape[8];
    out vec4 o;
    // World → body space: rotate by the CONJUGATE of q. The implicit surfaces below have
    // no vertices to carry an orientation, so each sample is un-rotated instead.
    vec3 toBody(vec4 q, vec3 v){ vec3 u = -q.xyz; return v + 2.0*cross(u, cross(u, v) + q.w*v); }
    float shapeDist(int s, vec3 p, float r){
      if (s == 0) return length(p) - r;                                              // sphere
      if (s == 1){ vec3 d = abs(p) - vec3(r*0.55);                                   // box
                   return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0); }
      if (s == 2){ vec2 q = vec2(length(p.xz) - r*0.70, p.y); return length(q) - r*0.30; }   // torus
      if (s == 3){ vec3 q = p; q.y -= clamp(q.y, -r*0.60, r*0.60); return length(q) - r*0.40; }  // capsule
      if (s == 4){ vec3 a = abs(p); return (a.x + a.y + a.z - r)*0.5773; }           // octahedron
      vec2 d = vec2(length(p.xz) - r*0.60, abs(p.y) - r*0.60);                       // cylinder
      return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
    }
    float map(vec3 p){
      float d = 1e9; int n = int(uCount);
      for (int i = 0; i < 8; i++){
        if (i >= n) break;
        d = min(d, shapeDist(int(uShape[i]), toBody(uQuat[i], p - uPos[i].xyz), uPos[i].w));
      }
      return d;
    }
    void main(){
      vec2 uv = gl_FragCoord.xy/uSize - 0.5; uv.x *= uSize.x/uSize.y; uv /= uZoom;
      vec3 ro = vec3(0.0, 0.0, -3.2), rd = normalize(vec3(uv, 1.4));
      const vec3 L = vec3(-0.4557, 0.7295, -0.5104);   // key light, pre-normalised
      float t = 0.0, heat = 0.0;
      for (int i = 0; i < 48; i++){
        vec3 p = ro + rd*t;
        float d = map(p);
        if (d < 0.0025){
          vec2 e = vec2(1.0, -1.0)*0.0015;             // tetrahedral central-difference normal
          vec3 n = normalize(e.xyy*map(p + e.xyy) + e.yyx*map(p + e.yyx)
                           + e.yxy*map(p + e.yxy) + e.xxx*map(p + e.xxx));
          float dif = max(0.0, dot(n, L));
          float rim = pow(max(0.0, 1.0 - dot(n, -rd)), 2.5);   // bright silhouette edges
          heat = (0.18 + 0.72*dif + uRim*rim) * (1.0 - smoothstep(1.5, 7.0, t));   // ...fading with depth
          break;
        }
        t += d;
        if (t > 7.0) break;
      }
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Sun surface: DKIST-style solar granulation — animated Voronoi cells (bright
    // convective centres, dark intergranular lanes), slow per-cell churn, tiny bright
    // points sparking in the lanes, and an optional sunspot (dark umbra + radiating
    // penumbral filaments) behind uSpot, 0 = none.
    //
    // Site jitter is 0.38 about the cell centre, so a site never leaves [0.12, 0.88]
    // of its own cell — which is what makes the fixed 3x3 neighbourhood sufficient.
    // The winning cell's id is kept and hashed ONCE after the loop (not per candidate).
    // Lanes sit at heat ~0.16 and cell centres cap at ~0.85: most palettes are white
    // at the very top (the POINT_HEAT reasoning), so full range would white the cells
    // out; only the lane points spark toward 1.0. The uSpot branch is uniform control
    // flow, so it is legal (and free when off) on every GL — including SwiftShader.
    // Helpers take p as a parameter and never touch gl_FragCoord (camProg rewrites it).
    const FS_SUN = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uDensity; uniform float uLane;
    uniform float uGlow; uniform float uSpot; uniform float uZoom;
    out vec4 o;
    float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
    vec2 h22(vec2 p){ float n = h21(p); return vec2(n, h21(p + n + 17.17)); }
    vec2 site(vec2 cell, float t){
      vec2 h = h22(cell);
      // hashed incommensurate frequencies: each cell boils on its own ~20-40 s cycle
      return cell + 0.5 + 0.38*vec2(sin(t*(0.18 + 0.14*h.x) + h.x*6.2831853),
                                    cos(t*(0.15 + 0.13*h.y) + h.y*6.2831853));
    }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      vec2 q = vec2((gl_FragCoord.x/fw - 0.5)*(fw/fh), gl_FragCoord.y/fh - 0.5) / uZoom;
      float t = uTime;
      vec2 p = q * uDensity;
      vec2 g = floor(p);
      float F1 = 64.0, F2 = 64.0; vec2 id = g;
      for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++){
        vec2 cell = g + vec2(float(i), float(j));
        float d = distance(p, site(cell, t));
        if (d < F1) { F2 = F1; F1 = d; id = cell; }
        else if (d < F2) { F2 = d; }
      }
      float lane = smoothstep(0.0, uLane, F2 - F1);        // 0 in the lane, 1 inside a cell
      float hb = h21(id + 7.7);                            // per-cell brightness personality
      float osc = 0.5 + 0.5*sin(t*(0.20 + 0.20*hb) + hb*6.2831853);   // ~15-30 s convection
      float fall = 1.0 - 0.30*smoothstep(0.0, 0.8, F1);    // brighter toward the cell centre
      float ls = 0.94 + 0.06*sin(p.x*0.33 + t*0.05)*sin(p.y*0.29 - t*0.04);
      float heat = mix(0.16, (0.58 + 0.27*osc)*fall, lane) * ls;
      // tiny bright points living in the lanes: a finer 3x lattice, hash-thresholded,
      // each blinking on its own hashed phase — the magnetic bright points in the video
      vec2 lg = floor(p*3.0);
      float hp = h21(lg + 3.3);
      vec2 fp = fract(p*3.0) - (0.25 + 0.5*h22(lg + 9.9));
      float blink = 0.5 + 0.5*sin(t*(0.3 + 0.5*hp) + hp*6.2831853);
      heat = max(heat, (1.0 - lane) * step(0.93, hp) * blink * (1.0 - smoothstep(0.0, 0.11, length(fp))));
      if (uSpot > 0.001) {
        float ru = uSpot*0.22;                             // umbra radius, screen halves
        float d = length(q);
        float ang = atan(q.y, q.x + 1e-5);
        // penumbra: radial spokes with an angular wobble and a very slow shimmer.
        // NB 1.0 - smoothstep(lo, hi, d), never smoothstep(hi, lo, d) — reversed
        // edges are formally undefined in GLSL.
        float fil = 0.5 + 0.5*sin(ang*44.0 + 2.5*sin(ang*9.0 + t*0.07) + d*uDensity*0.9);
        float pen = 1.0 - smoothstep(ru*1.05, ru*2.6, d);
        heat = mix(heat, 0.18 + 0.42*fil, pen*0.9);        // filaments over the granules
        heat *= smoothstep(ru*0.55, ru, d);                // umbra sinks to ~0
      }
      o = vec4(clamp(heat*uGlow, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Kefrens bars: the classic per-scanline effect — each row draws the bars at a phase
    // offset of its own, so vertical ribbons weave impossibly through each other. The 12
    // loop bound is the Bars slider's max (same slider-ceiling coupling as FS_METABALL).
    const FS_KEFRENS = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uBars; uniform float uSway; uniform float uWidth; uniform float uZoom;
    out vec4 o;
    void main(){
      float fw = uSize.x, fh = uSize.y;
      vec2 q = (vec2(gl_FragCoord.x/fw, gl_FragCoord.y/fh) - 0.5)/uZoom + 0.5;
      float y = q.y, t = uTime, heat = 0.0;
      int n = int(uBars);
      for (int b = 0; b < 12; b++){
        if (b >= n) break;
        float fb = float(b);
        float bx = 0.5 + uSway*(0.62*sin(t*(0.90 + 0.13*fb) + y*4.6 + fb*2.39)
                              + 0.38*sin(t*(0.53 + 0.07*fb) - y*7.7 + fb*1.17));
        float bar = max(0.0, 1.0 - abs(q.x - bx)/uWidth);
        float sh = 0.55 + 0.45*sin(y*40.0 + fb*1.7 + t*2.0);   // raster gradient inside the bar
        heat = max(heat, bar*bar*(0.45 + 0.55*sh));
      }
      o = vec4(clamp(heat*0.92, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Twister: the classic twisting column. Four edges at cos(a + i*90°); a face is the
    // span between consecutive edges wherever the right edge sits right of the left one,
    // shaded by its orientation. Up to 3 columns, phase-offset.
    const FS_TWISTER = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uCols; uniform float uWidth; uniform float uTwist; uniform float uZoom;
    out vec4 o;
    void main(){
      float fw = uSize.x, fh = uSize.y;
      float ar = fw/fh;
      vec2 q = vec2((gl_FragCoord.x/fw - 0.5)*ar, gl_FragCoord.y/fh - 0.5)/uZoom;
      float heat = 0.0;
      int n = int(uCols);
      for (int c = 0; c < 3; c++){
        if (c >= n) break;
        float fc = float(c);
        float cx = (fc - (uCols - 1.0)*0.5) * uWidth*2.9;
        float a = uTime*(1.0 + 0.13*fc) + q.y*uTwist + 0.35*sin(uTime*0.42 + q.y*2.2 + fc*2.1);
        for (int i = 0; i < 4; i++){
          float fi = float(i);
          float x0 = cx + uWidth*cos(a + fi*1.5708);
          float x1 = cx + uWidth*cos(a + (fi + 1.0)*1.5708);
          if (x1 > x0 && q.x >= x0 && q.x <= x1){
            float sh = 0.25 + 0.75*abs(sin(a + fi*1.5708 + 0.7854));   // face lighting
            float u = (q.x - x0)/max(x1 - x0, 1e-4);
            heat = max(heat, sh + 0.18*pow(abs(u*2.0 - 1.0), 6.0));    // bright seams at the edges
          }
        }
      }
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Cymatics: Chladni-plate standing waves. Heat is highest ON the nodal lines (where
    // the sand collects), so the picture is the classic bright line-figure; Sharpness
    // thins the lines. Non-integer modes morph smoothly, which is what the Mode slider's
    // drift (or a beat snap) animates.
    const FS_CYMATICS = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uModeN; uniform float uModeM; uniform float uSharp; uniform float uShim; uniform float uZoom;
    out vec4 o;
    void main(){
      float fw = uSize.x, fh = uSize.y;
      float ar = fw/fh;
      vec2 q = vec2((gl_FragCoord.x/fw - 0.5)*ar, gl_FragCoord.y/fh - 0.5)*2.0/uZoom;
      float t = uTime;
      float xx = q.x + uShim*0.05*sin(t*0.8 + q.y*5.0);
      float yy = q.y + uShim*0.05*cos(t*0.7 + q.x*4.0);
      float k = 1.5707963;
      float ch = cos(uModeN*k*xx)*cos(uModeM*k*yy) + cos(uModeM*k*xx)*cos(uModeN*k*yy);
      float lines = pow(clamp(1.0 - abs(ch)*0.5, 0.0, 1.0), uSharp);   // sand on the nodes
      float anti  = 0.10*pow(abs(ch)*0.5, 2.0);                        // faint antinode sheen
      o = vec4(clamp(lines + anti, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Lightning storm: up to 5 simultaneous bolts, each a 1-D value-noise path x(y) from
    // a per-bolt seed. uEnv is the strike envelope (1 = fresh bolt, decaying to 0) and
    // uSeed changes per strike, so every flash is a NEW bolt — both come from stormSeed,
    // where the beat-armed Strike slider and the auto Rate clock are merged.
    // Each bolt is an L-system-style fractal: the main channel is four octaves of
    // LINEAR-interpolated value noise (piecewise-straight — the kinks ARE the jaggedness;
    // smoothstep interp read as a wavy ribbon) scaled by a per-strike random roughness,
    // and the rewrite rule grows 2–4 BRANCH channels at hash-picked fork heights, angled
    // outward and fading toward their tips. Every parameter re-rolls per strike (all
    // hash-derived from uSeed, so no extra uniforms carry the geometry).
    // uFront is the STRIKE FRONT: the bolt lights top-to-bottom as the front races down
    // (Strike speed slider), with a hot tip at the leading edge; past 1 the bolt is fully
    // lit and only the envelope decays.
    const FS_STORM = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uEnv; uniform float uSeed; uniform float uBolts; uniform float uGlow; uniform float uZoom; uniform float uFront;
    out vec4 o;
    float h1(float x){ return fract(sin(x*127.1)*43758.5453); }
    float vnl(float t, float s){
      float i = floor(t), f = fract(t);
      return mix(h1(i + s), h1(i + 1.0 + s), f);
    }
    float chanX(float y, float sk, float ar){
      float rough = 0.8 + 0.5*h1(sk + 51.0);
      return (h1(sk)*0.9 - 0.45)*ar
           + rough*(0.42*(vnl(y*3.0,  sk + 7.0)  - 0.5)
                  + 0.22*(vnl(y*9.0,  sk + 17.0) - 0.5)
                  + 0.11*(vnl(y*27.0, sk + 29.0) - 0.5)
                  + 0.05*(vnl(y*81.0, sk + 43.0) - 0.5));
    }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      float ar = fw/fh;
      vec2 q = vec2((gl_FragCoord.x/fw - 0.5)*ar, gl_FragCoord.y/fh - 0.5)/uZoom;
      float yt = q.y + 0.5;                       // 0 at the SCREEN top (buffer is Y-flipped)
      float heat = 0.0;
      int n = int(uBolts);
      for (int k = 0; k < 5; k++){
        if (k >= n) break;
        float sk = uSeed + float(k)*271.13;
        float fl = 0.72 + 0.28*sin(uEnv*40.0 + sk*9.0);   // flicker as the envelope decays
        float bright = uEnv*fl*(0.7 + 0.3*h1(sk + 3.3));
        float lit = 1.0 - smoothstep(uFront - 0.05, uFront + 0.01, yt);
        float bx = chanX(yt, sk, ar);
        float d = abs(q.x - bx);
        heat = max(heat, bright*lit*(exp(-d*90.0) + 0.30*exp(-d*14.0)));
        if (uFront < 1.05){                       // the hot tip racing down the channel
          vec2 tp = vec2(chanX(uFront, sk, ar), uFront);
          float dt2 = length(vec2(q.x, yt) - tp);
          heat = max(heat, bright*1.5*exp(-dt2*40.0));
        }
        int nb = 2 + int(h1(sk + 41.0)*2.99);     // the split rule: 2-4 forks per strike
        for (int j = 0; j < 4; j++){
          if (j >= nb) break;
          float sj = sk + float(j)*17.71 + 5.0;
          float yf = 0.12 + 0.62*h1(sj);
          float len = 0.15 + 0.30*h1(sj + 2.0);
          float t = (yt - yf)/len;
          if (t < 0.0 || t > 1.0) continue;
          float slope = (h1(sj + 4.0) - 0.5)*1.6;
          float bxj = chanX(yf, sk, ar) + slope*(yt - yf)
                    + 0.12*t*(vnl(yt*13.0, sj + 6.0) - 0.5)
                    + 0.05*(vnl(yt*41.0, sj + 8.0) - 0.5);
          float dj = abs(q.x - bxj);
          heat = max(heat, bright*lit*0.55*(1.0 - 0.6*t)*exp(-dj*110.0));
        }
      }
      // sky flash + a whisper of ambience so the frame is not dead black between strikes
      heat += uEnv*uGlow*0.22*(0.4 + 0.6*(1.0 - yt)) + uGlow*0.05;
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Mandelbulb: the power-N 3D fractal, raymarched with the standard distance
    // estimator — from INSIDE. The camera flies the canyons between the lobes instead of
    // orbiting the silhouette, so uPos/uFwd come from the CPU (bulbSeed): keeping the
    // camera in free space means evaluating the DE AROUND the path, which only the CPU
    // side can do. The shader just builds the view basis and marches.
    //
    // Wide lens (1.15 against the Menger corridor's 1.4) — at arm's length from a wall a
    // narrow one shows a single flat patch of surface, and the whole point of being in
    // here is the structure closing over your head.
    const FS_BULB = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform vec3 uPos; uniform vec3 uFwd; uniform float uPower; uniform float uIter; uniform float uGlow; uniform float uZoom;
    out vec4 o;
    float bulbDE(vec3 p, float P, int it){
      vec3 z = p;
      float dr = 1.0, r = 0.0;
      for (int i = 0; i < 12; i++){
        if (i >= it) break;
        r = length(z);
        if (r > 2.0) break;
        float th = acos(clamp(z.z/max(r, 1e-6), -1.0, 1.0));
        float ph = atan(z.y, z.x);
        // ONE pow, not two: pow(r, P-1) is pow(r, P)/r. Measured 4.11 -> 3.67 ms at 4K (-11%).
        // Not bit-identical in float -- the pixel gate hash moves -- but the picture differs
        // by 0.002 levels on average, on a handful of edge pixels, and nowhere past a 2-level
        // threshold. The r guard matches the one acos() already needs above.
        float zr = pow(r, P);
        dr = (zr/max(r, 1e-6))*P*dr + 1.0;
        th *= P; ph *= P;
        z = zr*vec3(sin(th)*cos(ph), sin(th)*sin(ph), cos(th)) + p;
      }
      return 0.5*log(max(r, 1e-6))*r/dr;
    }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      float ar = fw/fh;
      vec2 uv = vec2((gl_FragCoord.x/fw - 0.5)*ar, gl_FragCoord.y/fh - 0.5)*2.0/uZoom;
      // View basis from the CPU heading. The path winds about the bulb's polar axis so the
      // tangent is never near it, but guard anyway — a degenerate cross is a blank frame.
      vec3 f = normalize(uFwd);
      vec3 wup = abs(f.z) > 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
      vec3 rt = normalize(cross(wup, f));
      vec3 up = cross(f, rt);
      vec3 ro = uPos;
      vec3 rd = normalize(rt*uv.x + up*uv.y + f*1.73);
      int it = int(uIter);
      float P = uPower;
      float t = 0.0, halo = 9.0, heat = 0.0, steps = 0.0;
      for (int i = 0; i < 80; i++){
        vec3 p = ro + rd*t;
        float d = bulbDE(p, P, it);
        halo = min(halo, d/max(t, 0.25));
        steps = float(i);
        if (d < 0.001*max(t, 0.3)){
          float e = 0.0012*max(t, 0.3);
          vec2 h = vec2(1.0, -1.0)*0.5773;
          vec3 nrm = normalize(h.xyy*bulbDE(p + h.xyy*e, P, it) + h.yyx*bulbDE(p + h.yyx*e, P, it)
                             + h.yxy*bulbDE(p + h.yxy*e, P, it) + h.xxx*bulbDE(p + h.xxx*e, P, it));
          float dif = max(0.0, dot(nrm, normalize(vec3(0.6, 0.7, -0.5))));
          float rim = pow(1.0 - abs(dot(nrm, -rd)), 2.0);
          // Depth cues, measured FROM THE BULB rather than from the camera. The fog used to be
          // exp(-t*0.85) -- metres of bulb, tuned when the camera flew inside the canyons at
          // t well under 1. With Distance moved out to 2.5 every ray arrives at t ~ 1.4-3 and
          // that curve crushed the whole solid toward black, hardest at the silhouette: the
          // "sharp black region outside the fractal" was the fog, not the geometry.
          //
          // length(ro) - 1.25 is roughly where the surface begins (the bulb's radius is ~1.2),
          // so this fogs DEPTH INTO the object and behaves the same at any Distance.
          float near = max(0.0, length(ro) - 1.25);
          float fog = exp(-max(0.0, t - near)*0.85);
          float ao = 1.0 - steps/80.0;
          heat = (0.16 + 0.72*dif + uGlow*0.5*rim)*(0.30 + 0.70*fog)*(0.45 + 0.55*ao);
          break;
        }
        t += d;
        // The far bound has to clear the CAMERA's distance, not a fixed 3.2 that was set when
        // the camera lived inside the shell. From Distance 2.5 a ray needs ~4 units to cross
        // the whole solid, so rays toward the rim were hitting the bound and returning a miss
        // -- a hard-edged black region with no geometry behind it.
        if (t > length(ro) + 2.6) break;
      }
      if (heat == 0.0) heat = uGlow*0.35*exp(-halo*55.0);   // proximity halo on a miss
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Quaternion Julia: z -> z^2 + c iterated in the QUATERNIONS, raymarched as a solid.
    // The set is 4-dimensional, so what is on screen is a 3D SLICE of it — uSlice is where
    // that slice is cut along the fourth axis, and sliding it morphs the solid continuously
    // through shapes no 3D fractal can hold still.
    //
    // c comes from THE SAME cardioid orbit Julia rides (juliaSeed, in the descriptor),
    // so the Orbit editor drives this effect for free and everything already known about
    // where to sit relative to the Mandelbrot set still applies.
    //
    // c IS PURELY COMPLEX, and that is not a simplification. z^2+c in the quaternions is
    // invariant under rotations of the imaginary 3-space, so ANY c can be rotated into the
    // (1, i) plane: every quaternion Julia set of this family is a surface of revolution,
    // and giving c a j or k component only turns the solid on the spot. It does raise |c|
    // though, and past the escape radius the set is empty — which is a black screen for a
    // control that was supposed to add detail. (Tried, rendered nothing, removed.)
    //
    // The shape variety is in the SLICE instead, which is where it always was: the set is
    // 4D and the screen is 3D, so something has to be cut. uSlice is where the cut falls,
    // and uCut ROTATES THE CUTTING HYPERPLANE in the (real, k) plane — at 0 the familiar
    // (x, y, z, slice) sample, and winding it round trades the real axis for the fourth one
    // and walks through cross-sections nothing in 3D can show.
    //
    // ---- THE SHARED 3D WORLD ------------------------------------------------------
    // One raymarch over the geometry of SEVERAL LAYERS AT ONCE, so a Glass ball genuinely
    // reflects in the Ocean and the Ocean genuinely reflects in the ball. Layers are
    // independent full-screen passes everywhere else in this file; an effect could already
    // READ what was beneath it (glBelowTex), but that is a screen-space sample of a flat
    // picture — one-directional, with no occlusion and no contact line where a ball meets
    // the water. This traces both objects as one scene.
    //
    // PER-LAYER PALETTES SURVIVE BECAUSE THE OUTPUT IS A G-BUFFER, not a picture: heat in
    // .r and an object ID in .g. A trivial mask pass (FS_WORLDPICK) then hands each layer
    // only its own pixels, and everything downstream — that layer's feedback chain, its
    // palette, its post filters, the OKLab merge — carries on knowing nothing about this.
    //
    // THE CAMERA IS THE OCEAN'S: at (0, CAM_H, 0) looking +z with its downward tilt. A
    // world needs a ground and a horizon and that is the only participant that has one, so
    // it is the canonical frame whether or not an Ocean layer is present. Everything else
    // is PLACED into it (uGbPlace = xyz offset, w scale). This shader still goes through
    // camProg, so the owning layer's Camera X/Y/Z, Zoom and Field of view orbit the whole
    // world — no new camera controls, and none of the old ones stop working.
    //
    // Reflected light is written into the REFLECTOR's layer, so the water seen inside the
    // ball is tinted by the BALL's palette. That is the rule glBelowTex already follows and
    // it is what keeps a split by primary-hit ID coherent — a pixel belongs to exactly one
    // layer, whatever it happens to be showing.
    //
    // TWO MARCHES, NOT ONE. The SDF union is sphere-traced and the Ocean is a height field
    // with a geometric step law; they want different steps, so each is marched with the
    // code it already had and the nearer hit wins. Occlusion falls out of that comparison.
    // W_GB / W_SD / W_QJ / W_VB ARE INJECTED, one per group, and they are the difference
    // between this shader linking in 3 seconds and 64. The driver's backend does not care
    // how many groups a frame USES -- it optimises everything worldMap can reach, at every
    // call site, and the cost compounds: ocean+glass links in 3.5s, adding solids and
    // Quaternion Julia takes it to 25s, all five to 64s. (Not loop unrolling -- rewriting
    // every march bound as a uniform, which is unrollable-proof, changed nothing.) So the
    // groups that have not joined are #if'd out of existence before the source is compiled,
    // and worldProgFor builds one program per COMBINATION.
    const FS_WORLD = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uZoom;
    uniform sampler2D uBelow; uniform float uHasBelow;
    uniform float uOcOn; uniform float uOcId; uniform float uTime; uniform float uSwell;
    uniform float uChop; uniform float uFoam; uniform float uWind; uniform float uHeight;
    uniform float uReflect;
    uniform float uGbOn;
    uniform float uGbId[4]; uniform float uGbTime[4]; uniform float uGbCount[4]; uniform vec2 uGbSalt[4];
    uniform float uGbRad[4]; uniform float uGbMat[4]; uniform float uGbIor[4]; uniform float uGbGlow[4];
    uniform vec4 uGbPlace[4];
    uniform float uSdOn; uniform float uSdId; uniform float uSdCount; uniform float uSdRim;
    uniform vec4 uSdPos[8]; uniform vec4 uSdQuat[8]; uniform float uSdShape[8];
    uniform vec4 uSdPlace;
    uniform float uQjOn; uniform float uQjId; uniform float uQjPhase; uniform float uQjSlice;
    uniform float uQjCut; uniform float uQjIter; uniform float uQjGlow;
    uniform vec4 uQjC; uniform vec4 uQjPlace; uniform vec3 uQjRot;
    uniform float uVbOn; uniform float uVbId; uniform float uVbPhase; uniform float uVbCount;
    uniform float uVbShape; uniform float uVbRad; uniform float uVbGlow;
    uniform vec4 uVbPlace;
    out vec4 o;
    const int WAVE_OCT_MARCH = 3;
    const float CAM_H = 3.4;

    // ---- geometry, lifted from the two effects' own shaders ----
    // HEIGHT ONLY, for the MARCH. The march decides geometry from h alone and never reads
    // dh, but waves() computes the derivative regardless -- a pow and a cos per octave, paid
    // up to 32 steps per ray for a value that was thrown away. Same octave loop, same
    // constants, same normalisation, so the height is bit-identical to what waves() returns
    // and the picture cannot move; only the dead half is gone. waves() stays as it is for
    // the shading normal, which is the one caller that wants dh.
    // FOUR SURFACES, chosen by the Surface slider (uSurf). All are HEIGHT FIELDS in [0,1] over
    // the same wind-rotated frame, so the march, the secant step, the foam and the reflection
    // work unchanged for every one of them; only the shape of the water differs.
    //   0 Sine chop     -- the shipped sum of sharpened sines, byte-identical to before.
    //   1 Seascape      -- Alekseev's octave (Seascape, 2014): 1-|sin| blended with |cos| by
    //                      itself, raised to the chop. Round troughs, drawn-out crests.
    //   2 Long swell    -- what the shipped one lacks: SCALE. Two long, slow, nearly-round
    //                      swells a decade below the chop, with the sharpened chop riding on
    //                      them. It reads as a sea because the big waves are big.
    //   3 Rolling noise -- a hash-free noise: eight low sines at golden-angle directions and
    //                      mismatched speeds, domain-warped by two more. NOT fract(sin()*43758):
    //                      that hash is a driver-build detector (see the glass ball), and a sea
    //                      that reshapes itself when the driver recompiles is the ghost bug again.
#if W_SURF_SINE
    float surfSine(vec2 p, vec2 dir, int oct){
      float amp = 1.0, frq = 0.40, spd = 1.0, norm = 0.0, h = 0.0;
      for (int i = 0; i < 6; i++){
        if (i >= oct) break;
        float ph = dot(p, dir)*frq + uTime*spd;
        float s = sin(ph)*0.5 + 0.5;
        h += amp*pow(s, uChop);
        norm += amp;
        amp *= 0.62; frq *= 1.87; spd *= 1.21;
        dir = normalize(vec2(dir.x*0.62 - dir.y*0.78, dir.x*0.78 + dir.y*0.62));
      }
      return h / max(norm, 1e-4);
    }
#endif
#if W_SURF_SEA
    float surfSea(vec2 p, vec2 dir, int oct){
      mat2 R = mat2(dir.x, -dir.y, dir.y, dir.x);
      vec2 q = R*p;
      float amp = 1.0, frq = 0.16, spd = 0.8, norm = 0.0, h = 0.0;
      float choppy = 0.6 + 0.35*uChop;
      for (int i = 0; i < 6; i++){
        if (i >= oct) break;
        vec2 uv = (q + uTime*spd*vec2(1.0, 0.6))*frq;
        // SOFT abs: the classic 1-|sin| has a C0 crease along every cell edge, and with only
        // ~6 octaves those creases shade as a visible tiling of squares. sqrt(x*x+k) rounds the
        // crease off; the cell pattern stays, the polygon edges do not.
        vec2 sn = sin(uv), cs = cos(uv);
        vec2 wv = 1.0 - sqrt(sn*sn*0.78 + 0.22), swv = sqrt(cs*cs*0.78 + 0.22);
        wv = mix(wv, swv, wv);
        // exp(-c*P), NOT the classic 1-pow(P, 0.65): that has infinite slope where P hits 0,
        // i.e. a hard crease along every cell edge, and the crests shaded as a net of polygons.
        // exp is smooth at 0 and c sets the crest width (2.5 broad .. 6 sharp; 4 chosen by eye).
        h += pow(exp(-4.0*wv.x*wv.y), choppy)*amp;
        norm += amp;
        q = mat2(1.6, 1.2, -1.2, 1.6)*q;
        frq *= 1.9; amp *= 0.30; spd *= 1.1; choppy = mix(choppy, 1.0, 0.2);
      }
      return h / max(norm, 1e-4);
    }
#endif
#if W_SURF_SWELL
    float surfSwell(vec2 p, vec2 dir, int oct){
      // Two long swells (wavelengths ~60 and ~40 units), almost round, then the chop.
      vec2 d2 = normalize(vec2(dir.x*0.94 - dir.y*0.34, dir.x*0.34 + dir.y*0.94));
      float a = sin(dot(p, dir)*0.105 + uTime*0.55)*0.5 + 0.5;
      float b = sin(dot(p, d2)*0.160 + uTime*0.72)*0.5 + 0.5;
      float h = 1.0*pow(a, 1.35) + 0.6*pow(b, 1.35), norm = 1.6;
      // The chop rides the swell: the shipped octave loop, an octave up, at a third the weight.
      float amp = 0.34, frq = 0.75, spd = 1.2;
      vec2 dd = d2;
      for (int i = 0; i < 6; i++){
        if (i + 2 >= oct) break;
        float ph = dot(p, dd)*frq + uTime*spd;
        h += amp*pow(sin(ph)*0.5 + 0.5, uChop);
        norm += amp;
        amp *= 0.6; frq *= 1.9; spd *= 1.2;
        dd = normalize(vec2(dd.x*0.62 - dd.y*0.78, dd.x*0.78 + dd.y*0.62));
      }
      return h / norm;
    }
#endif
#if W_SURF_NOISE
    float surfNoise(vec2 p, vec2 dir, int oct){
      // Domain warp first, so the crests bend instead of running straight.
      mat2 R = mat2(dir.x, -dir.y, dir.y, dir.x);
      vec2 q = R*p;
      q += 1.8*vec2(sin(q.y*0.09 + uTime*0.31), sin(q.x*0.11 - uTime*0.27));
      float h = 0.0, norm = 0.0, amp = 1.0, frq = 0.13;
      float ang = 0.3;
      for (int i = 0; i < 8; i++){
        if (i >= oct + 2) break;
        vec2 d = vec2(cos(ang), sin(ang));
        float s = sin(dot(q, d)*frq + uTime*(0.5 + 0.13*float(i)))*0.5 + 0.5;
        h += amp*pow(s, 1.0 + 0.25*uChop);
        norm += amp;
        ang += 2.39996; amp *= 0.68; frq *= 1.53;
      }
      return h / max(norm, 1e-4);
    }
#endif
    float waveH(vec2 p, int oct){
      float wr = uWind*0.017453293;
      vec2 dir = vec2(cos(wr), sin(wr));
#if W_SURF_SEA
      return surfSea(p, dir, oct);
#endif
#if W_SURF_SWELL
      return surfSwell(p, dir, oct);
#endif
#if W_SURF_NOISE
      return surfNoise(p, dir, oct);
#endif
#if W_SURF_SINE
      return surfSine(p, dir, oct);
#endif
    }
    void waves(vec2 p, int oct, out float h, out vec2 dh){
#if !W_SURF_SINE
        // The three new surfaces take their shading gradient by central differences: two
        // extra height evaluations on the SHADING path only (the march uses waveH), which is
        // cheaper to write and to link than three analytic gradients, and the step is well
        // under the finest octave's wavelength.
        h = waveH(p, oct);
        const float e = 0.05;
        dh = vec2(waveH(p + vec2(e, 0.0), oct) - waveH(p - vec2(e, 0.0), oct),
                  waveH(p + vec2(0.0, e), oct) - waveH(p - vec2(0.0, e), oct)) / (2.0*e);
        return;
#endif
      float wr = uWind*0.017453293;
      vec2 dir = vec2(cos(wr), sin(wr));
      float amp = 1.0, frq = 0.40, spd = 1.0, norm = 0.0;
      h = 0.0; dh = vec2(0.0);
      for (int i = 0; i < 6; i++){
        if (i >= oct) break;
        float ph = dot(p, dir)*frq + uTime*spd;
        float s = sin(ph)*0.5 + 0.5;
        h += amp*pow(s, uChop);
        norm += amp;
        // ONE pow, not two: pow(s, c-1) is pow(s, c)/s. Not bit-identical in float (the pixel
        // gate hash moves) but the picture differs by at most one level. A first isolated
        // measurement read it 3.6x SLOWER (0.28 -> 0.99 ms at 4K); on the shipped build it
        // re-measured at 0.241 against 0.275, so that reading was a one-off and did not
        // reproduce. If Ocean ever regresses, this is the first line to A/B.
        float sp = pow(max(s, 1e-4), uChop);
        float dw = amp*uChop*(sp/max(s, 1e-4))*0.5*cos(ph)*frq;
        dh += dw*dir;
        amp *= 0.62; frq *= 1.87; spd *= 1.21;
        dir = normalize(vec2(dir.x*0.62 - dir.y*0.78, dir.x*0.78 + dir.y*0.62));
      }
      h /= max(norm, 1e-4);
    }
    float waveAmp(){ return min(uHeight, CAM_H*0.55); }
    // NO HASH IN THE SHADER. The one that used to be here, fract(sin(x*127.1+311.7)*43758.5),
    // is the classic non-portable hash: sin() of a large argument, scaled by 43758, then the
    // fractional part -- which AMPLIFIES the low bits of whatever sin() implementation the
    // driver chose into an entirely different value. NVIDIA's D3D11 backend recompiles and
    // re-optimises programs in the background, and two builds of this shader evaluated the
    // hash differently. It fed both the ball's start angle AND its rate, so two builds meant
    // two trajectories -- drawn on alternate frames as the driver swapped between them.
    // That was the "ghost ball": the same animation far behind, the original vanishing
    // whenever it showed. It never appeared under WARP, whose one deterministic compiler
    // produces one build. The two values are now computed ONCE on the CPU (gbHashJS, where
    // Math.sin is deterministic) and handed in as uniforms.
    // THE SALT IS WHAT KEEPS TWO GLASS LAYERS APART. Ball position was a pure function of the
    // clock and the ball index, and installStack seeds every layer's clock from the same
    // place -- so two glass layers drew ball 1 in exactly the same spot and KEPT it there.
    // h1 shifts where a layer's balls start; h2 detunes the rate, which is the half that
    // matters, because two orbits at the same speed with different offsets stay a fixed
    // distance apart forever and can still line up.
    vec3 ballAt(int i, float t, vec2 salt){
      float f = float(i);
      float h1 = salt.x, h2 = salt.y;
      float a = t*(0.60 + 0.13*f + 0.09*h2) + f*2.39996 + h1*6.2831853;
      float b = t*(0.41 + 0.09*f + 0.07*h1) + f*1.11700 + h2*6.2831853;
      return vec3(1.25*sin(a) + 0.35*sin(b*1.7),
                  0.85*sin(b) + 0.25*cos(a*1.3),
                  0.60*cos(a*0.8 + f));
    }
    // p_local = (p_world - offset)/scale, and the distance comes back MULTIPLIED BY SCALE.
    // Dropping that multiply is the classic placed-SDF bug: the marcher then takes steps in
    // local units through world space, overshoots, and punches holes in the object — which
    // reads as a broken shader rather than as a missing factor. worldprobe pins it.
    // UP TO FOUR GLASS LAYERS AT ONCE -- the one-per-kind rule is lifted for this effect,
    // because two glass layers reflecting each other at their true positions is the whole
    // request. Each group keeps its own placement, clock, material and ID; the union
    // reports WHICH group was nearest (.y) so the shading can use that group's material.
    vec2 glassDE(vec3 p){
#if W_GB
      float d = 1e9, gid = 0.0;
      // W_GBN is a COMPILE-TIME constant, injected per program like the W_* gates: the
      // driver's backend pays for every group a loop can reach, so a uniform bound made
      // one glass layer link like four (12s against 3.5). One program per count instead.
      for (int g = 0; g < W_GBN; g++){
        vec3 pl = (p - uGbPlace[g].xyz)/uGbPlace[g].w;
        // NO BOUNDING SPHERE HERE, and that is a measured decision rather than an oversight.
        // CLAUDE.md lists glassDE as a missing one, and one was written and then taken out again:
        // its case is FRAME time, and the frame has ~4x headroom (measured: worst case 4.2ms of a
        // 16.7ms budget at 4K), while glass already dominates the world program LINK time, which
        // is the thing that is actually too slow -- 7.7s alone, 133.8s for the five-way. Adding
        // the branch moved the total link the wrong way -- 399s baseline, 472s with it, 407s once
        // reverted, across all sixteen -- and the
        // frame benefit could not be shown at all. Optimising a non-problem at the cost of the
        // real one. If it comes back, measure the WORLD frame cost first, not the standalone one
        // -- FS_GLASS is analytic and never calls this.
        float dg = 1e9;
        // 3 == the Balls slider max (controls-schema.js 'gbcount'); glassprobe pins the two together.
        for (int i = 0; i < 3; i++){
          if (float(i) >= uGbCount[g]) break;
          dg = min(dg, length(pl - ballAt(i, uGbTime[g], uGbSalt[g])) - uGbRad[g]);
        }
        dg = dg*uGbPlace[g].w;
        if (dg < d){ d = dg; gid = float(g); }
      }
      return vec2(d, gid);
#else
      return vec2(1e9, 0.0);
#endif
    }
    // Which glass group owns this hit ID; -1 if the hit is not glass at all.
    int gbGroupOf(float id){
      for (int g = 0; g < W_GBN; g++){
        if (abs(uGbId[g] - id) < 0.5) return g;
      }
      return -1;
    }
    // Bouncing solids, verbatim from FS_SOLIDS: the bodies carry a quaternion, and an
    // implicit surface has no vertices to hold an orientation, so each SAMPLE is un-rotated
    // instead of the surface being rotated.
    vec3 toBody(vec4 q, vec3 v){ vec3 u = -q.xyz; return v + 2.0*cross(u, cross(u, v) + q.w*v); }
    float shapeDist(int s, vec3 p, float r){
      if (s == 0) return length(p) - r;                                              // sphere
      if (s == 1){ vec3 d = abs(p) - vec3(r*0.55);                                   // box
                   return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0); }
      if (s == 2){ vec2 q = vec2(length(p.xz) - r*0.70, p.y); return length(q) - r*0.30; }   // torus
      if (s == 3){ vec3 q = p; q.y -= clamp(q.y, -r*0.60, r*0.60); return length(q) - r*0.40; }  // capsule
      if (s == 4){ vec3 a = abs(p); return (a.x + a.y + a.z - r)*0.5773; }           // octahedron
      vec2 d = vec2(length(p.xz) - r*0.60, abs(p.y) - r*0.60);                       // cylinder
      return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
    }
    float solidsDE(vec3 p){
#if W_SD
      vec3 pl = (p - uSdPlace.xyz)/uSdPlace.w;
      float d = 1e9; int n = int(uSdCount);
      for (int i = 0; i < 8; i++){
        if (i >= n) break;
        d = min(d, shapeDist(int(uSdShape[i]), toBody(uSdQuat[i], pl - uSdPos[i].xyz), uSdPos[i].w));
      }
      return d*uSdPlace.w;
#else
      return 1e9;
#endif
    }
    // Quaternion Julia, verbatim from FS_QJULIA.
    vec4 qsqr(vec4 a){ return vec4(a.x*a.x - dot(a.yzw, a.yzw), 2.0*a.x*a.yzw); }
    vec4 qjLift(vec3 p, float s, float ca, float sa){
      return vec4(p.x*ca - s*sa, p.y, p.z, p.x*sa + s*ca);
    }
    float qjDE(vec4 z, vec4 c, int it){
      float md2 = 1.0, mz2 = dot(z, z);
      for (int i = 0; i < 12; i++){
        if (i >= it) break;
        md2 *= 4.0*mz2;
        z = qsqr(z) + c;
        mz2 = dot(z, z);
        if (mz2 > 16.0) break;
      }
      return 0.25*sqrt(mz2/md2)*log(max(mz2, 1e-12));
    }
    float qjuliaDE(vec3 p){
#if W_QJ
      vec3 pl = (p - uQjPlace.xyz)/uQjPlace.w;
      // THE OBJECT TUMBLES HERE. Standalone, this effect orbits its CAMERA about the solid;
      // in a shared world the camera belongs to everyone, so the same rotation has to move
      // the object instead or the whole scene would swing with it.
      float c1 = cos(uQjPhase), s1 = sin(uQjPhase);
      pl = vec3(pl.x*c1 + pl.z*s1, pl.y, -pl.x*s1 + pl.z*c1);
      float tl = 0.32*sin(uQjPhase*0.6), c2 = cos(tl), s2 = sin(tl);
      pl = vec3(pl.x, pl.y*c2 - pl.z*s2, pl.y*s2 + pl.z*c2);
      // The object's own orientation (Pitch/Yaw/Roll + tumble) -- with the camera fixed this
      // is the only way to turn the solid. Same three rotations, same order, as qjOrient.
      float c3, s3;
      c3 = cos(uQjRot.x); s3 = sin(uQjRot.x); pl = vec3(pl.x, pl.y*c3 - pl.z*s3, pl.y*s3 + pl.z*c3);
      c3 = cos(uQjRot.y); s3 = sin(uQjRot.y); pl = vec3(pl.x*c3 + pl.z*s3, pl.y, -pl.x*s3 + pl.z*c3);
      c3 = cos(uQjRot.z); s3 = sin(uQjRot.z); pl = vec3(pl.x*c3 - pl.y*s3, pl.x*s3 + pl.y*c3, pl.z);
      // Outside |q| = 2 the escape-time estimate says nothing useful, so hand back the
      // distance TO the bounding sphere: a valid bound, and the thing that stops the
      // marcher crawling step by step through vacuum on its way in.
      float br = length(pl) - 2.0;
      if (br > 0.0) return br*uQjPlace.w;
      return qjDE(qjLift(pl, uQjSlice, cos(uQjCut), sin(uQjCut)), uQjC, int(uQjIter))*uQjPlace.w;
#else
      return 1e9;
#endif
    }
    // Vector balls, and the one participant that needed NEW geometry. Standalone it is a
    // projected sprite rasteriser -- it never had a distance function, it z-sorts discs --
    // so it could not be traced against anything. Its bobs ARE spheres though, and vbForm
    // already supplies the centres, so in the world it becomes a sphere union. The sprite
    // path stays for non-world mode: the cheap projection IS the Amiga look.
    vec3 vbForm(float fi, float fn, int shape){
      if (shape == 0){                       // cube lattice
        float side = ceil(pow(fn, 1.0/3.0));
        float ix = mod(fi, side);
        float iy = mod(floor(fi/side), side);
        float iz = floor(fi/(side*side));
        return (vec3(ix, iy, iz) - (side - 1.0)*0.5)*(2.4/max(1.0, side - 1.0));
      }
      if (shape == 1){                       // sphere shell, Fibonacci-spaced
        float k = (fi + 0.5)/fn;
        float ph = acos(clamp(1.0 - 2.0*k, -1.0, 1.0));
        float th = 2.399963*fi;
        return vec3(sin(ph)*cos(th), sin(ph)*sin(th), cos(ph))*1.45;
      }
      if (shape == 2){                       // tilted ring
        float a = fi/fn*6.2831853;
        return vec3(cos(a)*1.5, sin(a*2.0)*0.45, sin(a)*1.5);
      }
      float u = fi/fn;                       // double helix
      float a = u*12.0 + (mod(fi, 2.0) < 0.5 ? 0.0 : 3.1415927);
      return vec3(cos(a)*0.95, (u - 0.5)*3.0, sin(a)*0.95);
    }
    float vballsDE(vec3 p){
#if W_VB
      vec3 pl = (p - uVbPlace.xyz)/uVbPlace.w;
      // UN-TUMBLE THE SAMPLE rather than rotating 48 centres: the formation turns as one
      // rigid body, so one inverse rotation of the point replaces N of the constellation.
      // Pitch then yaw, the reverse of the order the effect applies them.
      float cx = cos(uVbPhase*0.63), sx = sin(uVbPhase*0.63);
      vec3 q = vec3(pl.x, pl.y*cx + pl.z*sx, -pl.y*sx + pl.z*cx);
      float cy = cos(uVbPhase), sy = sin(uVbPhase);
      q = vec3(q.x*cy - q.z*sy, q.y, q.x*sy + q.z*cy);
      // A BOUNDING SPHERE, and it is the whole cost of this group. The widest formation
      // reaches 1.57 from the centre (the tilted ring), so outside 1.6 + the ball radius the
      // union IS the distance to that sphere and the 48-iteration loop can be skipped --
      // which is most of the march, since most of the march is empty space.
      float br = length(q) - (1.6 + uVbRad);
      if (br > 0.05) return br*uVbPlace.w;
      float d = 1e9; int n = int(uVbCount);
      for (int i = 0; i < 48; i++){
        if (i >= n) break;
        d = min(d, length(q - vbForm(float(i), uVbCount, int(uVbShape))) - uVbRad);
      }
      return d*uVbPlace.w;
#else
      return 1e9;
#endif
    }
    // The SDF union. Returns distance and the ID of whatever is nearest. Each group is
    // gated by its own On uniform, so a kind that has not joined costs one compare.
    vec2 worldMap(vec3 p){
      float d = 1e9, id = 0.0;
#if W_GB
      if (uGbOn > 0.5){ vec2 g = glassDE(p); if (g.x < d){ d = g.x; id = uGbId[int(g.y + 0.5)]; } }
#endif
#if W_SD
      if (uSdOn > 0.5){ float g = solidsDE(p); if (g < d){ d = g; id = uSdId; } }
#endif
#if W_QJ
      if (uQjOn > 0.5){ float g = qjuliaDE(p); if (g < d){ d = g; id = uQjId; } }
#endif
#if W_VB
      if (uVbOn > 0.5){ float g = vballsDE(p); if (g < d){ d = g; id = uVbId; } }
#endif
      return vec2(d, id);
    }
    vec3 sdfNormal(vec3 p){
      vec2 e = vec2(1.0, -1.0)*0.0015;
      return normalize(e.xyy*worldMap(p + e.xyy).x + e.yyx*worldMap(p + e.yyx).x
                     + e.yxy*worldMap(p + e.yxy).x + e.xxx*worldMap(p + e.xxx).x);
    }
    // Sphere-trace the SDF union. -1 = nothing.
    float traceSdf(vec3 ro, vec3 rd, int steps, out float id){
      float t = 0.02; id = 0.0;
      for (int i = 0; i < 96; i++){
        if (i >= steps) break;
        vec2 m = worldMap(ro + rd*t);
        if (m.x < 0.0015*max(t, 1.0)){ id = m.y; return t; }
        t += m.x;
        if (t > 90.0) break;
      }
      return -1.0;
    }
    // March the water. Geometric steps for the same reason FS_OCEAN uses them: near water
    // needs fine sampling and far water is a handful of pixels.
    float traceOcean(vec3 ro, vec3 rd, int steps){
      if (uOcOn < 0.5 || rd.y > -0.004) return -1.0;
      float amp = waveAmp(), tp = 0.6, dp = ro.y;
      for (int i = 1; i <= 32; i++){
        if (i > steps) break;
        float t = 0.6*pow(1.24, float(i));
        vec3 p = ro + rd*t;
        float hh;
        hh = waveH(p.xz, WAVE_OCT_MARCH);
        float d = p.y - hh*amp;
        if (d < 0.0) return tp + (t - tp)*dp/max(dp - d, 1e-4);
        tp = t; dp = d;
        if (t > 420.0) break;
      }
      return -1.0;
    }
    // Nearest of the two, so a ball in front of a wave hides it and a wave in front of a
    // ball hides that.
    float traceWorld(vec3 ro, vec3 rd, int sdfSteps, int ocSteps, out float id){
      float ti = traceSdf(ro, rd, sdfSteps, id);
      float to = traceOcean(ro, rd, ocSteps);
      if (to > 0.0 && (ti < 0.0 || to < ti)){ id = uOcId; return to; }
      return ti;
    }
    float skyOf(vec3 d){
      float sky = 0.10*exp(-max(0.0, d.y)*9.0);
      float sun = pow(max(0.0, dot(normalize(d), normalize(vec3(0.40, 0.62, -0.68)))), 60.0);
      return clamp(sky + 0.55*sun, 0.0, 1.0);
    }
    // Shading with NO further bounce -- what a reflection ray sees. GLSL has no recursion, so
    // the single bounce is unrolled: main() shades the primary hit inline and calls envRay,
    // envRay marches and ends here, and this function calls nothing further. (It used to say
    // 'and shade1 below'. There is no shade1; the second half is the inline block in main().)
    float shade0(float id, vec3 p, vec3 rd, float t){
      if (id == uOcId){
        float hh; vec2 dd;
        waves(p.xz, 6, hh, dd);
        vec3 n = normalize(vec3(-dd.x*uSwell, 1.0, -dd.y*uSwell));
        float fade = 1.0/(1.0 + t*t*0.0016);
        float glint = pow(max(0.0, dot(n, normalize(vec3(0.35, 0.55, -0.75)))), 22.0);
        // Foam takes its slope from the COARSE gradient (3 octaves), not the shading one: the fine
          // octaves are a lattice of ridges at pixel scale, and gating foam on them drew a crosshatch
          // that read as a grid. Soft saturate instead of clamp so the gate has no hard edge either.
          float hc; vec2 dc; waves(p.xz, 3, hc, dc);
          float slope = 1.0 - exp(-length(dc)*uSwell*1.2);
        // Upper edge floored 0.02 ABOVE uFoam, mirroring oceanCPU's Math.max(0.02, ...) denominator.
        // Foam reaches exactly 1.0, where min(0.995, 1.22) lands BELOW the lower edge -- undefined
        // in GLSL, and it snapped the sea to solid white in one 0.01 step while the CPU kept ramping.
        float foam = smoothstep(uFoam, max(uFoam + 0.02, min(0.995, uFoam + 0.38)), hh*0.65 + slope*0.55);
        return (0.10 + 0.48*hh*hh + 0.45*glint + 0.55*foam)*fade;
      }
      vec3 n = sdfNormal(p);
      float face = max(0.0, dot(n, -rd));
      float rim = pow(1.0 - face, 2.0);
      // Each object keeps its OWN key light, so it still looks like itself inside someone
      // else's reflection as well as in the primary view.
      if (id == uSdId && uSdOn > 0.5)
        return 0.14 + 0.62*max(0.0, dot(n, vec3(-0.4557, 0.7295, -0.5104))) + uSdRim*0.5*rim;
      if (id == uQjId && uQjOn > 0.5)
        return 0.20 + 0.72*max(0.0, dot(n, normalize(vec3(0.55, 0.75, -0.5)))) + uQjGlow*0.55*rim;
      if (id == uVbId && uVbOn > 0.5)
        return 0.14 + 0.78*max(0.0, dot(n, normalize(vec3(0.45, 0.6, -0.66)))) + uVbGlow*0.7*rim;
      // GLASS SEEN INSIDE SOMEONE ELSE'S REFLECTION, or in the water. Still NO nested bounce --
      // the environment here is the SKY, not the scene, so a ball reflected in a ball does not
      // contain the scene -- but it is now the group's real MATERIAL rather than a flat lambert.
      // Before this, Metal, Glass and Bubble all came back as the same featureless sphere and
      // uGbMat/uGbIor were not consulted at all, so the Material slider changed the primary view
      // and nothing about the reflections.
      //
      // It is free. The normal is the sdfNormal already computed above for the face term, and skyOf is loop-free
      // arithmetic that touches no worldMap -- no march, no SDF evaluation, no new call site, so
      // the world program's link time is unchanged (measured: flat inside the run-to-run band).
      int gg = gbGroupOf(id);
      float glow = gg >= 0 ? uGbGlow[gg] : 0.5;
      float gmat = gg >= 0 ? uGbMat[gg]  : 1.0;
      float gior = gg >= 0 ? uGbIor[gg]  : 1.45;
      float gfres = pow(1.0 - face, 5.0);
      float genv = skyOf(reflect(rd, n));
      // refract INTO the denser medium (1/ior < 1) cannot total-internally-reflect, so the
      // zero-vector guard main() needs at its exit interface is not needed here.
      float gbody = gmat < 0.5
        ? genv*0.90
        : mix(skyOf(refract(rd, n, 1.0/gior))*0.78, genv, clamp(0.20 + gfres*2.0, 0.0, 1.0));
      // A small ambient + face term stays: the sky alone carries far less energy than the
      // 0.10 + 0.55*face it replaces, and a Metal ball turned away from the sun would otherwise
      // sink into a dark ripple and disappear.
      return gbody + 0.06 + 0.18*face + (0.06 + glow*0.55)*rim;
    }
    // THE PICTURE THE REFLECTIONS DRAPE -- the layers below the glass, already palette-mapped
    // and already through their own filter chains, captured one frame ago (captureWorldBelow).
    // Same crude directional projection the standalone glass shader uses on its own uBelow,
    // and deliberately the same: PARITY ACROSS THE HANDOVER is the whole point. While the world
    // program is still linking the joined layers draw themselves standalone and reflect this
    // picture; once it landed they reflected procedurally shaded water instead, so a filter on
    // the ocean visibly dropped out of the balls a few seconds after load.
    // It is frankly a fake -- it drapes the whole picture by ray direction rather than
    // reflecting the correct part of it -- and that is the point too. A true screen-space
    // reflection is available here (the camera inverts cleanly) but a mirror ball reflects most
    // of a hemisphere the camera never saw, so it would be filtered over the wedge that happens
    // to be on screen and unfiltered everywhere else, with a moving seam between the two.
    // Colour in, HEAT out: the world writes one channel, so luminance is all that can be taken
    // and the reflecting layer's own palette colours it.
    float belowAt(vec3 d){
      // The +1.25 keeps the divisor off zero for a ray travelling across the screen plane,
      // which would otherwise smear one texel over the whole ball.
      vec2 uv = 0.5 + 0.5*d.xy/(abs(d.z) + 1.25);
      vec3 c = texture(uBelow, clamp(uv, 0.002, 0.998)).rgb;
      return dot(c, vec3(0.299, 0.587, 0.114));
    }
    float envRay(vec3 ro, vec3 rd){
      float id;
      float t = traceWorld(ro + rd*0.02, rd, 48, 24, id);
      // Water and empty sky both come from the real picture when there is one; a SOLID keeps
      // its own shading, so a ball reflected in a ball still reads as a ball. The trace still
      // decides which of the three a ray found, so occlusion, the horizon and every silhouette
      // are unchanged -- only the brightness of the water and the sky comes from the picture.
      // uOcId is 0 with no ocean joined, and 0 is the reserved 'nothing hit' id no layer holds,
      // so the test cannot fire on a real hit in a world that has no water.
      if (uHasBelow > 0.5 && (t < 0.0 || id == uOcId)) return belowAt(rd);
      if (t < 0.0) return skyOf(rd);
      // NO distance fade here, matching standalone on both sides: the ocean's own reflection
      // divides by its primary hit's fade at the call site, and glass applies none.
      return shade0(id, ro + rd*t, rd, t);
    }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      // The OCEAN's screen convention: +y is up, which is the negation the y-flipped heat
      // buffer needs. Every placed object inherits it.
      vec2 q = vec2((gl_FragCoord.x/fw - 0.5)*(fw/fh), 0.5 - gl_FragCoord.y/fh)*2.0/uZoom;
      vec3 ro = vec3(0.0, CAM_H, 0.0);
      vec3 rd = normalize(vec3(q.x, q.y - 0.30, 1.35));
      float id;
      float t = traceWorld(ro, rd, 96, 32, id);
      float heat = 0.0;
      if (t < 0.0){
        // NOTHING HIT: the sky belongs to the water's layer when there is one, so the
        // horizon and the ball's layer do not both paint the same empty pixels in two
        // different palettes.
        heat = uOcOn > 0.5 ? 0.10*exp(-max(0.0, rd.y)*9.0) : 0.0;
        id = uOcOn > 0.5 ? uOcId : 0.0;
      } else if (id == uOcId){
        vec3 p = ro + rd*t;
        float hh; vec2 dd;
        waves(p.xz, 6, hh, dd);
        vec3 n = normalize(vec3(-dd.x*uSwell, 1.0, -dd.y*uSwell));
        heat = shade0(uOcId, p, rd, t);
        if (uReflect > 0.0){
          // A REAL reflection ray now, not a screen-space guess: this is what puts the ball
          // in the water.
          //
          // FRESNEL ALONE IS TOO HONEST HERE. It is what makes water read as water, and at
          // this camera height (3.4 above the surface) it also means the near sea is viewed
          // far too steeply to show anything: a metal ball sitting in the water measured a
          // 15% brightening of an already-bright ripple, which is invisible. So the slider
          // does two jobs — up to 1.0 it scales the physical reflection, and ABOVE 1.0 it
          // lifts the curve toward a flat mirror. 0..1 is a sea, 2 is polished, and the
          // shipped 0.6 is exactly what it was.
          float fres = 0.02 + 0.98*pow(1.0 - max(0.0, dot(n, -rd)), 5.0);
          float w = min(uReflect, 1.0)*mix(fres, 1.0, clamp(uReflect - 1.0, 0.0, 1.0));
          // MIX, NOT ADD. A reflection REPLACES the surface in proportion to Fresnel; adding
          // it means a mirror image landing on an already-bright ripple clamps out and
          // vanishes, which is exactly what happened — the ray was hitting the ball
          // perfectly (verified by outputting the hit test alone) and the picture showed
          // nothing. Both terms carry the same distance fade, so they mix at like for like.
          heat = mix(heat, envRay(p, reflect(rd, n))/(1.0 + t*t*0.0016), w);
        }
        heat += 0.16*exp(-abs(rd.y + 0.004)*260.0);      // the bright line at the horizon
#if !W_GB
      } else {
        heat = shade0(id, ro + rd*t, rd, t);
      }
#else
      } else if (uGbOn < 0.5 || gbGroupOf(id) < 0){
        // Solids and Quaternion Julia are opaque and shade exactly as they do standalone.
        // They are in the world to be SEEN by the reflective ones and to occlude them --
        // giving them their own reflection rays would double the trace for a material that
        // never had one.
        heat = shade0(id, ro + rd*t, rd, t);
      } else {
        // Every glass parameter is the HIT GROUP's -- two glass layers can be different
        // materials, and each is reflected in the other with its own look.
        int gg = gbGroupOf(id);
        float mat = uGbMat[gg], ior = uGbIor[gg], glow = uGbGlow[gg];
        vec3 p = ro + rd*t;
        vec3 n = sdfNormal(p);
        float face = max(0.0, dot(n, -rd));
        float fres = pow(1.0 - face, 5.0);
        float rim = pow(1.0 - face, 2.0);                // the wide term that makes a ball a ball
        vec3 refl = reflect(rd, n);
        if (mat < 0.5){
          heat = envRay(p, refl)*0.90 + (0.06 + glow*0.55)*rim;
        } else if (mat < 1.5){
          vec3 r1 = refract(rd, n, 1.0/ior);
          // Exit through the far side of the same ball. Placed geometry, so the centre has
          // to come back out of the placement rather than being read from a uniform.
          vec3 pl = (p - uGbPlace[gg].xyz)/uGbPlace[gg].w;
          vec3 cl = vec3(0.0);
          float bd = 1e9;
          for (int i = 0; i < 3; i++){          // == the Balls slider's max; see glassDE
            if (float(i) >= uGbCount[gg]) break;
            vec3 ci = ballAt(i, uGbTime[gg], uGbSalt[gg]);
            float di = abs(length(pl - ci) - uGbRad[gg]);
            if (di < bd){ bd = di; cl = ci; }
          }
          vec3 ctr = uGbPlace[gg].xyz + cl*uGbPlace[gg].w;
          vec3 pe = p - 2.0*dot(p - ctr, r1)*r1;
          vec3 n2 = normalize(pe - ctr);
          vec3 r2 = refract(r1, -n2, ior);
          if (dot(r2, r2) < 0.001) r2 = reflect(r1, -n2);
          heat = mix(envRay(pe, r2)*0.78, envRay(p, refl), clamp(fres*1.6, 0.0, 1.0))
               + (0.06 + glow*0.70)*rim;
        } else {
          vec3 r1 = refract(rd, n, 1.0/ior);
          vec3 thin = normalize(mix(rd, r1, 0.30));
          heat = mix(envRay(p, thin)*0.60, envRay(p, refl), clamp(0.20 + fres*2.0, 0.0, 1.0))
               + (0.14 + glow*0.9)*rim;
        }
      }
#endif
      // A HIT keeps at least ONE HEAT QUANTUM. Coverage (the OVER blend's alpha) is heat>0,
      // and an opaque surface can legitimately shade to ~0 -- a metal ball's front top
      // reflects the near-black sky with the rim term at zero -- so without this floor the
      // coverage mask punched a hole in the ball exactly where a highlight belongs, showing
      // the background through it as black. One quantum renders as the palette's DARKEST
      // colour, which is what a dark part of an opaque object should be.
      if (id > 0.5) heat = max(heat, 0.004);
      o = vec4(clamp(heat, 0.0, 0.92), id/255.0, 0.0, 1.0);
    }`;
    // Hand one layer its own pixels out of the world G-buffer. Everything downstream —
    // feedback, palette, post chain, blend — then behaves exactly as it does for an effect
    // that drew itself.
    // Crossfade between a layer's own heat and its world slice, for the handover while the
    // world program links (and back again when a layer leaves). mix in HEAT space, before the
    // palette, so the fade is one picture becoming another rather than two pictures added.
    const FS_WORLDMIX = `#version 300 es
    precision highp float;
    uniform sampler2D uA; uniform sampler2D uB; uniform float uT;
    in vec2 vUv; out vec4 o;
    void main(){ o = vec4(mix(texture(uA, vUv).r, texture(uB, vUv).r, uT), 0.0, 0.0, 1.0); }`;
    const FS_WORLDPICK = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uId;
    out vec4 o;
    void main(){
      vec4 s = texture(uSrc, gl_FragCoord.xy/uSize);
      // Exact ID compare with a half-step tolerance: the buffer is RGBA8, so an id rides as
      // id/255 and comes back within half a quantum. A fuzzy compare here would bleed one
      // layer's heat into another's palette.
      o = vec4(s.r*step(abs(s.g*255.0 - uId), 0.5), 0.0, 0.0, 1.0);
    }`;
    // Glass ball: raytraced spheres that REFLECT AND REFRACT THE LAYERS BENEATH THEM.
    //
    // Analytic, not raymarched. A sphere is the one primitive with a closed-form ray
    // intersection, and a marcher here would buy nothing but steps — which matters because
    // Glass traces a second and third ray per pixel (in, out, and the reflection) and a
    // marched version of that is three raymarches.
    //
    // THE ENVIRONMENT IS THE LAYER UNDERNEATH. `uBelow` is the OKLab accumulator holding
    // every layer merged so far (glBelowTex), and a reflected or refracted ray is projected
    // back onto the screen to read it — the screen-space environment-map trick. It is
    // approximate by construction: what a ray "sees" is whatever the flat picture happens to
    // hold in that direction, so the world behind the camera is the world in front of it.
    // At ball scale nobody can tell, and the alternative is a cube map of a scene that only
    // exists as one frame.
    //
    // With nothing underneath (uHasBelow 0 — a single-layer scene) it falls back to a
    // procedural room, so the effect stands on its own. That fallback is not decoration: an
    // effect whose whole subject is reflection renders as a flat disc without one.
    //
    // Heat, not colour, is what comes back — the pipeline is single-channel — so the ball
    // reflects the BRIGHTNESS of what is behind it and gets tinted by its own palette.
    const FS_GLASS = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uCount; uniform float uRad;
    uniform float uMat; uniform float uIor; uniform float uGlow; uniform float uZoom;
    uniform vec2 uSalt;
    uniform sampler2D uBelow; uniform float uHasBelow;
    out vec4 o;
    // NO HASH IN THE SHADER. The one that used to be here, fract(sin(x*127.1+311.7)*43758.5),
    // is the classic non-portable hash: sin() of a large argument, scaled by 43758, then the
    // fractional part -- which AMPLIFIES the low bits of whatever sin() implementation the
    // driver chose into an entirely different value. NVIDIA's D3D11 backend recompiles and
    // re-optimises programs in the background, and two builds of this shader evaluated the
    // hash differently. It fed both the ball's start angle AND its rate, so two builds meant
    // two trajectories -- drawn on alternate frames as the driver swapped between them.
    // That was the "ghost ball": the same animation far behind, the original vanishing
    // whenever it showed. It never appeared under WARP, whose one deterministic compiler
    // produces one build. The two values are now computed ONCE on the CPU (gbHashJS, where
    // Math.sin is deterministic) and handed in as uniforms.
    // THE SALT IS WHAT KEEPS TWO GLASS LAYERS APART. Ball position was a pure function of the
    // clock and the ball index, and installStack seeds every layer's clock from the same
    // place -- so two glass layers drew ball 1 in exactly the same spot and KEPT it there.
    // h1 shifts where a layer's balls start; h2 detunes the rate, which is the half that
    // matters, because two orbits at the same speed with different offsets stay a fixed
    // distance apart forever and can still line up.
    // Two incommensurate rates per ball, offset by the golden angle, so they drift through
    // each other instead of orbiting in formation.
    vec3 ballAt(int i, float t, vec2 salt){
      float f = float(i);
      float h1 = salt.x, h2 = salt.y;
      float a = t*(0.60 + 0.13*f + 0.09*h2) + f*2.39996 + h1*6.2831853;
      float b = t*(0.41 + 0.09*f + 0.07*h1) + f*1.11700 + h2*6.2831853;
      return vec3(1.25*sin(a) + 0.35*sin(b*1.7),
                  0.85*sin(b) + 0.25*cos(a*1.3),
                  0.60*cos(a*0.8 + f));
    }
    float env(vec3 d){
      if (uHasBelow > 0.5){
        // Screen-space projection of the ray. The +1.25 keeps the divisor away from zero for
        // a ray travelling across the screen plane, which would otherwise smear one texel
        // over the whole ball.
        vec2 uv = 0.5 + 0.5*d.xy/(abs(d.z) + 1.25);
        vec3 c = texture(uBelow, clamp(uv, 0.002, 0.998)).rgb;
        return dot(c, vec3(0.299, 0.587, 0.114));
      }
      // Procedural room: sky, a low sun, and a receding floor grid to reflect.
      float sky = 0.14 + 0.52*pow(max(0.0, d.y), 0.7);
      float sun = pow(max(0.0, dot(d, normalize(vec3(0.40, 0.62, -0.68)))), 60.0);
      float fl = 0.0;
      if (d.y < -0.02){
        float tf = -1.6/d.y;
        vec2 g = abs(fract(d.xz*tf*0.35) - 0.5);
        // A FALLING ramp has to be written this way round: smoothstep(hi, lo, x) is
        // undefined in GLSL and this GPU answers 0, which would delete the floor entirely.
        fl = (1.0 - smoothstep(0.40, 0.50, max(g.x, g.y)))/(1.0 + tf*tf*0.02);
      }
      return clamp(sky + 0.85*sun + 0.60*fl, 0.0, 1.0);
    }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      vec2 uv = vec2((gl_FragCoord.x/fw - 0.5)*(fw/fh), gl_FragCoord.y/fh - 0.5)*2.0/uZoom;
      vec3 ro = vec3(0.0, 0.0, -3.2);
      vec3 rd = normalize(vec3(uv, 1.55));
      int n = int(uCount);
      float best = 1e9;
      vec3 nrm = vec3(0.0, 0.0, -1.0), ctr = vec3(0.0);
      bool hit = false;
      for (int i = 0; i < 3; i++){          // == the Balls slider's max; see glassDE in FS_WORLD
        if (i >= n) break;
        vec3 c = ballAt(i, uTime, uSalt);
        vec3 oc = ro - c;
        float b = dot(oc, rd), q = dot(oc, oc) - uRad*uRad;
        float h = b*b - q;
        if (h < 0.0) continue;
        h = sqrt(h);
        float tn = -b - h;
        if (tn < 0.0) tn = -b + h;
        if (tn > 0.0 && tn < best){ best = tn; ctr = c; hit = true; }
      }
      float heat;
      if (!hit){
        // OUTSIDE THE BALLS, DRAW NOTHING when there is a layer beneath. Painting the
        // environment here would repaint the layer below in this layer's palette, which
        // hides it instead of reflecting it -- the opposite of the point. On its own the
        // room is the backdrop and is worth drawing.
        heat = uHasBelow > 0.5 ? 0.0 : env(rd)*0.42;
      } else {
        vec3 p = ro + rd*best;
        nrm = normalize(p - ctr);
        float face = max(0.0, dot(nrm, -rd));
        float fres = pow(1.0 - face, 5.0);
        // A SECOND, WIDER grazing term, and it is what makes the ball a ball. The Fresnel
        // exponent of 5 is physically right and visually useless here: it lights a hairline
        // at the very limb, so over a smooth layer (plasma, aurora) the ball showed only a
        // gently distorted copy of the background and vanished into it. Exponent 2 draws a
        // broad bright edge that outlines the sphere against anything, which is the job.
        float rim = pow(1.0 - face, 2.0);
        vec3 refl = reflect(rd, nrm);
        if (uMat < 0.5){                     // METAL -- an opaque mirror
          heat = env(refl)*0.90 + (0.06 + uGlow*0.55)*rim;
        } else if (uMat < 1.5){              // GLASS -- refract in, refract out again
          vec3 r1 = refract(rd, nrm, 1.0/uIor);
          // The exit point is the far intersection with the SAME sphere, and because the
          // entry point is already on the surface it is a single dot product rather than a
          // second quadratic: t = -2 (p - c) . r1.
          vec3 pe = p - 2.0*dot(p - ctr, r1)*r1;
          vec3 n2 = normalize(pe - ctr);
          vec3 r2 = refract(r1, -n2, uIor);
          // refract() returns 0 on total internal reflection, which would read as a black
          // patch on the far limb -- exactly where a real glass ball goes mirror-bright.
          if (dot(r2, r2) < 0.001) r2 = reflect(r1, -n2);
          // The interior is pulled down as well as outlined: at equal brightness a refracted
          // copy of the layer below reads as more of the layer below, not as glass.
          heat = mix(env(r2)*0.78, env(refl), clamp(fres*1.6, 0.0, 1.0)) + (0.06 + uGlow*0.70)*rim;
        } else {                             // BUBBLE -- a thin shell: rim, and a faint bend
          vec3 r1 = refract(rd, nrm, 1.0/uIor);
          vec3 thin = normalize(mix(rd, r1, 0.30));
          heat = mix(env(thin)*0.60, env(refl), clamp(0.20 + fres*2.0, 0.0, 1.0))
               + (0.14 + uGlow*0.9)*rim;
        }
      }
      // Same one-quantum floor the world pass applies on a hit: coverage is heat>0, and a
      // dark metal face must stay part of the ball, not become a hole showing the layer
      // below. Misses keep their exact 0 -- that IS the mask.
      if (hit) heat = max(heat, 0.004);
      o = vec4(clamp(heat, 0.0, 0.92), 0.0, 0.0, 1.0);
    }`;
    // Doughnut: the inside of a torus, flown along the tube.
    //
    // The camera never needs a DE-escape solver the way the Mandelbulb's does, and that is
    // the whole reason this effect is cheap: the free space is KNOWN. The tube's centre
    // circle is free by construction, so the CPU parks the camera on it (bulbSeed's helix,
    // without the correction) and the wobble is capped well inside the narrowest wall.
    //
    // DE is the CROSS-SECTION distance — wall radius minus how far the point sits from the
    // centre circle — which is an OVERestimate wherever the ray runs along the tube rather
    // than across it. So the march scales its step (MK below). Without that the ray steps
    // clean through a wall on the inside of the bend and the tunnel gains holes.
    //
    // **uTwist is a FREE FLOAT; the seam it would draw is unwound over a window.** The flute
    // pattern is cos(flute·(tubeAngle + twist·arc)) and 'arc' is an atan2, so it jumps by 2π
    // at the branch cut and only closes there when flute·twist is whole. Rather than pin
    // Twist to integers (it was 'single' for that reason, and could not drift), the shortfall
    // -- at most half a flute period, so at most π/flute of tube angle -- is wound back in
    // over the last radian before the cut. At a whole flute·twist the correction is exactly
    // zero and the picture is what it always was. uFlute stays an integer.
    const FS_TORUS = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform vec3 uPos; uniform vec3 uFwd;
    uniform float uRing; uniform float uTube; uniform float uTwist; uniform float uFlute;
    uniform float uGlow; uniform float uZoom;
    out vec4 o;
    float torusDE(vec3 p){
      float q = length(p.xy) - uRing;              // radial offset from the centre circle
      float arc = atan(p.y, p.x);                  // how far round the doughnut
      vec2 c = vec2(q, p.z);
      float rad = length(c);
      float ang0 = atan(c.y, c.x);
      // Seam closure (see above): s ramps 0..1 over the last radian before the cut.
      float s = smoothstep(2.1415927, 3.1415927, arc);
      float k = uTwist*uFlute;
      float dlt = (fract(k + 0.5) - 0.5)/max(uFlute, 1.0);
      float ang = ang0 + uTwist*arc - 6.2831853*dlt*s;   // tube angle, wound along the arc
      float angC = ang0 + uTwist*(arc - 6.2831853*s);    // fully unwound, for the corrugation
      // Scalloped wall + a fine corrugation along the arc. The corrugation is what gives
      // the flight a sense of speed at low twist, where the flutes slide past too slowly.
      float wall = uTube*(1.0 - 0.18*cos(uFlute*ang))
                 - uTube*(0.055*cos(arc*24.0) + 0.022*cos(arc*97.0 + angC*3.0));
      return wall - rad;                           // positive inside the pipe
    }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      vec2 uv = vec2((gl_FragCoord.x/fw - 0.5)*(fw/fh), gl_FragCoord.y/fh - 0.5)*2.0/uZoom;
      vec3 f = normalize(uFwd);
      vec3 wup = abs(f.z) > 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
      vec3 rt = normalize(cross(wup, f));
      vec3 up = cross(f, rt);
      vec3 ro = uPos;
      vec3 rd = normalize(rt*uv.x + up*uv.y + f*1.25);
      const float MK = 0.62;                       // step safety, see the note above
      float t = 0.0, halo = 9.0, heat = 0.0, steps = 0.0;
      for (int i = 0; i < 72; i++){
        vec3 p = ro + rd*t;
        float d = torusDE(p);
        halo = min(halo, d/max(t, 0.25));
        steps = float(i);
        if (d < 0.0015*max(t, 0.5)){
          float e = 0.002*max(t, 0.5);
          vec2 h = vec2(1.0, -1.0)*0.5773;
          vec3 nrm = normalize(h.xyy*torusDE(p + h.xyy*e) + h.yyx*torusDE(p + h.yyx*e)
                             + h.yxy*torusDE(p + h.yxy*e) + h.xxx*torusDE(p + h.xxx*e));
          // The normal points INTO the pipe (the field is positive inside), so the light
          // is carried with the camera -- there is no sun in here.
          float dif = max(0.0, dot(nrm, -rd));
          float rim = pow(1.0 - dif, 3.0);
          // HEADLAMP FALLOFF, not fog, is the depth cue in here. A tunnel is a metre wide
          // and lit from the camera, so an exponential haze barely varies over the range
          // that matters (exp(-0.3t) is 0.86 to 0.55 across the whole near wall) and the
          // frame comes out one flat sheet of white. Inverse-square does vary: 0.9 at the
          // wall beside you, 0.2 a few units on, 0.03 down the bend.
          // INVERSE-LINEAR, and it was tuned against the palette rather than against the
          // geometry. Inverse-SQUARE reads correctly and looks wrong: the wall in here sits
          // 1-4 units out, over which t*t*0.45 swings 20x and the whole frame collapses into
          // the bottom quarter of the ramp (measured: one flat dark brown). Plain exponential
          // fog is the other failure -- it barely moves over that range and the frame comes
          // out one flat sheet of white. This holds the near wall around 0.75, the mid tunnel
          // around 0.5 and the far bend under 0.3, which is the band the palettes actually use.
          float lamp = 1.0/(1.0 + t*0.42);
          float ao = 1.0 - steps/72.0;
          // Ceiling 0.82, the shader-side POINT_HEAT: 14 of the 19 palettes are near-white
          // at the top of the ramp, so a surface allowed to reach 1.0 reads as blown out
          // rather than as brightly lit. A CLAMP, not a scale -- scaling darkens the mid
          // tones that are doing all the work to fix a problem only the peak has.
          heat = min(0.82, (0.10 + 0.95*dif*lamp + uGlow*0.6*rim*lamp)*(0.6 + 0.4*ao));
          break;
        }
        t += d*MK;
        if (t > 26.0) break;
      }
      if (heat == 0.0) heat = uGlow*0.22*exp(-halo*40.0);   // proximity halo on a miss
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // DE is iq's: |z|·log|z|/|dz| with |dz| tracked as the scalar md2 (=|dz|^2), which is
    // exact here because the derivative of z^2+c is 2z and only its MAGNITUDE is needed.
    const FS_QJULIA = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform vec4 uC; uniform float uPhase; uniform float uSlice;
    uniform float uCut; uniform float uIter; uniform float uGlow; uniform float uZoom;
    uniform vec3 uRot;
    out vec4 o;
    // The object's own orientation (Pitch/Yaw/Roll + tumble), applied to the SAMPLE point:
    // an implicit surface has no vertices to rotate, so the ray is un-rotated instead. Same
    // three rotations, same order, as qjuliaDE in the shared world, so a scene set up here
    // looks the same after it joins.
    vec3 qjOrient(vec3 p, vec3 r){
      float c, s;
      c = cos(r.x); s = sin(r.x); p = vec3(p.x, p.y*c - p.z*s, p.y*s + p.z*c);
      c = cos(r.y); s = sin(r.y); p = vec3(p.x*c + p.z*s, p.y, -p.x*s + p.z*c);
      c = cos(r.z); s = sin(r.z); p = vec3(p.x*c - p.y*s, p.x*s + p.y*c, p.z);
      return p;
    }
    vec4 qsqr(vec4 a){ return vec4(a.x*a.x - dot(a.yzw, a.yzw), 2.0*a.x*a.yzw); }
    // Lift a 3D sample point into the 4D domain through the rotated cutting hyperplane.
    vec4 qjLift(vec3 p, float s, float ca, float sa){
      return vec4(p.x*ca - s*sa, p.y, p.z, p.x*sa + s*ca);
    }
    float qjDE(vec4 z, vec4 c, int it){
      float md2 = 1.0, mz2 = dot(z, z);
      for (int i = 0; i < 12; i++){
        if (i >= it) break;
        md2 *= 4.0*mz2;              // |dz|^2 *= |2z|^2
        z = qsqr(z) + c;
        mz2 = dot(z, z);
        if (mz2 > 16.0) break;       // escape: 4^2, well clear of the |z|=2 bound
      }
      return 0.25*sqrt(mz2/md2)*log(max(mz2, 1e-12));
    }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      vec2 uv = vec2((gl_FragCoord.x/fw - 0.5)*(fw/fh), gl_FragCoord.y/fh - 0.5)*2.0/uZoom;
      float ca = cos(uPhase), sa = sin(uPhase);
      float tilt = 0.32*sin(uPhase*0.6), ct = cos(tilt), st = sin(tilt);
      vec3 ro = vec3(0.0, 0.0, -2.9);
      vec3 rd = normalize(vec3(uv, 1.7));
      ro = vec3(ro.x*ca + ro.z*sa, ro.y, -ro.x*sa + ro.z*ca);
      rd = vec3(rd.x*ca + rd.z*sa, rd.y, -rd.x*sa + rd.z*ca);
      ro = vec3(ro.x, ro.y*ct - ro.z*st, ro.y*st + ro.z*ct);
      rd = vec3(rd.x, rd.y*ct - rd.z*st, rd.y*st + rd.z*ct);
      int it = int(uIter);
      vec4 c = uC;
      // kc/ks, NOT ca/sa: the camera orbit above already owns those names in this scope.
      float kc = cos(uCut), ks = sin(uCut);
      // The whole set is inside |q| < 2, so skip the empty run in front of it rather than
      // spending steps on vacuum: enter at the bounding sphere, and give up at the far side.
      float b = dot(ro, rd), cc = dot(ro, ro) - 4.0;
      float disc = b*b - cc;
      float heat = 0.0, halo = 9.0;
      if (disc > 0.0){
        float sd = sqrt(disc);
        float t = max(0.0, -b - sd), tMax = -b + sd;
        for (int i = 0; i < 96; i++){
          if (t > tMax) break;
          vec3 p = qjOrient(ro + rd*t, uRot);
          float d = qjDE(qjLift(p, uSlice, kc, ks), c, it);
          halo = min(halo, d/max(t, 0.3));
          if (d < 0.0006*max(t, 0.5)){
            float e = 0.0009*max(t, 0.5);
            vec2 h = vec2(1.0, -1.0)*0.5773;
            vec3 nrm = normalize(
              h.xyy*qjDE(qjLift(p + h.xyy*e, uSlice, kc, ks), c, it) +
              h.yyx*qjDE(qjLift(p + h.yyx*e, uSlice, kc, ks), c, it) +
              h.yxy*qjDE(qjLift(p + h.yxy*e, uSlice, kc, ks), c, it) +
              h.xxx*qjDE(qjLift(p + h.xxx*e, uSlice, kc, ks), c, it));
            float dif = max(0.0, dot(nrm, normalize(vec3(0.55, 0.75, -0.5))));
            float rim = pow(1.0 - abs(dot(nrm, -rd)), 2.0);
            heat = (0.20 + 0.72*dif + uGlow*0.55*rim)*(1.0 - smoothstep(1.6, 5.0, t));
            break;
          }
          t += d;
        }
      }
      if (heat == 0.0) heat = uGlow*0.35*exp(-halo*55.0);
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Vector balls: the Amiga "bobs in formation" effect — a rigid constellation of shaded
    // spheres tumbling in 3D.
    //
    // Deliberately NOT a raymarch and NOT a distance field. The original was a painter's
    // algorithm over projected sprites, and the modern equivalent of that is a per-pixel
    // z-test: loop every ball, project its centre, and if this pixel lands inside the
    // projected disc work out the depth of the sphere's FRONT surface there and keep the
    // nearest. That gives exact mutual occlusion (a ball in front really does hide the one
    // behind, edge for edge) for a fraction of a marcher's cost, and the ball count is the
    // loop bound rather than a scene-complexity multiplier.
    //
    // The formation is computed IN HERE from the ball index, not passed in as an array, so
    // the effect carries no per-layer state at all beyond its two tumble angles.
    const FS_VBALLS = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uPhase; uniform float uCount; uniform float uShape;
    uniform float uRad; uniform float uGlow; uniform float uZoom;
    out vec4 o;
    vec3 vbForm(float fi, float fn, int shape){
      if (shape == 0){                       // cube lattice
        float side = ceil(pow(fn, 1.0/3.0));
        float ix = mod(fi, side);
        float iy = mod(floor(fi/side), side);
        float iz = floor(fi/(side*side));
        return (vec3(ix, iy, iz) - (side - 1.0)*0.5)*(2.4/max(1.0, side - 1.0));
      }
      if (shape == 1){                       // sphere shell, Fibonacci-spaced so it is even
        float k = (fi + 0.5)/fn;
        float ph = acos(clamp(1.0 - 2.0*k, -1.0, 1.0));
        float th = 2.399963*fi;              // golden angle
        return vec3(sin(ph)*cos(th), sin(ph)*sin(th), cos(ph))*1.45;
      }
      if (shape == 2){                       // tilted ring
        float a = fi/fn*6.2831853;
        return vec3(cos(a)*1.5, sin(a*2.0)*0.45, sin(a)*1.5);
      }
      float u = fi/fn;                       // double helix
      float a = u*12.0 + (mod(fi, 2.0) < 0.5 ? 0.0 : 3.1415927);
      return vec3(cos(a)*0.95, (u - 0.5)*3.0, sin(a)*0.95);
    }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      vec2 uv = vec2((gl_FragCoord.x/fw - 0.5)*(fw/fh), gl_FragCoord.y/fh - 0.5)*2.0/uZoom;
      float ay = uPhase, ax = uPhase*0.63;
      float cy = cos(ay), sy = sin(ay), cx = cos(ax), sx = sin(ax);
      int n = int(uCount), shape = int(uShape);
      float focal = 2.6, camZ = 6.5;
      float bestZ = 1e9, heat = 0.0;
      for (int i = 0; i < 48; i++){
        if (i >= n) break;
        vec3 c = vbForm(float(i), uCount, shape);
        c = vec3(c.x*cy + c.z*sy, c.y, -c.x*sy + c.z*cy);      // yaw
        c = vec3(c.x, c.y*cx - c.z*sx, c.y*sx + c.z*cx);       // then pitch
        float zc = c.z + camZ;
        if (zc < 0.35) continue;
        float k = focal/zc;
        vec2 sp = c.xy*k;
        float rad = uRad*k;
        vec2 d = uv - sp;
        float r2 = dot(d, d), rr = rad*rad;
        if (r2 >= rr) continue;
        // Depth of the sphere's front surface at this pixel, back in world z.
        float zz = sqrt(rr - r2);
        float depth = zc - (zz/k);
        if (depth >= bestZ) continue;
        bestZ = depth;
        vec3 nrm = vec3(d/rad, -zz/rad);
        float dif = max(0.0, dot(nrm, normalize(vec3(0.45, 0.6, -0.66))));
        float rim = pow(1.0 - abs(nrm.z), 3.0);
        // Nearer balls read brighter, which is what separates the formation in depth.
        // A RELATIVE fade across the formation's own depth range, not an inverse-square on
        // absolute distance: the whole cluster sits around z = camZ, so 9.5/zc^2 was a flat
        // ~0.22 multiplier on every ball and the effect came out near-black.
        float dep = mix(1.0, 0.36, clamp((zc - 4.6)/4.2, 0.0, 1.0));
        heat = (0.14 + 0.78*dif + uGlow*0.7*rim)*dep;
      }
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Gerstner ocean: a rolling sea to the horizon.
    //
    // Not a raymarch and not a mesh — the screen ray is intersected with the flat y=0 plane
    // and the wave sum is evaluated at THAT world point. A displaced surface would need
    // marching; at this scale the cheat is invisible and it buys a horizon for free.
    //
    // The waves are a Gerstner-style sum: each octave is a sine SHARPENED by pow(), which is
    // what gives the sea round troughs and peaked crests instead of a bland sine swell —
    // uChop is that exponent. Directions rotate per octave so the swell interferes with
    // itself and never reads as a repeating ripple, and both the height and its analytic
    // derivative come out of the same loop (the derivative is the surface normal, which is
    // what the glint and the foam are actually made of).
    //
    // NB the heat buffer is Y-FLIPPED against the screen, so screen-UP is 0.5 - y/fh. This
    // effect has a horizon, so it is one of the ones that cares (see CLAUDE.md).
     // Ocean: a marched swell that reflects the layers beneath it.
    //
    // THE SURFACE IS INTERSECTED, NOT PROJECTED. The first version solved one plane hit
    // (t = camH / -rd.y) and displaced only the shading normal, which is cheap and is a
    // lie: a crest could not hide the trough behind it, the horizon was a ruler-straight
    // line whatever the sea state, and Swell changed the lighting without changing the
    // shape. Marching the height field and refining the crossing gives real occlusion and
    // a horizon that breaks up in a heavy sea, which is most of what makes water read as
    // water rather than as a shaded plane.
    //
    // Two octave counts, deliberately: the march runs WAVE_OCT_MARCH octaves and the
    // shading runs all six. The fine chop moves the silhouette by less than a pixel at any
    // distance the march cares about, and paying for it 32 times per ray instead of once is
    // the whole cost of the effect.
    //
    // REFLECTION comes from uBelow — the layers already merged underneath this one (see
    // glBelowTex) — read through the same screen-space projection the Glass ball uses, and
    // weighted by Fresnel, so it is a glancing sheen far off and almost nothing straight
    // down. That is how water behaves and it is why the horizon is the bright part. With no
    // layer beneath, uHasBelow is 0 and the sky term stands alone, exactly as before.
    const FS_OCEAN = `#version 300 es
#define SURF_SINE 1
#define SURF_SEA 0
#define SURF_SWELL 0
#define SURF_NOISE 0
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uSwell; uniform float uChop;
    uniform float uFoam; uniform float uWind; uniform float uZoom;
    uniform float uHeight; uniform float uReflect;
    uniform sampler2D uBelow; uniform float uHasBelow;
    out vec4 o;
    const int WAVE_OCT_MARCH = 3;
    const float CAM_H = 3.4;
    // Height (0..1) and its two slopes, summed over 'oct' wave trains whose directions fan
    // out from the wind so the sea interferes with itself instead of repeating.
    // HEIGHT ONLY, for the MARCH. The march decides geometry from h alone and never reads
    // dh, but waves() computes the derivative regardless -- a pow and a cos per octave, paid
    // up to 32 steps per ray for a value that was thrown away. Same octave loop, same
    // constants, same normalisation, so the height is bit-identical to what waves() returns
    // and the picture cannot move; only the dead half is gone. waves() stays as it is for
    // the shading normal, which is the one caller that wants dh.
    // FOUR SURFACES, chosen by the Surface slider (uSurf). All are HEIGHT FIELDS in [0,1] over
    // the same wind-rotated frame, so the march, the secant step, the foam and the reflection
    // work unchanged for every one of them; only the shape of the water differs.
    //   0 Sine chop     -- the shipped sum of sharpened sines, byte-identical to before.
    //   1 Seascape      -- Alekseev's octave (Seascape, 2014): 1-|sin| blended with |cos| by
    //                      itself, raised to the chop. Round troughs, drawn-out crests.
    //   2 Long swell    -- what the shipped one lacks: SCALE. Two long, slow, nearly-round
    //                      swells a decade below the chop, with the sharpened chop riding on
    //                      them. It reads as a sea because the big waves are big.
    //   3 Rolling noise -- a hash-free noise: eight low sines at golden-angle directions and
    //                      mismatched speeds, domain-warped by two more. NOT fract(sin()*43758):
    //                      that hash is a driver-build detector (see the glass ball), and a sea
    //                      that reshapes itself when the driver recompiles is the ghost bug again.
#if SURF_SINE
    float surfSine(vec2 p, vec2 dir, int oct){
      float amp = 1.0, frq = 0.40, spd = 1.0, norm = 0.0, h = 0.0;
      for (int i = 0; i < 6; i++){
        if (i >= oct) break;
        float ph = dot(p, dir)*frq + uTime*spd;
        float s = sin(ph)*0.5 + 0.5;
        h += amp*pow(s, uChop);
        norm += amp;
        amp *= 0.62; frq *= 1.87; spd *= 1.21;
        dir = normalize(vec2(dir.x*0.62 - dir.y*0.78, dir.x*0.78 + dir.y*0.62));
      }
      return h / max(norm, 1e-4);
    }
#endif
#if SURF_SEA
    float surfSea(vec2 p, vec2 dir, int oct){
      mat2 R = mat2(dir.x, -dir.y, dir.y, dir.x);
      vec2 q = R*p;
      float amp = 1.0, frq = 0.16, spd = 0.8, norm = 0.0, h = 0.0;
      float choppy = 0.6 + 0.35*uChop;
      for (int i = 0; i < 6; i++){
        if (i >= oct) break;
        vec2 uv = (q + uTime*spd*vec2(1.0, 0.6))*frq;
        // SOFT abs: the classic 1-|sin| has a C0 crease along every cell edge, and with only
        // ~6 octaves those creases shade as a visible tiling of squares. sqrt(x*x+k) rounds the
        // crease off; the cell pattern stays, the polygon edges do not.
        vec2 sn = sin(uv), cs = cos(uv);
        vec2 wv = 1.0 - sqrt(sn*sn*0.78 + 0.22), swv = sqrt(cs*cs*0.78 + 0.22);
        wv = mix(wv, swv, wv);
        // exp(-c*P), NOT the classic 1-pow(P, 0.65): that has infinite slope where P hits 0,
        // i.e. a hard crease along every cell edge, and the crests shaded as a net of polygons.
        // exp is smooth at 0 and c sets the crest width (2.5 broad .. 6 sharp; 4 chosen by eye).
        h += pow(exp(-4.0*wv.x*wv.y), choppy)*amp;
        norm += amp;
        q = mat2(1.6, 1.2, -1.2, 1.6)*q;
        frq *= 1.9; amp *= 0.30; spd *= 1.1; choppy = mix(choppy, 1.0, 0.2);
      }
      return h / max(norm, 1e-4);
    }
#endif
#if SURF_SWELL
    float surfSwell(vec2 p, vec2 dir, int oct){
      // Two long swells (wavelengths ~60 and ~40 units), almost round, then the chop.
      vec2 d2 = normalize(vec2(dir.x*0.94 - dir.y*0.34, dir.x*0.34 + dir.y*0.94));
      float a = sin(dot(p, dir)*0.105 + uTime*0.55)*0.5 + 0.5;
      float b = sin(dot(p, d2)*0.160 + uTime*0.72)*0.5 + 0.5;
      float h = 1.0*pow(a, 1.35) + 0.6*pow(b, 1.35), norm = 1.6;
      // The chop rides the swell: the shipped octave loop, an octave up, at a third the weight.
      float amp = 0.34, frq = 0.75, spd = 1.2;
      vec2 dd = d2;
      for (int i = 0; i < 6; i++){
        if (i + 2 >= oct) break;
        float ph = dot(p, dd)*frq + uTime*spd;
        h += amp*pow(sin(ph)*0.5 + 0.5, uChop);
        norm += amp;
        amp *= 0.6; frq *= 1.9; spd *= 1.2;
        dd = normalize(vec2(dd.x*0.62 - dd.y*0.78, dd.x*0.78 + dd.y*0.62));
      }
      return h / norm;
    }
#endif
#if SURF_NOISE
    float surfNoise(vec2 p, vec2 dir, int oct){
      // Domain warp first, so the crests bend instead of running straight.
      mat2 R = mat2(dir.x, -dir.y, dir.y, dir.x);
      vec2 q = R*p;
      q += 1.8*vec2(sin(q.y*0.09 + uTime*0.31), sin(q.x*0.11 - uTime*0.27));
      float h = 0.0, norm = 0.0, amp = 1.0, frq = 0.13;
      float ang = 0.3;
      for (int i = 0; i < 8; i++){
        if (i >= oct + 2) break;
        vec2 d = vec2(cos(ang), sin(ang));
        float s = sin(dot(q, d)*frq + uTime*(0.5 + 0.13*float(i)))*0.5 + 0.5;
        h += amp*pow(s, 1.0 + 0.25*uChop);
        norm += amp;
        ang += 2.39996; amp *= 0.68; frq *= 1.53;
      }
      return h / max(norm, 1e-4);
    }
#endif
    float waveH(vec2 p, int oct){
      float wr = uWind*0.017453293;
      vec2 dir = vec2(cos(wr), sin(wr));
#if SURF_SEA
      return surfSea(p, dir, oct);
#endif
#if SURF_SWELL
      return surfSwell(p, dir, oct);
#endif
#if SURF_NOISE
      return surfNoise(p, dir, oct);
#endif
#if SURF_SINE
      return surfSine(p, dir, oct);
#endif
    }
    void waves(vec2 p, int oct, out float h, out vec2 dh){
#if !SURF_SINE
        // The three new surfaces take their shading gradient by central differences: two
        // extra height evaluations on the SHADING path only (the march uses waveH), which is
        // cheaper to write and to link than three analytic gradients, and the step is well
        // under the finest octave's wavelength.
        h = waveH(p, oct);
        const float e = 0.05;
        dh = vec2(waveH(p + vec2(e, 0.0), oct) - waveH(p - vec2(e, 0.0), oct),
                  waveH(p + vec2(0.0, e), oct) - waveH(p - vec2(0.0, e), oct)) / (2.0*e);
        return;
#endif
      float wr = uWind*0.017453293;
      vec2 dir = vec2(cos(wr), sin(wr));
      float amp = 1.0, frq = 0.40, spd = 1.0, norm = 0.0;
      h = 0.0; dh = vec2(0.0);
      for (int i = 0; i < 6; i++){
        if (i >= oct) break;
        float ph = dot(p, dir)*frq + uTime*spd;
        float s = sin(ph)*0.5 + 0.5;
        h += amp*pow(s, uChop);
        norm += amp;
        // ONE pow, not two: pow(s, c-1) is pow(s, c)/s. Not bit-identical in float (the pixel
        // gate hash moves) but the picture differs by at most one level. A first isolated
        // measurement read it 3.6x SLOWER (0.28 -> 0.99 ms at 4K); on the shipped build it
        // re-measured at 0.241 against 0.275, so that reading was a one-off and did not
        // reproduce. If Ocean ever regresses, this is the first line to A/B.
        float sp = pow(max(s, 1e-4), uChop);
        float dw = amp*uChop*(sp/max(s, 1e-4))*0.5*cos(ph)*frq;
        dh += dw*dir;
        amp *= 0.62; frq *= 1.87; spd *= 1.21;
        dir = normalize(vec2(dir.x*0.62 - dir.y*0.78, dir.x*0.78 + dir.y*0.62));
      }
      h /= max(norm, 1e-4);
    }
    float envBelow(vec3 d){
      vec2 uv = 0.5 + 0.5*d.xy/(abs(d.z) + 1.25);
      vec3 c = texture(uBelow, clamp(uv, 0.002, 0.998)).rgb;
      return dot(c, vec3(0.299, 0.587, 0.114));
    }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      vec2 q = vec2((gl_FragCoord.x/fw - 0.5)*(fw/fh), 0.5 - gl_FragCoord.y/fh)*2.0/uZoom;
      vec3 rd = normalize(vec3(q.x, q.y - 0.30, 1.35));
      // Wave height in world units. Capped against the camera height: a swell taller than
      // the viewpoint puts the camera underwater, where the march never crosses the surface
      // and the whole frame goes to sky.
      float amp = min(uHeight, CAM_H*0.55);
      float heat;
      if (rd.y > -0.004){
        heat = 0.10*exp(-max(0.0, rd.y)*9.0);      // sky: a soft band down toward the horizon
      } else {
        // MARCH. Geometric steps, because the near water needs fine sampling and the far
        // water is a handful of pixels: a linear march either misses the first crest or
        // spends thirty steps on the horizon.
        float tHit = -1.0, tp = 0.6, dp = CAM_H;
        for (int i = 1; i <= 32; i++){
          float t = 0.6*pow(1.24, float(i));
          vec3 p = vec3(0.0, CAM_H, 0.0) + rd*t;
          float hh;
          hh = waveH(p.xz, WAVE_OCT_MARCH);
          float d = p.y - hh*amp;
          if (d < 0.0){
            // One secant step between the last point above and this one below. A bisection
            // loop is the textbook answer and is not worth it here: the surface is smooth
            // between two steps this close and the error lands well under a pixel.
            tHit = tp + (t - tp)*dp/max(dp - d, 1e-4);
            break;
          }
          tp = t; dp = d;
          if (t > 420.0) break;
        }
        if (tHit < 0.0){
          heat = 0.10*exp(-max(0.0, rd.y)*9.0) + 0.16*exp(-abs(rd.y + 0.004)*260.0);
        } else {
          vec3 p = vec3(0.0, CAM_H, 0.0) + rd*tHit;
          float hh; vec2 dd;
          waves(p.xz, 6, hh, dd);                   // full detail for the shading normal
          float fade = 1.0/(1.0 + tHit*tHit*0.0016);
          vec3 n = normalize(vec3(-dd.x*uSwell, 1.0, -dd.y*uSwell));
          float glint = pow(max(0.0, dot(n, normalize(vec3(0.35, 0.55, -0.75)))), 22.0);
          // Foam takes its slope from the COARSE gradient (3 octaves), not the shading one: the fine
          // octaves are a lattice of ridges at pixel scale, and gating foam on them drew a crosshatch
          // that read as a grid. Soft saturate instead of clamp so the gate has no hard edge either.
          float hc; vec2 dc; waves(p.xz, 3, hc, dc);
          float slope = 1.0 - exp(-length(dc)*uSwell*1.2);
          // Foam rides the CRESTS: high water and a steep face at once, which is where it breaks.
          float foam = smoothstep(uFoam, max(uFoam + 0.02, min(0.995, uFoam + 0.38)), hh*0.65 + slope*0.55);
          heat = (0.10 + 0.48*hh*hh + 0.45*glint + 0.55*foam)*fade;
          if (uHasBelow > 0.5 && uReflect > 0.0){
            // Fresnel: water is a mirror at a glancing angle and nearly clear straight down,
            // so the reflection concentrates toward the horizon by itself.
            float fres = 0.02 + 0.98*pow(1.0 - max(0.0, dot(n, -rd)), 5.0);
            // Same two-part curve the shared world uses, so the slider means one thing in
            // both places: physical up to 1.0, lifting toward a flat mirror above it.
            float w = min(uReflect, 1.0)*mix(fres, 1.0, clamp(uReflect - 1.0, 0.0, 1.0));
            // mix, not add — see the note in FS_WORLD's ocean branch.
            heat = mix(heat, envBelow(reflect(rd, n))*fade, w);
          }
          heat += 0.16*exp(-abs(rd.y + 0.004)*260.0);   // bright line right at the horizon
        }
      }
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Black hole: an accretion disk seen through its own gravitational lensing.
    //
    // NOT a raymarch — there is no surface to hit. Photons are INTEGRATED: each ray is
    // stepped through the hole's field with the standard weak-field deflection
    //   a = -1.5 · h² · p / |p|⁵      (h = |p × d|, the conserved angular momentum)
    // which is the Schwarzschild null geodesic to the order that matters at this scale, and
    // is what bends the far side of the disk up over the top of the hole and back under the
    // bottom. That arc IS the effect; a straight-ray version just draws an ellipse.
    //
    // Units put the horizon at r = 1. A ray that falls inside it is swallowed and stays
    // black; one that crosses the disk plane between the inner and outer radius picks up
    // emission there and keeps going, so the disk can be collected MORE THAN ONCE — that
    // second, thinner arc above the first is the lensed underside, not a bug.
    //
    // Doppler beaming (uBeam) is why one side is brighter: the disk orbits, and the limb
    // coming toward the camera is boosted. Keplerian, so the inner disk shears past the
    // outer one and the turbulence never repeats.
    const FS_BHOLE = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uOrbit; uniform float uTilt;
    uniform float uOuter; uniform float uBeam; uniform float uZoom;
    out vec4 o;
    float bhN(vec2 p){
      // cheap value noise — two octaves is plenty once it is smeared round the disk
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.0 - 2.0*f);
      vec4 h = vec4(0.0, 1.0, 57.0, 58.0) + dot(i, vec2(1.0, 57.0));
      vec4 r = fract(sin(h)*43758.5453);
      return mix(mix(r.x, r.y, f.x), mix(r.z, r.w, f.x), f.y);
    }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      vec2 uv = vec2((gl_FragCoord.x/fw - 0.5)*(fw/fh), gl_FragCoord.y/fh - 0.5)*2.0/uZoom;
      float ca = cos(uOrbit), sa = sin(uOrbit);
      float ct = cos(uTilt), st = sin(uTilt);
      // Camera on a circle, raised by the tilt. A LOW tilt is the iconic view: the disk is
      // nearly edge-on, so the lensed far side stands right up over the hole.
      // Far enough back that the widest disk still fits: the frame's half-extent at the
      // origin plane is dist/1.9, so 22 gives ~11.6 against a disk radius of 4..14.
      vec3 ro = vec3(sa*22.0*ct, 22.0*st, -ca*22.0*ct);
      vec3 fwd = normalize(-ro);
      vec3 rgt = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
      vec3 up = cross(fwd, rgt);
      vec3 rd = normalize(fwd*1.9 + rgt*uv.x + up*uv.y);
      vec3 p = ro, d = rd;
      vec3 hv = cross(p, d);
      float h2 = dot(hv, hv);
      float rIn = 2.3, rOut = max(rIn + 1.2, uOuter);
      float heat = 0.0, prevY = p.y;
      for (int i = 0; i < 160; i++){
        float r = length(p);
        // Through the horizon: stop collecting, but KEEP what is already collected. The
        // march runs backwards from the camera, so emission picked up in front of the hole
        // has already reached the eye — the ray falling in afterwards only means there is no
        // background behind it. Zeroing here erased the entire near half of the disk (every
        // ray that crosses the disk and then goes down the hole) and left just the photon
        // ring on a black field.
        if (r < 1.0) break;
        if (r > 26.0 && dot(p, d) > 0.0) break;       // escaped, heading away
        float dt = 0.10 + 0.055*r;
        vec3 np = p + d*dt;
        // Disk crossing, found by the sign change of y and placed by linear interpolation —
        // stepping is far too coarse to just test "am I near the plane".
        if (prevY*np.y < 0.0){
          float k = prevY/(prevY - np.y);
          vec3 q = mix(p, np, k);
          float rr = length(q.xz);
          if (rr > rIn && rr < rOut){
            float ang = atan(q.z, q.x);
            float kep = uTime*6.0/pow(rr, 1.5);       // Keplerian: the inside shears past
            float n = 0.55 + 0.45*bhN(vec2(ang*2.6/6.2831853*14.0 + kep, rr*1.7));
            n *= 0.6 + 0.4*bhN(vec2(ang/6.2831853*38.0 + kep*1.7, rr*4.1));
            // NOT smoothstep(rOut, rOut*0.55, rr): GLSL leaves smoothstep UNDEFINED when
            // edge0 >= edge1, and this GPU returns 0 for it — which silently zeroed the
            // entire disk and left only the photon ring on a black field. Take the rising
            // ramp and invert it.
            float edge = (1.0 - smoothstep(rOut*0.55, rOut, rr))*smoothstep(rIn, rIn*1.30, rr);
            // Doppler beaming: orbital velocity against the view direction.
            vec3 vel = normalize(vec3(-q.z, 0.0, q.x))/sqrt(rr);
            float dop = clamp(1.0 + uBeam*3.0*dot(vel, -d), 0.05, 3.2);
            heat += edge*n*dop*(5.5/rr);
          }
        }
        // deflect, then advance — the whole point of the effect
        d = normalize(d + (-1.5*h2*p/pow(dot(p, p), 2.5))*dt);
        prevY = np.y;
        p = np;
      }
      // The photon ring: light that orbited close to r = 1.5 and got out. Approximated by
      // the impact parameter, which is cheap and lands in the right place.
      float b = length(cross(ro, rd));
      heat += 0.55*exp(-pow((b - 2.6)/0.16, 2.0));
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Starfield / hyperspace: 6 depth layers of cell-hashed stars flying outward; uWarp
    // re-samples the whole field at radially squeezed coordinates so every star smears
    // into a streak — beat-arm Warp and the kick punches to hyperspace. The field lives
    // in a helper (no gl_FragCoord inside — camProg's rewrite must not touch it).
    const FS_STARS = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uDensity; uniform float uWarp; uniform float uTwinkle; uniform float uZoom;
    out vec4 o;
    float h21s(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
    float field(vec2 q, float t, float dens, float tw){
      float heat = 0.0;
      for (int i = 0; i < 6; i++){
        float fi = float(i)/6.0;
        float d = fract(t*0.15 + fi);                  // 0 = far, 1 = at the screen
        float sc = mix(11.0, 1.2, d) * dens;
        vec2 p = q * sc;
        vec2 cell = floor(p), f = fract(p) - 0.5;
        float g = step(0.78, h21s(cell + fi*31.7));    // sparse: most cells hold no star
        vec2 off = vec2(h21s(cell + fi*77.0), h21s(cell + fi*77.0 + 9.1)) - 0.5;
        float dist = length(f - off*0.8);
        float size = mix(0.04, 0.16, d);
        float blink = 1.0 - tw*0.5*(0.5 + 0.5*sin(t*(3.0 + 5.0*h21s(cell + 2.2)) + h21s(cell + 5.5)*6.2831853));
        float fade = smoothstep(0.0, 0.2, d)*(1.0 - smoothstep(0.85, 1.0, d));
        // 1.0 - smoothstep(lo, hi, x), never smoothstep(hi, lo, x): reversed edges are undefined
        // in GLSL and this GPU returns 0, which zeroed every star and rendered the whole effect black.
        heat = max(heat, g * blink * fade * (1.0 - smoothstep(0.0, size, dist)) * mix(0.45, 1.0, d));
      }
      return heat;
    }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      vec2 q = vec2((gl_FragCoord.x/fw - 0.5)*(fw/fh), gl_FragCoord.y/fh - 0.5)/uZoom;
      float heat = field(q, uTime, uDensity, uTwinkle);
      if (uWarp > 0.01){                               // streaks: the field, radially squeezed
        for (int k = 1; k <= 5; k++){
          float fk = float(k);
          heat = max(heat, field(q*(1.0 - uWarp*0.055*fk), uTime, uDensity, uTwinkle)*(1.0 - fk*0.14));
        }
      }
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Aurora borealis: gaussian light curtains hanging from the top, swaying on layered
    // sines, each shimmering on its own phase. The palette does the colour — Ice and
    // Electric were made for this.
    const FS_AURORA = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uTime; uniform float uCurtains; uniform float uSway; uniform float uShim; uniform float uZoom;
    out vec4 o;
    float ah1(float x){ return fract(sin(x*127.1)*43758.5453); }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      // NB the heat buffer is Y-FLIPPED against the screen (row 0 = screen top — proven
      // with a gradient probe), so +y here means UP only after this negation. Every
      // orientation-sensitive effect shader needs it; the symmetric ones never notice.
      vec2 q = vec2((gl_FragCoord.x/fw - 0.5)*(fw/fh), 0.5 - gl_FragCoord.y/fh)/uZoom;
      float t = uTime;
      // the whole sky sways; each curtain also wanders on its own
      float xx = q.x + uSway*(0.22*sin(q.y*2.1 + t*0.5) + 0.13*sin(q.y*5.3 - t*0.31));
      float band = 0.0;
      int n = int(uCurtains);
      for (int i = 0; i < 5; i++){
        if (i >= n) break;
        float fi = float(i);
        float ph = ah1(fi*17.3)*6.2831853;
        float cx = 0.75*sin(t*(0.11 + 0.045*fi) + ph);
        float w = 0.10 + 0.08*ah1(fi + 3.3);
        float d = abs(xx - cx);
        float rip = 0.65 + 0.35*sin(t*(1.3 + 0.8*ah1(fi + 8.8))*uShim + q.y*7.0 + ph);
        band = max(band, exp(-pow(d/w, 2.0)) * rip);
      }
      // curtains hang from the top and thin out downward, over a faint horizon glow
      float top = smoothstep(-0.55, -0.05, q.y);
      float hang = mix(0.35, 1.0, smoothstep(-0.2, 0.45, q.y));
      float heat = band*top*hang*1.4 + 0.06*exp(-pow((q.y + 0.42)/0.12, 2.0));
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Menger sponge: an infinite periodic lattice of sponges. The camera path is computed
    // on the CPU (mengerSeed drives the street grid, turning at intersections) and arrives
    // as a position + heading; the shader only builds the view basis and marches. The
    // standard scale-3 fold DE; shading like the bulb (diffuse + depth fade + halo).
    const FS_MENGER = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform vec3 uPos; uniform vec3 uFwd; uniform float uRoll; uniform float uIter; uniform float uGlow; uniform float uZoom;
    out vec4 o;
    float mengerDE(vec3 p, int it){
      vec3 q = mod(p + 1.5, 3.0) - 1.5;                 // infinite lattice
      float d = max(abs(q.x), max(abs(q.y), abs(q.z))) - 1.05;
      float s = 1.0;
      for (int i = 0; i < 5; i++){
        if (i >= it) break;
        vec3 a = mod(q*s + 1.0, 2.0) - 1.0;
        s *= 3.0;
        vec3 r = abs(1.0 - 3.0*abs(a));
        float da = max(r.x, r.y), db = max(r.y, r.z), dc = max(r.z, r.x);
        float c = (min(da, min(db, dc)) - 1.0)/s;
        d = max(d, c);
      }
      return d;
    }
    void main(){
      float fw = uSize.x, fh = uSize.y;
      vec2 uv = vec2((gl_FragCoord.x/fw - 0.5)*(fw/fh), gl_FragCoord.y/fh - 0.5)*2.0/uZoom;
      float cr = cos(uRoll), sr = sin(uRoll);
      uv = vec2(uv.x*cr - uv.y*sr, uv.x*sr + uv.y*cr);         // screen roll
      // View basis from the CPU-computed heading. uFwd tilts during dive swoops but is
      // never near vertical, so world-up never degenerates the cross product.
      vec3 f = normalize(uFwd);
      vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
      vec3 up = cross(f, r);
      vec3 ro = uPos;
      vec3 rd = normalize(r*uv.x + up*uv.y + f*1.4);
      int it = int(uIter);
      float t = 0.0, halo = 9.0, heat = 0.0;
      for (int i = 0; i < 64; i++){
        vec3 p = ro + rd*t;
        float d = mengerDE(p, it);
        halo = min(halo, d/max(t, 0.25));
        if (d < 0.0012*max(t, 0.3)){
          float e = 0.0015*max(t, 0.3);
          vec2 h = vec2(1.0, -1.0)*0.5773;
          vec3 nrm = normalize(h.xyy*mengerDE(p + h.xyy*e, it) + h.yyx*mengerDE(p + h.yyx*e, it)
                             + h.yxy*mengerDE(p + h.yxy*e, it) + h.xxx*mengerDE(p + h.xxx*e, it));
          float dif = max(0.0, dot(nrm, normalize(vec3(0.5, 0.75, -0.4))));
          heat = (0.20 + 0.65*dif)*(1.0 - smoothstep(1.0, 9.0, t)) + uGlow*0.25*(1.0 - smoothstep(0.4, 3.0, t));
          break;
        }
        t += d;
        if (t > 9.0) break;
      }
      if (heat == 0.0) heat = uGlow*0.30*exp(-halo*40.0);
      o = vec4(clamp(heat, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Reaction–diffusion (Gray–Scott), three passes. The STATE lives in its own RGBA8
    // ping-pong pair (glTex.rd) at fire-grid size — U in .r, V in .g — stepped K times a
    // frame by FS_RDSTEP (vUv space, camera-free: the dish must not rotate), seeded by
    // FS_RDSEED, and displayed by FS_RDSHOW, which IS the effect shader (camProg, zoom,
    // heat from V). 8-bit state is the classic shadertoy trade: renderable everywhere,
    // and Gray–Scott tolerates it at these feed/kill ranges.
    const FS_RDSTEP = `#version 300 es
    precision highp float;
    uniform sampler2D uPrev; uniform vec2 uSize; uniform float uFeed; uniform float uKill;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 px = 1.0/uSize;
      vec2 c = texture(uPrev, vUv).rg;
      vec2 lap = -c;
      lap += 0.20*(texture(uPrev, vUv + vec2(px.x, 0.0)).rg + texture(uPrev, vUv - vec2(px.x, 0.0)).rg
                 + texture(uPrev, vUv + vec2(0.0, px.y)).rg + texture(uPrev, vUv - vec2(0.0, px.y)).rg);
      lap += 0.05*(texture(uPrev, vUv + px).rg + texture(uPrev, vUv - px).rg
                 + texture(uPrev, vUv + vec2(px.x, -px.y)).rg + texture(uPrev, vUv - vec2(px.x, -px.y)).rg);
      float u = c.x, v = c.y;
      float uvv = u*v*v;
      float du = 1.00*lap.x - uvv + uFeed*(1.0 - u);
      float dv = 0.50*lap.y + uvv - (uKill + uFeed)*v;
      o = vec4(clamp(u + du, 0.0, 1.0), clamp(v + dv, 0.0, 1.0), 0.0, 1.0);
    }`;
    const FS_RDSEED = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uSalt;
    in vec2 vUv; out vec4 o;
    float rh(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
    void main(){
      // U everywhere; the seed blobs are the CANONICAL gentle patches (U 0.5, V 0.25 — the
      // Karl Sims values). The first seed put V 0.9 into full U 1.0, and u*v*v ≈ 0.8
      // detonates: the blobs burn a wave outward and the whole culture annihilates to
      // black within ~500 steps — under a second at real frame rates, which the
      // frame-starved headless runs never reached.
      vec2 cell = floor(vUv*14.0);
      float g = step(0.82, rh(cell + uSalt));
      vec2 f = fract(vUv*14.0) - 0.5;
      float blob = g*(1.0 - smoothstep(0.05, 0.30, length(f)));
      o = vec4(1.0 - blob*0.5, blob*0.25, 0.0, 1.0);
    }`;
    const FS_RDSHOW = `#version 300 es
    precision highp float;
    uniform sampler2D uState; uniform vec2 uSize; uniform float uGain; uniform float uZoom;
    out vec4 o;
    void main(){
      vec2 uv = (gl_FragCoord.xy/uSize - 0.5)/uZoom + 0.5;
      float v = texture(uState, clamp(uv, 0.0, 1.0)).g;
      o = vec4(clamp(v*uGain*2.6, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // Cellular automata (Life-like B/S rules) -- the Reaction-diffusion arrangement on a
    // COARSE grid: the state is its own RGBA8 NEAREST/REPEAT pair (glTex.ca, `Cells` across,
    // rows by aspect) so a cell is a crisp square and the field is a torus; alive in .r,
    // a linearly fading AGE in .g. Linear, not multiplicative: age*0.99 in 8 bits rounds
    // back to itself below ~0.2 and a ghost would never fade out. Rain births cells from an
    // INTEGER hash (fract(sin()) is a driver-build detector) so Life never settles for good.
    const FS_CASTEP = `#version 300 es
    precision highp float;
    uniform sampler2D uPrev; uniform vec2 uSize; uniform int uBirth; uniform int uSurvive;
    uniform float uRain; uniform float uSalt; uniform float uFade;
    in vec2 vUv; out vec4 o;
    float nh(ivec3 p){
      uint h = uint(p.x) * 374761393u + uint(p.y) * 668265263u + uint(p.z) * 2246822519u;
      h = (h ^ (h >> 13u)) * 1274126177u; h ^= h >> 16u;
      return float(h & 0xffffffu) / 16777215.0;
    }
    void main(){
      vec2 px = 1.0/uSize;
      int n = 0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        if (i == 0 && j == 0) continue;
        n += int(step(0.5, texture(uPrev, vUv + vec2(float(i), float(j))*px).r));
      }
      vec2 c = texture(uPrev, vUv).rg;
      bool next = ((c.r > 0.5 ? uSurvive : uBirth) >> n & 1) == 1;
      if (!next && nh(ivec3(ivec2(gl_FragCoord.xy), int(uSalt))) < uRain) next = true;
      o = vec4(next ? 1.0 : 0.0, next ? 1.0 : max(0.0, c.g - uFade), 0.0, 1.0);
    }`;
    const FS_CASEED = `#version 300 es
    precision highp float;
    uniform vec2 uSize; uniform float uSalt;
    in vec2 vUv; out vec4 o;
    float nh(ivec3 p){
      uint h = uint(p.x) * 374761393u + uint(p.y) * 668265263u + uint(p.z) * 2246822519u;
      h = (h ^ (h >> 13u)) * 1274126177u; h ^= h >> 16u;
      return float(h & 0xffffffu) / 16777215.0;
    }
    void main(){
      float a = step(0.7, nh(ivec3(ivec2(gl_FragCoord.xy), int(uSalt)) + ivec3(3)));
      o = vec4(a, a, 0.0, 1.0);
    }`;
    const FS_CASHOW = `#version 300 es
    precision highp float;
    uniform sampler2D uState; uniform vec2 uSize; uniform float uGain; uniform float uZoom;
    out vec4 o;
    void main(){
      vec2 uv = (gl_FragCoord.xy/uSize - 0.5)/uZoom + 0.5;
      vec2 s = texture(uState, uv).rg;
      o = vec4(clamp(max(s.r*0.85, s.g*0.7)*uGain, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`;
    // heat → palette colour (fire-oriented, no flip yet)
