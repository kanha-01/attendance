"""
liveness_detector.py
─────────────────────
Eye Aspect Ratio (EAR) blink detection for anti-spoofing.

Algorithm:
  1. Extract left_eye / right_eye landmarks (6 points each) from face_recognition.
  2. Compute EAR = (||p2-p6|| + ||p3-p5||) / (2 · ||p1-p4||)
  3. When EAR drops below EAR_THRESHOLD for ≥ EAR_CONSEC_FRAMES consecutive
     frames and then rises back, count one blink.
  4. A student is "live" once REQUIRED_BLINKS blinks are recorded.

Per-session state is maintained in a LivenessTracker instance that lives for
the lifetime of one WebSocket attendance session.
"""

from typing import Optional
import numpy as np
from scipy.spatial import distance as dist


# ── Config ────────────────────────────────────────────────────────────────────

EAR_THRESHOLD      = 0.24    # below this → eye considered closed
EAR_CONSEC_FRAMES  = 2       # consecutive closed frames required
REQUIRED_BLINKS    = 1       # blinks needed to pass liveness check
POSITION_TOLERANCE = 80      # pixels – same face if centre moved < this


# ── Math ──────────────────────────────────────────────────────────────────────

def _ear(eye_pts: list) -> float:
    """
    Compute Eye Aspect Ratio for 6 landmark points.
      p0 = left corner, p1 = top-left, p2 = top-right,
      p3 = right corner, p4 = bottom-right, p5 = bottom-left
    """
    A = dist.euclidean(eye_pts[1], eye_pts[5])
    B = dist.euclidean(eye_pts[2], eye_pts[4])
    C = dist.euclidean(eye_pts[0], eye_pts[3])
    if C < 1e-6:
        return 1.0
    return (A + B) / (2.0 * C)


def compute_avg_ear(landmarks: dict) -> Optional[float]:
    """Compute average EAR over both eyes. Returns None if landmarks missing."""
    left_eye  = landmarks.get("left_eye")
    right_eye = landmarks.get("right_eye")
    if not left_eye or not right_eye:
        return None
    if len(left_eye) < 6 or len(right_eye) < 6:
        return None
    return (_ear(left_eye) + _ear(right_eye)) / 2.0


# ── Per-session tracker ───────────────────────────────────────────────────────

class FaceState:
    """Tracks blink state for one face across consecutive frames."""

    def __init__(self, center: tuple):
        self.center          = center   # (y, x) of bounding-box centre
        self.ear_counter     = 0        # frames where EAR < threshold
        self.blink_count     = 0
        self.liveness_passed = False

    def update(self, ear: float) -> None:
        if ear < EAR_THRESHOLD:
            self.ear_counter += 1
        else:
            if self.ear_counter >= EAR_CONSEC_FRAMES:
                self.blink_count += 1
                if self.blink_count >= REQUIRED_BLINKS:
                    self.liveness_passed = True
            self.ear_counter = 0


class LivenessTracker:
    """
    Manages FaceState objects for all faces seen in a session.
    Call update_frame() for every incoming video frame.
    """

    def __init__(self):
        self._states: list[FaceState] = []

    # ── Internal helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _centre(location: tuple) -> tuple:
        top, right, bottom, left = location
        return ((top + bottom) / 2.0, (left + right) / 2.0)

    def _find_or_create(self, centre: tuple) -> FaceState:
        for state in self._states:
            if dist.euclidean(state.center, centre) < POSITION_TOLERANCE:
                state.center = centre   # update position
                return state
        new_state = FaceState(centre)
        self._states.append(new_state)
        return new_state

    def _find(self, centre: tuple) -> Optional[FaceState]:
        best, best_d = None, POSITION_TOLERANCE
        for state in self._states:
            d = dist.euclidean(state.center, centre)
            if d < best_d:
                best_d = d
                best = state
        return best

    # ── Public API ────────────────────────────────────────────────────────────

    def update_frame(self, face_detections: list) -> list[dict]:
        """
        Process all faces detected in one frame.

        Args:
            face_detections: list of {location, encoding, landmarks} dicts

        Returns:
            list of {location, encoding, liveness_passed, blink_count, avg_ear}
        """
        results = []
        for detection in face_detections:
            loc       = detection["location"]
            landmarks = detection.get("landmarks", {})
            centre    = self._centre(loc)

            state = self._find_or_create(centre)
            ear   = compute_avg_ear(landmarks)

            if ear is not None:
                state.update(ear)

            results.append({
                "location"        : loc,
                "encoding"        : detection["encoding"],
                "liveness_passed" : state.liveness_passed,
                "blink_count"     : state.blink_count,
                "avg_ear"         : round(ear, 3) if ear else None,
            })
        return results

    def is_live(self, face_location: tuple) -> bool:
        """Return True if the face at *face_location* has passed liveness."""
        centre = self._centre(face_location)
        state  = self._find(centre)
        return state.liveness_passed if state else False

    def purge_stale(self, active_centres: list[tuple]) -> None:
        """Remove states for faces that have left the frame (optional cleanup)."""
        self._states = [
            s for s in self._states
            if any(dist.euclidean(s.center, c) < POSITION_TOLERANCE for c in active_centres)
        ]
