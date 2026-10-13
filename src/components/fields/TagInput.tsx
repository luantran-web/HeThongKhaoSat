import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CatalogItem, Question } from '@/lib/types'
import { inputCls } from './Field'

/** Tìm hoặc thêm mới. Gợi ý lấy từ danh mục, có thể lọc theo câu trả lời trước đó. */
export default function TagInput(props: { q: Question; value: string[]; onChange: (v: string[]) => void; filterValue?: unknown }) {
  const { q, value, onChange, filterValue } = props
  const [text, setText] = useState('')
  const [focus, setFocus] = useState(false)

  const { data: items = [] } = useQuery({
    queryKey: ['catalog', q.catalog_id],
    enabled: !!q.catalog_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_items').select('id, code, label, attrs, position')
        .eq('catalog_id', q.catalog_id!).eq('is_active', true).order('position')
      if (error) throw error
      return data as CatalogItem[]
    },
  })

  const suggestions = useMemo(() => {
    const key = q.config.suggest_filter_key as string | undefined
    const base = key && filterValue ? items.filter((i) => i.attrs[key] === filterValue || (Array.isArray(i.attrs[key]) && i.attrs[key].includes(filterValue))) : items
    const t = text.trim().toLowerCase()
    return base.filter((i) => !value.includes(i.label) && (!t || i.label.toLowerCase().includes(t))).slice(0, 8)
  }, [items, text, value, q.config.suggest_filter_key, filterValue])

  const add = (v: string) => {
    const s = v.trim()
    if (!s || value.some((x) => x.toLowerCase() === s.toLowerCase())) return
    onChange([...value, s]); setText('')
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-sm text-brand">
              {v}
              <button type="button" aria-label={`Bỏ ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}><X size={13} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-3.5 text-muted" />
        <input value={text} maxLength={255} placeholder={q.config.placeholder ?? 'Tìm hoặc nhập rồi nhấn Enter...'}
          onChange={(e) => setText(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text) } }}
          className={`${inputCls} pl-9`} />
        {focus && (suggestions.length > 0 || text.trim()) && (
          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-line bg-white py-1 shadow-lg">
            {suggestions.map((s) => (
              <li key={s.id}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s.label)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-surface">{s.label}</button></li>
            ))}
            {text.trim() && !suggestions.some((s) => s.label.toLowerCase() === text.trim().toLowerCase()) && (
              <li><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(text)}
                className="block w-full px-3 py-2 text-left text-sm text-brand hover:bg-surface">Thêm "{text.trim()}"</button></li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
