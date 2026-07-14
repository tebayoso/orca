import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkOrcaSkillFreshness,
  hashSkillMarkdown,
  normalizeSkillMarkdownForHash
} from './freshness'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function writeSkill(root: string, skillName: string, body: string): Promise<string> {
  const skillDir = join(root, skillName)
  await mkdir(skillDir, { recursive: true })
  const skillFilePath = join(skillDir, 'SKILL.md')
  await writeFile(skillFilePath, body, 'utf8')
  return skillFilePath
}

describe('skill freshness hashing', () => {
  it('normalizes CRLF so Windows and Unix installs compare equal', () => {
    expect(hashSkillMarkdown('a\r\nb\n')).toBe(hashSkillMarkdown('a\nb\n'))
    expect(normalizeSkillMarkdownForHash('x\r\ny')).toBe('x\ny')
  })
})

describe('checkOrcaSkillFreshness', () => {
  it('marks an installed skill outdated when content diverges from the reference', async () => {
    const referenceRoot = await makeTempDir('orca-skill-ref-')
    const homeDir = await makeTempDir('orca-skill-home-')
    await writeSkill(referenceRoot, 'orca-cli', '---\nname: orca-cli\n---\nexpected\n')
    await mkdir(join(homeDir, '.agents', 'skills'), { recursive: true })
    await writeSkill(
      join(homeDir, '.agents', 'skills'),
      'orca-cli',
      '---\nname: orca-cli\n---\nstale\n'
    )

    const result = await checkOrcaSkillFreshness({
      repos: [],
      homeDir,
      referenceRoot
    })

    const orcaCli = result.skills.find((skill) => skill.skillName === 'orca-cli')
    expect(orcaCli?.status).toBe('outdated')
    expect(orcaCli?.expectedHash).toBeTruthy()
    expect(orcaCli?.installedHash).toBeTruthy()
    expect(orcaCli?.expectedHash).not.toBe(orcaCli?.installedHash)
  })

  it('marks an installed skill current when content matches the reference', async () => {
    const referenceRoot = await makeTempDir('orca-skill-ref-')
    const homeDir = await makeTempDir('orca-skill-home-')
    const content = '---\nname: orchestration\n---\ncurrent body\n'
    await writeSkill(referenceRoot, 'orchestration', content)
    await mkdir(join(homeDir, '.agents', 'skills'), { recursive: true })
    await writeSkill(join(homeDir, '.agents', 'skills'), 'orchestration', content)

    const result = await checkOrcaSkillFreshness({
      repos: [],
      homeDir,
      referenceRoot
    })

    const orchestration = result.skills.find((skill) => skill.skillName === 'orchestration')
    expect(orchestration?.status).toBe('current')
  })

  it('marks a managed skill missing when it is not installed', async () => {
    const referenceRoot = await makeTempDir('orca-skill-ref-')
    const homeDir = await makeTempDir('orca-skill-home-')
    await writeSkill(referenceRoot, 'computer-use', '---\nname: computer-use\n---\nbody\n')
    await mkdir(join(homeDir, '.agents', 'skills'), { recursive: true })

    const result = await checkOrcaSkillFreshness({
      repos: [],
      homeDir,
      referenceRoot
    })

    const computerUse = result.skills.find((skill) => skill.skillName === 'computer-use')
    expect(computerUse?.status).toBe('missing')
  })

  it('returns unknown when an installed skill file cannot be hashed', async () => {
    const referenceRoot = await makeTempDir('orca-skill-ref-')
    const homeDir = await makeTempDir('orca-skill-home-')
    await writeSkill(referenceRoot, 'orca-cli', '---\nname: orca-cli\n---\nexpected\n')
    await mkdir(join(homeDir, '.agents', 'skills', 'orca-cli'), { recursive: true })
    // Directory where SKILL.md should be — leave it empty so discovery still
    // finds the skill folder via other roots? Discovery needs SKILL.md present.
    // Create a skill file then make it unreadable by replacing with a directory.
    const skillFilePath = join(homeDir, '.agents', 'skills', 'orca-cli', 'SKILL.md')
    await writeFile(skillFilePath, '---\nname: orca-cli\n---\nbody\n', 'utf8')
    // Oversized content past the 256 KiB guard.
    await writeFile(skillFilePath, 'x'.repeat(300 * 1024), 'utf8')

    const result = await checkOrcaSkillFreshness({
      repos: [],
      homeDir,
      referenceRoot
    })

    const orcaCli = result.skills.find((skill) => skill.skillName === 'orca-cli')
    expect(orcaCli?.status).toBe('unknown')
  })

  it('ignores repo-local skill copies when deciding global freshness', async () => {
    const referenceRoot = await makeTempDir('orca-skill-ref-')
    const homeDir = await makeTempDir('orca-skill-home-')
    const repoDir = await makeTempDir('orca-skill-repo-')
    const content = '---\nname: orca-cli\n---\nreference\n'
    await writeSkill(referenceRoot, 'orca-cli', content)
    await mkdir(join(homeDir, '.agents', 'skills'), { recursive: true })
    // Stale copy only under the repo — must not count as a global install.
    await mkdir(join(repoDir, '.agents', 'skills'), { recursive: true })
    await writeSkill(
      join(repoDir, '.agents', 'skills'),
      'orca-cli',
      '---\nname: orca-cli\n---\nstale\n'
    )

    const result = await checkOrcaSkillFreshness({
      repos: [],
      homeDir,
      cwd: repoDir,
      referenceRoot
    })

    const orcaCli = result.skills.find((skill) => skill.skillName === 'orca-cli')
    expect(orcaCli?.status).toBe('missing')
  })
})
