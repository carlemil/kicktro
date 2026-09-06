    // ---- post-FX passes. All RGB, all read the palette-mapped image, so they
    // behave as named (an Edge in palette-INDEX space would find edges where there
    // is no visible one, and vice versa). None of them touch the retained heat. ----
    const FS_PIXELATE = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uBlock;
    in vec2 vUv; out vec4 o;
    void main(){
      float b = max(1.0, uBlock);
      vec2 px = floor(vUv * uSize / b) * b + b * 0.5;   // snap to block centres
      o = vec4(texture(uSrc, px / uSize).rgb, 1.0);
    }`;
    // Hexagonal mosaic — Pixelate's cousin. The plane is covered by two offset rectangular
    // lattices whose centres interleave into a hex packing: for any point, the nearer of the
    // two candidate centres IS its hexagon's centre. That is the whole trick, and it costs
    // two mods and a comparison rather than an axial-coordinate round trip.
    const FS_HEXPIX = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uSize2;
    in vec2 vUv; out vec4 o;
    void main(){
      float s = max(2.0, uSize2);
      vec2 p = vUv*uSize/s;
      vec2 r = vec2(1.0, 1.7320508), h = r*0.5;
      vec2 a = mod(p, r) - h;
      vec2 b = mod(p - h, r) - h;
      vec2 c = dot(a, a) < dot(b, b) ? p - a : p - b;      // nearer candidate = this hex's centre
      o = vec4(texture(uSrc, c*s/uSize).rgb, 1.0);
    }`;
    // CRT phosphor: the shadow mask and the beam's bandwidth limit — the two things
    // Scanlines and Barrel leave out of the retro set.
    //
    // Persistence is deliberately NOT here. A post pass sees one finished frame and has no
    // memory, so a real phosphor decay would need the feedback stage; Fade pixel already IS
    // that, and duplicating it badly here would be worse than pointing at it.
    const FS_CRT = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uMask; uniform float uBleed;
    in vec2 vUv; out vec4 o;
    void main(){
      vec3 c = texture(uSrc, vUv).rgb;
      if (uBleed > 0.0){
        // Horizontal only, and ASYMMETRIC: the beam sweeps left to right and smears its
        // trail behind it, so weighting the two sides equally reads as a plain blur.
        vec2 px = 1.0/uSize;
        vec3 l = texture(uSrc, vUv - vec2(px.x*1.5, 0.0)).rgb;
        vec3 r = texture(uSrc, vUv + vec2(px.x*1.5, 0.0)).rgb;
        c = mix(c, c*0.46 + l*0.36 + r*0.18, uBleed);
      }
      // Shadow mask: RGB phosphor triads on a 3-pixel pitch. The off-channels keep a FLOOR
      // rather than going to zero — a hard triad (0 or 2x) turned every highlight into a
      // pale wash of separated primaries instead of white, because nothing was left of the
      // other two channels to recombine. 0.30/1.60 costs a little luminance and keeps the
      // picture a picture.
      float ph = mod(floor(vUv.x*uSize.x), 3.0);
      vec3 tri = vec3(step(ph, 0.5), step(abs(ph - 1.0), 0.5), step(2.5, ph + 0.5));
      vec3 m = mix(vec3(1.0), 0.30 + 1.30*tri, uMask);
      o = vec4(clamp(c*m, 0.0, 1.0), 1.0);
    }`;
    const FS_POSTERIZE = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform float uLevels;
    in vec2 vUv; out vec4 o;
    void main(){
      float n = max(2.0, floor(uLevels));
      vec3 c = texture(uSrc, vUv).rgb;
      o = vec4(floor(c * n + 0.5) / n, 1.0);
    }`;
    // uMode: 1 = mirror X, 2 = mirror Y, 3 = both (kaleidoscope-lite)
    const FS_MIRROR = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform float uMode;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 uv = vUv;
      int m = int(uMode + 0.5);
      if (m == 1 || m == 3) uv.x = 0.5 - abs(uv.x - 0.5);
      if (m == 2 || m == 3) uv.y = 0.5 - abs(uv.y - 0.5);
      o = vec4(texture(uSrc, uv).rgb, 1.0);
    }`;
    // Separable-ish single-pass box/gauss: cheap, and the radius scales the step
    // rather than the loop count (the bound is compile-time), so cap it in the UI.
    const FS_SOFTEN = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uRadius; uniform float uAmount;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 t = uRadius / uSize;
      vec3 sum = vec3(0.0); float wsum = 0.0;
      for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
          float w = exp(-float(x*x + y*y) / 4.0);
          sum += texture(uSrc, vUv + vec2(float(x), float(y)) * t).rgb * w;
          wsum += w;
        }
      }
      vec3 blur = sum / wsum, base = texture(uSrc, vUv).rgb;
      // uAmount > 0 sharpens (unsharp mask), < 0 blurs toward the average
      o = vec4(clamp(mix(blur, base + (base - blur) * uAmount, step(0.0, uAmount)), 0.0, 1.0), 1.0);
    }`;
    const FS_EDGE = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uAmount;
    in vec2 vUv; out vec4 o;
    float lum(vec2 uv){ vec3 c = texture(uSrc, uv).rgb; return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main(){
      vec2 t = 1.0 / uSize;
      float gx = lum(vUv + vec2(-t.x, -t.y)) + 2.0*lum(vUv + vec2(-t.x, 0.0)) + lum(vUv + vec2(-t.x, t.y))
               - lum(vUv + vec2( t.x, -t.y)) - 2.0*lum(vUv + vec2( t.x, 0.0)) - lum(vUv + vec2( t.x, t.y));
      float gy = lum(vUv + vec2(-t.x, -t.y)) + 2.0*lum(vUv + vec2(0.0, -t.y)) + lum(vUv + vec2( t.x, -t.y))
               - lum(vUv + vec2(-t.x,  t.y)) - 2.0*lum(vUv + vec2(0.0,  t.y)) - lum(vUv + vec2( t.x,  t.y));
      float e = clamp(sqrt(gx*gx + gy*gy) * uAmount, 0.0, 1.0);
      o = vec4(mix(texture(uSrc, vUv).rgb, vec3(e), clamp(uAmount, 0.0, 1.0)), 1.0);
    }`;
    // EMBOSS: a relief lit from one side. Not the same idea as Edge, which takes the
    // MAGNITUDE of the gradient and so outlines a shape from every direction at once; this
    // takes its SIGN along one axis, so one side of a contour lights and the other darkens
    // and the picture reads as stamped metal.
    //
    // Two ways to land it, on one slider. A grey relief (uMix 1) is the classic look but
    // throws the palette away, which in this app is most of the picture -- so uMix 0 keeps
    // the colour and uses the same gradient as SHADING on it. In between is usually best.
    const FS_EMBOSS = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uAmount; uniform float uAngle; uniform float uMix;
    in vec2 vUv; out vec4 o;
    float lum(vec2 uv){ vec3 c = texture(uSrc, uv).rgb; return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main(){
      vec2 t = 1.5 / uSize;                     // a step and a half reads chunkier than one texel
      vec2 d = vec2(cos(uAngle), sin(uAngle)) * t;
      float g = (lum(vUv + d) - lum(vUv - d)) * uAmount;
      vec3 src = texture(uSrc, vUv).rgb;
      vec3 grey = vec3(clamp(0.5 + g, 0.0, 1.0));          // stamped metal, palette gone
      vec3 lit = clamp(src * (1.0 + 2.0 * g), 0.0, 1.0);   // same relief, palette kept
      o = vec4(mix(lit, grey, clamp(uMix, 0.0, 1.0)), 1.0);
    }`;
    // ORDERED DITHER. Posterize flattens the ramp into bands and stops; this quantises the
    // SAME way but offsets each pixel's threshold by a 4x4 Bayer matrix first, so the error
    // scatters into a stipple instead of a hard edge. That stipple is the whole Amiga/Atari
    // look, and it is the one thing you cannot get by stacking the filters already here.
    // The matrix is COMPUTED, not tabled: bayer(2n) = 4*bayer(n) + bayer(2), recursively.
    const FS_DITHER = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform float uLevels; uniform float uAmount;
    in vec2 vUv; out vec4 o;
    float bayer2(vec2 a){ return mod(2.0 * a.x + 3.0 * a.y, 4.0); }
    float bayer4(vec2 p){
      vec2 q = floor(mod(p, 4.0));
      return (4.0 * bayer2(floor(q * 0.5)) + bayer2(mod(q, 2.0))) / 16.0;
    }
    void main(){
      vec3 c = texture(uSrc, vUv).rgb;
      float n = max(2.0, uLevels) - 1.0;
      float b = bayer4(gl_FragCoord.xy) - 0.5;
      o = vec4(clamp(floor(c * n + b * uAmount + 0.5) / n, 0.0, 1.0), 1.0);
    }`;
    // RADIAL BLUR: smear each pixel along the line from the centre, so light appears to
    // stream outward. Blur/sharpen is isotropic and Zoom feedback accumulates over TIME;
    // this is the single-frame streak neither of them can make.
    const FS_RBLUR = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform float uAmount; uniform float uMix;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 c = vUv - 0.5;
      vec3 sum = vec3(0.0);
      const int N = 14;
      for (int i = 0; i < N; i++) {
        float t = float(i) / float(N - 1);
        sum += texture(uSrc, 0.5 + c * (1.0 - uAmount * t * 0.25)).rgb;
      }
      sum /= float(N);
      o = vec4(mix(texture(uSrc, vUv).rgb, sum, clamp(uMix, 0.0, 1.0)), 1.0);
    }`;
    // POLAR WARP: read the frame in polar coordinates, so horizontal bands become rings and
    // vertical structure becomes spokes. Repeat folds the angle, which turns any picture into
    // a rosette. Nothing else here remaps the coordinate space this way -- Twist and Wedge
    // bend it, Droste scales it, this one changes what the two axes MEAN.
    const FS_POLAR = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uAmount; uniform float uRepeat;
    in vec2 vUv; out vec4 o;
    void main(){
      float asp = uSize.x / uSize.y;
      vec2 c = vUv - 0.5; c.x *= asp;
      float r = clamp(length(c) * 2.0, 0.0, 1.0);
      float a = atan(c.y, c.x) * 0.15915494 + 0.5;
      vec2 pu = vec2(fract(a * max(1.0, uRepeat)), r);
      o = vec4(mix(texture(uSrc, vUv).rgb, texture(uSrc, pu).rgb, clamp(uAmount, 0.0, 1.0)), 1.0);
    }`;
    // ASCII MOSAIC: quantise each cell's brightness to one of seven glyphs. Halftone is the
    // DOT version of this idea; a character grid reads completely differently. The glyphs are
    // 3x5 bit masks held as ints -- no atlas texture to allocate, upload or resize.
    // ASCII MOSAIC, from a GLYPH ATLAS rather than seven baked bitmasks. The atlas is a
    // horizontal strip of glyphs rendered by Canvas2D with the system font (see buildAsciiAtlas)
    // and SORTED BY MEASURED INK COVERAGE, so the cell's brightness indexes straight into a
    // ramp from the emptiest glyph to the fullest. That ordering is what makes it a dither
    // rather than a font: the picture reads through the density, whatever the script.
    // uGlyphs is how many are in the strip; the atlas is uniform-width cells, so glyph k
    // occupies u in [k/n, (k+1)/n].
    const FS_ASCII = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform sampler2D uAtlas;
    uniform vec2 uSize; uniform float uCell; uniform float uMix; uniform float uGlyphs;
    #define ASC_LEVELS 64
    uniform vec2 uBucket[ASC_LEVELS];
    in vec2 vUv; out vec4 o;
    // INTEGER hash, deliberately -- NOT fract(sin(x)*43758.5). This picks which character a
    // cell shows, and it must give the same answer forever: the ghost Glass ball of v1.55.x
    // was a sin-hash whose value changed when the driver re-optimised the shader in the
    // background. Pure integer arithmetic is exact on every compiler, so a recompile cannot
    // reshuffle the text on screen.
    uint ascHash(uvec2 p){
      uint h = p.x*374761393u + p.y*668265263u;
      h = (h ^ (h >> 13)) * 1274126177u;
      return h ^ (h >> 16);
    }
    void main(){
      float cs = max(3.0, uCell);
      vec2 cell = floor(gl_FragCoord.xy / cs);
      vec2 inCell = fract(gl_FragCoord.xy / cs);
      vec3 c = texture(uSrc, (cell + 0.5) * cs / uSize).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      // Brightness chooses a LEVEL, not a glyph. Each level holds every character that carries
      // about the same amount of ink, and the cell picks one of them by hash -- so a flat
      // region is drawn with a whole spread of characters instead of one repeated tile, while
      // still being exactly as bright as it should be. uBucket[lv] is (first glyph, how many),
      // packed on the CPU where the coverages were measured.
      int lv = int(clamp(l, 0.0, 0.9999) * float(ASC_LEVELS));
      vec2 bk = uBucket[lv];
      float r = float(ascHash(uvec2(cell)) & 0xffffu) / 65536.0;
      float k = bk.x + floor(r * bk.y);
      // NO Y FLIP, and the reason is the one recorded under 'Effect-shader gotchas': the heat
      // buffer is ALREADY Y-flipped against the screen, so buffer row 0 is the screen TOP and
      // a RISING gl_FragCoord.y walks DOWN the picture. The atlas is a Canvas2D image whose
      // row 0 is the top of the glyph, uploaded without UNPACK_FLIP_Y, so v = 0 is that top
      // too. Both already run the same way and inCell.y maps straight onto v. Flipping it
      // here -- which shipped in 1.56.0 -- turned every glyph upside down, and the reason it
      // survived four releases is that a dithered capital is a terrible witness: M and W swap,
      // and A, N, U, O, X and H all still read as letters inverted.
      vec2 auv = vec2((k + inCell.x) / max(1.0, uGlyphs), inCell.y);
      float on = texture(uAtlas, auv).r;
      o = vec4(mix(texture(uSrc, vUv).rgb, c * on, clamp(uMix, 0.0, 1.0)), 1.0);
    }`;
    // INVERT. Solarize only folds the top of the ramp back down; this is the plain negative,
    // on a slider so it can be crossfaded or beat-flicked.
    const FS_INVERT = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform float uAmount;
    in vec2 vUv; out vec4 o;
    void main(){
      vec3 c = texture(uSrc, vUv).rgb;
      o = vec4(mix(c, 1.0 - c, clamp(uAmount, 0.0, 1.0)), 1.0);
    }`;
    // DIRECTIONAL BLUR: a straight smear along one angle -- motion blur without motion.
    // Blur/sharpen is a symmetric kernel; this one has a direction, and pairs with Emboss,
    // which has one too.
    const FS_DBLUR = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uAmount; uniform float uAngle;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 d = vec2(cos(uAngle), sin(uAngle)) * uAmount / uSize;
      vec3 sum = vec3(0.0); float wsum = 0.0;
      const int N = 12;
      for (int i = -N; i <= N; i++) {
        float f = float(i) / float(N);
        float w = 1.0 - abs(f);
        sum += texture(uSrc, vUv + d * f).rgb * w;
        wsum += w;
      }
      o = vec4(sum / wsum, 1.0);
    }`;
    // ANAMORPHIC STREAKS: the horizontal flare bars a spherical lens throws off a highlight.
    // Bloom spreads a bright pixel evenly in every direction; this spreads it along ONE axis,
    // which is why the two read as different kinds of light rather than as two blurs. Bright
    // -passed first, or the whole frame smears sideways instead of just the highlights.
    const FS_ANAMORPH = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uAmount; uniform float uLen;
    in vec2 vUv; out vec4 o;
    void main(){
      vec3 src = texture(uSrc, vUv).rgb;
      vec3 sum = vec3(0.0); float wsum = 0.0;
      const int N = 16;
      for (int i = -N; i <= N; i++) {
        float f = float(i) / float(N);
        float w = 1.0 - abs(f);
        vec3 c = texture(uSrc, vUv + vec2(f * uLen / uSize.x, 0.0)).rgb;
        sum += max(c - vec3(0.55), vec3(0.0)) * w;
        wsum += w;
      }
      o = vec4(clamp(src + sum / wsum * uAmount * 4.0, 0.0, 1.0), 1.0);
    }`;
    // Rotate uv about the centre by an amount that falls off with radius — the middle
    // of the image spins and the rim stays put, so straight structure curls into it.
    const FS_TWIST = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uAmount;
    in vec2 vUv; out vec4 o;
    void main(){
      float asp = uSize.x / uSize.y;
      vec2 c = vUv - 0.5; c.x *= asp;
      float a = uAmount * (1.0 - clamp(length(c) / 0.7, 0.0, 1.0));
      float s = sin(a), co = cos(a);
      c = mat2(co, -s, s, co) * c;
      c.x /= asp;
      o = vec4(texture(uSrc, clamp(c + 0.5, 0.0, 1.0)).rgb, 1.0);
    }`;
    // N-segment kaleidoscope fold. Mirror is the X/Y special case of this; here the
    // wedge count is free, so it applies the Kaleidoscope effect's trick to any effect.
    const FS_WEDGE = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uSeg; uniform float uRot;
    in vec2 vUv; out vec4 o;
    void main(){
      float asp = uSize.x / uSize.y;
      vec2 c = vUv - 0.5; c.x *= asp;
      float seg = 6.28318531 / max(2.0, floor(uSeg + 0.5));
      float a = atan(c.y, c.x) + uRot;
      a = mod(a, seg);
      a = abs(a - seg * 0.5);                     // fold the wedge onto itself
      vec2 p = vec2(cos(a), sin(a)) * length(c);
      p.x /= asp;
      o = vec4(texture(uSrc, clamp(p + 0.5, 0.0, 1.0)).rgb, 1.0);
    }`;
    // Noise: PER-PIXEL white noise pushes each pixel's COLOUR -- brightness is scaled by
    // (1 + Amount * n), n in [-1, 1] hashed from the pixel's own coordinate, so black stays
    // black and there is no scale to it: one value per screen pixel. (It was a smooth field
    // first, then a smooth colour push; asked for as per-pixel.) The hash is INTEGER
    // arithmetic, never fract(sin()) -- see the driver-build rule in CLAUDE.md -- keyed by
    // uTime, which is 0 for a Static seed (the identical pattern every frame) and a fresh
    // frame number for Random.
    const FS_NOISE = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uAmount; uniform float uTime;
    in vec2 vUv; out vec4 o;
    float nh(ivec3 p){
      uint h = uint(p.x) * 374761393u + uint(p.y) * 668265263u + uint(p.z) * 2246822519u;
      h = (h ^ (h >> 13u)) * 1274126177u; h ^= h >> 16u;
      return float(h & 0xffffffu) / 16777215.0;
    }
    void main(){
      float n = nh(ivec3(ivec2(gl_FragCoord.xy), int(uTime)) + ivec3(7)) * 2.0 - 1.0;
      o = vec4(clamp(texture(uSrc, vUv).rgb * (1.0 + uAmount * n), 0.0, 1.0), 1.0);
    }`;
    // Horizontal slice displacement. Rows are bucketed into slices, each slice hashed
    // to an offset, and the hash re-rolls in steps of uTime so it stutters rather than
    // sliding. Only the slices past the gate move, so the image tears instead of shearing.
    const FS_GLITCH = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uAmount; uniform float uRows; uniform float uTime;
    in vec2 vUv; out vec4 o;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      float slice = floor(vUv.y * uSize.y / max(1.0, uRows));
      float t = floor(uTime * 12.0);
      float h = hash(vec2(slice, t));
      float gate = step(0.62, hash(vec2(slice + 31.7, t)));
      float off = (h - 0.5) * 2.0 * uAmount * gate;
      o = vec4(texture(uSrc, vec2(clamp(vUv.x + off, 0.0, 1.0), vUv.y)).rgb, 1.0);
    }`;
    // Rotated dot screen: each cell's dot radius grows with the local luminance, the
    // way a printed halftone does. Posterize flattens the ramp into bands; this one
    // keeps the ramp and spends texture on it instead.
    const FS_HALFTONE = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uDot; uniform float uAmount;
    in vec2 vUv; out vec4 o;
    void main(){
      vec3 c = texture(uSrc, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      float s = sin(0.4), co = cos(0.4);
      vec2 p = mat2(co, -s, s, co) * (vUv * uSize) / max(1.5, uDot);
      float d = length(fract(p) - 0.5) * 2.0;
      // Dot radius IS the brightness, so the ramp runs along 'd' with the edges placed at the
      // brightness -- a brighter cell keeps more of itself lit and the dot grows, which is what
      // the help text promises. Written 1.0 - smoothstep(lo, hi, x): the old form put the edges
      // the other way round on both counts, which is undefined in GLSL (edge0 >= edge1, this GPU
      // returns 0) AND inverted, so bright cells drew the BIGGEST black dots.
      float b = sqrt(l) * 1.25;
      float cover = 1.0 - smoothstep(b - 0.35, b + 0.35, d);
      o = vec4(mix(c, c * cover, clamp(uAmount, 0.0, 1.0)), 1.0);
    }`;
    // Solarize: invert everything above a luminance level, blended in by uAmount.
    const FS_THRESH = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform float uLevel; uniform float uAmount;
    in vec2 vUv; out vec4 o;
    void main(){
      vec3 c = texture(uSrc, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      vec3 s = (l > uLevel) ? (1.0 - c) : c;
      o = vec4(mix(c, s, clamp(uAmount, 0.0, 1.0)), 1.0);
    }`;
    // Radial RGB split — the channels are sampled at spreading offsets, so the image
    // fringes cyan/red toward the corners the way a cheap lens does.
    const FS_CHROMA = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform float uAmount;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 d = (vUv - 0.5) * uAmount * 0.02;
      float r = texture(uSrc, clamp(vUv + d, 0.0, 1.0)).r;
      float g = texture(uSrc, vUv).g;
      float b = texture(uSrc, clamp(vUv - d, 0.0, 1.0)).b;
      o = vec4(r, g, b, 1.0);
    }`;
    // Shockwave: a displacement ring travelling out from the centre, driven ENTIRELY by
    // the Shock VALUE — 1 = ring at the centre, 0 = gone past the corners. A beat-armed
    // Shock snapped to the high thumb and decaying over the Trigger duration therefore IS
    // the travelling wave: the pulse machinery does the animation, so there is no clock
    // and no PHASE_VARS entry. Displacement and the ring's lens glint both scale by
    // uAmount, so 0 is a true no-op whatever Push and Ring width hold.
    const FS_SHOCK = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uAmount; uniform float uAmp; uniform float uWidth;
    in vec2 vUv; out vec4 o;
    void main(){
      float asp = uSize.x / uSize.y;
      vec2 c = vUv - 0.5; c.x *= asp;
      float d = length(c);
      float R = (1.0 - uAmount) * 1.1;           // 1.1 > the corner distance, so it fully exits
      float g = exp(-pow((d - R) / max(uWidth, 1e-4), 2.0));
      vec2 dir = d > 1e-4 ? c / d : vec2(0.0);
      vec2 off = dir * g * uAmp * uAmount;
      off.x /= asp;
      vec3 col = texture(uSrc, clamp(vUv - off, 0.0, 1.0)).rgb;   // pixels read as pushed outward
      o = vec4(col * (1.0 + g * uAmount * 0.35), 1.0);            // slight glint riding the ring
    }`;
    // Pixel sort (approximated): true sorting is sequential, so this is the shader fake —
    // each pixel takes the max of itself and any BRIGHT pixel behind it along the sort
    // direction, weighted down with distance. Bright areas smear into streaks, dark areas
    // stay put: the modern glitch look. 32 taps is the ceiling; uLen scales within it.
    const FS_PIXSORT = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uThresh; uniform float uLen; uniform float uDir;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 dirv = uDir < 0.5 ? vec2(0.0, 1.0) : uDir < 1.5 ? vec2(0.0, -1.0)
                : uDir < 2.5 ? vec2(-1.0, 0.0) : vec2(1.0, 0.0);
      vec3 c = texture(uSrc, vUv).rgb;
      for (int i = 1; i <= 32; i++){
        float fi = float(i);
        vec2 p = vUv + dirv*(fi/32.0)*uLen*0.35;
        if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) break;
        vec3 s = texture(uSrc, p).rgb;
        float l = dot(s, vec3(0.299, 0.587, 0.114));
        c = max(c, s*(step(uThresh, l)*(1.0 - fi/34.0)));
      }
      o = vec4(c, 1.0);
    }`;
    // Cellular automaton over the retained HEAT (feedback stage): quantise to uStates
    // buckets; a cell with any 8-neighbour exactly one state ahead advances to it,
    // wrapping — the classic cyclic CA, whose spirals and boiling fronts here ride the
    // palette. Runs once per sim tick like every feedback filter. Writing the bucket
    // CENTRE ((s+1.5)/uStates) keeps floor() stable against R8's 1/255 quantisation.
    const FS_CELL = `#version 300 es
    precision highp float;
    uniform highp sampler2D uHeat; uniform vec2 uSize; uniform float uStates; uniform float uMix; uniform float uKeep;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 px = 1.0/uSize;
      float h = texture(uHeat, vUv).r;
      float s = min(floor(h*uStates), uStates - 1.0);
      float nxt = mod(s + 1.0, uStates);
      float cnt = 0.0;
      for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++){
        if (i == 0 && j == 0) continue;
        float nh = texture(uHeat, clamp(vUv + vec2(float(i), float(j))*px, 0.0, 1.0)).r;
        if (min(floor(nh*uStates), uStates - 1.0) == nxt) cnt += 1.0;
      }
      float ca = cnt >= 1.0 ? (nxt + 0.5)/uStates : h;
      o = vec4(mix(h, ca, uMix)*uKeep, 0.0, 0.0, 1.0);
    }`;
    // Lens bubble: a wandering fisheye magnifier — the classic demo "lens". The centre is
    // computed on the CPU from postTime (a Lissajous wander), so the shader is one branch-
    // free remap: inside the radius, coordinates compress toward the centre (magnify),
    // easing to identity at the rim.
    const FS_LENS = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform vec2 uCenter; uniform float uRad; uniform float uMag;
    in vec2 vUv; out vec4 o;
    void main(){
      float asp = uSize.x/uSize.y;
      vec2 d = vUv - uCenter; d.x *= asp;
      float r = length(d);
      float inside = 1.0 - smoothstep(uRad*0.85, uRad, r);   // 1 in the bubble, 0 outside it
      float m = mix(1.0, 1.0/uMag, inside);           // compress sampling = magnify
      vec2 p = uCenter + d*m/vec2(asp, 1.0);
      vec3 col = texture(uSrc, clamp(p, 0.0, 1.0)).rgb;
      // A REAL RIM GLINT: dark through the body, brightening into the edge and cut off sharply
      // at it. It used to be the exact inverse -- the whole bubble body lifted 15% and eased
      // back down over the outer 8% -- which is a fill light, not a glint, and it made the lens
      // read as a pale disc rather than as glass with an edge. The reversed smoothstep that
      // shipped it was undefined in GLSL as well, so it was two bugs wearing one line.
      //
      // The amplitude goes UP because the light is now concentrated: 0.15 spread over the whole
      // disc and 0.15 confined to the outer 8% are not the same brightness, and keeping the old
      // number would have made the filter look like it does LESS than before rather than
      // something different. step(r, uRad) keeps it strictly inside -- a glass edge is a hard
      // boundary, and letting it bleed outward would draw a halo on the unmagnified picture.
      col *= 1.0 + 0.40*smoothstep(uRad*0.92, uRad, r)*step(r, uRad);
      o = vec4(col, 1.0);
    }`;
    // Droste zoom: the picture swallowing itself. Log-polar tiling — radius repeats in
    // log space (each ring is the whole image again, uDepth smaller), the angle shears
    // with log(r) for the spiral, and postTime drives the endless inward crawl.
    const FS_DROSTE = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uDepth; uniform float uTwist; uniform float uTime;
    in vec2 vUv; out vec4 o;
    void main(){
      float asp = uSize.x/uSize.y;
      vec2 d = (vUv - 0.5)*vec2(asp, 1.0);
      float r = max(length(d), 1e-4);
      float th = atan(d.y, d.x);
      float lk = log(uDepth);
      float lr = fract(log(r)/lk - uTime*0.12);
      float rr = exp((lr - 1.0)*lk)*0.62;              // back into the visible ring
      float t2 = th + uTwist*log(r)*1.2;
      vec2 p = vec2(cos(t2), sin(t2))*rr/vec2(asp, 1.0) + 0.5;
      o = vec4(texture(uSrc, clamp(p, 0.0, 1.0)).rgb, 1.0);
    }`;
    // Kuwahara: 4-quadrant oil-paint. Each quadrant of a (uRad+1)^2 window contributes a
    // mean and a variance; the pixel takes the mean of the calmest quadrant, flattening
    // texture while keeping edges — screen-print. Fixed 5x5 quadrant loops = Radius max 4.
    const FS_KUWAHARA = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uRad;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 px = 1.0/uSize;
      float R = uRad;
      vec3 best = texture(uSrc, vUv).rgb;
      float bestVar = 1e9;
      for (int q = 0; q < 4; q++){
        vec2 s = vec2(q == 0 || q == 3 ? 1.0 : -1.0, q < 2 ? 1.0 : -1.0);
        vec3 sum = vec3(0.0); float sum2 = 0.0; float n = 0.0;
        for (int j = 0; j <= 4; j++)
        for (int i = 0; i <= 4; i++){
          if (float(i) > R || float(j) > R) continue;
          vec3 c = texture(uSrc, clamp(vUv + vec2(float(i), float(j))*s*px, 0.0, 1.0)).rgb;
          sum += c; sum2 += dot(c, vec3(0.299, 0.587, 0.114))*dot(c, vec3(0.299, 0.587, 0.114)); n += 1.0;
        }
        vec3 mean = sum/n;
        float ml = dot(mean, vec3(0.299, 0.587, 0.114));
        float va = sum2/n - ml*ml;
        if (va < bestVar){ bestVar = va; best = mean; }
      }
      o = vec4(best, 1.0);
    }`;
    // Feedback: fade the retained heat toward black each tick (phosphor trails).
    const FS_FADE = `#version 300 es
    precision highp float;
    uniform highp sampler2D uHeat; uniform float uKeep;
    in vec2 vUv; out vec4 o;
    void main(){ o = vec4(texture(uHeat, vUv).r * uKeep, 0.0, 0.0, 1.0); }`;
    // Feedback: resample the retained heat through an affine warp, then decay it.
    // ONE program serving three filters — Echo (uShift), Zoom feedback (uScale) and
    // Swirl (uSpin) are the same operation with the other two terms at identity, so
    // they share a pass rather than triplicating it. Sampling is bilinear via a
    // sampler object (see glSampLin): the heat textures are NEAREST because the fire
    // propagation wants exact texels, and a sub-pixel warp read through NEAREST
    // quantises into chunky rings instead of drifting smoothly.
    // Off-buffer reads return 0 rather than clamping, or the edge row smears inward.
    const FS_HWARP = `#version 300 es
    precision highp float;
    uniform highp sampler2D uHeat; uniform vec2 uSize;
    uniform vec2 uShift; uniform float uScale; uniform float uSpin; uniform float uKeep;
    in vec2 vUv; out vec4 o;
    void main(){
      float asp = uSize.x / uSize.y;
      vec2 c = vUv - 0.5;
      c.x *= asp;                                  // work in a square space so a spin is round
      c /= max(0.001, uScale);
      float s = sin(uSpin), co = cos(uSpin);
      c = mat2(co, -s, s, co) * c;
      c.x /= asp;
      vec2 uv = c + 0.5 + uShift;
      float h = 0.0;
      if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) h = texture(uHeat, uv).r;
      o = vec4(h * uKeep, 0.0, 0.0, 1.0);
    }`;
    // Feedback: 9-tap blur of the retained heat — it bleeds sideways instead of only
    // rising, which turns Fire's flames into smoke.
    const FS_DIFFUSE = `#version 300 es
    precision highp float;
    uniform highp sampler2D uHeat; uniform vec2 uSize; uniform float uRadius; uniform float uKeep;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 t = uRadius / uSize;
      float sum = 0.0, wsum = 0.0;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          float w = (x == 0 && y == 0) ? 4.0 : ((x == 0 || y == 0) ? 2.0 : 1.0);
          sum += texture(uHeat, vUv + vec2(float(x), float(y)) * t).r * w;
          wsum += w;
        }
      }
      o = vec4(sum / wsum * uKeep, 0.0, 0.0, 1.0);
    }`;
    const FS_PAL = `#version 300 es
    precision highp float;
    uniform sampler2D uHeat; uniform sampler2D uPal; uniform float uCurve;
    in vec2 vUv; out vec4 o;
    void main(){
      float h = texture(uHeat, vUv).r;
      // Heat boost: gamma-remap the heat toward the bright end (uCurve 0 = identity, byte-for-byte).
      float hb = uCurve > 0.0 ? pow(h, 1.0/(1.0 + uCurve)) : h;
      float idx = (floor(hb*255.0 + 0.5) + 0.5) / 256.0;
      // Alpha is COVERAGE -- 1 where the effect drew a surface, 0 where it drew nothing --
      // which only the OVER blend reads. It was a constant 1.0 nobody used. An opaque object
      // (a metal ball) needs it to cover the layer beneath instead of MAX-blending with it,
      // which let a bright layer below show straight through the ball.
      o = vec4(texture(uPal, vec2(idx, 0.5)).rgb, h > 0.0 ? 1.0 : 0.0);
    }`;
    // zoom about centre (fire modes); Julia passes zoom=1
    // Preset transitions. One pass, one mode uniform, run only while a transition is
    // live — between the zoom pass and the glow, so the blend picks up the bloom too
    // rather than having a frozen glow crossfade against a live one.
    // uT is 0→1 across the transition; uK = 1-|2t-1| is the "how far from the ends"
    // hump every mid-point effect (dip, flash, pixelate, blur) rides.
    const FS_TRANS = `#version 300 es
    precision highp float;
    uniform sampler2D uNew, uPrev; uniform float uT; uniform int uMode; uniform vec2 uSize;
    in vec2 vUv; out vec4 o;
    // Cheap deterministic noise for the checker jitter and the dissolve threshold. No time
    // term: a transition that re-randomised per frame would boil rather than dissolve.
    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    vec3 boxBlur(sampler2D t, vec2 uv, float r) {
      if (r < 0.6) return texture(t, uv).rgb;
      vec2 px = r / uSize;
      vec3 c = vec3(0.0);
      for (int y = -2; y <= 2; y++)
        for (int x = -2; x <= 2; x++)
          c += texture(t, uv + vec2(float(x), float(y)) * px).rgb;
      return c / 25.0;
    }
    void main(){
      float t = clamp(uT, 0.0, 1.0);
      float k = 1.0 - abs(2.0 * t - 1.0);        // 0 at the ends, 1 at the midpoint
      float half_ = step(0.5, t);                 // 0 = still showing the old scene
      vec3 a = texture(uPrev, vUv).rgb, b = texture(uNew, vUv).rgb, c;
      if (uMode == 0) {                           // crossfade
        c = mix(a, b, t);
      } else if (uMode == 1) {                    // dip to black through the middle
        c = mix(a, b, half_) * (1.0 - k);
      } else if (uMode == 2) {                    // flash
        c = mix(a, b, half_) + vec3(k * k);
      } else if (uMode == 3) {                    // pixelate through
        float blk = 1.0 + 46.0 * k * k;
        vec2 g = uSize / blk;
        vec2 uv = (floor(vUv * g) + 0.5) / g;
        c = mix(texture(uPrev, uv).rgb, texture(uNew, uv).rgb, half_);
      } else if (uMode == 4) {                    // blur through
        float r = 7.0 * k * k;
        c = mix(boxBlur(uPrev, vUv, r), boxBlur(uNew, vUv, r), half_);
      } else if (uMode == 5) {                    // wipe, soft edge
        float e = smoothstep(vUv.x - 0.14, vUv.x + 0.14, t * 1.28 - 0.14);
        c = mix(a, b, e);
      } else if (uMode == 6) {                    // iris
        float d = length((vUv - 0.5) * vec2(uSize.x / uSize.y, 1.0)) / 0.75;
        c = mix(a, b, smoothstep(d - 0.2, d + 0.2, t * 1.4 - 0.2));
      }
      // ---- the staggered-reveal family --------------------------------------------
      // All of these are one idea: give every part of the frame its OWN delay in 0..1 and
      // reveal it with the same soft step. Only the delay field differs, which is why they
      // are cheap to add and why they read as a set rather than as seven unrelated effects.
      else if (uMode == 7) {                      // checkerboard
        vec2 cells = vec2(14.0, 9.0);
        vec2 id = floor(vUv * cells);
        float d = mod(id.x + id.y, 2.0) * 0.34 + hash21(id) * 0.14;
        c = mix(a, b, smoothstep(d, d + 0.5, t * 1.5));
      } else if (uMode == 8) {                    // vertical bars, alternate ones rising
        float n = 15.0;
        float id = floor(vUv.x * n);
        float y = mod(id, 2.0) < 0.5 ? vUv.y : 1.0 - vUv.y;
        c = mix(a, b, smoothstep(y - 0.12, y + 0.12, t * 1.24 - 0.12));
      } else if (uMode == 9) {                    // shutter — slats opening from their centres
        float n = 11.0;
        float d = abs(fract(vUv.y * n) - 0.5) * 2.0;
        c = mix(a, b, smoothstep(d - 0.18, d + 0.18, t * 1.36 - 0.18));
      } else if (uMode == 10) {                   // slide — the new scene pushes the old out
        c = vUv.x < 1.0 - t ? texture(uPrev, vUv + vec2(t, 0.0)).rgb
                            : texture(uNew, vUv - vec2(1.0 - t, 0.0)).rgb;
      } else if (uMode == 11) {                   // clock wipe
        vec2 p = (vUv - 0.5) * vec2(uSize.x / uSize.y, 1.0);
        float ang = atan(p.x, p.y);
        float f = (ang < 0.0 ? ang + 6.2831853 : ang) / 6.2831853;
        c = mix(a, b, smoothstep(f - 0.04, f + 0.04, t * 1.08 - 0.04));
      } else if (uMode == 12) {                   // dissolve — per-block random threshold
        float d = hash21(floor(vUv * uSize / 3.0));
        c = mix(a, b, smoothstep(d - 0.16, d + 0.16, t * 1.32 - 0.16));
      } else {                                    // ripple — an expanding ring carries the change
        vec2 p = (vUv - 0.5) * vec2(uSize.x / uSize.y, 1.0);
        float d = length(p) / 0.75;
        float w = t * 1.5 - 0.25;
        float ring = exp(-pow((d - w) * 6.0, 2.0));
        vec2 sh = normalize(p + 1e-6) * ring * 0.05;
        c = mix(texture(uPrev, vUv + sh).rgb, texture(uNew, vUv + sh).rgb,
                smoothstep(d - 0.25, d + 0.25, w));
      }
      o = vec4(c, 1.0);
    }`;
    const FS_ZOOM = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform float uZoom;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 uv = (vUv - 0.5) / uZoom + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { o = vec4(0.0,0.0,0.0,1.0); return; }
      o = vec4(texture(uSrc, uv).rgb, 1.0);
    }`;
    // separable Gaussian (sigma≈4px ⇒ 2*sigma^2=32), matches CSS blur(4px)
    const FS_BLUR = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uDir;
    in vec2 vUv; out vec4 o;
    void main(){
      vec3 acc = vec3(0.0); float wsum = 0.0;
      for (int i = -12; i <= 12; i++) {
        float w = exp(-float(i*i)/32.0);
        acc += texture(uSrc, vUv + uDir*float(i)).rgb * w;
        wsum += w;
      }
      o = vec4(acc/wsum, 1.0);
    }`;
    // composite: base + 0.35*glow (additive), flip v so fire row 0 is on top
    // uFlip IS LOAD-BEARING AND IT IS WHY THIS SHADER IS NOT USED TWICE UNGATED. The
    // 'vUv.y' flip is the ONLY one in any shader in the app: it maps heat-buffer row 0 to the
    // screen TOP, which is the convention the whole pipeline is written against, and it belongs
    // to the FINAL PRESENT alone. When Bloom stopped being the whole-scene composite and became
    // an ordinary per-layer chain entry, glBloomPass reused this same program mid-chain -- so a
    // layer carrying Bloom went through the flip TWICE and rendered upside down against a layer
    // without it. Symmetric effects (Kaleidoscope, Julia, Moire) hide it completely, which is how
    // it survived; Ocean, Terrain, Aurora and anything with a horizon do not.
    // uFlip: 1.0 at the present, 0.0 for the chain pass. tools/flipcheck.js measures it on the GPU.
    const FS_COMP = `#version 300 es
    precision highp float;
    uniform sampler2D uScene; uniform sampler2D uGlow; uniform float uBloom; uniform float uFlip;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 uv = vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uFlip));
      vec3 base = texture(uScene, uv).rgb;
      vec3 glow = texture(uGlow, uv).rgb;
      o = vec4(base + glow*uBloom, 1.0);
    }`;
    // ---- screen stage: runs on the composited image, at DISPLAY resolution -------
    // These four are the "it is a screen you are looking at" layer, and they only read
    // right on top of the bloom — a vignette under an additive glow gets lit back up,
    // and scanlines under it bloom into mush. The post chain runs before the composite
    // by design, so they cannot be post filters; hence the third stage.
    const FS_BARREL = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform float uAmount;
    in vec2 vUv; out vec4 o;
    void main(){
      vec2 c = vUv - 0.5;
      vec2 uv = c * (1.0 + uAmount * dot(c, c) * 4.0) + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
      o = vec4(texture(uSrc, uv).rgb, 1.0);
    }`;
    const FS_SCAN = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform float uAmount; uniform float uCount;
    in vec2 vUv; out vec4 o;
    void main(){
      float s = 0.5 + 0.5 * cos(vUv.y * max(1.0, uCount) * 6.28318531);
      o = vec4(texture(uSrc, vUv).rgb * (1.0 - uAmount * s), 1.0);
    }`;
    const FS_VIGNETTE = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uAmount;
    in vec2 vUv; out vec4 o;
    void main(){
      float asp = uSize.x / uSize.y;
      float d = length((vUv - 0.5) * vec2(asp, 1.0));
      float v = 1.0 - uAmount * smoothstep(0.35, 0.9, d);
      o = vec4(texture(uSrc, vUv).rgb * v, 1.0);
    }`;
    const FS_GRAIN = `#version 300 es
    precision highp float;
    uniform sampler2D uSrc; uniform vec2 uSize; uniform float uAmount; uniform float uTime;
    in vec2 vUv; out vec4 o;
    void main(){
      float n = fract(sin(dot(vUv * uSize + uTime * 137.0, vec2(12.9898, 78.233))) * 43758.5453);
      o = vec4(clamp(texture(uSrc, vUv).rgb + (n - 0.5) * uAmount, 0.0, 1.0), 1.0);
    }`;

    glProg.prop = makeProg(VS_QUAD, FS_PROP, ["uHeat", "uSize", "uDecay"]);
    glProg.pts = makeProg(VS_PTS, FS_PTS, ["uSize", "uGain", "uPtSize"]);
    glProg.rib = makeProg(VS_RIB, FS_RIB, ["uSize"]);
    glProg.merge = makeProg(VS_QUAD, FS_MERGE, ["uSrc", "uGain"]);
    glProg.okmerge = makeProg(VS_QUAD, FS_OKMERGE, ["uLayer", "uAcc", "uGain", "uBlend", "uCover"]);
    glProg.julia = camProg(VS_QUAD, FS_JULIA, ["uSize", "uC", "uSpan"]);
    glProg.plasma = camProg(VS_QUAD, FS_PLASMA, ["uSize", "uTime", "uScale", "uWarp", "uZoom"]);
    glProg.tunnel = camProg(VS_QUAD, FS_TUNNEL, ["uSize", "uTime", "uTwist", "uRings", "uZoom"]);
    glProg.metaball = camProg(VS_QUAD, FS_METABALL, ["uSize", "uTime", "uCount", "uRadius", "uGain", "uZoom"]);
    glProg.burning = camProg(VS_QUAD, FS_BURNING, ["uSize", "uC", "uSpan"]);
    glProg.kaleido = camProg(VS_QUAD, FS_KALEIDO, ["uSize", "uTime", "uSeg", "uRot", "uZoom"]);
    glProg.rotozoom = camProg(VS_QUAD, FS_ROTOZOOM, ["uSize", "uAngle", "uScale", "uTile", "uZoom"]);
    glProg.munch = camProg(VS_QUAD, FS_MUNCH, ["uSize", "uTime", "uScale", "uMask", "uZoom"]);
    glProg.moire = camProg(VS_QUAD, FS_MOIRE, ["uSize", "uTime", "uFreq", "uMix", "uZoom"]);
    glProg.newton = camProg(VS_QUAD, FS_NEWTON, ["uSize", "uSpin", "uRelax", "uZoom"]);
    glProg.multibrot = camProg(VS_QUAD, FS_MULTIBROT, ["uSize", "uC", "uSpan", "uPower"]);
    glProg.copper = camProg(VS_QUAD, FS_COPPER, ["uSize", "uTime", "uCount", "uWidth", "uZoom"]);
    glProg.clouds = camProg(VS_QUAD, FS_CLOUDS, ["uSize", "uTime", "uCover", "uScale", "uOct", "uLight", "uZoom"]);
    glProg.godray = camProg(VS_QUAD, FS_GODRAY, ["uSize", "uTime", "uDecay", "uWeight", "uScale", "uSpread", "uZoom"]);
    glProg.terrain = camProg(VS_QUAD, FS_TERRAIN, ["uSize", "uTime", "uHeight", "uScale", "uOct", "uFog", "uZoom"]);
    glProg.apollo = camProg(VS_QUAD, FS_APOLLO, ["uSize", "uTime", "uScale", "uIter", "uGlow", "uZoom", "uThin"]);
    glProg.mbox = camProg(VS_QUAD, FS_MBOX, ["uSize", "uTime", "uScale", "uIter", "uGlow", "uZoom", "uFold"]);
    glProg.gyroid = camProg(VS_QUAD, FS_GYROID, ["uSize", "uTime", "uFreq", "uThick", "uGlow", "uZoom", "uWarp"]);
    glProg.voronoi = camProg(VS_QUAD, FS_VORONOI, ["uSize", "uTime", "uCells", "uEdge", "uJit", "uZoom"]);
    glProg.warpnoise = camProg(VS_QUAD, FS_WARPNOISE, ["uSize", "uTime", "uScale", "uWarp", "uOct", "uZoom"]);
    glProg.truchet = camProg(VS_QUAD, FS_TRUCHET, ["uSize", "uTime", "uCells", "uWidth", "uFlip", "uZoom"]);
    glProg.shapegrid = camProg(VS_QUAD, FS_SHAPEGRID, ["uSize", "uTime", "uCells", "uDot", "uSquare", "uPulse", "uZoom"]);
    glProg.concentric = camProg(VS_QUAD, FS_CONCENTRIC, ["uSize", "uTime", "uSides", "uCount", "uThick", "uSpin", "uZoom"]);
    glProg.bounce = camProg(VS_QUAD, FS_BOUNCE, ["uSize", "uPos", "uCount", "uRad", "uSquare", "uZoom", "uMix", "uTime", "uSpin"]);
    glProg.solids = camProg(VS_QUAD, FS_SOLIDS, ["uSize", "uZoom", "uCount", "uRim", "uPos", "uQuat", "uShape"]);
    glProg.sun = camProg(VS_QUAD, FS_SUN, ["uSize", "uTime", "uDensity", "uLane", "uGlow", "uSpot", "uZoom"]);
    glProg.kefrens = camProg(VS_QUAD, FS_KEFRENS, ["uSize", "uTime", "uBars", "uSway", "uWidth", "uZoom"]);
    glProg.twister = camProg(VS_QUAD, FS_TWISTER, ["uSize", "uTime", "uCols", "uWidth", "uTwist", "uZoom"]);
    glProg.cymatics = camProg(VS_QUAD, FS_CYMATICS, ["uSize", "uTime", "uModeN", "uModeM", "uSharp", "uShim", "uZoom"]);
    glProg.storm = camProg(VS_QUAD, FS_STORM, ["uSize", "uEnv", "uSeed", "uBolts", "uGlow", "uZoom", "uFront"]);
    glProg.bulb = camProg(VS_QUAD, FS_BULB, ["uSize", "uPos", "uFwd", "uPower", "uIter", "uGlow", "uZoom"]);
    glProg.torus = camProg(VS_QUAD, FS_TORUS, ["uSize", "uPos", "uFwd", "uRing", "uTube", "uTwist", "uFlute", "uGlow", "uZoom"]);
    // NOT the world program: it is built lazily, per combination of joined effects, and
    // linked off the critical path (worldProgFor). Linking it here cost every visitor 3.5
    // seconds of frozen startup at best and 64 at worst, for a shader most scenes never use.
    //
    // The SOURCES have to be handed out, though: every FS_*/VS_QUAD constant is local to
    // initGL, so a builder living outside it sees none of them. (camGlsl/camProg are module
    // scope and need no help.) A lost context takes every cached program with it.
    worldVs = VS_QUAD; worldFsBase = FS_WORLD;
    worldProgs = {}; worldPar = null;
    glProg.worldpick = makeProg(VS_QUAD, FS_WORLDPICK, ["uSrc", "uSize", "uId"]);
    glProg.worldmix = makeProg(VS_QUAD, FS_WORLDMIX, ["uA", "uB", "uT"]);
    glProg.glass = camProg(VS_QUAD, FS_GLASS, ["uSize", "uTime", "uCount", "uRad", "uMat", "uIor", "uGlow", "uZoom", "uSalt", "uBelow", "uHasBelow"]);
    glProg.qjulia = camProg(VS_QUAD, FS_QJULIA, ["uSize", "uC", "uPhase", "uSlice", "uCut", "uIter", "uGlow", "uZoom", "uRot"]);
    glProg.bhole = camProg(VS_QUAD, FS_BHOLE, ["uSize", "uTime", "uOrbit", "uTilt", "uOuter", "uBeam", "uZoom"]);
    // ONE OCEAN PROGRAM PER SURFACE. With every surface in one shader the standalone Ocean
    // measured 1.03 ms at 4K on the shipped surface against 0.257 before -- and deleting the
    // three DEAD functions alone, dispatch and branch intact, gave the 0.258 back. Past some
    // source size the compiler stops unrolling the 32-step march, whether the code runs or
    // not. So the surface is a compile-time define and the program is the surface.
    const OCEAN_U = ["uSize", "uTime", "uSwell", "uChop", "uFoam", "uWind", "uZoom", "uHeight", "uReflect", "uBelow", "uHasBelow"];
    // PLAIN FLAGS, one per surface, never "SURF == n": measured, the ==/!= forms cost surface 0
    // 3.5x (0.257 -> 0.9 ms) with both present, and either alone was free. Flags are what the
    // world uses (#if W_GB) and are known-free.
    const SURF_NAMES = ["SURF_SINE", "SURF_SEA", "SURF_SWELL", "SURF_NOISE"];
    const surfDefs = n => SURF_NAMES.map((f, i) => "#define " + f + " " + (i === n ? 1 : 0)).join("\n");
    for (let sfi = 0; sfi < 4; sfi++)
      glProg["ocean" + sfi] = camProg(VS_QUAD, FS_OCEAN.replace(surfDefs(0), surfDefs(sfi)), OCEAN_U);
    glProg.ocean = glProg.ocean0;
    glProg.vballs = camProg(VS_QUAD, FS_VBALLS, ["uSize", "uPhase", "uCount", "uShape", "uRad", "uGlow", "uZoom"]);
    glProg.stars = camProg(VS_QUAD, FS_STARS, ["uSize", "uTime", "uDensity", "uWarp", "uTwinkle", "uZoom"]);
    glProg.aurora = camProg(VS_QUAD, FS_AURORA, ["uSize", "uTime", "uCurtains", "uSway", "uShim", "uZoom"]);
    glProg.menger = camProg(VS_QUAD, FS_MENGER, ["uSize", "uPos", "uFwd", "uRoll", "uIter", "uGlow", "uZoom"]);
    glProg.rdstep = makeProg(VS_QUAD, FS_RDSTEP, ["uPrev", "uSize", "uFeed", "uKill"]);
    glProg.rdseed = makeProg(VS_QUAD, FS_RDSEED, ["uSize", "uSalt"]);
    glProg.rdshow = camProg(VS_QUAD, FS_RDSHOW, ["uState", "uSize", "uGain", "uZoom"]);
    glProg.pixelate = makeProg(VS_QUAD, FS_PIXELATE, ["uSrc", "uSize", "uBlock"]);
    glProg.posterize = makeProg(VS_QUAD, FS_POSTERIZE, ["uSrc", "uLevels"]);
    glProg.hexpix = makeProg(VS_QUAD, FS_HEXPIX, ["uSrc", "uSize", "uSize2"]);
    glProg.crt = makeProg(VS_QUAD, FS_CRT, ["uSrc", "uSize", "uMask", "uBleed"]);
    glProg.mirror = makeProg(VS_QUAD, FS_MIRROR, ["uSrc", "uMode"]);
    glProg.soften = makeProg(VS_QUAD, FS_SOFTEN, ["uSrc", "uSize", "uRadius", "uAmount"]);
    glProg.edge = makeProg(VS_QUAD, FS_EDGE, ["uSrc", "uSize", "uAmount"]);
    glProg.emboss = makeProg(VS_QUAD, FS_EMBOSS, ["uSrc", "uSize", "uAmount", "uAngle", "uMix"]);
    glProg.dither = makeProg(VS_QUAD, FS_DITHER, ["uSrc", "uLevels", "uAmount"]);
    glProg.rblur = makeProg(VS_QUAD, FS_RBLUR, ["uSrc", "uAmount", "uMix"]);
    glProg.polar = makeProg(VS_QUAD, FS_POLAR, ["uSrc", "uSize", "uAmount", "uRepeat"]);
    glProg.ascii = makeProg(VS_QUAD, FS_ASCII, ["uSrc", "uAtlas", "uSize", "uCell", "uMix", "uGlyphs", "uBucket"]);
    glProg.invert = makeProg(VS_QUAD, FS_INVERT, ["uSrc", "uAmount"]);
    glProg.dblur = makeProg(VS_QUAD, FS_DBLUR, ["uSrc", "uSize", "uAmount", "uAngle"]);
    glProg.anamorph = makeProg(VS_QUAD, FS_ANAMORPH, ["uSrc", "uSize", "uAmount", "uLen"]);
    glProg.twist = makeProg(VS_QUAD, FS_TWIST, ["uSrc", "uSize", "uAmount"]);
    glProg.wedge = makeProg(VS_QUAD, FS_WEDGE, ["uSrc", "uSize", "uSeg", "uRot"]);
    glProg.glitch = makeProg(VS_QUAD, FS_GLITCH, ["uSrc", "uSize", "uAmount", "uRows", "uTime"]);
    glProg.noise = makeProg(VS_QUAD, FS_NOISE, ["uSrc", "uSize", "uAmount", "uTime"]);
    glProg.halftone = makeProg(VS_QUAD, FS_HALFTONE, ["uSrc", "uSize", "uDot", "uAmount"]);
    glProg.thresh = makeProg(VS_QUAD, FS_THRESH, ["uSrc", "uLevel", "uAmount"]);
    glProg.chroma = makeProg(VS_QUAD, FS_CHROMA, ["uSrc", "uAmount"]);
    glProg.shock = makeProg(VS_QUAD, FS_SHOCK, ["uSrc", "uSize", "uAmount", "uAmp", "uWidth"]);
    glProg.pixsort = makeProg(VS_QUAD, FS_PIXSORT, ["uSrc", "uSize", "uThresh", "uLen", "uDir"]);
    glProg.cell = makeProg(VS_QUAD, FS_CELL, ["uHeat", "uSize", "uStates", "uMix", "uKeep"]);
    glProg.lens = makeProg(VS_QUAD, FS_LENS, ["uSrc", "uSize", "uCenter", "uRad", "uMag"]);
    glProg.droste = makeProg(VS_QUAD, FS_DROSTE, ["uSrc", "uSize", "uDepth", "uTwist", "uTime"]);
    glProg.kuwahara = makeProg(VS_QUAD, FS_KUWAHARA, ["uSrc", "uSize", "uRad"]);
    glProg.barrel = makeProg(VS_QUAD, FS_BARREL, ["uSrc", "uAmount"]);
    glProg.scan = makeProg(VS_QUAD, FS_SCAN, ["uSrc", "uAmount", "uCount"]);
    glProg.vignette = makeProg(VS_QUAD, FS_VIGNETTE, ["uSrc", "uSize", "uAmount"]);
    glProg.grain = makeProg(VS_QUAD, FS_GRAIN, ["uSrc", "uSize", "uAmount", "uTime"]);
    glProg.hwarp = makeProg(VS_QUAD, FS_HWARP, ["uHeat", "uSize", "uShift", "uScale", "uSpin", "uKeep"]);
    glProg.diffuse = makeProg(VS_QUAD, FS_DIFFUSE, ["uHeat", "uSize", "uRadius", "uKeep"]);
    glProg.fade = makeProg(VS_QUAD, FS_FADE, ["uHeat", "uKeep"]);
    // Bilinear view of the heat textures for the warp feedback filters, without
    // changing the textures themselves (the fire propagation reads exact texels and
    // must stay NEAREST). Bound on unit 0 for the warp pass only, then unbound —
    // a sampler sticks to the unit, not the program.
    glSampLin = gl.createSampler();
    gl.samplerParameteri(glSampLin, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.samplerParameteri(glSampLin, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.samplerParameteri(glSampLin, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(glSampLin, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    glProg.pal = makeProg(VS_QUAD, FS_PAL, ["uHeat", "uPal", "uCurve"]);
    glProg.zoom = makeProg(VS_QUAD, FS_ZOOM, ["uSrc", "uZoom"]);
    glProg.trans = makeProg(VS_QUAD, FS_TRANS, ["uNew", "uPrev", "uT", "uMode", "uSize"]);
    glProg.blur = makeProg(VS_QUAD, FS_BLUR, ["uSrc", "uDir"]);
    glProg.comp = makeProg(VS_QUAD, FS_COMP, ["uScene", "uGlow", "uBloom", "uFlip"]);

    glTex.heat = [
      createTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST, gl.CLAMP_TO_EDGE),
      createTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST, gl.CLAMP_TO_EDGE),
    ];
    glFbo.heat = [createFbo(glTex.heat[0]), createFbo(glTex.heat[1])];
    glTex.native = createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE);
    glFbo.native = createFbo(glTex.native);
    glTex.scene = createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE);
    glFbo.scene = createFbo(glTex.scene);
    glTex.post = [
      createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE),
      createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE),
    ];
    // Screen-stage ping-pong. Unlike every other buffer here these are DISPLAY sized,
    // not fire-grid sized: scanlines and grain are about the screen you are looking at,
    // and rendering them at fw×fh then upscaling would blur them into nothing.
    // Scratch heat for one stack item. Each item renders here in isolation and is then
    // composited into the shared buffer by glMergeLayer, so items can't overwrite one
    // another the way two glShaderDraw calls into the shared buffer used to.
    glTex.layer = createTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST, gl.CLAMP_TO_EDGE);
    glFbo.layer = createFbo(glTex.layer);
    // Half-size scratch for halfRes effects (see glShaderDraw). Filter is irrelevant --
    // the upsample is a blitFramebuffer with its own LINEAR argument.
    glTex.halfLayer = createTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST, gl.CLAMP_TO_EDGE);
    glFbo.halfLayer = createFbo(glTex.halfLayer);
    // Reaction–diffusion state: U/V in .rg of a ping-pong pair at fire-grid size.
    // A SINGLETON deliberately — two RD layers share one culture and just display it
    // differently; per-layer dishes would be four more texture pairs for a niche win.
    // FLOAT (RGBA16F) wherever EXT_color_buffer_float exists — in 8 bits a Gray–Scott
    // increment under 1/510 rounds to ZERO and the culture freezes at its seed, which is
    // exactly what the first screenshot showed. The RGBA8 fallback stays for GL stacks
    // without the extension: degraded (slow, coarse evolution), not broken.
    // LINEAR: the step shader samples between texels for the laplacian's diagonal taps.
    const rdFloat = !!gl.getExtension("EXT_color_buffer_float");
    rdIsFloat = rdFloat;               // the death check below reads pixels in the matching type
    const rdI = rdFloat ? gl.RGBA16F : gl.RGBA8, rdT = rdFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    glTex.rd = [
      createTex(rdI, gl.RGBA, rdT, gl.LINEAR, gl.CLAMP_TO_EDGE),
      createTex(rdI, gl.RGBA, rdT, gl.LINEAR, gl.CLAMP_TO_EDGE),
    ];
    glFbo.rd = [createFbo(glTex.rd[0]), createFbo(glTex.rd[1])];
    // Per-layer state for multi-layer stacks (see the frame loop / glLayerBeginHeat).
    // Each slot gets its own persistent heat pair (so it retains its own fire/feedback),
    // its own 256×1 palette LUT, so every stacked effect keeps its own colours. The
    // colour accumulator ping-pongs (glTex.color[0/1]); layers blend into it in OKLab.
    // TWICE STACK_MAX, not STACK_MAX. Slots 0..3 are the live scene; 4..7 are the OUTGOING
    // scene while a transition runs, which is rendered for real rather than frozen (see
    // renderPrevScene). Both sets are allocated up front: they are R8 at fire resolution,
    // the extra four pairs cost a few megabytes, and allocating them at the moment a scene
    // switches would put a texture upload inside the one frame that must not stutter.
    glTex.heatL = []; glFbo.heatL = []; glTex.palL = [];
    for (let i = 0; i < STACK_MAX * 2; i++) {
      const a = createTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST, gl.CLAMP_TO_EDGE);
      const b = createTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST, gl.CLAMP_TO_EDGE);
      glTex.heatL.push([a, b]);
      glFbo.heatL.push([createFbo(a), createFbo(b)]);
      const p = createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, p);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      glTex.palL.push(p);
    }
    glTex.color = [
      createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE),
      createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE),
    ];
    glFbo.color = [createFbo(glTex.color[0]), createFbo(glTex.color[1])];
    // One layer's palette-mapped colour, before its own post-filter chain runs on it.
    glTex.layerCol = createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE);
    glFbo.layerCol = createFbo(glTex.layerCol);
    // The shared world's G-buffer: heat in .r, object ID in .g. NEAREST, because an ID is a
    // label and interpolating two of them invents a third that belongs to no layer.
    glTex.world = createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST, gl.CLAMP_TO_EDGE);
    glFbo.world = createFbo(glTex.world);
    // A layer's OWN draw, kept aside for the length of a world crossfade (see worldFade).
    glTex.worldOwn = createTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST, gl.CLAMP_TO_EDGE);
    glFbo.worldOwn = createFbo(glTex.worldOwn);
    // ...and the OUTPUT of the crossfade between the two, which has to be a THIRD buffer:
    // glWorldMix reads the pick (glTex.layer) and writes the blend, and a pass may not sample
    // the texture attached to its own target. It did exactly that for three releases — a
    // WebGL2 feedback loop, so the driver rejected the draw and it silently did nothing:
    // joining a world read as a cut instead of a 0.45s fade, and LEAVING one showed the layer
    // black for the whole fade (the branch below clears glTex.layer first).
    glTex.worldMix = createTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST, gl.CLAMP_TO_EDGE);
    glFbo.worldMix = createFbo(glTex.worldMix);
    // The outgoing frame, frozen at the moment of the switch (see transBegin).
    glTex.prev = createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE);
    glFbo.prev = createFbo(glTex.prev);
    // WHAT THE SHARED WORLD'S REFLECTIONS DRAPE (see FS_WORLD's envRay). It is the OKLab
    // accumulator as it stood immediately BELOW the first joined glass layer -- the same
    // content standalone glass reads live through glBelowTex -- kept for ONE frame, because
    // glWorldDraw traces the world before any layer has been coloured or filtered and so
    // cannot see this frame's.
    // HALF RES on purpose: a picture draped over a ball is low-frequency, and a full-size
    // RGBA8 is what the retired screen stage cost 66 MB at 4K. LINEAR because it is sampled
    // at an arbitrary uv, and its own texture because glTex.prev belongs to the transition
    // and glTex.worldOwn/worldMix are R8 heat, not colour.
    glTex.worldBelow = createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE);
    glFbo.worldBelow = createFbo(glTex.worldBelow);
    glFbo.post = [createFbo(glTex.post[0]), createFbo(glTex.post[1])];
    glTex.blur1 = createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE);
    glFbo.blur1 = createFbo(glTex.blur1);
    glTex.blur2 = createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE);
    glFbo.blur2 = createFbo(glTex.blur2);

    glTex.pal = createTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST, gl.CLAMP_TO_EDGE);
    // The ASCII mosaic's glyph strip. LINEAR, unlike the palette: a glyph sampled at a cell
    // size that does not match the atlas resolution should blur between texels rather than
    // alias into a broken outline. Filled lazily by ensureAsciiAtlas, per script.
    glTex.ascii = createTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, glTex.pal);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    quadVao = gl.createVertexArray();
    ptVao = gl.createVertexArray();
    ptVbo = gl.createBuffer();
    gl.bindVertexArray(ptVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, ptVbo);
    gl.bufferData(gl.ARRAY_BUFFER, glPts.byteLength, gl.DYNAMIC_DRAW);
    ptVboCap = glPts.byteLength;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Flying ribbons' triangle buffer. vec4 a vertex, not vec3 -- see VS_RIB.
    ribVao = gl.createVertexArray();
    ribVbo = gl.createBuffer();
    gl.bindVertexArray(ribVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, ribVbo);
    gl.bufferData(gl.ARRAY_BUFFER, glRib.byteLength, gl.DYNAMIC_DRAW);
    ribVboCap = glRib.byteLength;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    glReady = true;
  }

  function glResize() {
    resizeTex(glTex.heat[0], fw, fh);
    resizeTex(glTex.heat[1], fw, fh);
    resizeTex(glTex.native, fw, fh);
    resizeTex(glTex.scene, fw, fh);
    resizeTex(glTex.blur1, fw, fh);
    resizeTex(glTex.blur2, fw, fh);
    resizeTex(glTex.post[0], fw, fh);
    resizeTex(glTex.post[1], fw, fh);
    resizeTex(glTex.prev, fw, fh);
    resizeTex(glTex.layer, fw, fh);
    resizeTex(glTex.halfLayer, wbW(), wbH());
    resizeTex(glTex.rd[0], fw, fh); resizeTex(glTex.rd[1], fw, fh);
    rdNeedSeed = true;                 // a resized dish is blank — re-seed the culture
    for (let i = 0; i < glTex.heatL.length; i++) {
      resizeTex(glTex.heatL[i][0], fw, fh);
      resizeTex(glTex.heatL[i][1], fw, fh);
    }
    resizeTex(glTex.color[0], fw, fh);
    resizeTex(glTex.color[1], fw, fh);
    resizeTex(glTex.layerCol, fw, fh);
    resizeTex(glTex.world, fw, fh);
    resizeTex(glTex.worldOwn, fw, fh);
    resizeTex(glTex.worldMix, fw, fh);
    resizeTex(glTex.worldBelow, wbW(), wbH());
    worldBelowOk = false;                  // the old contents are the wrong size now
  }
  function glClearHeat() {
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    for (let i = 0; i < 2; i++) { bindFbo(glFbo.heat[i], fw, fh); gl.clear(gl.COLOR_BUFFER_BIT); }
    curHeat = 0; pendingDst = 0;
  }
  function uploadPalette() {
    if (!paletteDirty) return;   // skip the repack+upload when the palette is unchanged
    for (let i = 0; i < 256; i++) {
      const p = palette[i], j = i * 4;
      palBytes[j] = p & 255; palBytes[j + 1] = (p >> 8) & 255;
      palBytes[j + 2] = (p >> 16) & 255; palBytes[j + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, glTex.pal);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, palBytes);
    paletteDirty = false;
  }

  // Open a heat tick: run the whole feedback chain (Fire's propagation, Fade's decay,
  // …) from the live heat into the other buffer, ping-ponging one pass per filter, and
  // leave the final FBO bound so the effect's fresh output can be MAX-blended into it.
  // Pairs with glEndHeat, which is the ONLY place curHeat flips for the point path —
  // keeping the flip in one place is what makes that path safe to reason about.
  //
  // `pendingDst` is set to wherever the LAST pass landed, not a fixed 1 - curHeat, so
  // any number of passes works without a parity fixup: with two filters the result ends
  // up back in the buffer it started in. Getting this backwards only misbehaves when two
  // feedback filters are ticked at once, so it is easy to ship broken.
  function glBeginHeat() {
    // The heat phase of the user's chain: every filter at or above the last feedback one,
    // image filters included (splitChain). Not a stage filter — dragging Mirror above Swirl
    // is meant to mirror the HEAT, and that is what makes the order visible.
    const chain = splitChain(activeFilters().map(f => f.id)).heat;
    let src = curHeat, dst = 1 - curHeat;
    gl.disable(gl.BLEND);
    // No feedback filter ⇒ nothing carries over, so start from black. Clearing is
    // essential: skipping it would leave 2-frames-stale heat in this buffer.
    if (!chain.length) {
      bindFbo(glFbo.heat[dst], fw, fh);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      pendingDst = dst;
      return;
    }
    for (const f of chain) {
      bindFbo(glFbo.heat[dst], fw, fh);   // bind before sampling: src is never the target
      runHeatPass(f, glTex.heat[src]);
      src = dst; dst = 1 - dst;
    }
    pendingDst = src;             // FBO stays bound; the effect draws into it next
  }
  // The shared warp pass behind Echo / Zoom feedback / Swirl. `dist` is in heat
  // pixels, the angles in degrees. LINEAR is bound for the duration via a sampler
  // object and released after — it rides the texture *unit*, so leaving it on would
  // silently soften the next thing sampled there (the fire propagation, notably).
  function glWarpFeedback(src, dist, angDeg, scale, spinDeg, keep) {
    const P = glProg.hwarp, a = angDeg * Math.PI / 180;
    gl.useProgram(P.p);
    bindTexUnit(0, src);
    gl.bindSampler(0, glSampLin);
    gl.uniform1i(P.u.uHeat, 0);
    gl.uniform2f(P.u.uSize, fw, fh);
    gl.uniform2f(P.u.uShift, -Math.cos(a) * dist / fw, -Math.sin(a) * dist / fh);
    gl.uniform1f(P.u.uScale, scale);
    gl.uniform1f(P.u.uSpin, spinDeg * Math.PI / 180);
    gl.uniform1f(P.u.uKeep, keep);
    drawQuad();
    gl.bindSampler(0, null);
  }
  // Canvas2D mirrors of the four warp/diffuse feedback filters. They exist so the
  // fallback keeps its retention: a feedback filter marked cpuOk:false would leave
  // the buffer with nothing to carry heat over, which is a far bigger visual change
  // than a greyed-out post filter. Row order differs from GL's texture space, so a
  // given angle drags the opposite way vertically on this path — self-consistent
  // either way, since it is a direction knob feeding back into itself.
  let warpBuf = null;
  function warpScratch() {
    if (!warpBuf || warpBuf.length !== fire.length) warpBuf = new Uint8Array(fire.length);
    warpBuf.set(fire);
    return warpBuf;
  }
  function heatWarpCPU(dist, angDeg, scale, spinDeg, keep) {
    const s = warpScratch(), a = angDeg * Math.PI / 180, sp = spinDeg * Math.PI / 180;
    const asp = fw / fh, sn = Math.sin(sp), cs = Math.cos(sp), sc = Math.max(0.001, scale);
    const shx = -Math.cos(a) * dist / fw, shy = -Math.sin(a) * dist / fh;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        let cx = ((x + 0.5) / fw - 0.5) * asp, cy = (y + 0.5) / fh - 0.5;
        cx /= sc; cy /= sc;
        const rx = cs * cx - sn * cy, ry = sn * cx + cs * cy;
        const u = rx / asp + 0.5 + shx, v = ry + 0.5 + shy;
        let h = 0;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) h = bilinearHeat(s, u * fw - 0.5, v * fh - 0.5);
        fire[y * fw + x] = h * keep;
      }
    }
  }
  function bilinearHeat(buf, fx, fy) {
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const xa = Math.min(fw - 1, Math.max(0, x0)), xb = Math.min(fw - 1, Math.max(0, x0 + 1));
    const ya = Math.min(fh - 1, Math.max(0, y0)), yb = Math.min(fh - 1, Math.max(0, y0 + 1));
    const t = buf[ya * fw + xa] + (buf[ya * fw + xb] - buf[ya * fw + xa]) * tx;
    const b = buf[yb * fw + xa] + (buf[yb * fw + xb] - buf[yb * fw + xa]) * tx;
    return t + (b - t) * ty;
  }
  function heatDiffuseCPU(rad, keep) {
    const s = warpScratch(), r = Math.max(1, Math.round(rad));
    for (let y = 0; y < fh; y++) {
      const yu = Math.max(0, y - r), yd = Math.min(fh - 1, y + r);
      for (let x = 0; x < fw; x++) {
        const xl = Math.max(0, x - r), xr = Math.min(fw - 1, x + r);
        const sum = s[y * fw + x] * 4
          + (s[y * fw + xl] + s[y * fw + xr] + s[yu * fw + x] + s[yd * fw + x]) * 2
          + s[yu * fw + xl] + s[yu * fw + xr] + s[yd * fw + xl] + s[yd * fw + xr];
        fire[y * fw + x] = sum / 16 * keep;
      }
    }
  }
  // Draw the collected stamps into the currently bound FBO with MAX blending.
  // Split out of glDrawPoints so the credits can stamp over a shader effect's heat
  // without touching the curHeat flip that the point path owns.
  function glBlitPoints(blend, gain) {
    if (glPtCount > 0) {
      gl.useProgram(glProg.pts.p);
      gl.uniform2f(glProg.pts.u.uSize, fw, fh);
      gl.uniform1f(glProg.pts.u.uGain, gain === undefined ? 1 : gain);
      // Set by whichever effect is stamping (see glPtSize); reset to 1 for every item, so one
      // effect asking for fat points cannot leak into the next one's blit.
      gl.uniform1f(glProg.pts.u.uPtSize, Math.max(1, glPtSize));
      gl.bindVertexArray(ptVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, ptVbo);
      const need = glPtCount * 3 * 4;
      if (need > ptVboCap) { gl.bufferData(gl.ARRAY_BUFFER, glPts.byteLength, gl.DYNAMIC_DRAW); ptVboCap = glPts.byteLength; }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, glPts, 0, glPtCount * 3);
      gl.enable(gl.BLEND);
      if (blend === "add") { gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE); }
      else gl.blendEquation(gl.MAX);      // heat = max(existing, stamp)
      gl.drawArrays(gl.POINTS, 0, glPtCount);
      gl.disable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ZERO);
    }
  }
  // FLYING RIBBONS: THE ONE EFFECT THAT DRAWS GEOMETRY. Everything else in the app is a
  // full-screen fragment pass or a cloud of 1px points, and neither can make a surface that
  // hides what is behind it. A ribbon has to: two bands crossing in space must occlude, and
  // MAX-blending brightness is not occlusion -- a dark near band would show the bright far
  // one straight through itself.
  //
  // So this is the only depth buffer in the app. It is attached for THIS DRAW ONLY and
  // detached after: every other pass runs with DEPTH_TEST off, and quietly changing the
  // completeness rules of a framebuffer a dozen other passes share is not worth the one
  // attach call this saves. Created on first use and resized with the grid.
  //
  // Contract otherwise identical to glShaderDraw: bind the layer scratch, blending off,
  // overwrite. Retention and compositing stay the frame's job.
  function glRibbonDraw() {
    if (!glRibCount) return;
    bindFbo(glFbo.layer, fw, fh);
    if (!ribDepthRb) ribDepthRb = gl.createRenderbuffer();
    if (ribDepthW !== fw || ribDepthH !== fh) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, ribDepthRb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, fw, fh);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      ribDepthW = fw; ribDepthH = fh;
    }
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, ribDepthRb);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    const P = glProg.rib;
    gl.useProgram(P.p);
    gl.uniform2f(P.u.uSize, fw, fh);
    gl.bindVertexArray(ribVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, ribVbo);
    const need = glRibCount * 4 * 4;
    if (need > ribVboCap) { gl.bufferData(gl.ARRAY_BUFFER, glRib.byteLength, gl.DYNAMIC_DRAW); ribVboCap = glRib.byteLength; }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, glRib, 0, glRibCount * 4);
    gl.drawArrays(gl.TRIANGLES, 0, glRibCount);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
    // Put the framebuffer back the way every other pass expects to find it.
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
  }
  // glDrawPoints/glEndHeat lived here and are GONE. They were the single-layer GL tick close,
  // but simulate() -- their only route in -- is called from exactly one site, inside the frame
  // loop's `if (!useGL)` branch, so `if (useGL) glEndHeat()` could never fire. The GL point path
  // closes its own tick inline (`curHeat = pendingDst` after every item has blitted), which is
  // where the flip actually happens and the only place it should.
  // Generic per-effect fragment-shader pass: replace the current heat by running
  // glProg[name] over a fullscreen quad. Every effect shader takes uSize; `setU` sets
  // the rest. A shader effect = an FS_* source + `glProg.<id>` registered in initGL +
  // a descriptor `draw` hook that calls this (see glJulia/glPlasma below for the shape).
  // It always OVERWRITES the per-item scratch buffer with blending off, and never
  // touches the shared heat buffer — retention and compositing are the frame's job
  // (see glMergeLayer), not the effect's. This is the simpler of the two paths it used
  // to have, so the 12 effect shaders are unchanged; it also means two shader effects
  // in one frame no longer destroy each other, which is what they did when neither
  // had a feedback filter to force MAX blending on.
  function glShaderDraw(name, setU) {
    // A descriptor carrying halfRes: true (Volumetric clouds) renders into a HALF-SIZE
    // scratch and is blitted up LINEAR into the layer target: its march is the whole cost
    // and its picture is soft, so a quarter of the samples buys the same frame -- measured
    // 9.3 -> ~2.5 ms at 4K. Everything in these shaders is uSize-normalized, so only the
    // two size uniforms change; the blit's DRAW target is whatever glFbo.layer currently
    // is, so the worldOwn swap in renderLayerHeat keeps working untouched.
    const half = !!((EFFECTS.find(e => e.id === name) || {}).halfRes);
    const w = half ? wbW() : fw, h = half ? wbH() : fh;
    bindFbo(half ? glFbo.halfLayer : glFbo.layer, w, h);
    gl.disable(gl.BLEND);
    const P = glProg[name];
    gl.useProgram(P.p);
    gl.uniform2f(P.u.uSize, w, h);
    if (P.u.uCam) { gl.uniform4f(P.u.uCam, camRX, camRY, camRZ, camFov); gl.uniform2f(P.u.uCamSize, w, h); }
    setU(P.u);
    drawQuad();
    if (half) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, glFbo.halfLayer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, glFbo.layer);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, fw, fh, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      rebindCur();
    }
  }
  // Composite the scratch buffer into the shared heat, with this item's blend and gain.
  // Restores all THREE pieces of blend state on the way out — glPostChain/postPass
  // assume BLEND is off and never set it, and "add" is the only thing in the file that
  // touches blendFunc, so nothing else would put it back.
  function glMergeLayer(blend, gain) {
    bindFbo(glFbo.heat[curHeat], fw, fh);
    const P = glProg.merge;
    gl.useProgram(P.p);
    bindTexUnit(0, glTex.layer); gl.uniform1i(P.u.uSrc, 0);
    gl.uniform1f(P.u.uGain, gain);
    gl.enable(gl.BLEND);
    if (blend === "add") { gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE); }
    else gl.blendEquation(gl.MAX);
    drawQuad();
    gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ZERO);
  }
  // Clear the CURRENT heat buffer without flipping. Not glBeginHeat's no-chain branch,
  // which clears the *other* buffer and sets pendingDst — using that here would flip
  // the ping-pong an extra time per frame and desync the parity heatprobe pins.
  function glClearHeatCurrent() {
    bindFbo(glFbo.heat[curHeat], fw, fh);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  // ---- per-layer colour compositing (multi-layer stacks) ---------------------
  // A single-layer scene renders exactly as it always has (shared heat → one palette
  // in glRender). With TWO OR MORE live layers, each layer is coloured with its OWN
  // palette and the results are blended in OKLab (glOkMerge), so every stacked effect
  // keeps its own colours instead of the whole stack sharing the selected layer's.
  // The pieces:
  //   • a persistent heat pair + feedback PER layer (glTex.heatL[slot]) — each effect
  //     retains its own fire/trails, using that layer's own filter set (L.filters);
  //   • an independent palette-morph clock per layer (layerPal[slot]), so layers cycle
  //     on their own schedules drawn from the shared Palette cycle / hold sliders;
  //   • an RGBA8 ping-pong accumulator (glTex.color) that layers blend into in order.
  // glColorTex holds the finished accumulator for glRender; null ⇒ the classic path.
  let glColorTex = null;
  // THE LAYERS BENEATH, as a texture, for the effects that reflect them (Glass ball, Ocean).
  // renderStackColor points this at the OKLab accumulator holding everything merged so far,
  // just before each layer's heat is rendered, and nulls it afterwards. It is only ever
  // non-null inside that loop: the single-layer path has nothing beneath by definition, and
  // an effect that reads it must fall back to something of its own when it is null.
  //
  // It is a COLOUR texture and effects write HEAT, so what they can take from it is
  // luminance. Reflecting the colour of the layer below would mean an effect that outputs
  // RGB, which is a different pipeline; brightness through the ball's own palette is the
  // version that fits this one.
  let glBelowTex = null;
  const layerCur = [0, 0, 0, 0, 0, 0, 0, 0];   // which of heatL[slot][0/1] is live, per slot (live 0-3, outgoing 4-7)
  const layerPal = [];                   // per-slot palette-morph state (see stepLayerPal)
  const palScratch = new Uint8Array(256 * 4);
  // Bake a smooth base ramp (+ the live banding filter) into RGBA bytes for a LUT upload.
  // Mirrors composePalette, but writes an arbitrary target instead of the global palette.
  function bakeLayerBytes(base, now, out, rev, bg) {
    const t = now * 0.001, on = bandLevel > 0.001;
    for (let x = 0; x < 256; x++) {
      let r = base[x * 3], g = base[x * 3 + 1], b = base[x * 3 + 2];
      if (on) {
        const band = (x / 256 * BAND_COUNT) | 0;
        const ci = (((band + 0.5) / BAND_COUNT) * 256) | 0;
        const dim = ((band / bandGroup) | 0) % 2 === 0 ? 1 : bandDim;
        const amt = bandLevel * (0.6 + 0.4 * Math.sin(t * 0.9 - x * 0.05));
        r += (base[ci * 3] * dim - r) * amt;
        g += (base[ci * 3 + 1] * dim - g) * amt;
        b += (base[ci * 3 + 2] * dim - b) * amt;
      }
      const j = x * 4;
      out[j] = clamp(r); out[j + 1] = clamp(g); out[j + 2] = clamp(b); out[j + 3] = 255;
    }
    // Reverse colour order (per-layer): flip 1..255, keep 0 as the background — same as composePalette.
    if (rev) for (let x = 1; x <= 127; x++) {
      const a = x * 4, b = (256 - x) * 4;
      for (let k = 0; k < 4; k++) { const tmp = out[a + k]; out[a + k] = out[b + k]; out[b + k] = tmp; }
    }
    // Smooth the lowest colours into the background (see PAL_FADE_N), same as composePalette.
    if (bg !== "palette") {
      const bv = bg === "white" ? 255 : 0;
      for (let x = 1; x < PAL_FADE_N; x++) {
        const w = palFadeW(x), j = x * 4;
        out[j] = clamp(bv + (out[j] - bv) * w);
        out[j + 1] = clamp(bv + (out[j + 1] - bv) * w);
        out[j + 2] = clamp(bv + (out[j + 2] - bv) * w);
      }
    }
    // Background (heat 0): black (default), white, or the layer palette's own colour-0 (leave as baked).
    if (bg === "white") { out[0] = out[1] = out[2] = 255; }
    else if (bg !== "palette") { out[0] = out[1] = out[2] = 0; }
    out[3] = 255;
  }
  // Which palette this layer colours with. The SELECTED layer's store is the DOM (its
  // L.palette is null while selected, exactly like state/beat), so read the live dropdown
  // — otherwise editing the palette wouldn't update the layer until you deselected it.
  // Others use their captured L.palette, falling back to the effect's default.
  //
  // TWO PER-LAYER FALLBACK POLICIES COEXIST, AND BOTH ARE DELIBERATE — do not "unify" them.
  // The palette family here (palette / rev / bg / showBox) falls back to the RUNTIME
  // `extras[L.fx]`: per-effect palette memory is a feature (an effect recalls the palette you
  // last used with it), and legacy scenes with no per-layer palette must open looking the way
  // they did when every same-effect layer shared one. Filters and seedPts fall back to the
  // DESCRIPTOR default instead (layerFilterSet below, installStackItem) because for them the
  // runtime fallback was a bug — every not-yet-captured layer mirrored the last one edited,
  // and a filter chain or orbit path is structure, not a tint. The accepted cost here: a
  // legacy layer whose palette is still null re-tints if you edit a same-effect layer's
  // palette, for at most as long as it stays never-selected — applyLayerExtras captures
  // concrete values on first selection, which ends the sharing.
  // ---- per-slot render state has to MOVE WITH THE LAYER ------------------------------
  // Retained heat (glTex.heatL / glFbo.heatL / layerCur) and the palette-morph clock
  // (layerPal) are indexed by SLOT, but a layer's position is not fixed: dragging a row
  // reorders `stack`, and deleting one shifts everything below it up. Nothing moved this
  // state to match, so after a reorder a layer inherited the PREVIOUS OCCUPANT'S trails.
  //
  // With a short-lived filter that is a blink. With Zoom feedback -- whose whole job is to
  // hold an image, and whose Lifetime runs to 0.995 -- the inherited picture is hundreds of
  // frames old and takes seconds to decay, which is exactly how it was reported: a second
  // copy of the same animation, far behind, appearing the moment layers were rearranged and
  // fading out again a few seconds later.
  //
  // Moving the state rather than clearing it is what keeps a layer's trails ITS OWN across a
  // drag; clearing would swap one wrong picture for a blank one.
  const SLOT_ARRAYS = () => [glTex.heatL, glFbo.heatL, glTex.palL, layerCur, layerPal];
  // THESE ARRAYS ARE STACK_MAX * 2 LONG -- live 0..STACK_MAX-1, the outgoing (transition) scene
  // STACK_MAX..end. Only the live half ever moves; the outgoing half is a detached snapshot of a
  // scene nobody is editing, and renderStackColor(plive, ..., STACK_MAX) reads it by slot.
  function moveSlotState(from, to) {
    for (const a of SLOT_ARRAYS()) {
      if (!a || from >= a.length) continue;
      // A remove plus an insert, both BELOW STACK_MAX, cancel out for every index above them --
      // so the outgoing half is already left where it was. Nothing more to do here.
      a.splice(to, 0, a.splice(from, 1)[0]);
    }
  }
  function dropSlotState(j) {
    // The removed layer's buffers go to the BACK OF THE LIVE HALF rather than being thrown away:
    // they are GL objects the pool still owns, and every survivor keeps the one it was using.
    //
    // Re-inserting at STACK_MAX-1, not push(). A push sends it past the outgoing half, so the
    // remove shifted slots STACK_MAX..end down by one and never shifted them back: delete a layer
    // during a 0.45-0.9s preset blend and the OUTGOING half of that blend renders another layer's
    // retained heat, palette LUT and ping-pong parity for the rest of the transition.
    for (const a of SLOT_ARRAYS()) {
      if (!a || j >= a.length) continue;
      const at = Math.min(STACK_MAX - 1, a.length - 1);
      a.splice(at, 0, a.splice(j, 1)[0]);
    }
  }
  function layerPalIndex(L) {
    let raw;
    if (L === stack[stackSel]) raw = +paletteSel.value;
    else { const fx = extras[L.fx] || presetExtra(L.fx); raw = +(L.palette != null ? L.palette : fx.palette); }
    return Math.max(0, Math.min(PALETTES.length - 1, raw | 0));
  }
  // Whether this layer reverses its palette. Selected layer's store is the live checkbox
  // (paletteReverse), exactly like layerPalIndex reads the live dropdown; others use L.paletteRev.
  function layerPalRev(L) {
    if (L === stack[stackSel]) return paletteReverse;
    if (L.paletteRev != null) return !!L.paletteRev;
    const fx = extras[L.fx] || presetExtra(L.fx);
    return !!fx.paletteRev;
  }
  function layerPalBg(L) {
    if (L === stack[stackSel]) return paletteBg;
    if (L.paletteBg != null) return bgOk(L.paletteBg);
    const fx = extras[L.fx] || presetExtra(L.fx);
    return bgOk(fx.paletteBg);
  }
  // Whether this layer draws its wireframe box (Tetrafyer). Same selected-vs-stored split as
  // layerPalIndex. It used to be a per-EFFECT extra installed into a global by loadExtra, so
  // it followed the SELECTED layer's effect: Tetrafyer ships showBox:false and every other
  // effect ships true, which is exactly why the box appeared while editing another layer and
  // vanished the moment you selected the Tetrafyer one.
  function layerShowBox(L) {
    if (L === stack[stackSel]) return showBoxChk.checked;
    if (L.showBox != null) return !!L.showBox;
    const fx = extras[L.fx] || presetExtra(L.fx);
    return fx.showBox !== false;
  }
  // This layer's per-layer filter SET — the same selected-vs-stored split as layerPalIndex.
  // Falls back to the descriptor default (never the runtime extras[L.fx] — see
  // layerFeedbackChain), so a fresh layer gets fire+bloom / bloom rather than the last-used set.
  function layerFilterSet(L) {
    if (L === stack[stackSel]) return activeIds;
    return filtersOk(L.filters) || new Set(presetFilters(L.fx));
  }
  // Advance ONE layer's palette clock and return its current base ramp.
  //
  // TIMING IS PER LAYER, and it has to be read through `bandOf(L, …)`. It used to call
  // morphMs()/holdMs()/palCycleOn(), which read `ctl("palcycle-lo")` — the SELECTED
  // layer's live thumbs — so every layer cycled on whichever layer you happened to have
  // selected: pinning the selected layer's cycle froze the whole stack, and its duration
  // drove everybody. The from/to/target state was already per slot, which is why this
  // looked like "the palette sliders are linked between layers" rather than an obvious
  // crash. Same accessor updateAnims uses: the DOM for the selected layer, L.state for
  // the rest.
  function palBandOf(L, key, dflt) {
    const b = L ? bandOf(L, key) : null;
    if (!b) return dflt;
    return [Math.min(b[0], b[1]), Math.max(b[0], b[1])];
  }
  function stepLayerPal(slot, palIdx, now, L) {
    const cyc = palBandOf(L, "palcycle", palCycleBand());
    const hld = palBandOf(L, "palhold", palHoldBand());
    const cycleOn = cyc[1] > 0;                                  // fixed palette when the band tops out at 0
    const dur = () => Math.max(0.2, cyc[0] + Math.random() * (cyc[1] - cyc[0])) * 1000;
    const hold = () => (hld[0] + Math.random() * (hld[1] - hld[0])) * 1000;
    let st = layerPal[slot];
    if (!st) st = layerPal[slot] = { pal: -1, cur: new Float32Array(768), from: null, to: null, tIdx: 0, start: 0, dur: 1, hold: 0 };
    if (st.pal !== palIdx) {                       // first use, or the user changed this layer's palette
      const target = paletteRGB(palIdx);
      if (st.pal < 0) st.cur.set(target);          // first use snaps; a later change morphs from current
      st.from = Float32Array.from(st.cur);
      st.to = target; st.tIdx = palIdx; st.pal = palIdx;
      st.start = now; st.dur = dur(); st.hold = 0;
    }
    if (!cycleOn) { st.cur.set(st.to); return st.cur; }   // pinned: rest on the chosen palette
    if (st.hold) {
      if (now < st.hold) return st.cur;
      st.hold = 0; st.from = st.to; st.tIdx = pickOther(st.tIdx); st.to = paletteRGB(st.tIdx);
      st.start = now; st.dur = dur();
    }
    let f = (now - st.start) / st.dur;
    if (f >= 1) {
      const h = hold();
      if (h > 0) { st.cur.set(st.to); st.hold = now + h; return st.cur; }
      st.from = st.to; st.tIdx = pickOther(st.tIdx); st.to = paletteRGB(st.tIdx);
      st.start = now; st.dur = dur(); f = 0;
    }
    const from = st.from, to = st.to, cur = st.cur;
    for (let i = 0; i < 768; i++) cur[i] = from[i] + (to[i] - from[i]) * f;
    return cur;
  }
  // This layer's feedback filters, as pass objects — its OWN set (L.filters), not the
  // scene-wide one. Reuses the exact glFeedback hooks glBeginHeat runs (they only need
  // a source texture and a bound FBO), so per-layer fire/trails come for free.
  function layerFeedbackChain(L) {
    // Fallback is the DESCRIPTOR default (presetFilters), NOT runtime extras[L.fx]. extras is
    // the per-effect *last-used* filter set that saveExtra overwrites on every edit, so falling
    // back to it made every not-yet-captured same-effect layer mirror the last one edited — the
    // "all layers share one filter set" bug (identical in shape to the seedPts one, see
    // layerSeedPts). Old-scene compat is handled at load in mergeLayers (tex.filters), not here.
    // splitChain, not a stage filter: the heat phase is everything the user put at or above
    // the last feedback filter, INCLUDING image filters they dragged up there (see splitChain).
    // A bypassed filter is dropped BEFORE splitChain, so it neither runs nor counts as the
    // last feedback filter — otherwise muting a feedback filter would leave the boundary
    // where it was and silently move image filters into the heat phase.
    const ids = liveChainIds(L);
    return splitChain(ids).heat;
  }
  // glBeginHeat, but on ONE layer's private heat pair. Returns the index the last pass
  // wrote (the buffer left bound), so the caller can stamp/inject into it. Deliberately
  // NOT glBeginHeat itself — that one stays byte-identical for the shared path heatprobe
  // pins; this duplicates ~10 lines to keep the two paths independent.
  function glLayerBeginHeat(slot, src, chain) {
    let s = src, d = 1 - src;
    gl.disable(gl.BLEND);
    if (!chain.length) {                           // nothing retains ⇒ start from black
      bindFbo(glFbo.heatL[slot][d], fw, fh);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      return d;
    }
    for (const f of chain) {
      bindFbo(glFbo.heatL[slot][d], fw, fh);
      runHeatPass(f, glTex.heatL[slot][s]);   // feedback hook, or an image filter dragged up here
      s = d; d = 1 - d;
    }
    return s;
  }
  // Render one layer's heat into its own slot buffer and return the texture holding it.
  // Point layers own the tick loop (propagate + stamp per tick, into their pair); shader
  // layers draw once, and if they carry feedback filters MAX their output onto the
  // retained pair, else colour the scratch directly. Gain is applied later, in glOkMerge.
  function renderLayerHeat(L, slot, fx, dt, now, ticks) {
    const chain = layerFeedbackChain(L);
    // Install THIS layer's params + phase up front, so everything below reads them: the feedback
    // propagation (its decay), the feedback filters (their keeps — Fade/Echo/Diffuse/Swirl), the
    // heat→colour map AND its post-filter chain. Doing it here rather than inside the point tick
    // loop means it also runs on frames with ticks==0 (common at high framerate) — otherwise a
    // point layer's trails/colour/post inherited the previously-drawn (or selected) layer's params
    // and read as belonging to another layer. Shader layers already installed first; this unifies.
    installStackItem(L); installPhase(L);
    if (!fx.draw) {                                // POINT layer
      let cur = layerCur[slot];
      for (let t = 0; t < ticks; t++) {
        cur = glLayerBeginHeat(slot, cur, chain);  // propagate into the other buffer, leave it bound
        glPtCount = 0;
        stampTick(L, now); capturePhase(L);
        // a stampAdd effect (Fractal flames) accumulates density whatever the layer blend
        glBlitPoints(EFFECTS[L.fx].stampAdd ? "add" : L.blend, 1);   // stamp into the bound buffer (gain deferred)
      }
      layerCur[slot] = cur;
      return glTex.heatL[slot][cur];
    }
    // A JOINED LAYER DOES NOT DRAW ITSELF -- glWorldDraw already traced its geometry along
    // with every other participant's, so all that is left is to take its own pixels out of
    // the shared G-buffer. Everything below this line is identical either way.
    const wid = worldPlan && worldPlan.ids.get(L);
    const fade = worldFadeStep(L, !!wid, dt);
    // Where this layer's fresh heat ended up. Normally glTex.layer; mid-fade the mix has to
    // write a third buffer (see glWorldMix), so everything downstream reads THIS, not the
    // global. Getting that wrong is silent — the blend simply does not appear.
    let outTex = glTex.layer;
    if (fade >= 1) glWorldPick(wid);                               // fully in the world
    else if (fade <= 0) { fx.draw(dt); capturePhase(L); }          // fully its own (→ glTex.layer)
    else {
      // MID-FADE: both pictures, then mix. The own draw goes to a side buffer, because
      // fx.draw writes glTex.layer and the pick needs that as its target. The own draw still
      // advances the layer's clocks when no world is ready (wid null); when one is, the world
      // pass already advanced them and this draw runs with dt 0 so they are not stepped twice.
      const swap = glFbo.layer, swapT = glTex.layer;
      glFbo.layer = glFbo.worldOwn; glTex.layer = glTex.worldOwn;
      fx.draw(wid ? 0 : dt); if (!wid) capturePhase(L);
      glFbo.layer = swap; glTex.layer = swapT;
      if (wid) glWorldPick(wid);
      else { bindFbo(glFbo.layer, fw, fh); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      outTex = glWorldMix(glTex.worldOwn, fade);
    }
    if (!chain.length) return outTex;              // no feedback: colour the scratch directly
    let cur = layerCur[slot];
    for (let t = 0; t < ticks; t++) cur = glLayerBeginHeat(slot, cur, chain);   // advance retained heat
    bindFbo(glFbo.heatL[slot][cur], fw, fh);       // MAX the fresh shader output onto it
    const P = glProg.merge;
    gl.useProgram(P.p);
    bindTexUnit(0, outTex); gl.uniform1i(P.u.uSrc, 0); gl.uniform1f(P.u.uGain, 1);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX);
    drawQuad();
    gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ZERO);
    layerCur[slot] = cur;
    return glTex.heatL[slot][cur];
  }
  // Map a layer's heat through its palette LUT → RGB (glTex.layerCol), the input to that
  // layer's own post-filter chain. Reuses FS_PAL, the same heat→colour pass glRender uses.
  function glColorizeLayer(heatTex, palTex) {
    bindFbo(glFbo.layerCol, fw, fh);
    gl.disable(gl.BLEND);
    gl.useProgram(glProg.pal.p);
    bindTexUnit(0, heatTex); gl.uniform1i(glProg.pal.u.uHeat, 0);
    bindTexUnit(1, palTex);  gl.uniform1i(glProg.pal.u.uPal, 1);
    gl.uniform1f(glProg.pal.u.uCurve, heatBoost);   // this layer's Heat boost (installStackItem set it)
    drawQuad();
    return glTex.layerCol;
  }
  // Run ONE layer's post filters (Wedge, Twist, Edge, …) on its colour image, using THIS
  // layer's own params (installStackItem has put them in the globals the gl hooks read).
  // Its own filter SET, not the scene-wide one; ping-pongs the shared post buffers, which
  // are free during renderStackColor. Bloom has no gl hook (it is the scene glow) so it is
  // naturally excluded and stays whole-scene. Empty ⇒ the source passes straight through.
  function glLayerPostChain(L, src) {
    const set = liveChainIds(L);            // descriptor default, not extras[L.fx] — see layerFeedbackChain
    const chain = splitChain(set).image;    // only what the user placed BELOW the last feedback filter
    if (!chain.length) return src;
    let s = src, slot = 0;
    for (const f of chain) {
      bindFbo(glFbo.post[slot], fw, fh);
      f.gl(s);
      s = glTex.post[slot];
      slot = 1 - slot;
    }
    return s;
  }
  // Layer blend modes for the OKLab colour merge (used when 2+ layers are live). `u` is the
  // FS_OKMERGE branch; the array order is the cycle order of a row's blend button. max + add
  // are unchanged (u 1/0); diff/colour/lum are the new ones and only act in the multi-layer
  // colour path — a lone layer has nothing to blend against, and the heat-space fallbacks
  // (glBlitPoints/glMergeLayer) treat them as MAX. MUST be top-level (not inside initGL,
  // where FS_OKMERGE lives): syncStackUI, glOkMerge and blendOk all read it from IIFE scope.
  const BLEND_MODES = [
    { id: "max",   label: "MAX", u: 1, tip: "Max — the brighter layer wins each pixel. Clean separation; the safe default." },
    { id: "add",   label: "ADD", u: 0, tip: "Add — screens the layers' brightness and averages their hue by brightness. Overlaps glow brighter." },
    { id: "diff",  label: "DIF", u: 2, tip: "Difference — |below − this| in OKLab. Psychedelic where the layers disagree, dark where they match." },
    { id: "color", label: "COL", u: 3, tip: "Colour — keeps the brightness of the layers below, repainted in this layer's hue." },
    { id: "lum",   label: "LUM", u: 4, tip: "Luminosity — this layer's brightness wearing the hue of the layers below." },
    { id: "rgb",   label: "RGB", u: 5, tip: "RGB — screens the red, green and blue channels independently, so overlapping layers keep their full colour instead of merging to one hue." },
    { id: "okl",   label: "OKL", u: 6, tip: "Vivid — blends the two hues around the colour wheel (chroma-weighted) and keeps the higher saturation, so overlaps stay fully saturated instead of greying out. Red + green → vivid orange-yellow." },
    { id: "dom",   label: "DOM", u: 7, tip: "Dominant — at each pixel the more colourful layer keeps its exact hue (no mixing), lightness screened. Maximum saturation, crisp boundaries between the two palettes." },
    { id: "mul",   label: "MUL", u: 8, tip: "Multiply — colours multiply per channel, so overlaps darken into rich, saturated ink. The natural opposite of Add; great for carving shadow on a bright scene." },
    { id: "ovl",   label: "OVL", u: 9, tip: "Overlay — multiplies where the layer below is dark and screens where it is light, hard-boosting contrast. Darks crush, lights pop." },
    { id: "ddg",   label: "DDG", u: 10, tip: "Colour dodge — wherever this layer is bright, the layers below bloom toward pure white/colour. Neon blowout, intense highlights." },
    { id: "brn",   label: "BRN", u: 11, tip: "Colour burn — the dark twin of dodge: deep, crushed, saturated shadows wherever this layer is dark. Moody and heavy." },
    { id: "xor",   label: "XOR", u: 12, tip: "Bitwise XOR of the 8-bit channels — hard interference bands that shift as the layers move. The munching-squares / demoscene glitch look." },
    { id: "rfl",   label: "RFL", u: 13, tip: "Reflect / glow — this layer's own highlights flare like neon tubes while dark areas stay dark. Like dodge, concentrated on this layer's brights." },
    { id: "neg",   label: "NEG", u: 14, tip: "Negation — bright where the two layers agree, inverted where they collide. A trippy pseudo-solarize that never fully darkens." },
    { id: "int",   label: "INT", u: 15, tip: "Interleave — even scanlines show this layer, odd lines the one below. A CRT/dither way to combine two scenes with zero colour mixing." },
    { id: "hsv",   label: "HSV", u: 16, tip: "Hyper-vivid — takes the greater lightness AND chroma of the two, hue from the punchier layer. Louder than OKL; overlaps read maximally bright and saturated." },
    { id: "avg",   label: "AVG", u: 17, tip: "Average — a plain 50/50 perceptual mean of both layers in OKLab. Soft and painterly, the calm opposite of the screen/add family." },
    { id: "cmp",   label: "CMP", u: 18, tip: "Complement push — overlaps rotate to the opposite hue of the dominant layer: reds bleed cyan, greens bleed magenta. Alien colour you can't get by mixing." },
    { id: "over",  label: "OVR", u: 20, tip: "Over — where this layer drew something it COVERS the layers below; where it drew nothing they show through. The one to use for a solid object (a metal ball, a raymarched solid) that should hide what is behind it rather than glow through it." },
    { id: "key",   label: "KEY", u: 21, tip: "Key — like Over, but this layer's DARK areas let the layers below show through instead of covering them. Use it when the layer fills the whole frame (a pattern or fractal shader) and Over would simply hide everything underneath." },
    { id: "cmax",  label: "CMX", u: 19, tip: "Channel max (Lighten) — takes the brighter of the two layers in EACH of red, green and blue independently. Unlike MAX (which keeps whichever whole layer is brighter), this mixes channels, so a red layer over a green one yields yellow where they overlap." },
  ];
  const BLEND_BY_ID = Object.fromEntries(BLEND_MODES.map(m => [m.id, m]));
  // Blend one layer's finished RGB colour into the accumulator, in OKLab.
  function glOkMerge(layerTex, blend, gain, accSrc, dstFbo, cover) {
    bindFbo(dstFbo, fw, fh);
    gl.disable(gl.BLEND);
    const P = glProg.okmerge;
    gl.useProgram(P.p);
    bindTexUnit(0, layerTex); gl.uniform1i(P.u.uLayer, 0);
    bindTexUnit(1, accSrc);   gl.uniform1i(P.u.uAcc, 1);
    gl.uniform1f(P.u.uGain, gain === undefined ? 1 : gain);
    gl.uniform1i(P.u.uBlend, (BLEND_BY_ID[blend] || BLEND_MODES[0]).u);
    // How solid this layer is where it covers. Only the OVER branch reads it; 1 is the
    // old behaviour and what every effect but Glass ball asks for.
    gl.uniform1f(P.u.uCover, cover === undefined ? 1 : cover);
    drawQuad();
  }
  // The whole multi-layer colour path: render each live layer's heat, colour it with its
  // own palette, run its OWN filter chain (feedback already applied inside renderLayerHeat;
  // post here), then blend the layers together in OKLab, leaving the result in glColorTex.
  // `base` offsets the per-slot buffers: 0 for the live scene, STACK_MAX for the outgoing
  // one during a transition. It replaces `stack.indexOf(L)`, which returns -1 for a
  // DETACHED item and is the one line that has to change for this to work at all — every
  // per-slot lookup below would silently read heatL[-1] and the whole scene would vanish.
  // ---- the shared 3D world ---------------------------------------------------------
  // Layers that have joined (`layerWorld(L)`) are not drawn by their own effect at all:
  // ONE pass traces all of their geometry together, so a Glass ball reflects in the Ocean
  // and the Ocean reflects in the ball, with real occlusion and a real contact line. The
  // pass writes a G-BUFFER — heat in .r, object ID in .g — and each joined layer then picks
  // its own pixels out of it (glWorldPick). Everything downstream is untouched: the layer's
  // feedback chain, its palette, its post filters and the OKLab merge never learn that the
  // heat arrived from a shared trace rather than from `fx.draw(dt)`.
  //
  // ONE LAYER PER EFFECT KIND joins, and the first in stack order wins. A second Glass ball
  // layer renders standalone as it always did. Supporting N of a kind means every uniform
  // here becoming an array and the inner loop paying for all of them; it is a real
  // extension, not a hard one, and it is not what makes the feature work.
  // ponytail: one ocean + one ball in the world; arrays if anyone ever wants two of a kind.
  //
  // GL only. The Canvas2D fallback renders a single item and has nowhere to put a merged
  // scene, so on that path every effect draws itself exactly as before.
  // effect id -> uniform prefix. Only effects that can share a VIEWPOINT are here: the
  // interior flights (Mandelbulb, Menger sponge, Doughnut) put the camera inside their own
  // geometry and have nowhere to stand in someone else's world.
  const WORLD_KINDS = { ocean: "oc", glass: "gb", solids: "sd", qjulia: "qj", vballs: "vb" };
  let worldPlan = null;                 // { ids: Map<layer, id>, oc/gb/sd/qj: L|null }
  // Which joined layers are in this frame's world, and what ID each one owns. IDs start at
  // 1: 0 is "nothing was hit", so a layer can never be handed the background.
  function planWorld(live) {
    let plan = null, next = 1;
    for (const L of live) {
      const kind = WORLD_KINDS[EFFECTS[L.fx].id];
      if (!kind || !layerWorld(L)) continue;
      if (!plan) plan = { ids: new Map(), oc: null, gbs: [], sd: null, qj: null, vb: null };
      // GLASS IS MULTI: every joined Glass ball layer gets its own group (up to STACK_MAX),
      // because two glass layers reflecting each other at their true positions is the point.
      // The other kinds stay one-per-world -- their uniforms are single, and nobody has
      // asked for two oceans.
      if (kind === "gb") {
        if (plan.gbs.length >= 4) continue;
        plan.gbs.push(L);
        plan.ids.set(L, next++);
        continue;
      }
      if (plan[kind]) continue;         // one per kind, first in stack order
      plan[kind] = L;
      plan.ids.set(L, next++);
    }
    return plan;
  }
  // Draw the world once, into glTex.world. The OWNER — the lowest joined layer — has
  // already been installed by the caller, so camRX/camRY/camRZ, camFov and zoom are its
  // own: the shared camera is a real camera the user can still fly, not a fixed one.
  // ---- the world program: lazy, per combination, and linked in the background ---------
  // THE BACKEND OPTIMISES EVERYTHING THE SHADER CAN REACH, not what a frame uses. Measured
  // on this driver: ocean+glass links in 3.5s, +solids+qjulia 25s, all five 64s. Building it
  // at startup therefore froze the page for a minute on a feature almost no scene enables --
  // which is exactly what it did, and what this replaces.
  //
  // Two fixes, both needed. The source is assembled per COMBINATION with the absent groups
  // #if'd out, so a scene using two effects never pays for the other three. And the link is
  // ASYNCHRONOUS where KHR_parallel_shader_compile exists: `planWorld` reports nothing until
  // the program is ready, so the joined layers keep drawing themselves and the world simply
  // appears a few seconds later instead of freezing the tab.
  // `var` AND NO INITIALISER, both load-bearing, and this cost two bugs to get right.
  // `initGL()` is called from palette.js -- two slices ABOVE this one -- so a `let` here
  // leaves these in the temporal dead zone when it runs ("Cannot access 'worldProgs' before
  // initialization", i.e. a blank page). And a `var` WITH an initialiser is worse, because
  // it fails silently: the hoisted binding lets initGL assign fine, and then this line
  // executes later and wipes it, so the world shader compiles from an empty string and
  // throws `1:1 syntax error` on every frame. Exactly the trap bindFbo's curFbo documents.
  // initGL is the one place these are set.
  // Scratch for the glass groups' uniform arrays -- allocated once, refilled per frame.
  const gbScr = { salts: new Float32Array(8), ids: new Float32Array(4), times: new Float32Array(4), counts: new Float32Array(4),
                  rads: new Float32Array(4), mats: new Float32Array(4), iors: new Float32Array(4),
                  glows: new Float32Array(4), places: new Float32Array(16) };
  var worldProgs;                       // "gb|sd" -> { p, pending } | { p, prog }
  var worldPar;                         // the parallel-compile extension, looked up once
  var worldVs, worldFsBase;             // shader sources -- they are local to initGL
  const WORLD_UNIFORMS = ["uSize", "uZoom", "uBelow", "uHasBelow", "uOcOn", "uOcId", "uTime",
    "uSwell", "uChop", "uFoam", "uWind", "uHeight", "uReflect",
    "uGbOn", "uGbId", "uGbTime", "uGbCount", "uGbRad", "uGbMat", "uGbIor", "uGbGlow", "uGbPlace", "uGbSalt",
    "uSdOn", "uSdId", "uSdCount", "uSdRim", "uSdPos", "uSdQuat", "uSdShape", "uSdPlace",
    "uQjOn", "uQjId", "uQjPhase", "uQjSlice", "uQjCut", "uQjIter", "uQjGlow", "uQjC", "uQjPlace", "uQjRot",
    "uVbOn", "uVbId", "uVbPhase", "uVbCount", "uVbShape", "uVbRad", "uVbGlow", "uVbPlace"];
  // The defines go immediately after #version, which must stay the very first line of a
  // GLSL ES 3.0 source. Built with fromCharCode rather than an escape: this file is edited
  // through shell heredocs and a written-out newline escape has collapsed into a REAL
  // newline four times in one sitting, each time breaking the string it sat in.
  const WNL = String.fromCharCode(10);
  function worldSource(key) {
    const on = f => (key.indexOf(f) >= 0 ? "1" : "0");
    // The glass COUNT is baked in as W_GBN (the key carries it: "gb2|oc"). A uniform bound
    // made every program pay the 4-group link cost -- one glass layer linked in 12 seconds
    // against 3.5 -- because the backend optimises for every group a loop can reach. A
    // constant bound makes one glass layer link like one. W_GBN stays >= 1 with glass off;
    // the arrays are still declared either way.
    const gbm = key.match(/gb([0-9])/);
    // The ocean SURFACE is baked in the same way (key carries 's2'): a uniform switch would
    // put all four surface functions in every program, and even dead they cost the march
    // its unrolling -- measured 4x on the standalone shader.
    const sfm = key.match(/s([0-3])/), sfn = sfm ? +sfm[1] : 0;
    const def = WNL + ["W_SURF_SINE", "W_SURF_SEA", "W_SURF_SWELL", "W_SURF_NOISE"].map((f, i) => "#define " + f + " " + (i === sfn ? 1 : 0)).join(WNL)
              + WNL + "#define W_GB " + on("gb")
              + WNL + "#define W_GBN " + (gbm ? gbm[1] : "1")
              + WNL + "#define W_SD " + on("sd")
              + WNL + "#define W_QJ " + on("qj")
              + WNL + "#define W_VB " + on("vb") + WNL;
    return worldFsBase.replace("#version 300 es" + WNL, "#version 300 es" + def);
  }
  // The Surface a layer renders with: the live global for the selected layer (its store is
  // the DOM and L.state is null), the frozen record for any other. A single control's pair
  // is collapsed lo-then-round, the way singlePair does it.
  function layerSurf(L) {
    const v = L && L.state && L.state.gosurf ? L.state.gosurf[0] : goSurf;
    return Math.max(0, Math.min(3, Math.round(+v || 0)));
  }
  // Returns the linked program, or null while it is still being built.
  function worldProgFor(plan) {
    const key = (["gb", "sd", "qj", "vb"]
      .filter(k => k === "gb" ? plan.gbs.length : plan[k])
      .map(k => k === "gb" ? "gb" + plan.gbs.length : k).join("|") || "oc")
      // Changing Surface while joined relinks the world (async; the joined layers draw
      // themselves meanwhile, exactly as on first join). Ocean-only relinks in ~0.1 s.
      + (plan.oc ? "|s" + layerSurf(plan.oc) : "");
    let e = worldProgs[key];
    if (e && e.prog) return e.prog;
    if (!e) {
        if (worldPar === null) worldPar = gl.getExtension("KHR_parallel_shader_compile") || false;
      // vsFor, not a fresh glCompile: VS_QUAD is one source shared by every program, and makeProg
      // was changed to compile it exactly once for that reason. This was the one site still
      // recompiling it per combination.
      // SAY SO. This link is ASYNCHRONOUS and takes seconds the first time a combination is
      // built -- the driver optimises everything worldMap can reach, which is exactly why it is
      // not done at startup at all. Until it lands, worldProgFor returns null, planWorld's
      // result is dropped, and the joined layers carry on drawing THEMSELVES: the scene looks
      // wrong rather than busy, with nothing on screen to explain the pause.
      //
      // flashUiHint is the only reporter that works with no panel, menu or dialog open (fixed,
      // aria-live, exempt from body.ui-hidden). It is a hoisted function declaration in a later
      // slice, which is what lets this call it. Once per combination -- this branch is the
      // cache MISS, so a world that is already built says nothing.
      // STICKY: held until the program is ready below, not for a fixed 2.2s. The link takes
      // 3.5s for ocean+glass, ~25s once solids and quaternion Julia join, ~64s for all five --
      // so a timed toast vanished long before the picture came right, which is the opposite of
      // what it is for.
      if (typeof flashUiHint === "function")
        flashUiHint("Building the shared 3D world \u2014 this takes a few seconds the first time.", true);
      const vs = vsFor(worldVs);
      // Same rewrite camProg does, so the shared camera still applies.
      const fsSrc = worldSource(key).replace(/gl_FragCoord/g, "fragCam")
        .replace("void main(){", camGlsl() + WNL + "    void main(){ vec4 fragCam = camFrag4();");
      const fs = glCompile(gl.FRAGMENT_SHADER, fsSrc);
      const p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, fs);
      gl.linkProgram(p);                 // do NOT read LINK_STATUS yet -- that is the stall
      // Detach + delete the FRAGMENT shader only. The program keeps what it needs once linked,
      // and the vertex shader is the shared cached one, which must outlive this program.
      // (Deleting cannot be deferred past the async link -- deleteShader on an attached shader
      // is a flag, and the driver frees it when the program releases it.)
      gl.deleteShader(fs);
      e = worldProgs[key] = { p, pending: true };
    }
    // Poll. Without the extension there is no way to ask, so take the hit once, here, rather
    // than at startup: the user has just opted in and a pause they caused is legible.
    if (worldPar && !gl.getProgramParameter(e.p, worldPar.COMPLETION_STATUS_KHR)) return null;
    if (!gl.getProgramParameter(e.p, gl.LINK_STATUS)) {
      console.error("world program link failed: " + gl.getProgramInfoLog(e.p));
      e.prog = { p: null, u: {} };       // remember the failure; never retry every frame
      if (typeof hideUiHint === "function") hideUiHint();   // never strand a sticky message on a dead link
      return null;
    }
    const u = {};
    for (const n of WORLD_UNIFORMS.concat(["uCam", "uCamSize"])) u[n] = gl.getUniformLocation(e.p, n);
    e.prog = { p: e.p, u };
    e.pending = false;
    if (typeof hideUiHint === "function") hideUiHint();   // the picture is correct from here
    return e.prog;
  }

  // Half of the render buffer, never zero -- a 1px canvas would otherwise ask for a 0-wide
  // texture and the blit below would be rejected.
  function wbW() { return Math.max(1, fw >> 1); }
  function wbH() { return Math.max(1, fh >> 1); }
  // ONE FRAME LATE, DELIBERATELY. glWorldDraw runs before the layer loop -- it has to, since a
  // joined layer's heat is a slice of the world -- so the filtered picture a reflection ought
  // to show does not exist yet when the ball is shaded. This copies it at the one moment it IS
  // right, and FS_WORLD reads it on the next frame. At 60 fps the lag is not visible; on a
  // paused, stepped scene it is.
  // IT MUST BE THE STATE BELOW THE GLASS. An accumulator that already contains the balls makes
  // them reflect themselves, one frame apart, forever.
  // blitFramebuffer rather than a quad: it scales natively, so the downsample costs no program,
  // no VAO and no pass. It rebinds BOTH the read and the draw target, hence rebindCur.
  function captureWorldBelow(src) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, glFbo.color[src]);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, glFbo.worldBelow);
    gl.blitFramebuffer(0, 0, fw, fh, 0, 0, wbW(), wbH(), gl.COLOR_BUFFER_BIT, gl.LINEAR);
    rebindCur();
    worldBelowOk = true;
  }
  // 'var' with no initialiser, the same rule worldProgs/worldPar follow: glResize assigns it
  // and is called from an earlier slice than this one, so a 'let' here is in the temporal dead
  // zone at that moment and a 'var' WITH an initialiser would be worse -- glResize's write
  // would be silently wiped when this line finally ran.
  var worldBelowOk;

  // `dt` is not optional. A joined layer's fx.draw(dt) never runs — that is the whole
  // point — so this is the ONLY place its clock still advances. Passing 0 here freezes the
  // effect: the waves stop moving and the balls stop drifting, on geometry that otherwise
  // renders perfectly, which is a hard thing to see in a screenshot.
  function glWorldDraw(plan, dt, P) {
    bindFbo(glFbo.world, fw, fh);
    gl.disable(gl.BLEND);
    gl.useProgram(P.p);
    gl.uniform2f(P.u.uSize, fw, fh);
    if (P.u.uCam) { gl.uniform4f(P.u.uCam, camRX, camRY, camRZ, camFov); gl.uniform2f(P.u.uCamSize, fw, fh); }
    gl.uniform1f(P.u.uZoom, zoom);
    // Bound to a COMPLETE texture even when the shader will not read it -- the same rule the
    // standalone glBelowTex seam follows -- with the float switching the branch.
    bindTexUnit(2, worldBelowOk ? glTex.worldBelow : glTex.native);
    gl.uniform1i(P.u.uBelow, 2);
    gl.uniform1f(P.u.uHasBelow, worldBelowOk ? 1 : 0);
    const oc = plan.oc, gbs = plan.gbs, sd = plan.sd, qj = plan.qj, vb = plan.vb;
    gl.uniform1f(P.u.uOcOn, oc ? 1 : 0);
    gl.uniform1f(P.u.uOcId, oc ? plan.ids.get(oc) : 0);
    if (oc) {
      installStackItem(oc); installPhase(oc);
      const s = oceanSeed(dt);          // this layer's clock, advanced here and nowhere else
      gl.uniform1f(P.u.uTime, s.t); gl.uniform1f(P.u.uSwell, s.swell);
      gl.uniform1f(P.u.uChop, s.chop); gl.uniform1f(P.u.uFoam, s.foam);
      gl.uniform1f(P.u.uWind, s.wind); gl.uniform1f(P.u.uHeight, s.height);
      gl.uniform1f(P.u.uReflect, s.reflect);
      capturePhase(oc);
    }
    gl.uniform1f(P.u.uGbOn, gbs.length ? 1 : 0);
    if (gbs.length) {
      // One array entry per joined glass layer. installStackItem puts THAT layer's placement
      // sliders and clock into the globals before each read, so every group carries its own.
      const ids = gbScr.ids, times = gbScr.times, counts = gbScr.counts, rads = gbScr.rads, salts = gbScr.salts;
      const mats = gbScr.mats, iors = gbScr.iors, glows = gbScr.glows, places = gbScr.places;
      gbs.forEach((gb, g) => {
        installStackItem(gb); installPhase(gb);
        const s = glassSeed(dt);        // this layer's one clock advance for the frame
        ids[g] = plan.ids.get(gb); times[g] = s.t; counts[g] = s.count; rads[g] = s.rad;
        salts[g * 2] = s.h1; salts[g * 2 + 1] = s.h2;   // finished hash values, see FS_GLASS
        mats[g] = s.mat; iors[g] = s.ior; glows[g] = s.glow;
        places[g * 4] = wldX; places[g * 4 + 1] = wldY; places[g * 4 + 2] = wldZ;
        places[g * 4 + 3] = Math.max(0.05, wldScale);
        capturePhase(gb);
      });
      gl.uniform1fv(P.u.uGbId, ids); gl.uniform1fv(P.u.uGbTime, times);
      gl.uniform2fv(P.u.uGbSalt, salts);
      gl.uniform1fv(P.u.uGbCount, counts); gl.uniform1fv(P.u.uGbRad, rads);
      gl.uniform1fv(P.u.uGbMat, mats); gl.uniform1fv(P.u.uGbIor, iors);
      gl.uniform1fv(P.u.uGbGlow, glows); gl.uniform4fv(P.u.uGbPlace, places);
    }
    gl.uniform1f(P.u.uSdOn, sd ? 1 : 0);
    gl.uniform1f(P.u.uSdId, sd ? plan.ids.get(sd) : 0);
    if (sd) {
      // installStackItem also points the body list at THIS layer's solids (installSolids),
      // so the arrays below are its own set and not whichever layer drew last.
      installStackItem(sd); installPhase(sd);
      const s = solidsSeed(dt);
      gl.uniform4fv(P.u.uSdPos, s.pos); gl.uniform4fv(P.u.uSdQuat, s.quat);
      gl.uniform1fv(P.u.uSdShape, s.shape);
      gl.uniform1f(P.u.uSdCount, s.count); gl.uniform1f(P.u.uSdRim, s.rim);
      gl.uniform4f(P.u.uSdPlace, wldX, wldY, wldZ, Math.max(0.05, wldScale));
      capturePhase(sd);
    }
    gl.uniform1f(P.u.uQjOn, qj ? 1 : 0);
    gl.uniform1f(P.u.uQjId, qj ? plan.ids.get(qj) : 0);
    if (qj) {
      installStackItem(qj); installPhase(qj);
      // BOTH seeds, and juliaSeed exactly once: the cardioid orbit that supplies c is the
      // same one Julia rides, and this is the layer's one advance for the frame now
      // that its own draw hook never runs.
      const seed = juliaSeed(dt), s = qjuliaSeed(dt);
      gl.uniform4f(P.u.uQjC, seed.cx, seed.cy, 0, 0);
      gl.uniform1f(P.u.uQjPhase, s.phase); gl.uniform1f(P.u.uQjSlice, s.slice);
      gl.uniform1f(P.u.uQjCut, s.cut); gl.uniform1f(P.u.uQjIter, s.iter);
      gl.uniform1f(P.u.uQjGlow, s.glow);
      gl.uniform3f(P.u.uQjRot, s.rx, s.ry, s.rz);
      gl.uniform4f(P.u.uQjPlace, wldX, wldY, wldZ, Math.max(0.05, wldScale));
      capturePhase(qj);
    }
    gl.uniform1f(P.u.uVbOn, vb ? 1 : 0);
    gl.uniform1f(P.u.uVbId, vb ? plan.ids.get(vb) : 0);
    if (vb) {
      installStackItem(vb); installPhase(vb);
      const s = vballsSeed(dt);
      gl.uniform1f(P.u.uVbPhase, s.phase); gl.uniform1f(P.u.uVbCount, s.count);
      gl.uniform1f(P.u.uVbShape, s.shape); gl.uniform1f(P.u.uVbRad, s.rad);
      gl.uniform1f(P.u.uVbGlow, s.glow);
      gl.uniform4f(P.u.uVbPlace, wldX, wldY, wldZ, Math.max(0.05, wldScale));
      capturePhase(vb);
    }
    drawQuad();
  }
  // One joined layer's share of the world, into glTex.layer — the same texture fx.draw()
  // would have written, so renderLayerHeat continues without knowing the difference.
  function glWorldPick(id) {
    bindFbo(glFbo.layer, fw, fh);
    gl.disable(gl.BLEND);
    const P = glProg.worldpick;
    gl.useProgram(P.p);
    bindTexUnit(0, glTex.world); gl.uniform1i(P.u.uSrc, 0);
    gl.uniform2f(P.u.uSize, fw, fh);
    gl.uniform1f(P.u.uId, id);
    drawQuad();
  }
  // ---- the handover crossfade -------------------------------------------------------
  // A joined layer has two possible pictures: its own draw (what shows while the world
  // program is still linking, or after it leaves the world) and its slice of the world. The
  // switch between them used to be a cut -- the last frame of one, the first of the other --
  // which read as a glitch exactly at the moment the feature turned on. `worldFade` holds a
  // 0..1 blend per layer that eases toward 1 while the layer is in a ready world and toward
  // 0 otherwise; while it is strictly between, BOTH pictures are rendered and mixed in heat
  // space. Transient, per layer object: it is not scene data and it follows the layer.
  const WORLD_FADE_S = 0.45;            // seconds, either direction
  function worldFadeStep(L, inWorld, dt) {
    const f = L.worldFade == null ? (inWorld ? 1 : 0) : L.worldFade;   // a fresh layer snaps
    const g = Math.max(0, Math.min(1, f + (inWorld ? dt : -dt) / WORLD_FADE_S));
    L.worldFade = g;
    return g;
  }
  // Blend the layer's own draw against its slice of the world, and RETURN the buffer it
  // landed in. The output is glTex.worldMix and not glTex.layer because glTex.layer is an
  // INPUT here (the pick landed there) — targeting it would be a feedback loop and the draw
  // would be dropped. Callers must use the returned texture, not glTex.layer.
  function glWorldMix(ownTex, t) {
    bindFbo(glFbo.worldMix, fw, fh);
    gl.disable(gl.BLEND);
    const P = glProg.worldmix;
    gl.useProgram(P.p);
    bindTexUnit(0, ownTex); gl.uniform1i(P.u.uA, 0);
    bindTexUnit(1, glTex.layer); gl.uniform1i(P.u.uB, 1);   // the pick already landed here
    gl.uniform1f(P.u.uT, t);
    drawQuad();
    return glTex.worldMix;
  }
  // Has this layer joined the shared world? Same selected -> stored -> descriptor fallback
  // as layerShowBox, and default FALSE so every scene saved before this renders unchanged.
  function layerWorld(L) {
    if (L === stack[stackSel]) return worldChk.checked;
    if (L.world != null) return !!L.world;
    const fx = extras[L.fx] || presetExtra(L.fx);
    return fx.world === true;
  }
  function renderStackColor(live, dt, now, ticks, base) {
    const b0 = base || 0;
    // THE WORLD IS TRACED ONCE, before any layer. It has to be: a joined layer's heat is a
    // slice of it, so it cannot be built while the layers are being walked. The owner --
    // the lowest joined layer -- is installed first, because its camera IS the world's.
    worldPlan = planWorld(live);
    if (worldPlan) {
      // Null while the program is still linking -- the joined layers then draw themselves
      // for a few frames instead of the tab freezing, and the world appears when it is ready.
      const P = worldProgFor(worldPlan);
      if (!P || !P.p) worldPlan = null;
      else {
        const owner = worldPlan.ids.keys().next().value;
        installStackItem(owner); installPhase(owner);
        glWorldDraw(worldPlan, dt, P);
      }
    }
    // Stale until something captures this frame. If there is no joined glass, or it is the
    // bottom layer with nothing beneath it, last frame's picture must not be reused.
    worldBelowOk = false;
    let acc = 0;
    bindFbo(glFbo.color[0], fw, fh);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);   // empty accumulator
    for (let li = 0; li < live.length; li++) {
      // SLOT IS THE LAYER'S POSITION IN ITS STACK, NOT ITS POSITION AMONG THE LIVE ONES.
      // heatL/layerCur/layerPal are persistent per-slot state — retained heat and a palette
      // morph clock — so numbering by live index hands them to a different layer the moment
      // one is muted: mute the top of [A,B,C,D] and B inherits A's trails and A's palette
      // clock. It also disagreed with frame-loop's single-layer path, which has always used
      // stack.indexOf. The `base` argument exists because indexOf is -1 for a DETACHED item,
      // so resolve against the array this call is actually walking.
      const L = live[li], fx = EFFECTS[L.fx];
      // b0, NOT the `base` parameter: the ramp const below used to be called `base` too, so
      // naming the parameter here read it in its own temporal dead zone and threw on every
      // frame of a world join. b0 is `base || 0` captured above the loop and says the same
      // thing (0 live, STACK_MAX outgoing). The shadow itself is gone now — see `ramp`.
      const home = b0 ? prevStack : stack;
      const at = home ? home.indexOf(L) : -1;
      const slot = b0 + (at >= 0 ? at : li);
      // What is underneath THIS layer, for the effects that reflect it. Set before the heat
      // render because that is when the effect's draw() runs; the accumulator is not written
      // again until glOkMerge below, so it is safe to sample.
      glBelowTex = li > 0 ? glTex.color[acc] : null;
      // The lowest joined glass layer is the one whose 'below' the whole world reflects; gbs[0]
      // is undefined when nothing is joined, which no layer can equal.
      if (glBelowTex && worldPlan && L === worldPlan.gbs[0]) captureWorldBelow(acc);
      const heatTex = renderLayerHeat(L, slot, fx, dt, now, ticks);   // installs L's params (feedback used them)
      // `ramp`, not `base` — it shadowed this function's own `base` parameter, which made
      // any reference to the parameter inside this loop a TDZ throw rather than a wrong
      // value. That is not hypothetical: it cost a frame-by-frame crash on world join.
      const ramp = stepLayerPal(slot, layerPalIndex(L), now, L);
      bakeLayerBytes(ramp, now, palScratch, layerPalRev(L), layerPalBg(L));
      gl.bindTexture(gl.TEXTURE_2D, glTex.palL[slot]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, palScratch);
      const colTex = glLayerPostChain(L, glColorizeLayer(heatTex, glTex.palL[slot]));
      // An effect that ships an OVER blend may also say how solid it is RIGHT NOW -- Glass
      // ball's answer depends on its Material slider. installStackItem(L) has already put
      // this layer's globals live, so the descriptor is asked about the layer being drawn.
      const fxc = EFFECTS[L.fx].cover;
      glOkMerge(colTex, L.blend, L.gain, glTex.color[acc], glFbo.color[1 - acc],
                fxc ? fxc() : 1);
      acc = 1 - acc;
    }
    glBelowTex = null;                 // only ever live inside the loop above
    glColorTex = glTex.color[acc];
  }
  // THE OUTGOING SCENE KEEPS RUNNING. A transition used to blend against one frozen frame
  // (transBegin copied glTex.scene → glTex.prev and that was the whole outgoing side), so
  // half of every switch was a still. It is rendered for real now, into glTex.prev, once
  // per frame while the transition lasts.
  //
  // Three things make this cheap rather than a second engine. A FROZEN stack item is
  // already a complete, self-contained scene — its own state, filters, palette, ranges,
  // anim and phase — so `prevStack` is just the array installStack replaced. This path
  // already renders an arbitrary list of layers, points and shaders alike. And running the
  // outgoing scene FIRST means the colour accumulator can be reused: by the time the live
  // scene wants glTex.color, the outgoing frame has been copied out.
  //
  // Known ceiling: reaction–diffusion is a deliberate singleton (glTex.rd), so an outgoing
  // RD scene shares the incoming one's dish for the length of the blend.
  function renderPrevScene(dt, now, ticks) {
    const plive = prevStack.filter(L => !L.mute);
    if (!plive.length) return;
    renderStackColor(plive, dt, now, ticks, STACK_MAX);
    bindFbo(glFbo.prev, fw, fh);
    gl.disable(gl.BLEND);
    gl.useProgram(glProg.zoom.p);
    bindTexUnit(0, glColorTex); gl.uniform1i(glProg.zoom.u.uSrc, 0);
    gl.uniform1f(glProg.zoom.u.uZoom, 1);
    drawQuad();
    glColorTex = null;              // the live pass below decides its own
  }
  function glJulia(s) { glShaderDraw("julia", u => { gl.uniform2f(u.uC, s.cx, s.cy); gl.uniform2f(u.uSpan, s.spanX, s.spanY); }); }
  function glPlasma(s) { glShaderDraw("plasma", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uScale, s.scale); gl.uniform1f(u.uWarp, s.warp); gl.uniform1f(u.uZoom, s.zoom); }); }

  // display: heat→palette, optional zoom, blurred additive glow, to the screen
  // Run the ticked post filters over the palette-mapped image and return whatever
  // texture holds the result. An empty chain returns glTex.native untouched — it
  // must NOT run a pass-through copy, since an extra RGBA8 sample through a
  // nominally identity pass can shift values by a LSB and show as a brightness change.
  function glPostChain(src0) {
    const start = src0 || glTex.native;
    const chain = splitChain(activeFilters().map(f => f.id)).image;
    if (!chain.length) return start;
    let src = start, slot = 0;
    for (const f of chain) {
      bindFbo(glFbo.post[slot], fw, fh);
      f.gl(src);
      src = glTex.post[slot];
      slot = 1 - slot;
    }
    return src;
  }
  // One post pass: bind the program, feed it the source texture, draw.
  // Bloom as an ordinary chain pass. It WAS the whole-scene composite — blur the finished
  // frame twice, add the blur back over it — with its strength as a uniform, which is exactly
  // why it had no `gl` hook and could not be per-layer. Now it is a pass like any other: it
  // sits in a layer's chain, it can be dragged, and each layer glows on its own before the
  // layers blend. For a single layer that is the same image the composite made; for a stack it
  // is better, since a bright layer no longer smears the ones above it.
  //
  // It borrows glFbo.blur1/blur2 — free now that nothing composites a scene-wide glow — and
  // rebinds the caller's target before the final draw, since the two blurs bind their own.
  function glBloomPass(src) {
    const dst = curFbo, dw = curW, dh = curH;    // the chain's target, to come back to
    bindFbo(glFbo.blur1, fw, fh);
    gl.useProgram(glProg.blur.p);
    bindTexUnit(0, src); gl.uniform1i(glProg.blur.u.uSrc, 0);
    gl.uniform2f(glProg.blur.u.uDir, 1 / fw, 0);
    drawQuad();
    bindFbo(glFbo.blur2, fw, fh);
    bindTexUnit(0, glTex.blur1); gl.uniform1i(glProg.blur.u.uSrc, 0);
    gl.uniform2f(glProg.blur.u.uDir, 0, 1 / fh);
    drawQuad();
    if (dst) bindFbo(dst, dw, dh); else bindDefault(dw, dh);
    gl.useProgram(glProg.comp.p);
    bindTexUnit(0, src); gl.uniform1i(glProg.comp.u.uScene, 0);
    bindTexUnit(1, glTex.blur2); gl.uniform1i(glProg.comp.u.uGlow, 1);
    // bloomRaw, NOT bloomAmt: this pass only runs when the DRAWING layer's own chain holds
    // Bloom, so it needs the slider, not the slider gated by whichever layer is selected.
    gl.uniform1f(glProg.comp.u.uBloom, bloomRaw);
    gl.uniform1f(glProg.comp.u.uFlip, 0);       // MID-CHAIN: the present below owns the one flip
    drawQuad();
  }
  // Reaction–diffusion driver: seed the dish on demand, then K Gray–Scott steps
  // ping-ponging the rd pair. Runs entirely OUTSIDE the heat machinery (its own
  // textures); the effect's draw calls this and then samples glTex.rd[rdCur] in the
  // rdshow pass. `rdCur` always names the freshest buffer.
  //
  // THE DEATH CHECK: plenty of legal Feed/Kill settings genuinely kill the culture —
  // V hits 0 everywhere, and with uvv = 0 nothing can ever grow again, so a beat-jumped
  // Feed would leave a permanently black effect. Every ~120 frames a handful of pixels
  // are read back (in the buffer's own type — FLOAT reads on an RGBA16F target); if
  // every sample is dead, the dish re-seeds. One tiny readback every couple of seconds,
  // and only while the effect is actually drawing.
  // `rdIsFloat` is a var: initGL runs during an early slice, before this file's lets
  // initialise, so a let here would be in its TDZ at assignment time.
  let rdCur = 0, rdCheck = 0;
  function glRDTick(steps, feed, kill) {
    if (rdNeedSeed) {
      rdNeedSeed = false;
      rdSalt = (rdSalt + 1.7) % 100;     // a fresh scatter each (re)seed
      bindFbo(glFbo.rd[0], fw, fh);
      gl.useProgram(glProg.rdseed.p);
      gl.uniform2f(glProg.rdseed.u.uSize, fw, fh);
      gl.uniform1f(glProg.rdseed.u.uSalt, rdSalt);
      drawQuad();
      rdCur = 0;
    }
    for (let k = 0; k < steps; k++) {
      const dst = 1 - rdCur;
      bindFbo(glFbo.rd[dst], fw, fh);    // never sample the render target
      gl.useProgram(glProg.rdstep.p);
      bindTexUnit(0, glTex.rd[rdCur]); gl.uniform1i(glProg.rdstep.u.uPrev, 0);
      gl.uniform2f(glProg.rdstep.u.uSize, fw, fh);
      gl.uniform1f(glProg.rdstep.u.uFeed, feed);
      gl.uniform1f(glProg.rdstep.u.uKill, kill);
      drawQuad();
      rdCur = dst;
    }
    rdCheck = (rdCheck + 1) % 120;
    if (rdCheck === 0) {
      bindFbo(glFbo.rd[rdCur], fw, fh);
      let dead = true;
      if (rdIsFloat) {
        const p = new Float32Array(4);
        for (let k = 0; k < 8 && dead; k++) {
          gl.readPixels(((k * 2 + 1) * fw) >> 4, ((k * 2 + 1) * fh) >> 4, 1, 1, gl.RGBA, gl.FLOAT, p);
          if (p[1] > 0.01) dead = false;
        }
      } else {
        const p = new Uint8Array(4);
        for (let k = 0; k < 8 && dead; k++) {
          gl.readPixels(((k * 2 + 1) * fw) >> 4, ((k * 2 + 1) * fh) >> 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
          if (p[1] > 2) dead = false;
        }
      }
      if (dead) rdNeedSeed = true;
    }
  }
  // ---- THE ASCII MOSAIC'S GLYPH SETS ---------------------------------------------------
  // Each set names UNICODE RANGES rather than a hand-picked ramp. The ramp is not authored at
  // all: the atlas builder renders every candidate, MEASURES its ink coverage and sorts them,
  // so a set only has to be a big spread of shapes from one script and the measurement turns
  // it into a dither. That is why these are whole alphabets -- the more glyphs, the finer the
  // brightness steps, and 255 of them gives roughly one glyph per level of an 8-bit ramp
  // against the seven the filter shipped with.
  //
  // They are alphabets and not CHARACTER SETS: what goes in is what a person writes words
  // with, so no symbol blocks, no maths signs, no archaic or liturgical scripts, no diacritic
  // marks on their own. Two reasons, and the second is the load-bearing one. The look is meant
  // to be writing. And symbols are systematically HEAVIER than letters, so after the coverage
  // sort they take the whole bright end of the ramp -- the brightest, most-looked-at part of
  // the picture ends up being the part that is not writing at all.
  //
  // Ranges are deliberately WIDER than the cap. Overflow is sampled evenly across the set
  // (see pickChars), never truncated, so a set keeps its full range of shapes -- truncating
  // Braille at 255 would drop only one pattern, but truncating Blocks would drop every
  // box-drawing character and leave just the shade squares.
  function chRange(a, b) { let s = ""; for (let c = a; c <= b; c++) s += String.fromCodePoint(c); return s; }
  const ASCII_SETS = [
    // Letters, digits and the punctuation that appears inside running text. Deliberately NOT
    // all of printable ASCII: @ # $ % & * < > { } | \ and friends are the heaviest glyphs in
    // the range, so they used to occupy the whole bright end of the ramp and the picture read
    // as symbols rather than as writing. The accented letters are the rest of Latin-1 minus
    // its two maths signs -- they are letters people write words with, and their extra ink is
    // useful gradation between the plain forms.
    { name: "Latin", chars: () => chRange(0x41, 0x5a) + chRange(0x61, 0x7a) + chRange(0x30, 0x39)
        + ".,;:!?()-" + "\u0027\u0022" + chRange(0xc0, 0xd6) + chRange(0xd8, 0xf6) + chRange(0xf8, 0xff) },
    // Arabic-Indic digits, the letters, and Presentation Forms-B: the initial, medial, final
    // and isolated shapes each letter takes inside a word, which is what Arabic writing
    // actually looks like on the page. The FE70..FE7F block above them is NOT included -- those
    // are the vowel marks, which are diacritics rather than letters and are usually left out of
    // ordinary text anyway.
    { name: "Arabic", chars: () => chRange(0x660, 0x669) + chRange(0x621, 0x63a) + chRange(0x641, 0x64a) + chRange(0xfe80, 0xfefc) },
    // Mkhedruli, the everyday Georgian script, and Mtavruli, its capitals. The Asomtavruli and
    // Nuskhuri cases were dropped: they are liturgical scripts, read in old manuscripts rather
    // than written in texts.
    { name: "Georgian", chars: () => chRange(0x10d0, 0x10fa) + chRange(0x1c90, 0x1cba) },
    // Both kana in full plus everyday kanji, ordered roughly by stroke count -- which is a
    // density ramp in its own right before anything is measured.
    { name: "Japanese", chars: () => chRange(0x3041, 0x3096) + chRange(0x30a1, 0x30fa)
        + "\u3042\u3044\u3046\u4e00\u4e8c\u4e09\u5341\u4eba\u516b\u5165\u4e01\u4e03\u4e5d\u5c0f\u53e3\u5c71\u5ddd\u5343\u5927\u5929\u65e5\u6708\u76ee\u7530\u672c\u7533\u7531\u77f3\u82b1\u9752\u661f\u6625\u98a8\u6d77\u96ea\u9ce5\u9b5a\u9ed2\u7dd1\u8449\u96fb\u96e8\u9f8d\u68ee\u85ac\u9451\u9e97" },
    // The living Cyrillic alphabets -- Russian, plus the letters Ukrainian, Serbian and
    // Macedonian add. The 0460..0481 block that used to follow is Old Church Slavonic: real
    // letters, but nobody writes them now.
    { name: "Cyrillic", chars: () => chRange(0x400, 0x45f) },
    // Modern Greek, accented vowels included. The polytonic blocks were dropped for the same
    // reason as the Georgian ones -- they are how ancient Greek is printed, not how Greek is
    // written today.
    { name: "Greek", chars: () => chRange(0x386, 0x3ce) },
    // The 64 six-dot cells, which is the whole of written Braille: every letter, digit and
    // punctuation mark is one of these. The 8-dot patterns above them exist for representing
    // computer characters, not for writing words.
    { name: "Braille", chars: () => chRange(0x2800, 0x283f) },
    // Every script at once. It reads the entries above rather than repeating their ranges, so
    // a script added to this list joins the mix for nothing. The even sampling in pickChars
    // then takes a proportional slice of each -- concatenating gives thousands of candidates
    // and the cap keeps 255 of them, spread across all seven rather than the first two.
    { name: "Mixed", chars: () => ASCII_SETS.slice(0, 7).map(s => s.chars()).join("") },
  ];
  // Which script is loaded into glTex.ascii right now, so a frame with the same script pays
  // nothing. -1 forces a rebuild (startup, and a font that may have arrived late).
  let asciiAtlasSet = -1, asciiAtlasN = 1;
  // (first glyph, how many) per brightness level, packed for uBucket. Must match ASC_LEVELS.
  const ASCII_LEVELS = 64;
  const asciiBuckets = new Float32Array(ASCII_LEVELS * 2);
  const ASCII_GLYPH_PX = 32;                  // atlas cell size; sampled LINEAR so any Cell fits
  const ASCII_MAX_GLYPHS = 255;               // one glyph per level of an 8-bit brightness ramp
  // A codepoint no font has, rendered alongside the real ones so its coverage can be compared
  // against. Unassigned in plane 2, so a font claiming it would be the bug.
  const ASCII_TOFU = String.fromCodePoint(0x2ffff);
  // Dedupe, then fit to the cap by sampling EVENLY across the set rather than cutting its tail.
  function pickChars(str, cap) {
    const all = [...new Set([...str])].filter(c => c !== " ");
    if (all.length <= cap) return all;
    const out = [];
    for (let i = 0; i < cap; i++) out.push(all[Math.floor(i * all.length / cap)]);
    return out;
  }
  function buildAsciiAtlas(setIdx) {
    const set = ASCII_SETS[setIdx] || ASCII_SETS[0];
    const G = ASCII_GLYPH_PX;
    // The strip is one texture row of cells, so its WIDTH is what the GPU has to accept.
    // A machine at the WebGL2 minimum of 2048 gets 64 glyphs rather than a failed upload --
    // still an order of magnitude more than the seven this filter shipped with.
    const cap = Math.max(8, Math.min(ASCII_MAX_GLYPHS, Math.floor(gl.getParameter(gl.MAX_TEXTURE_SIZE) / G)));
    const chars = pickChars(set.chars(), cap);
    const font = Math.round(G * 0.82) + "px 'Segoe UI', 'Noto Sans', 'Noto Sans Arabic', 'Noto Sans Georgian', 'Noto Sans Symbols2', 'Yu Gothic', 'Meiryo', sans-serif";
    // Pass 1: draw every candidate plus the tofu reference, and measure ink coverage.
    const cv = document.createElement("canvas");
    cv.width = G * (chars.length + 1); cv.height = G;
    const c = cv.getContext("2d", { willReadFrequently: true });
    c.fillStyle = "#000"; c.fillRect(0, 0, cv.width, G);
    c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = font;
    chars.forEach((ch, i) => c.fillText(ch, i * G + G / 2, G / 2 + G * 0.04));
    c.fillText(ASCII_TOFU, chars.length * G + G / 2, G / 2 + G * 0.04);
    const img = c.getImageData(0, 0, cv.width, G).data;
    const covOf = i => {
      let s = 0;
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) s += img[((y * cv.width) + i * G + x) * 4];
      return s / (G * G * 255);
    };
    const cov = chars.map((_, i) => covOf(i)), tofuCov = covOf(chars.length);
    // PER-GLYPH tofu rejection, not a whole-set check. A font covering only part of a script
    // renders the rest as one identical box, and those boxes would sit in the ramp as a run of
    // the same heavy blob -- worse than the missing glyphs, because they all measure the same.
    // A glyph whose coverage is EXACTLY the missing-character box's is that box.
    const keep = chars.map((_, i) => i).filter(i => cov[i] > 1e-6 && Math.abs(cov[i] - tofuCov) > 1e-9);
    // Too few usable glyphs (a font with no Georgian / no Arabic / no Japanese) -- fall back to
    // Latin. RECORD THE SET THE USER PICKED, not the one that was built: ensureAsciiAtlas compares
    // asciiAtlasSet against `want`, so stamping 0 here left the two permanently unequal and the
    // whole atlas -- two canvases, ~255 fillText calls, two getImageData reads over an 8160x32
    // buffer, a sort and a texture upload -- was rebuilt on EVERY FRAME, for as long as the filter
    // was on. It reads as the machine falling over, with nothing in the UI to explain it.
    if (keep.length < 8) {
      if (setIdx === 0) return buildAsciiAtlas0(chars, cov, chars.map((_, i) => i), font, G, cv);
      const r = buildAsciiAtlas(0);
      asciiAtlasSet = setIdx;
      return r;
    }
    keep.sort((a, b) => cov[a] - cov[b]);
    return buildAsciiAtlas0(chars, cov, keep, font, G, cv, setIdx);
  }
  // Pass 2: the sorted strip. Cells are COPIED from the measurement canvas rather than
  // re-rendered, so the pixels the ramp was measured from are exactly the pixels uploaded.
  // Cell 0 is left blank: the darkest cells need a guaranteed-empty glyph or shadows fill in.
  function buildAsciiAtlas0(chars, cov, keep, font, G, srcCv, setIdx) {
    const n = keep.length + 1;
    const out = document.createElement("canvas");
    out.width = G * n; out.height = G;
    const oc = out.getContext("2d", { willReadFrequently: true });
    oc.fillStyle = "#000"; oc.fillRect(0, 0, out.width, G);
    keep.forEach((src, i) => oc.drawImage(srcCv, src * G, 0, G, G, (i + 1) * G, 0, G, G));
    // GROUP THE RAMP INTO LEVELS. keep is sorted by coverage, so every character of a given
    // weight is a contiguous run -- one scan gives each level its (start, count). Cell 0 is
    // the blank and carries coverage 0, so it is the whole of the darkest level.
    // A level no character happens to land in inherits the nearest one below it (or the first
    // non-empty above, for a run of empties at the dark end); a zero count would render
    // glyph 0 everywhere and punch black holes through the midtones.
    const hi = keep.length ? cov[keep[keep.length - 1]] : 1;
    const lvlOf = v => Math.max(0, Math.min(ASCII_LEVELS - 1, Math.floor((hi > 1e-6 ? v / hi : 0) * ASCII_LEVELS)));
    asciiBuckets.fill(0);
    asciiBuckets[0] = 0; asciiBuckets[1] = 1;            // darkest level: the blank cell
    keep.forEach((src, i) => {
      const b = lvlOf(cov[src]) * 2;
      if (asciiBuckets[b + 1] === 0) asciiBuckets[b] = i + 1;
      asciiBuckets[b + 1]++;
    });
    for (let b = 1; b < ASCII_LEVELS; b++) {
      if (asciiBuckets[b * 2 + 1] === 0) { asciiBuckets[b * 2] = asciiBuckets[(b - 1) * 2]; asciiBuckets[b * 2 + 1] = asciiBuckets[(b - 1) * 2 + 1]; }
    }
    const px = oc.getImageData(0, 0, out.width, G).data;
    const red = new Uint8Array(out.width * G);
    for (let i = 0; i < red.length; i++) red[i] = px[i * 4];
    gl.bindTexture(gl.TEXTURE_2D, glTex.ascii);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, out.width, G, 0, gl.RED, gl.UNSIGNED_BYTE, red);
    asciiAtlasSet = setIdx === undefined ? 0 : setIdx; asciiAtlasN = n;
  }
  function ensureAsciiAtlas() {
    const want = Math.max(0, Math.min(ASCII_SETS.length - 1, Math.round(ascSet)));
    if (asciiAtlasSet !== want) buildAsciiAtlas(want);
  }
  function postPass(name, src, setU) {
    const P = glProg[name];
    gl.useProgram(P.p);
    bindTexUnit(0, src); gl.uniform1i(P.u.uSrc, 0);
    if (P.u.uSize) gl.uniform2f(P.u.uSize, fw, fh);
    if (setU) setU(P.u);
    drawQuad();
  }
  function glRender() {
    // A) heat → palette colour (native fire resolution). A multi-layer stack has
    // already coloured and OKLab-blended its layers into glColorTex (each with its own
    // palette), so skip the single shared-palette map and start the chain from it.
    let colorSrc;
    if (glColorTex) {
      colorSrc = glColorTex;
    } else {
      bindFbo(glFbo.native, fw, fh);
      gl.disable(gl.BLEND);
      gl.useProgram(glProg.pal.p);
      bindTexUnit(0, glTex.heat[curHeat]); gl.uniform1i(glProg.pal.u.uHeat, 0);
      bindTexUnit(1, glTex.pal); gl.uniform1i(glProg.pal.u.uPal, 1);
      gl.uniform1f(glProg.pal.u.uCurve, heatBoost);   // single-layer path: the selected layer's Heat boost
      drawQuad();
      colorSrc = glTex.native;
    }
    // A2) the post-FX chain, in registry order, ping-ponging between post[0]/[1]. A
    // multi-layer stack has already run each layer's post filters on that layer (see
    // renderStackColor), so skip the composite-level pass — only the whole-scene screen
    // filters (step F) and the glow still apply to the blended image.
    const postSrc = glColorTex ? colorSrc : glPostChain(colorSrc);
    // B) zoom about centre (Julia & Plasma bake their own optical zoom ⇒ display zoom = 1)
    const z = stackZoom();
    // While a transition runs, zoom lands in a scratch buffer and the transition pass
    // below produces glTex.scene instead — so the blend happens BEFORE the glow, and
    // the bloom follows the blend rather than a frozen glow fighting a live one.
    const tActive = transActive();
    // WHICH post slot the zoom lands in has to depend on where the chain ENDED. glPostChain
    // ping-pongs post[0]/post[1] and returns whichever it wrote last, so an ODD number of image
    // filters leaves the result in post[0] -- and Bloom alone is odd, which is what DEFAULT_SCENE
    // ships. Binding glFbo.post[0] while postSrc IS glTex.post[0] samples the draw's own colour
    // attachment: a WebGL2 feedback loop, INVALID_OPERATION, and the draw is SILENTLY DROPPED.
    // The zoom then did nothing for the whole blend -- the incoming scene drew at zoom 1 whatever
    // its slider said and popped to the right size the frame the transition ended.
    const tSlot = postSrc === glTex.post[0] ? 1 : 0;
    bindFbo(tActive ? glFbo.post[tSlot] : glFbo.scene, fw, fh);
    gl.useProgram(glProg.zoom.p);
    bindTexUnit(0, postSrc); gl.uniform1i(glProg.zoom.u.uSrc, 0);
    gl.uniform1f(glProg.zoom.u.uZoom, z);
    drawQuad();
    if (tActive) {                    // B2) blend the frozen outgoing frame with this one
      bindFbo(glFbo.scene, fw, fh);
      gl.useProgram(glProg.trans.p);
      bindTexUnit(0, glTex.post[tSlot]); gl.uniform1i(glProg.trans.u.uNew, 0);
      bindTexUnit(1, glTex.prev); gl.uniform1i(glProg.trans.u.uPrev, 1);
      gl.uniform1f(glProg.trans.u.uT, trans.t);
      gl.uniform1i(glProg.trans.u.uMode, trans.mode);
      gl.uniform2f(glProg.trans.u.uSize, fw, fh);
      drawQuad();
    }
    // C) to the screen. The whole-scene glow and the display-resolution screen chain that
    // used to live here are gone: Bloom is a per-layer chain pass now (glBloomPass) and the
    // four screen filters are ordinary per-layer image passes, so by this point every filter
    // has already run on the layer it belongs to.
    //
    // This is still FS_COMP rather than a plain blit, with uBloom pinned to 0 — it is the
    // same single pass that has always carried the frame to the default framebuffer, so the
    // output is byte-identical to what a bloom-off scene produced before. The glow texture is
    // bound but multiplied by 0, which is why the two blur passes can be skipped outright
    // instead of being run to fill a buffer nothing reads.
    bindDefault(canvas.width, canvas.height);
    // CLEAR THE BACK BUFFER BEFORE THE PRESENT, EVERY FRAME. This is the fix for a ghost
    // that took a day to pin down and could not be reproduced on any headless run: a
    // second copy of the Glass ball, the same animation but far behind, with the ORIGINAL
    // vanishing whenever the ghost showed -- so the two alternated. It appeared on reload
    // and on reordering layers, and cleared for a while and came back.
    //
    // It was never in the frame the app produced. Every uniform, the clock and the salt
    // were logged frame by frame in real Chrome on the reporter's 4090 and are
    // single-valued; a screen recording did not capture it; and the decisive test was
    // switching Chrome's ANGLE backend to D3D11 WARP (software rendering, identical WebGL
    // code): the ghost was GONE. So it is the NVIDIA D3D11 driver's presentation path, on a
    // G-Sync panel at 175Hz, re-presenting a STALE swapchain buffer in place of the live
    // one -- an old frame of the same animation, shown instead of the new one.
    //
    // preserveDrawingBuffer:false tells the browser the buffer's contents are undefined
    // after a present, which is what permits that reuse to show anything at all. This
    // pass draws a full-screen quad, so in principle it overwrites every pixel -- but the
    // driver does not know that, and a stale buffer handed back at the wrong moment can be
    // presented before the overwrite lands. An explicit clear pins the buffer to a known
    // state at the top of every present, which is the one thing a stale re-present cannot
    // survive. It costs one fill of the default framebuffer per frame: measured against the
    // ~4 ms of idle this frame has, it is nothing.
    //
    // Do NOT "fix" this by setting preserveDrawingBuffer:true instead: that forces the
    // browser to copy the buffer every frame on every machine to keep it readable, which is
    // a permanent tax paid to solve a problem one driver has.
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(glProg.comp.p);
    bindTexUnit(0, glTex.scene); gl.uniform1i(glProg.comp.u.uScene, 0);
    bindTexUnit(1, glTex.blur2); gl.uniform1i(glProg.comp.u.uGlow, 1);
    gl.uniform1f(glProg.comp.u.uBloom, 0);
    gl.uniform1f(glProg.comp.u.uFlip, 1);       // THE PRESENT: heat-buffer row 0 to the screen top
    drawQuad();
    // A FENCE BEFORE THE PRESENT. The clear above was not enough on its own: the ghost
    // survived v1.55.4 on the reporter's machine. A stale re-present is an ORDERING failure
    // -- the compositor takes the buffer before the GPU has finished writing this frame
    // into it, and shows whatever it held last. gl.finish() blocks until every queued
    // command has completed, so by the time this function returns and the browser presents,
    // the buffer provably holds THIS frame and nothing older.
    //
    // It is a real cost: the CPU stalls for the GPU's remaining work each frame, which
    // forfeits the pipelining that lets the two overlap. Measured on the dev 4090 the whole
    // frame is ~4 ms of a 16.7 ms budget, so there is room, but this is the heavier hammer
    // and it was reached for only after the lighter one failed on the one machine that shows
    // the fault. If it turns out not to be needed, the clear stays and this goes.
    gl.finish();
  }
  // The screen stage is EMPTY (Barrel, Scanlines, Vignette, Film grain and Bloom are all
  // per-layer `post` passes now), so its helper `screenPass` and its two display-resolution
  // RGBA8 buffers (glTex.screen / glFbo.screen) are gone with it — the buffers were the
  // largest allocation in the file, ~29MB at 1440p and ~66MB at 4K, reallocated on every
  // resize event, and nothing had sampled them since the stage emptied. The seam that is
  // deliberately kept is SCENE_FILTER_IDS/KEYS, which is a WIRE-format seam, not this.

  // ---- WebGL context loss: pause GL work, rebuild on restore ----
  if (useGL) {
    canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); glReady = false; }, false);
    canvas.addEventListener("webglcontextrestored", () => {
      // initGL rebuilds every program, texture, FBO, VAO and VBO -- but two caches live OUT here
      // and would survive with handles belonging to the dead context. Both are guarded by an
      // equality test, so a stale value means the rebuild is SKIPPED rather than redone:
      //   ribDepthW/H still match fw/fh  => the ribbon depth renderbuffer is never reallocated
      //     and an invalid object is attached, so glFbo.layer goes incomplete for that draw and
      //     Flying ribbons stops drawing while spewing GL errors every frame.
      //   asciiAtlasSet still matches ascSet => ensureAsciiAtlas no-ops and glTex.ascii stays the
      //     fresh 1x1 zero texture, so every ASCII cell renders as glyph 0 (black at ascmix 1).
      // Reset here rather than in initGL: these are `let`s in a LATER slice, so initGL -- called
      // from palette.js during startup -- would hit their temporal dead zone.
      ribDepthRb = null; ribDepthW = ribDepthH = 0;
      asciiAtlasSet = -1;
      try { initGL(); glResize(); glClearHeat(); paletteDirty = true; }   // re-upload palette to the fresh texture
      // Swallowing this leaves the canvas dark forever with no way to find out why.
      catch (err) { glReady = false; console.error("Kicktro: WebGL context restore failed", err); }
    }, false);
  }

  // Append one chaos-game stamp for the GPU (fire-pixel space, value 0..255).
  function pushPt(x, y, v) {
    const i = glPtCount * 3;
    if (i + 3 > glPts.length) { const n = new Float32Array(glPts.length * 2); n.set(glPts); glPts = n; }
    glPts[i] = x; glPts[i + 1] = y; glPts[i + 2] = v; glPtCount++;
  }
  // The heat every point-accumulation effect stamps. Deliberately below 255 — see
  // CONFIG.tuning.pointHeat for why (255 is the white tip of every palette, so it made
  // the palette look inert on the point effects, which now ship with no filters).
  const POINT_HEAT = CONFIG.tuning.pointHeat;
  // Plot a heat stamp: CPU writes the fire buffer (max), GPU collects a point.
  // (It briefly took a `raw` flag to let the credits skip the camera; they render on
  // their own layer now, so every caller wants the camera and the flag is gone.)
  // THE SCREEN MAPPING A STAMPED POINT GETS, factored out of plot() because Flying
  // ribbons needs exactly the same one for its geometry vertices. Zoom about the grid
  // centre, then the camera's 2x2, then the INVERSE lens on the screen offset -- the order
  // is load-bearing and the long comment inside plot() explains why. Returns false when the
  // point has no screen position at all (a long lens folds the far field away); writes
  // camMX/camMY rather than allocating, since this runs per vertex and per stamped point.
  let camMX = 0, camMY = 0;
  function camMapXY(x, y) {
    const z = zoom;
    if (z === 1 && !camOn()) { camMX = x; camMY = y; return true; }
    let dx = (x - fw * 0.5) * z, dy = (y - fh * 0.5) * z;
    if (camOn()) {
      const rx = camM[0] * dx + camM[1] * dy;
      dy = camM[2] * dx + camM[3] * dy;
      dx = rx;
    }
    if (camFov !== 0) {
      if (!camUnlens(dx, dy)) return false;
      dx = camUX; dy = camUY;
    }
    camMX = dx + fw * 0.5; camMY = dy + fh * 0.5;
    return true;
  }
  function plot(x, y, v, add) {
    // Zoom is applied HERE, to the point, not to the finished picture. FS_ZOOM magnifies
    // an fw×fh raster, so detail falls off as 1/zoom and the point effects went visibly
    // blocky — the 17 shader effects never had that because they divide their coordinates
    // by zoom and re-evaluate per pixel (`bakesOwnZoom`). A stamped point is mathematical
    // in exactly the same way, so scaling it before it lands is the same fix: the fractal
    // is rasterised ONCE, at full grid resolution, whatever the zoom. Points pushed off
    // the grid are dropped by the bounds test below, which is the crop a zoom should do.
    // Uniform scale commutes with the camera's 2×2, so the two compose in either order.
    // The zoom/camera/lens chain lives in camMapXY now — Flying ribbons needs the identical
    // mapping for its geometry, and two copies is how a stamped layer and a drawn one start
    // bowing differently at the same slider value. A point with no screen position (a long
    // lens folds the far field away) is dropped, like any out-of-grid point.
    if (!camMapXY(x, y)) return;
    const xi = camMX | 0, yi = camMY | 0;
    if (xi < 0 || xi >= fw || yi < 0 || yi >= fh) return;
    // `add` is the density mode Fractal flames stamps in: heat ACCUMULATES per hit
    // instead of taking the max, so where the orbit lands often burns brighter — the
    // log-density look, with the R8 clamp as the white-hot core. The GL half of the
    // same choice is the blit call sites passing "add" when the descriptor says
    // `stampAdd` (glBlitPoints already spoke FUNC_ADD for the layer blend).
    if (useGL) { pushPt(xi, yi, v); }
    else if (add) { const idx = yi * fw + xi; fire[idx] = Math.min(255, fire[idx] + v); }
    else { const idx = yi * fw + xi; if (v > fire[idx]) fire[idx] = v; }
  }

