/**
 * Dynamic personalization fields for course content.
 * Course creators can insert tokens like {mentee_first_name} into lesson content,
 * which get replaced with real data when the mentee views the course.
 */

export interface DynamicField {
  token: string       // e.g. '{mentee_first_name}'
  label: string       // e.g. 'Mentee First Name'
  group: 'mentee' | 'mentor'
}

export const DYNAMIC_FIELDS: DynamicField[] = [
  { token: '{mentee_first_name}', label: 'First Name', group: 'mentee' },
  { token: '{mentee_last_name}', label: 'Last Name', group: 'mentee' },
  { token: '{mentee_email}', label: 'Email', group: 'mentee' },
  { token: '{mentee_phone}', label: 'Phone', group: 'mentee' },
  { token: '{mentor_first_name}', label: 'First Name', group: 'mentor' },
  { token: '{mentor_last_name}', label: 'Last Name', group: 'mentor' },
  { token: '{mentor_email}', label: 'Email', group: 'mentor' },
  { token: '{mentor_phone}', label: 'Phone', group: 'mentor' },
]

export interface DynamicFieldContext {
  mentee_first_name?: string
  mentee_last_name?: string
  mentee_email?: string
  mentee_phone?: string
  mentor_first_name?: string
  mentor_last_name?: string
  mentor_email?: string
  mentor_phone?: string
}

/**
 * Replace all dynamic field tokens in an HTML content string.
 * Unknown or empty fields are replaced with an empty string.
 */
export function replaceDynamicFields(html: string | null, ctx: DynamicFieldContext): string {
  if (!html) return ''
  return html.replace(/\{(mentee_first_name|mentee_last_name|mentee_email|mentee_phone|mentor_first_name|mentor_last_name|mentor_email|mentor_phone)\}/g,
    (_match, key: string) => ctx[key as keyof DynamicFieldContext] ?? ''
  )
}
