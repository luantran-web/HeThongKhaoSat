import { computeVisible } from './conditions'
import type { AnswerMap, Question } from './types'

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)

export function valuesOf(answers: AnswerMap): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  for (const [k, a] of Object.entries(answers)) o[k] = a.value
  return o
}

export function visibleCodes(questions: Question[], answers: AnswerMap) {
  return computeVisible(questions, valuesOf(answers))
}

/** Kiểm tra phía trình duyệt để báo lỗi sớm. Máy chủ vẫn kiểm tra lại toàn bộ. */
export function validate(questions: Question[], answers: AnswerMap): Record<string, string> {
  const vis = visibleCodes(questions, answers)
  const errors: Record<string, string> = {}
  for (const q of questions) {
    if (q.type === 'section_title' || !vis.has(q.code)) continue
    const v = answers[q.code]?.value
    const rule = q.validation ?? {}
    if (isEmpty(v)) { if (q.required) errors[q.code] = `Vui lòng trả lời: ${q.label}`; continue }
    if (typeof v === 'string' && rule.max_length && v.length > rule.max_length) errors[q.code] = `Tối đa ${rule.max_length} ký tự.`
    else if (typeof v === 'string' && rule.pattern && !new RegExp(rule.pattern).test(v)) errors[q.code] = rule.message ?? 'Định dạng chưa đúng.'
    else if (q.type === 'number') {
      const n = Number(v)
      if (rule.min !== undefined && n < rule.min) errors[q.code] = `Giá trị tối thiểu là ${rule.min}.`
      if (rule.max !== undefined && n > rule.max) errors[q.code] = `Giá trị tối đa là ${rule.max}.`
    } else if (Array.isArray(v)) {
      if (rule.min_items && v.length < rule.min_items) errors[q.code] = `Chọn ít nhất ${rule.min_items} mục.`
      if (rule.max_items && v.length > rule.max_items) errors[q.code] = `Chọn tối đa ${rule.max_items} mục.`
    }
  }
  return errors
}
