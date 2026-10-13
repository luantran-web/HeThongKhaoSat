import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !key) {
  throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY. Sao chép .env.example thành .env và điền giá trị.')
}

export const supabase = createClient(url, key)

/** Mã định danh thiết bị, dùng để cho phép sửa lại phiếu đã gửi. */
export function getDeviceToken(): string {
  const k = 'khaosat_device_token'
  try {
    let t = localStorage.getItem(k)
    if (!t) { t = crypto.randomUUID(); localStorage.setItem(k, t) }
    return t
  } catch {
    return crypto.randomUUID()
  }
}
