import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import api from '../api/axios'

const WS_BASE = window.location.hostname === 'localhost'
  ? 'ws://localhost:8000'
  : `ws://${window.location.host}`

const FRAME_INTERVAL_MS = 200  // send frame every 200ms

export default function AttendancePage() {
  const { courseId }    = useParams()
  const navigate        = useNavigate()

  const videoRef        = useRef(null)
  const canvasRef       = useRef(null)    // overlay
  const captureRef      = useRef(null)    // offscreen for JPEG encode
  const wsRef           = useRef(null)
  const streamRef       = useRef(null)
  const intervalRef     = useRef(null)
  const isRunningRef    = useRef(false)

  const [courseInfo, setCourseInfo]     = useState(null)
  const [sessionDate, setSessionDate]   = useState(todayStr())
  const [status, setStatus]             = useState('idle')  // idle | connecting | active | stopping | stopped
  const [statusMsg, setStatusMsg]       = useState('')
  const [markedStudents, setMarkedStudents] = useState([])
  const [totalMarked, setTotalMarked]   = useState(0)
  const [faceData, setFaceData]         = useState([])  // latest frame face info
  const [cameraError, setCameraError]   = useState('')
  const [videoSize, setVideoSize]       = useState({ w: 640, h: 480 })

  useEffect(() => {
    api.get(`/api/faculty/courses/${courseId}/stats`)
      .then(r => setCourseInfo(r.data))
      .catch(() => setCourseInfo({ course_name: `Course ${courseId}` }))
  }, [courseId])

  // ── Camera ──────────────────────────────────────────────────────────────────

  const startCamera = async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setVideoSize({ w: videoRef.current.videoWidth || 640, h: videoRef.current.videoHeight || 480 })
      }
    } catch (err) {
      setCameraError(`Camera error: ${err.message}. Please allow camera access.`)
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  // ── Frame capture ────────────────────────────────────────────────────────────

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !captureRef.current) return null
    const ctx = captureRef.current.getContext('2d')
    captureRef.current.width  = videoRef.current.videoWidth  || 640
    captureRef.current.height = videoRef.current.videoHeight || 480
    ctx.drawImage(videoRef.current, 0, 0)
    return captureRef.current.toDataURL('image/jpeg', 0.7)
  }, [])

  // ── Draw overlay on video canvas ─────────────────────────────────────────────

  const drawOverlay = useCallback((faces) => {
    const canvas = canvasRef.current
    const video  = videoRef.current
    if (!canvas || !video) return

    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    faces.forEach(face => {
      const { bbox, name, reg_number, liveness_passed, blink_count, ear } = face
      if (!bbox) return

      const { top, right, bottom, left } = bbox
      const w = right - left
      const h = bottom - top

      // Box colour: green if live+matched, yellow if matched not live, red if unknown
      const color = liveness_passed && name
        ? '#22c55e'
        : name
          ? '#f59e0b'
          : '#ef4444'

      // Draw rectangle
      ctx.strokeStyle = color
      ctx.lineWidth   = 2.5
      ctx.shadowBlur  = 8
      ctx.shadowColor = color
      ctx.strokeRect(left, top, w, h)
      ctx.shadowBlur  = 0

      // Corner marks
      const cs = 14
      ctx.lineWidth = 3.5
      ;[[left, top], [right - cs, top], [left, bottom - cs], [right - cs, bottom - cs]].forEach(([x, y], i) => {
        ctx.beginPath()
        if (i === 0) { ctx.moveTo(x, y + cs); ctx.lineTo(x, y); ctx.lineTo(x + cs, y) }
        if (i === 1) { ctx.moveTo(x, y); ctx.lineTo(x + cs, y); ctx.lineTo(x + cs, y + cs) }
        if (i === 2) { ctx.moveTo(x, y); ctx.lineTo(x, y + cs); ctx.lineTo(x + cs, y + cs) }
        if (i === 3) { ctx.moveTo(x, y); ctx.lineTo(x + cs, y); ctx.lineTo(x + cs, y - cs) }
        ctx.stroke()
      })

      // Label background
      const label   = name ? `${name.split(' ')[0]} (${reg_number})` : 'Unknown'
      const subLabel = liveness_passed
        ? '✓ Live'
        : `Blinks: ${blink_count || 0}${ear != null ? ` · EAR: ${ear}` : ''}`

      ctx.font         = 'bold 12px "DM Sans", sans-serif'
      const labelW     = Math.max(ctx.measureText(label).width, ctx.measureText(subLabel).width) + 16
      const labelX     = left
      const labelY     = top > 30 ? top - 42 : bottom + 4

      ctx.fillStyle    = color + 'cc'
      ctx.beginPath()
      ctx.roundRect(labelX, labelY, labelW, 38, 6)
      ctx.fill()

      ctx.fillStyle = '#fff'
      ctx.fillText(label, labelX + 8, labelY + 14)
      ctx.font      = '10px "DM Sans", sans-serif'
      ctx.fillStyle = liveness_passed ? '#86efac' : '#fde68a'
      ctx.fillText(subLabel, labelX + 8, labelY + 28)
    })
  }, [])

  // ── WebSocket ────────────────────────────────────────────────────────────────

  const startSession = async () => {
    setStatus('connecting')
    setMarkedStudents([])
    setTotalMarked(0)
    setFaceData([])
    await startCamera()

    const token = localStorage.getItem('token')
    const ws = new WebSocket(`${WS_BASE}/ws/attendance/${courseId}`)
    wsRef.current = ws
    isRunningRef.current = true

    ws.onopen = () => {
      ws.send(JSON.stringify({ token, date: sessionDate }))
    }

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data)

      if (msg.type === 'status') {
        setStatus('active')
        setStatusMsg(msg.message)
        // Start frame sending loop
        intervalRef.current = setInterval(() => {
          if (!isRunningRef.current || ws.readyState !== WebSocket.OPEN) return
          const frame = captureFrame()
          if (frame) ws.send(JSON.stringify({ type: 'frame', data: frame }))
        }, FRAME_INTERVAL_MS)
      }

      if (msg.type === 'result') {
        setTotalMarked(msg.total_marked)
        setFaceData(msg.faces || [])
        drawOverlay(msg.faces || [])

        if (msg.newly_marked?.length) {
          setMarkedStudents(prev => {
            const ids = new Set(prev.map(s => s.student_id))
            const fresh = msg.newly_marked.filter(s => !ids.has(s.student_id))
            return [...prev, ...fresh]
          })
        }
      }

      if (msg.type === 'stopped') {
        setStatus('stopped')
        setStatusMsg(msg.message)
        setTotalMarked(msg.total_marked)
        cleanupSession()
      }

      if (msg.type === 'error') {
        setStatus('idle')
        setStatusMsg(msg.message)
        cleanupSession()
      }
    }

    ws.onclose = () => {
      if (isRunningRef.current) {
        setStatus('stopped')
        cleanupSession()
      }
    }
  }

  const stopSession = () => {
    isRunningRef.current = false
    setStatus('stopping')
    wsRef.current?.send(JSON.stringify({ type: 'stop' }))
    setTimeout(() => {
      wsRef.current?.close()
      cleanupSession()
    }, 500)
  }

  const cleanupSession = () => {
    clearInterval(intervalRef.current)
    stopCamera()
    isRunningRef.current = false
    // Clear overlay
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
  }

  useEffect(() => () => cleanupSession(), [])  // cleanup on unmount

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/faculty" className="btn-ghost !px-3 !py-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            Live Attendance
          </h1>
          <p className="text-zinc-400 text-sm">
            {courseInfo?.course_name || `Course ${courseId}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={status} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: Camera + controls ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Date + controls */}
          <div className="card flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-sm font-medium text-zinc-300 whitespace-nowrap">Session Date:</label>
              <input
                type="date"
                className="input-base !py-2 !w-auto"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                disabled={status === 'active' || status === 'connecting'}
              />
            </div>
            <div className="flex gap-3">
              {status === 'idle' || status === 'stopped' ? (
                <button onClick={startSession} className="btn-primary">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fillOpacity=".2" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M10 8l6 4-6 4V8z"/>
                  </svg>
                  Start Session
                </button>
              ) : status === 'active' ? (
                <button onClick={stopSession} className="btn-ghost text-red-400 border-red-500/20 hover:bg-red-500/10">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                  Stop Session
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <span className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  {status === 'connecting' ? 'Connecting...' : 'Stopping...'}
                </div>
              )}
            </div>
          </div>

          {cameraError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {cameraError}
            </div>
          )}

          {/* Camera feed */}
          <div className="card p-0 overflow-hidden">
            <div className="relative bg-black aspect-video flex items-center justify-center">
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                className={`w-full h-full object-cover ${status === 'active' ? '' : 'opacity-60'}`}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ imageRendering: 'crisp-edges' }}
              />
              <canvas ref={captureRef} className="hidden" />

              {/* Overlay when not active */}
              {status === 'idle' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-zinc-600 flex items-center justify-center mx-auto mb-3 text-3xl">
                      📷
                    </div>
                    <p className="text-zinc-500 text-sm">Press "Start Session" to begin</p>
                  </div>
                </div>
              )}

              {status === 'stopped' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="text-center card max-w-xs">
                    <div className="text-4xl mb-2">✅</div>
                    <p className="text-white font-semibold">{statusMsg || 'Session ended'}</p>
                    <p className="text-zinc-400 text-sm mt-1">{totalMarked} student(s) marked present</p>
                  </div>
                </div>
              )}
            </div>

            {/* Live face indicators */}
            {status === 'active' && faceData.length > 0 && (
              <div className="p-3 border-t border-surface-border flex flex-wrap gap-2">
                {faceData.map((f, i) => (
                  <div key={i} className={`rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5
                    ${f.liveness_passed && f.name ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                    : f.name ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                    : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${f.liveness_passed ? 'bg-green-400 animate-pulse-dot' : 'bg-yellow-400'}`} />
                    {f.name ? f.name.split(' ')[0] : 'Unknown'}
                    {f.liveness_passed ? ' ✓' : ` · Blinks: ${f.blink_count || 0}`}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="card bg-brand-600/5 border-brand-500/20">
            <h3 className="text-sm font-semibold text-brand-300 mb-2">📋 Liveness Detection Guide</h3>
            <ul className="text-xs text-zinc-400 space-y-1">
              <li>• System requires a natural <strong className="text-white">eye blink</strong> before marking attendance</li>
              <li>• Ask students to face the camera directly and blink naturally</li>
              <li>• <span className="text-green-400">Green box</span> = verified live match · <span className="text-yellow-400">Yellow</span> = matched, awaiting blink · <span className="text-red-400">Red</span> = unknown face</li>
              <li>• Each student is marked only once per session regardless of detection count</li>
            </ul>
          </div>
        </div>

        {/* ── Right: marked list ── */}
        <div className="xl:col-span-1 space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-white">Marked Present</h2>
              <span className="badge badge-green font-mono">{totalMarked}</span>
            </div>

            {markedStudents.length === 0 ? (
              <div className="py-8 text-center">
                <div className="text-2xl mb-2">👥</div>
                <p className="text-zinc-500 text-xs">No students marked yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {markedStudents.map((s, i) => (
                  <div key={s.student_id}
                    className="flex items-center gap-3 rounded-xl bg-green-500/8 border border-green-500/15 px-3 py-2.5 animate-slide-up">
                    <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center text-xs text-green-400 font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{s.name}</p>
                      <p className="text-[11px] font-mono text-zinc-500">{s.reg_number}</p>
                    </div>
                    <svg className="w-4 h-4 text-green-400 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ))}
              </div>
            )}
          </div>

          {courseInfo && (
            <div className="card">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Session Info</h3>
              <div className="space-y-2 text-sm">
                <Row label="Course"    value={courseInfo.course_name} />
                <Row label="Enrolled"  value={`${courseInfo.total_enrolled} students`} />
                <Row label="Date"      value={sessionDate} mono />
                <Row label="Progress"  value={`${totalMarked} / ${courseInfo.total_enrolled}`} />
              </div>
              {courseInfo.total_enrolled > 0 && (
                <div className="mt-3">
                  <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((totalMarked / courseInfo.total_enrolled) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    {Math.round((totalMarked / courseInfo.total_enrolled) * 100)}% captured
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function StatusBadge({ status }) {
  const map = {
    idle:       { cls: 'badge-blue',   dot: 'bg-brand-400',  label: 'Ready'       },
    connecting: { cls: 'badge-yellow', dot: 'bg-yellow-400', label: 'Connecting'  },
    active:     { cls: 'badge-green',  dot: 'bg-green-400',  label: 'Live'        },
    stopping:   { cls: 'badge-yellow', dot: 'bg-yellow-400', label: 'Stopping'    },
    stopped:    { cls: 'badge-red',    dot: 'bg-red-400',    label: 'Session Ended'},
  }
  const { cls, dot, label } = map[status] || map.idle
  return (
    <span className={`badge ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${status === 'active' ? 'animate-pulse-dot' : ''}`} />
      {label}
    </span>
  )
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={`text-white font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}
