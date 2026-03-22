# backend/train_dataset.py  — EcoDataset v2 with augmentations
import os
import random
import numpy as np
from PIL import Image
import torch
from torch.utils.data import Dataset
import torchvision.transforms.functional as TF


class EcoDataset(Dataset):
    def __init__(self, low_dir, high_dir, patch_size=256, augment=True):
        self.low_dir    = low_dir
        self.high_dir   = high_dir
        self.patch_size = patch_size
        self.augment    = augment
        self.files      = sorted([
            f for f in os.listdir(low_dir)
            if os.path.exists(os.path.join(high_dir, f))
        ])
        assert len(self.files) > 0, f"No matched pairs found in {low_dir} / {high_dir}"

    def __len__(self):
        return len(self.files)

    def _load(self, path):
        img = Image.open(path).convert("RGB")
        return np.array(img, dtype=np.float32)

    def _to_tensor(self, arr):
        t = torch.from_numpy(arr).permute(2, 0, 1)   # C H W
        return (t / 127.5) - 1.0                      # [-1, 1]

    def __getitem__(self, idx):
        fname = self.files[idx]
        low  = self._load(os.path.join(self.low_dir,  fname))
        high = self._load(os.path.join(self.high_dir, fname))

        H, W = low.shape[:2]
        p    = self.patch_size

        # ── Random patch crop ──
        if H > p and W > p:
            y = random.randint(0, H - p)
            x = random.randint(0, W - p)
            low  = low [y:y+p, x:x+p]
            high = high[y:y+p, x:x+p]

        low_t  = self._to_tensor(low)
        high_t = self._to_tensor(high)

        # ── Augmentations (applied identically to both) ──
        if self.augment:
            # Horizontal flip
            if random.random() > 0.5:
                low_t  = TF.hflip(low_t)
                high_t = TF.hflip(high_t)

            # Vertical flip
            if random.random() > 0.5:
                low_t  = TF.vflip(low_t)
                high_t = TF.vflip(high_t)

            # Random 90° rotation
            k = random.choice([0, 1, 2, 3])
            if k:
                low_t  = torch.rot90(low_t,  k, [1, 2])
                high_t = torch.rot90(high_t, k, [1, 2])

        return low_t, high_t
