import type { ShowIf } from './conditions'

export type QuestionType =
  | 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'dropdown'
  | 'number' | 'date' | 'rating' | 'section_title' | 'catalog_select' | 'tag_input'

export interface Option { id: string; value: string; label: string; description: string | null; position: number }

export interface Question {
  id: string; survey_id: string; section_id: string | null; code: string; type: QuestionType
  label: string; help_text: string | null; required: boolean; position: number
  default_value: unknown; validation: Record<string, any>; show_if: ShowIf | null
  catalog_id: string | null; allow_comment: boolean; comment_max_length: number | null
  config: Record<string, any>; question_options: Option[]
}

export interface Section { id: string; survey_id: string; title: string; position: number }

export interface Survey {
  id: string; slug: string; title: string; description: string | null; intro_html: string | null
  status: 'draft' | 'published' | 'closed' | 'archived'
  starts_at: string | null; ends_at: string | null; max_responses: number | null
  require_login: boolean; allow_edit: boolean; dedupe_fields: string[]
  theme: Record<string, any>; thank_you: { title: string; message: string }
  survey_sections: Section[]; survey_questions: Question[]
}

export interface CatalogItem { id: string; code: string; label: string; attrs: Record<string, any>; position: number }

export interface AnswerState { value?: unknown; comment?: string }
export type AnswerMap = Record<string, AnswerState>

export function isOpenNow(s: Pick<Survey, 'status' | 'starts_at' | 'ends_at'>): boolean {
  const now = Date.now()
  return s.status === 'published'
    && (!s.starts_at || new Date(s.starts_at).getTime() <= now)
    && (!s.ends_at || new Date(s.ends_at).getTime() > now)
}
