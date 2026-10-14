import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById('root')!)
const missing = [
  !import.meta.env.VITE_SUPABASE_URL && 'VITE_SUPABASE_URL',
  !import.meta.env.VITE_SUPABASE_ANON_KEY && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean) as string[]

if (missing.length) {
  // Báo rõ thay vì để trang trắng khi build thiếu biến môi trường
  root.render(
    <div style={{ maxWidth: 560, margin: '64px auto', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Thiếu cấu hình kết nối Supabase</h1>
      <p style={{ marginTop: 8, color: '#6b7280' }}>
        Bản build này chưa có biến: <b>{missing.join(', ')}</b>. Hãy thêm vào Build variables
        (Cloudflare: Settings &gt; Builds) rồi build lại.
      </p>
    </div>,
  )
} else {
  import('./App').then(({ default: App }) =>
    root.render(<StrictMode><App /></StrictMode>),
  )
}
