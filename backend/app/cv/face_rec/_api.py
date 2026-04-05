"""
face_rec/_api.py
────────────────
Implements the four public functions by delegating to:
  • detector.py  – OpenCV Haar-Cascade face_locations()
  • _landmark_runner  – PyTorch landmark regressor
  • _encoder_runner   – PyTorch face encoder

Model weights are loaded lazily (once on first call) and cached in
module-level singletons so repeated inference calls pay zero reload cost.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from face_rec._detector import detect_faces
from face_rec._runners  import get_landmark_runner, get_encoder_runner

logger = logging.getLogger(__name__)


# ── 1. face_locations ────────────────────────────────────────────────────────

def face_locations(
    img: np.ndarray,
    model: str = "hog",          # accepted but ignored — we always use OpenCV
) -> list[tuple[int, int, int, int]]:
    """
    Detect faces in an RGB numpy array.

    Parameters
    ----------
    img   : H×W×3 uint8 RGB array
    model : ignored (kept for API parity with face_recognition)

    Returns
    -------
    list of (top, right, bottom, left) int tuples — one per detected face.
    Empty list when no faces found.
    """
    return detect_faces(img)


# ── 2. face_landmarks ────────────────────────────────────────────────────────

def face_landmarks(
    img: np.ndarray,
    face_locations: Optional[list[tuple[int, int, int, int]]] = None,
) -> list[dict[str, list[tuple[int, int]]]]:
    """
    Predict eye landmarks for every face in *face_locations*.

    Parameters
    ----------
    img            : H×W×3 uint8 RGB array
    face_locations : list of (top, right, bottom, left) tuples.
                     If None, face_locations() is called internally.

    Returns
    -------
    list of dicts, one per face:
      {
        "left_eye":  [(x,y), (x,y), (x,y), (x,y), (x,y), (x,y)],
        "right_eye": [(x,y), (x,y), (x,y), (x,y), (x,y), (x,y)],
      }
    """
    if face_locations is None:
        face_locations = detect_faces(img)

    if not face_locations:
        return []

    runner = get_landmark_runner()
    return runner.predict_batch(img, face_locations)


# ── 3. face_encodings ────────────────────────────────────────────────────────

def face_encodings(
    img: np.ndarray,
    known_face_locations: Optional[list[tuple[int, int, int, int]]] = None,
) -> list[np.ndarray]:
    """
    Compute 128-d L2-normalised face embeddings.

    Parameters
    ----------
    img                  : H×W×3 uint8 RGB array
    known_face_locations : list of (top, right, bottom, left) tuples.
                           If None, face_locations() is called internally.

    Returns
    -------
    list of np.ndarray(128,) float32 — one per face, in the same order.
    """
    if known_face_locations is None:
        known_face_locations = detect_faces(img)

    if not known_face_locations:
        return []

    runner = get_encoder_runner()
    return runner.encode_batch(img, known_face_locations)


# ── 4. face_distance ─────────────────────────────────────────────────────────

def face_distance(
    face_encodings: list[np.ndarray],
    face_to_compare: np.ndarray,
) -> np.ndarray:
    """
    Compute Euclidean distance between *face_to_compare* and every encoding
    in *face_encodings*.

    Parameters
    ----------
    face_encodings   : list of np.ndarray(128,)
    face_to_compare  : np.ndarray(128,)

    Returns
    -------
    np.ndarray of float64 distances, shape (len(face_encodings),).
    Returns empty array when face_encodings is empty.
    """
    if not face_encodings:
        return np.array([], dtype=np.float64)

    known = np.stack(face_encodings, axis=0)          # (N, 128)
    diff  = known - face_to_compare[np.newaxis, :]    # (N, 128)
    return np.linalg.norm(diff, axis=1)               # (N,)
