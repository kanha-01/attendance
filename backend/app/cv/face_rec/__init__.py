"""
face_rec
────────
Drop-in replacement for the subset of `face_recognition` used in
face_processor.py and liveness_detector.py.

Public API (exact signature parity with face_recognition):
  face_locations(img, model="hog")            → list[(top,right,bottom,left)]
  face_landmarks(img, face_locations=None)    → list[dict]
  face_encodings(img, known_face_locations=None) → list[np.ndarray(128,)]
  face_distance(face_encodings, face_to_compare) → np.ndarray
"""

from face_rec._api import (
    face_locations,
    face_landmarks,
    face_encodings,
    face_distance,
)

__all__ = [
    "face_locations",
    "face_landmarks",
    "face_encodings",
    "face_distance",
]
