import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { BarChart3, ClipboardList, Download, LayoutDashboard, LogOut, PanelLeft } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'

const nav = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/admin/khao-sat', label: 'Khảo sát', icon: ClipboardList },
  { to: '/admin/phan-tich', label: 'Phân tích', icon: BarChart3 },
  { to: '/admin/tai-ve', label: 'Tải dữ liệu', icon: Download },
]

export default function AdminLayout() {
  const { session, isAdmin, loading, signOut } = useAuth()
  const [open, setOpen] = useState(true)

  if (loading) return <div className="p-8 text-muted">Đang tải...</div>
  if (!session) return <Navigate to="/admin/dang-nhap" replace />
  if (!isAdmin)
    return (
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-lg font-semibold">Tài khoản chưa có quyền quản trị</h1>
        <p className="mt-2 text-sm text-muted">Hãy nhờ quản trị viên cấp quyền cho {session.user.email}.</p>
        <button onClick={signOut} className="mt-4 rounded-md border border-line px-3 py-2 text-sm">Đăng xuất</button>
      </div>
    )

  const initial = (session.user.email ?? '?').charAt(0).toUpperCase()

  return (
    <div className="flex h-full">
      {open && (
        <aside className="flex w-60 shrink-0 flex-col bg-navy-900 text-white">
          <div className="px-4 pt-5 pb-2 text-sm font-semibold text-accent">QUẢN TRỊ KHẢO SÁT</div>
          <nav className="flex flex-col gap-1 px-2">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-navy-700' : 'hover:bg-navy-800'}`}>
                <Icon size={16} /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto p-2">
            <NavLink to="/" className="block rounded-md px-3 py-2 text-sm text-white/80 hover:bg-navy-800">Xem cổng khảo sát</NavLink>
          </div>
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-line bg-white px-4">
          <button onClick={() => setOpen(!open)} aria-label="Ẩn hiện thanh bên" className="rounded p-1.5 hover:bg-surface">
            <PanelLeft size={18} />
          </button>
          <span className="text-sm text-muted">Hệ thống khảo sát</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{initial}</span>
            <span className="hidden text-sm font-medium sm:inline">{session.user.email}</span>
            <button onClick={signOut} className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-sm hover:bg-surface">
              <LogOut size={14} /> Đăng xuất
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-6"><Outlet /></main>
      </div>
    </div>
  )
}
