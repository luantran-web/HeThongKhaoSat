import type { ReactNode } from 'react'
import type { AnswerState, Question } from '@/lib/types'
import { Counter, FieldShell, inputCls } from './Field'
import CatalogSelect from './CatalogSelect'
import TagInput from './TagInput'

interface Props {
  q: Question; index?: number; answer: AnswerState; error?: string
  answerValues: Record<string, unknown>
  onChange: (a: AnswerState) => void
  onReview: () => void
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [])
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')

export default function QuestionField({ q, index, answer, error, answerValues, onChange, onReview }: Props) {
  const set = (value: unknown) => onChange({ ...answer, value })
  const v = answer.value

  if (q.type === 'section_title')
    return (
      <div id={`q-${q.code}`} className="scroll-mt-24 pt-2">
        <h3 className="text-base font-semibold">{q.label}</h3>
        {q.help_text && <p className="mt-0.5 text-sm text-muted">{q.help_text}</p>}
      </div>
    )

  let body: ReactNode = null
  switch (q.type) {
    case 'short_text': {
      const max = q.validation.max_length ?? 255
      body = (<>
        <input value={str(v)} maxLength={max} onChange={(e) => set(e.target.value)} placeholder={q.config.placeholder}
          type={q.config.input_type ?? 'text'} inputMode={q.config.input_type === 'tel' ? 'tel' : undefined} className={inputCls} />
        <Counter n={str(v).length} max={max} />
      </>)
      break
    }
    case 'long_text': {
      const max = q.validation.max_length ?? 2000
      body = (<>
        <textarea rows={4} value={str(v)} maxLength={max} onChange={(e) => set(e.target.value)} placeholder={q.config.placeholder} className={`${inputCls} resize-y`} />
        <Counter n={str(v).length} max={max} />
      </>)
      break
    }
    case 'number':
      body = <input type="number" value={str(v)} min={q.validation.min} max={q.validation.max}
        onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))} className={inputCls} />
      break
    case 'date':
      body = <input type="date" value={str(v)} onChange={(e) => set(e.target.value || undefined)} className={inputCls} />
      break
    case 'dropdown':
      body = (
        <select value={str(v)} onChange={(e) => set(e.target.value || undefined)} className={inputCls}>
          <option value="">{q.config.placeholder ?? '— Chọn —'}</option>
          {q.question_options.map((o) => <option key={o.id} value={o.value}>{o.label}</option>)}
        </select>
      )
      break
    case 'single_choice':
      body = (
        <div role="radiogroup" className={q.question_options.length <= 3 && !q.question_options.some((o) => o.description)
          ? 'inline-flex rounded-lg bg-surface p-1' : 'flex flex-col gap-2'}>
          {q.question_options.map((o) => {
            const on = v === o.value
            return (
              <button type="button" role="radio" aria-checked={on} key={o.id} onClick={() => set(o.value)}
                className={`rounded-md px-5 py-2 text-left text-sm font-medium ${on ? 'bg-brand text-white' : 'hover:bg-white'}`}>
                {o.label}{o.description && <span className={`block text-xs font-normal ${on ? 'text-white/80' : 'text-muted'}`}>{o.description}</span>}
              </button>
            )
          })}
        </div>
      )
      break
    case 'multi_choice':
      body = (
        <div className="flex flex-col gap-2">
          {q.question_options.map((o) => {
            const cur = arr(v), on = cur.includes(o.value)
            return (
              <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 ${on ? 'border-brand ring-1 ring-brand' : 'border-line'}`}>
                <input type="checkbox" checked={on} className="mt-1"
                  onChange={() => set(on ? cur.filter((x) => x !== o.value) : [...cur, o.value])} />
                <span className="text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    {q.config.show_code && <span className="rounded bg-brand-soft px-1.5 py-0.5 text-xs font-semibold text-brand">{o.value}</span>}
                    {o.label}
                  </span>
                  {o.description && <span className="mt-0.5 block text-xs text-muted">{o.description}</span>}
                </span>
              </label>
            )
          })}
        </div>
      )
      break
    case 'rating': {
      const max = q.config.max ?? 5
      body = (
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button type="button" key={n} role="radio" aria-checked={v === n} onClick={() => set(n)}
              className={`h-10 w-10 rounded-md border text-sm font-semibold ${v === n ? 'border-brand bg-brand text-white' : 'border-line bg-white hover:bg-surface'}`}>{n}</button>
          ))}
        </div>
      )
      break
    }
    case 'catalog_select':
      body = <CatalogSelect q={q} value={arr(v)} onChange={set} answerValues={answerValues} onReview={onReview} />
      break
    case 'tag_input':
      body = <TagInput q={q} value={arr(v)} onChange={set} filterValue={q.config.suggest_filter_from ? answerValues[q.config.suggest_filter_from] : undefined} />
      break
  }

  return (
    <FieldShell q={q} index={index} error={error} comment={answer.comment} onComment={(c) => onChange({ ...answer, comment: c })}>
      {body}
    </FieldShell>
  )
}
