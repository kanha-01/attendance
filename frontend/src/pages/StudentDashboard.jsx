import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

export default function StudentDashboard() {
  const { user } = useAuth()
  const [tab, setTab]         = useState('enrolled')
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    api.get('/api/students/profile').then(r => setProfile(r.data)).catch(() => {})
  }, [])

  return (
    <Layout>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-white mb-1">
            Hello, {profile?.name || user?.name || 'Student'} 👋
          </h1>
          <p className="text-zinc-400 text-sm">
            {profile?.reg_number && <span className="font-mono text-xs text-zinc-500">{profile.reg_number} · </span>}
            {profile?.college_email}
          </p>
        </div>
        {!profile?.has_face_data && (
          <div className="badge badge-yellow text-xs">⚠ No face data registered</div>
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-surface-border mb-6">
        {[
          { key: 'enrolled', label: 'Enrolled Courses' },
          { key: 'all',      label: 'All Courses' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-3 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px
              ${tab === key
                ? 'text-brand-400 border-brand-500'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'enrolled' ? <EnrolledCourses /> : <AllCourses />}
    </Layout>
  )
}

// ── Enrolled Courses ──────────────────────────────────────────────────────────
function EnrolledCourses() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/students/enrolled-courses')
      .then(r => setCourses(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <SkeletonGrid />

  if (!courses.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface-card border border-surface-border flex items-center justify-center mb-4 text-2xl">📚</div>
        <h3 className="font-semibold text-white mb-1">No enrollments yet</h3>
        <p className="text-zinc-500 text-sm">Switch to "All Courses" and use an enrollment key from your faculty</p>
      </div>
    )
  }

  const handleUnenrolled = (courseId) => {
    setCourses((prev) => prev.filter((c) => c.course_id !== courseId))
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {courses.map(c => (
        <AttendanceCard key={c.course_id} course={c} onUnenrolled={handleUnenrolled} />
      ))}
    </div>
  )
}

// ── All Courses (browse + enroll) ─────────────────────────────────────────────
function AllCourses() {
  const [courses, setCourses]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [enrollKey, setEnrollKey]   = useState('')
  const [enrolling, setEnrolling]   = useState(false)
  const [enrollMsg, setEnrollMsg]   = useState({ type: '', text: '' })

  const load = () => {
    setLoading(true)
    api.get('/api/students/all-courses')
      .then(r => setCourses(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleEnroll = async (e) => {
    e.preventDefault()
    setEnrolling(true)
    setEnrollMsg({ type: '', text: '' })
    try {
      const res = await api.post('/api/students/enroll', { enrollment_key: enrollKey.trim() })
      setEnrollMsg({ type: 'success', text: res.data.message })
      setEnrollKey('')
      load()
    } catch (err) {
      setEnrollMsg({ type: 'error', text: err.response?.data?.detail || 'Enrollment failed' })
    } finally {
      setEnrolling(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Enroll by key */}
      <div className="card">
        <h2 className="font-display font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-brand-600/20 flex items-center justify-center text-brand-400 text-sm">🔑</span>
          Enroll with Key
        </h2>
        <form onSubmit={handleEnroll} className="flex gap-3">
          <input
            className="input-base flex-1"
            placeholder="Enter enrollment key (e.g. CS2024AB)"
            value={enrollKey}
            onChange={(e) => setEnrollKey(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary whitespace-nowrap" disabled={enrolling}>
            {enrolling ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Enroll'}
          </button>
        </form>
        {enrollMsg.text && (
          <p className={`mt-2 text-sm ${enrollMsg.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
            {enrollMsg.text}
          </p>
        )}
      </div>

      {/* Course list */}
      {loading ? <SkeletonGrid /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {courses.map(c => (
            <div key={c.id} className="card hover:border-brand-500/30 transition-all duration-200">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-white text-sm leading-tight">{c.name}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{c.faculty_name}</p>
                </div>
                {c.already_enrolled
                  ? <span className="badge badge-green text-[10px]">Enrolled</span>
                  : <span className="badge badge-blue text-[10px]">{c.student_count} students</span>
                }
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-zinc-500">{c.enrollment_key}</span>
                <span className="text-zinc-500">Min: {c.min_attendance_threshold}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Attendance Card ───────────────────────────────────────────────────────────
function AttendanceCard({ course, onUnenrolled }) {
  const pct = course.percentage
  const ok  = !course.below_threshold
  const clr = ok ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
  const r   = 28
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const [unenrolling, setUnenrolling] = useState(false)
  const [unenrollError, setUnenrollError] = useState('')

  const handleUnenroll = async () => {
    setUnenrollError('')
    setUnenrolling(true)
    try {
      await api.delete(`/api/students/enroll/${course.course_id}`)
      onUnenrolled?.(course.course_id)
    } catch (err) {
      setUnenrollError(err.response?.data?.detail || 'Failed to unenroll')
    } finally {
      setUnenrolling(false)
    }
  }

  return (
    <div className={`card hover:border-brand-500/30 transition-all duration-200
      ${!ok && course.total_classes > 0 ? 'border-red-500/20' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0 mr-3">
          <h3 className="font-semibold text-white text-sm leading-tight truncate">{course.course_name}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{course.faculty_name}</p>
        </div>
        {/* Circular progress */}
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r={r} fill="none" stroke="#1e2233" strokeWidth="6"/>
            <circle
              cx="36" cy="36" r={r} fill="none"
              stroke={clr} strokeWidth="6"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-white">{pct}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Total',   value: course.total_classes },
          { label: 'Present', value: course.attended      },
          { label: 'Min',     value: `${course.min_threshold}%` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-surface-hover py-2">
            <div className="text-sm font-bold text-white">{value}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleUnenroll}
        disabled={unenrolling}
        className="mt-3 w-full btn-ghost text-xs py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10"
      >
        {unenrolling ? 'Unenrolling...' : 'Unenroll from Course'}
      </button>

      {unenrollError && (
        <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
          {unenrollError}
        </div>
      )}

      {course.below_threshold && course.total_classes > 0 && (
        <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
          ⚠ Below minimum threshold — attendance required
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {[1,2,3,4,5,6].map(i => (
        <div key={i} className="card space-y-3">
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
          <div className="skeleton h-16 w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}
