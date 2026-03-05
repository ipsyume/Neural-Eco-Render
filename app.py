import torch
from flask import Flask, request, jsonify, send_from_directory
from model import NeuralEcoNet
from data_loader import get_pairs, load_image, normalize
from io import BytesIO
from PIL import Image
import base64
import numpy as np

# -------------------------------
# Flask App
# -------------------------------
app = Flask(__name__, static_folder="static")

# -------------------------------
# Load Neural Eco Model ONCE
# -------------------------------
DEVICE = "cpu"
eco_model = NeuralEcoNet().to(DEVICE)
eco_model.load_state_dict(torch.load("model.pth", map_location=DEVICE))
eco_model.eval()

# -------------------------------
# Frontend
# -------------------------------
@app.route("/")
def home():
    return send_from_directory("static", "index.html")

# -------------------------------
# Metrics API (Deterministic + Honest)
# -------------------------------
@app.route("/metrics", methods=["POST", "GET"])
def metrics():
    if request.method == "GET":
       return jsonify({"status": "metrics endpoint ready"})
    
    data = request.json

    samples = max(1, int(data["samples"]))
    width = int(data["width"])
    height = int(data["height"])
    complexity = max(1.0, float(data["complexity"]))
    use_eco = bool(data.get("use_eco", False))

    base_res = (width * height) / (1024 * 1024)
    if use_eco:
     effective_samples = 2 + samples * 0.12
    else:
     effective_samples = samples

    render_time_ms = (
        8.0 *
        effective_samples *
        base_res *
        complexity
    )

    power_w = 30.0 + (effective_samples * 0.8) + (complexity * 3.0)
    energy_j = (render_time_ms / 1000.0) * power_w
    fps = 1000.0 / render_time_ms
    co2_g = energy_j * 0.000233

    return jsonify({
        "render_time_ms": render_time_ms,
        "power_w": power_w,
        "energy_j": energy_j,
        "fps": fps,
        "co2_g": co2_g
    })

# -------------------------------
# Frames API (Low + Eco + High + Confidence + Edges)
# -------------------------------
@app.route("/frames")
def frames():
    index = int(request.args.get("index", 0))
    pairs = get_pairs()

    if not pairs:
        return jsonify({"error": "No frames found"})

    index = index % len(pairs)
    low_path, high_path = pairs[index]

    # -------------------------------
    # LOAD IMAGES
    # -------------------------------
    low = normalize(load_image(low_path))    # shape: H W 3, range [-1, 1]
    high = normalize(load_image(high_path))

    # -------------------------------
    # NEURAL ECO INFERENCE
    # -------------------------------
    low_tensor = (
        torch.from_numpy(low)
        .permute(2, 0, 1)
        .unsqueeze(0)
        .to(DEVICE)
    )

    with torch.no_grad():
        eco_tensor = eco_model(low_tensor)

    eco = (
        eco_tensor.squeeze(0)
        .permute(1, 2, 0)
        .cpu()
        .numpy()
    )

    # -------------------------------
    # CONVERT TO UINT8 (0–255)
    # -------------------------------
    low_u8  = ((low  + 1) * 127.5).clip(0, 255).astype("uint8")
    high_u8 = ((high + 1) * 127.5).clip(0, 255).astype("uint8")
    eco_u8  = ((eco  + 1) * 127.5).clip(0, 255).astype("uint8")

    # -------------------------------
    # STRUCTURE / EDGE MAP (CANNY)
    # -------------------------------
    import cv2
    import numpy as np

    gray = cv2.cvtColor(eco_u8, cv2.COLOR_BGR2GRAY)

    edges = cv2.Canny(
        gray,
        threshold1=80,
        threshold2=160
    )

    edges_rgb = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)

    # -------------------------------
    # CONFIDENCE MAP (PROXY)
    # eco vs low difference
    # -------------------------------
    diff = np.abs(eco_u8.astype("float32") - high_u8.astype("float32"))
    diff = diff.mean(axis=2)

    diff = diff / 50.0   # <-- tune this number (30–80 works well)
    diff = np.clip(diff, 0, 1)
    
    confidence = 1.0 - diff
    confidence = cv2.GaussianBlur(confidence, (9, 9), 0)

    gray_eco = cv2.cvtColor(eco_u8, cv2.COLOR_BGR2GRAY)
    _, object_mask = cv2.threshold(gray_eco, 15, 1, cv2.THRESH_BINARY)
    object_mask = cv2.GaussianBlur(object_mask.astype("float32"), (11, 11), 0)
    
    confidence = confidence * object_mask


    confidence_u8 = (confidence * 255).astype("uint8")

    error = np.abs(
        eco_u8.astype("float32") - high_u8.astype("float32")
    )

    error = error.mean(axis=2)

    if error.max() > 0:
        error = error / error.max()

    error_u8 = (error * 255).astype("uint8")

    # -------------------------------
    # BASE64 ENCODING
    # -------------------------------
    import base64

    def encode(img):
        _, buf = cv2.imencode(".png", img)
        return base64.b64encode(buf).decode("utf-8")

    # -------------------------------
    # RESPONSE
    # -------------------------------
    return jsonify({
        "frame": index,
        "low": encode(low_u8),
        "eco": encode(eco_u8),
        "high": encode(high_u8),
        "confidence": encode(confidence_u8),
        "edges": encode(edges_rgb),
        "error": encode(error_u8)
    })


# -------------------------------
# Run
# -------------------------------
if __name__ == "__main__":
    app.run(debug=True)