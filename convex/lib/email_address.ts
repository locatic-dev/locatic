export function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase()
}

export function isUsableEmailAddress(email: string) {
  const normalized = normalizeEmailAddress(email)
  return (
    normalized.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) &&
    !normalized.endsWith('.invalid')
  )
}
