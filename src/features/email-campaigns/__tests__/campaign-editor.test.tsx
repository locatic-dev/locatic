// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'
import type { CampaignDraft, SkipReason } from '../contracts'
import { announcementDraft } from './fixtures'

const mocks = vi.hoisted(() => ({
  searchResults: [] as unknown[] | undefined,
  searchError: null as Error | null,
  refetch: vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({
    data: mocks.searchError ? undefined : mocks.searchResults,
    error: mocks.searchError,
    refetch: mocks.refetch,
  }),
}))

import { CampaignEditor } from '../components/campaign-editor'

function Harness({
  initial = announcementDraft,
  isStale = false,
  onChange = vi.fn(),
  onSaveNow = vi.fn(),
  onReload = vi.fn(),
  skipReasons = new Map(),
}: {
  initial?: CampaignDraft
  skipReasons?: ReadonlyMap<string, SkipReason>
  isStale?: boolean
  onChange?: (draft: CampaignDraft) => void
  onSaveNow?: () => void
  onReload?: () => void
}) {
  const [draft, setDraft] = useState(initial)
  return (
    <CampaignEditor
      draft={draft}
      onChange={(next) => {
        setDraft(next)
        onChange(next)
      }}
      onSaveNow={onSaveNow}
      onReload={onReload}
      isStale={isStale}
      skipReasons={skipReasons}
    />
  )
}

const digestProject = {
  projectId: 'project_1' as Id<'projects'>,
  name: 'mapkit',
  fullName: 'ada/mapkit',
  description: null,
  url: 'https://locatic.dev/project/ada/mapkit',
  activityAt: 0,
  activityLabel: 'recent',
}

const digestDraft: CampaignDraft = {
  ...announcementDraft,
  content: {
    kind: 'digest',
    body: 'Hello',
    cta: null,
    periodKey: 'manual:x',
    periodStart: 0,
    periodEnd: 0,
    projects: [digestProject],
    discussions: [],
  },
}

afterEach(() => {
  mocks.searchResults = []
  mocks.searchError = null
  mocks.refetch.mockClear()
})

describe('CampaignEditor', () => {
  it('labels every field, counts characters and explains the Markdown subset', () => {
    render(<Harness />)

    expect(screen.getByLabelText('Title')).toBeTruthy()
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe(
      'Maps',
    )
    expect(screen.getByLabelText('Preview text')).toBeTruthy()
    expect(screen.getByLabelText('Message')).toBeTruthy()
    expect(screen.getByText('4 / 140')).toBeTruthy()
    expect(
      screen.getByText('**bold**, [links](https://…), and - lists'),
    ).toBeTruthy()
  })

  it('marks a field over its limit as invalid', () => {
    render(
      <Harness
        initial={{
          ...announcementDraft,
          content: { ...announcementDraft.content, body: 'x'.repeat(20_001) },
        }}
      />,
    )
    const body = screen.getByLabelText('Message')
    expect(body.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('20,001 / 20,000')).toBeTruthy()
  })

  it('reports edits and adds or removes the button', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await user.type(screen.getByLabelText('Subject'), '!')
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ subject: 'Maps!' }),
    )

    fireEvent.change(screen.getByLabelText('Button text'), {
      target: { value: 'Open Locatic' },
    })
    fireEvent.change(screen.getByLabelText('Button link'), {
      target: { value: 'https://locatic.dev' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          cta: { label: 'Open Locatic', url: 'https://locatic.dev' },
        }),
      }),
    )
    fireEvent.change(screen.getByLabelText('Button text'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('Button link'), {
      target: { value: '' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ cta: null }),
      }),
    )
  })

  it('saves now on ⌘S or Ctrl+S', async () => {
    const user = userEvent.setup()
    const onSaveNow = vi.fn()
    render(<Harness onSaveNow={onSaveNow} />)

    await user.click(screen.getByLabelText('Subject'))
    await user.keyboard('{Meta>}s{/Meta}')
    await user.keyboard('{Control>}S{/Control}')
    expect(onSaveNow).toHaveBeenCalledTimes(2)
  })

  it('switches the To field between everyone and named members', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    mocks.searchResults = [
      {
        userId: 'user_ada',
        displayName: 'Ada L',
        githubUsername: 'ada',
        skipReason: 'unsubscribed',
      },
    ]
    render(<Harness onChange={onChange} />)

    expect(
      (
        screen.getByRole('radio', {
          name: 'All members who get updates',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)
    await user.click(screen.getByRole('radio', { name: 'Specific members' }))
    expect(screen.getByText('Add at least one member to send.')).toBeTruthy()
    await user.type(screen.getByLabelText('Add a member'), 'ada')
    await user.click(screen.getByRole('button', { name: /Ada L/ }))

    const chips = screen.getByRole('list', { name: 'Chosen members' })
    expect(chips.textContent).toContain('turned updates off · will be skipped')
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        audience: {
          kind: 'members',
          members: [expect.objectContaining({ userId: 'user_ada' })],
        },
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Remove Ada L' }))
    expect(screen.queryByRole('list', { name: 'Chosen members' })).toBeNull()
    mocks.searchResults = []
  })

  it('moves between To options with the arrow keys, as radios do', async () => {
    // jsdom lacks CSS.escape, which user-event uses to find a radio group.
    vi.stubGlobal('CSS', {
      escape: (value: string) => value.replace(/[^\w-]/g, '\\$&'),
    })
    const user = userEvent.setup()
    render(<Harness />)

    const everyone = screen.getByRole('radio', {
      name: 'All members who get updates',
    })
    everyone.focus()
    await user.keyboard('{ArrowRight}')
    const members = screen.getByRole('radio', { name: 'Specific members' })
    expect(document.activeElement).toBe(members)
    expect((members as HTMLInputElement).checked).toBe(true)
    vi.unstubAllGlobals()
  })

  it('shows live skip reasons for members already chosen', () => {
    const draft: CampaignDraft = {
      ...announcementDraft,
      audience: {
        kind: 'members',
        members: [
          {
            userId: 'user_ada' as never,
            displayName: 'Ada L',
            githubUsername: 'ada',
          },
        ],
      },
    }
    const { rerender } = render(<Harness initial={draft} />)
    expect(screen.queryByText(/will be skipped/)).toBeNull()

    // Ada opts out: no new revision, but the live reason changes.
    rerender(
      <Harness
        initial={draft}
        skipReasons={new Map([['user_ada', 'unsubscribed' as const]])}
      />,
    )
    expect(
      screen.getByText('turned updates off · will be skipped'),
    ).toBeTruthy()
  })

  it('says when member search is loading or failed', async () => {
    const user = userEvent.setup()
    mocks.searchResults = undefined
    const { rerender } = render(<Harness />)
    await user.click(screen.getByRole('radio', { name: 'Specific members' }))
    await user.type(screen.getByLabelText('Add a member'), 'ad')
    expect(screen.getByText('Searching…')).toBeTruthy()

    mocks.searchError = new Error('network')
    rerender(<Harness />)
    expect(screen.getByRole('alert').textContent).toContain(
      "Couldn't search members.",
    )
  })

  it('tells the admin when someone else changed the draft', async () => {
    const user = userEvent.setup()
    const onReload = vi.fn()
    render(<Harness isStale onReload={onReload} />)

    expect(screen.getByRole('alert').textContent).toContain(
      'Someone else changed this draft. Reload to see their version.',
    )
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('lets digest drafts pick and remove projects', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const project = digestProject
    mocks.searchResults = [
      { ...project, projectId: 'project_2', fullName: 'bob/feeds' },
    ]
    render(<Harness onChange={onChange} initial={digestDraft} />)

    await user.type(screen.getByLabelText('Find a project'), 'feeds')
    await user.click(screen.getByRole('button', { name: 'Add bob/feeds' }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          projects: [
            project,
            expect.objectContaining({ fullName: 'bob/feeds' }),
          ],
        }),
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Remove ada/mapkit' }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          projects: [expect.objectContaining({ fullName: 'bob/feeds' })],
        }),
      }),
    )
  })

  it('says when project search is loading, empty, already chosen or failed', async () => {
    const user = userEvent.setup()
    mocks.searchResults = undefined
    const { rerender } = render(<Harness initial={digestDraft} />)
    await user.type(screen.getByLabelText('Find a project'), 'map')
    expect(screen.getByRole('status').textContent).toBe('Searching…')

    mocks.searchResults = []
    rerender(<Harness initial={digestDraft} />)
    expect(screen.getByRole('status').textContent).toBe(
      'No matching public projects.',
    )

    mocks.searchResults = [digestProject]
    rerender(<Harness initial={digestDraft} />)
    expect(screen.getByRole('status').textContent).toBe(
      'Every matching project is already chosen.',
    )
    expect(screen.queryByRole('list', { name: 'Matching projects' })).toBeNull()

    mocks.searchError = new Error('network')
    rerender(<Harness initial={digestDraft} />)
    expect(screen.getByRole('alert').textContent).toContain(
      "Couldn't search projects.",
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })
})
