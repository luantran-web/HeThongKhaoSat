import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '@/lib/supabase'
import { ACTION_LABEL, STATUS_CLASS, STATUS_LABEL, type Status } from '@/lib/admin'

interface Stat { survey_id: string; slug: string; title: string; status: Status; total_responses: number; responses_7d: number; updated_at: string }

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)
      const [stats, daily, act, admins] = await Promise.all([
        supabase.from('survey_stats').select('*'),
        supabase.from('responses_daily').select('day, total').gte('day', since),
        supabase.from('admin_activity').select('id, admin_id, action, created_at, detail, surveys(title)').order('created_at', { ascending: false }).limit(10),
        supabase.from('admin_users').select('user_id, email'),
      ])
      for (const r of [stats, daily, act, admins]) if (r.error) throw r.error
      return { stats: stats.data as Stat[], daily: daily.data as { day: string; total: number }[], act: act.data as any[], admins: admins.data as { user_id: string; email: string }[] }
    },
  })

  const kpi = useMemo(() => {
    const s = data?.stats ?? []
    return {
      total: s.length,
      active: s.filter((x) => x.status === 'published').length,
      draft: s.filter((x) => x.status === 'draft').length,
      closed: s.filter((x) => x.status === 'closed' || x.status === 'archived').length,
      responses: s.reduce((a, x) => a + Number(x.total_responses), 0),
    }
  }, [data])

  const byDay = useMemo(() => {
    const m = new Map<string, number>()
    data?.daily.forEach((d) => m.set(d.day, (m.get(d.day) ?? 0) + Number(d.total)))
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10)
      return { day: d.slice(8) + '/' + d.slice(5, 7), total: m.get(d) ?? 0 }
    })
  }, [data])

  const bySurvey = useMemo(() => [...(data?.stats ?? [])]
    .sort((a, b) => Number(b.total_responses) - Number(a.total_responses)).slice(0, 8)
    .map((s) => ({ name: s.title.length > 28 ? s.title.slice(0, 27) + '…' : s.title, total: Number(s.total_responses) })), [data])

  const recent = useMemo(() => [...(data?.stats ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6), [data])
  const adminName = (id: string | null) => data?.admins.find((a) => a.user_id === id)?.email ?? 'Quản trị viên'

  if (isLoading) return <p className="text-muted">Đang tải số liệu...</p>
  if (error) return <p className="text-danger">Không tải được số liệu tổng quan.</p>

  const cards = [
    { label: 'Tổng số khảo sát', v: kpi.total, cls: '' },
    { label: 'Đang hoạt động', v: kpi.active, cls: 'text-ok' },
    { label: 'Bản nháp', v: kpi.draft, cls: 'text-amber-600' },
    { label: 'Đã đóng / lưu trữ', v: kpi.closed, cls: 'text-slate-600' },
    { label: 'Tổng phản hồi', v: kpi.responses, cls: 'text-brand' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold">Tổng quan</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-line bg-white p-4">
            <div className="text-xs font-medium uppercase text-muted">{c.label}</div>
            <div className={`mt-1 text-3xl font-bold ${c.cls}`}>{c.v.toLocaleString('vi-VN')}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-white p-4">
          <h2 className="font-semibold">Phản hồi theo thời gian (30 ngày)</h2>
          <div className="mt-3 h-64" role="img" aria-label="Biểu đồ số phản hồi theo ngày">
            <ResponsiveContainer>
              <LineChart data={byDay} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" fontSize={11} interval={4} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip formatter={(v) => [v as number, 'Phản hồi']} />
                <Line type="monotone" dataKey="total" stroke="#0b6fb8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-lg border border-line bg-white p-4">
          <h2 className="font-semibold">Phản hồi theo từng khảo sát</h2>
          {bySurvey.length === 0 ? <p className="mt-6 text-sm text-muted">Chưa có dữ liệu.</p> : (
            <div className="mt-3 h-64" role="img" aria-label="Biểu đồ số phản hồi theo khảo sát">
              <ResponsiveContainer>
                <BarChart data={bySurvey} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis type="category" dataKey="name" width={150} fontSize={11} />
                  <Tooltip formatter={(v) => [v as number, 'Phản hồi']} />
                  <Bar dataKey="total" fill="#0b6fb8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-white p-4">
          <h2 className="font-semibold">Khảo sát mới cập nhật</h2>
          <ul className="mt-3 divide-y divide-line">
            {recent.length === 0 && <li className="py-3 text-sm text-muted">Chưa có khảo sát.</li>}
            {recent.map((s) => (
              <li key={s.survey_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link to={`/admin/khao-sat/${s.survey_id}`} className="min-w-0 truncate font-medium text-brand hover:underline">{s.title}</Link>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-muted">{Number(s.total_responses)} phản hồi</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-line bg-white p-4">
          <h2 className="font-semibold">Hoạt động gần đây</h2>
          <ul className="mt-3 divide-y divide-line">
            {(data?.act.length ?? 0) === 0 && <li className="py-3 text-sm text-muted">Chưa có hoạt động nào.</li>}
            {data?.act.map((a) => (
              <li key={a.id} className="py-2.5 text-sm">
                <div><b>{ACTION_LABEL[a.action] ?? (a.action === 'export' ? 'Xuất dữ liệu' : a.action)}</b>
                  {a.surveys?.title ? <> · {a.surveys.title}</> : a.detail?.title ? <> · {a.detail.title}</> : null}</div>
                <div className="text-xs text-muted">{adminName(a.admin_id)} · {new Date(a.created_at).toLocaleString('vi-VN')}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
