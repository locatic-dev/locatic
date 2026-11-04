import { expect, test } from './fixtures/test'

test('keeps unsupported formats out of the public HTML cache', async ({
  request,
}) => {
  test.skip(
    !process.env.E2E_PRODUCTION_SERVER,
    'Requires a production Worker; the Vite development server disables caching.',
  )

  await expect
    .poll(async () => {
      const response = await request.get('/about', {
        headers: { accept: 'text/html' },
      })
      expect(response.status()).toBe(200)
      return response.headers()['x-locatic-cache']
    })
    .toMatch(/^(HIT|STALE)$/)

  for (const accept of ['application/json', 'text/markdown']) {
    const response = await request.get('/about', { headers: { accept } })
    expect(response.status(), accept).toBe(406)
    expect(response.headers()['x-locatic-cache'], accept).toBeUndefined()
    expect(await response.json()).toEqual({
      error: 'Only HTML requests are supported here',
    })
  }

  for (const accept of ['text/html', '*/*', 'text/html,*/*;q=0.8']) {
    const response = await request.get('/about', { headers: { accept } })
    expect(response.status(), accept).toBe(200)
    expect(response.headers()['content-type'], accept).toContain('text/html')
    expect(response.headers()['x-locatic-cache'], accept).toMatch(
      /^(HIT|STALE)$/,
    )
  }
})
