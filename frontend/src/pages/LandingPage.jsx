import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Navigate } from 'react-router-dom'

export default function LandingPage() {
  const { user } = useAuth()
  if (user) return <Navigate to={user.role === 'faculty' ? '/faculty' : '/student'} replace />

  return (
    <div className="min-h-screen bg-surface flex flex-col overflow-hidden relative">

      {/* ── Background grid glow ──────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[600px]
                        bg-brand-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 -right-40 w-[400px] h-[500px]
                        bg-cyan-500/8 rounded-full blur-[100px]" />
        {/* subtle grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#6171f3" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* ── Navbar ────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/40">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
          </div>
          <span className="font-display font-bold text-lg text-white">
            Face<span className="text-brand-400">Attend</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="btn-ghost">Sign In</Link>
          <Link to="/register" className="btn-primary">Get Started</Link>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">

        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30
                        bg-brand-600/10 px-4 py-1.5 text-xs text-brand-400 font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-dot" />
          Real-Time Face Recognition · Anti-Spoofing Liveness Detection
        </div>

        <h1 className="font-display text-6xl md:text-7xl font-extrabold text-white leading-[1.05] mb-6 max-w-3xl">
          Attendance,{' '}
          <span className="bg-gradient-to-r from-brand-400 to-cyan-400 bg-clip-text text-transparent">
            Reimagined
          </span>
        </h1>

        <p className="text-xl text-zinc-400 max-w-xl leading-relaxed mb-10">
          AI-powered facial recognition with blink-based liveness detection.
          Zero proxies, zero paper sheets — just your face.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link to="/register" className="btn-primary text-base px-8 py-3 shadow-lg shadow-brand-600/25">
            Register Now →
          </Link>
          <Link to="/login" className="btn-ghost text-base px-8 py-3">
            Faculty Login
          </Link>
        </div>

        {/* ── Feature cards ──────────────────────────────────────────────── */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl w-full text-left">
          {[
            {
              icon: '🔬',
              title: 'Liveness Detection',
              desc: 'EAR-based blink analysis prevents any printed photo or screen-based proxy attempts.',
            },
            {
              icon: '⚡',
              title: 'Real-Time Processing',
              desc: 'WebSocket-powered live camera feed processes frames continuously for instant marking.',
            },
            {
              icon: '📊',
              title: 'Smart Analytics',
              desc: 'Chart.js dashboards show attendance trends, threshold alerts, and per-student stats.',
            },
          ].map((f) => (
            <div key={f.title} className="card hover:border-brand-500/40 transition-all duration-200">
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-display font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
