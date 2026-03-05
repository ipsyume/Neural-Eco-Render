# backend/train.py
import torch
from torch.utils.data import DataLoader
import torch.optim as optim
import torch.nn as nn

from model import NeuralEcoNet
from train_dataset import EcoDataset

DEVICE = "cpu"

# Dataset (patch-based)
dataset = EcoDataset("../data/low", "../data/high", patch_size=256)
loader = DataLoader(dataset, batch_size=4, shuffle=True)

# Model
model = NeuralEcoNet().to(DEVICE)

# Optimizer (lower LR for stability)
optimizer = optim.Adam(model.parameters(), lr=5e-4)
criterion = nn.L1Loss()

EPOCHS = 40

for epoch in range(EPOCHS):
    total_loss = 0.0

    for low, high in loader:
        low = low.to(DEVICE)
        high = high.to(DEVICE)

        pred = model(low)
        loss = criterion(pred, high)

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        total_loss += loss.item()

    avg_loss = total_loss / len(loader)
    print(f"Epoch {epoch+1}/{EPOCHS} | Avg L1 Loss: {avg_loss:.4f}")

# Save trained model
torch.save(model.state_dict(), "model.pth")
print("Saved model.pth")