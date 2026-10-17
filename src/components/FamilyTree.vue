<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import AnniversaryBar from './AnniversaryBar.vue'
import FamilyTreeNode from './FamilyTreeNode.vue'
import type { FamilyMember, FamilyUnit } from '../types/family'
import type { LunarEvent } from '../utils/lunar-events'

const props = withDefaults(
  defineProps<{
    members: FamilyMember[]
    canManage?: boolean
    showBirthDate?: boolean
    showDeathDate?: boolean
    showSpouse?: boolean
    showViewDetail?: boolean
    /** Notification bar window in months (0 = hidden). */
    notificationMonths?: number
    lunarEvents?: LunarEvent[]
    showMemorialPlace?: boolean
  }>(),
  {
    notificationMonths: 3,
    showMemorialPlace: true,
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
// iPhone Safari has no Fullscreen API for normal elements: fall back to a fixed overlay.
const isPseudoFullView = ref(false)
const zoom = ref(1)
const ZOOM_MIN = 0.4
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1
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

// ---- Divorce: former spouses ----
// A former spouse (formerSpouseId, set on either person) is drawn in the row of the person they were married
// to — the "host" — joined by a dashed "ly hôn" line, with their children hanging from that line.
// Host = the one whose parents are in the tree (the blood member); if neither/both, the man.
const formerSpouseLinks = computed(() => {
  const hasParentsInTree = (member: FamilyMember): boolean =>
    Boolean((member.fatherId && memberMap.value.has(member.fatherId)) || (member.motherId && memberMap.value.has(member.motherId)))
  const isInMutualPair = (member: FamilyMember): boolean => {
    const spouse = member.spouseId ? memberMap.value.get(member.spouseId) : undefined
    return Boolean(spouse && isMutualSpouse(member, spouse))
  }

  const hostOf = new Map<string, string>() // former spouse id → host id
  const exesOf = new Map<string, FamilyMember[]>() // host id → former spouses drawn in their row
  const seenPairs = new Set<string>()

  for (const member of props.members) {
    const other = member.formerSpouseId ? memberMap.value.get(member.formerSpouseId) : undefined
    if (!other || other.id === member.id) {
      continue
    }
    const pairKey = [member.id, other.id].sort().join('|')
    if (seenPairs.has(pairKey)) {
      continue
    }
    seenPairs.add(pairKey)

    const memberBlood = hasParentsInTree(member)
    const otherBlood = hasParentsInTree(other)
    let host = member
    let ex = other
    if (memberBlood !== otherBlood) {
      host = memberBlood ? member : other
      ex = memberBlood ? other : member
    } else if (other.gender === 'male' && member.gender !== 'male') {
      host = other
      ex = member
    }

    // The former spouse can only be moved into the host's row when they don't belong elsewhere
    // (no parents in the tree, not currently married to someone, not already placed with another host).
    if (hasParentsInTree(ex) || isInMutualPair(ex) || hostOf.has(ex.id) || hostOf.has(host.id)) {
      continue
    }
    hostOf.set(ex.id, host.id)
    exesOf.set(host.id, [...(exesOf.get(host.id) ?? []), ex])
  }

  return { hostOf, exesOf }
})

const getFormerSpouses = (hostId: string): FamilyMember[] => formerSpouseLinks.value.exesOf.get(hostId) ?? []

const units = computed(() => {
  const map = new Map<string, FamilyUnit>()
  const memberToUnitKey = new Map<string, string>()
  const orderedMembers = [...props.members].sort(compareMembersLeftToRight)
  const { hostOf } = formerSpouseLinks.value

  for (const member of orderedMembers) {
    if (memberToUnitKey.has(member.id) || hostOf.has(member.id)) {
      continue // former spouses are placed with their host below
    }

    const spouse = member.spouseId ? memberMap.value.get(member.spouseId) : undefined
    if (spouse && !memberToUnitKey.has(spouse.id) && !hostOf.has(spouse.id) && isMutualSpouse(member, spouse)) {
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

  // A former spouse belongs to their host's unit (so their children hang from the host's family)
  for (const [exId, hostId] of hostOf) {
    const hostKey = memberToUnitKey.get(hostId)
    if (hostKey) {
      memberToUnitKey.set(exId, hostKey)
    }
  }

  return {
    unitMap: map,
    memberToUnitKey,
  }
})

// Where each family unit hangs in the tree.
// A couple can have parents on both sides (the husband's and the wife's). Following the paternal line of a
// gia phả, the couple is drawn under the husband's parents (primary); the other spouse's parents are shown
// above that spouse's card as "bên ngoại/bên nội" instead of starting a separate tree.
const unitParentLinks = computed(() => {
  const primary = new Map<string, { parentKey: string; owner: FamilyMember }>()
  const inLawByMemberId = new Map<string, FamilyUnit>()

  for (const unit of units.value.unitMap.values()) {
    const candidates: { owner: FamilyMember; parentKey: string }[] = []
    for (const member of unit.members) {
      const seen = new Set<string>()
      for (const parentId of [member.fatherId, member.motherId]) {
        const parentKey = parentId ? units.value.memberToUnitKey.get(parentId) : undefined
        if (parentKey && parentKey !== unit.key && !seen.has(parentKey)) {
          seen.add(parentKey)
          candidates.push({ owner: member, parentKey })
        }
      }
    }

    if (candidates.length === 0) {
      continue
    }

    const chosen = candidates.find((candidate) => candidate.owner.gender === 'male') ?? candidates[0]
    primary.set(unit.key, chosen)

    for (const candidate of candidates) {
      if (candidate.owner.id === chosen.owner.id || inLawByMemberId.has(candidate.owner.id)) {
        continue
      }
      const parentUnit = units.value.unitMap.get(candidate.parentKey)
      if (parentUnit) {
        inLawByMemberId.set(candidate.owner.id, parentUnit)
      }
    }
  }

  return { primary, inLawByMemberId }
})

const childUnitsByUnitKey = computed(() => {
  const map = new Map<string, FamilyUnit[]>()
  const owners = new Map<string, FamilyMember>()

  for (const unit of units.value.unitMap.values()) {
    map.set(unit.key, [])
  }

  for (const [childKey, link] of unitParentLinks.value.primary) {
    const childUnit = units.value.unitMap.get(childKey)
    if (childUnit) {
      map.get(link.parentKey)?.push(childUnit)
      owners.set(childKey, link.owner)
    }
  }

  // Siblings left → right by the blood member's position / birth date
  for (const list of map.values()) {
    list.sort((left, right) => {
      const a = owners.get(left.key)
      const b = owners.get(right.key)
      return a && b ? compareMembersLeftToRight(a, b) : compareUnitsLeftToRight(left, right)
    })
  }

  return map
})

const rootUnits = computed(() => {
  const inLawUnitKeys = new Set([...unitParentLinks.value.inLawByMemberId.values()].map((unit) => unit.key))
  const rootUnitList: FamilyUnit[] = []

  for (const unit of units.value.unitMap.values()) {
    if (unitParentLinks.value.primary.has(unit.key)) {
      continue // drawn under its parents
    }

    // Parents of a married-in spouse with no other children in the tree: shown above that spouse instead
    if (inLawUnitKeys.has(unit.key) && (childUnitsByUnitKey.value.get(unit.key)?.length ?? 0) === 0) {
      continue
    }

    rootUnitList.push(unit)
  }

  return rootUnitList.sort(compareUnitsLeftToRight)
})

const getInLawParents = (memberId: string): FamilyUnit | undefined => unitParentLinks.value.inLawByMemberId.get(memberId)

// ---- Connector lines for in-law parents (computed from the rendered layout) ----
const canvasRef = ref<HTMLElement | null>(null)
const inLawLinks = ref<{ key: string; d: string }[]>([])
let linkFrame = 0
let canvasResizeObserver: ResizeObserver | undefined
let canvasMutationObserver: MutationObserver | undefined

// Position of an element inside the tree canvas, in the canvas's own (unzoomed) CSS pixels.
// Uses offsetTop/offsetLeft, so it is the same in every browser whatever the zoom level is.
const boxInCanvas = (element: HTMLElement, canvas: HTMLElement) => {
  let left = 0
  let top = 0
  let current: HTMLElement | null = element
  while (current && current !== canvas) {
    left += current.offsetLeft
    top += current.offsetTop
    const parent = current.offsetParent as HTMLElement | null
    if (parent && parent !== canvas && !canvas.contains(parent)) {
      return null
    }
    current = parent
  }
  if (current !== canvas) {
    return null
  }
  const width = element.offsetWidth
  const height = element.offsetHeight
  return { left, top, width, height, right: left + width, bottom: top + height }
}

const updateInLawLinks = (): void => {
  const canvas = canvasRef.value
  if (!canvas) {
    inLawLinks.value = []
    return
  }

  const links: { key: string; d: string }[] = []

  for (const guest of canvas.querySelectorAll<HTMLElement>('[data-inlaw-for]')) {
    const childId = guest.dataset.inlawFor ?? ''
    const spouseId = guest.dataset.inlawSpouse ?? ''
    const parents = guest.querySelector<HTMLElement>('.inlaw-cards')
    const childWrap = guest.querySelector<HTMLElement>('.inlaw-child')
    const guestBox = boxInCanvas(guest, canvas)
    if (!parents || !childWrap || !guestBox) {
      continue
    }

    const partner = spouseId
      ? canvas.querySelector<HTMLElement>(`.person-card[data-member-id="${CSS.escape(spouseId)}"]`)
      : null
    const partnerBox = partner ? boxInCanvas(partner, canvas) : null

    // The parents' Thu gọn / Mở rộng button sits in the middle between the two families.
    const familyRow = guest.closest<HTMLElement>('.unit-row.has-guests')
    const familyMain = familyRow?.querySelector<HTMLElement>(':scope > .unit-main')
    const familyToggle = familyRow?.parentElement?.querySelector<HTMLElement>(':scope > .toggle:not([data-couple-toggle])')
    const mainBox = familyMain ? boxInCanvas(familyMain, canvas) : null
    if (familyToggle && mainBox) {
      const groupCenter = (Math.min(mainBox.left, guestBox.left) + Math.max(mainBox.right, guestBox.right)) / 2
      const toggleShift = `${Math.round(groupCenter - (mainBox.left + mainBox.width / 2))}px`
      familyToggle.style.position = 'relative'
      if (familyToggle.style.left !== toggleShift) {
        familyToggle.style.left = toggleShift
      }
    }

    // …and the parents' line runs straight from their cards down to their child (the button moved away).
    // Drawn as one line (the list's own short CSS stubs are hidden) so there is no join or step.
    const familyChildren = familyRow?.closest('.node')?.querySelector<HTMLElement>(':scope > .children')
    const onlyChildCard = familyChildren?.querySelector<HTMLElement>(
      ':scope > .node:only-child > .unit-content .person-card',
    )
    const onlyChildBox = onlyChildCard ? boxInCanvas(onlyChildCard, canvas) : null
    if (familyChildren && mainBox && onlyChildBox) {
      familyChildren.setAttribute('data-svg-stem', '')
      const x = onlyChildBox.left + onlyChildBox.width / 2
      links.push({ key: `${childId}-parents-down`, d: `M ${x} ${mainBox.bottom} L ${x} ${onlyChildBox.top}` })
    } else if (familyChildren) {
      familyChildren.removeAttribute('data-svg-stem')
    }

    // Partner's branch collapsed (Thu gọn) → hide the married-in child too, with their line.
    if (!partnerBox) {
      childWrap.classList.remove('is-placed')
      continue
    }

    // Place the married-in child under their parents, exactly level with their partner (if visible).
    const top = partnerBox ? partnerBox.top - guestBox.top : guestBox.height + 40
    const nextTop = `${Math.round(top)}px`
    const nextLeft = `${Math.round((guest.offsetWidth - childWrap.offsetWidth) / 2)}px` // centred under the parents
    if (childWrap.style.top !== nextTop) {
      childWrap.style.top = nextTop
    }
    if (childWrap.style.left !== nextLeft) {
      childWrap.style.left = nextLeft
    }
    childWrap.classList.add('is-placed')

    const childCard = childWrap.querySelector<HTMLElement>('.person-card') ?? childWrap
    const parentsBox = boxInCanvas(parents, canvas)
    const childBox = boxInCanvas(childCard, canvas)
    if (!parentsBox || !childBox) {
      continue
    }

    // parents → child (vertical)
    const px = parentsBox.left + parentsBox.width / 2
    links.push({ key: `${childId}-down`, d: `M ${px} ${parentsBox.bottom} L ${px} ${childBox.top}` })

    // partner ↔ child (horizontal marriage line)
    if (partnerBox) {
      const midY = partnerBox.top + Math.min(partnerBox.height, childBox.height) / 2
      const fromLeft = partnerBox.right <= childBox.left
      const x1 = fromLeft ? partnerBox.right : partnerBox.left
      const x2 = fromLeft ? childBox.left : childBox.right
      links.push({ key: `${childId}-spouse`, d: `M ${x1} ${midY} L ${x2} ${midY}` })

      // The couple's children (and the Mở rộng/Thu gọn button) hang from the middle of the marriage line.
      const middleX = (x1 + x2) / 2
      const shift = `${Math.round(middleX - (partnerBox.left + partnerBox.width / 2))}px`
      const toggle = canvas.querySelector<HTMLElement>(`[data-couple-toggle="${CSS.escape(spouseId)}"]`)
      const children = canvas.querySelector<HTMLElement>(`[data-couple-children="${CSS.escape(spouseId)}"]`)
      for (const element of [toggle, children]) {
        if (element && element.style.left !== shift) {
          element.style.left = shift
        }
      }
      const toggleBox = toggle ? boxInCanvas(toggle, canvas) : null
      const childrenBox = children ? boxInCanvas(children, canvas) : null
      const stemEnd = toggleBox ? toggleBox.top : childrenBox ? childrenBox.top : null
      if (stemEnd !== null) {
        links.push({ key: `${childId}-stem`, d: `M ${middleX} ${midY} L ${middleX} ${stemEnd}` })
      }
    }
  }

  // Divorce: each marriage's children (current couple / each former spouse) hang from the middle of
  // that marriage's line: down, across to the middle of the children group, down to the group.
  const cardOf = (id?: string) =>
    id ? canvas.querySelector<HTMLElement>(`.person-card[data-member-id="${CSS.escape(id)}"]`) : null
  for (const group of canvas.querySelectorAll<HTMLElement>('.children[data-link-a]')) {
    const cardA = cardOf(group.dataset.linkA)
    const cardB = cardOf(group.dataset.linkB)
    const boxA = cardA ? boxInCanvas(cardA, canvas) : null
    const boxB = cardB ? boxInCanvas(cardB, canvas) : null
    const groupBox = boxInCanvas(group, canvas)
    if (!boxA || !boxB || !groupBox) {
      continue
    }
    const same = group.dataset.linkA === group.dataset.linkB
    const [left, right] = boxA.left <= boxB.left ? [boxA, boxB] : [boxB, boxA]
    const x0 = same ? boxA.left + boxA.width / 2 : (left.right + right.left) / 2
    const y0 = same ? boxA.bottom : left.top + Math.min(left.height, right.height) / 2
    const items = group.querySelectorAll<HTMLElement>(':scope > .node')
    // one child: straight down to that child's card; several: down to the bar over them
    const firstItemBox = items.length === 1 ? boxInCanvas(items[0], canvas) : null
    const endY = firstItemBox ? firstItemBox.top + 2 : groupBox.top + 1
    const x1 = groupBox.left + groupBox.width / 2
    const turnY = Math.max(y0 + 12, groupBox.top - 16)
    links.push({
      key: `marriage-${group.dataset.linkA}-${group.dataset.linkB}`,
      d: `M ${x0} ${y0} L ${x0} ${turnY} L ${x1} ${turnY} L ${x1} ${endY}`,
    })
  }

  // Only update when something moved, so redrawing the SVG doesn't re-trigger the observer forever.
  if (JSON.stringify(links) !== JSON.stringify(inLawLinks.value)) {
    inLawLinks.value = links
  }
}

const scheduleInLawLinks = (): void => {
  cancelAnimationFrame(linkFrame)
  linkFrame = requestAnimationFrame(() => {
    balanceTreeRoot()
    updateInLawLinks()
  })
}

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

// Cards look up other members (e.g. who hosts the đám giỗ)
provide('familyMemberById', getMemberById)
provide(
  'showMemorialPlace',
  computed(() => props.showMemorialPlace),
)

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

  const link = unitParentLinks.value.primary.get(unit.key)
  return link ? units.value.unitMap.get(link.parentKey) : undefined
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

  resetExpandState()
  selectedUnitKey.value = unitKey
}

// Switching between the whole tree and a branch starts from the default open/closed state.
// (Declared as a function so it can be used above.)
function resetExpandState(): void {
  expandRequest.value = undefined
  isAllExpanded.value = false
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
const expandRequest = ref<{ keys: Set<string>; nonce: number; collapse?: boolean } | undefined>(undefined)
const isAllExpanded = ref(false)
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

// "Mở rộng tất cả" / "Thu gọn tất cả"
const toggleExpandAll = (): void => {
  if (isAllExpanded.value) {
    expandRequest.value = { keys: new Set(), nonce: Date.now(), collapse: true }
    isAllExpanded.value = false
    void centerOnRoot()
    return
  }

  expandRequest.value = { keys: new Set(units.value.unitMap.keys()), nonce: Date.now() }
  isAllExpanded.value = true
  void centerOnRoot()
}

const clearFocusedTree = (): void => {
  resetExpandState()
  selectedUnitKey.value = null
}

const syncFullViewState = (): void => {
  const wrapper = treeWrapperRef.value
  if (!wrapper) {
    isFullView.value = isPseudoFullView.value
    return
  }

  isFullView.value = document.fullscreenElement === wrapper || isPseudoFullView.value
}

const setPseudoFullView = (value: boolean): void => {
  isPseudoFullView.value = value
  document.documentElement.classList.toggle('tree-pseudo-full-view', value)
  syncFullViewState()
}

const exitAnyFullView = async (): Promise<void> => {
  if (isPseudoFullView.value) {
    setPseudoFullView(false)
  }

  if (document.fullscreenElement === treeWrapperRef.value) {
    try {
      await document.exitFullscreen()
    } catch {
      // ignore
    }
  }
}

const isPhone = (): boolean => window.matchMedia('(max-width: 640px)').matches

// Phones: pick the zoom so the top family row (both families side by side, if any) fits the screen.
let hasAutoFitted = false
const fitTopRowToScreen = async (): Promise<void> => {
  if (hasAutoFitted || !isPhone()) {
    return
  }
  await nextTick()
  const wrapper = treeWrapperRef.value
  const content = wrapper?.querySelector<HTMLElement>('.tree-root > .node > .unit-content')
  if (!wrapper || !content) {
    return
  }
  const row = content.querySelector<HTMLElement>(':scope > .unit-row')
  const main = row?.querySelector<HTMLElement>(':scope > .unit-main')
  const guests = row?.querySelector<HTMLElement>(':scope > .inlaw-guests')
  // width at 100% zoom
  const rowWidth = main
    ? (guests ? guests.offsetLeft + guests.offsetWidth - main.offsetLeft : main.offsetWidth)
    : content.offsetWidth
  const available = wrapper.clientWidth - 24
  if (rowWidth <= 0 || available <= 0) {
    return
  }
  const fitted = Math.floor((available / rowWidth) * 20) / 20 // round down to 5%
  zoom.value = Math.min(0.8, Math.max(ZOOM_MIN, fitted))
  hasAutoFitted = true
  void centerOnRoot()
}

const changeZoom = (delta: number): void => {
  const next = Math.round((zoom.value + delta) * 10) / 10
  zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
}

const resetZoom = (): void => {
  zoom.value = 1
}

// Scroll the tree horizontally so the given element sits in the middle of the frame.
const centerElementInTree = (element: Element | null | undefined, behavior: ScrollBehavior = 'auto'): void => {
  const wrapper = treeWrapperRef.value
  if (!wrapper || !element) {
    return
  }

  const wrapperRect = wrapper.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const left = wrapper.scrollLeft + (elementRect.left - wrapperRect.left) - (wrapperRect.width - elementRect.width) / 2
  wrapper.scrollTo({ left: Math.max(0, left), behavior })
}

// When the top couple has a child-in-law's parents drawn beside it, the row keeps an empty column on the
// left for balance. Slide the tree left (only into space that has no cards) so the whole group is centred.
const balanceTreeRoot = (): void => {
  const canvas = canvasRef.value
  const root = canvas?.querySelector<HTMLElement>('.tree-root')
  if (!canvas || !root) {
    return
  }
  root.style.left = '0px'
  const rootNodes = root.querySelectorAll(':scope > .node')
  const row = rootNodes.length === 1 ? rootNodes[0].querySelector<HTMLElement>(':scope > .unit-content > .unit-row.has-guests') : null
  const main = row?.querySelector<HTMLElement>(':scope > .unit-main')
  const guests = row?.querySelector<HTMLElement>(':scope > .inlaw-guests')
  const mainBox = main ? boxInCanvas(main, canvas) : null
  const guestsBox = guests ? boxInCanvas(guests, canvas) : null
  if (!mainBox || !guestsBox) {
    return
  }
  const groupCenter = (Math.min(mainBox.left, guestsBox.left) + Math.max(mainBox.right, guestsBox.right)) / 2
  const wanted = groupCenter - (mainBox.left + mainBox.width / 2)
  let leftmostCard = Number.POSITIVE_INFINITY
  for (const card of root.querySelectorAll<HTMLElement>('.person-card, .toggle')) {
    const box = boxInCanvas(card, canvas)
    if (box && box.width > 0) {
      leftmostCard = Math.min(leftmostCard, box.left)
    }
  }
  const shift = Math.max(0, Math.min(wanted, leftmostCard - 12))
  root.style.left = `${-Math.round(shift)}px`
}

const centerOnRoot = async (): Promise<void> => {
  await nextTick()
  requestAnimationFrame(() => {
    balanceTreeRoot()
    const content = treeWrapperRef.value?.querySelector<HTMLElement>('.tree-root > .node > .unit-content')
    const row = content?.querySelector<HTMLElement>(':scope > .unit-row.has-guests')
    const main = row?.querySelector<HTMLElement>(':scope > .unit-main')
    const guests = row?.querySelector<HTMLElement>(':scope > .inlaw-guests')
    const wrapper = treeWrapperRef.value
    if (wrapper && main && guests) {
      // centre the whole group (both sets of parents)
      const a = main.getBoundingClientRect()
      const b = guests.getBoundingClientRect()
      const w = wrapper.getBoundingClientRect()
      const middle = (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2
      wrapper.scrollTo({ left: Math.max(0, wrapper.scrollLeft + middle - (w.left + w.width / 2)) })
      return
    }
    centerElementInTree(content)
  })
}

const onEditMember = async (id: string): Promise<void> => {
  // The edit panel lives outside the tree frame, so leave full view first.
  await exitAnyFullView()
  emit('editMember', id)
}

const toggleFullView = async (): Promise<void> => {
  const wrapper = treeWrapperRef.value
  if (!wrapper) {
    fullViewError.value = 'Không tìm thấy vùng cây để bật chế độ toàn màn hình.'
    return
  }

  fullViewError.value = ''

  if (isPseudoFullView.value) {
    setPseudoFullView(false)
    return
  }

  if (!document.fullscreenEnabled || !wrapper.requestFullscreen) {
    setPseudoFullView(true)
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

watch(selectedUnitKey, () => {
  void centerOnRoot()
})

watch(
  () => props.members.length > 0,
  (hasMembers) => {
    if (hasMembers) {
      void centerOnRoot()
      requestAnimationFrame(() => void fitTopRowToScreen())
    }
  },
  { immediate: true },
)

watch(zoom, () => {
  void centerOnRoot()
  scheduleInLawLinks()
})

onMounted(() => {
  if (canvasRef.value) {
    if (typeof ResizeObserver !== 'undefined') {
      canvasResizeObserver = new ResizeObserver(scheduleInLawLinks)
      canvasResizeObserver.observe(canvasRef.value)
    }
    canvasMutationObserver = new MutationObserver(scheduleInLawLinks)
    canvasMutationObserver.observe(canvasRef.value, { childList: true, subtree: true })
    scheduleInLawLinks()
    // Web fonts arriving late change card heights → re-align.
    void document.fonts?.ready.then(scheduleInLawLinks)
    window.addEventListener('resize', scheduleInLawLinks)
    window.addEventListener('load', scheduleInLawLinks)
  }
  document.addEventListener('fullscreenchange', syncFullViewState)
  syncFullViewState()
  if (isPhone()) {
    zoom.value = 0.8
  }
  void centerOnRoot()
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullViewState)
  canvasResizeObserver?.disconnect()
  window.removeEventListener('resize', scheduleInLawLinks)
  window.removeEventListener('load', scheduleInLawLinks)
  canvasMutationObserver?.disconnect()
  cancelAnimationFrame(linkFrame)
  document.documentElement.classList.remove('tree-pseudo-full-view')
  if (highlightTimer) {
    clearTimeout(highlightTimer)
  }
})
</script>

<template>
  <section
    ref="treeWrapperRef"
    class="tree-wrapper"
    :class="{ 'full-view-active': isFullView, 'pseudo-full-view': isPseudoFullView }"
  >
    <AnniversaryBar
      v-if="notificationMonths > 0"
      class="tree-anniversary"
      :members="members"
      :include-hidden="canManage"
      :months="notificationMonths"
      :lunar-events="lunarEvents"
      :show-memorial-place="showMemorialPlace"
      @select="goToMember"
    />

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
        <div class="zoom-controls" role="group" aria-label="Thu phóng">
          <button type="button" aria-label="Thu nhỏ" :disabled="zoom <= ZOOM_MIN" @click="changeZoom(-ZOOM_STEP)">−</button>
          <button type="button" class="zoom-value" title="Về 100%" @click="resetZoom">{{ Math.round(zoom * 100) }}%</button>
          <button type="button" aria-label="Phóng to" :disabled="zoom >= ZOOM_MAX" @click="changeZoom(ZOOM_STEP)">+</button>
        </div>
        <button
          type="button"
          class="expand-all-btn"
          :aria-pressed="isAllExpanded"
          :title="isAllExpanded ? 'Thu gọn tất cả' : 'Mở rộng tất cả'"
          @click="toggleExpandAll"
        >
          <span class="btn-icon" aria-hidden="true">{{ isAllExpanded ? '⊟' : '⊞' }}</span>
          <span class="btn-label">{{ isAllExpanded ? 'Thu gọn tất cả' : 'Mở rộng tất cả' }}</span>
        </button>
        <button
          type="button"
          class="search-toggle-btn"
          :aria-expanded="isSearchOpen"
          :title="isSearchOpen ? 'Đóng tìm kiếm' : 'Tìm kiếm'"
          @click="toggleSearch"
        >
          <span class="btn-icon" aria-hidden="true">{{ isSearchOpen ? '✕' : '🔍' }}</span>
          <span class="btn-label">{{ isSearchOpen ? 'Đóng tìm kiếm' : 'Tìm kiếm' }}</span>
        </button>
        <button
          type="button"
          class="full-view-btn"
          :title="isFullView ? 'Thoát Full view' : 'Full view'"
          @click="toggleFullView"
        >
          <span class="btn-icon" aria-hidden="true">⛶</span>
          <span class="btn-label">{{ isFullView ? 'Thoát Full view' : 'Full view' }}</span>
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

    <div ref="canvasRef" class="tree-canvas" :style="{ zoom }">
      <!-- Lines for a married-in child: down from their parents, and across to the partner they married -->
      <svg class="inlaw-links" aria-hidden="true">
        <path v-for="link in inLawLinks" :key="link.key" :d="link.d" />
      </svg>
      <ul class="tree-root">
        <FamilyTreeNode
          v-for="unit in selectedRootUnits"
          :key="`${selectedUnitKey ?? 'all'}:${unit.key}`"
          :unit="unit"
          :child-units-by-unit-key="childUnitsByUnitKey"
          :child-units-resolver="resolveChildUnits"
          :expand-depth="initialExpandDepth"
          :expand-request="expandRequest"
          :highlighted-member-id="highlightedMemberId"
          :member-name-by-id="getMemberName"
          :member-by-id="getMemberById"
          :in-law-parents-resolver="getInLawParents"
          :former-spouses-resolver="getFormerSpouses"
          :can-manage="canManage"
          :show-birth-date="showBirthDate"
          :show-death-date="showDeathDate"
          :show-spouse="showSpouse"
          :show-view-detail="showViewDetail"
          @view-detail="focusFromMember"
          @edit="onEditMember"
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
  /*
   * An open gia phả book: two aged pages with a shadowed spine in the middle,
   * stacked page edges on both sides, cloud-motif corners, bound in a red leather
   * cover with a gold tooled line. Background layers (top → bottom):
   *   1–4 cloud corners · 5 spine shadow · 6 page curvature · 7–8 page-edge stacks · 9 paper
   */
  --book-spine: linear-gradient(
    90deg,
    transparent calc(50% - 70px),
    rgba(110, 70, 30, 0.08) calc(50% - 36px),
    rgba(90, 50, 20, 0.22) calc(50% - 10px),
    rgba(60, 30, 10, 0.42) 50%,
    rgba(90, 50, 20, 0.22) calc(50% + 10px),
    rgba(110, 70, 30, 0.08) calc(50% + 36px),
    transparent calc(50% + 70px)
  );
  --book-page-curve: linear-gradient(
    90deg,
    rgba(90, 55, 20, 0.2),
    rgba(255, 250, 236, 0.35) 7%,
    transparent 18%,
    transparent 82%,
    rgba(255, 250, 236, 0.35) 93%,
    rgba(90, 55, 20, 0.2)
  );
  --book-page-stack: repeating-linear-gradient(90deg, #cdb98f 0 1px, #f4ead1 1px 3px);
  background-color: #f3e6c8;
  background-image:
    url('/gia-pha-cloud-corner.svg'),
    url('/gia-pha-cloud-corner-tr.svg'),
    url('/gia-pha-cloud-corner-bl.svg'),
    url('/gia-pha-cloud-corner-br.svg'),
    var(--book-spine),
    var(--book-page-curve),
    var(--book-page-stack),
    var(--book-page-stack),
    url('/gia-pha-bg.svg');
  background-repeat: no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, repeat;
  background-position:
    left 20px top 8px,
    right 20px top 8px,
    left 20px bottom 8px,
    right 20px bottom 8px,
    center,
    center,
    left top,
    right top,
    0 0;
  background-size:
    140px 140px,
    140px 140px,
    140px 140px,
    140px 140px,
    100% 100%,
    100% 100%,
    12px 100%,
    12px 100%,
    480px 480px;
  /* leather cover */
  border: 14px solid #6a1a12;
  border-image: linear-gradient(160deg, #8a2a1c, #4e110b 45%, #6a1a12 55%, #8a2a1c) 1;
  border-radius: 6px;
  padding: 1.75rem 2.4rem 2rem;
  overflow-x: auto;
  box-shadow:
    inset 0 0 0 1px rgba(60, 25, 8, 0.45),
    inset 0 0 50px rgba(120, 70, 20, 0.2),
    0 0 0 2px #c9a24a,
    0 0 0 4px #4e110b,
    0 18px 36px rgba(50, 20, 6, 0.38),
    0 4px 0 6px rgba(60, 25, 8, 0.25);
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
  /* centred in the book when the tree is narrower than the page */
  position: relative;
  margin: 0 auto;
  width: max-content;
  padding: 0;
  list-style: none;
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.inlaw-links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  z-index: 0;
}

.inlaw-links path {
  fill: none;
  stroke: #9b3a24;
  stroke-width: 2;
}

.tree-canvas {
  position: relative;
  padding-top: 1rem; /* room for small captions above the first row (e.g. "Bên ngoại") */
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

.btn-icon {
  margin-right: 0.35rem;
}

.expand-all-btn,
.search-toggle-btn,
.full-view-btn {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.expand-all-btn {
  border: 1px solid #a77f48;
  border-radius: 8px;
  background: #fff4df;
  color: #5c3818;
  font-weight: 700;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}

.expand-all-btn:hover {
  background: #ffe9c3;
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

.zoom-controls {
  display: inline-flex;
  border: 1px solid #a77f48;
  border-radius: 8px;
  overflow: hidden;
  background: #fff4df;
}

.zoom-controls button {
  border: 0;
  background: transparent;
  color: #5c3818;
  font-weight: 700;
  min-width: 2rem;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

.zoom-controls button + button {
  border-left: 1px solid #d9bf8f;
}

.zoom-controls button:hover:not(:disabled) {
  background: #ffe9c3;
}

.zoom-controls button:disabled {
  opacity: 0.4;
  cursor: default;
}

.zoom-controls .zoom-value {
  min-width: 3.2rem;
  font-size: 0.85rem;
}

.pseudo-full-view {
  position: fixed;
  inset: 0;
  z-index: 1000;
  margin: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

.tree-wrapper {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
}

/* Ngày giỗ notification, pinned at the top of the frame while the tree scrolls sideways */
.tree-anniversary {
  position: sticky;
  left: 0;
  top: 0;
  z-index: 9;
  margin: 0 0 0.8rem;
  max-width: none;
}

/* ---------- Mobile ---------- */
@media (max-width: 640px) {
  .tree-wrapper {
    /* phones show a single page: no spine in the middle */
    --book-spine: linear-gradient(transparent, transparent);
    border-width: 5px;
    padding: 0.6rem 0.35rem 0.9rem;
    background-position:
      left 12px top 6px,
      right 12px top 6px,
      left 12px bottom 6px,
      right 12px bottom 6px,
      center,
      center,
      left top,
      right top,
      0 0;
    /* no corner ornaments on phones; thin page edges */
    background-size:
      0 0,
      0 0,
      0 0,
      0 0,
      100% 100%,
      100% 100%,
      4px 100%,
      4px 100%,
      480px 480px;
  }

  .view-controls {
    gap: 0.45rem;
  }

  .control-buttons {
    width: 100%;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .search-box {
    order: 2;
    flex: 1 1 100%;
    max-width: none;
  }

  .search-input {
    font-size: 16px; /* prevents iOS zoom on focus */
  }

  .expand-all-btn,
  /* phones: icon-only buttons, all on one row */
  .search-toggle-btn,
  .full-view-btn,
  .expand-all-btn {
    padding: 0.3rem 0.55rem;
    font-size: 0.95rem;
    line-height: 1.2;
  }

  .btn-label {
    display: none;
  }

  .btn-icon {
    margin-right: 0;
  }

  .control-buttons {
    flex-wrap: nowrap;
  }

  .zoom-controls button {
    min-width: 1.8rem;
    padding: 0.3rem 0.35rem;
  }

  .zoom-controls .zoom-value {
    min-width: 2.8rem;
    font-size: 0.78rem;
  }

  .detail-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
}
</style>
