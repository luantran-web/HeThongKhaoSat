import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import type { Question, Section, Survey } from './types'

export type Status = Survey['status']
export const STATUS_LABEL: Record<Status, string> = {
  draft: 'Bản nháp', published: 'Đã xuất bản', closed: 'Đã đóng', archived: 'Đã lưu trữ',
}
export const STATUS_CLASS: Record<Status, string> = {
  draft: 'bg-amber-50 text-amber-700', published: 'bg-green-50 text-ok',
  closed: 'bg-slate-100 text-slate-600', archived: 'bg-slate-100 text-slate-500',
}
/** Các bước chuyển trạng thái hợp lệ (khớp trigger trong database). */
export const TRANSITIONS: Record<Status, { to: Status; label: string; action: string }[]> = {
  draft: [{ to: 'published', label: 'Xuất bản', action: 'publish' }, { to: 'archived', label: 'Lưu trữ', action: 'archive' }],
  published: [{ to: 'closed', label: 'Đóng khảo sát', action: 'close' }, { to: 'archived', label: 'Lưu trữ', action: 'archive' }],
  closed: [{ to: 'published', label: 'Mở lại', action: 'reopen' }, { to: 'archived', label: 'Lưu trữ', action: 'archive' }],
  archived: [{ to: 'draft', label: 'Khôi phục về bản nháp', action: 'restore' }],
}
export const ACTION_LABEL: Record<string, string> = {
  create: 'Tạo khảo sát', update: 'Cập nhật khảo sát', publish: 'Xuất bản khảo sát', close: 'Đóng khảo sát',
  reopen: 'Mở lại khảo sát', archive: 'Lưu trữ khảo sát', restore: 'Khôi phục khảo sát',
  delete: 'Xóa khảo sát', duplicate: 'Nhân bản khảo sát',
}

export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Lấy hết các dòng, mỗi lần 1000 (giới hạn của Supabase). */
export async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function logActivity(action: string, surveyId: string | null, detail?: Record<string, unknown>) {
  try {
    const { data } = await supabase.auth.getUser()
    await supabase.from('admin_activity').insert({ admin_id: data.user?.id, action, survey_id: surveyId, detail })
  } catch { /* nhật ký không được làm hỏng thao tác chính */ }
}

export function downloadBlob(filename: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ---------- Tải khảo sát đầy đủ (cấu trúc + nhãn lựa chọn) ----------
export interface Bundle {
  survey: Survey; sections: Section[]; questions: Question[]
  labelFor: (q: Question, value: unknown) => string
}

export async function loadBundle(id: string): Promise<Bundle> {
  const { data, error } = await supabase.from('surveys')
    .select('*, survey_sections(*), survey_questions(*, question_options(*))').eq('id', id).single()
  if (error || !data) throw error ?? new Error('Không tìm thấy khảo sát')
  const survey = data as Survey
  const sections = [...survey.survey_sections].sort((a, b) => a.position - b.position)
  const questions = [...survey.survey_questions].sort((a, b) => a.position - b.position)
  questions.forEach((q) => q.question_options.sort((a, b) => a.position - b.position))

  const catalogIds = [...new Set(questions.filter((q) => q.catalog_id).map((q) => q.catalog_id as string))]
  const catalogMap = new Map<string, string>() // `${catalogId}|${code}` -> label
  if (catalogIds.length) {
    const items = await fetchAll<{ catalog_id: string; code: string; label: string }>((f, t) =>
      supabase.from('catalog_items').select('catalog_id, code, label').in('catalog_id', catalogIds).order('id').range(f, t))
    items.forEach((i) => catalogMap.set(`${i.catalog_id}|${i.code}`, i.label))
  }
  const labelFor = (q: Question, value: unknown): string => {
    if (value === null || value === undefined) return ''
    const one = (v: unknown) => {
      const s = String(v)
      if (q.type === 'catalog_select') return catalogMap.get(`${q.catalog_id}|${s}`) ?? s
      return q.question_options.find((o) => o.value === s)?.label ?? s
    }
    return Array.isArray(value) ? value.map(one).join('; ') : one(value)
  }
  return { survey, sections, questions, labelFor }
}

/** Câu hỏi theo đúng thứ tự hiển thị (theo phần, rồi theo vị trí). */
export function orderedQuestions(b: Bundle): Question[] {
  return b.sections.flatMap((s) => b.questions.filter((q) => q.section_id === s.id))
    .concat(b.questions.filter((q) => !q.section_id))
}

export interface RespRow { id: string; submitted_at: string; updated_at: string }
export interface AnsRow { response_id: string; question_id: string; value: unknown; comment: string | null }

export async function loadResponses(b: Bundle, opts?: { from?: string; to?: string }) {
  const qIds = b.questions.map((q) => q.id)
  const responses = await fetchAll<RespRow>((f, t) => {
    let q = supabase.from('responses').select('id, submitted_at, updated_at').eq('survey_id', b.survey.id)
    if (opts?.from) q = q.gte('submitted_at', opts.from)
    if (opts?.to) q = q.lte('submitted_at', opts.to)
    return q.order('submitted_at', { ascending: false }).order('id').range(f, t)
  })
  const answers = qIds.length
    ? await fetchAll<AnsRow>((f, t) => supabase.from('response_answers')
        .select('response_id, question_id, value, comment').in('question_id', qIds).order('id').range(f, t))
    : []
  const byResp = new Map<string, Map<string, AnsRow>>()
  for (const a of answers) {
    if (!byResp.has(a.response_id)) byResp.set(a.response_id, new Map())
    byResp.get(a.response_id)!.set(a.question_id, a)
  }
  return { responses, byResp }
}

const FORMULA = /^[=+\-@\t\r]/
const safe = (v: string) => (FORMULA.test(v) ? `'${v}` : v) // chống chèn công thức khi mở bằng Excel

export function buildTable(b: Bundle, responses: RespRow[], byResp: Map<string, Map<string, AnsRow>>) {
  const qs = orderedQuestions(b).filter((q) => q.type !== 'section_title')
  const headers = ['Thời điểm gửi', 'Mã phiếu']
  qs.forEach((q) => { headers.push(`${q.label} [${q.code}]`); if (q.allow_comment) headers.push(`Ý kiến thêm: ${q.label}`) })
  const rows = responses.map((r) => {
    const row: string[] = [new Date(r.submitted_at).toLocaleString('vi-VN'), r.id]
    const m = byResp.get(r.id)
    qs.forEach((q) => {
      const a = m?.get(q.id)
      row.push(safe(b.labelFor(q, a?.value)))
      if (q.allow_comment) row.push(safe(a?.comment ?? ''))
    })
    return row
  })
  return { headers, rows }
}

export function exportCsv(name: string, headers: string[], rows: string[][]) {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  const text = '\uFEFF' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  downloadBlob(`${name}.csv`, new Blob([text], { type: 'text/csv;charset=utf-8' }))
}

export function exportXlsx(name: string, headers: string[], rows: string[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Phan hoi')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(`${name}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}

export async function exportSurvey(id: string, kind: 'csv' | 'xlsx') {
  const b = await loadBundle(id)
  const { responses, byResp } = await loadResponses(b)
  const { headers, rows } = buildTable(b, responses, byResp)
  const name = `${b.survey.slug}-${new Date().toISOString().slice(0, 10)}`
  if (kind === 'csv') exportCsv(name, headers, rows); else exportXlsx(name, headers, rows)
  await logActivity('export', id, { kind, rows: rows.length })
  return rows.length
}

// ---------- Nhân bản ----------
export async function duplicateSurvey(id: string): Promise<string> {
  const b = await loadBundle(id)
  const s = b.survey
  const newId = crypto.randomUUID()
  const { data: slugs } = await supabase.from('surveys').select('slug').like('slug', `${s.slug}-ban-sao%`)
  const taken = new Set((slugs ?? []).map((x: { slug: string }) => x.slug))
  let slug = `${s.slug}-ban-sao`, n = 2
  while (taken.has(slug)) slug = `${s.slug}-ban-sao-${n++}`

  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('surveys').insert({
    id: newId, slug, title: `${s.title} (bản sao)`, description: s.description, intro_html: s.intro_html,
    status: 'draft', starts_at: null, ends_at: null, max_responses: s.max_responses,
    require_login: s.require_login, allow_edit: s.allow_edit, dedupe_fields: s.dedupe_fields,
    theme: s.theme, thank_you: s.thank_you, created_by: u.user?.id,
  })
  if (error) throw error

  const secMap = new Map<string, string>()
  const secRows = b.sections.map((x) => { const nid = crypto.randomUUID(); secMap.set(x.id, nid); return { id: nid, survey_id: newId, title: x.title, position: x.position } })
  if (secRows.length) { const r = await supabase.from('survey_sections').insert(secRows); if (r.error) throw r.error }

  const qRows = b.questions.map((q) => ({
    id: crypto.randomUUID(), survey_id: newId, section_id: q.section_id ? secMap.get(q.section_id) ?? null : null,
    code: q.code, type: q.type, label: q.label, help_text: q.help_text, required: q.required, position: q.position,
    default_value: q.default_value, validation: q.validation, show_if: q.show_if, catalog_id: q.catalog_id,
    allow_comment: q.allow_comment, comment_max_length: q.comment_max_length, config: q.config,
  }))
  if (qRows.length) { const r = await supabase.from('survey_questions').insert(qRows); if (r.error) throw r.error }
  const idByCode = new Map(qRows.map((q) => [q.code, q.id]))
  const oRows = b.questions.flatMap((q) => q.question_options.map((o) => ({
    question_id: idByCode.get(q.code)!, value: o.value, label: o.label, description: o.description, position: o.position,
  })))
  if (oRows.length) { const r = await supabase.from('question_options').insert(oRows); if (r.error) throw r.error }
  await logActivity('duplicate', newId, { from: id })
  return newId
}

export function publicUrl(slug: string) { return `${window.location.origin}/khao-sat/${slug}` }
