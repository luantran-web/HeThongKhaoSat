import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

export default function Login() {
  const { session, signIn } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/admin" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const err = await signIn(email.trim(), password)
    setBusy(false)
    if (err) setError(err); else nav('/admin')
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Đăng nhập quản trị</h1>
        <label className="mt-5 block text-sm font-medium">Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" />
        </label>
        <label className="mt-4 block text-sm font-medium">Mật khẩu
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" />
        </label>
        {error && <p role="alert" className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
        <button disabled={busy} className="mt-5 w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
          {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
}
