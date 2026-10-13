// Edge Function: submit-response
// Gửi mới hoặc sửa phiếu. Mọi kiểm tra đều chạy ở máy chủ.
// Body: { slug, answers: { [questionCode]: { value, comment? } }, device_token, response_id? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { computeVisible } from '../_shared/conditions.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, '0')).join('')

const empty = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Phương thức không được hỗ trợ.' }, 405)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, 400) }
  const { slug, device_token, response_id } = body
  const raw: Record<string, { value: unknown; comment?: string }> = body.answers ?? {}
  if (!slug || !device_token) return json({ error: 'Thiếu thông tin khảo sát hoặc thiết bị.' }, 400)

  // 1. Khảo sát và điều kiện tham gia
  const { data: survey } = await db.from('surveys').select('*').eq('slug', slug).maybeSingle()
  if (!survey || survey.status === 'draft' || survey.status === 'archived')
    return json({ error: 'Không tìm thấy khảo sát.' }, 404)
  const now = new Date()
  if (survey.status !== 'published') return json({ error: 'Khảo sát đã đóng.' }, 403)
  if (survey.starts_at && new Date(survey.starts_at) > now) return json({ error: 'Khảo sát chưa bắt đầu.' }, 403)
  if (survey.ends_at && new Date(survey.ends_at) <= now) return json({ error: 'Khảo sát đã hết hạn.' }, 403)

  let userId: string | null = null
  if (survey.require_login) {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { data } = token ? await db.auth.getUser(token) : { data: { user: null } }
    if (!data.user) return json({ error: 'Khảo sát này yêu cầu đăng nhập.' }, 401)
    userId = data.user.id
  }

  // 2. Tìm phiếu cũ nếu là sửa
  let existing: { id: string } | null = null
  if (response_id) {
    const { data } = await db.from('responses').select('id, device_token')
      .eq('id', response_id).eq('survey_id', survey.id).maybeSingle()
    if (!data || data.device_token !== device_token || !survey.allow_edit)
      return json({ error: 'Bạn không có quyền sửa phiếu này.' }, 403)
    existing = data
  } else if (survey.max_responses) {
    const { count } = await db.from('responses').select('id', { count: 'exact', head: true }).eq('survey_id', survey.id)
    if ((count ?? 0) >= survey.max_responses) return json({ error: 'Khảo sát đã đủ số phản hồi tối đa.' }, 403)
  }

  // 3. Câu hỏi, phương án, danh mục
  const { data: questions } = await db.from('survey_questions').select('*').eq('survey_id', survey.id).order('position')
  const qs = questions ?? []
  const qIds = qs.map((q) => q.id)
  const { data: opts } = await db.from('question_options').select('question_id, value').in('question_id', qIds)
  const optionSet = new Map<string, Set<string>>()
  for (const o of opts ?? []) {
    if (!optionSet.has(o.question_id)) optionSet.set(o.question_id, new Set())
    optionSet.get(o.question_id)!.add(o.value)
  }
  const catalogIds = [...new Set(qs.filter((q) => q.catalog_id).map((q) => q.catalog_id))]
  const catalogCodes = new Map<string, Set<string>>()
  if (catalogIds.length) {
    const { data: items } = await db.from('catalog_items').select('catalog_id, code').in('catalog_id', catalogIds).eq('is_active', true)
    for (const it of items ?? []) {
      if (!catalogCodes.has(it.catalog_id)) catalogCodes.set(it.catalog_id, new Set())
      catalogCodes.get(it.catalog_id)!.add(it.code)
    }
  }

  // 4. Chỉ giữ câu trả lời của câu hỏi đang hiển thị
  const values: Record<string, unknown> = {}
  for (const [code, a] of Object.entries(raw)) values[code] = a?.value
  const visible = computeVisible(qs, values)

  // 5. Kiểm tra dữ liệu
  const errors: Record<string, string> = {}
  const rows: { question_id: string; value: unknown; comment: string | null }[] = []

  for (const q of qs) {
    if (q.type === 'section_title' || !visible.has(q.code)) continue
    const a = raw[q.code]
    const v = a?.value
    const v_ = q.validation ?? {}
    const msg = (d: string) => v_.message || d

    if (empty(v)) {
      if (q.required) errors[q.code] = `Vui lòng trả lời: ${q.label}`
      continue
    }

    switch (q.type) {
      case 'short_text':
      case 'long_text': {
        const max = v_.max_length ?? (q.type === 'short_text' ? 255 : 5000)
        if (typeof v !== 'string') errors[q.code] = msg('Giá trị phải là văn bản.')
        else if (v.length > max) errors[q.code] = msg(`Tối đa ${max} ký tự.`)
        else if (v_.pattern && !new RegExp(v_.pattern).test(v)) errors[q.code] = msg('Định dạng chưa đúng.')
        break
      }
      case 'number': {
        const n = Number(v)
        if (!Number.isFinite(n)) errors[q.code] = msg('Vui lòng nhập một số.')
        else if (v_.min !== undefined && n < v_.min) errors[q.code] = msg(`Giá trị tối thiểu là ${v_.min}.`)
        else if (v_.max !== undefined && n > v_.max) errors[q.code] = msg(`Giá trị tối đa là ${v_.max}.`)
        break
      }
      case 'date':
        if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) errors[q.code] = msg('Ngày không hợp lệ.')
        break
      case 'rating': {
        const n = Number(v), max = q.config?.max ?? 5
        if (!Number.isInteger(n) || n < 1 || n > max) errors[q.code] = msg(`Chọn điểm từ 1 đến ${max}.`)
        break
      }
      case 'single_choice':
      case 'dropdown':
        if (typeof v !== 'string' || !optionSet.get(q.id)?.has(v)) errors[q.code] = msg('Lựa chọn không hợp lệ.')
        break
      case 'multi_choice':
      case 'catalog_select': {
        const allowed = q.type === 'catalog_select' ? catalogCodes.get(q.catalog_id) : optionSet.get(q.id)
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !allowed?.has(x)))
          errors[q.code] = msg('Có lựa chọn không hợp lệ.')
        else if (v_.min_items && v.length < v_.min_items) errors[q.code] = msg(`Chọn ít nhất ${v_.min_items} mục.`)
        else if (v_.max_items && v.length > v_.max_items) errors[q.code] = msg(`Chọn tối đa ${v_.max_items} mục.`)
        break
      }
      case 'tag_input':
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim() || x.length > 255))
          errors[q.code] = msg('Giá trị nhập không hợp lệ.')
        break
    }

    const comment = a?.comment?.toString().trim() || null
    if (comment && comment.length > (q.comment_max_length ?? 500))
      errors[q.code] = `Ý kiến thêm tối đa ${q.comment_max_length ?? 500} ký tự.`
    if (!errors[q.code]) rows.push({ question_id: q.id, value: v, comment: q.allow_comment ? comment : null })
  }
  if (Object.keys(errors).length) return json({ error: 'Phiếu chưa hợp lệ.', fields: errors }, 422)

  // 6. Khóa chống trùng
  let respondentKey: string | null = null
  if (survey.dedupe_fields?.length) {
    const parts = survey.dedupe_fields.map((c: string) => String(values[c] ?? '').trim().toLowerCase())
    if (parts.every(Boolean)) respondentKey = await sha256(`${survey.id}|${parts.join('|')}`)
  }

  // 7. Ghi dữ liệu
  const meta = { user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null }
  let rid: string
  if (existing) {
    rid = existing.id
    const { error } = await db.from('responses')
      .update({ respondent_key: respondentKey, updated_at: now.toISOString(), meta }).eq('id', rid)
    if (error?.code === '23505') return json({ error: 'Đơn vị này đã gửi phiếu.' }, 409)
    if (error) return json({ error: 'Không lưu được phiếu.' }, 500)
    await db.from('response_answers').delete().eq('response_id', rid)
  } else {
    const { data, error } = await db.from('responses')
      .insert({ survey_id: survey.id, respondent_key: respondentKey, device_token, user_id: userId, meta })
      .select('id').single()
    if (error?.code === '23505')
      return json({ error: 'Đơn vị này đã gửi phiếu. Hãy mở lại phiếu đã gửi trên thiết bị cũ để sửa.' }, 409)
    if (error || !data) return json({ error: 'Không lưu được phiếu.' }, 500)
    rid = data.id
  }
  const { error: aErr } = await db.from('response_answers').insert(rows.map((r) => ({ ...r, response_id: rid })))
  if (aErr) {
    if (!existing) await db.from('responses').delete().eq('id', rid)
    return json({ error: 'Không lưu được câu trả lời.' }, 500)
  }
  return json({ ok: true, response_id: rid, edited: !!existing })
})
