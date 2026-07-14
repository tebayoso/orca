import { markOutdatedSkillUpdateAttempted } from './outdated-skill-reminder'

/** Record an update attempt when the setup panel opens an update terminal. */
export function markOutdatedSkillUpdateAttemptIfNeeded(
  skillName: string,
  outdated: boolean,
  expectedHash: string | null | undefined
): void {
  if (!outdated) {
    return
  }
  markOutdatedSkillUpdateAttempted(skillName, expectedHash ?? null)
}
