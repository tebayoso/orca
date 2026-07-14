import type { OrcaManagedSkillSettingsSectionId } from './orca-managed-skills'

export type SkillFreshnessStatus = 'missing' | 'current' | 'outdated' | 'unknown'

export type SkillFreshnessEntry = {
  skillName: string
  displayName: string
  settingsSectionId: OrcaManagedSkillSettingsSectionId
  updateCommand: string
  status: SkillFreshnessStatus
  /** sha256 of the release catalog SKILL.md (expected). */
  expectedHash: string | null
  /**
   * Hash used for prompt identity. When outdated, this is the first diverging
   * home install's hash; when current, any matching home install hash.
   */
  installedHash: string | null
  /** First home install path (prefer diverging when outdated). */
  installedPath: string | null
  /** Every home install path that diverges from the app reference. */
  divergingPaths: string[]
}

export type SkillFreshnessResult = {
  skills: SkillFreshnessEntry[]
  scannedAt: number
  /**
   * Absolute path to a test-only reference skills root, if one was provided.
   * Production scans always use the generated hash catalog (`null` here).
   */
  referenceRoot: string | null
}
