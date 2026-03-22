"""
attendance_router.py
─────────────────────
WebSocket endpoint for real-time facial recognition attendance.

Protocol (JSON messages):
  Client → Server:
    { "type": "frame",  "data": "<base64-jpeg>" }
    { "type": "stop" }

  Server → Client:
    { "type": "status",  "message": "Session started for <course>" }
    { "type": "result",  "faces": [...], "marked": [...], "total_marked": N }
    { "type": "error",   "message": "..." }
    { "type": "stopped", "total_marked": N }
"""

import json
import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from .. import models
from ..auth import decode_token
from ..cv.face_processor import (
    decode_base64_frame,
    find_faces_in_frame,
    match_face_to_students,
    deserialize_encodings,
)
from ..cv.liveness_detector import LivenessTracker

router = APIRouter(tags=["attendance"])
logger = logging.getLogger(__name__)


# ── Helper: validate WS token ─────────────────────────────────────────────────

def _auth_ws(token: str, db: Session) -> Optional[models.User]:
    payload = decode_token(token)
    if not payload:
        return None
    user = db.query(models.User).filter(models.User.id == int(payload["sub"])).first()
    return user


# ── WebSocket attendance session ──────────────────────────────────────────────

@router.websocket("/ws/attendance/{course_id}")
async def attendance_session(
    websocket: WebSocket,
    course_id: int,
):
    await websocket.accept()

    db: Session = SessionLocal()
    try:
        # ── Auth via first message ────────────────────────────────────────────
        auth_msg = await websocket.receive_json()
        token = auth_msg.get("token", "")
        session_date_str = auth_msg.get("date", str(date.today()))

        try:
            session_date = datetime.strptime(session_date_str, "%Y-%m-%d").date()
        except ValueError:
            session_date = date.today()

        user = _auth_ws(token, db)
        if not user or user.role != "faculty":
            await websocket.send_json({"type": "error", "message": "Unauthorized"})
            return

        faculty = db.query(models.Faculty).filter(models.Faculty.user_id == user.id).first()
        if not faculty:
            await websocket.send_json({"type": "error", "message": "Faculty profile missing"})
            return

        course = db.query(models.Course).filter(
            models.Course.id == course_id,
            models.Course.faculty_id == faculty.id,
        ).first()
        if not course:
            await websocket.send_json({"type": "error", "message": "Course not found or not yours"})
            return

        # ── Load enrolled students' encodings ─────────────────────────────────
        enrollments = db.query(models.Enrollment).filter(
            models.Enrollment.course_id == course_id
        ).all()

        student_profiles = []
        for enr in enrollments:
            student = enr.student
            if student.face_encodings:
                encs = deserialize_encodings(student.face_encodings)
                student_profiles.append({
                    "student_id": student.id,
                    "name": student.name,
                    "reg_number": student.reg_number,
                    "encodings": encs,
                })

        await websocket.send_json({
            "type": "status",
            "message": f"Session started for '{course.name}' on {session_date_str}",
            "total_enrolled": len(enrollments),
            "total_with_face": len(student_profiles),
        })

        # ── Per-session state ─────────────────────────────────────────────────
        liveness_tracker = LivenessTracker()
        marked_this_session: set[int] = set()  # student_ids already marked present

        # Pre-load already-marked records for this date
        existing = db.query(models.Attendance).filter(
            models.Attendance.course_id == course_id,
            models.Attendance.date == session_date,
            models.Attendance.status == True,
        ).all()
        for rec in existing:
            marked_this_session.add(rec.student_id)

        # ── Main frame loop ───────────────────────────────────────────────────
        while True:
            try:
                msg = await websocket.receive_json()
            except WebSocketDisconnect:
                break

            if msg.get("type") == "stop":
                break

            if msg.get("type") != "frame":
                continue

            b64_data = msg.get("data", "")
            if not b64_data:
                continue

            # Decode frame
            rgb_frame = decode_base64_frame(b64_data)
            if rgb_frame is None:
                continue

            # Detect faces + encodings + landmarks
            try:
                detections = find_faces_in_frame(rgb_frame)
            except Exception as exc:
                logger.error("Frame processing error: %s", exc)
                continue

            # Update liveness tracker
            liveness_results = liveness_tracker.update_frame(detections)

            face_feedback = []
            newly_marked = []

            for face_info in liveness_results:
                encoding = face_info["encoding"]
                is_live = face_info["liveness_passed"]
                blink_count = face_info["blink_count"]
                ear = face_info["avg_ear"]

                matched_student_id = match_face_to_students(encoding, student_profiles)
                matched_name = None
                matched_reg = None

                if matched_student_id:
                    # Find name
                    for sp in student_profiles:
                        if sp["student_id"] == matched_student_id:
                            matched_name = sp["name"]
                            matched_reg = sp["reg_number"]
                            break

                    # Mark present if live and not yet marked
                    if is_live and matched_student_id not in marked_this_session:
                        _mark_present(db, matched_student_id, course_id, session_date)
                        marked_this_session.add(matched_student_id)
                        newly_marked.append({
                            "student_id": matched_student_id,
                            "name": matched_name,
                            "reg_number": matched_reg,
                        })

                top, right, bottom, left = face_info["location"]
                face_feedback.append({
                    "bbox": {"top": top, "right": right, "bottom": bottom, "left": left},
                    "matched_student_id": matched_student_id,
                    "name": matched_name,
                    "reg_number": matched_reg,
                    "liveness_passed": is_live,
                    "blink_count": blink_count,
                    "ear": ear,
                })

            await websocket.send_json({
                "type": "result",
                "faces": face_feedback,
                "newly_marked": newly_marked,
                "total_marked": len(marked_this_session),
                "marked_ids": list(marked_this_session),
            })

        await websocket.send_json({
            "type": "stopped",
            "total_marked": len(marked_this_session),
            "message": f"Session ended. {len(marked_this_session)} student(s) marked present.",
        })

    finally:
        db.close()


def _mark_present(db: Session, student_id: int, course_id: int, att_date: date):
    """Insert or update attendance record to present."""
    record = db.query(models.Attendance).filter_by(
        student_id=student_id,
        course_id=course_id,
        date=att_date,
    ).first()

    if record:
        record.status = True
    else:
        record = models.Attendance(
            student_id=student_id,
            course_id=course_id,
            date=att_date,
            status=True,
        )
        db.add(record)
    db.commit()


# ── REST: Manual attendance override ─────────────────────────────────────────

@router.get("/api/attendance/{course_id}")
def get_attendance(
    course_id: int,
    att_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Return attendance records for a course (and optionally a specific date)."""
    from ..database import get_db  # noqa
    query = db.query(models.Attendance).filter(models.Attendance.course_id == course_id)
    if att_date:
        try:
            d = datetime.strptime(att_date, "%Y-%m-%d").date()
            query = query.filter(models.Attendance.date == d)
        except ValueError:
            raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    records = query.all()
    return [
        {
            "id": r.id,
            "student_id": r.student_id,
            "student_name": r.student.name if r.student else None,
            "reg_number": r.student.reg_number if r.student else None,
            "date": str(r.date),
            "status": r.status,
        }
        for r in records
    ]


# Fix the missing import for get_db in the REST endpoint
from fastapi import Depends as _Depends  # noqa
