# backend/data_loader.py

import os
from PIL import Image
import numpy as np

LOW_DIR = "../data/low"
HIGH_DIR = "../data/high"


def get_pairs():
    pairs = []
    for fname in sorted(os.listdir(LOW_DIR)):
        low_path = os.path.join(LOW_DIR, fname)
        high_path = os.path.join(HIGH_DIR, fname)
        if os.path.exists(high_path):
            pairs.append((low_path, high_path))
    return pairs


def load_image(path):
    img = Image.open(path).convert("RGB")
    img = np.array(img).astype(np.float32)
    return img


def normalize(img):
    return (img / 127.5) - 1.0