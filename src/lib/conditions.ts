// Logic hiển thị có điều kiện. File này dùng chung cho Edge Function và frontend
// (bản sao ở src/lib/conditions.ts) để hai phía luôn cho cùng kết quả.
export type Op = 'eq' | 'neq' | 'in' | 'contains' | 'gt' | 'lt' | 'answered' | 'empty'
export interface Rule { q: string; op: Op; value?: unknown }
export interface ShowIf { all?: Rule[]; any?: Rule[] }
export type Answers = Record<string, unknown>

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

function check(rule: Rule, answers: Answers): boolean {
  const v = answers[rule.q]
  const arr = Array.isArray(v) ? v : [v]
  switch (rule.op) {
    case 'eq': return arr.some((x) => x === rule.value)
    case 'neq': return !arr.some((x) => x === rule.value)
    case 'in': return Array.isArray(rule.value) && arr.some((x) => (rule.value as unknown[]).includes(x))
    case 'contains': return Array.isArray(v) && v.includes(rule.value)
    case 'gt': return Number(v) > Number(rule.value)
    case 'lt': return Number(v) < Number(rule.value)
    case 'answered': return !isEmpty(v)
    case 'empty': return isEmpty(v)
    default: return false
  }
}

export function isVisible(
  q: { code: string; show_if: ShowIf | null },
  answers: Answers,
  visibleCodes: Set<string>,
): boolean {
  const s = q.show_if
  if (!s || (!s.all?.length && !s.any?.length)) return true
  // Câu nguồn đang bị ẩn thì coi như chưa trả lời
  const effective: Answers = {}
  for (const [k, val] of Object.entries(answers)) if (visibleCodes.has(k)) effective[k] = val
  const okAll = !s.all?.length || s.all.every((r) => check(r, effective))
  const okAny = !s.any?.length || s.any.some((r) => check(r, effective))
  return okAll && okAny
}

/** Trả về tập mã câu hỏi đang hiển thị, duyệt theo thứ tự để điều kiện bắc cầu đúng. */
export function computeVisible(
  questions: { code: string; show_if: ShowIf | null }[],
  answers: Answers,
): Set<string> {
  const visible = new Set<string>()
  for (const q of questions) if (isVisible(q, answers, visible)) visible.add(q.code)
  return visible
}
