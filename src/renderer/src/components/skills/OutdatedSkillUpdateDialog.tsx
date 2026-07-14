import { useId } from 'react'
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
 *
 * Why no global Escape: dismissing persists the expected hash. Stealing Escape
 * from terminals/search would permanently hide the prompt; users dismiss via X.
 */
export function OutdatedSkillUpdateDialog(props: {
  skill: SkillFreshnessEntry
  onDismiss: () => void
  onUpdate: () => void
}): React.JSX.Element {
  const { skill, onDismiss, onUpdate } = props
  const headingId = useId()
  const updateStatus = useAppStore((s) => s.updateStatus)
  // Why: UpdateCard owns bottom-10; raise this card so both remain readable.
  const updateCardVisible = updateStatus.state !== 'idle' && updateStatus.state !== 'not-available'

  const copyCommand = async (): Promise<void> => {
    try {
      await window.api.ui.writeClipboardText(skill.updateCommand)
      toast.success(
        translate(
          'auto.components.skills.OutdatedSkillUpdateDialog.7a5f26c79f',
          'Copied update command.'
        )
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.skills.OutdatedSkillUpdateDialog.7e6c0adbca',
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
      <Card className="gap-0 py-0" role="region" aria-labelledby={headingId}>
        <div className="flex flex-col gap-2.5 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <h3 id={headingId} className="text-sm font-semibold">
              {translate(
                'auto.components.skills.OutdatedSkillUpdateDialog.556eab4c6f',
                'Your Orca skills are outdated'
              )}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 min-h-[44px] min-w-[44px] shrink-0 -m-2"
              onClick={onDismiss}
              aria-label={translate(
                'auto.components.skills.OutdatedSkillUpdateDialog.c04888cdf5',
                'Dismiss skill update'
              )}
            >
              <X className="size-3.5" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {translate(
              'auto.components.skills.OutdatedSkillUpdateDialog.ffa78ad9cf',
              'The {{skillName}} skill needs an update.',
              { skillName: skill.displayName }
            )}
          </p>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {translate(
              'auto.components.skills.OutdatedSkillUpdateDialog.f37228fd6f',
              'Update them so agents keep the latest Orca workflows.'
            )}
          </p>

          <button
            type="button"
            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => void copyCommand()}
          >
            {translate(
              'auto.components.skills.OutdatedSkillUpdateDialog.d2ce485b34',
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
            {translate('auto.components.skills.OutdatedSkillUpdateDialog.fb91e24fa5', 'Update')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
