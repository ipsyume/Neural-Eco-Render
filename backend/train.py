# backend/train.py  — NeuralEcoNet v2 trainer
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torch.optim.lr_scheduler import CosineAnnealingLR
import torch.nn.functional as F

from model import NeuralEcoNet
from train_dataset import EcoDataset


def ssim_loss(pred, target, window_size=11):
    C1, C2 = 0.01**2, 0.03**2
    mu1 = F.avg_pool2d(pred,   window_size, 1, window_size//2)
    mu2 = F.avg_pool2d(target, window_size, 1, window_size//2)
    mu1_sq, mu2_sq, mu1_mu2 = mu1**2, mu2**2, mu1 * mu2
    sigma1_sq = F.avg_pool2d(pred   * pred,   window_size, 1, window_size//2) - mu1_sq
    sigma2_sq = F.avg_pool2d(target * target, window_size, 1, window_size//2) - mu2_sq
    sigma12   = F.avg_pool2d(pred   * target, window_size, 1, window_size//2) - mu1_mu2
    ssim_map  = ((2*mu1_mu2 + C1) * (2*sigma12 + C2)) / \
                ((mu1_sq + mu2_sq + C1) * (sigma1_sq + sigma2_sq + C2))
    return 1 - ssim_map.mean()


class EcoLoss(nn.Module):
    def __init__(self, l1_w=0.7, ssim_w=0.3):
        super().__init__()
        self.l1     = nn.L1Loss()
        self.l1_w   = l1_w
        self.ssim_w = ssim_w

    def forward(self, pred, target):
        return self.l1_w * self.l1(pred, target) + \
               self.ssim_w * ssim_loss(pred, target)


# ✅ Required on Windows — prevents worker processes re-running this file
if __name__ == '__main__':

    DEVICE     = "cuda" if torch.cuda.is_available() else "cpu"
    EPOCHS     = 60
    BATCH_SIZE = 4
    LR         = 3e-4
    PATCH_SIZE = 256

    print(f"[NeuralEcoNet v2] Training on: {DEVICE}")

    dataset = EcoDataset("../data/low", "../data/high", patch_size=PATCH_SIZE)

    loader = DataLoader(
        dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=0,   # 0 = no multiprocessing, safest on Windows
        pin_memory=(DEVICE == "cuda"),
    )

    model     = NeuralEcoNet(base=32).to(DEVICE)
    optimizer = optim.AdamW(model.parameters(), lr=LR, weight_decay=1e-4)
    scheduler = CosineAnnealingLR(optimizer, T_max=EPOCHS, eta_min=1e-5)
    criterion = EcoLoss(l1_w=0.7, ssim_w=0.3)

    best_loss = float("inf")

    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0.0

        for low, high in loader:
            low, high = low.to(DEVICE), high.to(DEVICE)
            pred = model(low)
            loss = criterion(pred, high)
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item()

        scheduler.step()
        avg = total_loss / len(loader)
        lr  = optimizer.param_groups[0]["lr"]
        print(f"Epoch {epoch+1:3d}/{EPOCHS} | Loss: {avg:.4f} | LR: {lr:.6f}")

        if avg < best_loss:
            best_loss = avg
            torch.save(model.state_dict(), "model_best.pth")

    torch.save(model.state_dict(), "model.pth")
    print(f"\nSaved model.pth  (best: model_best.pth @ {best_loss:.4f})")