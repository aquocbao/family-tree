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
    /** Parents of a married-in spouse (drawn at the same generation as this couple, next to it). */
    inLawParentsResolver?: (memberId: string) => FamilyUnit | undefined
    /** Former spouses (divorced) drawn in this person's row */
    formerSpousesResolver?: (memberId: string) => FamilyMember[]
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
// The other family of a married child (e.g. the bride's parents): drawn on this row, next to this couple,
// so both sets of parents sit at the same level. FamilyTree draws a dashed link down to their child.
const inLawGuests = computed(() => {
  const resolver = props.inLawParentsResolver
  if (!resolver) {
    return []
  }
  const list: { unit: FamilyUnit; child: FamilyMember }[] = []
  for (const childUnit of childUnits.value) {
    for (const member of childUnit.members) {
      const parents = resolver(member.id)
      if (parents) {
        list.push({ unit: parents, child: member })
      }
    }
  }
  return list
})

// ---- Former spouses (ly hôn) ----
// Couple: spouse A's former spouses on the left of A, spouse B's on the right of B. Single: on the right.
const exesLeft = computed(() =>
  hasCouple.value && !displacedSpouse.value ? props.formerSpousesResolver?.(spouseA.value.id) ?? [] : [],
)
const exesRight = computed(() => {
  if (hasCouple.value && !displacedSpouse.value) {
    return props.formerSpousesResolver?.(spouseB.value.id) ?? []
  }
  return props.formerSpousesResolver?.(soloMember.value.id) ?? []
})

// Children split by marriage: each former marriage's children hang from its "ly hôn" line,
// the current couple's children from the couple. FamilyTree draws the connecting lines.
type ChildGroup = { key: string; a: string; b: string; units: FamilyUnit[] }
const childGroups = computed<ChildGroup[]>(() => {
  const left = exesLeft.value
  const right = exesRight.value
  if (left.length === 0 && right.length === 0) {
    return []
  }
  const byEx = new Map<string, FamilyUnit[]>([...left, ...right].map((ex) => [ex.id, []]))
  const main: FamilyUnit[] = []
  for (const childUnit of childUnits.value) {
    let exId: string | undefined
    for (const member of childUnit.members) {
      for (const parentId of [member.fatherId, member.motherId]) {
        if (parentId && byEx.has(parentId)) {
          exId = parentId
        }
      }
    }
    ;(exId ? byEx.get(exId) ?? main : main).push(childUnit)
  }

  const couple = hasCouple.value && !displacedSpouse.value
  const leftHost = couple ? spouseA.value.id : soloMember.value.id
  const rightHost = couple ? spouseB.value.id : soloMember.value.id
  const groups: ChildGroup[] = []
  for (const ex of left) {
    if (byEx.get(ex.id)?.length) groups.push({ key: `ex-${ex.id}`, a: leftHost, b: ex.id, units: byEx.get(ex.id) ?? [] })
  }
  if (main.length) {
    groups.push({
      key: 'main',
      a: couple ? spouseA.value.id : soloMember.value.id,
      b: couple ? spouseB.value.id : soloMember.value.id,
      units: main,
    })
  }
  for (const ex of right) {
    if (byEx.get(ex.id)?.length) groups.push({ key: `ex-${ex.id}`, a: rightHost, b: ex.id, units: byEx.get(ex.id) ?? [] })
  }
  return groups
})

const inLawSide = (child: FamilyMember): string => (child.gender === 'male' ? 'Bên nội' : 'Bên ngoại')

// In a couple, the spouse whose own parents are in the tree is drawn under those parents (see inLawGuests of
// the parent row), not next to their partner. This node then shows only the partner.
// A top node (depth 0, e.g. the parent row in "Xem chi tiết") has no parent row above it, so both stay together.
const displacedSpouse = computed(() =>
  hasCouple.value && props.depth > 0
    ? members.value.find((member) => props.inLawParentsResolver?.(member.id))
    : undefined,
)
const soloMember = computed(() =>
  displacedSpouse.value ? members.value.find((member) => member.id !== displacedSpouse.value?.id) ?? members.value[0] : members.value[0],
)
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
  <li class="node" :data-depth="depth">
    <div ref="unitContentRef" class="unit-content">
      <div class="unit-row" :class="{ 'has-guests': inLawGuests.length > 0 }">
      <div class="unit-main">
      <div v-if="hasCouple && !displacedSpouse" class="couple-row">
        <template v-for="ex in exesLeft" :key="ex.id">
          <PersonCard
            :member="ex"
            :spouse-name="memberNameById(ex.spouseId)"
            :can-manage="canManage"
            :show-birth-date="showBirthDate"
            :show-death-date="showDeathDate"
            :show-spouse="showSpouse"
            :show-view-detail="showViewDetail"
            :highlighted="highlightedMemberId === ex.id"
            @view-detail="emit('viewDetail', $event)"
            @edit="emit('edit', $event)"
            @delete="emit('delete', $event)"
            @toggle-hidden="emit('toggleHidden', $event)"
          />
          <div class="ex-line" aria-label="Đã ly hôn"><span>ly hôn</span></div>
        </template>
        <PersonCard
          class="couple-a"
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
          class="couple-b"
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
        <template v-for="ex in exesRight" :key="ex.id">
          <div class="ex-line" aria-label="Đã ly hôn"><span>ly hôn</span></div>
          <PersonCard
            :member="ex"
            :spouse-name="memberNameById(ex.spouseId)"
            :can-manage="canManage"
            :show-birth-date="showBirthDate"
            :show-death-date="showDeathDate"
            :show-spouse="showSpouse"
            :show-view-detail="showViewDetail"
            :highlighted="highlightedMemberId === ex.id"
            @view-detail="emit('viewDetail', $event)"
            @edit="emit('edit', $event)"
            @delete="emit('delete', $event)"
            @toggle-hidden="emit('toggleHidden', $event)"
          />
        </template>
      </div>

      <div v-else class="single-row">
        <PersonCard
          :member="soloMember"
          :spouse-name="memberNameById(soloMember.spouseId)"
          :can-manage="canManage"
          :show-birth-date="showBirthDate"
          :show-death-date="showDeathDate"
          :show-spouse="showSpouse"
          :show-view-detail="showViewDetail"
          :highlighted="highlightedMemberId === soloMember.id"
          @view-detail="emit('viewDetail', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
          @toggle-hidden="emit('toggleHidden', $event)"
        />
        <template v-for="ex in exesRight" :key="ex.id">
          <div class="ex-line" aria-label="Đã ly hôn"><span>ly hôn</span></div>
          <PersonCard
            :member="ex"
            :spouse-name="memberNameById(ex.spouseId)"
            :can-manage="canManage"
            :show-birth-date="showBirthDate"
            :show-death-date="showDeathDate"
            :show-spouse="showSpouse"
            :show-view-detail="showViewDetail"
            :highlighted="highlightedMemberId === ex.id"
            @view-detail="emit('viewDetail', $event)"
            @edit="emit('edit', $event)"
            @delete="emit('delete', $event)"
            @toggle-hidden="emit('toggleHidden', $event)"
          />
        </template>
      </div>
      </div>

      <div v-if="inLawGuests.length > 0" class="inlaw-guests">
        <div
          v-for="guest in inLawGuests"
          :key="guest.unit.key"
          class="inlaw-guest"
          :data-inlaw-for="guest.child.id"
          :data-inlaw-spouse="guest.child.spouseId"
        >
          <span class="inlaw-tag">{{ inLawSide(guest.child) }} · Cha mẹ của {{ guest.child.name }}</span>
          <div class="inlaw-cards">
            <template v-for="(member, index) in guest.unit.members" :key="member.id">
              <div v-if="index > 0" class="spouse-line" aria-hidden="true"></div>
              <PersonCard
                :member="member"
                :spouse-name="memberNameById(member.spouseId)"
                :can-manage="canManage"
                :show-birth-date="showBirthDate"
                :show-death-date="showDeathDate"
                :show-spouse="showSpouse"
                :show-view-detail="showViewDetail"
                :highlighted="highlightedMemberId === member.id"
                @view-detail="emit('viewDetail', $event)"
                @edit="emit('edit', $event)"
                @delete="emit('delete', $event)"
                @toggle-hidden="emit('toggleHidden', $event)"
              />
            </template>
          </div>
          <!-- The married-in child, placed under their own parents and level with their partner (FamilyTree positions it) -->
          <div class="inlaw-child">
            <PersonCard
              :member="guest.child"
              :spouse-name="memberNameById(guest.child.spouseId)"
              :can-manage="canManage"
              :show-birth-date="showBirthDate"
              :show-death-date="showDeathDate"
              :show-spouse="showSpouse"
              :show-view-detail="showViewDetail"
              :highlighted="highlightedMemberId === guest.child.id"
              @view-detail="emit('viewDetail', $event)"
              @edit="emit('edit', $event)"
              @delete="emit('delete', $event)"
              @toggle-hidden="emit('toggleHidden', $event)"
            />
          </div>
        </div>
      </div>
      </div>

      <button
        v-if="hasChildren"
        class="toggle"
        :data-couple-toggle="displacedSpouse ? soloMember.id : undefined"
        type="button"
        :aria-expanded="isExpanded"
        @click="toggleExpanded"
      >
        {{ isExpanded ? 'Thu gọn' : 'Mở rộng' }}
      </button>
    </div>

    <ul
      v-if="hasChildren && isExpanded && childGroups.length === 0"
      class="children"
      :data-couple-children="displacedSpouse ? soloMember.id : undefined"
    >
      <FamilyTreeNode
        v-for="childUnit in childUnits"
        :key="childUnit.key"
        :unit="childUnit"
        :child-units-by-unit-key="childUnitsByUnitKey"
        :child-units-resolver="childUnitsResolver"
        :member-name-by-id="memberNameById"
        :member-by-id="memberById"
        :in-law-parents-resolver="inLawParentsResolver"
        :former-spouses-resolver="formerSpousesResolver"
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
    <div v-else-if="hasChildren && isExpanded" class="children-groups">
      <ul
        v-for="group in childGroups"
        :key="group.key"
        class="children"
        data-group-stem
        :data-link-a="group.a"
        :data-link-b="group.b"
      >
        <FamilyTreeNode
          v-for="childUnit in group.units"
          :key="childUnit.key"
          :unit="childUnit"
          :child-units-by-unit-key="childUnitsByUnitKey"
          :child-units-resolver="childUnitsResolver"
          :member-name-by-id="memberNameById"
          :member-by-id="memberById"
          :in-law-parents-resolver="inLawParentsResolver"
          :former-spouses-resolver="formerSpousesResolver"
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
    </div>
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

/* Moved sideways by FamilyTree so a split couple's children hang from the middle of the marriage line */
[data-couple-toggle] {
  position: relative;
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
  border-top: 2px solid #9b3a24;
}

/* FamilyTree draws this connector as one SVG line instead (see data-svg-stem) */
.children[data-svg-stem]::before,
.children[data-svg-stem] > .node::before {
  display: none;
}

/* ---- divorce ---- */
.ex-line {
  position: relative;
  width: 3.4rem;
  border-top: 2px dashed #9b3a24;
}

.ex-line span {
  position: absolute;
  left: 50%;
  bottom: 0.25rem;
  transform: translateX(-50%);
  font-size: 0.68rem;
  font-style: italic;
  color: #8a5a2b;
  white-space: nowrap;
}

.single-row {
  align-items: center;
  gap: 0.55rem;
}

/* children of each marriage side by side; FamilyTree draws the lines from each marriage down to its group */
.children-groups {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 2.5rem;
  margin-top: 0.8rem;
}

.children-groups > .children {
  margin-top: 0;
}

.children[data-group-stem]::before {
  display: none;
}

/* a single child hangs on a straight vertical line: no horizontal bar */
.children:has(> .node:only-child) {
  border-top-color: transparent;
}

.children::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 0;
  height: 1rem;
  border-left: 2px solid #9b3a24;
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
  border-left: 2px solid #9b3a24;
  transform: translateX(-50%);
}

/* Row = this couple, plus (optionally) a child-in-law's parents on the right at the same level.
   1fr | couple | 1fr keeps the couple centred over its children. */
.unit-row {
  display: flex;
  justify-content: center;
}

.unit-row.has-guests {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
}

.unit-row.has-guests .unit-main {
  grid-column: 2;
}

.inlaw-guests {
  grid-column: 3;
  justify-self: start;
  display: flex;
  gap: 1.5rem;
  margin-left: 3rem;
}

.inlaw-guest {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* small caption above the left person, outside the flow so the cards line up with the other parents */
.inlaw-tag {
  position: absolute;
  left: 0.2rem;
  bottom: calc(100% + 0.2rem);
  font-size: 0.74rem;
  font-style: italic;
  font-weight: 600;
  color: #8a5a2b;
  white-space: nowrap;
}

.inlaw-cards {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

/* Out of the normal flow: FamilyTree sets "top" so this card sits level with the partner it married */
.inlaw-child {
  position: absolute;
  left: 0;
  top: calc(100% + 2.5rem);
  visibility: hidden;
  z-index: 1;
}

.inlaw-child.is-placed {
  visibility: visible;
}

@media (max-width: 640px) {
  .inlaw-guests {
    margin-left: 1rem;
  }

  .ex-line {
    width: 2.2rem;
  }

  .children-groups {
    gap: 1.2rem;
  }

  .inlaw-cards {
    gap: 0.3rem;
  }

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
