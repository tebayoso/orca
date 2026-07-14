import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SkillFreshnessEntry } from '../../../../shared/skill-freshness'
import type { SettingsNavTarget } from '@/lib/settings-navigation-types'
import { useOrcaSkillFreshness } from '@/hooks/useOrcaSkillFreshness'
import { useAppStore } from '@/store'
import {
  dismissOutdatedSkillForHash,
  shouldPromptOutdatedSkill,
  snoozeOutdatedSkillForSession
} from './outdated-skill-reminder'
import { OutdatedSkillUpdateDialog } from './OutdatedSkillUpdateDialog'

/**
 * Queues one outdated-skill card at a time after app open. Skills that the
 * user snoozed this session or dismissed for the current expected hash are
 * skipped so only remaining outdated packages surface.
 *
 * Why host-only discovery: Settings panels may use a WSL project runtime for
 * install status; the floating card always reflects the local host so it never
 * navigates desktop users into a WSL-only false positive.
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
    // Why: always session-snooze; also persist dismiss when we have a hash.
    // If localStorage fails, snooze still covers the session (CodeRabbit).
    snoozeOutdatedSkillForSession(activeSkill.skillName)
    if (activeSkill.expectedHash) {
      dismissOutdatedSkillForHash(activeSkill.skillName, activeSkill.expectedHash)
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
    // Why: session-snooze on navigate only. Persistent update-attempt is recorded
    // when a setup panel actually opens the update terminal after prereqs.
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
