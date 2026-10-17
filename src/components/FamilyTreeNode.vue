<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import PersonCard from './PersonCard.vue'
import type { FamilyMember, FamilyUnit } from '../types/family'
import { spouseOrderLabel } from '../utils/spouses'

const props = withDefaults(
  defineProps<{
    unit: FamilyUnit
    childUnitsByUnitKey: Map<string, FamilyUnit[]>
    childUnitsResolver: (unitKey: string) => FamilyUnit[]
    memberNameById: (id?: string) => string | undefined
    memberById: (id?: string) => FamilyMember | undefined
    /** Parents of a married-in spouse (drawn at the same generation as this couple, next to it). */
    inLawParentsResolver?: (memberId: string) => FamilyUnit | undefined
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
// A person with several spouses (drawn Vợ 1 — HOST — Vợ 2 …)
const isMulti = computed(() => Boolean(props.unit.host) && members.value.length >= 3)
const hasCouple = computed(() => !isMulti.value && members.value.length === 2)
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
  // inPlace: the child is one of several spouses and stays in that row (no copy under the parents);
  // FamilyTree draws a dashed line from these parents down to them instead.
  const list: { unit: FamilyUnit; child: FamilyMember; inPlace: boolean }[] = []
  for (const childUnit of childUnits.value) {
    for (const member of childUnit.members) {
      const parents = resolver(member.id)
      if (parents) {
        list.push({ unit: parents, child: member, inPlace: Boolean(childUnit.host) })
      }
    }
  }
  return list
})

// ---- Several spouses ----
// Each spouse slot: its order label (Vợ 1, Vợ 2…) and how far it sits from the host (0 = next to them).
type SpouseSlot = { member: FamilyMember; label: string; level: number }
const spouseSlots = computed(() => {
  const host = props.unit.host
  const slots = new Map<string, SpouseSlot>()
  if (!host || !isMulti.value) return slots
  const hostIndex = members.value.findIndex((member) => member.id === host.id)
  ;(props.unit.spouses ?? []).forEach((spouse, index) => {
    const position = members.value.findIndex((member) => member.id === spouse.id)
    slots.set(spouse.id, {
      member: spouse,
      label: spouseOrderLabel(host, spouse, index + 1),
      level: Math.abs(position - hostIndex) - 1,
    })
  })
  return slots
})

// Children split by marriage: each spouse's children hang from that marriage's line
// (children with no matching spouse hang from the host). FamilyTree draws the connecting lines.
type ChildGroup = { key: string; a: string; b: string; level: number; units: FamilyUnit[] }
const childGroups = computed<ChildGroup[]>(() => {
  const host = props.unit.host
  if (!host || !isMulti.value) {
    return []
  }
  const bySpouse = new Map<string, FamilyUnit[]>((props.unit.spouses ?? []).map((spouse) => [spouse.id, []]))
  const hostOnly: FamilyUnit[] = []
  for (const childUnit of childUnits.value) {
    let spouseId: string | undefined
    for (const member of childUnit.members) {
      for (const parentId of [member.fatherId, member.motherId]) {
        if (parentId && bySpouse.has(parentId)) {
          spouseId = parentId
        }
      }
    }
    ;(spouseId ? bySpouse.get(spouseId) ?? hostOnly : hostOnly).push(childUnit)
  }

  // Left → right in the same order as the cards
  const groups: ChildGroup[] = []
  for (const member of members.value) {
    if (member.id === host.id) {
      if (hostOnly.length) groups.push({ key: 'host', a: host.id, b: host.id, level: 0, units: hostOnly })
      continue
    }
    const list = bySpouse.get(member.id)
    if (list?.length) {
      groups.push({ key: `spouse-${member.id}`, a: host.id, b: member.id, level: spouseSlots.value.get(member.id)?.level ?? 0, units: list })
    }
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
      <div v-if="isMulti" class="multi-row" :data-host="unit.host?.id">
        <template v-for="(member, index) in members" :key="member.id">
          <div v-if="index > 0" class="spouse-gap" aria-hidden="true"></div>
          <div
            class="spouse-slot"
            :class="{ 'is-host': member.id === unit.host?.id }"
            :data-spouse-id="member.id === unit.host?.id ? undefined : member.id"
            :data-spouse-level="spouseSlots.get(member.id)?.level"
            :data-spouse-label="spouseSlots.get(member.id)?.label"
            :aria-label="spouseSlots.get(member.id)?.label"
          >
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
          </div>
        </template>
      </div>

      <div v-else-if="hasCouple && !displacedSpouse" class="couple-row">
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
      </div>
      </div>

      <div v-if="inLawGuests.length > 0" class="inlaw-guests">
        <div
          v-for="guest in inLawGuests"
          :key="guest.unit.key"
          class="inlaw-guest"
          :data-inlaw-for="guest.child.id"
          :data-inlaw-spouse="guest.child.spouseId"
          :data-inlaw-inplace="guest.inPlace ? '' : undefined"
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
          <div v-if="!guest.inPlace" class="inlaw-child">
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
        :data-link-level="group.level"
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

/* ---- several spouses: Vợ 1 — HOST — Vợ 2 … (marriage lines are drawn by FamilyTree in SVG) ---- */
.multi-row {
  display: flex;
  align-items: center;
  /* room under the cards for the lines to the outer spouses */
  padding-bottom: 1.4rem;
}

.spouse-gap {
  width: 2.8rem;
  flex: 0 0 auto;
}

.spouse-slot {
  position: relative;
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

/* Bên ngoại / bên nội: a side family, drawn dashed and lighter so it isn't read as the main line */
.inlaw-cards .spouse-line {
  border-top: 2px dashed #b0794e;
}

.inlaw-cards :deep(.person-card) {
  border-style: dashed;
  border-color: #b0794e;
  opacity: 0.85;
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

  .spouse-gap {
    width: 1.6rem;
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
