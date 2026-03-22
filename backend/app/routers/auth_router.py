import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from .. import models, schemas
from ..auth import (
    hash_password, verify_password,
    create_access_token, get_current_user
)
from ..cv.face_processor import process_registration_photos, serialize_encodings

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)


# ── Student Registration ───────────────────────────────────────────────────────

@router.post("/register/student", status_code=201)
async def register_student(
    username:      str = Form(...),
    password:      str = Form(...),
    name:          str = Form(...),
    reg_number:    str = Form(...),
    college_email: str = Form(...),
    serial_number: Optional[str] = Form(None),
    photo_front:   UploadFile = File(...),
    photo_left:    UploadFile = File(...),
    photo_right:   UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Check username / email / reg_number uniqueness
    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(400, "Username already taken")
    if db.query(models.Student).filter(models.Student.reg_number == reg_number).first():
        raise HTTPException(400, "Registration number already registered")
    if db.query(models.Student).filter(models.Student.college_email == college_email).first():
        raise HTTPException(400, "Email already registered")

    # Read photos
    photos_bytes = []
    for photo in [photo_front, photo_left, photo_right]:
        content = await photo.read()
        photos_bytes.append(content)

    # Extract face encodings
    try:
        encodings = process_registration_photos(photos_bytes)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except RuntimeError as e:
        raise HTTPException(503, f"CV service unavailable: {e}")

    # Persist
    user = models.User(
        username=username,
        password_hash=hash_password(password),
        role="student",
    )
    db.add(user)
    db.flush()

    student = models.Student(
        user_id=user.id,
        name=name,
        reg_number=reg_number,
        college_email=college_email,
        serial_number=serial_number,
        face_encodings=serialize_encodings(encodings),
    )
    db.add(student)
    db.commit()
    db.refresh(student)

    return {"message": "Student registered successfully", "student_id": student.id}


# ── Faculty Registration ──────────────────────────────────────────────────────

@router.post("/register/faculty", status_code=201)
def register_faculty(
    payload: schemas.FacultyRegisterSchema,
    db: Session = Depends(get_db),
):
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(400, "Username already taken")

    user = models.User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role="faculty",
    )
    db.add(user)
    db.flush()

    faculty = models.Faculty(
        user_id=user.id,
        name=payload.name,
        email=payload.email,
    )
    db.add(faculty)
    db.commit()
    db.refresh(faculty)

    return {"message": "Faculty registered successfully", "faculty_id": faculty.id}


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=schemas.TokenSchema)
def login(payload: schemas.LoginSchema, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return schemas.TokenSchema(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id,
    )


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=schemas.MeSchema)
def me(current_user: models.User = Depends(get_current_user)):
    profile_id, name = None, None
    if current_user.role == "student" and current_user.student:
        profile_id = current_user.student.id
        name = current_user.student.name
    elif current_user.role == "faculty" and current_user.faculty:
        profile_id = current_user.faculty.id
        name = current_user.faculty.name

    return schemas.MeSchema(
        user_id=current_user.id,
        username=current_user.username,
        role=current_user.role,
        profile_id=profile_id,
        name=name,
    )
