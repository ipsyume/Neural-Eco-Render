# backend/train_dataset.py
import os
import random
from PIL import Image
import torch
from torch.utils.data import Dataset
import numpy as np


class EcoDataset(Dataset):
    def __init__(self, low_dir, high_dir, patch_size=256):
        self.low_dir = low_dir
        self.high_dir = high_dir
        self.files = sorted(os.listdir(low_dir))
        self.patch_size = patch_size

    def __len__(self):
        return len(self.files)

    def load_image(self, path):
        img = Image.open(path).convert("RGB")
        img = np.array(img).astype(np.float32)
        img = (img / 127.5) - 1.0          # normalize to [-1, 1]
        img = torch.from_numpy(img).permute(2, 0, 1)
        return img

    def __getitem__(self, idx):
        fname = self.files[idx]

        low = self.load_image(os.path.join(self.low_dir, fname))
        high = self.load_image(os.path.join(self.high_dir, fname))

        _, H, W = low.shape
        p = self.patch_size

        # Random patch crop (key speedup)
        if H > p and W > p:
            y = random.randint(0, H - p)
            x = random.randint(0, W - p)
            low = low[:, y:y+p, x:x+p]
            high = high[:, y:y+p, x:x+p]

        return low, high