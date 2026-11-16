import { engine, Entity, PointerEvents } from '@dcl/sdk/ecs'
import { getPlayerLanguage } from '@dcl/sdk/platform'
import { en, StringKey, Strings } from './en'
import { es } from './es'
import { pt } from './pt'
import { fr } from './fr'
import { ru } from './ru'
import { de } from './de'
import { it } from './it'
import { nl } from './nl'
import { zh } from './zh'
import { ja } from './ja'
import { tr } from './tr'
import { ko } from './ko'
import { id } from './id'
import { vi } from './vi'

export type { StringKey } from './en'

// Translations for the scene's own text. Client only: the server sends data, never wording.
//
// The language is the one the player picked in the title card's selector or, until they pick
// one, the Decentraland client's language. getPlayerLanguage() is read live (it is a cached
// value): it says 'en' until the explorer answers, then switches by itself, and it follows a
// mid-session change of the client language too. The UI is redrawn every frame, so the new
// language shows at once.

export type { Language } from '../shared/languages'
import { Language } from '../shared/languages'

/** The languages in the selector, in order, each named in itself. */
export const LANGUAGES: { id: Language; name: string }[] = [
    { id: 'en', name: 'English' },
    { id: 'es', name: 'Español' },
    { id: 'pt', name: 'Português' },
    { id: 'fr', name: 'Français' },
    { id: 'de', name: 'Deutsch' },
    { id: 'it', name: 'Italiano' },
    { id: 'nl', name: 'Nederlands' },
    { id: 'id', name: 'Indonesia' },
    { id: 'tr', name: 'Türkçe' },
    { id: 'ru', name: 'Русский' },
    { id: 'zh', name: '中文' },
    { id: 'ja', name: '日本語' },
    { id: 'ko', name: '한국어' },
    { id: 'vi', name: 'Tiếng Việt' }
]

/**
 * How the selectors' lists lay the languages out: one array per column, top to bottom. Every
 * language in LANGUAGES appears once.
 */
export const LANGUAGE_COLUMNS: Language[][] = [
    ['en', 'es', 'pt', 'fr', 'it'],
    ['de', 'nl', 'ru', 'tr', 'id'],
    ['zh', 'ja', 'ko', 'vi']
]

/** A language's name in itself, as the selectors show it. */
export function languageName(language: Language): string {
    return LANGUAGES.find((entry) => entry.id === language)?.name ?? language
}

const STRINGS: Record<Language, Strings> = { en, es, pt, fr, de, it, nl, id, tr, vi, ru, zh, ja, ko }

/** What the player picked in the selector, or null to follow the client's language. */
let picked: Language | null = null

/** 'pt-BR' → 'pt', 'es-419' → 'es'; anything not supported → English. */
function supported(tag: string): Language {
    const primary = tag.toLowerCase().split('-')[0]
    return primary in STRINGS ? (primary as Language) : 'en'
}

export function getLanguage(): Language {
    return picked ?? supported(getPlayerLanguage())
}

export function setLanguage(language: Language) {
    picked = language
}

/**
 * The language the player picked on an earlier visit, as the server kept it. It takes the place
 * of the client's language, but not of a pick made this visit before it arrived.
 */
export function restoreLanguage(language: Language) {
    if (picked === null) picked = language
}

/**
 * `text` in capitals, the way the current language writes them. toUpperCase() is the same in
 * every language but Turkish, where i becomes İ (dotted) and ı becomes I: "kazmayı" is
 * "KAZMAYI", and "bilgi" is "BİLGİ", not "BILGI".
 */
export function upper(text: string): string {
    if (getLanguage() === 'tr') return text.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase()
    return text.toUpperCase()
}

/** A catalogue item's name ('item.<id>'), or its catalogue label when there is no key for it. */
export function itemName(item: { id: string; label: string } | null | undefined, fallback: string = ''): string {
    if (item === null || item === undefined) return fallback
    const key = `item.${item.id}`
    return key in en ? t(key as StringKey) : item.label
}

/** A catalogue item's one-line benefit ('itemBenefit.<id>'), or the catalogue's own. */
export function itemBenefit(item: { id: string; benefit: string }): string {
    const key = `itemBenefit.${item.id}`
    return key in en ? t(key as StringKey) : item.benefit
}

/** A reward campaign's card title, name or description ('reward.<id>.<field>'), or its own. */
export function rewardText(
    campaign: { id: string; cardTitle: string; name: string; description: string },
    field: 'cardTitle' | 'name' | 'description'
): string {
    const key = `reward.${campaign.id}.${field}`
    return key in en ? t(key as StringKey) : campaign[field]
}

/** The text for `key` in the current language, with {placeholders} filled from `vars`. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
    let text = STRINGS[getLanguage()][key] ?? en[key]
    if (vars !== undefined) {
        for (const name in vars) text = text.split(`{${name}}`).join(String(vars[name]))
    }
    return text
}

// --- Hover texts ---------------------------------------------------------------------------
//
// A hover text is written once, into the entity's PointerEvents, when the click is registered:
// usually at scene start, while the language still reads 'en'. So each one is registered here
// too, and rewritten whenever the language changes.

const hoverTexts = new Map<Entity, { key: StringKey; vars?: Record<string, string | number> }>()
let hoverLanguage: Language | null = null

/** The hover text for `entity` in the current language; kept up to date from then on. */
export function hoverText(entity: Entity, key: StringKey, vars?: Record<string, string | number>): string {
    hoverTexts.set(entity, { key, vars })
    return t(key, vars)
}

engine.addSystem(
    function hoverTextLanguageSystem() {
        const language = getLanguage()
        if (language === hoverLanguage) return
        hoverLanguage = language
        for (const [entity, text] of hoverTexts) {
            const events = PointerEvents.getMutableOrNull(entity)
            if (events === null) continue
            for (const event of events.pointerEvents) {
                if (event.eventInfo !== undefined) event.eventInfo.hoverText = t(text.key, text.vars)
            }
        }
    },
    undefined,
    'client:i18n-hover-texts'
)
