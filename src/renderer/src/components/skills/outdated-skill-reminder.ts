const DISMISS_STORAGE_PREFIX = 'orca:outdated-skill-dismissed:'
const sessionSnoozedSkillNames = new Set<string>()

function dismissStorageKey(skillName: string, expectedHash: string): string {
  return `${DISMISS_STORAGE_PREFIX}${skillName.trim().toLowerCase()}:${expectedHash}`
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
  return !isOutdatedSkillDismissedForHash(entry.skillName, entry.expectedHash)
}

export const _outdatedSkillReminderInternalsForTests = {
  reset(): void {
    sessionSnoozedSkillNames.clear()
  }
}
