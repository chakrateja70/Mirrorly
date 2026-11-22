import { useQuery } from '@tanstack/react-query'
import { api, queryClient, type Iou } from '../api'

export const useIous = () => useQuery({ queryKey: ['ious'], queryFn: () => api<Iou[]>('/ious') })
export const refreshIous = () => queryClient.invalidateQueries({ queryKey: ['ious'] })
