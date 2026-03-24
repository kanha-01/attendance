## 📁 Project Structure

```
facial-attendance-system/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── database.py          # SQLAlchemy engine + session
│   │   ├── models.py            # ORM models (User, Student, Course, Enrollment, Attendance)
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── auth.py              # JWT utilities + OAuth2 dependencies
│   │   ├── cv/
│   │   │   ├── __init__.py
│   │   │   ├── face_processor.py    # face_recognition encoding + matching
│   │   │   └── liveness_detector.py # EAR blink detection (anti-spoofing)
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── auth_router.py       # /api/auth/*
│   │       ├── student_router.py    # /api/students/*
│   │       ├── faculty_router.py    # /api/faculty/*
│   │       └── attendance_router.py # WebSocket /ws/attendance/{course_id}
│   └── requirements.txt
│
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── api/
        │   └── axios.js             # Axios instance with interceptors
        ├── context/
        │   └── AuthContext.jsx      # Auth state, login, logout
        ├── components/
        │   └── Layout.jsx           # Navbar + page wrapper
        └── pages/
            ├── LandingPage.jsx
            ├── LoginPage.jsx
            ├── RegisterPage.jsx     # Tabbed: Student (3 photos) + Faculty
            ├── StudentDashboard.jsx # All Courses / Enrolled Courses tabs
            ├── FacultyDashboard.jsx # Course mgmt + Chart.js analytics
            ├── AttendancePage.jsx   # Live WebSocket camera session
            └── NotFound.jsx
```
