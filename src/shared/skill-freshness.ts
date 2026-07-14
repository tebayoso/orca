import type { OrcaManagedSkillSettingsSectionId } from './orca-managed-skills'

export type SkillFreshnessStatus = 'missing' | 'current' | 'outdated' | 'unknown'

export type SkillFreshnessEntry = {
  skillName: string
  displayName: string
  settingsSectionId: OrcaManagedSkillSettingsSectionId
  updateCommand: string
  status: SkillFreshnessStatus
  /** sha256 of the app-bundled SKILL.md (expected). */
  expectedHash: string | null
  /** sha256 of the globally installed SKILL.md when present. */
  installedHash: string | null
  installedPath: string | null
}

export type SkillFreshnessResult = {
  skills: SkillFreshnessEntry[]
  scannedAt: number
  /** Absolute path to the reference skills root used for expected hashes. */
  referenceRoot: string | null
}
