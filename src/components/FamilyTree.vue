<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FamilyTreeNode from './FamilyTreeNode.vue'
import type { FamilyMember, FamilyUnit } from '../types/family'

const props = withDefaults(
  defineProps<{
    members: FamilyMember[]
    canManage?: boolean
    showBirthDate?: boolean
    showDeathDate?: boolean
    showSpouse?: boolean
    showViewDetail?: boolean
  }>(),
  {
    canManage: false,
    showBirthDate: true,
    showDeathDate: true,
    showSpouse: true,
    showViewDetail: true,
  },
)

const emit = defineEmits<{
  editMember: [id: string]
  deleteMember: [id: string]
  toggleMemberHidden: [id: string]
}>()

const selectedUnitKey = ref<string | null>(null)
const treeWrapperRef = ref<HTMLElement | null>(null)
const isFullView = ref(false)
const fullViewError = ref('')

const memberMap = computed(() => {
  return new Map(props.members.map((member) => [member.id, member]))
})

const getPositionValue = (position?: number): number => {
  if (typeof position !== 'number' || !Number.isFinite(position) || position < 0) {
    return Number.MAX_SAFE_INTEGER
  }

  return position
}

const getBirthTimestamp = (birthDate?: string): number => {
  if (!birthDate) {
    return Number.MAX_SAFE_INTEGER
  }

  const time = new Date(birthDate).getTime()
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time
}

const compareMembersLeftToRight = (left: FamilyMember, right: FamilyMember): number => {
  const leftPosition = getPositionValue(left.position)
  const rightPosition = getPositionValue(right.position)
  if (leftPosition !== rightPosition) {
    return leftPosition - rightPosition
  }

  const leftBirth = getBirthTimestamp(left.birthDate)
  const rightBirth = getBirthTimestamp(right.birthDate)
  if (leftBirth !== rightBirth) {
    return leftBirth - rightBirth
  }

  return left.id.localeCompare(right.id)
}

const isMutualSpouse = (member: FamilyMember, spouse: FamilyMember): boolean => {
  return member.spouseId === spouse.id && spouse.spouseId === member.id
}

const orderSpousePairLeftToRight = (
  member: FamilyMember,
  spouse: FamilyMember,
): [FamilyMember, FamilyMember] => {
  if (member.spouseOnRight && !spouse.spouseOnRight) {
    return [spouse, member]
  }

  if (spouse.spouseOnRight && !member.spouseOnRight) {
    return [member, spouse]
  }

  if (member.gender === 'male' && spouse.gender !== 'male') {
    return [member, spouse]
  }

  if (spouse.gender === 'male' && member.gender !== 'male') {
    return [spouse, member]
  }

  const memberBirth = getBirthTimestamp(member.birthDate)
  const spouseBirth = getBirthTimestamp(spouse.birthDate)
  if (memberBirth !== spouseBirth) {
    return memberBirth <= spouseBirth ? [member, spouse] : [spouse, member]
  }

  return member.id <= spouse.id ? [member, spouse] : [spouse, member]
}

const compareUnitsLeftToRight = (left: FamilyUnit, right: FamilyUnit): number => {
  const getUnitPosition = (unit: FamilyUnit): number =>
    Math.min(...unit.members.map((member) => getPositionValue(member.position)))
  const getUnitBirth = (unit: FamilyUnit): number =>
    Math.min(...unit.members.map((member) => getBirthTimestamp(member.birthDate)))

  const leftPosition = getUnitPosition(left)
  const rightPosition = getUnitPosition(right)
  if (leftPosition !== rightPosition) {
    return leftPosition - rightPosition
  }

  const leftBirth = getUnitBirth(left)
  const rightBirth = getUnitBirth(right)
  if (leftBirth !== rightBirth) {
    return leftBirth - rightBirth
  }

  return left.key.localeCompare(right.key)
}

const units = computed(() => {
  const map = new Map<string, FamilyUnit>()
  const memberToUnitKey = new Map<string, string>()
  const orderedMembers = [...props.members].sort(compareMembersLeftToRight)

  for (const member of orderedMembers) {
    if (memberToUnitKey.has(member.id)) {
      continue
    }

    const spouse = member.spouseId ? memberMap.value.get(member.spouseId) : undefined
    if (spouse && !memberToUnitKey.has(spouse.id) && isMutualSpouse(member, spouse)) {
      const pair = orderSpousePairLeftToRight(member, spouse)
      const keyParts = [member.id, spouse.id].sort((left, right) => left.localeCompare(right))
      const key = `pair:${keyParts[0]}|${keyParts[1]}`
      map.set(key, { key, members: pair })
      memberToUnitKey.set(pair[0].id, key)
      memberToUnitKey.set(pair[1].id, key)
      continue
    }

    const key = `single:${member.id}`
    map.set(key, { key, members: [member] })
    memberToUnitKey.set(member.id, key)
  }

  return {
    unitMap: map,
    memberToUnitKey,
  }
})

const childUnitsByUnitKey = computed(() => {
  const map = new Map<string, FamilyUnit[]>()

  for (const unit of units.value.unitMap.values()) {
    const parentIds = new Set(unit.members.map((member) => member.id))
    const children = props.members
      .filter((member) => {
        return (
          (member.fatherId ? parentIds.has(member.fatherId) : false) ||
          (member.motherId ? parentIds.has(member.motherId) : false)
        )
      })
      .sort(compareMembersLeftToRight)

    const addedChildUnitKeys = new Set<string>()
    const childUnits: FamilyUnit[] = []

    for (const child of children) {
      const childUnitKey = units.value.memberToUnitKey.get(child.id)
      if (!childUnitKey || addedChildUnitKeys.has(childUnitKey)) {
        continue
      }

      const childUnit = units.value.unitMap.get(childUnitKey)
      if (!childUnit) {
        continue
      }

      childUnits.push(childUnit)
      addedChildUnitKeys.add(childUnitKey)
    }

    map.set(unit.key, childUnits)
  }

  return map
})

const rootUnits = computed(() => {
  const allUnitKeys = new Set(units.value.unitMap.keys())
  const childUnitKeys = new Set<string>()

  for (const childUnits of childUnitsByUnitKey.value.values()) {
    for (const childUnit of childUnits) {
      childUnitKeys.add(childUnit.key)
    }
  }

  const rootUnitList: FamilyUnit[] = []

  for (const unitKey of allUnitKeys) {
    if (childUnitKeys.has(unitKey)) {
      continue
    }

    const unit = units.value.unitMap.get(unitKey)
    if (unit) {
      rootUnitList.push(unit)
    }
  }

  return rootUnitList.sort(compareUnitsLeftToRight)
})

const getMemberName = (id?: string): string | undefined => {
  if (!id) {
    return undefined
  }

  return memberMap.value.get(id)?.name
}

const getMemberById = (id?: string): FamilyMember | undefined => {
  if (!id) {
    return undefined
  }

  return memberMap.value.get(id)
}

const getChildUnits = (unitKey: string): FamilyUnit[] => {
  return childUnitsByUnitKey.value.get(unitKey) ?? []
}

const selectedRootUnits = computed(() => {
  if (!selectedUnitKey.value) {
    return rootUnits.value
  }

  const selectedUnit = units.value.unitMap.get(selectedUnitKey.value)
  if (!selectedUnit) {
    return rootUnits.value
  }

  return [selectedUnit]
})

const selectedRootLabel = computed(() => {
  if (!selectedUnitKey.value) {
    return ''
  }

  const selectedUnit = units.value.unitMap.get(selectedUnitKey.value)
  if (!selectedUnit) {
    return ''
  }

  return selectedUnit.members.map((member) => member.name).join(' & ')
})

const focusFromMember = (memberId: string): void => {
  const unitKey = units.value.memberToUnitKey.get(memberId)
  if (!unitKey) {
    return
  }

  selectedUnitKey.value = unitKey
}

const clearFocusedTree = (): void => {
  selectedUnitKey.value = null
}

const syncFullViewState = (): void => {
  const wrapper = treeWrapperRef.value
  if (!wrapper) {
    isFullView.value = false
    return
  }

  isFullView.value = document.fullscreenElement === wrapper
}

const toggleFullView = async (): Promise<void> => {
  const wrapper = treeWrapperRef.value
  if (!wrapper) {
    fullViewError.value = 'Không tìm thấy vùng cây để bật chế độ toàn màn hình.'
    return
  }

  fullViewError.value = ''

  if (!document.fullscreenEnabled || !wrapper.requestFullscreen) {
    fullViewError.value = 'Trình duyệt không hỗ trợ chế độ toàn màn hình.'
    return
  }

  try {
    if (document.fullscreenElement === wrapper) {
      await document.exitFullscreen()
      return
    }

    await wrapper.requestFullscreen()
  } catch (error) {
    fullViewError.value =
      error instanceof Error ? error.message : 'Không thể chuyển chế độ toàn màn hình.'
  }
}

watch(
  () => units.value.unitMap,
  (currentUnitMap) => {
    if (selectedUnitKey.value && !currentUnitMap.has(selectedUnitKey.value)) {
      selectedUnitKey.value = null
    }
  },
)

onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullViewState)
  syncFullViewState()
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullViewState)
})
</script>

<template>
  <section ref="treeWrapperRef" class="tree-wrapper" :class="{ 'full-view-active': isFullView }">
    <div class="view-controls">
      <button type="button" class="full-view-btn" @click="toggleFullView">
        {{ isFullView ? 'Thoát Full view' : 'Full view' }}
      </button>
    </div>

    <p v-if="fullViewError" class="full-view-error">{{ fullViewError }}</p>

    <div v-if="selectedUnitKey" class="detail-toolbar">
      <p>
        Đang xem chi tiết nhánh của:
        <strong>{{ selectedRootLabel }}</strong>
      </p>
      <button type="button" @click="clearFocusedTree">Xem toàn bộ cây</button>
    </div>

    <div class="tree-canvas">
      <ul class="tree-root">
        <FamilyTreeNode
          v-for="unit in selectedRootUnits"
          :key="unit.key"
          :unit="unit"
          :child-units-by-unit-key="childUnitsByUnitKey"
          :child-units-resolver="getChildUnits"
          :member-name-by-id="getMemberName"
          :member-by-id="getMemberById"
          :can-manage="canManage"
          :show-birth-date="showBirthDate"
          :show-death-date="showDeathDate"
          :show-spouse="showSpouse"
          :show-view-detail="showViewDetail"
          @view-detail="focusFromMember"
          @edit="emit('editMember', $event)"
          @delete="emit('deleteMember', $event)"
          @toggle-hidden="emit('toggleMemberHidden', $event)"
        />
      </ul>
    </div>
  </section>
</template>

<style scoped>
.tree-wrapper {
  position: relative;
  background:
    linear-gradient(rgba(255, 248, 234, 0.6), rgba(255, 245, 223, 0.6)),
    url('/gia-pha-bg.svg');
  background-size: cover;
  background-position: center;
  border: 1px solid #c7a979;
  border-radius: 16px;
  padding: 1rem;
  overflow-x: auto;
  box-shadow:
    inset 0 0 0 2px rgba(139, 94, 45, 0.25),
    0 8px 24px rgba(71, 45, 15, 0.12);
}

.view-controls {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.8rem;
}

.full-view-btn {
  border: 1px solid #a77f48;
  border-radius: 8px;
  background: #fff4df;
  color: #5c3818;
  font-weight: 700;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}

.full-view-btn:hover {
  background: #ffe9c3;
}

.full-view-error {
  margin: 0 0 0.6rem;
  color: #8f1d1d;
  font-weight: 600;
}

.tree-root {
  margin: 0;
  width: max-content;
  padding: 0;
  list-style: none;
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.tree-canvas {
  width: max-content;
  min-width: 100%;
  margin: 0 auto;
}

.detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0 0 0.9rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid #c8a66e;
  border-radius: 10px;
  background: rgba(255, 247, 232, 0.8);
}

.detail-toolbar p {
  margin: 0;
  color: #5f3a1a;
}

.detail-toolbar button {
  border: 1px solid #a77f48;
  border-radius: 8px;
  background: #fff4df;
  color: #5c3818;
  font-weight: 600;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}

.detail-toolbar button:hover {
  background: #ffe9c3;
}

.full-view-active {
  border-radius: 0;
}
</style>
