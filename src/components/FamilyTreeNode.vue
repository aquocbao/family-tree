<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import PersonCard from './PersonCard.vue'
import type { FamilyMember, FamilyUnit } from '../types/family'

const props = withDefaults(
  defineProps<{
    unit: FamilyUnit
    childUnitsByUnitKey: Map<string, FamilyUnit[]>
    childUnitsResolver: (unitKey: string) => FamilyUnit[]
    memberNameById: (id?: string) => string | undefined
    memberById: (id?: string) => FamilyMember | undefined
    canManage?: boolean
    showBirthDate?: boolean
    showDeathDate?: boolean
    showSpouse?: boolean
    showViewDetail?: boolean
    depth?: number
    expandDepth?: number
    expandRequest?: { keys: Set<string>; nonce: number; collapse?: boolean }
    highlightedMemberId?: string | null
  }>(),
  {
    canManage: false,
    showBirthDate: true,
    showDeathDate: true,
    showSpouse: true,
    showViewDetail: true,
    depth: 0,
    expandDepth: 0,
    expandRequest: undefined,
    highlightedMemberId: null,
  },
)

const emit = defineEmits<{
  viewDetail: [id: string]
  edit: [id: string]
  delete: [id: string]
  toggleHidden: [id: string]
}>()

const members = computed(() => props.unit.members)
const hasCouple = computed(() => members.value.length === 2)
const spouseA = computed(() => members.value[0])
const spouseB = computed(() => members.value[1])
const childUnits = computed(() => props.childUnitsResolver(props.unit.key))
const hasChildren = computed(() => childUnits.value.length > 0)
const isExpanded = ref(props.depth <= props.expandDepth)

watch(
  () => props.expandRequest,
  (request) => {
    if (request?.collapse) {
      // "Thu gọn tất cả": back to the initial state
      isExpanded.value = props.depth <= props.expandDepth
      return
    }
    if (request?.keys.has(props.unit.key)) {
      isExpanded.value = true
    }
  },
  { immediate: true },
)

const unitContentRef = ref<HTMLElement | null>(null)

const toggleExpanded = async (): Promise<void> => {
  isExpanded.value = !isExpanded.value
  // Keep the node you just opened/closed in view (matters most on narrow phone screens).
  await nextTick()
  unitContentRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}
</script>

<template>
  <li class="node">
    <div ref="unitContentRef" class="unit-content">
      <div v-if="hasCouple" class="couple-row">
        <PersonCard
          :member="spouseA"
          :spouse-name="memberNameById(spouseA.spouseId)"
          :can-manage="canManage"
          :show-birth-date="showBirthDate"
          :show-death-date="showDeathDate"
          :show-spouse="showSpouse"
          :show-view-detail="showViewDetail"
          :highlighted="highlightedMemberId === spouseA.id"
          @view-detail="emit('viewDetail', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
          @toggle-hidden="emit('toggleHidden', $event)"
        />
        <div class="spouse-line" aria-hidden="true"></div>
        <PersonCard
          :member="spouseB"
          :spouse-name="memberNameById(spouseB.spouseId)"
          :can-manage="canManage"
          :show-birth-date="showBirthDate"
          :show-death-date="showDeathDate"
          :show-spouse="showSpouse"
          :show-view-detail="showViewDetail"
          :highlighted="highlightedMemberId === spouseB.id"
          @view-detail="emit('viewDetail', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
          @toggle-hidden="emit('toggleHidden', $event)"
        />
      </div>

      <div v-else class="single-row">
        <PersonCard
          :member="members[0]"
          :spouse-name="memberNameById(members[0].spouseId)"
          :can-manage="canManage"
          :show-birth-date="showBirthDate"
          :show-death-date="showDeathDate"
          :show-spouse="showSpouse"
          :show-view-detail="showViewDetail"
          :highlighted="highlightedMemberId === members[0].id"
          @view-detail="emit('viewDetail', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
          @toggle-hidden="emit('toggleHidden', $event)"
        />
      </div>

      <button
        v-if="hasChildren"
        class="toggle"
        type="button"
        :aria-expanded="isExpanded"
        @click="toggleExpanded"
      >
        {{ isExpanded ? 'Thu gọn' : 'Mở rộng' }}
      </button>
    </div>

    <ul v-if="hasChildren && isExpanded" class="children">
      <FamilyTreeNode
        v-for="childUnit in childUnits"
        :key="childUnit.key"
        :unit="childUnit"
        :child-units-by-unit-key="childUnitsByUnitKey"
        :child-units-resolver="childUnitsResolver"
        :member-name-by-id="memberNameById"
        :member-by-id="memberById"
        :can-manage="canManage"
        :show-birth-date="showBirthDate"
        :show-death-date="showDeathDate"
        :show-spouse="showSpouse"
        :show-view-detail="showViewDetail"
        :depth="depth + 1"
        :expand-depth="expandDepth"
        :expand-request="expandRequest"
        :highlighted-member-id="highlightedMemberId"
        @view-detail="emit('viewDetail', $event)"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
        @toggle-hidden="emit('toggleHidden', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 0.75rem 0.9rem;
}

.unit-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.single-row {
  display: flex;
  justify-content: center;
}

.couple-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.spouse-line {
  width: 30px;
  border-top: 2px solid #9b3a24;
}

.toggle {
  border: 1px solid #b8892f;
  border-radius: 999px;
  background: #fff8e6;
  color: #7a1d16;
  font-weight: 600;
  font-size: 0.85rem;
  padding: 0.2rem 0.8rem;
  cursor: pointer;
}

.toggle:hover {
  background: #fbe9bf;
}

.children {
  position: relative;
  list-style: none;
  margin: 0.8rem 0 0;
  padding: 1rem 0 0;
  display: flex;
  justify-content: center;
  gap: 0.8rem;
  border-top: 2px solid #a8553a;
}

.children::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 0;
  height: 1rem;
  border-left: 2px solid #a8553a;
  transform: translateX(-50%);
}

.children > .node {
  padding-top: 1rem;
}

.children > .node::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 0;
  height: 1rem;
  border-left: 2px solid #a8553a;
  transform: translateX(-50%);
}

@media (max-width: 640px) {
  .node {
    padding: 0 0.3rem 0.7rem;
  }

  .couple-row {
    gap: 0.3rem;
  }

  .spouse-line {
    width: 12px;
  }

  .children {
    gap: 0.35rem;
  }

  .toggle {
    font-size: 0.8rem;
    padding: 0.3rem 0.8rem;
  }
}
</style>
