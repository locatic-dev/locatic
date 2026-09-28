// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { stripHash, useSignInReturnHref } from '../return-href'

function ReturnLink({ href }: { href: string }) {
  const redirect = useSignInReturnHref(href)
  return (
    <a data-testid="sign-in" href={redirect ?? 'none'}>
      sign in
    </a>
  )
}

describe('useSignInReturnHref', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    document.body.innerHTML = ''
  })

  it('keeps path, query and the browser hash', () => {
    window.history.replaceState(null, '', '/project/ada/engine#comment-1')
    render(<ReturnLink href="/project/ada/engine?comment=c1#comment-1" />)

    expect(screen.getByTestId('sign-in').getAttribute('href')).toBe(
      '/project/ada/engine?comment=c1#comment-1',
    )
  })

  it('leaves the hash out of the server render and adds it after hydration without a mismatch', async () => {
    const href = '/project/ada/engine?comment=c1'
    const serverHtml = renderToString(<ReturnLink href={href} />)
    expect(serverHtml).toContain('href="/project/ada/engine?comment=c1"')

    window.history.replaceState(null, '', '/project/ada/engine#comment-1')
    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.append(container)
    // React reports attribute mismatches through console.error and then
    // keeps the server attribute, which is how the hash used to get lost.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      hydrateRoot(container, <ReturnLink href={`${href}#comment-1`} />)
    })

    const hydrationErrors = consoleError.mock.calls.map(([message]) =>
      String(message),
    )
    consoleError.mockRestore()
    expect(hydrationErrors).toEqual([])
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      '/project/ada/engine?comment=c1#comment-1',
    )
  })

  it('drops destinations that are not safe', () => {
    render(<ReturnLink href="/sign-in/sso-callback" />)

    expect(screen.getByTestId('sign-in').getAttribute('href')).toBe('none')
  })

  it('strips only the fragment', () => {
    expect(stripHash('/a?b=1#c')).toBe('/a?b=1')
    expect(stripHash('/a?b=1')).toBe('/a?b=1')
  })
})
