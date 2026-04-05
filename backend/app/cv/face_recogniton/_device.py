"""
face_rec/_device.py
────────────────────
Automatic device selection for RTX/GTX/mobile Nvidia GPUs.

Priority order:
  1. FACE_REC_DEVICE env var  (e.g. "cuda", "cuda:0", "cpu")
  2. CUDA if available and has enough free memory
  3. CPU fallback

For a 6 GB RTX 3050:
  • FaceEncoderNet  (ResNet-18 head) ≈  45 MB VRAM
  • LandmarkNet     (small CNN)      ≈   5 MB VRAM
  Both fit easily; we only warn if free VRAM < 512 MB.
"""

from __future__ import annotations

import logging
import os

import torch

logger = logging.getLogger(__name__)

# Minimum free VRAM (bytes) we require before using CUDA
_MIN_FREE_VRAM = 512 * 1024 * 1024   # 512 MB


def resolve_device() -> torch.device:
    """
    Return the best available torch.device for inference.

    Checks (in order):
      1. FACE_REC_DEVICE environment variable
      2. CUDA availability + free-memory guard
      3. CPU
    """
    # ── 1. Env-var override ───────────────────────────────────────────────────
    env = os.environ.get("FACE_REC_DEVICE", "").strip().lower()
    if env:
        device = torch.device(env)
        logger.info("face_rec: device forced by FACE_REC_DEVICE='%s' → %s", env, device)
        return device

    # ── 2. CUDA auto-detect ───────────────────────────────────────────────────
    if torch.cuda.is_available():
        idx        = torch.cuda.current_device()
        props      = torch.cuda.get_device_properties(idx)
        total_vram = props.total_memory
        # Reserved + allocated already in use
        reserved   = torch.cuda.memory_reserved(idx)
        allocated  = torch.cuda.memory_allocated(idx)
        free_vram  = total_vram - reserved

        logger.info(
            "face_rec: CUDA device %d — %s | VRAM total=%.0f MB  free≈%.0f MB",
            idx, props.name,
            total_vram / 1024**2,
            free_vram  / 1024**2,
        )

        if free_vram >= _MIN_FREE_VRAM:
            device = torch.device("cuda", idx)
            logger.info("face_rec: using CUDA (%s)", props.name)
            return device
        else:
            logger.warning(
                "face_rec: CUDA available but free VRAM %.0f MB < %.0f MB threshold "
                "— falling back to CPU.",
                free_vram / 1024**2, _MIN_FREE_VRAM / 1024**2,
            )

    # ── 3. CPU fallback ───────────────────────────────────────────────────────
    logger.info("face_rec: using CPU")
    return torch.device("cpu")


# Module-level singleton — resolved once at import time
DEVICE: torch.device = resolve_device()
