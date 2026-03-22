import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement
} from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'
import Layout from '../components/Layout'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement)

export default function FacultyDashboard() {
  const { user }          = useAuth()
  const navigate          = useNavigate()
  const [courses, setCourses]   = useState([])
  const [selected, setSelected] = useState(null)  // course stats
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const loadCourses = () => {
    setLoading(true)
    api.get('/api/faculty/courses')
      .then(r => { setCourses(r.data); if (r.data.length) setSelected(null) })
      .finally(() => setLoading(false))
  }

  useEffect(loadCourses, [])

  return (
    <Layout>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-white mb-1">
            Faculty Dashboard
          </h1>
          <p className="text-zinc-400 text-sm">Manage courses and run live attendance sessions</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + New Course
        </button>
      </div>

      {showCreate && (
        <CreateCourseModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadCourses() }}
        />
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1,2,3].map(i => (
            <div key={i} className="card space-y-3">
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-20 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState onNew={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* ── Course list ── */}
          <div className="xl:col-span-1 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">Your Courses</h2>
            {courses.map(c => (
              <CourseCard
                key={c.id}
                course={c}
                isSelected={selected?.course_id === c.id}
                onSelect={() => {
                  api.get(`/api/faculty/courses/${c.id}/stats`).then(r => setSelected(r.data))
                }}
                onStart={() => navigate(`/faculty/attendance/${c.id}`)}
              />
            ))}
          </div>

          {/* ── Stats panel ── */}
          <div className="xl:col-span-2">
            {selected
              ? <StatsPanel stats={selected} />
              : (
                <div className="card h-full flex items-center justify-center text-center py-20">
                  <div>
                    <div className="text-4xl mb-3">📊</div>
                    <p className="text-zinc-400 text-sm">Select a course to view analytics</p>
                  </div>
                </div>
              )
            }
          </div>
        </div>
      )}
    </Layout>
  )
}

// ── Course Card ────────────────────────────────────────────────────────────────
function CourseCard({ course, isSelected, onSelect, onStart }) {
  return (
    <div
      onClick={onSelect}
      className={`card cursor-pointer transition-all duration-200 hover:border-brand-500/40
        ${isSelected ? 'border-brand-500/60 bg-brand-600/5' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-white text-sm">{course.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-[11px] text-zinc-500 bg-surface-hover px-2 py-0.5 rounded">
              {course.enrollment_key}
            </span>
          </div>
        </div>
        <span className="badge badge-blue text-[10px]">{course.total_enrolled} students</span>
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-500 mb-3">
        <span>{course.total_classes} classes held</span>
        <span>Min: {course.min_attendance_threshold}%</span>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onStart() }}
        className="w-full btn-primary text-xs py-2 justify-center"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 8l6 4-6 4V8z" fill="currentColor"/>
        </svg>
        Start Attendance
      </button>
    </div>
  )
}

// ── Stats Panel ───────────────────────────────────────────────────────────────
function StatsPanel({ stats }) {
  const { students, course_name, total_enrolled, total_classes,
          average_attendance, below_threshold_count, min_threshold } = stats

  // Doughnut: above vs below threshold
  const doughnutData = {
    labels: ['Above Threshold', 'Below Threshold'],
    datasets: [{
      data: [total_enrolled - below_threshold_count, below_threshold_count],
      backgroundColor: ['rgba(34,197,94,0.8)', 'rgba(239,68,68,0.8)'],
      borderColor: ['#22c55e', '#ef4444'],
      borderWidth: 1,
    }]
  }

  // Bar: per-student attendance
  const barData = {
    labels: students.map(s => s.name.split(' ')[0]),
    datasets: [{
      label: 'Attendance %',
      data: students.map(s => s.percentage),
      backgroundColor: students.map(s =>
        s.percentage >= min_threshold ? 'rgba(97,113,243,0.75)' : 'rgba(239,68,68,0.65)'
      ),
      borderColor: students.map(s =>
        s.percentage >= min_threshold ? '#6171f3' : '#ef4444'
      ),
      borderWidth: 1,
      borderRadius: 6,
    }]
  }

  const chartOptions = (title) => ({
    responsive: true,
    plugins: {
      legend: { labels: { color: '#9ca3af', font: { size: 11 } } },
      title: { display: true, text: title, color: '#e8eaf0', font: { size: 13, weight: '600' } },
    },
    scales: {
      x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: '#1e2233' } },
      y: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: '#1e2233' }, max: 100 },
    }
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-xl text-white">{course_name}</h2>
        <span className="badge badge-blue">
          {total_classes} classes held
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Enrolled', value: total_enrolled,         color: 'text-white' },
          { label: 'Avg Attendance', value: `${average_attendance}%`, color: 'text-brand-400' },
          { label: 'Below Threshold', value: below_threshold_count, color: 'text-red-400' },
          { label: 'Min Threshold', value: `${min_threshold}%`, color: 'text-yellow-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl bg-surface-hover border border-surface-border px-4 py-3">
            <div className={`text-2xl font-bold font-display ${color}`}>{value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card">
          <Doughnut
            data={doughnutData}
            options={{
              responsive: true,
              plugins: {
                legend: { labels: { color: '#9ca3af', font: { size: 11 } } },
                title: { display: true, text: 'Threshold Compliance', color: '#e8eaf0', font: { size: 13, weight: '600' } },
              }
            }}
          />
        </div>
        <div className="card">
          <Bar data={barData} options={chartOptions('Per-Student Attendance %')} />
        </div>
      </div>

      {/* Students table */}
      {students.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-surface-border">
            <h3 className="font-semibold text-white text-sm">Student Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-surface-border">
                <tr className="text-xs text-zinc-500 uppercase tracking-wide">
                  {['Student', 'Reg No.', 'Attended', 'Total', 'Percentage', 'Status'].map(h => (
                    <th key={h} className="text-left px-5 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {students.map(s => (
                  <tr key={s.student_id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-5 py-3 text-white font-medium">{s.name}</td>
                    <td className="px-5 py-3 font-mono text-zinc-400 text-xs">{s.reg_number}</td>
                    <td className="px-5 py-3 text-zinc-300">{s.attended}</td>
                    <td className="px-5 py-3 text-zinc-300">{s.total_classes}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-surface-hover overflow-hidden max-w-[60px]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${s.percentage}%`,
                              background: s.below_threshold ? '#ef4444' : '#6171f3'
                            }}
                          />
                        </div>
                        <span className="text-xs text-zinc-300">{s.percentage}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`badge text-[10px] ${s.below_threshold ? 'badge-red' : 'badge-green'}`}>
                        {s.below_threshold ? 'Below' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Create Course Modal ────────────────────────────────────────────────────────
function CreateCourseModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', min_attendance_threshold: 75 })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [result, setResult]   = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/api/faculty/courses', form)
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create course')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md card shadow-2xl border-brand-500/20 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-lg text-white">Create New Course</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">✕</button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 text-center">
              <p className="text-green-400 font-semibold mb-1">Course Created!</p>
              <p className="text-white text-xl font-display font-bold">{result.name}</p>
            </div>
            <div className="rounded-xl bg-brand-600/10 border border-brand-500/20 p-4 text-center">
              <p className="text-xs text-zinc-500 mb-1">Enrollment Key (share with students)</p>
              <p className="font-mono text-2xl font-bold text-brand-400 tracking-widest">{result.enrollment_key}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={onCreated} className="btn-primary flex-1">Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Course Name</label>
              <input
                className="input-base"
                placeholder="e.g. Computer Networks CS301"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Minimum Attendance Threshold (%)
              </label>
              <input
                className="input-base"
                type="number"
                min="0"
                max="100"
                value={form.min_attendance_threshold}
                onChange={(e) => setForm({ ...form, min_attendance_threshold: parseFloat(e.target.value) })}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1" disabled={loading}>
                {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Create Course'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ onNew }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-2xl bg-surface-card border border-surface-border flex items-center justify-center mb-5 text-3xl">🎓</div>
      <h3 className="font-display font-bold text-xl text-white mb-2">No Courses Yet</h3>
      <p className="text-zinc-500 text-sm mb-6 max-w-xs">Create your first course to generate an enrollment key and start tracking attendance.</p>
      <button onClick={onNew} className="btn-primary px-8">+ Create First Course</button>
    </div>
  )
}
