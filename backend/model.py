# backend/model.py  — NeuralEcoNet v2  (U-Net + Channel Attention)
import torch
import torch.nn as nn
import torch.nn.functional as F


# ──────────────────────────────────────────────
# Channel Attention (Squeeze-and-Excitation)
# ──────────────────────────────────────────────
class ChannelAttention(nn.Module):
    def __init__(self, channels, reduction=8):
        super().__init__()
        self.gap = nn.AdaptiveAvgPool2d(1)
        self.fc  = nn.Sequential(
            nn.Conv2d(channels, channels // reduction, 1, bias=False),
            nn.ReLU(inplace=True),
            nn.Conv2d(channels // reduction, channels, 1, bias=False),
            nn.Sigmoid()
        )
    def forward(self, x):
        return x * self.fc(self.gap(x))


# ──────────────────────────────────────────────
# Residual + Attention Block
# ──────────────────────────────────────────────
class ResAttnBlock(nn.Module):
    def __init__(self, ch):
        super().__init__()
        self.body = nn.Sequential(
            nn.Conv2d(ch, ch, 3, padding=1, bias=False),
            nn.InstanceNorm2d(ch, affine=True),
            nn.ReLU(inplace=True),
            nn.Conv2d(ch, ch, 3, padding=1, bias=False),
            nn.InstanceNorm2d(ch, affine=True),
        )
        self.attn = ChannelAttention(ch)

    def forward(self, x):
        return x + self.attn(self.body(x))


# ──────────────────────────────────────────────
# Encoder Block
# ──────────────────────────────────────────────
class EncBlock(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
            nn.InstanceNorm2d(out_ch, affine=True),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.InstanceNorm2d(out_ch, affine=True),
            nn.ReLU(inplace=True),
        )
        self.attn = ChannelAttention(out_ch)
        self.pool = nn.MaxPool2d(2)

    def forward(self, x):
        skip = self.attn(self.conv(x))
        return skip, self.pool(skip)


# ──────────────────────────────────────────────
# Decoder Block (with skip connection)
# ──────────────────────────────────────────────
class DecBlock(nn.Module):
    def __init__(self, in_ch, skip_ch, out_ch):
        super().__init__()
        self.up   = nn.ConvTranspose2d(in_ch, out_ch, 2, stride=2)
        self.conv = nn.Sequential(
            nn.Conv2d(out_ch + skip_ch, out_ch, 3, padding=1, bias=False),
            nn.InstanceNorm2d(out_ch, affine=True),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.InstanceNorm2d(out_ch, affine=True),
            nn.ReLU(inplace=True),
        )
        self.attn = ChannelAttention(out_ch)

    def forward(self, x, skip):
        x = self.up(x)
        # handle odd spatial sizes
        if x.shape != skip.shape:
            x = F.interpolate(x, size=skip.shape[2:], mode='bilinear', align_corners=False)
        x = torch.cat([x, skip], dim=1)
        return self.attn(self.conv(x))


# ──────────────────────────────────────────────
# Bottleneck
# ──────────────────────────────────────────────
class Bottleneck(nn.Module):
    def __init__(self, ch):
        super().__init__()
        self.blocks = nn.Sequential(*[ResAttnBlock(ch) for _ in range(4)])

    def forward(self, x):
        return self.blocks(x)


# ──────────────────────────────────────────────
# NeuralEcoNet v2  — Full U-Net
# ──────────────────────────────────────────────
class NeuralEcoNet(nn.Module):
    """
    Lightweight U-Net with channel attention for neural eco-rendering.
    Input : (B, 3, H, W)  — low-sample render in [-1, 1]
    Output: (B, 3, H, W)  — high-quality reconstruction in [-1, 1]
    """
    def __init__(self, base=32):
        super().__init__()
        # Encoder
        self.enc1 = EncBlock(3,       base)       # 32
        self.enc2 = EncBlock(base,    base * 2)   # 64
        self.enc3 = EncBlock(base*2,  base * 4)   # 128

        # Bottleneck
        self.bottle = Bottleneck(base * 4)         # 128

        # Decoder
        self.dec3 = DecBlock(base*4, base*4, base*2)
        self.dec2 = DecBlock(base*2, base*2, base)
        self.dec1 = DecBlock(base,   base,   base)

        # Output head
        self.head = nn.Sequential(
            nn.Conv2d(base, base // 2, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(base // 2, 3, 1),
            nn.Tanh()
        )

    def forward(self, x):
        s1, x = self.enc1(x)
        s2, x = self.enc2(x)
        s3, x = self.enc3(x)

        x = self.bottle(x)

        x = self.dec3(x, s3)
        x = self.dec2(x, s2)
        x = self.dec1(x, s1)

        return self.head(x)
