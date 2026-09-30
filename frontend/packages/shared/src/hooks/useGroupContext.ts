import { useEffect } from 'react'
import { useAuthStore } from '../stores/auth'
import { useMyGroups } from './useGroups'

export function useGroupContext() {
  const selectedGroupId = useAuthStore((s) => s.selectedGroupId)
  const selectedGroupCode = useAuthStore((s) => s.selectedGroupCode)
  const setSelectedGroup = useAuthStore((s) => s.setSelectedGroup)

  const { data: myGroups, isLoading } = useMyGroups()

  // Auto-select first group if none selected
  useEffect(() => {
    if (!selectedGroupId && myGroups?.length) {
      const first = myGroups[0]
      setSelectedGroup(first.group.id, first.group.code)
    }
  }, [myGroups, selectedGroupId, setSelectedGroup])

  return {
    groupId: selectedGroupId,
    groupCode: selectedGroupCode,
    isLoading: isLoading && !selectedGroupId,
  }
}
