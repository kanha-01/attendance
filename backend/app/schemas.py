from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import date


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserRegisterBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=6)
    role: str = Field(..., pattern="^(student|faculty)$")


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


class LoginSchema(BaseModel):
    username: str
    password: str


class TokenSchema(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int


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
