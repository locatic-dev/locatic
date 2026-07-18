// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProjectReadmeSection } from '../project-readme-section'

const bases = {
  readmeAssetBaseUrl: null,
  readmeAssetRootUrl: null,
  readmeLinkBaseUrl: null,
  readmeLinkRootUrl: null,
}

describe('ProjectReadmeSection', () => {
  it('renders nothing when the project has no README', () => {
    const { container } = render(
      <ProjectReadmeSection bases={bases} readmePreview="" />,
    )

    expect(container.innerHTML).toBe('')
    expect(screen.queryByText('README.md')).toBeNull()
  })

  it('renders the README as a standalone project overview', () => {
    render(
      <ProjectReadmeSection bases={bases} readmePreview="# Project overview" />,
    )

    expect(screen.getByText('README.md')).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'Project overview' }),
    ).toBeTruthy()
  })
})
