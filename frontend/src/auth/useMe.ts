import { useQuery } from '@tanstack/react-query'
import { api, ApiError, type User } from '../api'

/** Current user, or null when logged out. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () =>
      api<User>('/auth/me').catch((e) => {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }),
    staleTime: Infinity,
  })
}

export function useMoney() {
  const currency = useMe().data?.currency ?? 'INR'
  const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency })
  return (v: string | number) => fmt.format(Number(v))
}
