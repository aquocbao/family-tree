import type { FamilyMember, FamilyTreeSettings } from '../types/family'
import type { LunarEvent } from './lunar-events'
import { spouseIdsOf } from './spouses'

/** One entry in the super admin's review list: what happened to whom, and the field-by-field details. */
export interface PendingChange {
  kind: 'added' | 'removed' | 'changed' | 'settings'
  title: string
  details: string[]
}

const GENDER_LABELS: Record<string, string> = { male: 'Nam', female: 'Nữ', other: 'Khác' }

const EMPTY = '(trống)'

/** "1950-03-08" → "08/03/1950"; anything else is shown as typed. */
const formatDate = (value?: string): string => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value?.trim() || EMPTY
}

const yesNo = (value?: boolean): string => (value ? 'Có' : 'Không')

type MemberField = {
  label: string
  read: (member: FamilyMember, nameOf: (id?: string) => string) => string
}

const MEMBER_FIELDS: MemberField[] = [
  { label: 'Họ tên', read: (m) => m.name?.trim() || EMPTY },
  { label: 'Giới tính', read: (m) => GENDER_LABELS[m.gender] ?? m.gender },
  { label: 'Thứ tự', read: (m) => (m.position == null ? EMPTY : String(m.position)) },
  { label: 'Ngày sinh', read: (m) => formatDate(m.birthDate) },
  { label: 'Ngày mất', read: (m) => formatDate(m.deathDate) },
  { label: 'Đã mất', read: (m) => yesNo(m.deceased) },
  { label: 'Ngày giỗ (âm lịch)', read: (m) => m.deathDateLunar?.trim() || EMPTY },
  { label: 'Nơi giỗ', read: (m, nameOf) => (m.memorialHostId ? `nhà ${nameOf(m.memorialHostId)}` : m.memorialPlace?.trim() || EMPTY) },
  { label: 'Cha', read: (m, nameOf) => nameOf(m.fatherId) },
  { label: 'Mẹ', read: (m, nameOf) => nameOf(m.motherId) },
  { label: 'Vợ/Chồng', read: (m, nameOf) => spouseIdsOf(m).map((id) => nameOf(id)).join(', ') || EMPTY },
  { label: 'Ẩn khỏi trang xem', read: (m) => yesNo(m.isHidden) },
]

const SETTING_FLAGS: { key: keyof FamilyTreeSettings; label: string }[] = [
  { key: 'showBirthDate', label: 'Hiện ngày sinh' },
  { key: 'showDeathDate', label: 'Hiện ngày mất' },
  { key: 'showSpouse', label: 'Hiện vợ/chồng' },
  { key: 'showViewDetail', label: 'Hiện nút xem chi tiết' },
  { key: 'showMemorialPlace', label: 'Hiện nơi giỗ' },
]

const eventLabel = (event: LunarEvent): string =>
  `${event.name} (${event.lastDayOfMonth ? 'cuối' : event.day}/${event.month} ${event.calendar === 'solar' ? 'dương lịch' : 'âm lịch'})`

/**
 * Everything the pending copy changes compared with the approved data, as text for the super admin:
 * members added, removed and edited (field: old → new), then settings, Lễ Tết and Lời ngỏ.
 */
export const describePendingChanges = (
  approvedMembers: FamilyMember[],
  pendingMembers: FamilyMember[],
  approvedSettings: FamilyTreeSettings,
  pendingSettings: FamilyTreeSettings,
): PendingChange[] => {
  const approvedById = new Map(approvedMembers.map((member) => [member.id, member]))
  const pendingById = new Map(pendingMembers.map((member) => [member.id, member]))
  // a name from either copy, so links to added or removed people still read well
  const nameOf = (id?: string): string =>
    id ? (pendingById.get(id)?.name ?? approvedById.get(id)?.name ?? id) : EMPTY

  const changes: PendingChange[] = []

  for (const member of pendingMembers) {
    const before = approvedById.get(member.id)
    if (!before) {
      changes.push({
        kind: 'added',
        title: `Thêm mới: ${member.name}`,
        details: MEMBER_FIELDS.filter((field) => field.label !== 'Họ tên')
          .map((field) => ({ label: field.label, value: field.read(member, nameOf) }))
          .filter(({ value }) => value !== EMPTY && value !== 'Không')
          .map(({ label, value }) => `${label}: ${value}`),
      })
      continue
    }

    const details = MEMBER_FIELDS.map((field) => ({
      label: field.label,
      from: field.read(before, nameOf),
      to: field.read(member, nameOf),
    }))
      .filter(({ from, to }) => from !== to)
      .map(({ label, from, to }) => `${label}: ${from} → ${to}`)
    if (details.length > 0) {
      changes.push({ kind: 'changed', title: `Sửa: ${before.name}`, details })
    }
  }

  for (const member of approvedMembers) {
    if (!pendingById.has(member.id)) {
      changes.push({ kind: 'removed', title: `Xóa: ${member.name}`, details: [] })
    }
  }

  const settingDetails: string[] = []
  for (const { key, label } of SETTING_FLAGS) {
    const from = approvedSettings[key] !== false
    const to = pendingSettings[key] !== false
    if (from !== to) settingDetails.push(`${label}: ${yesNo(from)} → ${yesNo(to)}`)
  }
  if ((approvedSettings.notificationMonths ?? 3) !== (pendingSettings.notificationMonths ?? 3)) {
    settingDetails.push(
      `Thông báo trước (tháng): ${approvedSettings.notificationMonths ?? 3} → ${pendingSettings.notificationMonths ?? 3}`,
    )
  }
  if (settingDetails.length > 0) {
    changes.push({ kind: 'settings', title: 'Cài đặt hiển thị', details: settingDetails })
  }

  const beforeEvents = (approvedSettings.lunarEvents ?? []).map(eventLabel)
  const afterEvents = (pendingSettings.lunarEvents ?? []).map(eventLabel)
  const eventDetails = [
    ...afterEvents.filter((label) => !beforeEvents.includes(label)).map((label) => `Thêm: ${label}`),
    ...beforeEvents.filter((label) => !afterEvents.includes(label)).map((label) => `Bỏ: ${label}`),
  ]
  if (eventDetails.length > 0) {
    changes.push({ kind: 'settings', title: 'Lễ Tết', details: eventDetails })
  }

  if (JSON.stringify(approvedSettings.loiNgo ?? null) !== JSON.stringify(pendingSettings.loiNgo ?? null)) {
    changes.push({ kind: 'settings', title: 'Lời ngỏ', details: ['Nội dung Lời ngỏ đã được sửa.'] })
  }

  return changes
}
