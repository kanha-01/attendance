import re
import base64
import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from .. import models, schemas
from ..schemas import (
    MNNIT_EMAIL_RE,
    PASSWORD_RE,
    REG_NUMBER_RE,
    SERIAL_RE,
    USERNAME_RE,
)
from ..auth import (
    hash_password, verify_password,
    create_access_token, get_current_user
)
from ..cv.face_processor import process_registration_photos, serialize_encodings

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)


# ── Validation helpers ────────────────────────────────────────────────────────

def _validate_student_fields(
    username: str, password: str, name: str,
    reg_number: str, college_email: str, serial_number: Optional[str]
):
    errors = []

    username = username.strip()
    if not USERNAME_RE.match(username):
        errors.append("Username must be alphanumeric only (no spaces or special characters)")
    elif len(username) < 3:
        errors.append("Username must be at least 3 characters")

    if not PASSWORD_RE.match(password):
        errors.append(
            "Password must be at least 8 characters and include an uppercase letter, "
            "a lowercase letter, a digit, and a special character"
        )

    if not name.strip():
        errors.append("Full name cannot be empty")

    if not REG_NUMBER_RE.match(reg_number.strip()):
        errors.append("Registration number must be exactly 8 digits")

    if not MNNIT_EMAIL_RE.match(college_email.strip()):
        errors.append("College email must be in the format alphanumeric@mnnit.ac.in")

    if serial_number and serial_number.strip() and not SERIAL_RE.match(serial_number.strip()):
        errors.append("Serial number must contain digits only")

    if errors:
        raise HTTPException(422, detail="; ".join(errors))

    return username.strip()


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
    # Validate all fields
    username = _validate_student_fields(
        username, password, name, reg_number, college_email, serial_number
    )

    # Uniqueness checks
    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(400, "Username already taken")
    if db.query(models.Student).filter(models.Student.reg_number == reg_number.strip()).first():
        raise HTTPException(400, "Registration number already registered")
    if db.query(models.Student).filter(models.Student.college_email == college_email.strip()).first():
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

    # Use photo_front as profile picture (base64 data URL)
    front_b64 = "data:image/jpeg;base64," + base64.b64encode(photos_bytes[0]).decode("utf-8")

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
        name=name.strip(),
        reg_number=reg_number.strip(),
        college_email=college_email.strip(),
        serial_number=serial_number.strip() if serial_number else None,
        face_encodings=serialize_encodings(encodings),
        profile_photo=front_b64,
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
    profile_id, name, profile_photo = None, None, None

    if current_user.role == "student" and current_user.student:
        profile_id    = current_user.student.id
        name          = current_user.student.name
        profile_photo = current_user.student.profile_photo
    elif current_user.role == "faculty" and current_user.faculty:
        profile_id    = current_user.faculty.id
        name          = current_user.faculty.name
        profile_photo = current_user.faculty.profile_photo

    return schemas.MeSchema(
        user_id=current_user.id,
        username=current_user.username,
        role=current_user.role,
        profile_id=profile_id,
        name=name,
        profile_photo=profile_photo,
    )

# ── Change password ───────────────────────────────────────────────────────────

@router.patch("/change-password")
def change_password(
    payload: schemas.ChangePasswordSchema,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(400, "Current password is incorrect")

    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated successfully"}


# ── Update profile photo ──────────────────────────────────────────────────────

@router.patch("/profile-photo")
async def update_profile_photo(
    photo: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await photo.read()
    if len(content) > 5 * 1024 * 1024:  # 5 MB limit
        raise HTTPException(400, "Photo must be smaller than 5 MB")

    # Detect mime type from filename for proper data URL
    fname = (photo.filename or "").lower()
    if fname.endswith(".png"):
        mime = "image/png"
    elif fname.endswith(".webp"):
        mime = "image/webp"
    else:
        mime = "image/jpeg"

    b64 = f"data:{mime};base64," + base64.b64encode(content).decode("utf-8")

    if current_user.role == "student" and current_user.student:
        current_user.student.profile_photo = b64
    elif current_user.role == "faculty" and current_user.faculty:
        current_user.faculty.profile_photo = b64
    else:
        raise HTTPException(404, "Profile not found")

    db.commit()
    return {"message": "Profile photo updated", "profile_photo": b64}


# ── Delete account ────────────────────────────────────────────────────────────

@router.post("/delete-account")
def delete_account(
    payload: schemas.DeleteAccountSchema,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(400, "Password is incorrect")

    db.delete(current_user)
    db.commit()
    return {"message": "Account deleted successfully"}