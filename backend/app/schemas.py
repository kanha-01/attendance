import re
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional, List
from datetime import date


# ── Validation helpers ────────────────────────────────────────────────────────

USERNAME_RE   = re.compile(r'^[a-zA-Z0-9]+$')
PASSWORD_RE   = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$')
REG_NUMBER_RE = re.compile(r'^\d{8}$')
SERIAL_RE     = re.compile(r'^\d+$')
MNNIT_EMAIL_RE = re.compile(r'^[a-zA-Z0-9]+@mnnit\.ac\.in$')


def validate_username(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("Username cannot be empty")
    if ' ' in v:
        raise ValueError("Username must be a single word with no spaces")
    if not USERNAME_RE.match(v):
        raise ValueError("Username must be alphanumeric only (letters and digits)")
    if len(v) < 3:
        raise ValueError("Username must be at least 3 characters")
    if len(v) > 50:
        raise ValueError("Username must be 50 characters or fewer")
    return v


def validate_password(v: str) -> str:
    if not PASSWORD_RE.match(v):
        raise ValueError(
            "Password must be at least 8 characters and include an uppercase letter, "
            "a lowercase letter, a digit, and a special character"
        )
    return v


# ── Auth ──────────────────────────────────────────────────────────────────────

class StudentRegisterSchema(BaseModel):
    username: str
    password: str
    name: str
    reg_number: str
    college_email: str
    serial_number: Optional[str] = None


class FacultyRegisterSchema(BaseModel):
    username: str
    password: str
    name: str
    email: str

    @field_validator('username')
    @classmethod
    def check_username(cls, v):
        return validate_username(v)

    @field_validator('password')
    @classmethod
    def check_password(cls, v):
        return validate_password(v)

    @field_validator('name')
    @classmethod
    def check_name(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Name cannot be empty")
        return v


class LoginSchema(BaseModel):
    username: str
    password: str

    @field_validator('username')
    @classmethod
    def trim_username(cls, v):
        return v.strip()


class TokenSchema(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int


class ChangePasswordSchema(BaseModel):
    current_password: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def check_new_password(cls, v):
        return validate_password(v)


class DeleteAccountSchema(BaseModel):
    password: str


# ── Course ────────────────────────────────────────────────────────────────────

class CourseCreateSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    min_attendance_threshold: float = Field(75.0, ge=0, le=100)


class CourseResponseSchema(BaseModel):
    id: int
    name: str
    enrollment_key: str
    min_attendance_threshold: float
    faculty_name: Optional[str] = None
    student_count: Optional[int] = 0

    class Config:
        from_attributes = True


class EnrollSchema(BaseModel):
    enrollment_key: str


# ── Attendance ────────────────────────────────────────────────────────────────

class AttendanceRecordSchema(BaseModel):
    student_id: int
    course_id: int
    date: date
    status: bool

    class Config:
        from_attributes = True


class StudentAttendanceStats(BaseModel):
    course_id: int
    course_name: str
    total_classes: int
    attended: int
    percentage: float
    below_threshold: bool
    min_threshold: float


# ── Dashboard ─────────────────────────────────────────────────────────────────

class CourseStatsSchema(BaseModel):
    course_id: int
    course_name: str
    total_enrolled: int
    total_classes: int
    average_attendance: float
    below_threshold_count: int
    enrollment_key: str
    min_threshold: float


class StudentInfoSchema(BaseModel):
    student_id: int
    name: str
    reg_number: str
    attendance_percentage: float
    below_threshold: bool


class MeSchema(BaseModel):
    user_id: int
    username: str
    role: str
    profile_id: Optional[int] = None
    name: Optional[str] = None
    profile_photo: Optional[str] = None
