import type { LunarEvent } from '../utils/lunar-events'

export type FamilyGender = 'female' | 'male' | 'other'

export interface FamilyMember {
  id: string
  name: string
  position?: number
  birthDate?: string
  deathDate?: string
  /** Lunar death date as entered by admin (free text). Empty → computed from deathDate. */
  deathDateLunar?: string
  gender: FamilyGender
  fatherId?: string
  motherId?: string
  spouseId?: string
  spouseOnRight?: boolean
  isHidden?: boolean
}

export interface FamilyDatabase {
  members: FamilyMember[]
  settings?: FamilyTreeSettings
  pendingMembers?: FamilyMember[]
  pendingSettings?: FamilyTreeSettings
  pendingUpdatedAt?: string
}

export interface FamilyUnit {
  key: string
  members: FamilyMember[]
}

export interface FamilyTreeSettings {
  showBirthDate: boolean
  showDeathDate: boolean
  showSpouse: boolean
  showViewDetail: boolean
  /** Notification bar: show ngày giỗ / Lễ Tết within this many months (0 = hide the bar). Default 3. */
  notificationMonths?: number
  /** Lễ Tết shown in the notification bar (editable in admin settings). Missing = default list. */
  lunarEvents?: LunarEvent[]
  showDateInfo?: boolean
}
