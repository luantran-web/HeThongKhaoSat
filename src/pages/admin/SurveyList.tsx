import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, Copy, Download, Eye, Link2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { STATUS_CLASS, STATUS_LABEL, TRANSITIONS, duplicateSurvey, logActivity, publicUrl, type Status } from '@/lib/admin'

interface Row {
  survey_id: string; slug: string; title: string; status: Status
  total_responses: number; responses_7d: number; last_response_at: string | null; updated_at: string
}

export default function SurveyList() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | Status>('all')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['admin-surveys'],
    queryFn: async () => {
      const { data, error } = await supabase.from('survey_stats').select('*').order('updated_at', { ascending: false })
      if (error) throw error
      return data as Row[]
    },
  })

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return data.filter((r) => (status === 'all' || r.status === status)
      && (!t || r.title.toLowerCase().includes(t) || r.slug.includes(t)))
  }, [data, q, status])

  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-surveys'] }); qc.invalidateQueries({ queryKey: ['admin-dashboard'] }) }
  const ok = (text: string) => setMsg({ type: 'ok', text })
  const fail = (e: unknown) => setMsg({ type: 'err', text: (e as Error)?.message ?? 'Thao tác không thành công.' })

  const changeStatus = useMutation({
    mutationFn: async ({ r, to, action }: { r: Row; to: Status; action: string }) => {
      if (to === 'published') {
        const { count } = await supabase.from('survey_questions').select('id', { count: 'exact', head: true })
          .eq('survey_id', r.survey_id).neq('type', 'section_title')
        if (!count) throw new Error('Khảo sát chưa có câu hỏi nào, chưa thể xuất bản.')
      }
      const { error } = await supabase.from('surveys').update({ status: to }).eq('id', r.survey_id)
      if (error) throw error
      await logActivity(action, r.survey_id, { to })
    },
    onSuccess: () => { ok('Đã cập nhật trạng thái.'); refresh() }, onError: fail,
  })

  const dup = useMutation({
    mutationFn: (id: string) => duplicateSurvey(id),
    onSuccess: (id) => { refresh(); nav(`/admin/khao-sat/${id}`) }, onError: fail,
  })

  const del = useMutation({
    mutationFn: async (r: Row) => {
      if (r.total_responses > 0) throw new Error('Khảo sát đã có phản hồi nên không xóa được. Hãy lưu trữ khảo sát.')
      if (r.status !== 'draft' && r.status !== 'archived') throw new Error('Chỉ xóa được khảo sát ở trạng thái bản nháp hoặc đã lưu trữ.')
      const { error } = await supabase.from('surveys').delete().eq('id', r.survey_id)
      if (error) throw error
      await logActivity('delete', null, { title: r.title, slug: r.slug })
    },
    onSuccess: () => { ok('Đã xóa khảo sát.'); refresh() }, onError: fail,
  })

  async function copyLink(slug: string) {
    try { await navigator.clipboard.writeText(publicUrl(slug)); ok('Đã sao chép liên kết.') } catch { fail(new Error('Không sao chép được.')) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Quản lý khảo sát</h1>
        <Link to="/admin/khao-sat/moi" className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          <Plus size={16} /> Tạo khảo sát mới
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="relative min-w-60 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên hoặc đường dẫn"
            className="w-full rounded-md border border-line bg-white py-2 pl-9 pr-3 text-sm" />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Lọc trạng thái"
          className="rounded-md border border-line bg-white px-3 py-2 text-sm">
          <option value="all">Tất cả trạng thái</option>
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {msg && (
        <p role="status" className={`mt-4 rounded px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-green-50 text-ok' : 'bg-red-50 text-danger'}`}>{msg.text}</p>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-line bg-surface text-xs uppercase text-muted">
            <tr><th className="px-4 py-3">Khảo sát</th><th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Phản hồi</th><th className="px-4 py-3 text-right">7 ngày</th>
              <th className="px-4 py-3">Cập nhật</th><th className="px-4 py-3 text-right">Thao tác</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-muted">Đang tải...</td></tr>}
            {error && <tr><td colSpan={6} className="px-4 py-6 text-danger">Không tải được danh sách.</td></tr>}
            {!isLoading && !error && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Chưa có khảo sát nào.</td></tr>}
            {rows.map((r) => (
              <tr key={r.survey_id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <Link to={`/admin/khao-sat/${r.survey_id}`} className="font-medium text-brand hover:underline">{r.title}</Link>
                  <div className="text-xs text-muted">/khao-sat/{r.slug}</div>
                </td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                <td className="px-4 py-3 text-right font-medium">{r.total_responses}</td>
                <td className="px-4 py-3 text-right text-muted">{r.responses_7d}</td>
                <td className="px-4 py-3 text-muted">{new Date(r.updated_at).toLocaleDateString('vi-VN')}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconLink to={`/admin/khao-sat/${r.survey_id}`} label="Chỉnh sửa"><Pencil size={15} /></IconLink>
                    <IconLink to={`/khao-sat/${r.slug}?preview=1`} label="Xem trước" external><Eye size={15} /></IconLink>
                    <IconLink to={`/admin/phan-tich?s=${r.survey_id}`} label="Phân tích"><BarChart3 size={15} /></IconLink>
                    <IconLink to={`/admin/tai-ve/${r.survey_id}`} label="Phản hồi và tải về"><Download size={15} /></IconLink>
                    <details className="relative">
                      <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded hover:bg-surface" aria-label="Thêm thao tác"><MoreHorizontal size={16} /></summary>
                      <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-line bg-white py-1 text-sm shadow-lg">
                        <MenuBtn onClick={() => copyLink(r.slug)}><Link2 size={14} /> Sao chép liên kết</MenuBtn>
                        <MenuBtn onClick={() => dup.mutate(r.survey_id)}><Copy size={14} /> Nhân bản</MenuBtn>
                        {TRANSITIONS[r.status].map((t) => (
                          <MenuBtn key={t.to} onClick={() => changeStatus.mutate({ r, to: t.to, action: t.action })}>{t.label}</MenuBtn>
                        ))}
                        <MenuBtn danger onClick={() => { if (window.confirm(`Xóa khảo sát "${r.title}"? Không thể hoàn tác.`)) del.mutate(r) }}><Trash2 size={14} /> Xóa</MenuBtn>
                      </div>
                    </details>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function IconLink({ to, label, children, external }: { to: string; label: string; children: React.ReactNode; external?: boolean }) {
  const cls = 'flex h-8 w-8 items-center justify-center rounded hover:bg-surface'
  return external
    ? <a href={to} target="_blank" rel="noreferrer" title={label} aria-label={label} className={cls}>{children}</a>
    : <Link to={to} title={label} aria-label={label} className={cls}>{children}</Link>
}
function MenuBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface ${danger ? 'text-danger' : ''}`}>{children}</button>
}
