// The languages the scene is translated into (src/i18n), by id. Shared so the server can tell a
// saved preference from junk: it stores only one of these.

export const LANGUAGE_IDS = ['en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'ru', 'zh', 'ja'] as const

export type Language = (typeof LANGUAGE_IDS)[number]

export function isLanguage(value: string): value is Language {
  return (LANGUAGE_IDS as readonly string[]).includes(value)
}
