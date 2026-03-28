from sqlalchemy import (
    Column, Integer, String, Boolean, Float, Date,
    ForeignKey, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # 'student' or 'faculty'

    student = relationship("Student", back_populates="user", uselist=False, cascade="all, delete-orphan")
    faculty = relationship("Faculty", back_populates="user", uselist=False, cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(150), nullable=False)
    reg_number = Column(String(50), unique=True, nullable=False, index=True)
    college_email = Column(String(200), unique=True, nullable=False)
    serial_number = Column(String(50), nullable=True)
    # JSON-serialized list of 128-d float arrays (one per uploaded photo)
    face_encodings = Column(Text, nullable=True)
    # Base64-encoded profile photo (set from photo_front at registration)
    profile_photo = Column(Text, nullable=True)

    user = relationship("User", back_populates="student")
    enrollments = relationship("Enrollment", back_populates="student", cascade="all, delete-orphan")
    attendance_records = relationship("Attendance", back_populates="student", cascade="all, delete-orphan")


class Faculty(Base):
    __tablename__ = "faculty"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(150), nullable=False)
    email = Column(String(200), nullable=False)
    # Optional base64-encoded profile photo
    profile_photo = Column(Text, nullable=True)

    user = relationship("User", back_populates="faculty")
    courses = relationship("Course", back_populates="faculty", cascade="all, delete-orphan")


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=False)
    enrollment_key = Column(String(20), unique=True, nullable=False)
    min_attendance_threshold = Column(Float, default=75.0)

    faculty = relationship("Faculty", back_populates="courses")
    enrollments = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")
    attendance_records = relationship("Attendance", back_populates="course", cascade="all, delete-orphan")


class Enrollment(Base):
    __tablename__ = "enrollments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)

    __table_args__ = (UniqueConstraint("student_id", "course_id", name="uq_enrollment"),)

    student = relationship("Student", back_populates="enrollments")
    course = relationship("Course", back_populates="enrollments")


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(Boolean, default=True)

    __table_args__ = (UniqueConstraint("student_id", "course_id", "date", name="uq_attendance"),)

    student = relationship("Student", back_populates="attendance_records")
    course = relationship("Course", back_populates="attendance_records")
