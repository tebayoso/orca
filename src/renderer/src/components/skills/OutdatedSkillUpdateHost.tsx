import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SkillFreshnessEntry } from '../../../../shared/skill-freshness'
import type { SettingsNavTarget } from '@/lib/settings-navigation-types'
import { useOrcaSkillFreshness } from '@/hooks/useOrcaSkillFreshness'
import { useAppStore } from '@/store'
import {
  dismissOutdatedSkillForHash,
  markOutdatedSkillUpdateAttempted,
  shouldPromptOutdatedSkill,
  snoozeOutdatedSkillForSession
} from './outdated-skill-reminder'
import { OutdatedSkillUpdateDialog } from './OutdatedSkillUpdateDialog'

/**
 * Queues one outdated-skill card at a time after app open. Skills that the
 * user snoozed this session or dismissed for the current expected hash are
 * skipped so only remaining outdated packages surface.
 */
export function OutdatedSkillUpdateHost(): React.JSX.Element | null {
  const { outdatedSkills, loading } = useOrcaSkillFreshness()
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const [activeSkillName, setActiveSkillName] = useState<string | null>(null)
  const [suppressedNames, setSuppressedNames] = useState<string[]>([])

  const promptQueue = useMemo(() => {
    const suppressed = new Set(suppressedNames.map((name) => name.toLowerCase()))
    return outdatedSkills.filter(
      (skill) => shouldPromptOutdatedSkill(skill) && !suppressed.has(skill.skillName.toLowerCase())
    )
  }, [outdatedSkills, suppressedNames])

  const activeSkill: SkillFreshnessEntry | null = useMemo(() => {
    if (activeSkillName) {
      return (
        promptQueue.find((skill) => skill.skillName === activeSkillName) ?? promptQueue[0] ?? null
      )
    }
    return promptQueue[0] ?? null
  }, [activeSkillName, promptQueue])

  useEffect(() => {
    if (loading) {
      return
    }
    if (promptQueue.length === 0) {
      setActiveSkillName(null)
      return
    }
    setActiveSkillName((current) => {
      if (current && promptQueue.some((skill) => skill.skillName === current)) {
        return current
      }
      return promptQueue[0]?.skillName ?? null
    })
  }, [loading, promptQueue])

  const suppressCurrent = useCallback((skillName: string) => {
    setSuppressedNames((prev) =>
      prev.includes(skillName.toLowerCase()) ? prev : [...prev, skillName.toLowerCase()]
    )
    setActiveSkillName(null)
  }, [])

  const handleDismiss = useCallback(() => {
    if (!activeSkill) {
      return
    }
    // Why: X matches UpdateCard dismiss — hide this expected hash until the
    // next Orca release changes the reference skill content.
    if (activeSkill.expectedHash) {
      dismissOutdatedSkillForHash(activeSkill.skillName, activeSkill.expectedHash)
    } else {
      snoozeOutdatedSkillForSession(activeSkill.skillName)
    }
    suppressCurrent(activeSkill.skillName)
  }, [activeSkill, suppressCurrent])

  const handleUpdate = useCallback(() => {
    if (!activeSkill) {
      return
    }
    openSettingsTarget({
      pane: activeSkill.settingsSectionId as SettingsNavTarget,
      repoId: null
    })
    openSettingsPage()
    // Why (M1): after the user takes Update, don't re-prompt for this app
    // reference hash even if GitHub HEAD still differs from the bundle.
    markOutdatedSkillUpdateAttempted(activeSkill.skillName, activeSkill.expectedHash)
    snoozeOutdatedSkillForSession(activeSkill.skillName)
    suppressCurrent(activeSkill.skillName)
  }, [activeSkill, openSettingsPage, openSettingsTarget, suppressCurrent])

  if (!activeSkill) {
    return null
  }

  return (
    <OutdatedSkillUpdateDialog
      skill={activeSkill}
      onDismiss={handleDismiss}
      onUpdate={handleUpdate}
    />
  )
}
