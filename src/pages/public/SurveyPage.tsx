import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ListChecks, RefreshCw, Send } from 'lucide-react'
import { supabase, getDeviceToken } from '@/lib/supabase'
import { isOpenNow, type AnswerMap, type Question, type Survey } from '@/lib/types'
import { validate, valuesOf, visibleCodes } from '@/lib/validate'
import QuestionField from '@/components/fields/QuestionField'

interface Submitted { response_id: string; label: string; at: string; answers: AnswerMap }
const storeKey = (slug: string) => `khaosat_submitted_${slug}`
const readSubmitted = (slug: string): Submitted | null => {
  try { return JSON.parse(localStorage.getItem(storeKey(slug)) ?? 'null') } catch { return null }
}
const hasValue = (v: unknown) => !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0))

async function fetchSurvey(slug: string): Promise<Survey | null> {
  const { data, error } = await supabase.from('surveys')
    .select('*, survey_sections(*), survey_questions(*, question_options(*))').eq('slug', slug).maybeSingle()
  if (error) throw error
  if (!data) return null
  const s = data as Survey
  s.survey_sections.sort((a, b) => a.position - b.position)
  s.survey_questions.sort((a, b) => a.position - b.position)
  s.survey_questions.forEach((q) => q.question_options.sort((a, b) => a.position - b.position))
  return s
}

export default function SurveyPage() {
  const { slug = '' } = useParams()
  const { data: survey, isLoading, error } = useQuery({ queryKey: ['survey', slug], queryFn: () => fetchSurvey(slug) })

  const [answers, setAnswers] = useState<AnswerMap>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Submitted | null>(() => readSubmitted(slug))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [active, setActive] = useState<string>('')
  const reviewRef = useRef<HTMLDivElement>(null)

  const questions = survey?.survey_questions ?? []
  const vis = useMemo(() => visibleCodes(questions, answers), [questions, answers])
  const values = useMemo(() => valuesOf(answers), [answers])

  // Điền giá trị mặc định một lần khi tải khảo sát
  useEffect(() => {
    if (!survey) return
    setAnswers((cur) => {
      const next = { ...cur }
      for (const q of survey.survey_questions)
        if (q.default_value !== null && q.default_value !== undefined && !next[q.code]) next[q.code] = { value: q.default_value }
      return next
    })
  }, [survey])

  // Mục neo: mỗi câu có config.nav_label là một mục; nếu không có thì dùng tên phần
  const navItems = useMemo(() => {
    if (!survey) return []
    const out: { id: string; label: string }[] = []
    for (const s of survey.survey_sections) {
      const navQs = questions.filter((q) => q.section_id === s.id && q.config.nav_label)
      if (navQs.length) navQs.forEach((q) => out.push({ id: `q-${q.code}`, label: q.config.nav_label }))
      else out.push({ id: `sec-${s.id}`, label: s.title })
    }
    return out
  }, [survey, questions])

  useEffect(() => {
    if (!navItems.length || done) return
    const els = navItems.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (top) setActive(top.target.id)
    }, { rootMargin: '-80px 0px -60% 0px' })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [navItems, done, survey])

  if (isLoading) return <Shell><p className="text-sm text-muted">Đang tải khảo sát...</p></Shell>
  if (error) return <Shell><p className="text-danger">Không tải được khảo sát. Hãy thử lại sau.</p></Shell>
  if (!survey) return (
    <Shell><h1 className="text-xl font-semibold">Không tìm thấy khảo sát</h1>
      <Link to="/" className="mt-3 inline-block text-brand">Về danh sách khảo sát</Link></Shell>
  )

  const theme = survey.theme ?? {}
  const style = { ['--color-brand' as string]: theme.primary ?? undefined, ['--color-brand-dark' as string]: theme.primary_dark ?? undefined } as CSSProperties
  const open = isOpenNow(survey)

  if (!open) return (
    <Shell title={survey.title} style={style}>
      <h1 className="text-xl font-semibold">{survey.status === 'closed' ? 'Khảo sát đã đóng' : 'Khảo sát hiện không nhận phản hồi'}</h1>
      <p className="mt-2 text-sm text-muted">Khảo sát nằm ngoài thời gian tiếp nhận hoặc chưa được mở.</p>
      <Link to="/" className="mt-3 inline-block text-brand">Xem khảo sát khác</Link>
    </Shell>
  )

  const answerable = questions.filter((q) => q.type !== 'section_title' && vis.has(q.code))
  const doneCount = answerable.filter((q) => hasValue(answers[q.code]?.value)).length
  const pct = answerable.length ? Math.round((doneCount / answerable.length) * 100) : 0
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const labelOf = (q: Question, code: string) => q.question_options.find((o) => o.value === code)?.label ?? code

  async function submit() {
    if (!survey) return
    setFormError(null)
    const errs = validate(questions, answers)
    setErrors(errs)
    const first = Object.keys(errs)[0]
    if (first) { scrollTo(`q-${first}`); setFormError('Vui lòng hoàn thành các mục bắt buộc được đánh dấu lỗi.'); return }

    setBusy(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const payload: Record<string, { value: unknown; comment?: string }> = {}
      for (const q of answerable) {
        const a = answers[q.code]
        if (a && hasValue(a.value)) payload[q.code] = { value: a.value, comment: a.comment }
      }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${sess.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ slug: survey.slug, answers: payload, device_token: getDeviceToken(), response_id: editingId ?? undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (body.fields) { setErrors(body.fields); scrollTo(`q-${Object.keys(body.fields)[0]}`) }
        setFormError(body.error ?? 'Không gửi được phiếu. Hãy thử lại.')
        return
      }
      const labelCode = theme.label_field as string | undefined
      const rec: Submitted = {
        response_id: body.response_id,
        label: (labelCode && String(answers[labelCode]?.value ?? '')) || survey.title,
        at: new Date().toISOString(), answers,
      }
      try { localStorage.setItem(storeKey(survey.slug), JSON.stringify(rec)) } catch { /* bỏ qua */ }
      setDone(rec); setEditingId(null); window.scrollTo({ top: 0 })
    } catch {
      setFormError('Mất kết nối. Hãy kiểm tra mạng và gửi lại.')
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <Shell title={survey.title} style={style}>
        <div className="mx-auto mt-10 max-w-xl rounded-lg border border-line bg-white p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-brand-soft text-brand"><CheckCircle2 size={28} /></div>
          <h1 className="mt-4 text-2xl font-bold">{survey.thank_you.title}</h1>
          <p className="mt-2 text-muted">{survey.thank_you.message}</p>
          <div className="mt-6 rounded-md border border-line p-3 text-left">
            <div className="text-xs font-medium text-muted">Phiếu đã gửi từ thiết bị này</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div><div className="font-medium">{done.label}</div>
                <div className="text-xs text-muted">Gửi lúc {new Date(done.at).toLocaleString('vi-VN')}</div></div>
              {survey.allow_edit && (
                <button className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface"
                  onClick={() => { setAnswers(done.answers); setEditingId(done.response_id); setDone(null); setErrors({}) }}>Sửa</button>
              )}
            </div>
          </div>
          <button onClick={() => { setAnswers({}); setEditingId(null); setDone(null); try { localStorage.removeItem(storeKey(survey.slug)) } catch { /* bỏ qua */ } }}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
            <RefreshCw size={15} /> Làm khảo sát mới
          </button>
        </div>
      </Shell>
    )
  }

  let counter = 0
  const reviewQs = answerable.filter((q) => Array.isArray(answers[q.code]?.value) || q.type === 'single_choice' || q.type === 'dropdown')

  return (
    <div style={style} className="min-h-full bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <span className="max-w-48 shrink-0 truncate text-sm font-semibold">{survey.title}</span>
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Các phần của khảo sát">
            {navItems.map((n) => (
              <button key={n.id} onClick={() => scrollTo(n.id)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${active === n.id ? 'bg-surface font-semibold text-ink' : 'text-muted hover:text-ink'}`}>{n.label}</button>
            ))}
          </nav>
        </div>
        <div className="h-1 bg-brand-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {theme.cover_url && <img src={theme.cover_url} alt="" className="mb-6 h-40 w-full rounded-lg object-cover" />}
        <div className="mb-8">
          {theme.logo_url && <img src={theme.logo_url} alt="" className="mb-3 h-10" />}
          <h1 className="text-2xl font-bold">{survey.title}</h1>
          {survey.description && <p className="mt-2 text-muted">{survey.description}</p>}
          {editingId && <p className="mt-3 rounded bg-brand-soft px-3 py-2 text-sm text-brand">Bạn đang sửa phiếu đã gửi.</p>}
        </div>

        {survey.survey_sections.map((sec, si) => (
          <section key={sec.id} id={`sec-${sec.id}`} className="mb-10 scroll-mt-24">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-3 text-lg font-bold">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm text-white">{si + 1}</span>{sec.title}
              </h2>
              {si === survey.survey_sections.length - 1 && (
                <span className="text-sm text-muted">Đã hoàn thành {doneCount}/{answerable.length} mục</span>
              )}
            </div>
            <div className="flex flex-col gap-7">
              {questions.filter((q) => q.section_id === sec.id && vis.has(q.code)).map((q) => {
                const idx = q.type === 'section_title' ? undefined : q.config.numbered === false ? undefined : ++counter
                return (
                  <QuestionField key={q.id} q={q} index={idx} answer={answers[q.code] ?? {}} error={errors[q.code]}
                    answerValues={values} onReview={() => scrollTo('review')}
                    onChange={(a) => { setAnswers((cur) => ({ ...cur, [q.code]: a })); if (errors[q.code]) setErrors(({ [q.code]: _x, ...r }) => r) }} />
                )
              })}
            </div>
          </section>
        ))}

        <div id="review" ref={reviewRef} className="scroll-mt-24 rounded-lg border border-line bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold"><ListChecks size={17} className="text-brand" /> Kiểm tra lại nội dung trước khi gửi</h2>
          <p className="mt-1 text-sm text-muted">Bạn có thể kiểm tra và chỉnh sửa các lựa chọn trước khi gửi.</p>
          <div className="mt-4 flex flex-col gap-4">
            {reviewQs.length === 0 && <p className="text-sm text-muted">Chưa có lựa chọn nào.</p>}
            {reviewQs.map((q) => {
              const raw = answers[q.code]?.value
              const list = (Array.isArray(raw) ? raw : [raw]).map(String)
              return (
                <div key={q.code}>
                  <div className="flex items-center justify-between text-sm">
                    <span><b>{q.config.review_label ?? q.label}</b> <span className="text-xs text-muted">{list.length} lựa chọn</span></span>
                    <button className="font-medium text-brand" onClick={() => scrollTo(`q-${q.code}`)}>Chỉnh sửa</button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {list.map((c) => <span key={c} className="rounded-md bg-surface px-2.5 py-1 text-sm">{q.type === 'catalog_select' ? c : labelOf(q, c)}</span>)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {formError && <p role="alert" className="mt-5 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{formError}</p>}
        <div className="mt-6 flex justify-end">
          <button onClick={submit} disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            <Send size={15} /> {busy ? 'Đang gửi...' : editingId ? 'Lưu thay đổi' : 'Gửi khảo sát'}
          </button>
        </div>
      </main>
    </div>
  )
}

function Shell({ children, title, style }: { children: ReactNode; title?: string; style?: CSSProperties }) {
  return (
    <div style={style} className="min-h-full bg-surface">
      <header className="border-b border-line bg-white"><div className="mx-auto flex h-14 max-w-5xl items-center px-4 text-sm font-semibold">{title ?? 'Khảo sát'}</div></header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  )
}
