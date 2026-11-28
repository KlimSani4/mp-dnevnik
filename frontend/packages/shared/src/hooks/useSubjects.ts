import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from './useApi'
import type { SubjectDetail, SubjectMaterialInput, SubjectWorkInput } from '../types'

/** Список предметов группы за семестр (#165). semester: номер, 'all' или null — текущий */
export function useSubjectList(groupCode: string | null, semester: number | 'all' | null) {
  const api = useApi()
  return useQuery({
    queryKey: ['subjects', 'list', groupCode, semester],
    queryFn: () => api.subjects.list(groupCode!, semester),
    enabled: !!groupCode,
    placeholderData: (prev) => prev,
  })
}

export function useSubject(id: string | null, semester?: number | null) {
  const api = useApi()
  return useQuery({
    queryKey: ['subjects', 'detail', id, semester ?? null],
    queryFn: () => api.subjects.get(id!, semester),
    enabled: !!id,
  })
}

export type SubjectAction =
  | { type: 'addTags'; tags: string[] }
  | { type: 'removeTag'; key: string }
  | { type: 'addWork'; data: SubjectWorkInput }
  | { type: 'updateWork'; workId: string; data: Partial<SubjectWorkInput> }
  | { type: 'deleteWork'; workId: string }
  | { type: 'approveWork'; workId: string }
  | { type: 'progress'; workId: string; passed: boolean; points: number | null }
  | { type: 'addMaterial'; data: SubjectMaterialInput }
  | { type: 'updateMaterial'; materialId: string; data: Partial<SubjectMaterialInput> }
  | { type: 'deleteMaterial'; materialId: string }
  | { type: 'approveMaterial'; materialId: string }

/** Любое действие на странице предмета: ответ — свежая страница, кладём в кэш сразу. */
export function useSubjectAction(id: string, semester?: number | null) {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: SubjectAction): Promise<SubjectDetail> => {
      const s = api.subjects
      switch (a.type) {
        case 'addTags': return s.addTags(id, a.tags, semester)
        case 'removeTag': return s.removeTag(id, a.key, semester)
        case 'addWork': return s.addWork(id, a.data)
        case 'updateWork': return s.updateWork(a.workId, a.data)
        case 'deleteWork': return s.deleteWork(a.workId)
        case 'approveWork': return s.approveWork(a.workId)
        case 'progress': return s.setProgress(a.workId, a.passed, a.points)
        case 'addMaterial': return s.addMaterial(id, a.data)
        case 'updateMaterial': return s.updateMaterial(a.materialId, a.data)
        case 'deleteMaterial': return s.deleteMaterial(a.materialId)
        case 'approveMaterial': return s.approveMaterial(a.materialId)
      }
    },
    onSuccess: (detail) => {
      qc.setQueryData(['subjects', 'detail', id, semester ?? null], detail)
      qc.invalidateQueries({ queryKey: ['subjects', 'list'] })
    },
  })
}
