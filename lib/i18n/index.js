/**
 * dsh-notify-ar — i18n resolver.
 *
 * Design rule from the SPEC: the notification language defaults to **the app's
 * language**, not to a hard-coded Arabic. Resolution order is:
 *
 *   1. an explicit `config.locale` (`'ar'` | `'en'` | `'auto'`)
 *   2. the language detected from the running DSH app
 *   3. Arabic
 *
 * Any key a locale omits falls back to English, so shipping a partially
 * translated locale can never blank out a toast.
 *
 * @module dsh-notify-ar/i18n
 */
import ar from './ar.js'
import en from './en.js'

export const LOCALES = { ar, en }
export const DEFAULT_LOCALE = 'ar'
export const FALLBACK_LOCALE = 'en'

/**
 * Wrap a Latin run in Unicode first-strong isolates (FSI … PDI).
 *
 * An Arabic toast line that also carries `csc.exe` or `D:\DeepSeek Harness`
 * would otherwise let the renderer reorder the Arabic around the Latin token.
 * Isolating the Latin run pins it in place while the sentence keeps its RTL
 * flow. Pure-Latin input has no Arabic to disturb, so applying it is safe.
 *
 * @param value - The identifier, path, or tool name to isolate.
 * @returns The isolated string, or the input unchanged when it has no Latin.
 */
export function bidi(value) {
  const text = value === undefined || value === null ? '' : String(value)
  if (text === '') return ''
  if (!/[A-Za-z0-9]/.test(text)) return text
  if (text.startsWith('\u2068')) return text
  return `\u2068${text}\u2069`
}

/**
 * Detect the app's language from the DSH environment.
 *
 * Reads the locale hints a DSH process exposes (`DSH_LANG` / `DSH_LOCALE`), then
 * the conventional POSIX hints. A tag starting with `ar` resolves to Arabic;
 * any other non-empty tag resolves to English.
 *
 * @param env - Environment map (defaults to `process.env`).
 * @returns `'ar'` or `'en'`.
 */
export function detectLocale(env = process.env) {
  const raw = env.DSH_LANG || env.DSH_LOCALE || env.LC_ALL || env.LC_MESSAGES || env.LANG || ''
  const tag = String(raw).trim().toLowerCase()
  if (tag.startsWith('ar')) return 'ar'
  if (tag !== '') return 'en'
  return DEFAULT_LOCALE
}

/**
 * Resolve the locale actually in effect for a config.
 *
 * @param config - Plugin config carrying an optional `locale`.
 * @param env - Environment map used when the locale is `'auto'`.
 * @returns `'ar'` or `'en'`.
 */
export function resolveLocale(config = {}, env = process.env) {
  const requested = config.locale
  if (requested === 'ar' || requested === 'en') return requested
  return detectLocale(env)
}

/** Read a dotted key path out of a locale dictionary. */
function read(dict, path) {
  let node = dict
  for (const part of path.split('.')) {
    if (node === undefined || node === null) return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * Build a translator for one locale.
 *
 * @param locale - `'ar'` or `'en'`.
 * @returns `t(key, params?)` — the localized template with `{name}` slots filled.
 */
export function translator(locale) {
  const primary = LOCALES[locale] ?? LOCALES[DEFAULT_LOCALE]
  const fallback = LOCALES[FALLBACK_LOCALE]
  return function t(key, params = {}) {
    const template = read(primary, key) ?? read(fallback, key) ?? key
    return template.replace(/\{(\w+)\}/g, (whole, name) => {
      const value = params[name]
      return value === undefined || value === null ? whole : String(value)
    })
  }
}
