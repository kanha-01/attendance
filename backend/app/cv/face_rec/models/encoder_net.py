"""
face_rec/models/encoder_net.py
───────────────────────────────
FaceEncoderNet — ResNet-18 backbone that outputs a 128-d L2-normalised
face embedding, compatible with Euclidean-distance matching used by
face_processor.py's match_face_to_students().

Architecture
────────────
  ResNet-18 (pretrained ImageNet weights available but not required)
    └─ replace avgpool+fc with:
         AdaptiveAvgPool2d(1)
         → Flatten
         → Linear(512 → 256) + BN + ReLU
         → Linear(256 → 128)
         → L2-normalise

Input  : (B, 3, 112, 112)  — aligned face crop
Output : (B, 128)          — L2-normalised embedding

Why ResNet-18?
  • Well-studied, robust feature hierarchy.
  • 512-d penultimate features → easy to project to 128-d.
  • ~11 M parameters — fits in RAM, fast on modern CPU.
  • torchvision provides it without extra installs.

Loss used during training: TripletMarginLoss with p=2 (Euclidean).
(see training/train_encoder.py)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision.models import resnet18


class FaceEncoderNet(nn.Module):
    """
    ResNet-18 face encoder → 128-d L2-normalised embedding.

    Parameters
    ----------
    pretrained : bool
        Load ImageNet-pretrained weights for the ResNet backbone.
        Recommended: True — gives a much better initialisation even
        for faces and dramatically speeds up convergence.
    embedding_dim : int
        Dimensionality of the output embedding (default 128).
    """

    def __init__(
        self,
        pretrained:    bool = False,   # set True when training
        embedding_dim: int  = 128,
    ):
        super().__init__()

        # ── Backbone ──────────────────────────────────────────────────────────
        backbone = resnet18(weights="IMAGENET1K_V1" if pretrained else None)

        # Keep everything except the original avgpool+fc
        self.backbone = nn.Sequential(
            backbone.conv1,
            backbone.bn1,
            backbone.relu,
            backbone.maxpool,
            backbone.layer1,
            backbone.layer2,
            backbone.layer3,
            backbone.layer4,
        )
        # After layer4: spatial = 112/32 = 3 (roughly), channels = 512

        # ── Embedding head ────────────────────────────────────────────────────
        self.pool = nn.AdaptiveAvgPool2d(1)   # → (B, 512, 1, 1)

        self.embed_head = nn.Sequential(
            nn.Flatten(),                       # (B, 512)
            nn.Linear(512, 256, bias=False),
            nn.BatchNorm1d(256),
            nn.ReLU(inplace=True),
            nn.Linear(256, embedding_dim, bias=False),
        )
        # No activation here — L2 normalisation acts as the final step.

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x       : (B, 3, 112, 112)   normalised face crop
        returns : (B, 128)            L2-normalised embedding
        """
        feat = self.backbone(x)          # (B, 512, H', W')
        feat = self.pool(feat)           # (B, 512, 1, 1)
        emb  = self.embed_head(feat)     # (B, 128)
        return F.normalize(emb, p=2, dim=1)   # unit sphere ‖emb‖=1


# ── Sanity check ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    net   = FaceEncoderNet(pretrained=False)
    dummy = torch.randn(8, 3, 112, 112)
    out   = net(dummy)
    assert out.shape == (8, 128), f"Unexpected shape: {out.shape}"
    norms = torch.norm(out, dim=1)
    assert torch.allclose(norms, torch.ones(8), atol=1e-5), \
        "Embeddings not L2-normalised"
    param_count = sum(p.numel() for p in net.parameters())
    print(f"FaceEncoderNet OK — output {out.shape}, params: {param_count:,}")
