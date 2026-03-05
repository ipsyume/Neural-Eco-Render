// ======================================
// Neural Eco-Renderer — Production UI Controller
// ======================================

// -------------------------------
// GLOBAL STATE
// -------------------------------
let frameIndex = 0;
let isUpdatingFrame = false;
let playbackFPS = 18;
let lastFrameTime = 0;
let graphPulse = 0;
let chartProgress = 0;
let prevEnergy = 0;
let prevPower = 0;
let prevCO2 = 0;
let metricsTimeout;

// -------------------------------
// CUMULATIVE CARBON STATE
// -------------------------------
let totalCarbonSaved = 0; // grams CO₂
let carbonHistory = [];

// -------------------------------
// DOM ELEMENTS
// -------------------------------
const ecoToggle = document.getElementById("ecoToggle");
const aiStatus = document.getElementById("aiStatus");
const samples = document.getElementById("samples");
const complexity = document.getElementById("complexity");

const samplesVal = document.getElementById("samplesVal");
const complexityVal = document.getElementById("complexityVal");

const timeEl = document.getElementById("time");
const powerEl = document.getElementById("power");
const energyEl = document.getElementById("energy");
const fpsEl = document.getElementById("fps");
const co2El = document.getElementById("co2");

const lowImg = document.getElementById("lowImg");
const ecoImg = document.getElementById("ecoImg");

ecoImg.onload = () => {
  ecoImg.style.opacity = "1";
  ecoImg.style.filter = "brightness(1.6) contrast(1.05) saturate(1.15)";
};

const highImg = document.getElementById("highImg");

// energy bars
const barTraditional = document.getElementById("barTraditional");
const barEco = document.getElementById("barEco");
const energyTraditionalText = document.getElementById("energyTraditional");
const energyEcoText = document.getElementById("energyEco");
const energySavingText = document.getElementById("energySavingText");

// cumulative carbon UI
const totalCarbonEl = document.getElementById("totalCarbon");
const totalPhoneEl = document.getElementById("totalPhoneCharges");
const totalYoutubeEl = document.getElementById("totalYoutubeMinutes");
const resetCarbonBtn = document.getElementById("resetCarbon");

const timeScale = document.getElementById("timeScale");
const timeScaleLabel = document.getElementById("timeScaleLabel");
const projectedCarbonEl = document.getElementById("projectedCarbon");

const heatmapToggle = document.getElementById("heatmapToggle");
const heatmapImg = document.getElementById("heatmapImg");

const edgeImg = document.getElementById("edgeImg");
const scanOverlay = document.getElementById("scanOverlay");

const errorImg = document.getElementById("errorImg");

// -------------------------------
// ENERGY RING UPDATE
// -------------------------------
function updateEnergyRing(percent) {

  const circle = document.getElementById("energyRing");
  const text = document.getElementById("energyPercent");

  if (!circle) return;

  const radius = 70;
  const circumference = 2 * Math.PI * radius;

  const offset =
    circumference - (percent / 100) * circumference;

  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = offset;

  text.innerText = percent.toFixed(1) + "%";
}

// -------------------------------
// SLIDER DISPLAY (SAFE LISTENERS)
// -------------------------------

function requestMetricsUpdate() {
  clearTimeout(metricsTimeout);
  metricsTimeout = setTimeout(updateMetrics, 120);
}

samples.addEventListener("input", () => {
  samplesVal.innerText = samples.value;
  requestMetricsUpdate();
});

complexity.addEventListener("input", () => {
  complexityVal.innerText = complexity.value;
  requestMetricsUpdate();
});



ecoToggle.onchange = () => {
  document.body.classList.toggle("eco-mode", ecoToggle.checked);
  updateMetrics();
};
timeScale.oninput = updateMetrics;

// -------------------------------
// FRAME UPDATE (SYNCED ROTATION)
// -------------------------------
async function updateFrame() {
  if (isUpdatingFrame) return;
  isUpdatingFrame = true;

  try {
    const res = await fetch(`/frames?index=${frameIndex}`);
    const data = await res.json();

    lowImg.src  = "data:image/png;base64," + data.low;
    ecoImg.src  = "data:image/png;base64," + data.eco;
    highImg.src = "data:image/png;base64," + data.high;

    if (data.error) {
      errorImg.src = "data:image/png;base64," + data.error;
      errorImg.classList.remove("hidden");
    } else {
      errorImg.classList.add("hidden");
    }

    // -------------------------------
    // STRUCTURE (EDGE) ANIMATION
    // -------------------------------
    if (data.edges) {
      edgeImg.src = "data:image/png;base64," + data.edges;
      edgeImg.classList.remove("hidden");
      edgeImg.style.opacity = "0";
      ecoImg.style.opacity = "0.6";

      scanOverlay.className = "";

      setTimeout(() => edgeImg.style.opacity = "1", 100);
      setTimeout(() => scanOverlay.classList.add("structure-scan"), 200);
      setTimeout(() => {
        ecoImg.classList.add("reveal-eco");
        ecoImg.style.opacity = "1";
      }, 400);
      setTimeout(() => edgeImg.style.opacity = "0", 650);
      setTimeout(() => {
        edgeImg.classList.add("hidden");
        scanOverlay.className = "";
        ecoImg.style.opacity = "1";
      }, 900);
    }

    // -------------------------------
    // CONFIDENCE HEATMAP
    // -------------------------------
    if (heatmapToggle.checked && data.confidence) {
      colorizeHeatmap(data.confidence).then(colored => {
        heatmapImg.src = colored;
        heatmapImg.classList.remove("hidden");
        heatmapImg.classList.add("heat-breath");
        heatmapImg.style.opacity = "0.35";
      });
    } else {
      heatmapImg.classList.add("hidden");
      heatmapImg.classList.remove("heat-breath");
      heatmapImg.style.opacity = "0";
    }

    frameIndex++;

  } catch (err) {
    console.error("Frame update error:", err);
  }

  isUpdatingFrame = false;
}
function animateValue(element, start, end, duration = 400) {

  const startTime = performance.now();

  function update(now) {
    const progress = Math.min((now - startTime) / duration, 1);

    const value = start + (end - start) * progress;

    element.innerText = value.toFixed(3);

    if (progress === 1) {
      element.classList.remove("metric-glow");
      void element.offsetWidth; // restart animation
      element.classList.add("metric-glow");
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}
// -------------------------------
// METRICS + ENERGY + CARBON
// -------------------------------
async function updateMetrics() {
  try {

    const traditional = await fetch("/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        samples: Number(samples.value),
        width: 1024,
        height: 1024,
        complexity: Number(complexity.value),
        use_eco: false
      })
    }).then(r => r.json());

    const eco = await fetch("/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        samples: samples.value,
        width: 1024,
        height: 1024,
        complexity: complexity.value,
        use_eco: true
      })
    }).then(r => r.json());

    const active = ecoToggle.checked ? eco : traditional;

    // -----------------------
    // METRIC DISPLAY
    // -----------------------
    timeEl.innerText   = active.render_time_ms.toFixed(2);
    fpsEl.innerText    = active.fps.toFixed(2);
    animateValue(energyEl, prevEnergy, active.energy_j);
    animateValue(powerEl, prevPower, active.power_w);
    animateValue(co2El, prevCO2, active.co2_g, 600);
    prevEnergy = active.energy_j;
    prevPower = active.power_w;
    prevCO2 = active.co2_g;

    // -----------------------
    // ENERGY BARS
    // -----------------------
    const maxEnergy = Math.max(traditional.energy_j, eco.energy_j, 0.0001);

    barTraditional.style.width =
      (traditional.energy_j / maxEnergy) * 100 + "%";

    barEco.style.width =
      (eco.energy_j / maxEnergy) * 100 + "%";

    energyTraditionalText.innerText =
      traditional.energy_j.toFixed(3) + " J";

    energyEcoText.innerText =
      eco.energy_j.toFixed(3) + " J";

    const savedPct =
      ((traditional.energy_j - eco.energy_j) / traditional.energy_j) * 100;

    energySavingText.innerText =
      savedPct > 0
        ? `≈ ${savedPct.toFixed(1)}% energy saved`
        : "No energy savings at this setting";
      updateEnergyRing(Math.max(0, savedPct));

    // -----------------------
    // CARBON TRACKING
    // -----------------------
    const frameCarbonSaved =
      traditional.co2_g - eco.co2_g;

    if (ecoToggle.checked && frameCarbonSaved > 0) {
      totalCarbonSaved += frameCarbonSaved;
    }

    carbonHistory.push(totalCarbonSaved);
    if (carbonHistory.length > 100) carbonHistory.shift();

    // ⭐ restart animation each update
    chartProgress = 0;
    drawCarbonChart();

    totalCarbonEl.innerText =
      totalCarbonSaved.toFixed(5);

    // -----------------------
    // TIME PROJECTION
    // -----------------------
    const scales = {
      1: [1, "1 Minute Simulation"],
      2: [60, "1 Hour Simulation"],
      3: [1440, "1 Day Simulation"],
      4: [525600, "1 Year Simulation"]
    };

    const [multiplier, label] =
      scales[timeScale.value];

    timeScaleLabel.innerText = label;

    projectedCarbonEl.innerText =
      (totalCarbonSaved * multiplier).toFixed(2);

    totalPhoneEl.innerText =
      (totalCarbonSaved / 5.7).toFixed(2);

    totalYoutubeEl.innerText =
      ((totalCarbonSaved / 55) * 60).toFixed(2);

    // visual cue
    const ecoColor =
      ecoToggle.checked ? "#4CAF50" : "#ff5252";

    powerEl.style.color = ecoColor;
    energyEl.style.color = ecoColor;

    aiStatus.innerText =
     ecoToggle.checked
      ? "● Neural Model Active — Optimizing"
      : "● Traditional Renderer Mode";
    aiStatus.style.color =
     ecoToggle.checked ? "#7CFF8A" : "#ff6b6b";

  } catch (err) {
    console.error("Metrics update error:", err);
  }
}

// -------------------------------
// RESET CARBON COUNTER
// -------------------------------
resetCarbonBtn.onclick = () => {
  totalCarbonSaved = 0;
  carbonHistory = [];
  totalCarbonEl.innerText = "0.00000";
  totalPhoneEl.innerText = "0";
  totalYoutubeEl.innerText = "0";
  drawCarbonChart();
};

// -------------------------------
// PLAYBACK LOOP
// -------------------------------
function playbackLoop(timestamp) {
  if (timestamp - lastFrameTime > 1000 / playbackFPS) {
    updateFrame();
    lastFrameTime = timestamp;
  }
  requestAnimationFrame(playbackLoop);
}

// -------------------------------
// HEATMAP COLORIZER
// -------------------------------
function colorizeHeatmap(base64Gray) {

  const img = new Image();
  img.src = "data:image/png;base64," + base64Gray;

  return new Promise(resolve => {

    img.onload = () => {

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");

      ctx.drawImage(img, 0, 0);

      const imgData =
        ctx.getImageData(0, 0, canvas.width, canvas.height);

      const d = imgData.data;

      for (let i = 0; i < d.length; i += 4) {

        let v = d[i] / 255;   // confidence

        if (v < 0.08) {
          d[i + 3] = 0;  // fully transparent
          continue;
        }

        // amplify visibility
        v = Math.pow(v, 1.4);
        v = Math.max(0, Math.min(1, v));

        // RED → GREEN gradient
        d[i]     = 255 * (1 - v); // R
        d[i + 1] = 255 * v;      // G
        d[i + 2] = 40 + 80 * v;  // B
        d[i + 3] = 160 + 80 * v; // alpha
      }

      ctx.putImageData(imgData, 0, 0);

      resolve(canvas.toDataURL());
    };
  });
}

// -------------------------------
// CARBON CHART (Animated + Gradient Fill)
// -------------------------------
function drawCarbonChart() {

  const canvas = document.getElementById("carbonChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  // ---- Responsive sizing
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ---- Clear
  ctx.clearRect(0, 0, rect.width, rect.height);

  // --------------------------------
  // BACKGROUND
  // --------------------------------
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.fillRect(0, 0, rect.width, rect.height);

  // --------------------------------
  // GRID LINES
  // --------------------------------
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";

  for (let i = 1; i <= 4; i++) {
    const y = Math.round((i / 5) * rect.height) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(rect.width, y);
    ctx.stroke();
  }

  // baseline
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(0, rect.height - 0.5);
  ctx.lineTo(rect.width, rect.height - 0.5);
  ctx.stroke();

  if (carbonHistory.length < 2) return;

  const maxVal = Math.max(...carbonHistory, 0.0001);
  const padding = 20;

  // --------------------------------
  // ANIMATION PROGRESS
  // --------------------------------
  chartProgress += 0.04;
  chartProgress = Math.min(chartProgress, 1);

  const visibleCount = Math.floor(carbonHistory.length * chartProgress);
  if (visibleCount < 2) {
    if (chartProgress < 1) requestAnimationFrame(drawCarbonChart);
    return;
  }

  // --------------------------------
  // BUILD POINT COORDINATES
  // --------------------------------
  const points = [];
  for (let i = 0; i < visibleCount; i++) {
    const x = (i / (carbonHistory.length - 1)) * rect.width;
    const y = rect.height - padding -
      (carbonHistory[i] / maxVal) * (rect.height - padding * 2);
    points.push({ x, y });
  }

  const lastPt = points[points.length - 1];

  // --------------------------------
  // GRADIENT FILL (under the line)
  // --------------------------------
  const fillGrad = ctx.createLinearGradient(0, padding, 0, rect.height);
  fillGrad.addColorStop(0,    "rgba(0, 255, 178, 0.40)");
  fillGrad.addColorStop(0.45, "rgba(0, 255, 178, 0.15)");
  fillGrad.addColorStop(0.80, "rgba(77, 255, 239, 0.05)");
  fillGrad.addColorStop(1,    "rgba(0, 255, 178, 0.00)");

  ctx.beginPath();
  ctx.moveTo(points[0].x, rect.height); // bottom-left anchor
  ctx.lineTo(points[0].x, points[0].y); // up to first point

  // smooth curve through all points
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
  }

  ctx.lineTo(lastPt.x, rect.height); // down to baseline
  ctx.closePath();

  ctx.fillStyle = fillGrad;
  ctx.fill();

  // --------------------------------
  // DRAW LINE (on top of fill)
  // --------------------------------
  ctx.beginPath();
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // line gradient left → right
  const lineGrad = ctx.createLinearGradient(0, 0, rect.width, 0);
  lineGrad.addColorStop(0,   "#00FFB2");
  lineGrad.addColorStop(0.5, "#4DFFEF");
  lineGrad.addColorStop(1,   "#00FFB2");

  ctx.strokeStyle = lineGrad;
  ctx.shadowColor = "rgba(0, 255, 178, 0.7)";
  ctx.shadowBlur = 10;

  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
  }

  ctx.stroke();
  ctx.shadowBlur = 0;

  // --------------------------------
  // ENDPOINT GLOW DOT
  // --------------------------------
  // outer glow ring
  ctx.beginPath();
  ctx.arc(lastPt.x, lastPt.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 255, 178, 0.15)";
  ctx.fill();

  // inner dot
  ctx.beginPath();
  ctx.arc(lastPt.x, lastPt.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#00FFB2";
  ctx.shadowColor = "#00FFB2";
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;

  // --------------------------------
  // VALUE LABEL
  // --------------------------------
  const lastValue = carbonHistory[visibleCount - 1];
  ctx.font = "600 11px 'Space Mono', monospace";
  ctx.fillStyle = "rgba(0, 255, 178, 0.9)";
  ctx.textAlign = "left";
  ctx.fillText(`${lastValue.toFixed(3)} g`, lastPt.x + 10, lastPt.y - 8);

  // continue animation
  if (chartProgress < 1) {
    requestAnimationFrame(drawCarbonChart);
  }
}

// -------------------------------
// AI MOUSE GLOW FOLLOW
// -------------------------------

const glow = document.getElementById("mouseGlow");

document.addEventListener("mousemove", (e) => {
  glow.style.left = e.clientX + "px";
  glow.style.top = e.clientY + "px";
});

// =====================================
// NEURAL NETWORK BACKGROUND
// =====================================

const neuralCanvas = document.getElementById("neuralBg");

if (neuralCanvas) {

  const nctx = neuralCanvas.getContext("2d");

  // -------------------------------
  // MOUSE POSITION (NEURAL ATTENTION)
  // -------------------------------
  let mouse = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2
  };

  document.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  // resize canvas
  function resizeNeural() {
    neuralCanvas.width = window.innerWidth;
    neuralCanvas.height = window.innerHeight;
  }
  resizeNeural();
  window.addEventListener("resize", resizeNeural);

  // create nodes
  const nodes = [];
  for (let i = 0; i < 85; i++) {
    nodes.push({
      x: Math.random() * neuralCanvas.width,
      y: Math.random() * neuralCanvas.height,
      vx: (Math.random() - 0.5) * 0.08,
      vy: (Math.random() - 0.5) * 0.08
    });
  }

  // convert theme color
  function hexToRgb(hex) {
    const bigint = parseInt(hex.replace("#",""), 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  function animateNeural() {

    nctx.clearRect(0,0,neuralCanvas.width,neuralCanvas.height);

    // move nodes
    nodes.forEach(n => {

      n.x += n.vx;
      n.y += n.vy;

      const dx = mouse.x - n.x;
      const dy = mouse.y - n.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      const influenceRadius = 220;

      if (dist < influenceRadius) {
        const force = (1 - dist/influenceRadius) * 0.02;
        n.x += dx * force;
        n.y += dy * force;
      }

      if (n.x < 0 || n.x > neuralCanvas.width) n.vx *= -1;
      if (n.y < 0 || n.y > neuralCanvas.height) n.vy *= -1;
    });

    // draw nodes
   nodes.forEach(n => {
    nctx.beginPath();
    nctx.arc(n.x, n.y, 1.6, 0, Math.PI * 2);
    nctx.fillStyle = "rgba(0,229,255,0.6)";
    nctx.fill();
   });

    // theme color
    const ecoColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--eco-accent')
      .trim();

    const rgb = hexToRgb(ecoColor);

    // draw connections
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {

        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < 220) {

          const ecoBoost =
           document.body.classList.contains("eco-mode") ? 1.4 : 0.7;
          const alpha = ecoBoost * (0.2 + (1 - dist/220) * 0.5);

          nctx.strokeStyle =
            `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;

          nctx.shadowBlur = 14;
          nctx.shadowColor =
            `rgba(${rgb.r},${rgb.g},${rgb.b},0.6)`;

          nctx.beginPath();
          nctx.moveTo(nodes[i].x, nodes[i].y);
          nctx.lineTo(nodes[j].x, nodes[j].y);
          nctx.stroke();

          nctx.shadowBlur = 0;
        }
      }
    }

    requestAnimationFrame(animateNeural);
  }

  animateNeural();
}

// -------------------------------
// INIT
// -------------------------------
updateMetrics();
drawCarbonChart();
requestAnimationFrame(playbackLoop);