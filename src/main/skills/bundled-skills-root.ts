import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/**
 * Resolve the on-disk root of Orca-shipped skill references used for
 * freshness checks. Packaged apps read `process.resourcesPath/orca-skills`;
 * dev/unpackaged builds fall back to the repo `skills/` directory.
 */
export function resolveBundledSkillsRoot(options?: {
  isPackaged?: boolean
  resourcesPath?: string
  appPath?: string
}): string | null {
  const isPackaged = options?.isPackaged ?? app.isPackaged
  const resourcesPath = options?.resourcesPath ?? process.resourcesPath
  const appPath = options?.appPath ?? app.getAppPath()

  if (isPackaged) {
    const packagedRoot = join(resourcesPath, 'orca-skills')
    return existsSync(packagedRoot) ? packagedRoot : null
  }

  // electron-vite may set getAppPath() to the project root or out/.
  const candidates = [
    join(appPath, 'skills'),
    join(appPath, '..', 'skills'),
    join(process.cwd(), 'skills')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}
