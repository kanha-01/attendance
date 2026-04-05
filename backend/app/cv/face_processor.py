"""
face_processor.py
─────────────────
Utilities for:
  • Extracting 128-d face encodings from uploaded images
  • Averaging multiple encodings for a single student
  • Comparing a live encoding against a database of known encodings
"""

import json
import base64
import logging
from io import BytesIO
from typing import Optional

import numpy as np
from PIL import Image

try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
except ImportError:
    FACE_RECOGNITION_AVAILABLE = False
    logging.warning("face_recognition not installed – CV features disabled.")


logger = logging.getLogger(__name__)

MATCH_TOLERANCE = 0.52          # lower = stricter (default 0.6)
REQUIRED_FACE_COUNT = 1         # exactly one face per uploaded photo


# ── Encoding helpers ──────────────────────────────────────────────────────────

def image_bytes_to_rgb_array(image_bytes: bytes) -> np.ndarray:
    """Convert raw image bytes → RGB numpy array."""
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    return np.array(img)


def extract_encoding_from_image(image_bytes: bytes) -> Optional[np.ndarray]:
    """
    Extract a single 128-d face encoding from image bytes.
    Returns None if no face or multiple faces detected.
    """
    if not FACE_RECOGNITION_AVAILABLE:
        raise RuntimeError("face_recognition library not installed")

    rgb = image_bytes_to_rgb_array(image_bytes)
    # Use HOG for registration to keep request latency practical on CPU-only setups.
    locations = face_recognition.face_locations(rgb, model="hog")

    if len(locations) != REQUIRED_FACE_COUNT:
        logger.warning(
            "Expected 1 face, found %d in uploaded image", len(locations)
        )
        return None

    encodings = face_recognition.face_encodings(rgb, known_face_locations=locations)
    return encodings[0] if encodings else None


def process_registration_photos(photos_bytes: list[bytes]) -> Optional[list]:
    """
    Process up to 3 registration photos, extract encodings, and return
    a JSON-serialisable list of the individual encodings (averaged later
    at match-time for robustness).
    Returns None if any photo fails face detection.
    """
    encodings = []
    for idx, photo in enumerate(photos_bytes):
        enc = extract_encoding_from_image(photo)
        if enc is None:
            raise ValueError(
                f"Photo {idx + 1}: exactly one face required, but none or multiple detected."
            )
        encodings.append(enc.tolist())

    return encodings  # list of 3 × [128 floats]


def serialize_encodings(encodings: list) -> str:
    """Serialize list-of-lists to JSON string for DB storage."""
    return json.dumps(encodings)


def deserialize_encodings(json_str: str) -> list[np.ndarray]:
    """Deserialize DB JSON string back to list of numpy arrays."""
    raw = json.loads(json_str)
    return [np.array(e) for e in raw]


def get_average_encoding(encodings: list[np.ndarray]) -> np.ndarray:
    """Average multiple encodings into one representative vector."""
    return np.mean(encodings, axis=0)


# ── Live-frame face detection ─────────────────────────────────────────────────

def decode_base64_frame(b64_string: str) -> Optional[np.ndarray]:
    """Decode a base64-encoded JPEG/PNG frame from the browser into RGB numpy."""
    try:
        if "," in b64_string:           # strip data-URL prefix
            b64_string = b64_string.split(",", 1)[1]
        img_bytes = base64.b64decode(b64_string)
        return image_bytes_to_rgb_array(img_bytes)
    except Exception as exc:
        logger.error("Frame decode error: %s", exc)
        return None


def find_faces_in_frame(rgb_frame: np.ndarray):
    """
    Detect face locations + encodings + landmarks in one frame.

    Returns:
        list of dicts:
          {
            "location": (top, right, bottom, left),
            "encoding": np.ndarray(128,),
            "landmarks": dict  (face_recognition landmark dict)
          }
    """
    if not FACE_RECOGNITION_AVAILABLE:
        return []

    small = np.ascontiguousarray(rgb_frame[::2, ::2])   # 50% scale
    locations_small = face_recognition.face_locations(small, model="hog")
    # Scale locations back to original size
    locations = [(t*2, r*2, b*2, l*2) for (t,r,b,l) in locations_small]
    encodings = face_recognition.face_encodings(rgb_frame, known_face_locations=locations)
    landmarks_list = face_recognition.face_landmarks(rgb_frame, face_locations=locations)

    results = []
    for loc, enc, lm in zip(locations, encodings, landmarks_list):
        results.append({
            "location": loc,
            "encoding": enc,
            "landmarks": lm,
        })
    return results


# ── Matching ──────────────────────────────────────────────────────────────────

def match_face_to_students(
    live_encoding: np.ndarray,
    students: list[dict]     # [{"student_id": int, "encodings": [np.ndarray, ...]}]
) -> Optional[int]:
    """
    Compare a live face encoding against a list of enrolled students.

    Returns the student_id of the best match, or None if no match found.
    Each student's multiple encodings are compared individually and the
    minimum distance is used.
    """
    best_student_id = None
    best_distance = MATCH_TOLERANCE  # threshold

    for student in students:
        stored_encs = student["encodings"]
        if not stored_encs:
            continue

        distances = face_recognition.face_distance(stored_encs, live_encoding)
        min_dist = float(np.min(distances))

        if min_dist < best_distance:
            best_distance = min_dist
            best_student_id = student["student_id"]

    return best_student_id
