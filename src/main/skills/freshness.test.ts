import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ORCA_MANAGED_SKILLS } from '../../shared/orca-managed-skills'
import { ORCA_SKILL_REFERENCE_HASHES } from '../../shared/orca-skill-reference-hashes.generated'
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
  // Why: all fixtures live under os.tmpdir — never write into repo skills/ or real ~/.agents.
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
  it('normalizes CRLF and BOM so Windows and Unix installs compare equal', () => {
    expect(hashSkillMarkdown('a\r\nb\n')).toBe(hashSkillMarkdown('a\nb\n'))
    expect(hashSkillMarkdown('\uFEFFhello\n')).toBe(hashSkillMarkdown('hello\n'))
    expect(normalizeSkillMarkdownForHash('\uFEFFx\r\ny')).toBe('x\ny')
  })
})

describe('managed skill catalog contract', () => {
  it('pins every managed skill to a generated reference hash (no packaging of skills/)', () => {
    const catalogNames = new Set(Object.keys(ORCA_SKILL_REFERENCE_HASHES))
    for (const skill of ORCA_MANAGED_SKILLS) {
      expect(catalogNames.has(skill.skillName)).toBe(true)
      expect(ORCA_SKILL_REFERENCE_HASHES[skill.skillName]).toMatch(/^[a-f0-9]{64}$/)
    }
    // Why: catalog must not grow beyond the update-wired managed set.
    expect(catalogNames.size).toBe(ORCA_MANAGED_SKILLS.length)
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
      homeDir,
      referenceRoot
    })

    const orcaCli = result.skills.find((skill) => skill.skillName === 'orca-cli')
    expect(orcaCli?.status).toBe('outdated')
    expect(orcaCli?.expectedHash).toBeTruthy()
    expect(orcaCli?.installedHash).toBeTruthy()
    expect(orcaCli?.expectedHash).not.toBe(orcaCli?.installedHash)
    expect(orcaCli?.divergingPaths.length).toBe(1)
  })

  it('marks an installed skill current when content matches the reference', async () => {
    const referenceRoot = await makeTempDir('orca-skill-ref-')
    const homeDir = await makeTempDir('orca-skill-home-')
    const content = '---\nname: orchestration\n---\ncurrent body\n'
    await writeSkill(referenceRoot, 'orchestration', content)
    await mkdir(join(homeDir, '.agents', 'skills'), { recursive: true })
    await writeSkill(join(homeDir, '.agents', 'skills'), 'orchestration', content)

    const result = await checkOrcaSkillFreshness({
      homeDir,
      referenceRoot
    })

    const orchestration = result.skills.find((skill) => skill.skillName === 'orchestration')
    expect(orchestration?.status).toBe('current')
    expect(orchestration?.divergingPaths).toEqual([])
  })

  it('marks a managed skill missing when it is not installed', async () => {
    const referenceRoot = await makeTempDir('orca-skill-ref-')
    const homeDir = await makeTempDir('orca-skill-home-')
    await writeSkill(referenceRoot, 'computer-use', '---\nname: computer-use\n---\nbody\n')
    await mkdir(join(homeDir, '.agents', 'skills'), { recursive: true })

    const result = await checkOrcaSkillFreshness({
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
    const skillFilePath = join(homeDir, '.agents', 'skills', 'orca-cli', 'SKILL.md')
    await writeFile(skillFilePath, 'x'.repeat(300 * 1024), 'utf8')

    const result = await checkOrcaSkillFreshness({
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
    await mkdir(join(repoDir, '.agents', 'skills'), { recursive: true })
    await writeSkill(
      join(repoDir, '.agents', 'skills'),
      'orca-cli',
      '---\nname: orca-cli\n---\nstale\n'
    )

    // Why: homeDir is empty of installs; repoDir is never scanned.
    const result = await checkOrcaSkillFreshness({
      homeDir,
      referenceRoot
    })

    const orcaCli = result.skills.find((skill) => skill.skillName === 'orca-cli')
    expect(orcaCli?.status).toBe('missing')
  })

  it('uses the generated catalog when no referenceRoot is provided', async () => {
    const homeDir = await makeTempDir('orca-skill-home-')
    await mkdir(join(homeDir, '.agents', 'skills'), { recursive: true })

    const result = await checkOrcaSkillFreshness({ homeDir })

    expect(result.referenceRoot).toBeNull()
    expect(result.skills.map((skill) => skill.skillName).sort()).toEqual(
      ORCA_MANAGED_SKILLS.map((skill) => skill.skillName).sort()
    )
    expect(result.skills.every((skill) => skill.expectedHash !== null)).toBe(true)
    expect(result.skills.every((skill) => skill.status === 'missing')).toBe(true)
  })

  it('flags outdated when any home provider copy diverges', async () => {
    const referenceRoot = await makeTempDir('orca-skill-ref-')
    const homeDir = await makeTempDir('orca-skill-home-')
    const content = '---\nname: orca-cli\n---\nreference\n'
    await writeSkill(referenceRoot, 'orca-cli', content)
    await mkdir(join(homeDir, '.agents', 'skills'), { recursive: true })
    await mkdir(join(homeDir, '.claude', 'skills'), { recursive: true })
    await writeSkill(join(homeDir, '.agents', 'skills'), 'orca-cli', content)
    await writeSkill(
      join(homeDir, '.claude', 'skills'),
      'orca-cli',
      '---\nname: orca-cli\n---\nstale-claude\n'
    )

    const result = await checkOrcaSkillFreshness({
      homeDir,
      referenceRoot
    })

    const orcaCli = result.skills.find((skill) => skill.skillName === 'orca-cli')
    expect(orcaCli?.status).toBe('outdated')
    expect(orcaCli?.divergingPaths.some((path) => path.includes('.claude'))).toBe(true)
  })
})
