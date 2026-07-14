import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _outdatedSkillReminderInternalsForTests,
  dismissOutdatedSkillForHash,
  isOutdatedSkillDismissedForHash,
  isOutdatedSkillSnoozedForSession,
  isOutdatedSkillUpdateAttemptedForHash,
  markOutdatedSkillUpdateAttempted,
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
    expect(shouldPromptOutdatedSkill({ skillName: 'orca-cli', expectedHash: 'def' })).toBe(true)
  })

  it('stops prompting after an update attempt for the same expected hash (M1)', () => {
    markOutdatedSkillUpdateAttempted('orca-cli', 'abc')
    expect(isOutdatedSkillUpdateAttemptedForHash('orca-cli', 'abc')).toBe(true)
    expect(shouldPromptOutdatedSkill({ skillName: 'orca-cli', expectedHash: 'abc' })).toBe(false)
    // New app release with a new expected hash should re-prompt.
    expect(shouldPromptOutdatedSkill({ skillName: 'orca-cli', expectedHash: 'def' })).toBe(true)
  })
})
