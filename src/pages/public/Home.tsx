import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isOpenNow, type Survey } from '@/lib/types'

type Row = Pick<Survey, 'id' | 'slug' | 'title' | 'description' | 'status' | 'starts_at' | 'ends_at'>
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('vi-VN') : null)

export default function Home() {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all')

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['public-surveys'],
    queryFn: async () => {
      const { data, error } = await supabase.from('surveys')
        .select('id, slug, title, description, status, starts_at, ends_at').order('published_at', { ascending: false })
      if (error) throw error
      return data as Row[]
    },
  })

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return data.filter((s) => {
      const open = isOpenNow(s)
      return (filter === 'all' || (filter === 'open' ? open : !open))
        && (!t || s.title.toLowerCase().includes(t) || (s.description ?? '').toLowerCase().includes(t))
    })
  }, [data, q, filter])

  return (
    <div>
      <h1 className="text-2xl font-bold">Khảo sát</h1>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-60 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên hoặc từ khóa"
            className="w-full rounded-md border border-line bg-white py-2 pl-9 pr-3 text-sm" />
        </label>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-md border border-line bg-white px-3 py-2 text-sm" aria-label="Lọc theo trạng thái">
          <option value="all">Tất cả trạng thái</option>
          <option value="open">Đang mở</option>
          <option value="closed">Đã đóng</option>
        </select>
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted">Đang tải...</p>}
      {error && <p className="mt-6 text-sm text-danger">Không tải được danh sách khảo sát.</p>}
      {!isLoading && !error && rows.length === 0 && (
        <p className="mt-6 rounded border border-dashed border-line p-6 text-center text-sm text-muted">Không có khảo sát nào phù hợp.</p>
      )}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {rows.map((s) => {
          const open = isOpenNow(s)
          return (
            <li key={s.id} className="flex flex-col rounded-lg border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold leading-snug">{s.title}</h2>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${open ? 'bg-green-50 text-ok' : 'bg-surface text-muted'}`}>
                  {open ? 'Đang mở' : 'Đã đóng'}
                </span>
              </div>
              {s.description && <p className="mt-1 line-clamp-3 text-sm text-muted">{s.description}</p>}
              <div className="mt-3 text-xs text-muted">
                {fmt(s.starts_at) && <>Từ {fmt(s.starts_at)} </>}{fmt(s.ends_at) && <>đến {fmt(s.ends_at)}</>}
              </div>
              <div className="mt-auto pt-4">
                {open
                  ? <Link to={`/khao-sat/${s.slug}`} className="inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Làm khảo sát</Link>
                  : <span className="text-sm text-muted">Khảo sát không còn nhận phản hồi</span>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
