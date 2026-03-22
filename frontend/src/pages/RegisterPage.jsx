import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/axios'

const TABS = ['Student', 'Faculty']

export default function RegisterPage() {
  const [tab, setTab]         = useState('Student')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const navigate               = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4 py-10 relative overflow-hidden">
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px]
                      bg-brand-600/8 rounded-full blur-[120px]" />

      <div className="relative z-10 w-full max-w-lg">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-5">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
            </div>
            <span className="font-display font-bold text-xl text-white">Face<span className="text-brand-400">Attend</span></span>
          </Link>
          <h1 className="font-display text-3xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-zinc-400 text-sm">Register as a student or faculty member</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-surface-border bg-surface-card p-1 mb-5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); setSuccess('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150
                ${tab === t
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
                }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'Student'
          ? <StudentForm setLoading={setLoading} loading={loading} error={error} setError={setError} success={success} setSuccess={setSuccess} navigate={navigate} />
          : <FacultyForm setLoading={setLoading} loading={loading} error={error} setError={setError} success={success} setSuccess={setSuccess} navigate={navigate} />
        }

        <p className="text-center text-sm text-zinc-500 mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

// ── Student Form ──────────────────────────────────────────────────────────────
function StudentForm({ loading, setLoading, error, setError, success, setSuccess, navigate }) {
  const [form, setForm] = useState({
    username: '', password: '', name: '', reg_number: '', college_email: '', serial_number: '',
  })
  const [photos, setPhotos] = useState({ front: null, left: null, right: null })
  const [previews, setPreviews] = useState({ front: null, left: null, right: null })

  const handlePhoto = (slot) => (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhotos((p) => ({ ...p, [slot]: file }))
    setPreviews((p) => ({ ...p, [slot]: URL.createObjectURL(file) }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!photos.front || !photos.left || !photos.right) {
      setError('Please upload all three face photos.')
      return
    }
    setLoading(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      fd.append('photo_front', photos.front)
      fd.append('photo_left',  photos.left)
      fd.append('photo_right', photos.right)
      //log
      const bodyForLog = {
        ...form,
        photo_front: photos.front ? { name: photos.front.name, size: photos.front.size, type: photos.front.type } : null,
        photo_left:  photos.left  ? { name: photos.left.name, size: photos.left.size, type: photos.left.type } : null,
        photo_right: photos.right ? { name: photos.right.name, size: photos.right.size, type: photos.right.type } : null,
      }
      console.log('[Register Student] Sending data:', bodyForLog)
      await api.post('/api/auth/register/student', fd)
      setSuccess('Registration successful! Redirecting to login...')
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      {error   && <Alert type="error"   msg={error} />}
      {success && <Alert type="success" msg={success} />}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Full Name"     value={form.name}          onChange={(v) => setForm({...form, name: v})}          placeholder="John Doe" />
        <Field label="Username"      value={form.username}      onChange={(v) => setForm({...form, username: v})}      placeholder="johndoe" />
        <Field label="Reg. Number"   value={form.reg_number}    onChange={(v) => setForm({...form, reg_number: v})}    placeholder="2021CS001" />
        <Field label="Serial No."    value={form.serial_number} onChange={(v) => setForm({...form, serial_number: v})} placeholder="Optional" required={false} />
        <Field label="College Email" value={form.college_email} onChange={(v) => setForm({...form, college_email: v})} placeholder="john@college.edu" className="col-span-2" />
        <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({...form, password: v})} placeholder="Min 6 chars" className="col-span-2" />
      </div>

      {/* Photo uploads */}
      <div>
        <p className="text-sm font-medium text-zinc-300 mb-2">
          Face Photos <span className="text-red-400">*</span>
          <span className="text-zinc-500 font-normal ml-1">(front, left profile, right profile)</span>
        </p>
        <div className="grid grid-cols-3 gap-3">
          {['front', 'left', 'right'].map((slot) => (
            <PhotoUpload
              key={slot}
              slot={slot}
              preview={previews[slot]}
              onChange={handlePhoto(slot)}
            />
          ))}
        </div>
      </div>

      <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
        {loading
          ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : 'Register as Student'}
      </button>
    </form>
  )
}

// ── Faculty Form ──────────────────────────────────────────────────────────────
function FacultyForm({ loading, setLoading, error, setError, success, setSuccess, navigate }) {
  const [form, setForm] = useState({ username: '', password: '', name: '', email: '' })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      //log
      console.log('[Register Faculty] Sending data:', form)
      await api.post('/api/auth/register/faculty', form)
      setSuccess('Faculty account created! Redirecting to login...')
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      {error   && <Alert type="error"   msg={error} />}
      {success && <Alert type="success" msg={success} />}
      <Field label="Full Name"  value={form.name}     onChange={(v) => setForm({...form, name: v})}     placeholder="Prof. Jane Smith" />
      <Field label="Username"   value={form.username} onChange={(v) => setForm({...form, username: v})} placeholder="prof_jane" />
      <Field label="Work Email" value={form.email}    onChange={(v) => setForm({...form, email: v})}    placeholder="jane@university.edu" />
      <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({...form, password: v})} placeholder="Min 6 chars" />
      <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
        {loading
          ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : 'Register as Faculty'}
      </button>
    </form>
  )
}

// ── Reusable sub-components ───────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text', required = true, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
      <input
        className="input-base !py-2.5 !text-sm"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  )
}

function PhotoUpload({ slot, preview, onChange }) {
  const inputRef = useRef()
  return (
    <div>
      <p className="text-xs text-zinc-500 capitalize mb-1.5 text-center">{slot}</p>
      <button
        type="button"
        onClick={() => inputRef.current.click()}
        className={`w-full aspect-square rounded-xl border-2 border-dashed transition-all duration-150 flex flex-col items-center justify-center overflow-hidden
          ${preview
            ? 'border-brand-500/50 bg-brand-500/5'
            : 'border-surface-border hover:border-brand-500/40 bg-surface-card/50'
          }`}
      >
        {preview
          ? <img src={preview} alt={slot} className="w-full h-full object-cover" />
          : (
            <>
              <svg className="w-7 h-7 text-zinc-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <span className="text-[10px] text-zinc-600">Upload</span>
            </>
          )
        }
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
    </div>
  )
}

function Alert({ type, msg }) {
  const styles = type === 'error'
    ? 'bg-red-500/10 border-red-500/20 text-red-400'
    : 'bg-green-500/10 border-green-500/20 text-green-400'
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{msg}</div>
  )
}
