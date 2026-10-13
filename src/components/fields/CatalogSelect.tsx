import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Filter, ListChecks, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { CatalogItem, Question } from '@/lib/types'
import { inputCls } from './Field'

interface FilterDef { key: string; label: string; defaultFrom?: string }

/** Chọn nhiều mục từ danh mục lớn: lọc, tìm, phân trang. Bộ lọc không làm mất lựa chọn đã tick. */
export default function CatalogSelect(props: {
  q: Question; value: string[]; onChange: (v: string[]) => void
  answerValues: Record<string, unknown>; onReview: () => void
}) {
  const { q, value, onChange, answerValues, onReview } = props
  const filters: FilterDef[] = q.config.filters ?? []
  const pageSize: number = q.config.page_size ?? 8
  const noun: string = q.config.noun ?? 'mục'

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['catalog', q.catalog_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_items').select('id, code, label, attrs, position')
        .eq('catalog_id', q.catalog_id!).eq('is_active', true).order('position')
      if (error) throw error
      return data as CatalogItem[]
    },
  })

  const [picked, setPicked] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  const [page, setPage] = useState(0)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  // Giá trị lọc hiệu lực: người dùng chọn > mặc định lấy từ câu trả lời khác (vd cấp học ở bước 1)
  const eff = (f: FilterDef) => picked[f.key] ?? (f.defaultFrom ? String(answerValues[f.defaultFrom] ?? '') : '')

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase()
    return items.filter((it) =>
      filters.every((f) => { const v = eff(f); return !v || it.attrs[f.key] === v })
      && (!t || it.label.toLowerCase().includes(t))
      && (!onlySelected || value.includes(it.code)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, onlySelected, value, picked, answerValues])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const cur = Math.min(page, pages - 1)
  const slice = filtered.slice(cur * pageSize, cur * pageSize + pageSize)

  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code])
  const optionsFor = (f: FilterDef) => {
    const m = new Map<string, number>()
    for (const it of items) { const v = it.attrs[f.key]; if (v) m.set(String(v), (m.get(String(v)) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi', { numeric: true }))
  }

  if (error) return <p className="text-sm text-danger">Không tải được danh sách. Hãy tải lại trang.</p>
  if (isLoading) return <p className="text-sm text-muted">Đang tải danh sách...</p>

  return (
    <div>
      <div className="rounded-lg border border-line bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-brand"><Filter size={15} /> Lọc danh sách</span>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <button type="button" onClick={() => { setOnlySelected(!onlySelected); setPage(0) }}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 ${onlySelected ? 'border-brand bg-brand-soft text-brand' : 'border-line'}`}>
              <ListChecks size={14} /> Đã chọn ({value.length})
            </button>
            {(Object.keys(picked).length > 0 || search) && (
              <button type="button" className="text-muted hover:text-ink" onClick={() => { setPicked({}); setSearch(''); setPage(0) }}>Bỏ lọc</button>
            )}
            <button type="button" className="font-medium text-brand" onClick={onReview}>Xem lại trước khi gửi</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {filters.map((f) => (
            <label key={f.key} className="text-xs font-medium text-muted">{f.label}
              <select value={eff(f)} onChange={(e) => { setPicked({ ...picked, [f.key]: e.target.value }); setPage(0) }}
                className={`${inputCls} mt-1`}>
                <option value="">Tất cả</option>
                {optionsFor(f).map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
              </select>
            </label>
          ))}
          <label className="text-xs font-medium text-muted">Tìm theo tên
            <span className="relative mt-1 block">
              <Search size={14} className="pointer-events-none absolute left-3 top-3.5 text-muted" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} placeholder="Tên..." className={`${inputCls} pl-8`} />
            </span>
          </label>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-muted">
        <span><b className="text-ink">{filtered.length}</b> {noun} phù hợp</span>
        <span>{filtered.length ? `${cur * pageSize + 1}-${Math.min(filtered.length, (cur + 1) * pageSize)} / ${filtered.length}` : '0'}</span>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {slice.map((it) => {
          const on = value.includes(it.code)
          const open = openIds.has(it.id)
          const desc = it.attrs.description as string | undefined
          return (
            <div key={it.id} className={`overflow-hidden rounded-lg border bg-white ${on ? 'border-brand ring-1 ring-brand' : 'border-line'}`}>
              {it.attrs.image_url && <img src={it.attrs.image_url} alt="" loading="lazy" className="h-28 w-full object-cover" />}
              <label className="flex cursor-pointer items-start gap-2 p-3">
                <input type="checkbox" checked={on} onChange={() => toggle(it.code)} className="mt-1" />
                <span className="min-w-0 text-sm font-medium leading-snug">{it.label}</span>
              </label>
              <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                {[it.attrs.group, it.attrs.brand].filter(Boolean).map((b) => (
                  <span key={String(b)} className="rounded bg-surface px-1.5 py-0.5 text-xs text-muted">{String(b)}</span>
                ))}
              </div>
              {desc && (
                <div className="px-3 pb-3 text-xs text-muted">
                  {open && <p className="mb-1">{desc}</p>}
                  <button type="button" className="font-medium text-brand"
                    onClick={() => { const n = new Set(openIds); open ? n.delete(it.id) : n.add(it.id); setOpenIds(n) }}>
                    {open ? 'Thu gọn' : 'Xem thêm'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {filtered.length === 0 && <p className="mt-4 rounded border border-dashed border-line p-4 text-center text-sm text-muted">Không có {noun} nào khớp bộ lọc.</p>}

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Trước</button>
          <span className="text-muted">Trang {cur + 1}/{pages}</span>
          <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Sau</button>
        </div>
      )}
      <p className="mt-3 text-sm text-brand">Đã chọn <b>{value.length}</b> {noun} (bộ lọc không làm mất lựa chọn đã tick).</p>
    </div>
  )
}
