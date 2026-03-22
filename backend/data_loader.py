# backend/data_loader.py  — v2
import os
import numpy as np
from PIL import Image

LOW_DIR  = "../data/low"
HIGH_DIR = "../data/high"


def get_pairs():
    """Return sorted list of (low_path, high_path) tuples."""
    pairs = []
    if not os.path.isdir(LOW_DIR):
        return pairs
    for fname in sorted(os.listdir(LOW_DIR)):
        lp = os.path.join(LOW_DIR,  fname)
        hp = os.path.join(HIGH_DIR, fname)
        if os.path.exists(hp):
            pairs.append((lp, hp))
    return pairs


def load_image(path, target_size=None):
    """Load image as float32 numpy array (H, W, 3) in [0, 255]."""
    img = Image.open(path).convert("RGB")
    if target_size:
        img = img.resize(target_size, Image.LANCZOS)
    return np.array(img, dtype=np.float32)


def normalize(img):
    """Scale [0,255] → [-1, 1]."""
    return (img / 127.5) - 1.0


def denormalize(img):
    """Scale [-1,1] → [0, 255] uint8."""
    return ((img + 1.0) * 127.5).clip(0, 255).astype("uint8")


def get_scene_names():
    """Return display names for each pair."""
    pairs = get_pairs()
    names = []
    for lp, _ in pairs:
        base = os.path.splitext(os.path.basename(lp))[0]
        names.append(base.replace("_", " ").replace("-", " ").title())
    return names
