<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, watch, type Ref } from 'vue'
import AnniversaryBar from './AnniversaryBar.vue'
import AnniversaryList from './AnniversaryList.vue'
import FamilyTreeNode from './FamilyTreeNode.vue'
import SearchableMemberSelect from './SearchableMemberSelect.vue'
import type { FamilyMember, FamilyUnit } from '../types/family'
import type { LunarEvent } from '../utils/lunar-events'
import { honorific, isDeceased, memorialPlaceLabel } from '../utils/memorial'
import { solarDateTextToLunarText } from '../utils/lunar'
import { spouseIdsOf, spouseOrderLabel } from '../utils/spouses'

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
/** "Chọn" on a card: show only that person's direct line (dòng trực hệ) from the top ancestor down. */
const lineageKey = ref<string | null>(null)
/** the person whose "Chọn" was clicked (their card shows "Bỏ chọn") */
const lineageMemberId = ref<string | null>(null)

/* "Mặc định" (★ on a card): this browser opens the tree on that person. Kept in localStorage. */
const DEFAULT_MEMBER_KEY = 'gia-pha-default-member'
const readDefaultMember = (): string | null => {
  try {
    return localStorage.getItem(DEFAULT_MEMBER_KEY)
  } catch {
    return null
  }
}
const defaultMemberId = ref<string | null>(readDefaultMember())
const toggleDefaultMember = (memberId: string): void => {
  defaultMemberId.value = defaultMemberId.value === memberId ? null : memberId
  try {
    if (defaultMemberId.value) {
      localStorage.setItem(DEFAULT_MEMBER_KEY, defaultMemberId.value)
    } else {
      localStorage.removeItem(DEFAULT_MEMBER_KEY)
    }
  } catch {
    // private mode / storage blocked: works until the page is reloaded
  }
}
// Admin pages have no door (no provider) → always open
const gateOpen = inject<Ref<boolean>>('gateOpen', ref(true))
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

// Spouses of every member, in order. A link written on either person counts (normally both have it).
const spousesById = computed(() => {
  const map = new Map<string, string[]>()
  const add = (from: string, to: string) => {
    const list = map.get(from) ?? []
    if (!list.includes(to)) list.push(to)
    map.set(from, list)
  }
  for (const member of props.members) {
    for (const id of spouseIdsOf(member)) {
      if (memberMap.value.has(id)) add(member.id, id)
    }
  }
  for (const member of props.members) {
    for (const id of spouseIdsOf(member)) {
      if (memberMap.value.has(id)) add(id, member.id)
    }
  }
  return map
})

const spousesOf = (member: FamilyMember): FamilyMember[] =>
  (spousesById.value.get(member.id) ?? []).map((id) => memberMap.value.get(id)).filter((m): m is FamilyMember => Boolean(m))

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

const hasParentsInTree = (member: FamilyMember): boolean =>
  Boolean((member.fatherId && memberMap.value.has(member.fatherId)) || (member.motherId && memberMap.value.has(member.motherId)))

// ---- Family units ----
// single: one person · pair: a couple · multi: a person with several spouses, drawn
//   Vợ 4 · Vợ 1 — CHỒNG — Vợ 2 · Vợ 3  (1st on the left, 2nd on the right, then outwards right/left).
const units = computed(() => {
  const map = new Map<string, FamilyUnit>()
  const memberToUnitKey = new Map<string, string>()
  const orderedMembers = [...props.members].sort(compareMembersLeftToRight)

  // People with several spouses first, so their spouses join them (not someone else)
  const hostFirst = [...orderedMembers].sort((left, right) => {
    const diff = (spousesById.value.get(right.id)?.length ?? 0) - (spousesById.value.get(left.id)?.length ?? 0)
    if (diff !== 0) return diff
    // same number: the one born into the family, then the man
    const blood = Number(hasParentsInTree(right)) - Number(hasParentsInTree(left))
    if (blood !== 0) return blood
    return Number(right.gender === 'male') - Number(left.gender === 'male')
  })

  for (const member of hostFirst) {
    if (memberToUnitKey.has(member.id)) continue
    const free = spousesOf(member).filter((spouse) => !memberToUnitKey.has(spouse.id))

    if (free.length >= 2) {
      const left: FamilyMember[] = []
      const right: FamilyMember[] = []
      free.forEach((spouse, index) => {
        // 1 → left, 2 → right, 3 → right, 4 → left, 5 → right, 6 → left …
        const toLeft = index === 0 || (index >= 2 && index % 2 === 1)
        if (toLeft) left.unshift(spouse)
        else right.push(spouse)
      })
      const key = `multi:${member.id}`
      map.set(key, { key, members: [...left, member, ...right], host: member, spouses: free })
      for (const person of [member, ...free]) memberToUnitKey.set(person.id, key)
      continue
    }

    if (free.length === 1) {
      const spouse = free[0]
      const pair = orderSpousePairLeftToRight(member, spouse)
      const keyParts = [member.id, spouse.id].sort((a, b) => a.localeCompare(b))
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

    const chosen =
      (unit.host ? candidates.find((candidate) => candidate.owner.id === unit.host?.id) : undefined) ??
      candidates.find((candidate) => candidate.owner.gender === 'male') ??
      candidates[0]
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

/**
 * Totals for the stats strip. Counts the people currently drawn: the whole tree,
 * or only the focused branch while "Xem chi tiết" is active.
 */
const treeStats = computed(() => {
  const shown = new Map<string, FamilyMember>()
  const addMember = (member: FamilyMember) => {
    shown.set(member.id, member)
    for (const parent of getInLawParents(member.id)?.members ?? []) shown.set(parent.id, parent)
  }

  let generations = 0
  const seen = new Set<string>()
  const walk = (unit: FamilyUnit, depth: number) => {
    if (seen.has(unit.key)) return
    seen.add(unit.key)
    generations = Math.max(generations, depth)
    unit.members.forEach(addMember)
    for (const child of resolveChildUnits(unit.key)) {
      walk(child, depth + 1)
    }
  }
  for (const unit of selectedRootUnits.value) {
    walk(unit, 1)
  }

  // Whole tree: count every member, even ones not reachable from a root
  const counted = selectedUnitKey.value || lineageKey.value ? [...shown.values()] : props.members
  const living = counted.filter((member) => !isDeceased(member)).length
  return { total: counted.length, living, generations }
})

const getInLawParents = (memberId: string): FamilyUnit | undefined => unitParentLinks.value.inLawByMemberId.get(memberId)

// ---- Connector lines for in-law parents (computed from the rendered layout) ----
const canvasRef = ref<HTMLElement | null>(null)
const inLawLinks = ref<{ key: string; d: string; dashed?: boolean }[]>([])
/** "Vợ 1", "Vợ 2"… written on each marriage line of a person with several spouses */
const marriageLabels = ref<{ key: string; x: number; y: number; text: string }[]>([])
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
    marriageLabels.value = []
    return
  }

  const links: { key: string; d: string; dashed?: boolean }[] = []

  // A row that no longer has in-law parents beside it (branch collapsed): put its button back in the middle.
  for (const toggle of canvas.querySelectorAll<HTMLElement>('.unit-content > .toggle:not([data-couple-toggle])')) {
    const row = toggle.parentElement?.querySelector<HTMLElement>(':scope > .unit-row')
    if (row && !row.classList.contains('has-guests') && !row.querySelector('.multi-row') && toggle.style.left) {
      toggle.style.left = ''
    }
  }

  for (const guest of canvas.querySelectorAll<HTMLElement>('[data-inlaw-for]')) {
    const childId = guest.dataset.inlawFor ?? ''
    const spouseId = guest.dataset.inlawSpouse ?? ''
    const parents = guest.querySelector<HTMLElement>('.inlaw-cards')
    const childWrap = guest.querySelector<HTMLElement>('.inlaw-child')
    const guestBox = boxInCanvas(guest, canvas)

    // One of several spouses: stays in their row; a dashed line runs from their own parents down to them.
    if (parents && guest.hasAttribute('data-inlaw-inplace')) {
      const childCard = canvas.querySelector<HTMLElement>(`.multi-row .person-card[data-member-id="${CSS.escape(childId)}"]`)
      const parentsBox = boxInCanvas(parents, canvas)
      const childBox = childCard ? boxInCanvas(childCard, canvas) : null
      if (parentsBox && childBox) {
        const px = parentsBox.left + parentsBox.width / 2
        const cx = childBox.left + childBox.width / 2
        const turnY = childBox.top - 8
        links.push({
          key: `${childId}-down`,
          d: `M ${px} ${parentsBox.bottom} L ${px} ${turnY} L ${cx} ${turnY} L ${cx} ${childBox.top}`,
          dashed: true,
        })
      }
      continue
    }

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
    // bên ngoại/bên nội: dashed, so it reads as a side family and not part of the main line
    links.push({ key: `${childId}-down`, d: `M ${px} ${parentsBox.bottom} L ${px} ${childBox.top}`, dashed: true })

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

  // Several spouses: a line from the person in the middle to each spouse.
  // Next to them: straight across at mid-height. Further out: under the cards (so it doesn't cross the inner
  // spouse), one level lower per step outwards. Remember each marriage line's middle for its children.
  const cardOf = (id?: string) =>
    id ? canvas.querySelector<HTMLElement>(`.person-card[data-member-id="${CSS.escape(id)}"]`) : null
  const marriageMiddle = new Map<string, { x: number; y: number; dx: number }>()
  const labels: { key: string; x: number; y: number; text: string }[] = []
  for (const row of canvas.querySelectorAll<HTMLElement>('.multi-row[data-host]')) {
    const hostId = row.dataset.host ?? ''
    const hostCard = cardOf(hostId)
    const hostBox = hostCard ? boxInCanvas(hostCard, canvas) : null
    if (!hostBox) continue

    // The Thu gọn / Mở rộng button sits right under the person in the middle (not under the row's centre,
    // where a marriage line comes down).
    const unitRow = row.closest<HTMLElement>('.unit-row')
    const toggle = unitRow?.parentElement?.querySelector<HTMLElement>(':scope > .toggle')
    const rowBox = unitRow && !unitRow.classList.contains('has-guests') ? boxInCanvas(unitRow, canvas) : null
    if (toggle && rowBox) {
      const shift = `${Math.round(hostBox.left + hostBox.width / 2 - (rowBox.left + rowBox.width / 2))}px`
      toggle.style.position = 'relative'
      if (toggle.style.left !== shift) toggle.style.left = shift
    }
    for (const slot of row.querySelectorAll<HTMLElement>(':scope > .spouse-slot[data-spouse-id]')) {
      const spouseId = slot.dataset.spouseId ?? ''
      const card = slot.querySelector<HTMLElement>('.person-card')
      const box = card ? boxInCanvas(card, canvas) : null
      if (!box) continue
      const level = Number(slot.dataset.spouseLevel ?? 0)
      const onRight = box.left > hostBox.left
      const text = slot.dataset.spouseLabel ?? ''
      if (level === 0) {
        const y = hostBox.top + Math.min(hostBox.height, box.height) / 2
        const x1 = onRight ? hostBox.right : hostBox.left
        const x2 = onRight ? box.left : box.right
        links.push({ key: `marry-${hostId}-${spouseId}`, d: `M ${x1} ${y} L ${x2} ${y}` })
        marriageMiddle.set(`${hostId}|${spouseId}`, { x: (x1 + x2) / 2, y, dx: (x1 + x2) / 2 - (hostBox.left + hostBox.width / 2) })
        if (text) labels.push({ key: `label-${hostId}-${spouseId}`, x: (x1 + x2) / 2, y: y - 6, text })
      } else {
        const bottom = Math.max(hostBox.bottom, box.bottom)
        const y = bottom + 7 * level
        const xs = onRight ? hostBox.right - 12 * level : hostBox.left + 12 * level
        const xe = box.left + box.width / 2
        links.push({
          key: `marry-${hostId}-${spouseId}`,
          d: `M ${xs} ${hostBox.bottom} L ${xs} ${y} L ${xe} ${y} L ${xe} ${box.bottom}`,
        })
        marriageMiddle.set(`${hostId}|${spouseId}`, { x: (xs + xe) / 2, y, dx: (xs + xe) / 2 - (hostBox.left + hostBox.width / 2) })
        // on the line, just past the inner spouse's card
        if (text) labels.push({ key: `label-${hostId}-${spouseId}`, x: xe + (onRight ? -1 : 1) * (box.width / 2 + 20), y: y - 3, text })
      }
    }
  }

  // Several spouses: place each marriage's children group under that marriage (as close as the groups'
  // widths allow), instead of all groups bunched in the middle. Offsets are relative to the node's centre,
  // so the result doesn't depend on where the node itself sits (no feedback loop).
  // Deepest first: placing an inner family widens its node, which moves the outer ones.
  for (const container of [...canvas.querySelectorAll<HTMLElement>('.children-groups')].reverse()) {
    const node = container.parentElement
    const nodeBox = node ? boxInCanvas(node, canvas) : null
    const groups = [...container.querySelectorAll<HTMLElement>(':scope > .children[data-link-a]')]
    if (!nodeBox || groups.length === 0) continue
    const nodeCenter = nodeBox.left + nodeBox.width / 2
    const GAP = 28
    // The groups stay side by side as one block (left → right in marriage order). The block is slid
    // sideways so the groups sit as close as possible under their marriages — but never further than half
    // the parents' row, so one big branch can't push the others far away.
    let offset = 0
    const items = groups.map((group) => {
      const a = group.dataset.linkA ?? ''
      const b = group.dataset.linkB ?? ''
      const middle = marriageMiddle.get(`${a}|${b}`)
      const hostCard = cardOf(a)
      const hostBox = hostCard ? boxInCanvas(hostCard, canvas) : null
      // measured now, in the same layout (positions from earlier in this pass may be out of date)
      const hostCenter = hostBox ? hostBox.left + hostBox.width / 2 : nodeCenter
      const wanted = hostCenter + (middle ? middle.dx : 0) - nodeCenter
      const width = group.offsetWidth
      const item = { group, width, offset, wanted }
      offset += width + GAP
      return item
    })
    const blockWidth = offset - GAP
    const idealStart =
      items.reduce((sum, item) => sum + (item.wanted - (item.offset + item.width / 2)), 0) / items.length
    const rowBox = boxInCanvas(container.previousElementSibling as HTMLElement, canvas)
    const limit = Math.max(0, (rowBox?.width ?? 0) / 2)
    const blockCenter = Math.max(-limit, Math.min(limit, idealStart + blockWidth / 2))
    if (!Number.isFinite(blockCenter)) continue
    // shifting a centred block by d = padding 2d on the other side
    const styles: [HTMLElement, string, string][] = [
      [container, 'gap', '0px'],
      [container, 'justifyContent', 'center'],
      [container, 'paddingLeft', `${Math.round(Math.max(0, 2 * blockCenter))}px`],
      [container, 'paddingRight', `${Math.round(Math.max(0, -2 * blockCenter))}px`],
    ]
    items.forEach((item, index) => styles.push([item.group, 'marginLeft', index === 0 ? '0px' : `${GAP}px`]))
    for (const [element, prop, value] of styles) {
      const style = element.style as unknown as Record<string, string>
      const current = style[prop]
      // ignore ±1px rounding changes: centring an odd width flips between two values and would loop forever
      const close =
        value.endsWith('px') && current?.endsWith('px') && Math.abs(parseFloat(value) - parseFloat(current)) <= 1
      if (current !== value && !close) style[prop] = value
    }
  }

  // Each marriage's children hang from the middle of that marriage's line: down, across to the middle of
  // the children group, down to the group. With several marriages the across-lines get their own heights so
  // they never cross or merge: going left, the leftmost turns highest; going right, the rightmost does.
  type Elbow = { key: string; x0: number; y0: number; x1: number; endY: number; floor: number; top: number }
  const elbowsByContainer = new Map<Element, Elbow[]>()
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
    const middle = marriageMiddle.get(`${group.dataset.linkA}|${group.dataset.linkB}`)
    const x0 = middle ? middle.x : same ? boxA.left + boxA.width / 2 : (left.right + right.left) / 2
    const y0 = middle ? middle.y : same ? boxA.bottom : left.top + Math.min(left.height, right.height) / 2
    const items = group.querySelectorAll<HTMLElement>(':scope > .node')
    // one child: straight down to that child's card; several: down to the bar over them
    const firstItemBox = items.length === 1 ? boxInCanvas(items[0], canvas) : null
    const endY = firstItemBox ? firstItemBox.top + 2 : groupBox.top + 1
    const elbow: Elbow = {
      key: `marriage-${group.dataset.linkA}-${group.dataset.linkB}`,
      x0,
      y0,
      x1: groupBox.left + groupBox.width / 2,
      endY,
      floor: Math.max(y0, boxA.bottom, boxB.bottom),
      top: groupBox.top,
    }
    const container = group.parentElement ?? group
    elbowsByContainer.set(container, [...(elbowsByContainer.get(container) ?? []), elbow])
  }

  for (const elbows of elbowsByContainer.values()) {
    const goingLeft = elbows.filter((e) => e.x1 < e.x0 - 1).sort((a, b) => a.x0 - b.x0)
    const goingRight = elbows.filter((e) => e.x1 > e.x0 + 1).sort((a, b) => b.x0 - a.x0)
    const straight = elbows.filter((e) => Math.abs(e.x1 - e.x0) <= 1)
    const band = Math.max(...elbows.map((e) => e.floor)) + 12
    const lowest = Math.min(...elbows.map((e) => e.top)) - 6
    const rank = new Map<Elbow, number>()
    goingLeft.forEach((e, index) => rank.set(e, index))
    goingRight.forEach((e, index) => rank.set(e, index))
    for (const e of [...goingLeft, ...goingRight, ...straight]) {
      const turnY =
        elbows.length === 1
          ? Math.max(e.y0 + 12, e.top - 16)
          : Math.min(lowest, Math.max(e.y0 + 12, band + (rank.get(e) ?? 0) * 8))
      links.push({ key: e.key, d: `M ${e.x0} ${e.y0} L ${e.x0} ${turnY} L ${e.x1} ${turnY} L ${e.x1} ${e.endY}` })
    }
  }

  // Only update when something moved, so redrawing the SVG doesn't re-trigger the observer forever.
  if (JSON.stringify(links) !== JSON.stringify(inLawLinks.value)) {
    inLawLinks.value = links
  }
  if (JSON.stringify(labels) !== JSON.stringify(marriageLabels.value)) {
    marriageLabels.value = labels
  }
}

/**
 * Every generation lines up: all cards of one depth get the height of the tallest one, so a parent with
 * fewer fields doesn't pull its children's row higher than their cousins'.
 * A married-in child (drawn under their own parents) belongs to the row below those parents.
 */
const equalizeCardHeights = (): void => {
  const canvas = canvasRef.value
  if (!canvas) return

  const byDepth = new Map<number, HTMLElement[]>()
  const add = (depth: number, card: HTMLElement) => {
    const list = byDepth.get(depth) ?? []
    list.push(card)
    byDepth.set(depth, list)
  }

  for (const node of canvas.querySelectorAll<HTMLElement>('li.node[data-depth]')) {
    const depth = Number(node.dataset.depth)
    const content = node.querySelector<HTMLElement>(':scope > .unit-content')
    if (!content) continue
    for (const card of content.querySelectorAll<HTMLElement>('.person-card')) {
      add(card.closest('.inlaw-child') ? depth + 1 : depth, card)
    }
  }

  for (const cards of byDepth.values()) {
    for (const card of cards) card.style.minHeight = ''
    const tallest = Math.max(0, ...cards.map((card) => card.offsetHeight))
    if (tallest > 0) {
      for (const card of cards) card.style.minHeight = `${tallest}px`
    }
  }
}

const scheduleInLawLinks = (): void => {
  cancelAnimationFrame(linkFrame)
  linkFrame = requestAnimationFrame(() => {
    equalizeCardHeights()
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
// "In" button on every card: open the print chooser for that person
provide('selectLineage', (memberId: string) => selectLineage(memberId))
provide('lineageMemberId', lineageMemberId)
provide('defaultMemberId', defaultMemberId)
provide('toggleDefaultMember', toggleDefaultMember)
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
// While printing one person's tree: start at that person (no parent row above).
const printBranchOnly = ref(false)

const selectedParentUnit = computed((): FamilyUnit | undefined => {
  const unit = selectedUnit.value
  if (!unit || printBranchOnly.value) {
    return undefined
  }

  const link = unitParentLinks.value.primary.get(unit.key)
  return link ? units.value.unitMap.get(link.parentKey) : undefined
})

// Dòng trực hệ: the chosen person's family and every ancestor family up to the top, in order (top first).
const lineagePath = computed((): FamilyUnit[] => {
  const path: FamilyUnit[] = []
  const seen = new Set<string>()
  let key: string | undefined = lineageKey.value ?? undefined
  while (key && !seen.has(key)) {
    seen.add(key)
    const unit = units.value.unitMap.get(key)
    if (!unit) break
    path.unshift(unit)
    key = unitParentLinks.value.primary.get(key)?.parentKey
  }
  return path
})

const selectedRootUnits = computed(() => {
  if (lineagePath.value.length) {
    return [lineagePath.value[0]]
  }

  const unit = selectedUnit.value
  if (!unit) {
    return rootUnits.value
  }

  return [selectedParentUnit.value ?? unit]
})

// In focus mode the parent node only shows the selected branch (not the siblings).
// In the direct line, each ancestor shows only the next family down the line.
const resolveChildUnits = (unitKey: string): FamilyUnit[] => {
  const path = lineagePath.value
  if (path.length) {
    const index = path.findIndex((unit) => unit.key === unitKey)
    if (index !== -1 && index < path.length - 1) {
      return [path[index + 1]]
    }
    return getChildUnits(unitKey)
  }

  const parentUnit = selectedParentUnit.value
  if (parentUnit && selectedUnit.value && unitKey === parentUnit.key) {
    return [selectedUnit.value]
  }

  return getChildUnits(unitKey)
}

const initialExpandDepth = computed(() =>
  lineagePath.value.length ? lineagePath.value.length - 1 : selectedParentUnit.value ? 1 : 0,
)

const lineageLabel = computed(() => {
  const target = lineagePath.value[lineagePath.value.length - 1]
  return target ? unitLabel(target) : ''
})

const selectLineage = (memberId: string): void => {
  if (lineageMemberId.value === memberId) {
    clearFocusedTree() // "Bỏ chọn": back to the whole tree
    return
  }
  const unitKey = units.value.memberToUnitKey.get(memberId)
  if (!unitKey) return
  lineageMemberId.value = memberId
  resetExpandState()
  selectedUnitKey.value = null
  lineageKey.value = unitKey
  highlightedMemberId.value = memberId
  void nextTick(() => treeWrapperRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

/** "A & B", or for several spouses the person first: "AN & MỘT & HAI". */
const unitLabel = (unit: FamilyUnit): string =>
  (unit.host ? [unit.host, ...(unit.spouses ?? [])] : unit.members).map((member) => member.name).join(' & ')

const selectedRootLabel = computed(() => {
  if (!selectedUnitKey.value) {
    return ''
  }

  const selectedUnit = units.value.unitMap.get(selectedUnitKey.value)
  if (!selectedUnit) {
    return ''
  }

  return unitLabel(selectedUnit)
})

const focusFromMember = (memberId: string): void => {
  const unitKey = units.value.memberToUnitKey.get(memberId)
  if (!unitKey) {
    return
  }

  resetExpandState()
  lineageKey.value = null
  lineageMemberId.value = null
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
  } else if (spousesOf(member).length) {
    parts.push(`Vợ/Chồng: ${spousesOf(member).map((spouse) => spouse.name).join(', ')}`)
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
  lineageKey.value = null
  lineageMemberId.value = null
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
  lineageKey.value = null
  lineageMemberId.value = null
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

/* ---- Print: a plain-text list, top down, each generation indented ---- */
const isPrinting = ref(false)

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)

const formatPrintDate = (value?: string): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`
}

const describeForPrint = (member: FamilyMember): string => {
  if (member.isHidden && !props.canManage) {
    return '<b>Đã ẩn thông tin</b>'
  }

  const details: string[] = []
  if (props.showBirthDate && member.birthDate) details.push(`Ngày sinh: ${formatPrintDate(member.birthDate)}`)
  if (props.showDeathDate && member.deathDate) details.push(`Ngày mất: ${formatPrintDate(member.deathDate)}`)
  const lunar = member.deathDateLunar?.trim() || solarDateTextToLunarText(member.deathDate)
  if (props.showDeathDate && lunar) details.push(`Ngày mất (âm lịch): ${lunar}`)
  if (props.showDeathDate && member.deceased && !member.deathDate && !lunar) details.push('Đã mất (không rõ ngày mất)')
  const place = props.showMemorialPlace ? memorialPlaceLabel(member, getMemberById) : ''
  if (place) details.push(`Nơi giỗ: ${place}`)

  const name = `<b>${escapeHtml(member.name)}</b>`
  return details.length ? `${name} <span class="details">— ${escapeHtml(details.join(' · '))}</span>` : name
}

/** Generation number of a unit in the whole tree (1 = top). */
const generationOfUnit = (unitKey: string): number => {
  let generation = 1
  let key: string | undefined = unitKey
  const seen = new Set<string>()
  while (key && !seen.has(key)) {
    seen.add(key)
    const parentKey: string | undefined = unitParentLinks.value.primary.get(key)?.parentKey
    if (!parentKey) break
    generation += 1
    key = parentKey
  }
  return generation
}

/** What to print: the whole family, or one chosen person with all their descendants. */
type PrintScope = {
  roots: FamilyUnit[]
  label: string
  startGeneration: (unit: FamilyUnit) => number
  /** which child families to print under a family (default: all of them) */
  children?: (unitKey: string) => FamilyUnit[]
}

const buildPrintHtml = (scope: PrintScope): string => {
  const lines: string[] = []
  const seen = new Set<string>()

  const walk = (unit: FamilyUnit, generation: number, parentUnit?: FamilyUnit) => {
    if (seen.has(unit.key)) return
    seen.add(unit.key)

    const owner =
      unitParentLinks.value.primary.get(unit.key)?.owner ??
      unit.host ??
      unit.members.find((member) => member.gender === 'male') ??
      unit.members[0]
    // Several spouses: host first, then Vợ/Chồng 1, 2, … in order
    const ordered = unit.host ? [unit.host, ...(unit.spouses ?? [])] : unit.members
    const partners = ordered.filter((member) => member.id !== owner.id)
    const partnerLabel = (partner: FamilyMember) => {
      if (unit.host && partner.id !== unit.host.id) {
        const order = (unit.spouses ?? []).findIndex((spouse) => spouse.id === partner.id) + 1
        return spouseOrderLabel(unit.host, partner, order)
      }
      return partner.gender === 'female' ? 'Vợ' : partner.gender === 'male' ? 'Chồng' : 'Vợ/Chồng'
    }

    // Child of a person with several spouses: say which spouse is the other parent
    let fromSpouse = ''
    if (parentUnit?.host) {
      const other = (parentUnit.spouses ?? []).find((spouse) => spouse.id === owner.fatherId || spouse.id === owner.motherId)
      if (other) {
        fromSpouse = ` <span class="details">(con của ${escapeHtml(`${honorific(other)}${other.name}`)})</span>`
      }
    }

    const rows = [`<div class="row"><span class="gen">Đời ${generation}</span>${describeForPrint(owner)}${fromSpouse}</div>`]
    for (const partner of partners) {
      const parents = getInLawParents(partner.id)?.members ?? []
      const from = parents.length
        ? ` <span class="details">(con của ${escapeHtml(parents.map((p) => `${honorific(p)}${p.name}`).join(' & '))})</span>`
        : ''
      rows.push(`<div class="row sub">${partnerLabel(partner)}: ${describeForPrint(partner)}${from}</div>`)
    }

    const indent = generation - scope.startGeneration(scope.roots[0] ?? unit)
    lines.push(`<section class="unit" style="margin-left:${Math.max(0, indent) * 2.2}em">${rows.join('')}</section>`)

    for (const child of (scope.children ?? getChildUnits)(unit.key)) {
      walk(child, generation + 1, unit)
    }
  }

  for (const unit of scope.roots) {
    walk(unit, scope.startGeneration(unit))
  }

  const branch = scope.label ? `<p class="branch">${escapeHtml(scope.label)}</p>` : ''
  return `<h1>${escapeHtml(document.title)}</h1>${branch}${lines.join('\n')}`
}

type PrintLayout = 'list' | 'tree'
const isPrintMenuOpen = ref(false)

// "Công cụ": one button that shows/hides the view tools (zoom, expand all, search, print, full view)
const isToolsOpen = ref(false)
const toggleTools = (): void => {
  isToolsOpen.value = !isToolsOpen.value
  if (!isToolsOpen.value) {
    isPrintMenuOpen.value = false
  }
}
const printMenuRef = ref<HTMLElement | null>(null)

const printScopeMode = ref<'all' | 'person' | 'lineage'>('all')
const printPersonId = ref('')

const printableMembers = computed(() =>
  props.members
    .filter((member) => props.canManage || !member.isHidden)
    .sort((left, right) => left.name.localeCompare(right.name, 'vi')),
)

const togglePrintMenu = (): void => {
  isPrintMenuOpen.value = !isPrintMenuOpen.value
  if (isPrintMenuOpen.value && lineageKey.value) {
    // Viewing a direct line ("Chọn"): print that by default
    printScopeMode.value = 'lineage'
    return
  }
  if (isPrintMenuOpen.value) {
    // Nothing chosen with "Chọn": print the whole family by default
    printScopeMode.value = 'all'
  }
}

const printPersonUnitKey = computed(() =>
  printScopeMode.value === 'person' && printPersonId.value
    ? units.value.memberToUnitKey.get(printPersonId.value)
    : undefined,
)

const canPrint = computed(
  () =>
    printScopeMode.value === 'all' ||
    (printScopeMode.value === 'lineage' && lineagePath.value.length > 0) ||
    Boolean(printPersonUnitKey.value),
)

const currentPrintScope = (): PrintScope => {
  if (printScopeMode.value === 'lineage' && lineagePath.value.length) {
    // the direct line from the top ancestor to the chosen person, then all of that person's descendants
    return {
      roots: [lineagePath.value[0]],
      label: `Dòng trực hệ của ${lineageLabel.value}`,
      startGeneration: () => generationOfUnit(lineagePath.value[0].key),
      children: resolveChildUnits,
    }
  }
  const unitKey = printPersonUnitKey.value
  const unit = unitKey ? units.value.unitMap.get(unitKey) : undefined
  if (unit) {
    const generation = generationOfUnit(unit.key)
    return { roots: [unit], label: `Nhánh: ${unitLabel(unit)}`, startGeneration: () => generation }
  }
  return { roots: rootUnits.value, label: '', startGeneration: () => 1 }
}

const onDocumentPointerDown = (event: PointerEvent): void => {
  if (isPrintMenuOpen.value && printMenuRef.value && !printMenuRef.value.contains(event.target as Node)) {
    isPrintMenuOpen.value = false
  }
}

/** Prints a full HTML document from a hidden iframe (the app page itself is left alone). */
const printDocument = async (html: string, prepare?: (doc: Document) => void | Promise<void>): Promise<void> => {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:8000px;height:600px;border:0;visibility:hidden'
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    frame.remove()
    return
  }

  doc.open()
  doc.write(html)
  doc.close()
  await prepare?.(doc)

  let finished = false
  const done = () => {
    if (finished) return
    finished = true
    setTimeout(() => frame.remove(), 500)
  }
  win.addEventListener('afterprint', done, { once: true })
  await new Promise((resolve) => setTimeout(resolve, 100))
  win.focus()
  win.print()
  // Some browsers never fire afterprint
  setTimeout(done, 60000)
}

/** Text list: top down, each generation indented. */
const printList = (scope: PrintScope): Promise<void> =>
  printDocument(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(document.title)}</title>
<style>
  @page { size: A4 portrait; margin: 15mm 14mm; }
  body { margin: 0; color: #000; background: #fff; font: 11pt/1.45 'Noto Serif', 'Times New Roman', serif; }
  h1 { font-size: 15pt; text-align: center; margin: 0 0 4pt; }
  .branch { text-align: center; margin: 0 0 10pt; }
  .unit { margin-top: 9pt; break-inside: avoid; page-break-inside: avoid; }
  .row { margin: 1pt 0; }
  .row.sub { padding-left: 4.2em; }
  .gen { display: inline-block; width: 4.2em; font-weight: 600; }
  .details { font-weight: normal; }
</style></head><body>${buildPrintHtml(scope)}</body></html>`)

const PRINT_TREE_WIDTH_PX = 1040 // A4 landscape minus 10mm margins

const waitFrames = (count = 2): Promise<void> =>
  new Promise((resolve) => {
    const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)))
    step(count)
  })

/** Tree diagram: the tree as shown on screen (expanded branches), cards as plain text, fitted to the page width. */
const printDiagram = async (): Promise<void> => {
  const canvas = canvasRef.value
  if (!canvas) return

  // Lay the tree out in print form (no avatars/buttons) so lines and row heights match the smaller cards
  canvas.classList.add('tree-print-mode')
  let clone: HTMLElement
  try {
    await nextTick()
    await waitFrames()
    equalizeCardHeights()
    balanceTreeRoot()
    updateInLawLinks()
    await waitFrames(1)
    clone = canvas.cloneNode(true) as HTMLElement
  } finally {
    canvas.classList.remove('tree-print-mode')
    scheduleInLawLinks()
  }
  clone.style.zoom = '1'

  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((node) => node.outerHTML).join('\n')
  const branchText = lineageKey.value
    ? `Dòng trực hệ của ${lineageLabel.value}`
    : selectedRootLabel.value
      ? `Nhánh: ${selectedRootLabel.value}`
      : ''
  const branch = branchText ? `<p class="print-branch">${escapeHtml(branchText)}</p>` : ''

  await printDocument(
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><base href="${location.origin}/">
<title>${escapeHtml(document.title)}</title>${styles}
<style>
  @page { size: A4 landscape; margin: 10mm; }
  html, body { margin: 0 !important; padding: 0 !important; min-height: 0 !important; background: #fff !important; }
  body { color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-title { margin: 0 0 2pt; text-align: center; font: 600 15pt 'Noto Serif', serif; }
  .print-branch { margin: 0 0 6pt; text-align: center; font: 11pt 'Noto Serif', serif; }
  .tree-canvas { min-width: 0 !important; margin: 0 auto !important; }
</style></head><body><h1 class="print-title">${escapeHtml(document.title)}</h1>${branch}</body></html>`,
    async (doc) => {
      doc.body.appendChild(doc.importNode(clone, true))
      await (doc.fonts?.ready ?? Promise.resolve())
      const printed = doc.body.querySelector<HTMLElement>('.tree-canvas')
      if (printed) {
        printed.style.zoom = String(Math.min(1, PRINT_TREE_WIDTH_PX / Math.max(1, printed.scrollWidth)))
      }
    },
  )
}

const printAs = async (layout: PrintLayout): Promise<void> => {
  if (!canPrint.value || isPrinting.value) return
  isPrintMenuOpen.value = false
  isPrinting.value = true
  try {
    if (layout === 'list') {
      await printList(currentPrintScope())
      return
    }

    // Diagram of the direct line: it is already on screen; open everything under the chosen person and print.
    if (printScopeMode.value === 'lineage' && lineageKey.value) {
      const previousAllExpanded = isAllExpanded.value
      expandRequest.value = { keys: new Set(units.value.unitMap.keys()), nonce: Date.now() }
      isAllExpanded.value = true
      await nextTick()
      await waitFrames(3)
      try {
        await printDiagram()
      } finally {
        if (!previousAllExpanded) {
          expandRequest.value = { keys: new Set(), nonce: Date.now(), collapse: true }
          isAllExpanded.value = false
        }
      }
      return
    }

    // Diagram: show the chosen branch (or the whole tree) fully expanded, print it, then put the view back.
    const previousKey = selectedUnitKey.value
    const previousLineage = lineageKey.value
    const previousAllExpanded = isAllExpanded.value
    const targetKey = printPersonUnitKey.value ?? null
    printBranchOnly.value = Boolean(targetKey)
    lineageKey.value = null
    if (targetKey !== previousKey || printBranchOnly.value || previousLineage) {
      resetExpandState()
      selectedUnitKey.value = targetKey
      await nextTick()
    }
    expandRequest.value = { keys: new Set(units.value.unitMap.keys()), nonce: Date.now() }
    isAllExpanded.value = true
    await nextTick()
    await waitFrames(3)

    try {
      await printDiagram()
    } finally {
      if (targetKey !== previousKey || printBranchOnly.value || previousLineage) {
        printBranchOnly.value = false
        resetExpandState()
        selectedUnitKey.value = previousKey
        lineageKey.value = previousLineage
      } else if (!previousAllExpanded) {
        expandRequest.value = { keys: new Set(), nonce: Date.now(), collapse: true }
        isAllExpanded.value = false
      }
      void centerOnRoot()
    }
  } finally {
    isPrinting.value = false
  }
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
    if (lineageKey.value && !currentUnitMap.has(lineageKey.value)) {
      lineageKey.value = null
      lineageMemberId.value = null
    }
  },
)

watch([selectedUnitKey, lineageKey], () => {
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

// On load, open the tree on this browser's default person (★) once the tree can be seen (door open, data in).
// Runs once, a moment after the initial centring so it isn't scrolled back to the top.
let hasFocusedDefault = false
watch(
  [gateOpen, () => units.value.memberToUnitKey],
  ([open, memberToUnitKey]) => {
    const id = defaultMemberId.value
    if (hasFocusedDefault || !open || !id || !memberToUnitKey.has(id)) {
      return
    }
    hasFocusedDefault = true
    setTimeout(() => void goToMember(id), 400)
  },
  { immediate: true },
)

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
    document.addEventListener('pointerdown', onDocumentPointerDown)
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
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  cancelAnimationFrame(linkFrame)
  document.documentElement.classList.remove('tree-pseudo-full-view')
  if (highlightTimer) {
    clearTimeout(highlightTimer)
  }
})
</script>

<template>
  <!-- Block 1: ngày giỗ bar and the đám giỗ / Lễ Tết lists -->
  <section v-if="notificationMonths > 0" class="anniversary-panel" aria-label="Lịch giỗ và Lễ Tết">
    <AnniversaryBar
      class="tree-anniversary"
      :members="members"
      :include-hidden="canManage"
      :months="notificationMonths"
      :lunar-events="lunarEvents"
      :show-memorial-place="showMemorialPlace"
      @select="goToMember"
    />

    <AnniversaryList
      class="tree-anniversary-list"
      :members="members"
      :include-hidden="canManage"
      :months="notificationMonths"
      :lunar-events="lunarEvents"
      :show-memorial-place="showMemorialPlace"
      @select="goToMember"
    />
  </section>

  <!-- Block 2: the gia phả -->
  <section
    ref="treeWrapperRef"
    class="tree-wrapper"
    :class="{ 'full-view-active': isFullView, 'pseudo-full-view': isPseudoFullView }"
    aria-labelledby="tree-block-title"
  >
    <h2 id="tree-block-title" class="tree-block-title">Gia Phả</h2>

    <dl v-if="members.length" class="tree-stats" aria-label="Thống kê gia phả">
      <div class="stat">
        <dt>Tổng số thành viên</dt>
        <dd>{{ treeStats.total }}</dd>
      </div>
      <div class="stat stat--living">
        <dt>Còn sống</dt>
        <dd>{{ treeStats.living }}</dd>
      </div>
      <div class="stat">
        <dt>Số đời</dt>
        <dd>{{ treeStats.generations }}</dd>
      </div>
    </dl>

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
        <!-- All the view tools sit behind one button; it slides them out to its left -->
        <Transition name="tools-tray">
        <div v-show="isToolsOpen" id="tree-tools" class="tools-tray" role="group" aria-label="Công cụ xem gia phả">
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
        <div ref="printMenuRef" class="print-menu-wrap">
          <button
            type="button"
            class="full-view-btn print-btn"
            title="In gia phả"
            aria-haspopup="menu"
            :aria-expanded="isPrintMenuOpen"
            :disabled="isPrinting"
            @click="togglePrintMenu"
          >
            <span class="btn-icon" aria-hidden="true">🖨</span>
            <span class="btn-label">In</span>
          </button>
          <div v-if="isPrintMenuOpen" class="print-menu" role="dialog" aria-label="In gia phả" @keydown.esc="isPrintMenuOpen = false">
            <p class="print-menu-title">1. Chọn người cần in</p>
            <label class="print-scope" :class="{ 'is-disabled': !lineageKey }">
              <input v-model="printScopeMode" type="radio" value="lineage" :disabled="!lineageKey" />
              <span v-if="lineageKey">Dòng trực hệ đã chọn <small>({{ lineageLabel }})</small></span>
              <span v-else>Dòng trực hệ đã chọn <small>(chưa chọn — nhấn "Chọn" trên thẻ một người)</small></span>
            </label>
            <label class="print-scope">
              <input v-model="printScopeMode" type="radio" value="all" />
              <span>Toàn bộ gia phả</span>
            </label>
            <label class="print-scope">
              <input v-model="printScopeMode" type="radio" value="person" />
              <span>Một người và con cháu</span>
            </label>
            <div v-if="printScopeMode === 'person'" class="print-person">
              <SearchableMemberSelect
                v-model="printPersonId"
                list-id="print-person-members"
                :members="printableMembers"
                placeholder="Tìm tên người cần in"
              />
            </div>
            <p class="print-menu-title">2. Chọn kiểu in</p>
            <button type="button" class="print-option" :disabled="!canPrint" @click="printAs('list')">
              <strong>📄 Danh sách chữ</strong>
              <span>Từ trên xuống, mỗi đời thụt vào một bậc · A4 dọc</span>
            </button>
            <button type="button" class="print-option" :disabled="!canPrint" @click="printAs('tree')">
              <strong>🌳 Sơ đồ cây</strong>
              <span>Toàn bộ cây con của người đã chọn, mở rộng hết · A4 ngang</span>
            </button>
          </div>
        </div>
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
        </Transition>
        <button
          type="button"
          class="full-view-btn tools-toggle"
          :class="{ 'is-open': isToolsOpen }"
          aria-controls="tree-tools"
          :aria-expanded="isToolsOpen"
          :title="isToolsOpen ? 'Ẩn công cụ' : 'Công cụ: thu phóng, mở rộng, tìm kiếm, in, Full view'"
          @click="toggleTools"
        >
          <span class="btn-icon tools-icon" aria-hidden="true">{{ isToolsOpen ? '✕' : '☰' }}</span>
          <span class="tools-label">{{ isToolsOpen ? 'Ẩn' : 'Công cụ' }}</span>
        </button>
      </div>
    </div>

    <p v-if="fullViewError" class="full-view-error">{{ fullViewError }}</p>

    <div v-if="selectedUnitKey || lineageKey" class="detail-toolbar">
      <p v-if="lineageKey">
        Đang xem dòng trực hệ của:
        <strong>{{ lineageLabel }}</strong>
      </p>
      <p v-else>
        Đang xem chi tiết nhánh của:
        <strong>{{ selectedRootLabel }}</strong>
      </p>
      <button type="button" @click="clearFocusedTree">{{ lineageKey ? 'Bỏ chọn' : 'Xem toàn bộ cây' }}</button>
    </div>

    <div ref="canvasRef" class="tree-canvas" :style="{ zoom }">
      <!-- Lines for a married-in child: down from their parents, and across to the partner they married -->
      <svg class="inlaw-links" aria-hidden="true">
        <path v-for="link in inLawLinks" :key="link.key" :d="link.d" :class="{ 'is-dashed': link.dashed }" />
        <text v-for="label in marriageLabels" :key="label.key" :x="label.x" :y="label.y" class="marriage-label">
          {{ label.text }}
        </text>
      </svg>
      <ul class="tree-root">
        <FamilyTreeNode
          v-for="unit in selectedRootUnits"
          :key="`${lineageKey ? `line-${lineageKey}` : selectedUnitKey ?? 'all'}:${unit.key}`"
          :unit="unit"
          :child-units-by-unit-key="childUnitsByUnitKey"
          :child-units-resolver="resolveChildUnits"
          :expand-depth="initialExpandDepth"
          :expand-request="expandRequest"
          :highlighted-member-id="highlightedMemberId"
          :member-name-by-id="getMemberName"
          :member-by-id="getMemberById"
          :in-law-parents-resolver="getInLawParents"
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

.inlaw-links path.is-dashed {
  stroke: #b0794e;
  stroke-dasharray: 6 5;
}

.inlaw-links .marriage-label {
  fill: #8a5a2b;
  font-size: 11px;
  font-style: italic;
  font-weight: 600;
  text-anchor: middle;
}

.tree-canvas {
  position: relative;
  padding-top: 1rem; /* room for small captions above the first row (e.g. "Bên ngoại") */
  width: max-content;
  min-width: 100%;
  margin: 0 auto;
}

.detail-toolbar {
  /* stay in view while the tree is scrolled sideways (like the controls above) */
  position: sticky;
  left: 0;
  z-index: 8;
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
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
  min-width: 0;
  overflow-wrap: anywhere;
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

.print-menu-wrap {
  position: relative;
  display: inline-flex;
}

.tools-tray {
  display: flex;
  gap: 0.5rem;
  transform-origin: right center;
}

.tools-tray-enter-active,
.tools-tray-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.tools-tray-enter-from,
.tools-tray-leave-to {
  opacity: 0;
  transform: translateX(12px) scaleX(0.92);
}

.tools-toggle {
  gap: 0.1rem;
}

.tools-toggle.is-open {
  background: #7a1d16;
  border-color: #7a1d16;
  color: #fff3d0;
}

.tools-toggle.is-open:hover {
  background: #8f2419;
}

@media (prefers-reduced-motion: reduce) {
  .tools-tray-enter-active,
  .tools-tray-leave-active {
    transition: none;
  }
}

.print-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  width: min(320px, calc(100vw - 32px));
  padding: 0.6rem;
  border: 1px solid #c9a24a;
  border-radius: 10px;
  background: #fffaf0;
  box-shadow: 0 10px 24px rgba(60, 25, 8, 0.25);
}

.print-menu-title {
  margin: 0 0 0.35rem;
  padding: 0 0.3rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: #8b1d12;
}

.print-scope {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.2rem 0.3rem;
  color: #4a2e14;
  cursor: pointer;
}

.print-scope.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.print-person {
  margin: 0.2rem 0 0.3rem 1.6rem;
}

.print-menu .print-option:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.print-menu .print-menu-title + .print-option,
.print-person + .print-menu-title,
.print-scope + .print-menu-title {
  margin-top: 0.5rem;
}

.print-menu .print-option {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  width: 100%;
  margin: 0;
  padding: 0.45rem 0.55rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: #4a2e14;
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.print-menu .print-option + .print-option {
  margin-top: 0.2rem;
}

.print-menu .print-option:not(:disabled):hover,
.print-menu .print-option:focus-visible {
  border-color: #e0c690;
  background: #fff1d6;
}

.print-menu .print-option span {
  font-size: 0.78rem;
  color: #7a5a36;
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

/* Block 1 (above the gia phả): ngày giỗ bar + đám giỗ / Lễ Tết lists */
.anniversary-panel {
  margin: 0 0 1rem;
  padding: 0.6rem;
  background: linear-gradient(180deg, #f8ecd0, #f1e2bf);
  border: 2px solid #c9a24a;
  border-radius: 12px;
  box-shadow:
    inset 0 0 0 3px #f8ecd0,
    inset 0 0 0 4px rgba(155, 58, 36, 0.35),
    0 8px 18px rgba(60, 20, 8, 0.18);
}

.tree-anniversary {
  margin: 0 0 0.6rem;
  max-width: none;
}

.tree-anniversary-list {
  margin-bottom: 0;
}

@media (max-width: 640px) {
  .anniversary-panel {
    padding: 0.4rem;
    border-radius: 10px;
  }
}

/* Name of block 2, centred in the frame (stays put while the tree scrolls sideways) */
.tree-block-title {
  position: sticky;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  margin: 0 0 0.7rem;
  font-family: 'Noto Serif', Georgia, serif;
  font-size: clamp(1.15rem, 2.4vw, 1.5rem);
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #7a1d16;
}

.tree-block-title::before,
.tree-block-title::after {
  content: '';
  width: min(120px, 18vw);
  border-top: 1px solid #c9a24a;
}

/* Totals strip */
.tree-stats {
  position: sticky;
  left: 0;
  z-index: 9;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.45rem;
  margin: 0 0 0.8rem;
  padding: 0;
}

.tree-stats .stat {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin: 0;
  padding: 0.25rem 0.75rem;
  border: 1px solid #c9a24a;
  border-radius: 999px;
  background: #fffaf0;
  color: #5a3414;
  white-space: nowrap;
}

.tree-stats dt {
  font-size: 0.85rem;
}

.tree-stats dd {
  margin: 0;
  font-weight: 700;
  font-size: 1rem;
  color: #8b1d12;
}

.tree-stats .stat--living dd {
  color: #2f6b2f;
}

.tree-stats .stat--deceased dd {
  color: #6b6458;
}

.full-view-active .tree-stats {
  display: none;
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

  .tree-stats {
    gap: 0.3rem;
    margin-bottom: 0.55rem;
  }

  .tree-stats .stat {
    padding: 0.15rem 0.5rem;
    gap: 0.3rem;
  }

  .tree-stats dt {
    font-size: 0.72rem;
  }

  .tree-stats dd {
    font-size: 0.85rem;
  }

  .control-buttons {
    width: 100%;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .tools-tray {
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
