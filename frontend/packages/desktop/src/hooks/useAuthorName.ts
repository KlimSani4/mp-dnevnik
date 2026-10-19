import { useMemo } from 'react'
import { useGroupContext, useGroupStudents } from '@nexora/shared'

/** Имя автора задания из участников текущей группы. null — неизвестен или ещё грузится. */
export function useAuthorName(authorId: string | null | undefined): string | null {
  const { groupCode } = useGroupContext()
  const { data: students } = useGroupStudents(groupCode ?? undefined)

  return useMemo(() => {
    if (!authorId) return null
    return students?.find((s) => s.user_id === authorId)?.user.display_name ?? null
  }, [students, authorId])
}
