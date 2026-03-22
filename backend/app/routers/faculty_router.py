import random
import string
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from .. import models, schemas
from ..auth import require_faculty

router = APIRouter(prefix="/api/faculty", tags=["faculty"])


def _gen_key(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


def _get_faculty(user, db) -> models.Faculty:
    faculty = db.query(models.Faculty).filter(models.Faculty.user_id == user.id).first()
    if not faculty:
        raise HTTPException(404, "Faculty profile not found")
    return faculty


# ── Create course ─────────────────────────────────────────────────────────────

@router.post("/courses", status_code=201)
def create_course(
    payload: schemas.CourseCreateSchema,
    db: Session = Depends(get_db),
    current_user=Depends(require_faculty),
):
    faculty = _get_faculty(current_user, db)

    # Generate unique enrollment key
    key = _gen_key()
    while db.query(models.Course).filter(models.Course.enrollment_key == key).first():
        key = _gen_key()

    course = models.Course(
        name=payload.name,
        faculty_id=faculty.id,
        enrollment_key=key,
        min_attendance_threshold=payload.min_attendance_threshold,
    )
    db.add(course)
    db.commit()
    db.refresh(course)

    return {
        "id": course.id,
        "name": course.name,
        "enrollment_key": course.enrollment_key,
        "min_attendance_threshold": course.min_attendance_threshold,
    }


# ── List faculty courses ──────────────────────────────────────────────────────

@router.get("/courses")
def list_courses(
    db: Session = Depends(get_db),
    current_user=Depends(require_faculty),
):
    faculty = _get_faculty(current_user, db)
    result = []

    for course in faculty.courses:
        total_enrolled = db.query(func.count(models.Enrollment.id)).filter(
            models.Enrollment.course_id == course.id
        ).scalar() or 0

        total_classes = db.query(func.count(func.distinct(models.Attendance.date))).filter(
            models.Attendance.course_id == course.id
        ).scalar() or 0

        result.append({
            "id": course.id,
            "name": course.name,
            "enrollment_key": course.enrollment_key,
            "min_attendance_threshold": course.min_attendance_threshold,
            "total_enrolled": total_enrolled,
            "total_classes": total_classes,
        })

    return result


# ── Course detail stats ───────────────────────────────────────────────────────

@router.get("/courses/{course_id}/stats")
def course_stats(
    course_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_faculty),
):
    faculty = _get_faculty(current_user, db)

    course = db.query(models.Course).filter(
        models.Course.id == course_id,
        models.Course.faculty_id == faculty.id,
    ).first()
    if not course:
        raise HTTPException(404, "Course not found")

    enrollments = db.query(models.Enrollment).filter(
        models.Enrollment.course_id == course_id
    ).all()

    total_classes = db.query(func.count(func.distinct(models.Attendance.date))).filter(
        models.Attendance.course_id == course_id
    ).scalar() or 0

    students_data = []
    total_pct_sum = 0

    for enr in enrollments:
        student = enr.student
        attended = db.query(func.count(models.Attendance.id)).filter(
            models.Attendance.course_id == course_id,
            models.Attendance.student_id == student.id,
            models.Attendance.status == True,
        ).scalar() or 0

        pct = round((attended / total_classes * 100) if total_classes > 0 else 0.0, 1)
        total_pct_sum += pct

        students_data.append({
            "student_id": student.id,
            "name": student.name,
            "reg_number": student.reg_number,
            "attended": attended,
            "total_classes": total_classes,
            "percentage": pct,
            "below_threshold": pct < course.min_attendance_threshold and total_classes > 0,
        })

    avg_att = round(total_pct_sum / len(enrollments), 1) if enrollments else 0.0
    below_threshold_count = sum(1 for s in students_data if s["below_threshold"])

    return {
        "course_id": course.id,
        "course_name": course.name,
        "enrollment_key": course.enrollment_key,
        "min_threshold": course.min_attendance_threshold,
        "total_enrolled": len(enrollments),
        "total_classes": total_classes,
        "average_attendance": avg_att,
        "below_threshold_count": below_threshold_count,
        "students": students_data,
    }


# ── Mark attendance manually ──────────────────────────────────────────────────

@router.get("/attendance-dates/{course_id}")
def get_attendance_dates(
    course_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_faculty),
):
    faculty = _get_faculty(current_user, db)
    course = db.query(models.Course).filter(
        models.Course.id == course_id,
        models.Course.faculty_id == faculty.id,
    ).first()
    if not course:
        raise HTTPException(404, "Course not found or not yours")

    dates = db.query(func.distinct(models.Attendance.date)).filter(
        models.Attendance.course_id == course_id
    ).all()
    return [str(d[0]) for d in dates]


# ── Faculty profile ───────────────────────────────────────────────────────────

@router.get("/profile")
def get_profile(
    db: Session = Depends(get_db),
    current_user=Depends(require_faculty),
):
    faculty = _get_faculty(current_user, db)
    return {
        "id": faculty.id,
        "name": faculty.name,
        "email": faculty.email,
        "username": current_user.username,
    }
