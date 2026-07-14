import {
  COMPUTER_USE_SKILL_NAME,
  COMPUTER_USE_SKILL_UPDATE_COMMAND,
  EPHEMERAL_VMS_SKILL_NAME,
  EPHEMERAL_VMS_SKILL_UPDATE_COMMAND,
  ORCA_CLI_SKILL_NAME,
  ORCA_CLI_SKILL_UPDATE_COMMAND,
  ORCHESTRATION_SKILL_NAME,
  ORCHESTRATION_SKILL_UPDATE_COMMAND
} from './agent-feature-install-commands'

/** Settings nav section id that hosts the skill setup surface. */
export type OrcaManagedSkillSettingsSectionId =
  | 'general'
  | 'orchestration'
  | 'computer-use'
  | 'experimental'

export type OrcaManagedSkillDefinition = {
  /** Directory / skill package name under skills/ and ~/.agents/skills/. */
  skillName: string
  /** Short product label for UI copy. */
  displayName: string
  /** Settings sidebar section that hosts this skill. */
  settingsSectionId: OrcaManagedSkillSettingsSectionId
  /** Global update command (npx skills update …). */
  updateCommand: string
}

/**
 * Orca-owned agent skills with an in-app update surface.
 * Only these participate in outdated detection and prompts — Linear / emulator
 * skills keep their existing install flows until they gain the same rail.
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
  }
]
