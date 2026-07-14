const DISMISS_STORAGE_PREFIX = 'orca:outdated-skill-dismissed:'
const UPDATE_ATTEMPTED_STORAGE_PREFIX = 'orca:outdated-skill-update-attempted:'
const sessionSnoozedSkillNames = new Set<string>()

function dismissStorageKey(skillName: string, expectedHash: string): string {
  return `${DISMISS_STORAGE_PREFIX}${skillName.trim().toLowerCase()}:${expectedHash}`
}

function updateAttemptedStorageKey(skillName: string, expectedHash: string): string {
  return `${UPDATE_ATTEMPTED_STORAGE_PREFIX}${skillName.trim().toLowerCase()}:${expectedHash}`
}

export function isOutdatedSkillDismissedForHash(
  skillName: string,
  expectedHash: string | null
): boolean {
  if (!expectedHash || typeof localStorage === 'undefined') {
    return false
  }
  try {
    return localStorage.getItem(dismissStorageKey(skillName, expectedHash)) === '1'
  } catch {
    return false
  }
}

export function dismissOutdatedSkillForHash(skillName: string, expectedHash: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  try {
    localStorage.setItem(dismissStorageKey(skillName, expectedHash), '1')
  } catch {
    // Private mode / quota — treat as session-only via snooze caller.
  }
}

/**
 * Why (M1): `npx skills update` pulls GitHub HEAD, not the app-bundled
 * reference. After the user attempts an update for this app reference hash,
 * stop re-prompting until the next Orca release changes expectedHash.
 */
export function markOutdatedSkillUpdateAttempted(
  skillName: string,
  expectedHash: string | null
): void {
  if (!expectedHash || typeof localStorage === 'undefined') {
    return
  }
  try {
    localStorage.setItem(updateAttemptedStorageKey(skillName, expectedHash), '1')
  } catch {
    // Private mode / quota — session snooze still applies.
  }
}

export function isOutdatedSkillUpdateAttemptedForHash(
  skillName: string,
  expectedHash: string | null
): boolean {
  if (!expectedHash || typeof localStorage === 'undefined') {
    return false
  }
  try {
    return localStorage.getItem(updateAttemptedStorageKey(skillName, expectedHash)) === '1'
  } catch {
    return false
  }
}

export function snoozeOutdatedSkillForSession(skillName: string): void {
  sessionSnoozedSkillNames.add(skillName.trim().toLowerCase())
}

export function isOutdatedSkillSnoozedForSession(skillName: string): boolean {
  return sessionSnoozedSkillNames.has(skillName.trim().toLowerCase())
}

export function shouldPromptOutdatedSkill(entry: {
  skillName: string
  expectedHash: string | null
}): boolean {
  if (isOutdatedSkillSnoozedForSession(entry.skillName)) {
    return false
  }
  if (isOutdatedSkillDismissedForHash(entry.skillName, entry.expectedHash)) {
    return false
  }
  // Why: break the update→still-mismatch→reprompt loop when GitHub HEAD and
  // the app-bundled reference diverge.
  if (isOutdatedSkillUpdateAttemptedForHash(entry.skillName, entry.expectedHash)) {
    return false
  }
  return true
}

export const _outdatedSkillReminderInternalsForTests = {
  reset(): void {
    sessionSnoozedSkillNames.clear()
  }
}
