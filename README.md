# Hệ thống khảo sát

Nền tảng tạo và quản lý nhiều khảo sát: React + TypeScript, Tailwind v4, Supabase (Postgres, Auth, Storage, Edge Functions).

## Cài đặt
1. Tạo project Supabase, chạy `supabase/migrations/0001_init_survey_platform.sql` trong SQL Editor.
2. Tạo user trong Authentication, rồi cấp quyền admin bằng câu lệnh ở cuối file SQL.
3. `cp .env.example .env` và điền `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. `npm install && npm run dev`
5. Triển khai hàm: `supabase functions deploy submit-response`

## Đã có
- Trang công khai: danh sách khảo sát (tìm kiếm, lọc trạng thái), trang làm khảo sát, kiểm tra lại, gửi, sửa phiếu.
- Edge Function `submit-response` kiểm tra mọi điều kiện ở máy chủ.
- Khung admin: đăng nhập, phân quyền, sidebar.

## Chưa có (bước tiếp theo)
Form Builder, quản lý khảo sát, dashboard, quản lý phản hồi, xuất CSV/XLSX, dữ liệu mẫu khảo sát STEM.

## Cấu hình câu hỏi (cột `config` / `validation`)
- `config.nav_label`: tên mục trên thanh neo. `config.numbered=false`: không đánh số.
- `catalog_select`: `config.filters=[{key,label,defaultFrom}]`, `page_size`, `noun`.
- `tag_input`: `config.suggest_filter_key`, `config.suggest_filter_from`.
- `validation`: `max_length`, `pattern`, `message`, `min`, `max`, `min_items`, `max_items`.
- `surveys.theme`: `primary`, `logo_url`, `cover_url`, `label_field` (mã câu hỏi làm tên phiếu đã gửi).
