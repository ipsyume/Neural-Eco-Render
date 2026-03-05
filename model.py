# backend/model.py
import torch
import torch.nn as nn
import torch.nn.functional as F


class ResidualBlock(nn.Module):
    def __init__(self, channels):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1)

    def forward(self, x):
        residual = x
        x = F.relu(self.conv1(x))
        x = self.conv2(x)
        return x + residual


class NeuralEcoNet(nn.Module):
    def __init__(self):
        super().__init__()

        self.entry = nn.Conv2d(3, 32, 3, padding=1)

        self.res1 = ResidualBlock(32)
        self.res2 = ResidualBlock(32)
        self.res3 = ResidualBlock(32)

        self.exit = nn.Conv2d(32, 3, 3, padding=1)

    def forward(self, x):
        x = F.relu(self.entry(x))
        x = self.res1(x)
        x = self.res2(x)
        x = self.res3(x)
        x = self.exit(x)
        return x