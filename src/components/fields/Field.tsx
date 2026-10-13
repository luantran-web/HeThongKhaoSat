import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import type { Question } from '@/lib/types'

export const inputCls =
  'w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand'

export function Counter({ n, max }: { n: number; max: number }) {
  return <div className="mt-1 text-right text-xs text-muted">{n}/{max}</div>
}

export function FieldShell(props: {
  q: Question; index?: number; error?: string; comment?: string
  onComment?: (v: string) => void; children: ReactNode
}) {
  const { q, index, error, comment, onComment, children } = props
  const maxC = q.comment_max_length ?? 500
  return (
    <div id={`q-${q.code}`} className="scroll-mt-24">
      <div className="text-sm font-semibold">
        {index !== undefined ? `${index}. ` : ''}{q.label}
        {q.required ? <span className="text-brand"> *</span> : <span className="font-normal text-muted"> (không bắt buộc)</span>}
      </div>
      {q.help_text && <p className="mt-0.5 text-xs text-muted">{q.help_text}</p>}
      {error && (
        <div role="alert" className="mt-2 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
          <AlertCircle size={15} /> {error}
        </div>
      )}
      <div className="mt-2">{children}</div>
      {q.allow_comment && onComment && (
        <div className="mt-3">
          <label className="text-xs font-medium text-ink/80">Ý kiến thêm <span className="font-normal text-muted">(không bắt buộc)</span>
            <textarea rows={3} maxLength={maxC} value={comment ?? ''} onChange={(e) => onComment(e.target.value)}
              placeholder={q.config.comment_placeholder ?? 'Góp ý thêm nếu có...'} className={`${inputCls} mt-1 resize-y`} />
          </label>
          <Counter n={(comment ?? '').length} max={maxC} />
        </div>
      )}
    </div>
  )
}
