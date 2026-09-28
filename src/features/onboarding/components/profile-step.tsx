import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  bodyTextareaClass,
  fieldLabelClass,
  fieldInputClass,
} from './onboarding-shell'

export const BIO_MAX_LENGTH = 140

export function ProfileStepFields({
  bio,
  displayName,
  onBioChange,
  onDisplayNameChange,
}: {
  bio: string
  displayName: string
  onBioChange: (bio: string) => void
  onDisplayNameChange: (displayName: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="onboarding-display-name" className={fieldLabelClass}>
          display name
        </label>
        <Input
          id="onboarding-display-name"
          value={displayName}
          onChange={(event) => onDisplayNameChange(event.target.value)}
          placeholder="how you want to appear"
          className={fieldInputClass}
        />
      </div>

      <div>
        <label htmlFor="onboarding-bio" className={fieldLabelClass}>
          one-line bio{' '}
          <span className="text-text-faint">
            ({bio.length}/{BIO_MAX_LENGTH})
          </span>
        </label>
        <Textarea
          id="onboarding-bio"
          value={bio}
          onChange={(event) =>
            onBioChange(event.target.value.slice(0, BIO_MAX_LENGTH))
          }
          placeholder="what are you building?"
          rows={2}
          className={bodyTextareaClass}
        />
      </div>
    </div>
  )
}
