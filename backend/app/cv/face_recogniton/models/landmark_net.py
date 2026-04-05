"""
face_rec/models/landmark_net.py
────────────────────────────────
LandmarkNet — lightweight CNN for eye-landmark regression.

Architecture overview
─────────────────────
Input : (B, 3, 96, 96)  RGB face crop, normalised
Output: (B, 24)          24 normalised coordinates:
                           [0..11]  left_eye  — 6 × (x_norm, y_norm)
                           [12..23] right_eye — 6 × (x_norm, y_norm)
                         Values are in [0, 1] relative to the crop.

Design choices
──────────────
• Three convolutional blocks with Batch-Norm + MaxPool.
• Dropout before FC layers to regularise the small dataset sizes typical
  of landmark datasets.
• Final Sigmoid activation constrains outputs to [0, 1].
• ~350 K parameters — fast on CPU, trivially fits on phone-grade GPU.

Loss used during training: MSELoss over the 24 outputs
(see training/train_landmarks.py).
"""

import torch
import torch.nn as nn


class _ConvBlock(nn.Module):
    """Conv → BN → ReLU → Conv → BN → ReLU → MaxPool."""

    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),            # halve spatial dims
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class LandmarkNet(nn.Module):
    """
    Lightweight landmark regressor for 12 eye keypoints.

    Input  : (B, 3, 96, 96)
    Output : (B, 24)   — 24 normalised coords in [0, 1]

    Spatial progression:
      96 → 48 → 24 → 12 → flat(12*12*128=18432) → 512 → 24
    """

    def __init__(self, num_outputs: int = 24):
        super().__init__()

        self.features = nn.Sequential(
            _ConvBlock(3,   32),   # 96→48
            _ConvBlock(32,  64),   # 48→24
            _ConvBlock(64, 128),   # 24→12
        )

        # After 3 MaxPool(2,2): spatial = 96/8 = 12
        self._flat_dim = 128 * 12 * 12   # = 18 432

        self.regressor = nn.Sequential(
            nn.Dropout(0.4),
            nn.Linear(self._flat_dim, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(512, num_outputs),
            nn.Sigmoid(),                  # outputs ∈ [0, 1]
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x : (B, 3, 96, 96)
        returns: (B, 24)
        """
        feat = self.features(x)            # (B, 128, 12, 12)
        feat = feat.view(feat.size(0), -1) # (B, 18432)
        return self.regressor(feat)        # (B, 24)


# ── Sanity check (run this file directly) ────────────────────────────────────
if __name__ == "__main__":
    net   = LandmarkNet()
    dummy = torch.randn(4, 3, 96, 96)
    out   = net(dummy)
    assert out.shape == (4, 24), f"Unexpected shape: {out.shape}"
    assert out.min() >= 0.0 and out.max() <= 1.0, "Sigmoid bound violated"
    param_count = sum(p.numel() for p in net.parameters())
    print(f"LandmarkNet OK — output {out.shape}, params: {param_count:,}")
