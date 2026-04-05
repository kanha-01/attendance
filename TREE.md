```
files
├─ backend
│  ├─ app
│  │  ├─ auth.py
│  │  ├─ cv
│  │  │  ├─ face_processor.py
│  │  │  ├─ face_rec
│  │  │  │  ├─ models
│  │  │  │  │  ├─ encoder_net.py
│  │  │  │  │  ├─ landmark_net.py
│  │  │  │  │  └─ __init__.py
│  │  │  │  ├─ weights
│  │  │  │  │  ├─ encoder_net.pth
│  │  │  │  │  └─ landmark_net.pth
│  │  │  │  ├─ _api.py
│  │  │  │  ├─ _detector.py
│  │  │  │  ├─ _device.py
│  │  │  │  ├─ _runners.py
│  │  │  │  └─ __init__.py
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
│  ├─ generate_schema.py
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