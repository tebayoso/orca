import {
  COMPUTER_USE_SKILL_NAME,
  COMPUTER_USE_SKILL_UPDATE_COMMAND,
  EPHEMERAL_VMS_SKILL_NAME,
  EPHEMERAL_VMS_SKILL_UPDATE_COMMAND,
  LINEAR_TICKETS_SKILL_NAME,
  LINEAR_TICKETS_SKILL_UPDATE_COMMAND,
  ORCA_CLI_SKILL_NAME,
  ORCA_CLI_SKILL_UPDATE_COMMAND,
  ORCA_LINEAR_SKILL_NAME,
  ORCA_LINEAR_SKILL_UPDATE_COMMAND,
  ORCHESTRATION_SKILL_NAME,
  ORCHESTRATION_SKILL_UPDATE_COMMAND,
  buildAgentFeatureSkillUpdateCommand
} from './agent-feature-install-commands'

/** Settings nav section id that hosts the skill setup surface. */
export type OrcaManagedSkillSettingsSectionId =
  | 'general'
  | 'orchestration'
  | 'computer-use'
  | 'integrations'
  | 'experimental'
  | 'mobile-emulator'

export type OrcaManagedSkillDefinition = {
  /** Directory / skill package name under skills/ and ~/.agents/skills/. */
  skillName: string
  /** Short product label for UI copy. */
  displayName: string
  /** Settings sidebar section that owns this skill. */
  settingsSectionId: OrcaManagedSkillSettingsSectionId
  /** Global update command (npx skills update …). */
  updateCommand: string
  /** Alternate directory/frontmatter names that count as the same skill. */
  aliases?: readonly string[]
}

export const ORCA_EMULATOR_SKILL_NAME = 'orca-emulator'
export const ORCA_EMULATOR_ANDROID_SKILL_NAME = 'orca-emulator-android'

/**
 * Orca-owned agent skills whose installed copy should track the app release.
 * Only skills listed here participate in outdated detection and update prompts.
 */
export const ORCA_MANAGED_SKILLS: readonly OrcaManagedSkillDefinition[] = [
  {
    skillName: ORCA_CLI_SKILL_NAME,
    displayName: 'Orca CLI',
    settingsSectionId: 'general',
    updateCommand: ORCA_CLI_SKILL_UPDATE_COMMAND
  },
  {
    skillName: ORCHESTRATION_SKILL_NAME,
    displayName: 'Orchestration',
    settingsSectionId: 'orchestration',
    updateCommand: ORCHESTRATION_SKILL_UPDATE_COMMAND
  },
  {
    skillName: COMPUTER_USE_SKILL_NAME,
    displayName: 'Computer Use',
    settingsSectionId: 'computer-use',
    updateCommand: COMPUTER_USE_SKILL_UPDATE_COMMAND
  },
  {
    skillName: EPHEMERAL_VMS_SKILL_NAME,
    displayName: 'Per-workspace env',
    settingsSectionId: 'experimental',
    updateCommand: EPHEMERAL_VMS_SKILL_UPDATE_COMMAND
  },
  {
    skillName: ORCA_LINEAR_SKILL_NAME,
    displayName: 'Orca Linear',
    settingsSectionId: 'integrations',
    updateCommand: ORCA_LINEAR_SKILL_UPDATE_COMMAND,
    aliases: [LINEAR_TICKETS_SKILL_NAME]
  },
  {
    skillName: LINEAR_TICKETS_SKILL_NAME,
    displayName: 'Linear tickets',
    settingsSectionId: 'integrations',
    updateCommand: LINEAR_TICKETS_SKILL_UPDATE_COMMAND,
    aliases: [ORCA_LINEAR_SKILL_NAME]
  },
  {
    skillName: ORCA_EMULATOR_SKILL_NAME,
    displayName: 'iOS emulator',
    settingsSectionId: 'mobile-emulator',
    updateCommand: buildAgentFeatureSkillUpdateCommand(ORCA_EMULATOR_SKILL_NAME)
  },
  {
    skillName: ORCA_EMULATOR_ANDROID_SKILL_NAME,
    displayName: 'Android emulator',
    settingsSectionId: 'mobile-emulator',
    updateCommand: buildAgentFeatureSkillUpdateCommand(ORCA_EMULATOR_ANDROID_SKILL_NAME)
  }
]

export function getOrcaManagedSkillDefinition(
  skillName: string
): OrcaManagedSkillDefinition | undefined {
  const normalized = skillName.trim().toLowerCase()
  return ORCA_MANAGED_SKILLS.find(
    (skill) =>
      skill.skillName === normalized ||
      skill.aliases?.some((alias) => alias.toLowerCase() === normalized)
  )
}

export function listOrcaManagedSkillNames(): readonly string[] {
  return ORCA_MANAGED_SKILLS.map((skill) => skill.skillName)
}
