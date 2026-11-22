import { useQuery } from '@tanstack/react-query'
import { api, queryClient, type HealthDay, type HealthProfile, type HealthToday } from '../api'

export const useHealthProfile = () => useQuery({ queryKey: ['health', 'profile'], queryFn: () => api<HealthProfile | null>('/wellness/profile') })

export const useHealthDays = (start: string, end: string, enabled = true) =>
  useQuery({ queryKey: ['health', 'days', start, end], queryFn: () => api<HealthDay[]>(`/wellness/days?start=${start}&end=${end}`), enabled })

export const useHealthToday = (day: string, enabled = true) =>
  useQuery({ queryKey: ['health', 'today', day], queryFn: () => api<HealthToday>(`/wellness/today?day=${day}`), enabled })

/** Anything logged changes targets, insights and trends: refetch them. `all` also refetches the profile (after editing it). */
export const refreshHealth = (all = false) =>
  queryClient.invalidateQueries({ queryKey: ['health'], predicate: all ? undefined : (q) => q.queryKey[1] !== 'profile' })
