# 🎓 FaceAttend — Real-Time Facial Recognition Attendance System

A production-grade attendance system using **face_recognition + EAR blink liveness detection**, built with FastAPI, SQLite/SQLAlchemy, React, TailwindCSS and Chart.js.

---

## 📁 Project Structure

```
face-attendance-system/
├─ backend
│  ├─ app
│  │  ├─ auth.py
│  │  ├─ cv
│  │  │  ├─ face_processor.py
│  │  │  ├─ liveness_detector.py
│  │  │  └─ __init__.py
│  │  ├─ database.py
│  │  ├─ main.py
│  │  ├─ models.py
│  │  ├─ routers
│  │  │  ├─ attendance_router.py
│  │  │  ├─ auth_router.py
│  │  │  ├─ faculty_router.py
│  │  │  ├─ student_router.py
│  │  │  └─ __init__.py
│  │  ├─ schemas.py
│  │  └─ __init__.py
│  └─ requirements.txt
├─ frontend
│  ├─ index.html
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ postcss.config.js
│  ├─ src
│  │  ├─ api
│  │  │  └─ axios.js
│  │  ├─ App.jsx
│  │  ├─ components
│  │  │  └─ Layout.jsx
│  │  ├─ context
│  │  │  └─ AuthContext.jsx
│  │  ├─ index.css
│  │  ├─ main.jsx
│  │  └─ pages
│  │     ├─ AttendancePage.jsx
│  │     ├─ FacultyDashboard.jsx
│  │     ├─ LandingPage.jsx
│  │     ├─ LoginPage.jsx
│  │     ├─ NotFound.jsx
│  │     ├─ ProfilePage.jsx
│  │     ├─ RegisterPage.jsx
│  │     └─ StudentDashboard.jsx
│  ├─ tailwind.config.js
│  └─ vite.config.js
├─ mnt
│  └─ user-data
│     └─ outputs
│        └─ facial-attendance-system
│           └─ backend
│              └─ app
│                 ├─ cv
│                 │  └─ __init__.py
│                 └─ routers
│                    └─ __init__.py
├─ README.md
└─ TREE.md


```

---

## ⚙️ Prerequisites

### System Dependencies (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install -y python3-pip python3-dev cmake build-essential \
    libboost-all-dev libdlib-dev libopenblas-dev liblapack-dev
```

### macOS
```bash
brew install cmake boost dlib
```

> **Note**: `dlib` (used by `face_recognition`) requires CMake and a C++ compiler.

---

## 🚀 Backend Setup

```bash
cd backend

# 1. Create and activate virtual environment
#if system have conda installed
conda create -p venv python==3.12.0
conda activate venv/

#if conda is not installed
python3.12.0 -m venv venv
source venv/bin/activate

# 2. Install dependencies (dlib takes ~5 min to compile)
pip install -r requirements.txt


# 3. Start the API server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`  
Interactive docs: `http://localhost:8000/docs`

---

## 🎨 Frontend Setup

```bash
cd frontend

# 1. Install Node dependencies
npm install

# 2. Start dev server
npm run dev
```

The frontend runs at `http://localhost:5173` and proxies `/api` and `/ws` to the backend.

---

## 🔑 API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register/student` | Multipart: details + 3 photos |
| POST | `/api/auth/register/faculty` | JSON body |
| POST | `/api/auth/login` | Returns JWT |
| GET  | `/api/auth/me` | Current user profile |

### Students
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/students/profile` | Own profile |
| GET | `/api/students/all-courses` | Browse all courses |
| POST | `/api/students/enroll` | Enroll via key |
| GET | `/api/students/enrolled-courses` | Courses + attendance stats |

### Faculty
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/faculty/profile` | Own profile |
| GET | `/api/faculty/courses` | List owned courses |
| POST | `/api/faculty/courses` | Create course |
| GET | `/api/faculty/courses/{id}/stats` | Full analytics |

### WebSocket
| Path | Description |
|------|-------------|
| `ws://localhost:8000/ws/attendance/{course_id}` | Live attendance session |

#### WebSocket Protocol
```
Client → Server (auth):     { "token": "JWT...", "date": "2024-01-15" }
Client → Server (frame):    { "type": "frame", "data": "data:image/jpeg;base64,..." }
Client → Server (stop):     { "type": "stop" }

Server → Client (status):   { "type": "status", "message": "...", "total_enrolled": N }
Server → Client (result):   { "type": "result", "faces": [...], "newly_marked": [...], "total_marked": N }
Server → Client (stopped):  { "type": "stopped", "total_marked": N, "message": "..." }
```

---

## 🧠 Computer Vision Architecture

### Registration Phase
1. Faculty/student uploads **3 photos** (front, left profile, right profile)
2. `face_recognition.face_locations()` detects exactly 1 face per photo
3. `face_recognition.face_encodings()` extracts 128-dimension vectors
4. All 3 vectors stored as JSON in `students.face_encodings`

### Live Attendance Phase
```
WebSocket Frame → RGB array
         ↓
face_recognition.face_locations()   [HOG model]
         ↓
face_recognition.face_encodings()   [128-d vector]
face_recognition.face_landmarks()   [68 points]
         ↓
LivenessTracker.update_frame()
  └── compute EAR = (||p2-p6|| + ||p3-p5||) / (2 · ||p1-p4||)
  └── EAR < 0.24 for ≥2 frames → blink counted
  └── 1 blink required → liveness_passed = True
         ↓
match_face_to_students()
  └── face_recognition.face_distance() vs all enrolled students
  └── best match with distance < 0.52 → matched_student_id
         ↓
If (liveness_passed AND matched AND not yet marked):
  → INSERT into attendance (status=True)
  → Send newly_marked event to frontend
```

### EAR Formula
```
     ||p2-p6|| + ||p3-p5||
EAR = ─────────────────────
          2 · ||p1-p4||

p0 = left corner
p1 = top-left lid
p2 = top-right lid
p3 = right corner  
p4 = bottom-right lid
p5 = bottom-left lid
```

---

## 🎛️ Configuration

### Backend (`app/auth.py`)
```python
SECRET_KEY = "your-secret-key"          # Change in production!
ACCESS_TOKEN_EXPIRE_HOURS = 24
```

### CV (`app/cv/face_processor.py`)
```python
MATCH_TOLERANCE = 0.52    # Lower = stricter face matching
```

### Liveness (`app/cv/liveness_detector.py`)
```python
EAR_THRESHOLD     = 0.24   # Eye aspect ratio threshold
EAR_CONSEC_FRAMES = 2      # Frames eye must be closed
REQUIRED_BLINKS   = 1      # Blinks needed for liveness
```

---

## 🔒 Security Notes

- JWT tokens expire after 24 hours
- Passwords hashed with bcrypt
- Liveness detection prevents photo/screen spoofing
- Role-based access control (student/faculty separation)
- Change `SECRET_KEY` before any production deployment

---

## 🐛 Troubleshooting

**`dlib` install fails:**
```bash
pip install cmake
pip install dlib
pip install face-recognition
```

**Camera not accessible:**
- Ensure browser has camera permission
- Use HTTPS or `localhost` (camera only works on secure contexts)

**Face not detected during registration:**
- Ensure good lighting and a single, clearly visible face per photo
- Front photo should be head-on; left/right should show full profile

**WebSocket connection refused:**
- Ensure backend is running on port 8000
- Check CORS origins in `main.py`
