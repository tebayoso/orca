import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _outdatedSkillReminderInternalsForTests,
  dismissOutdatedSkillForHash,
  isOutdatedSkillDismissedForHash,
  isOutdatedSkillSnoozedForSession,
  shouldPromptOutdatedSkill,
  snoozeOutdatedSkillForSession
} from './outdated-skill-reminder'

describe('outdated skill reminder', () => {
  const memory = new Map<string, string>()

  beforeEach(() => {
    memory.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
      clear: () => {
        memory.clear()
      }
    })
  })

  afterEach(() => {
    _outdatedSkillReminderInternalsForTests.reset()
    vi.unstubAllGlobals()
  })

  it('prompts by default when a hash is present', () => {
    expect(shouldPromptOutdatedSkill({ skillName: 'orca-cli', expectedHash: 'abc' })).toBe(true)
  })

  it('stops prompting after session snooze', () => {
    snoozeOutdatedSkillForSession('orca-cli')
    expect(isOutdatedSkillSnoozedForSession('orca-cli')).toBe(true)
    expect(shouldPromptOutdatedSkill({ skillName: 'orca-cli', expectedHash: 'abc' })).toBe(false)
  })

  it('stops prompting after dismissing the expected hash', () => {
    dismissOutdatedSkillForHash('orca-cli', 'abc')
    expect(isOutdatedSkillDismissedForHash('orca-cli', 'abc')).toBe(true)
    expect(shouldPromptOutdatedSkill({ skillName: 'orca-cli', expectedHash: 'abc' })).toBe(false)
    // Why: a new Orca release changes the reference hash and should re-prompt.
    expect(shouldPromptOutdatedSkill({ skillName: 'orca-cli', expectedHash: 'def' })).toBe(true)
  })
})
