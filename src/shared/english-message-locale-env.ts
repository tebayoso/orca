/**
 * Pin subprocess message language to English (C locale) without clobbering
 * the character encoding the user's environment provides.
 *
 * Why not LC_ALL=C: LC_ALL overrides every locale category including
 * LC_CTYPE, which downgrades child processes — notably user-authored git
 * hooks (husky, pre-commit's Python) — to ASCII, making them crash or
 * mis-decode UTF-8 output that works fine from the user's own terminal.
 * Orca only needs deterministic *messages* for string-matching git/gh
 * output, so pin LC_MESSAGES alone and drop any inherited LC_ALL that would
 * outrank it. When LC_ALL was the only place the user's encoding lived,
 * promote it to LANG so LC_CTYPE still resolves to their encoding.
 * (gettext's LANGUAGE variable is ignored when the message locale is C, so
 * it needs no handling here.)
 */
export function withEnglishMessageLocale(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { LC_ALL, ...rest } = env
  return {
    ...rest,
    ...(LC_ALL && !rest.LANG ? { LANG: LC_ALL } : {}),
    LC_MESSAGES: 'C'
  }
}
