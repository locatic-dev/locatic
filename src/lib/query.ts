import { skipToken } from '@tanstack/react-query'

export function disabledQuery<TOptions extends { queryKey: unknown }>(
  options: TOptions,
) {
  return {
    ...options,
    queryFn: skipToken,
  }
}
