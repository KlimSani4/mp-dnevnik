import { useEffect } from 'react'
import { useAuthStore } from '../stores/auth'
import { useMyGroups } from './useGroups'

export function useGroupContext() {
  const selectedGroupId = useAuthStore((s) => s.selectedGroupId)
  const selectedGroupCode = useAuthStore((s) => s.selectedGroupCode)
  const setSelectedGroup = useAuthStore((s) => s.setSelectedGroup)

  const { data: myGroups, isLoading } = useMyGroups()

  // Выбрать группу, если не выбрана или человек в ней больше не состоит (вышел или
  // сменил группу, #162) — иначе сайт показывал бы расписание чужой группы
  useEffect(() => {
    if (!myGroups) return
    const stillMember = myGroups.some((m) => m.group.id === selectedGroupId)
    if (stillMember) return
    if (myGroups.length) {
      const first = myGroups[0]
      setSelectedGroup(first.group.id, first.group.code)
    } else if (selectedGroupId) {
      useAuthStore.setState({ selectedGroupId: null, selectedGroupCode: null })
    }
  }, [myGroups, selectedGroupId, setSelectedGroup])

  return {
    groupId: selectedGroupId,
    groupCode: selectedGroupCode,
    isLoading: isLoading && !selectedGroupId,
  }
}
