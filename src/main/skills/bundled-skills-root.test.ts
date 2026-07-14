import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { resolveBundledSkillsRoot } = await import('./bundled-skills-root')

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => tmpdir()
  }
}))

describe('resolveBundledSkillsRoot', () => {
  const created: string[] = []

  afterEach(async () => {
    created.length = 0
  })

  it('returns packaged resources/orca-skills when present', async () => {
    const resourcesPath = await mkdtemp(join(tmpdir(), 'orca-resources-'))
    created.push(resourcesPath)
    const skillsRoot = join(resourcesPath, 'orca-skills')
    await mkdir(skillsRoot, { recursive: true })
    await writeFile(join(skillsRoot, 'README'), 'x', 'utf8')

    expect(
      resolveBundledSkillsRoot({
        isPackaged: true,
        resourcesPath,
        appPath: tmpdir()
      })
    ).toBe(skillsRoot)
  })

  it('returns null when packaged resources are missing', () => {
    expect(
      resolveBundledSkillsRoot({
        isPackaged: true,
        resourcesPath: join(tmpdir(), 'missing-resources-dir'),
        appPath: tmpdir()
      })
    ).toBeNull()
  })

  it('falls back to a skills directory next to appPath in dev', async () => {
    const appPath = await mkdtemp(join(tmpdir(), 'orca-app-'))
    created.push(appPath)
    const skillsRoot = join(appPath, 'skills')
    await mkdir(skillsRoot, { recursive: true })

    expect(
      resolveBundledSkillsRoot({
        isPackaged: false,
        resourcesPath: join(tmpdir(), 'unused'),
        appPath
      })
    ).toBe(skillsRoot)
  })
})
