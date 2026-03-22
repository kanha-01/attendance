from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from .. import models, schemas
from ..auth import require_student

router = APIRouter(prefix="/api/students", tags=["students"])


def _get_student(user, db) -> models.Student:
    student = db.query(models.Student).filter(models.Student.user_id == user.id).first()
    if not student:
        raise HTTPException(404, "Student profile not found")
    return student


# ── Enroll in a course ────────────────────────────────────────────────────────

@router.post("/enroll")
def enroll_course(
    payload: schemas.EnrollSchema,
    db: Session = Depends(get_db),
    current_user=Depends(require_student),
):
    student = _get_student(current_user, db)

    course = db.query(models.Course).filter(
        models.Course.enrollment_key == payload.enrollment_key
    ).first()
    if not course:
        raise HTTPException(404, "Invalid enrollment key")

    existing = db.query(models.Enrollment).filter_by(
        student_id=student.id, course_id=course.id
    ).first()
    if existing:
        raise HTTPException(409, "Already enrolled in this course")

    enrollment = models.Enrollment(student_id=student.id, course_id=course.id)
    db.add(enrollment)
    db.commit()
    return {"message": f"Successfully enrolled in '{course.name}'"}


# ── All courses (for browsing / enrolling) ────────────────────────────────────

@router.get("/all-courses")
def all_courses(
    db: Session = Depends(get_db),
    current_user=Depends(require_student),
):
    student = _get_student(current_user, db)
    enrolled_ids = {e.course_id for e in student.enrollments}

    courses = db.query(models.Course).all()
    result = []
    for c in courses:
        count = db.query(func.count(models.Enrollment.id)).filter(
            models.Enrollment.course_id == c.id
        ).scalar()
        result.append({
            "id": c.id,
            "name": c.name,
            "faculty_name": c.faculty.name if c.faculty else "Unknown",
            "enrollment_key": c.enrollment_key,
            "min_attendance_threshold": c.min_attendance_threshold,
            "student_count": count,
            "already_enrolled": c.id in enrolled_ids,
        })
    return result


# ── Enrolled courses with attendance stats ────────────────────────────────────

@router.get("/enrolled-courses")
def enrolled_courses(
    db: Session = Depends(get_db),
    current_user=Depends(require_student),
):
    student = _get_student(current_user, db)
    result = []

    for enrollment in student.enrollments:
        course = enrollment.course

        # Total unique class dates for this course
        total_classes = db.query(func.count(func.distinct(models.Attendance.date))).filter(
            models.Attendance.course_id == course.id
        ).scalar() or 0

        # Attended by this student
        attended = db.query(func.count(models.Attendance.id)).filter(
            models.Attendance.course_id == course.id,
            models.Attendance.student_id == student.id,
            models.Attendance.status == True,
        ).scalar() or 0

        pct = round((attended / total_classes * 100) if total_classes > 0 else 0.0, 1)

        result.append({
            "course_id": course.id,
            "course_name": course.name,
            "faculty_name": course.faculty.name if course.faculty else "Unknown",
            "total_classes": total_classes,
            "attended": attended,
            "percentage": pct,
            "min_threshold": course.min_attendance_threshold,
            "below_threshold": pct < course.min_attendance_threshold and total_classes > 0,
        })

    return result


# ── Student profile ───────────────────────────────────────────────────────────

@router.get("/profile")
def get_profile(
    db: Session = Depends(get_db),
    current_user=Depends(require_student),
):
    student = _get_student(current_user, db)
    return {
        "id": student.id,
        "name": student.name,
        "reg_number": student.reg_number,
        "college_email": student.college_email,
        "serial_number": student.serial_number,
        "username": current_user.username,
        "has_face_data": bool(student.face_encodings),
    }
