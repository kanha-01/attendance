"""
face_rec/_runners.py
────────────────────
Lazy-loading singletons for the two PyTorch inference pipelines.

  LandmarkRunner  – loads LandmarkNet, exposes predict_batch()
  EncoderRunner   – loads FaceEncoderNet, exposes encode_batch()

Both runners:
  • Use torchvision transforms for preprocessing.
  • Device is resolved automatically by _device.py (CUDA if available,
    CPU otherwise). Override with env var FACE_REC_DEVICE=cpu|cuda.
  • Crop faces from the full image using the face_locations bounding boxes,
    with a small margin to include context (eyebrows, temples).
  • Cache the loaded model in a module-level singleton — first call pays the
    I/O cost, every subsequent call is free.

Model weight paths are resolved from the environment or fall back to
reasonable defaults relative to this file.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from torchvision import transforms

from face_rec.models.landmark_net import LandmarkNet
from face_rec.models.encoder_net  import FaceEncoderNet
from face_rec._device             import DEVICE

logger = logging.getLogger(__name__)

# ── Default weight paths (override via env vars) ──────────────────────────────

_PKG_DIR = Path(__file__).parent

LANDMARK_WEIGHTS = Path(
    os.environ.get("FACE_REC_LANDMARK_WEIGHTS",
                   str(_PKG_DIR / "weights" / "landmark_net.pth"))
)
ENCODER_WEIGHTS  = Path(
    os.environ.get("FACE_REC_ENCODER_WEIGHTS",
                   str(_PKG_DIR / "weights" / "encoder_net.pth"))
)

# ── Preprocessing constants ───────────────────────────────────────────────────

LANDMARK_INPUT_SIZE = 96    # pixels — must match training resolution
ENCODER_INPUT_SIZE  = 112   # pixels — must match training resolution

# Standard ImageNet stats work well as a starting point for face models
_IMAGENET_MEAN = [0.485, 0.456, 0.406]
_IMAGENET_STD  = [0.229, 0.224, 0.225]

_landmark_transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((LANDMARK_INPUT_SIZE, LANDMARK_INPUT_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(_IMAGENET_MEAN, _IMAGENET_STD),
])

_encoder_transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((ENCODER_INPUT_SIZE, ENCODER_INPUT_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(_IMAGENET_MEAN, _IMAGENET_STD),
])

# ── Face cropping helper ──────────────────────────────────────────────────────

_CROP_MARGIN = 0.15   # expand bounding box by 15% on each side

def _crop_face(
    rgb_img: np.ndarray,
    location: tuple[int, int, int, int],
) -> np.ndarray:
    """
    Crop a face from *rgb_img* with a small margin, clamping to image bounds.

    Parameters
    ----------
    rgb_img  : H×W×3 uint8 RGB
    location : (top, right, bottom, left) — face_recognition convention

    Returns
    -------
    Cropped RGB uint8 array.
    """
    h, w  = rgb_img.shape[:2]
    top, right, bottom, left = location

    face_h = bottom - top
    face_w = right  - left
    margin_y = int(face_h * _CROP_MARGIN)
    margin_x = int(face_w * _CROP_MARGIN)

    y0 = max(0, top    - margin_y)
    y1 = min(h, bottom + margin_y)
    x0 = max(0, left   - margin_x)
    x1 = min(w, right  + margin_x)

    return rgb_img[y0:y1, x0:x1]


# ── LandmarkRunner ────────────────────────────────────────────────────────────

class LandmarkRunner:
    """
    Wraps LandmarkNet for inference.

    The model outputs 24 raw values per face (12 points × 2 coords).
    Coordinates are normalised to [0, 1] relative to the cropped face crop;
    we un-normalise them back to pixel coordinates in the full image.

    Output layout (indices into the 24-value vector):
      [0..11]  → left_eye  : p0x,p0y, p1x,p1y, … p5x,p5y
      [12..23] → right_eye : p0x,p0y, p1x,p1y, … p5x,p5y
    """

    def __init__(self, device: torch.device | str | None = None):
        self.device = torch.device(device) if device else DEVICE
        self.model  = self._load_model()
        self.model.eval()

    def _load_model(self) -> LandmarkNet:
        model = LandmarkNet()
        if LANDMARK_WEIGHTS.exists():
            state = torch.load(LANDMARK_WEIGHTS, map_location=self.device)
            model.load_state_dict(state)
            logger.info("LandmarkNet weights loaded from %s", LANDMARK_WEIGHTS)
        else:
            logger.warning(
                "LandmarkNet weights not found at %s — "
                "using random initialisation. Run training/train_landmarks.py first.",
                LANDMARK_WEIGHTS,
            )
        return model.to(self.device)

    def predict_batch(
        self,
        rgb_img: np.ndarray,
        face_locations: list[tuple[int, int, int, int]],
    ) -> list[dict[str, list[tuple[int, int]]]]:
        """Predict landmarks for all faces; return list of landmark dicts."""
        results = []

        with torch.inference_mode():
            for loc in face_locations:
                top, right, bottom, left = loc
                crop = _crop_face(rgb_img, loc)

                # Actual crop bounds (with margin, clamped)
                h_img, w_img = rgb_img.shape[:2]
                face_h = bottom - top
                face_w = right  - left
                margin_y = int(face_h * _CROP_MARGIN)
                margin_x = int(face_w * _CROP_MARGIN)
                y0 = max(0, top    - margin_y)
                x0 = max(0, left   - margin_x)
                crop_h, crop_w = crop.shape[:2]

                tensor = _landmark_transform(crop).unsqueeze(0).to(self.device)
                preds  = self.model(tensor).squeeze(0).cpu().numpy()   # (24,)

                # Un-normalise from [0,1] crop space → full-image pixel coords
                left_pts  = _unnorm_eye(preds[0:12],  x0, y0, crop_w, crop_h)
                right_pts = _unnorm_eye(preds[12:24], x0, y0, crop_w, crop_h)

                results.append({
                    "left_eye":  left_pts,
                    "right_eye": right_pts,
                })

        return results


def _unnorm_eye(
    coords: np.ndarray,       # shape (12,) — 6 × (x_norm, y_norm)
    x0: int, y0: int,
    crop_w: int, crop_h: int,
) -> list[tuple[int, int]]:
    """Convert 6 normalised (x,y) pairs → absolute (x,y) pixel tuples."""
    pts = []
    for i in range(0, 12, 2):
        x_px = int(coords[i]     * crop_w + x0)
        y_px = int(coords[i + 1] * crop_h + y0)
        pts.append((x_px, y_px))
    return pts   # [(x,y), …] × 6


# ── EncoderRunner ─────────────────────────────────────────────────────────────

class EncoderRunner:
    """
    Wraps FaceEncoderNet for inference.

    The model outputs a 128-d L2-normalised embedding per face.
    """

    def __init__(self, device: torch.device | str | None = None):
        self.device = torch.device(device) if device else DEVICE
        self.model  = self._load_model()
        self.model.eval()

    def _load_model(self) -> FaceEncoderNet:
        model = FaceEncoderNet()
        if ENCODER_WEIGHTS.exists():
            state = torch.load(ENCODER_WEIGHTS, map_location=self.device)
            model.load_state_dict(state)
            logger.info("FaceEncoderNet weights loaded from %s", ENCODER_WEIGHTS)
        else:
            logger.warning(
                "FaceEncoderNet weights not found at %s — "
                "using random initialisation. Run training/train_encoder.py first.",
                ENCODER_WEIGHTS,
            )
        return model.to(self.device)

    def encode_batch(
        self,
        rgb_img: np.ndarray,
        face_locations: list[tuple[int, int, int, int]],
    ) -> list[np.ndarray]:
        """Return list of 128-d float32 numpy arrays, one per face."""
        embeddings = []

        with torch.inference_mode():
            for loc in face_locations:
                crop   = _crop_face(rgb_img, loc)
                tensor = _encoder_transform(crop).unsqueeze(0).to(self.device)
                emb    = self.model(tensor).squeeze(0).cpu().numpy()   # (128,)
                embeddings.append(emb.astype(np.float32))

        return embeddings


# ── Module-level lazy singletons ──────────────────────────────────────────────

_landmark_runner: Optional[LandmarkRunner] = None
_encoder_runner:  Optional[EncoderRunner]  = None


def get_landmark_runner() -> LandmarkRunner:
    """Return the shared LandmarkRunner (device auto-selected via _device.py)."""
    global _landmark_runner
    if _landmark_runner is None:
        _landmark_runner = LandmarkRunner()
    return _landmark_runner


def get_encoder_runner() -> EncoderRunner:
    """Return the shared EncoderRunner (device auto-selected via _device.py)."""
    global _encoder_runner
    if _encoder_runner is None:
        _encoder_runner = EncoderRunner()
    return _encoder_runner
