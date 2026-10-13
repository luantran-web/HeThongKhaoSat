-- =====================================================================
-- HỆ THỐNG KHẢO SÁT - Migration 0001: lược đồ nền tảng
-- Chạy trong Supabase SQL Editor (hoặc `supabase db push`).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Kiểu dữ liệu ----------
do $$ begin
  create type survey_status as enum ('draft', 'published', 'closed', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type question_type as enum (
    'short_text', 'long_text', 'single_choice', 'multi_choice', 'dropdown',
    'number', 'date', 'rating', 'section_title',
    'catalog_select',   -- chọn từ danh mục lớn có lọc (chủ đề, thiết bị...)
    'tag_input'         -- tìm hoặc thêm mới (môn học...)
  );
exception when duplicate_object then null; end $$;

-- ---------- Quản trị viên ----------
create table if not exists admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

-- ---------- Khảo sát ----------
create table if not exists surveys (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title         text not null,
  description   text,
  intro_html    text,
  status        survey_status not null default 'draft',
  starts_at     timestamptz,
  ends_at       timestamptz,
  max_responses integer check (max_responses is null or max_responses > 0),
  require_login boolean not null default false,
  allow_edit    boolean not null default true,        -- cho sửa phiếu đã gửi từ cùng thiết bị
  dedupe_fields text[] not null default '{}',         -- mã câu hỏi tạo khóa chống trùng, vd {email,school_name}
  theme         jsonb not null default '{}'::jsonb,   -- logo_url, cover_url, primary, secondary, layout
  thank_you     jsonb not null default '{"title":"Gửi phản hồi thành công!","message":"Cảm ơn bạn đã tham gia khảo sát."}'::jsonb,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists surveys_status_idx on surveys(status);

create table if not exists survey_sections (
  id        uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  title     text not null,
  position  integer not null default 0
);
create index if not exists survey_sections_survey_idx on survey_sections(survey_id, position);

create table if not exists catalogs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text
);

create table if not exists catalog_items (
  id         uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references catalogs(id) on delete cascade,
  code       text not null,
  label      text not null,
  attrs      jsonb not null default '{}'::jsonb,  -- cấp học, khối, môn, nhóm, hãng, ảnh...
  position   integer not null default 0,
  is_active  boolean not null default true,
  unique (catalog_id, code)
);
create index if not exists catalog_items_attrs_idx on catalog_items using gin (attrs);

create table if not exists survey_questions (
  id          uuid primary key default gen_random_uuid(),
  survey_id   uuid not null references surveys(id) on delete cascade,
  section_id  uuid references survey_sections(id) on delete set null,
  code        text not null,                       -- mã ổn định dùng trong logic và xuất báo cáo
  type        question_type not null,
  label       text not null,
  help_text   text,
  required    boolean not null default false,
  position    integer not null default 0,
  default_value jsonb,
  validation  jsonb not null default '{}'::jsonb,  -- min, max, max_length, pattern, message
  show_if     jsonb,                               -- {"all":[{"q":"code","op":"eq","value":"Có"}]}
  catalog_id  uuid references catalogs(id),        -- cho catalog_select
  allow_comment boolean not null default false,    -- ô "Ý kiến thêm"
  comment_max_length integer default 500,
  config      jsonb not null default '{}'::jsonb,  -- thang điểm, placeholder, filter_by...
  unique (survey_id, code)
);
create index if not exists survey_questions_idx on survey_questions(survey_id, position);

create table if not exists question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references survey_questions(id) on delete cascade,
  value       text not null,
  label       text not null,
  description text,
  position    integer not null default 0,
  unique (question_id, value)
);

-- ---------- Phản hồi ----------
create table if not exists responses (
  id            uuid primary key default gen_random_uuid(),
  survey_id     uuid not null references surveys(id) on delete cascade,
  respondent_key text,                              -- khóa chống trùng (hash)
  device_token  text,                               -- định danh thiết bị để cho sửa phiếu
  user_id       uuid references auth.users(id),
  submitted_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  meta          jsonb not null default '{}'::jsonb
);
create unique index if not exists responses_dedupe_uidx
  on responses(survey_id, respondent_key) where respondent_key is not null;
create index if not exists responses_survey_time_idx on responses(survey_id, submitted_at);

create table if not exists response_answers (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade,
  question_id uuid not null references survey_questions(id) on delete cascade,
  value       jsonb,          -- chuỗi, số, mảng mã lựa chọn...
  comment     text,
  unique (response_id, question_id)
);
create index if not exists response_answers_q_idx on response_answers(question_id);

-- ---------- Nhật ký hoạt động quản trị ----------
create table if not exists admin_activity (
  id         bigserial primary key,
  admin_id   uuid references auth.users(id),
  action     text not null,
  survey_id  uuid references surveys(id) on delete set null,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- ---------- updated_at tự động ----------
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists surveys_touch on surveys;
create trigger surveys_touch before update on surveys
  for each row execute function touch_updated_at();

-- ---------- Quy tắc chuyển trạng thái ----------
create or replace function enforce_status_transition() returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'draft'     and new.status in ('published','archived')) or
    (old.status = 'published' and new.status in ('closed','archived')) or
    (old.status = 'closed'    and new.status in ('published','archived')) or
    (old.status = 'archived'  and new.status = 'draft')
  ) then
    raise exception 'Không thể chuyển trạng thái từ % sang %', old.status, new.status;
  end if;
  if new.status = 'published' and old.status = 'draft' then new.published_at = now(); end if;
  return new;
end $$;

drop trigger if exists surveys_status_guard on surveys;
create trigger surveys_status_guard before update of status on surveys
  for each row execute function enforce_status_transition();

-- ---------- Hàm: khảo sát có đang nhận phản hồi không ----------
create or replace function survey_is_open(s surveys) returns boolean
language sql stable as $$
  select s.status = 'published'
     and (s.starts_at is null or s.starts_at <= now())
     and (s.ends_at   is null or s.ends_at   >  now())
     and (s.max_responses is null
          or (select count(*) from responses r where r.survey_id = s.id) < s.max_responses);
$$;

-- =====================================================================
-- RLS
-- =====================================================================
alter table admin_users       enable row level security;
alter table surveys           enable row level security;
alter table survey_sections   enable row level security;
alter table survey_questions  enable row level security;
alter table question_options  enable row level security;
alter table catalogs          enable row level security;
alter table catalog_items     enable row level security;
alter table responses         enable row level security;
alter table response_answers  enable row level security;
alter table admin_activity    enable row level security;

-- Admin: toàn quyền
do $$
declare t text;
begin
  foreach t in array array['surveys','survey_sections','survey_questions','question_options',
                           'catalogs','catalog_items','responses','response_answers','admin_activity']
  loop
    execute format('drop policy if exists admin_all on %I', t);
    execute format('create policy admin_all on %I for all using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

drop policy if exists admin_self_read on admin_users;
create policy admin_self_read on admin_users for select using (user_id = auth.uid() or is_admin());
-- Không có policy insert/update cho admin_users: chỉ cấp quyền qua SQL/service role,
-- nên không ai tự đăng ký thành quản trị viên được.

-- Công khai: chỉ đọc khảo sát đã xuất bản hoặc đã đóng (không đọc nháp/lưu trữ)
drop policy if exists public_read_surveys on surveys;
create policy public_read_surveys on surveys for select
  using (status in ('published','closed'));

drop policy if exists public_read_sections on survey_sections;
create policy public_read_sections on survey_sections for select
  using (exists (select 1 from surveys s where s.id = survey_id and s.status in ('published','closed')));

drop policy if exists public_read_questions on survey_questions;
create policy public_read_questions on survey_questions for select
  using (exists (select 1 from surveys s where s.id = survey_id and s.status in ('published','closed')));

drop policy if exists public_read_options on question_options;
create policy public_read_options on question_options for select
  using (exists (select 1 from survey_questions q join surveys s on s.id = q.survey_id
                 where q.id = question_id and s.status in ('published','closed')));

drop policy if exists public_read_catalogs on catalogs;
create policy public_read_catalogs on catalogs for select using (true);
drop policy if exists public_read_catalog_items on catalog_items;
create policy public_read_catalog_items on catalog_items for select using (is_active);

-- responses / response_answers: KHÔNG có policy cho anon.
-- Việc gửi, sửa phiếu đi qua Edge Function `submit-response` (service role).

-- =====================================================================
-- View thống kê cho dashboard (chạy với quyền của người gọi => RLS áp dụng)
-- =====================================================================
create or replace view survey_stats with (security_invoker = true) as
select s.id as survey_id, s.slug, s.title, s.status, s.updated_at,
       count(r.id)                                  as total_responses,
       count(r.id) filter (where r.submitted_at >= now() - interval '7 days') as responses_7d,
       max(r.submitted_at)                          as last_response_at
from surveys s left join responses r on r.survey_id = s.id
group by s.id;

create or replace view responses_daily with (security_invoker = true) as
select survey_id, date_trunc('day', submitted_at)::date as day, count(*) as total
from responses group by 1, 2;

-- Đếm lựa chọn theo câu hỏi (cho single/multi/dropdown/catalog/tag)
create or replace view answer_counts with (security_invoker = true) as
select a.question_id, q.survey_id, v.value as choice, count(*) as total
from response_answers a
join survey_questions q on q.id = a.question_id
cross join lateral (
  select jsonb_array_elements_text(
    case jsonb_typeof(a.value) when 'array' then a.value else jsonb_build_array(a.value) end
  ) as value
) v
where a.value is not null
group by a.question_id, q.survey_id, v.value;

-- =====================================================================
-- Storage: logo, ảnh bìa
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('survey-assets', 'survey-assets', true)
on conflict (id) do nothing;

drop policy if exists "assets public read" on storage.objects;
create policy "assets public read" on storage.objects for select
  using (bucket_id = 'survey-assets');

drop policy if exists "assets admin write" on storage.objects;
create policy "assets admin write" on storage.objects for all
  using (bucket_id = 'survey-assets' and is_admin())
  with check (bucket_id = 'survey-assets' and is_admin());

-- =====================================================================
-- Cấp quyền quản trị viên đầu tiên (chạy SAU KHI tạo user trong Supabase Auth):
--   insert into admin_users (user_id, email, full_name)
--   select id, email, 'Quản trị viên' from auth.users where email = 'EMAIL_CUA_BAN';
-- =====================================================================
