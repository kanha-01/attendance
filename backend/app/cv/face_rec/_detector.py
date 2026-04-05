"""
face_rec/_detector.py
─────────────────────
Pure-OpenCV face detection using the bundled Haar Cascade.

Why Haar Cascade instead of a DNN detector?
  • Zero extra model weights to ship — OpenCV bundles the XML file.
  • CPU-only, single dependency (opencv-python).
  • Sufficient accuracy for the frontal-face attendance use-case.

If you later want better accuracy (angles, occlusion) you can swap this
file for an OpenCV DNN detector (res10_300x300_ssd) or MediaPipe Face
Detection — the rest of the package is unaffected.
"""

from __future__ import annotations

import logging
import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ── Cascade loading (module-level singleton) ──────────────────────────────────

def _load_cascade() -> cv2.CascadeClassifier:
    """Load the frontal-face cascade bundled with opencv-python."""
    xml_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade  = cv2.CascadeClassifier(xml_path)
    if cascade.empty():
        raise RuntimeError(
            f"Failed to load Haar Cascade from {xml_path}. "
            "Ensure opencv-python is installed correctly."
        )
    logger.debug("Haar Cascade loaded from %s", xml_path)
    return cascade


_FRONTAL_CASCADE: cv2.CascadeClassifier | None = None


def _get_cascade() -> cv2.CascadeClassifier:
    global _FRONTAL_CASCADE
    if _FRONTAL_CASCADE is None:
        _FRONTAL_CASCADE = _load_cascade()
    return _FRONTAL_CASCADE


# ── Detection parameters ──────────────────────────────────────────────────────

_SCALE_FACTOR   = 1.1    # image pyramid scale between levels
_MIN_NEIGHBORS  = 5      # higher → fewer but more reliable detections
_MIN_FACE_SIZE  = (40, 40)   # ignore tiny false-positive rectangles


# ── Public function ───────────────────────────────────────────────────────────

def detect_faces(
    rgb_img: np.ndarray,
) -> list[tuple[int, int, int, int]]:
    """
    Detect frontal faces in an RGB uint8 numpy array.

    Converts to grayscale internally (Haar Cascade requirement).
    Applies CLAHE histogram equalisation for better performance under
    variable lighting conditions (common in classroom/exit-gate settings).

    Returns
    -------
    list of (top, right, bottom, left) tuples — face_recognition convention.
    """
    cascade = _get_cascade()

    # Convert RGB → Grayscale
    gray = cv2.cvtColor(rgb_img, cv2.COLOR_RGB2GRAY)

    # CLAHE equalisation — robust under uneven lighting
    clahe    = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray_eq  = clahe.apply(gray)

    rects = cascade.detectMultiScale(
        gray_eq,
        scaleFactor  = _SCALE_FACTOR,
        minNeighbors = _MIN_NEIGHBORS,
        minSize      = _MIN_FACE_SIZE,
        flags        = cv2.CASCADE_SCALE_IMAGE,
    )

    # OpenCV returns (x, y, w, h) — convert to (top, right, bottom, left)
    locations: list[tuple[int, int, int, int]] = []
    if len(rects) == 0:
        return locations

    for (x, y, w, h) in rects:
        top    = int(y)
        right  = int(x + w)
        bottom = int(y + h)
        left   = int(x)
        locations.append((top, right, bottom, left))

    return locations
