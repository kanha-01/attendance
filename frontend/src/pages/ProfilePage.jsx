import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import api from '../api/axios'

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  useEffect(() => {
    const endpoint = user?.role === 'faculty'
      ? '/api/faculty/profile'
      : '/api/students/profile'
    api.get(endpoint)
      .then((r) => setProfile(r.data))
      .catch(() => {})
      .finally(() => setLoadingProfile(false))
  }, [user?.role])

  if (loadingProfile) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24">
          <span className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Profile header card */}
        <ProfileHeader profile={profile} user={user} onPhotoUpdate={async (newPhoto) => {
          setProfile((p) => ({ ...p, profile_photo: newPhoto }))
          await refreshUser()
        }} />

        {/* Account details */}
        <AccountDetails profile={profile} user={user} />

        {/* Change password */}
        <ChangePassword />

        {/* Danger zone */}
        <DangerZone onSignOut={() => { logout(); navigate('/login') }} navigate={navigate} />
      </div>
    </Layout>
  )
}

// ── Profile header ────────────────────────────────────────────────────────────
function ProfileHeader({ profile, user, onPhotoUpdate }) {
  const photoRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [toast, setToast]         = useState('')
  const isFaculty = user?.role === 'faculty'

  const handlePhotoChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('photo', file)
      const { data } = await api.patch('/api/auth/profile-photo', fd)
      onPhotoUpdate(data.profile_photo)
      showToast('Profile photo updated!')
    } catch (err) {
      showToast(err.response?.data?.detail || 'Upload failed', true)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError })
    setTimeout(() => setToast(''), 3000)
  }

  const displayPhoto = profile?.profile_photo || user?.profile_photo
  const displayName  = profile?.name || user?.name || user?.username || '?'

  return (
    <div className="card">
      {toast && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          toast.isError
            ? 'bg-red-500/10 border-red-500/20 text-red-400'
            : 'bg-green-500/10 border-green-500/20 text-green-400'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-5">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-brand-500/40 bg-brand-600/20">
            {displayPhoto
              ? <img src={displayPhoto} alt={displayName} className="w-full h-full object-cover" />
              : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-brand-400 text-3xl font-bold">
                    {displayName[0].toUpperCase()}
                  </span>
                </div>
              )
            }
          </div>

          {/* Upload button overlay */}
          <button
            onClick={() => photoRef.current.click()}
            disabled={uploading}
            title="Change profile photo"
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand-600 hover:bg-brand-500
                       border-2 border-surface flex items-center justify-center transition-colors"
          >
            {uploading
              ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
              : <CameraIcon className="w-3.5 h-3.5 text-white" />
            }
          </button>
          <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        </div>

        {/* Name + role */}
        <div>
          <h1 className="text-xl font-bold text-white">{displayName}</h1>
          <p className="text-zinc-400 text-sm mt-0.5">@{user?.username}</p>
          <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium
            ${isFaculty
              ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
              : 'bg-brand-500/15 text-brand-400 border border-brand-500/20'
            }`}>
            {isFaculty ? 'Faculty' : 'Student'}
          </span>
        </div>

        {isFaculty && (
          <p className="ml-auto text-xs text-zinc-600">Profile photo is optional</p>
        )}
      </div>
    </div>
  )
}

// ── Account details ───────────────────────────────────────────────────────────
function AccountDetails({ profile, user }) {
  const isFaculty = user?.role === 'faculty'

  const rows = isFaculty
    ? [
        { label: 'Full name',  value: profile?.name },
        { label: 'Username',   value: `@${user?.username}` },
        { label: 'Work email', value: profile?.email },
        { label: 'Role',       value: 'Faculty' },
      ]
    : [
        { label: 'Full name',        value: profile?.name },
        { label: 'Username',         value: `@${user?.username}` },
        { label: 'Registration No.', value: profile?.reg_number },
        { label: 'College email',    value: profile?.college_email },
        { label: 'Serial No.',       value: profile?.serial_number || '—' },
        { label: 'Face data',        value: profile?.has_face_data ? 'Enrolled ✓' : 'Not enrolled' },
      ]

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
        <UserIcon className="w-4 h-4 text-brand-400" />
        Account Information
      </h2>
      <div className="space-y-3">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between py-2 border-b border-surface-border last:border-0">
            <span className="text-sm text-zinc-500">{label}</span>
            <span className="text-sm text-zinc-200 font-medium">{value || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Change password ───────────────────────────────────────────────────────────
function ChangePassword() {
  const [form, setForm]       = useState({ current_password: '', new_password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState(null)   // { msg, isError }
  const [fieldErrors, setFieldErrors] = useState({})

  const validate = () => {
    const errs = {}
    if (!form.current_password) errs.current_password = 'Required'
    if (!PASSWORD_RE.test(form.new_password)) {
      errs.new_password = 'Min 8 chars with uppercase, lowercase, digit & special character'
    }
    if (form.new_password !== form.confirm) {
      errs.confirm = 'Passwords do not match'
    }
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setFieldErrors(errs); return }

    setLoading(true)
    setStatus(null)
    try {
      await api.patch('/api/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      setStatus({ msg: 'Password changed successfully!', isError: false })
      setForm({ current_password: '', new_password: '', confirm: '' })
      setFieldErrors({})
    } catch (err) {
      setStatus({ msg: err.response?.data?.detail || 'Failed to change password', isError: true })
    } finally {
      setLoading(false)
    }
  }

  const setField = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (fieldErrors[k]) setFieldErrors((e) => ({ ...e, [k]: '' }))
  }

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
        <LockIcon className="w-4 h-4 text-brand-400" />
        Change Password
      </h2>

      {status && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          status.isError
            ? 'bg-red-500/10 border-red-500/20 text-red-400'
            : 'bg-green-500/10 border-green-500/20 text-green-400'
        }`}>
          {status.msg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <PwdField
          label="Current password" value={form.current_password}
          onChange={(v) => setField('current_password', v)}
          error={fieldErrors.current_password}
        />
        <PwdField
          label="New password" value={form.new_password}
          onChange={(v) => setField('new_password', v)}
          error={fieldErrors.new_password}
          hint="Min 8 chars, uppercase, lowercase, digit & special character"
        />
        <PwdField
          label="Confirm new password" value={form.confirm}
          onChange={(v) => setField('confirm', v)}
          error={fieldErrors.confirm}
        />
        <button type="submit" className="btn-primary py-2 px-5 text-sm" disabled={loading}>
          {loading
            ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : 'Update Password'}
        </button>
      </form>
    </div>
  )
}

function PwdField({ label, value, onChange, error, hint }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
      <div className="relative">
        <input
          className={`input-base !py-2.5 !text-sm pr-10 ${error ? '!border-red-500/60' : ''}`}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
        >
          {show ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
        </button>
      </div>
      {error
        ? <p className="text-xs text-red-400 mt-1">{error}</p>
        : hint
          ? <p className="text-xs text-zinc-600 mt-1">{hint}</p>
          : null}
    </div>
  )
}

// ── Danger zone ───────────────────────────────────────────────────────────────
function DangerZone({ onSignOut, navigate }) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  return (
    <div className="card border-red-500/20">
      <h2 className="text-sm font-semibold text-red-400 mb-4 flex items-center gap-2">
        <ShieldIcon className="w-4 h-4" />
        Danger Zone
      </h2>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onSignOut}
          className="btn-ghost !text-red-400 !border-red-500/20 hover:!bg-red-500/10 flex items-center gap-2 py-2 px-4"
        >
          <LogoutIcon className="w-4 h-4" />
          Sign Out
        </button>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="btn-ghost !text-red-500 !border-red-500/30 hover:!bg-red-500/15 flex items-center gap-2 py-2 px-4"
        >
          <TrashIcon className="w-4 h-4" />
          Delete Account
        </button>
      </div>

      {showDeleteModal && (
        <DeleteAccountModal
          onClose={() => setShowDeleteModal(false)}
          onDeleted={() => { onSignOut() }}
        />
      )}
    </div>
  )
}

// ── Delete confirmation modal ─────────────────────────────────────────────────
function DeleteAccountModal({ onClose, onDeleted }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleDelete = async () => {
    if (!password) { setError('Password is required to confirm deletion'); return }
    setLoading(true)
    setError('')
    try {
      await api.post('/api/auth/delete-account', { password })
      onDeleted()
    } catch (err) {
      setError(err.response?.data?.detail || 'Deletion failed')
      setLoading(false)
    }
  }

  return (
    // Faux modal using a full-height in-flow wrapper (no position:fixed)
    <div style={{ minHeight: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-red-500/30 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center">
            <TrashIcon className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Delete Account</h3>
            <p className="text-zinc-500 text-xs">This action is permanent and cannot be undone.</p>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
            {error}
          </div>
        )}

        <p className="text-sm text-zinc-400 mb-3">
          Enter your password to confirm account deletion. All your data, enrollments, and attendance records will be permanently removed.
        </p>

        <div className="mb-4">
          <label className="block text-xs font-medium text-zinc-400 mb-1">Confirm password</label>
          <input
            className="input-base !py-2.5 !text-sm"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1 py-2">Cancel</button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium
                       transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading
              ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : 'Delete my account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
function CameraIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
      <circle cx="12" cy="13" r="3"/>
    </svg>
  )
}
function UserIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
    </svg>
  )
}
function LockIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
    </svg>
  )
}
function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
    </svg>
  )
}
function LogoutIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/>
    </svg>
  )
}
function TrashIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
    </svg>
  )
}
function EyeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
    </svg>
  )
}
function EyeOffIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
    </svg>
  )
}
