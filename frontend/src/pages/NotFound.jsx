import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="text-center">
        <div className="font-display text-9xl font-extrabold text-surface-border mb-4">404</div>
        <h1 className="font-display text-3xl font-bold text-white mb-2">Page Not Found</h1>
        <p className="text-zinc-400 mb-8">The page you're looking for doesn't exist.</p>
        <Link to="/" className="btn-primary px-8">Go Home</Link>
      </div>
    </div>
  )
}
