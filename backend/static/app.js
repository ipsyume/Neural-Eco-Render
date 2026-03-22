'use strict';

/* ═══════════════════════════════════════════════
   Neural Eco-Renderer — app.js v3 (clean minimal)
═══════════════════════════════════════════════ */

// ── State ──────────────────────────────────────
const S = {
  frame:       0,
  total:       1,
  playing:     true,
  eco:         true,
  lastTs:      0,
  fps:         18,
  fetching:    false,
  projMult:    1,
  lastEcoB64:  null,
  totalCarbon: 0,
  carbonHist:  [],
  chartProg:   0,
  hist: { fps:[], time:[], power:[], energy:[], co2:[] },
  prev: { fps:0, time:0, power:0, energy:0, co2:0 },
};

// ── DOM ────────────────────────────────────────
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── Toast ──────────────────────────────────────
function toast(msg, err = false, ms = 3000) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' t-err' : '');
  el.textContent = msg;
  $('toastArea').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ── Range slider track fill ────────────────────
function updateTrack(input) {
  const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--pct', pct + '%');
}
['samples','complexity'].forEach(id => {
  const el = $(id);
  updateTrack(el);
  el.addEventListener('input', () => updateTrack(el));
});

// ── Animate counter ───────────────────────────
function animNum(el, from, to, dec = 2, dur = 320) {
  const t0 = performance.now();
  const run = now => {
    const t = Math.min((now - t0) / dur, 1);
    const e = t < 0.5 ? 2*t*t : -1 + (4-2*t)*t;
    el.textContent = (from + (to - from) * e).toFixed(dec);
    if (t < 1) requestAnimationFrame(run);
    else {
      el.textContent = to.toFixed(dec);
      const card = el.closest('.metric-card');
      if (card) { card.classList.remove('flashing'); void card.offsetWidth; card.classList.add('flashing'); }
    }
  };
  requestAnimationFrame(run);
}

// ── Sparkline ─────────────────────────────────
function spark(canvasId, data, color = '#16a34a') {
  const c = $(canvasId);
  if (!c || data.length < 2) return;
  const dpr = devicePixelRatio || 1;
  const W   = c.offsetWidth  || 80;
  const H   = c.offsetHeight || 20;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const max = Math.max(...data, 0.001);
  const pts = data.map((v,i) => ({
    x: (i/(data.length-1)) * W,
    y: H - 2 - (v/max) * (H-4),
  }));

  // fill
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, color + '33');
  g.addColorStop(1, color + '00');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, H);
  ctx.lineTo(pts[0].x, pts[0].y);
  for (let i=1; i<pts.length; i++) {
    const cx = (pts[i-1].x+pts[i].x)/2;
    ctx.bezierCurveTo(cx,pts[i-1].y,cx,pts[i].y,pts[i].x,pts[i].y);
  }
  ctx.lineTo(pts.at(-1).x, H);
  ctx.closePath();
  ctx.fillStyle = g; ctx.fill();

  // line
  ctx.beginPath();
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i=1; i<pts.length; i++) {
    const cx = (pts[i-1].x+pts[i].x)/2;
    ctx.bezierCurveTo(cx,pts[i-1].y,cx,pts[i].y,pts[i].x,pts[i].y);
  }
  ctx.stroke();
}

function pushHist(k, v) { S.hist[k].push(v); if (S.hist[k].length>40) S.hist[k].shift(); }

// ── Donut ring ────────────────────────────────
function updateDonut(pct) {
  const circ = 150.8; // 2π×24
  $('donutArc').style.strokeDashoffset = circ - (Math.max(0,pct)/100) * circ;
  $('savedPct').textContent = pct.toFixed(1) + '%';
}

// ── Overlays ──────────────────────────────────
function applyOverlays(data) {
  const heat = $('heatmapImg'), edge = $('edgeImg'), err = $('errorImg');
  const confLegend = $('confLegend');

  if ($('heatmapToggle').checked && data.confidence) {
    colorizeHeat(data.confidence).then(url => {
      heat.src = url; heat.classList.remove('gone');
      confLegend.classList.remove('gone');
    });
  } else { heat.classList.add('gone'); confLegend.classList.add('gone'); }

  if ($('edgeToggle').checked && data.edges) {
    edge.src = 'data:image/png;base64,' + data.edges;
    edge.classList.remove('gone');
  } else { edge.classList.add('gone'); }

  if ($('errorToggle').checked && data.error) {
    err.src = 'data:image/png;base64,' + data.error;
    err.classList.remove('gone');
  } else { err.classList.add('gone'); }
}

// ── Heatmap colorizer ─────────────────────────
function colorizeHeat(b64) {
  return new Promise(res => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      const d  = id.data;
      for (let i=0; i<d.length; i+=4) {
        let v = d[i]/255;
        if (v<0.06) { d[i+3]=0; continue; }
        v = Math.pow(v, 1.25);
        // Red(low) → Amber → Green(high)
        d[i]   = v<0.5 ? 239 : Math.round(239 - (v-0.5)*2*239);
        d[i+1] = Math.round(v * 180);
        d[i+2] = v>0.5 ? Math.round((v-0.5)*2*80) : 0;
        d[i+3] = Math.round(120 + v*120);
      }
      ctx.putImageData(id, 0, 0);
      res(c.toDataURL());
    };
  });
}

// ── Sweep animation ───────────────────────────
function triggerSweep() {
  const sw = $('sweep');
  sw.classList.remove('gone');
  sw.style.animation = 'none';
  void sw.offsetWidth;
  sw.style.animation = '';
  setTimeout(() => sw.classList.add('gone'), 700);
}

// ── Frame fetch ───────────────────────────────
async function fetchFrame() {
  if (S.fetching) return;
  S.fetching = true;
  try {
    const r = await fetch(`/api/frames?index=${S.frame}`);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();

    S.total      = d.total_frames || 1;
    S.lastEcoB64 = d.eco;

    $('lowImg').src  = 'data:image/png;base64,' + d.low;
    $('ecoImg').src  = 'data:image/png;base64,' + d.eco;
    $('highImg').src = 'data:image/png;base64,' + d.high;

    triggerSweep();
    applyOverlays(d);

    if (d.quality) {
      const q = d.quality;
      $('psnrLow').textContent  = q.psnr_low.toFixed(1) + ' dB';
      $('ssimLow').textContent  = q.ssim_low.toFixed(3);
      $('psnrEco').textContent  = q.psnr_eco.toFixed(1) + ' dB';
      $('ssimEco').textContent  = q.ssim_eco.toFixed(3);
      const g = q.psnr_gain;
      $('psnrGain').textContent = (g>=0?'+':'') + g.toFixed(1) + ' dB';
      $('psnrGain').style.color = g>=0 ? 'var(--eco)' : 'var(--red)';
    }
    $('inferTag').textContent = d.infer_ms.toFixed(1) + ' ms';

    S.frame = (S.frame + 1) % S.total;
  } catch(e) {
    console.error('[frame]', e);
  } finally { S.fetching = false; }
}

// ── Metrics fetch ─────────────────────────────
let mDeb;
const scheduleMetrics = () => { clearTimeout(mDeb); mDeb = setTimeout(fetchMetrics, 130); };

async function fetchMetrics() {
  const spp  = Number($('samples').value);
  const comp = Number($('complexity').value);
  const body = { samples:spp, width:1024, height:1024, complexity:comp };
  try {
    const [tr, er] = await Promise.all([
      fetch('/api/metrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,use_eco:false})}),
      fetch('/api/metrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,use_eco:true})}),
    ]);
    const trad = await tr.json();
    const eco  = await er.json();
    const act  = S.eco ? eco : trad;

    // animated numbers
    animNum($('mFPS'),    S.prev.fps,    act.fps,           2);
    animNum($('mTime'),   S.prev.time,   act.render_time_ms,1);
    animNum($('mPower'),  S.prev.power,  act.power_w,       1);
    animNum($('mEnergy'), S.prev.energy, act.energy_j,      4);
    animNum($('mCO2'),    S.prev.co2,    act.co2_g,         6);
    S.prev = {fps:act.fps, time:act.render_time_ms, power:act.power_w, energy:act.energy_j, co2:act.co2_g};

    // sparklines (green for eco metrics, warm for traditional comparison)
    pushHist('fps',    act.fps);    spark('spkFPS',    S.hist.fps,    '#16a34a');
    pushHist('time',   act.render_time_ms); spark('spkTime',   S.hist.time,   '#2563eb');
    pushHist('power',  act.power_w); spark('spkPower',  S.hist.power,  '#b45309');
    pushHist('energy', act.energy_j); spark('spkEnergy', S.hist.energy, '#16a34a');
    pushHist('co2',    act.co2_g);  spark('spkCO2',    S.hist.co2,    '#dc2626');

    // energy bars
    const mx = Math.max(trad.energy_j, eco.energy_j, 0.0001);
    $('barTrad').style.width = (trad.energy_j/mx*100)+'%';
    $('barEco').style.width  = (eco.energy_j/mx*100)+'%';
    $('eTrad').textContent   = trad.energy_j.toFixed(4)+' J';
    $('eEco').textContent    = eco.energy_j.toFixed(4)+' J';

    const pct = ((trad.energy_j - eco.energy_j) / trad.energy_j) * 100;
    $('savingsNote').textContent = pct>0
      ? `Neural Eco saves ≈ ${pct.toFixed(1)}% energy`
      : 'No savings at current settings';
    updateDonut(Math.max(0, pct));

    // carbon
    const saved = trad.co2_g - eco.co2_g;
    if (S.eco && saved>0) S.totalCarbon += saved;
    $('totalCO2').textContent   = S.totalCarbon.toFixed(5);
    $('totalPhone').textContent = (S.totalCarbon/5.7).toFixed(3);
    $('totalYT').textContent    = ((S.totalCarbon/55)*60).toFixed(3);
    $('projCO2').textContent    = (S.totalCarbon*S.projMult).toFixed(4);

    S.carbonHist.push(S.totalCarbon);
    if (S.carbonHist.length>120) S.carbonHist.shift();
    S.chartProg = 0;
    drawCarbonChart();

  } catch(e) { console.error('[metrics]', e); }
}

// ── Carbon chart ──────────────────────────────
function drawCarbonChart() {
  const c = $('carbonChart');
  if (!c) return;
  const dpr  = devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  const W = rect.width||400, H = rect.height||120;
  c.width = W*dpr; c.height = H*dpr;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);

  // background
  ctx.fillStyle = '#F7F6F3'; ctx.fillRect(0,0,W,H);

  // grid lines
  ctx.strokeStyle = '#E4E3DF'; ctx.lineWidth = 1;
  for (let i=1; i<=3; i++) {
    const y = Math.round((i/4)*H)+0.5;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }

  const hist = S.carbonHist;
  if (hist.length < 2) return;

  const max = Math.max(...hist, 0.0001);
  const pad = 14;

  S.chartProg = Math.min(S.chartProg + 0.06, 1);
  const vis = Math.floor(hist.length * S.chartProg);
  if (vis < 2) { if(S.chartProg<1) requestAnimationFrame(drawCarbonChart); return; }

  const pts = hist.slice(0,vis).map((v,i) => ({
    x: (i/(hist.length-1)) * W,
    y: H - pad - (v/max) * (H - pad*2),
  }));
  const last = pts.at(-1);

  // fill
  const fill = ctx.createLinearGradient(0,pad,0,H);
  fill.addColorStop(0,'rgba(22,163,74,0.18)');
  fill.addColorStop(1,'rgba(22,163,74,0)');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, H);
  ctx.lineTo(pts[0].x, pts[0].y);
  for (let i=1; i<pts.length; i++) {
    const cx = (pts[i-1].x+pts[i].x)/2;
    ctx.bezierCurveTo(cx,pts[i-1].y,cx,pts[i].y,pts[i].x,pts[i].y);
  }
  ctx.lineTo(last.x,H); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();

  // line
  ctx.beginPath();
  ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 1.5;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i=1; i<pts.length; i++) {
    const cx = (pts[i-1].x+pts[i].x)/2;
    ctx.bezierCurveTo(cx,pts[i-1].y,cx,pts[i].y,pts[i].x,pts[i].y);
  }
  ctx.stroke();

  // dot
  ctx.beginPath(); ctx.arc(last.x,last.y,3.5,0,Math.PI*2);
  ctx.fillStyle = '#16a34a'; ctx.fill();

  // label
  ctx.font = '500 9px "JetBrains Mono",monospace';
  ctx.fillStyle = '#16a34a'; ctx.textAlign = 'left';
  ctx.fillText(`${hist[vis-1].toFixed(4)} g`, last.x+6, last.y-4);

  if (S.chartProg<1) requestAnimationFrame(drawCarbonChart);
}

// ── Health check ──────────────────────────────
async function checkHealth() {
  try {
    const d = await (await fetch('/api/health')).json();
    $('statusDot').classList.add('alive');
    $('statusText').textContent  = d.model_loaded ? 'Model ready' : 'Demo mode';
    $('deviceTag').textContent   = `${d.device.toUpperCase()} · ${(d.model_params/1e6).toFixed(2)}M params`;
    toast(`Connected · ${d.device.toUpperCase()} · ${(d.model_params/1e6).toFixed(2)}M parameters`);
  } catch {
    $('statusText').textContent = 'Offline';
    toast('Backend not reachable', true, 5000);
  }
}

// ── Scenes ────────────────────────────────────
async function loadScenes() {
  try {
    const d = await (await fetch('/api/scenes')).json();
    const sel = $('sceneSelect');
    sel.innerHTML = '';
    if (!d.scenes.length) { sel.innerHTML = '<option>No scenes</option>'; return; }
    d.scenes.forEach(s => {
      const o = document.createElement('option');
      o.value = s.index; o.textContent = s.name || `Scene ${s.index+1}`;
      sel.appendChild(o);
    });
  } catch {
    $('sceneSelect').innerHTML = '<option>Unavailable</option>';
  }
}

$('sceneSelect').addEventListener('change', () => {
  S.frame = parseInt($('sceneSelect').value) || 0;
  fetchFrame();
});

// ── Controls ──────────────────────────────────
$('samples').addEventListener('input', () => {
  $('samplesVal').textContent = $('samples').value;
  scheduleMetrics();
});
$('complexity').addEventListener('input', () => {
  $('complexityVal').textContent = $('complexity').value;
  scheduleMetrics();
});

$$('.mode-card').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.mode-card').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    S.eco = btn.dataset.mode === 'eco';
    document.body.classList.toggle('eco-active', S.eco);
    scheduleMetrics();
    toast(S.eco ? '◈ Neural Eco mode' : '○ Traditional mode');
  });
});

[$('heatmapToggle'),$('edgeToggle'),$('errorToggle')].forEach(t => {
  t.addEventListener('change', () => fetchFrame());
});

$('autoPlay').addEventListener('change', () => {
  S.playing = $('autoPlay').checked;
  toast(S.playing ? 'Playback resumed' : 'Playback paused');
});

$$('.proj-tab').forEach(t => {
  t.addEventListener('click', () => {
    $$('.proj-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    S.projMult = parseInt(t.dataset.mult);
    $('projCO2').textContent = (S.totalCarbon * S.projMult).toFixed(4);
  });
});

$('resetCarbon').addEventListener('click', () => {
  S.totalCarbon = 0; S.carbonHist = [];
  ['totalCO2','totalPhone','totalYT','projCO2'].forEach(id => $(id).textContent = '0');
  drawCarbonChart();
  toast('Counter reset');
});

$('exportBtn').addEventListener('click', () => {
  if (!S.lastEcoB64) { toast('No frame loaded', true); return; }
  const a = document.createElement('a');
  a.href = 'data:image/png;base64,' + S.lastEcoB64;
  a.download = `eco_${S.frame}.png`;
  a.click();
  toast('Frame exported ✓');
});

// ── Keyboard shortcuts ────────────────────────
document.addEventListener('keydown', e => {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
  if (e.code === 'Space')      { e.preventDefault(); S.playing=!S.playing; $('autoPlay').checked=S.playing; toast(S.playing?'▶ Playing':'⏸ Paused'); }
  if (e.key  === 'h'||e.key==='H') { $('heatmapToggle').click(); toast('Heatmap: '+($('heatmapToggle').checked?'on':'off')); }
  if (e.key  === 'e'||e.key==='E') { $$('.mode-card')[S.eco?0:1].click(); }
  if (e.key  === 'ArrowRight') { S.frame=(S.frame+1)%S.total; fetchFrame(); }
  if (e.key  === 'ArrowLeft')  { S.frame=(S.frame-1+S.total)%S.total; fetchFrame(); }
});

// ── Main loop ─────────────────────────────────
function loop(ts) {
  if (S.playing && ts - S.lastTs > 1000/S.fps) {
    fetchFrame();
    fetchMetrics();
    S.lastTs = ts;
  }
  requestAnimationFrame(loop);
}

// ── Boot ──────────────────────────────────────
checkHealth();
loadScenes();
fetchMetrics();
drawCarbonChart();
requestAnimationFrame(loop);
