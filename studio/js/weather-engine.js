/* ============================================================
   js/weather-engine.js — Weather particle engine for Doodle Studio
   Canvas 2D. Effects: rain, snow, fog, dust/fireflies, leaves.

   DESIGN NOTE (read before changing):
   - WeatherEngine.drawWeather(ctx, weather, t, W, H) is a PURE,
     DETERMINISTIC function of its arguments (seeded RNG, no state).
     Same (weather, t, W, H) => identical frame. This guarantees
     Studio preview === Playwright render === exported HTML player.
   - KEEP IN SYNC: the function must stay FULLY SELF-CONTAINED
     (the mulberry32 RNG is defined INSIDE its body, no outer refs)
     because:
       1. scripts/render-story.mjs inlines THIS FILE into the render page
          and calls WeatherEngine.drawWeather per frame seek.
       2. app.js exportHTML() inlines WeatherEngine.drawWeather
          via .toString() into the standalone player.
     If you add a helper it uses, define it inside drawWeather's body.
   ============================================================ */
(function (global) {
'use strict';

function clampI(v) {
  v = Math.round(+v || 0);
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

function WeatherEngine(canvas) {
  this.cv = canvas || null;
  this.ctx = canvas ? canvas.getContext('2d') : null;
  this.weather = { rain: 0, snow: 0, fog: 0, dust: 0, leaves: 0 };
}

WeatherEngine.prototype.setWeather = function (w) {
  w = w || {};
  this.weather = {
    rain:   clampI(w.rain),
    snow:   clampI(w.snow),
    fog:    clampI(w.fog),
    dust:   clampI(w.dust),
    leaves: clampI(w.leaves),
  };
};

WeatherEngine.prototype.hasActive = function () {
  var w = this.weather;
  return w.rain > 0 || w.snow > 0 || w.fog > 0 || w.dust > 0 || w.leaves > 0;
};

WeatherEngine.prototype.clear = function () {
  if (this.ctx && this.cv) this.ctx.clearRect(0, 0, this.cv.width, this.cv.height);
};

/* Draw weather at time t (seconds). Deterministic — same t => same frame. */
WeatherEngine.prototype.draw = function (t) {
  if (!this.ctx || !this.cv) return;
  var W = this.cv.width, H = this.cv.height;
  this.ctx.clearRect(0, 0, W, H);
  WeatherEngine.drawWeather(this.ctx, this.weather, t, W, H);
};

/* ------------------------------------------------------------------
   Deterministic weather renderer.
   *** SELF-CONTAINED: no references outside this function body. ***
   ------------------------------------------------------------------ */
WeatherEngine.drawWeather = function (ctx, weather, t, W, H) {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  var TAU = Math.PI * 2;
  var ri = Math.max(0, Math.min(100, Math.round((weather && weather.rain)   || 0)));
  var ni = Math.max(0, Math.min(100, Math.round((weather && weather.snow)   || 0)));
  var fi = Math.max(0, Math.min(100, Math.round((weather && weather.fog)    || 0)));
  var di = Math.max(0, Math.min(100, Math.round((weather && weather.dust)   || 0)));
  var li = Math.max(0, Math.min(100, Math.round((weather && weather.leaves) || 0)));
  var i, n, rng;
  var hs = H / 1080, ws = W / 1920;   // resolution scale factors

  /* ---- RAIN: slanted drops ---- */
  if (ri > 0) {
    n = Math.round(ri / 100 * 380);
    rng = mulberry32(918273);
    ctx.save();
    ctx.strokeStyle = 'rgba(174,194,224,0.55)';
    ctx.lineWidth = Math.max(1, W / 1280);
    ctx.lineCap = 'round';
    ctx.beginPath();
    var slant = -0.14; // dx per dy (wind)
    var spanY = H + 160;
    for (i = 0; i < n; i++) {
      var nx0 = rng() * 1.25 - 0.08;
      var spd = (900 + rng() * 700) * hs;
      var len = (10 + rng() * 16) * hs;
      var yy = ((rng() * spanY + spd * t) % spanY) - 80;
      var xx = nx0 * W + slant * yy;
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx - slant * len, yy - len);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ---- SNOW: drifting flakes ---- */
  if (ni > 0) {
    n = Math.round(ni / 100 * 200);
    rng = mulberry32(44551);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    var spanSY = H + 60;
    for (i = 0; i < n; i++) {
      var sx0 = rng();
      var sspd = (40 + rng() * 90) * hs;
      var samp = (15 + rng() * 45) * ws;
      var sfrq = 0.4 + rng() * 0.9;
      var sph = rng() * TAU;
      var sr = (1.5 + rng() * 3) * hs;
      var sy = ((rng() * spanSY + sspd * t) % spanSY) - 30;
      var sx = sx0 * W + Math.sin(t * sfrq + sph) * samp;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---- FOG: drifting translucent bands ---- */
  if (fi > 0) {
    rng = mulberry32(777001);
    ctx.save();
    for (var L = 0; L < 4; L++) {
      var fy = H * (0.42 + L * 0.17 + (rng() - 0.5) * 0.05);
      var fh = H * (0.10 + rng() * 0.08);
      var fspd = (12 + rng() * 22) * ws;
      var alpha = 0.04 + (fi / 100) * 0.16;
      for (var b = 0; b < 3; b++) {
        var span = W * 1.5;
        var dir = (b % 2 === 0) ? 1 : -1;
        var raw = (rng() * span + dir * fspd * t) % span;
        var fx = (raw + span) % span - W * 0.25;
        var fw = W * (0.35 + rng() * 0.25);
        var g = ctx.createLinearGradient(0, fy - fh, 0, fy + fh);
        var cs = 'rgba(205,205,215,' + alpha.toFixed(3) + ')';
        g.addColorStop(0, 'rgba(205,205,215,0)');
        g.addColorStop(0.5, cs);
        g.addColorStop(1, 'rgba(205,205,215,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(fx, fy, fw, fh, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ---- DUST / FIREFLIES: warm drifting glow (night scenes) ---- */
  if (di > 0) {
    n = Math.round(di / 100 * 55);
    rng = mulberry32(31337);
    ctx.save();
    for (i = 0; i < n; i++) {
      var dx0 = rng() * W, dy0 = rng() * H;
      var ax = (20 + rng() * 60) * ws, ay = (15 + rng() * 45) * hs;
      var f1 = 0.3 + rng() * 0.7, f2 = 0.3 + rng() * 0.7;
      var p1 = rng() * TAU, p2 = rng() * TAU, pp = rng() * TAU;
      var pf = 0.8 + rng() * 1.5;
      var dr = (1.6 + rng() * 1.6) * hs;
      var pulse = 0.35 + 0.65 * Math.abs(Math.sin(t * pf + pp));
      var dx = dx0 + Math.sin(t * f1 + p1) * ax;
      var dy = dy0 + Math.cos(t * f2 + p2) * ay;
      var a = (di / 100) * pulse;
      ctx.fillStyle = 'rgba(255,240,170,' + (a * 0.30).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(dx, dy, dr * 3.4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,246,200,' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(dx, dy, dr, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ---- LEAVES: tumbling autumn leaves ---- */
  if (li > 0) {
    n = Math.round(li / 100 * 55);
    rng = mulberry32(60606);
    ctx.save();
    var spanW = W + 120, spanH = H + 120;
    for (i = 0; i < n; i++) {
      var lx0 = rng(), ly0 = rng();
      var vx = (30 + rng() * 70) * ws;
      var vy = (60 + rng() * 130) * hs;
      var lph = rng() * TAU;
      var vr = (rng() - 0.5) * 6;
      var r0 = rng() * TAU;
      var lw = (5 + rng() * 6) * ws, lh = lw * 0.62;
      var hue = 16 + rng() * 24;
      var rawx = (lx0 * spanW + vx * t + Math.sin(t * 2 + lph) * 30) % spanW;
      var rawy = (ly0 * spanH + vy * t) % spanH;
      var lx = ((rawx + spanW) % spanW) - 60;
      var ly = ((rawy + spanH) % spanH) - 60;
      var rot = r0 + t * vr;
      var la = (0.35 + (li / 100) * 0.55).toFixed(2);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      ctx.fillStyle = 'hsla(' + hue.toFixed(0) + ',72%,44%,' + la + ')';
      ctx.beginPath();
      ctx.ellipse(0, 0, lw, lh, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
};

global.WeatherEngine = WeatherEngine;
})(typeof window !== 'undefined' ? window : globalThis);
