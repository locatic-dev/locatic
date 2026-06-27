import type { Doc } from '../../../convex/_generated/dataModel'
import { Switch } from '@/components/ui/switch'
import { isProfileContributionsPublic } from '@/features/profile/state'

type PrivacySettings = Doc<'users'>['privacy']
type VisibilitySettingKey =
  | 'commentHistoryVisibility'
  | 'likedProjectsVisibility'
  | 'contributionsVisibility'
  | 'followGraphVisibility'

const VISIBILITY_SETTINGS: Array<{
  key: VisibilitySettingKey
  label: string
  desc: string
}> = [
  {
    key: 'commentHistoryVisibility',
    label: 'show comment history',
    desc: 'show your comment tab on your profile',
  },
  {
    key: 'likedProjectsVisibility',
    label: 'show liked projects',
    desc: 'show your liked tab on your profile',
  },
  {
    key: 'contributionsVisibility',
    label: 'show contributions',
    desc: 'show your contributions tab and GitHub contribution graph on your public profile',
  },
  {
    key: 'followGraphVisibility',
    label: 'show follow graph',
    desc: 'allow people to open your followers and following lists',
  },
]

function isVisibilitySettingPublic(
  privacy: PrivacySettings,
  key: VisibilitySettingKey,
) {
  if (key === 'contributionsVisibility') {
    return isProfileContributionsPublic(privacy)
  }

  return privacy[key] === 'public'
}

export function PrivacyVisibilitySettings({
  onUpdate,
  privacy,
  settingsRowClassName,
}: {
  onUpdate: (privacy: PrivacySettings) => Promise<unknown>
  privacy: PrivacySettings
  settingsRowClassName: string
}) {
  return (
    <>
      {VISIBILITY_SETTINGS.map(({ key, label, desc }) => (
        <div key={key} className={settingsRowClassName}>
          <div>
            <div className="mb-0.5 font-mono text-[13px] text-text">
              {label}
            </div>
            <div className="font-sans text-xs text-text-faint">{desc}</div>
          </div>
          <Switch
            aria-label={label}
            checked={isVisibilitySettingPublic(privacy, key)}
            onCheckedChange={async (checked) => {
              await onUpdate({
                ...privacy,
                contributionsVisibility:
                  privacy.contributionsVisibility ?? 'public',
                [key]: checked ? 'public' : 'private',
              })
            }}
          />
        </div>
      ))}
    </>
  )
}
