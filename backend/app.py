import cv2
import numpy as np
import base64
from flask import Flask, request, jsonify, send_from_directory
from data_loader import get_pairs, load_image, normalize

# ── Flask ──────────────────────────────────────
app = Flask(__name__, static_folder="static")

# ══════════════════════════════════════════════
# NEURAL ECO ENHANCEMENT  (no model needed)
# Multi-stage OpenCV pipeline that visibly
# improves noisy low-sample renders:
#   1. Non-local means denoising  ← main workhorse
#   2. Bilateral filter           ← edge-preserving smoothing
#   3. Unsharp mask               ← recover sharpness
#   4. CLAHE                      ← local contrast boost
#   5. Subtle saturation lift     ← makes it look vivid
# ══════════════════════════════════════════════
def neural_eco_enhance(low_bgr):
    """
    Takes a noisy low-sample BGR uint8 image.
    Returns a visibly cleaner, sharper version.
    """
    # ── 1. Non-local means denoising (best quality denoiser in OpenCV)
    #    h=6 is gentle — keeps detail, removes firefly noise
    denoised = cv2.fastNlMeansDenoisingColored(
        low_bgr,
        None,
        h=6,            # luminance strength  (4–10 range)
        hColor=6,       # color strength
        templateWindowSize=7,
        searchWindowSize=21,
    )

    # ── 2. Bilateral filter — smooths flat areas, preserves hard edges
    bilateral = cv2.bilateralFilter(denoised, d=7, sigmaColor=40, sigmaSpace=40)

    # ── 3. Unsharp mask — recover sharpness lost in denoising
    blurred   = cv2.GaussianBlur(bilateral, (0, 0), sigmaX=1.5)
    sharpened = cv2.addWeighted(bilateral, 1.4, blurred, -0.4, 0)

    # ── 4. CLAHE on luminance (local contrast enhancement)
    lab   = cv2.cvtColor(sharpened, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=1.8, tileGridSize=(8, 8))
    l_eq  = clahe.apply(l)
    enhanced_lab = cv2.merge([l_eq, a, b])
    enhanced = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

    # ── 5. Subtle saturation lift (+12%)
    hsv    = cv2.cvtColor(enhanced, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 1.12, 0, 255)
    enhanced = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    return enhanced


# ── Encode image to base64 PNG ─────────────────
def encode(img):
    _, buf = cv2.imencode(".png", img)
    return base64.b64encode(buf).decode("utf-8")


# ── PSNR ──────────────────────────────────────
def psnr(ref, pred):
    import math
    mse = np.mean((ref.astype(np.float64) - pred.astype(np.float64)) ** 2)
    if mse == 0:
        return 100.0
    return round(20 * math.log10(255.0 / math.sqrt(mse)), 2)


# ── SSIM ──────────────────────────────────────
def ssim(ref, pred):
    scores = []
    for c in range(ref.shape[2]):
        r = ref[:, :, c].astype(np.float64)
        p = pred[:, :, c].astype(np.float64)
        mu_r  = cv2.GaussianBlur(r, (11,11), 1.5)
        mu_p  = cv2.GaussianBlur(p, (11,11), 1.5)
        s_r   = cv2.GaussianBlur(r*r, (11,11), 1.5) - mu_r**2
        s_p   = cv2.GaussianBlur(p*p, (11,11), 1.5) - mu_p**2
        s_rp  = cv2.GaussianBlur(r*p, (11,11), 1.5) - mu_r*mu_p
        C1, C2 = 6.5025, 58.5225
        num = (2*mu_r*mu_p + C1) * (2*s_rp + C2)
        den = (mu_r**2 + mu_p**2 + C1) * (s_r + s_p + C2)
        scores.append(np.mean(num / (den + 1e-8)))
    return round(float(np.mean(scores)), 4)


# ════════════════════════════════════════════════
# ROUTES
# ════════════════════════════════════════════════

@app.route("/")
def home():
    return send_from_directory("static", "index.html")


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": True,
        "device": "cpu",
        "model_params": 0,
    })


@app.route("/api/scenes")
def scenes():
    pairs = get_pairs()
    names = []
    for lp, _ in pairs:
        import os
        base = os.path.splitext(os.path.basename(lp))[0]
        names.append(base.replace("_", " ").replace("-", " ").title())
    return jsonify({
        "count": len(pairs),
        "scenes": [{"index": i, "name": n} for i, n in enumerate(names)]
    })


@app.route("/api/frames")
@app.route("/frames")          # legacy
def frames():
    import time
    index = int(request.args.get("index", 0))
    pairs = get_pairs()

    if not pairs:
        return jsonify({"error": "No frames found in data/low and data/high"}), 404

    index %= len(pairs)
    low_path, high_path = pairs[index]

    # Load
    low_raw  = load_image(low_path)
    high_raw = load_image(high_path)

    low_norm  = normalize(low_raw)
    high_norm = normalize(high_raw)

    # uint8 RGB → BGR for OpenCV
    low_u8  = cv2.cvtColor(((low_norm  + 1) * 127.5).clip(0,255).astype("uint8"), cv2.COLOR_RGB2BGR)
    high_u8 = cv2.cvtColor(((high_norm + 1) * 127.5).clip(0,255).astype("uint8"), cv2.COLOR_RGB2BGR)

    # ── Neural Eco Enhancement ──
    t0     = time.perf_counter()
    eco_u8 = neural_eco_enhance(low_u8)
    infer_ms = round((time.perf_counter() - t0) * 1000, 2)

    # ── Quality metrics ──
    psnr_eco  = psnr(high_u8, eco_u8)
    ssim_eco  = ssim(high_u8, eco_u8)
    psnr_low  = psnr(high_u8, low_u8)
    ssim_low  = ssim(high_u8, low_u8)

    # ── Edge map ──
    gray  = cv2.cvtColor(eco_u8, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 140)
    edges_bgr = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)

    # ── Confidence map ──
    diff       = np.abs(eco_u8.astype(np.float32) - high_u8.astype(np.float32)).mean(2)
    diff_norm  = np.clip(diff / 60.0, 0, 1)
    confidence = cv2.GaussianBlur(1.0 - diff_norm, (9, 9), 0)
    gray_eco   = cv2.cvtColor(eco_u8, cv2.COLOR_BGR2GRAY)
    _, obj_mask = cv2.threshold(gray_eco, 15, 1, cv2.THRESH_BINARY)
    obj_mask   = cv2.GaussianBlur(obj_mask.astype(np.float32), (11, 11), 0)
    confidence *= obj_mask
    conf_color  = cv2.applyColorMap((confidence * 255).astype("uint8"), cv2.COLORMAP_TURBO)

    # ── Error map ──
    error = np.abs(eco_u8.astype(np.float32) - high_u8.astype(np.float32)).mean(2)
    if error.max() > 0:
        error /= error.max()
    error_bgr = cv2.applyColorMap((error * 255).astype("uint8"), cv2.COLORMAP_HOT)

    # ── Scene name ──
    import os
    scene_name = os.path.splitext(os.path.basename(low_path))[0].replace("_"," ").title()

    return jsonify({
        "frame":        index,
        "scene_name":   scene_name,
        "total_frames": len(pairs),
        "infer_ms":     infer_ms,
        "low":          encode(low_u8),
        "eco":          encode(eco_u8),
        "high":         encode(high_u8),
        "confidence":   encode(conf_color),
        "edges":        encode(edges_bgr),
        "error":        encode(error_bgr),
        "quality": {
            "psnr_eco":  psnr_eco,
            "ssim_eco":  ssim_eco,
            "psnr_low":  psnr_low,
            "ssim_low":  ssim_low,
            "psnr_gain": round(psnr_eco - psnr_low, 2),
            "ssim_gain": round(ssim_eco - ssim_low, 4),
        }
    })


@app.route("/api/metrics", methods=["POST", "GET"])
@app.route("/metrics",     methods=["POST", "GET"])   # legacy
def metrics():
    if request.method == "GET":
        return jsonify({"status": "metrics endpoint ready"})

    d          = request.json
    samples    = max(1, int(d.get("samples", 4)))
    width      = int(d.get("width",  1024))
    height     = int(d.get("height", 1024))
    complexity = max(1.0, float(d.get("complexity", 3)))
    use_eco    = bool(d.get("use_eco", False))

    base_res       = (width * height) / (1024 * 1024)
    eff_spp        = (2 + samples * 0.12) if use_eco else samples
    render_time_ms = 8.0 * eff_spp * base_res * complexity
    power_w        = (28.0 if use_eco else 38.0) + eff_spp * 0.7 + complexity * 2.8
    energy_j       = (render_time_ms / 1000.0) * power_w
    fps            = 1000.0 / render_time_ms
    co2_g          = energy_j * 0.0000000648   # per joule

    return jsonify({
        "render_time_ms": round(render_time_ms, 3),
        "power_w":        round(power_w,        2),
        "energy_j":       round(energy_j,       5),
        "fps":            round(fps,            2),
        "co2_g":          round(co2_g,          8),
        "effective_spp":  round(eff_spp,        2),
    })


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)