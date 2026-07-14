import { useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import type { SkillFreshnessEntry } from '../../../../shared/skill-freshness'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

/**
 * Compact bottom-right skill update prompt — same shell and option pattern as
 * UpdateCard's SimpleCardContent: title + dismiss, short body, text link,
 * full-width primary Update.
 */
export function OutdatedSkillUpdateDialog(props: {
  skill: SkillFreshnessEntry
  onDismiss: () => void
  onUpdate: () => void
}): React.JSX.Element {
  const { skill, onDismiss, onUpdate } = props
  const updateStatus = useAppStore((s) => s.updateStatus)
  // Why: UpdateCard owns bottom-10; raise this card so both remain readable.
  const updateCardVisible = updateStatus.state !== 'idle' && updateStatus.state !== 'not-available'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      // Why: do not steal Escape from open dialogs, menus, or text fields.
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.closest('[role="dialog"]') ||
          target.closest('[role="menu"]') ||
          target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return
      }
      event.preventDefault()
      onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  const copyCommand = async (): Promise<void> => {
    try {
      await window.api.ui.writeClipboardText(skill.updateCommand)
      toast.success(
        translate(
          'auto.components.skills.OutdatedSkillUpdateDialog.copied',
          'Copied update command.'
        )
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.skills.OutdatedSkillUpdateDialog.copyFailed',
              'Failed to copy update command.'
            )
      )
    }
  }

  return (
    <div
      className={`fixed right-4 z-40 w-[360px] max-w-[calc(100vw-32px)] max-[480px]:left-4 max-[480px]:right-4 max-[480px]:w-auto ${
        updateCardVisible ? 'bottom-[220px]' : 'bottom-10'
      }`}
    >
      <Card
        className="gap-0 py-0"
        role="complementary"
        aria-labelledby="outdated-skill-update-heading"
      >
        <div className="flex flex-col gap-2.5 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <h3 id="outdated-skill-update-heading" className="text-sm font-semibold">
              {translate(
                'auto.components.skills.OutdatedSkillUpdateDialog.title',
                'Your Orca skills are outdated'
              )}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 min-h-[44px] min-w-[44px] shrink-0 -m-2"
              onClick={onDismiss}
              aria-label={translate(
                'auto.components.skills.OutdatedSkillUpdateDialog.dismissAria',
                'Dismiss skill update'
              )}
            >
              <X className="size-3.5" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {translate(
              'auto.components.skills.OutdatedSkillUpdateDialog.readyLine',
              'The {{skillName}} skill needs an update.',
              { skillName: skill.displayName }
            )}
          </p>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {translate(
              'auto.components.skills.OutdatedSkillUpdateDialog.hint',
              'Update them so agents keep the latest Orca workflows.'
            )}
          </p>

          <button
            type="button"
            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => void copyCommand()}
          >
            {translate(
              'auto.components.skills.OutdatedSkillUpdateDialog.copyCommand',
              'Copy update command'
            )}
          </button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onUpdate}
            className="mt-0.5 w-full cursor-pointer"
          >
            {translate('auto.components.skills.OutdatedSkillUpdateDialog.update', 'Update')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
