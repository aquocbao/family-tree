<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

const selectedUnit = computed((): FamilyUnit | undefined => {
  if (!selectedUnitKey.value) {
    return undefined
  }

  return units.value.unitMap.get(selectedUnitKey.value)
})

// Parent unit of the focused branch (the unit holding the father/mother of a member in the selected unit).
const selectedParentUnit = computed((): FamilyUnit | undefined => {
  const unit = selectedUnit.value
  if (!unit) {
    return undefined
  }

  for (const member of unit.members) {
    for (const parentId of [member.fatherId, member.motherId]) {
      if (!parentId) {
        continue
      }

      const parentUnitKey = units.value.memberToUnitKey.get(parentId)
      if (parentUnitKey && parentUnitKey !== unit.key) {
        const parentUnit = units.value.unitMap.get(parentUnitKey)
        if (parentUnit) {
          return parentUnit
        }
      }
    }
  }

  return undefined
})

const selectedRootUnits = computed(() => {
  const unit = selectedUnit.value
  if (!unit) {
    return rootUnits.value
  }

  return [selectedParentUnit.value ?? unit]
})

// In focus mode the parent node only shows the selected branch (not the siblings).
const resolveChildUnits = (unitKey: string): FamilyUnit[] => {
  const parentUnit = selectedParentUnit.value
  if (parentUnit && selectedUnit.value && unitKey === parentUnit.key) {
    return [selectedUnit.value]
  }

  return getChildUnits(unitKey)
}

const initialExpandDepth = computed(() => (selectedParentUnit.value ? 1 : 0))

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

// ---- Search by full name ----
const searchQuery = ref('')
const isSearchOpen = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)

const toggleSearch = async (): Promise<void> => {
  isSearchOpen.value = !isSearchOpen.value
  if (isSearchOpen.value) {
    await nextTick()
    searchInputRef.value?.focus()
  } else {
    searchQuery.value = ''
  }
}
const highlightedMemberId = ref<string | null>(null)
const expandRequest = ref<{ keys: Set<string>; nonce: number } | undefined>(undefined)
let highlightTimer: ReturnType<typeof setTimeout> | undefined

const normalizeName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const searchResults = computed(() => {
  const query = normalizeName(searchQuery.value)
  if (!query) {
    return []
  }

  return props.members
    .filter((member) => (props.canManage || !member.isHidden) && normalizeName(member.name).includes(query))
    .sort((left, right) => {
      const leftStarts = normalizeName(left.name).startsWith(query) ? 0 : 1
      const rightStarts = normalizeName(right.name).startsWith(query) ? 0 : 1
      return leftStarts - rightStarts || left.name.localeCompare(right.name, 'vi')
    })
    .slice(0, 30)
})

const describeSearchResult = (member: FamilyMember): string => {
  const parts: string[] = []
  const year = member.birthDate ? new Date(member.birthDate).getFullYear() : NaN
  if (!Number.isNaN(year)) {
    parts.push(`Sinh ${year}`)
  }

  const parentNames = [getMemberName(member.fatherId), getMemberName(member.motherId)].filter(Boolean)
  if (parentNames.length > 0) {
    parts.push(`Con của ${parentNames.join(' & ')}`)
  } else if (member.spouseId && getMemberName(member.spouseId)) {
    parts.push(`Vợ/Chồng: ${getMemberName(member.spouseId)}`)
  }

  return parts.join(' · ')
}

const parentUnitKeyByUnitKey = computed(() => {
  const map = new Map<string, string>()
  for (const [parentKey, childUnits] of childUnitsByUnitKey.value) {
    for (const childUnit of childUnits) {
      if (!map.has(childUnit.key)) {
        map.set(childUnit.key, parentKey)
      }
    }
  }

  return map
})

const goToMember = async (memberId: string): Promise<void> => {
  const unitKey = units.value.memberToUnitKey.get(memberId)
  if (!unitKey) {
    return
  }

  // Show the whole tree and open every ancestor of the target node.
  selectedUnitKey.value = null
  const keys = new Set<string>()
  const visited = new Set<string>()
  let currentKey: string | undefined = parentUnitKeyByUnitKey.value.get(unitKey)
  while (currentKey && !visited.has(currentKey)) {
    visited.add(currentKey)
    keys.add(currentKey)
    currentKey = parentUnitKeyByUnitKey.value.get(currentKey)
  }

  expandRequest.value = { keys, nonce: Date.now() }
  highlightedMemberId.value = memberId
  searchQuery.value = ''

  await nextTick()
  requestAnimationFrame(() => {
    const target = treeWrapperRef.value?.querySelector<HTMLElement>(`[data-member-id="${CSS.escape(memberId)}"]`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  })

  if (highlightTimer) {
    clearTimeout(highlightTimer)
  }
  highlightTimer = setTimeout(() => {
    highlightedMemberId.value = null
  }, 5000)
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
  if (highlightTimer) {
    clearTimeout(highlightTimer)
  }
})
</script>

<template>
  <section ref="treeWrapperRef" class="tree-wrapper" :class="{ 'full-view-active': isFullView }">
    <div class="view-controls">
      <div v-if="isSearchOpen" class="search-box">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="search"
          class="search-input"
          placeholder="Tìm theo họ tên..."
          aria-label="Tìm theo họ tên"
          @keydown.enter.prevent="searchResults[0] && goToMember(searchResults[0].id)"
          @keydown.esc="toggleSearch"
        />
        <ul v-if="searchQuery.trim()" class="search-results">
          <li v-if="searchResults.length === 0" class="search-empty">Không tìm thấy thành viên phù hợp.</li>
          <li v-for="member in searchResults" :key="member.id">
            <button type="button" class="search-result" @click="goToMember(member.id)">
              <span class="search-result-name">{{ member.name }}</span>
              <span v-if="describeSearchResult(member)" class="search-result-meta">
                {{ describeSearchResult(member) }}
              </span>
            </button>
          </li>
        </ul>
      </div>
      <div class="control-buttons">
        <button
          type="button"
          class="search-toggle-btn"
          :aria-expanded="isSearchOpen"
          @click="toggleSearch"
        >
          {{ isSearchOpen ? '✕ Đóng tìm kiếm' : '🔍 Tìm kiếm' }}
        </button>
        <button type="button" class="full-view-btn" @click="toggleFullView">
          {{ isFullView ? 'Thoát Full view' : 'Full view' }}
        </button>
      </div>
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
          :child-units-resolver="resolveChildUnits"
          :expand-depth="initialExpandDepth"
          :expand-request="expandRequest"
          :highlighted-member-id="highlightedMemberId"
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
  /* Scroll of rice paper framed in red lacquer with a gold inner line and cloud-motif corners */
  background:
    url('/gia-pha-cloud-corner.svg') no-repeat left 6px top 6px / 150px 150px,
    url('/gia-pha-cloud-corner-tr.svg') no-repeat right 6px top 6px / 150px 150px,
    url('/gia-pha-cloud-corner-bl.svg') no-repeat left 6px bottom 6px / 150px 150px,
    url('/gia-pha-cloud-corner-br.svg') no-repeat right 6px bottom 6px / 150px 150px,
    radial-gradient(ellipse at 50% 45%, rgba(255, 250, 236, 0.55) 0%, transparent 70%),
    url('/gia-pha-bg.svg') repeat 0 0 / 480px 480px,
    #f3e6c8;
  border: 10px solid #7a1d16;
  border-image: linear-gradient(160deg, #8f2419, #5c120d 50%, #8f2419) 1;
  padding: 1.75rem 2rem 2rem;
  overflow-x: auto;
  box-shadow:
    inset 0 0 0 2px #c9a24a,
    inset 0 0 0 5px #f3e6c8,
    inset 0 0 0 6px rgba(201, 162, 74, 0.7),
    inset 0 0 60px rgba(120, 70, 20, 0.18),
    0 14px 30px rgba(60, 25, 8, 0.28);
}


.view-controls {
  position: sticky;
  left: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.8rem;
}

.search-box {
  position: relative;
  flex: 1 1 260px;
  max-width: 420px;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #a77f48;
  border-radius: 8px;
  background: #fffaf0;
  color: #4a2e14;
  padding: 0.4rem 0.7rem;
  font: inherit;
}

.search-input:focus {
  outline: 2px solid #e0a020;
  outline-offset: 1px;
}

.search-results {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 320px;
  overflow-y: auto;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  background: #fffaf0;
  border: 1px solid #c7a979;
  border-radius: 10px;
  box-shadow: 0 8px 20px rgba(71, 45, 15, 0.18);
}

.search-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: transparent;
  padding: 0.45rem 0.6rem;
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.search-result:hover,
.search-result:focus-visible {
  background: #ffe9c3;
}

.search-result-name {
  font-weight: 700;
  color: #4a2e14;
}

.search-result-meta {
  font-size: 0.82rem;
  color: #7a5a35;
}

.search-empty {
  padding: 0.5rem 0.6rem;
  color: #7a5a35;
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
  overflow: auto;
}

.full-view-active .view-controls {
  top: 0;
  padding: 0.5rem 0;
  background: rgba(255, 248, 234, 0.92);
}

.control-buttons {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

.search-toggle-btn {
  border: 1px solid #a77f48;
  border-radius: 8px;
  background: #fff4df;
  color: #5c3818;
  font-weight: 700;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}

.search-toggle-btn:hover {
  background: #ffe9c3;
}
</style>
