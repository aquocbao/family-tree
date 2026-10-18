import type { LunarEvent } from '../utils/lunar-events'
import type { LoiNgo } from '../data/loi-ngo'

export type FamilyGender = 'female' | 'male' | 'other'

export interface FamilyMember {
  id: string
  name: string
  position?: number
  birthDate?: string
  deathDate?: string
  /** Lunar death date as entered by admin (free text). Empty → computed from deathDate. */
  deathDateLunar?: string
  /** Nơi tổ chức đám giỗ: ID of the living member whose home hosts it */
  memorialHostId?: string
  /** (older data) Nơi tổ chức đám giỗ as free text; shown when no host is chosen */
  memorialPlace?: string
  gender: FamilyGender
  fatherId?: string
  motherId?: string
  /** Vợ/chồng, in order (Vợ 1, Vợ 2, …). Kept in sync on both people. */
  spouseIds?: string[]
  /** First spouse (= spouseIds[0]); kept for older data and code. */
  spouseId?: string
  /** @deprecated Divorce was removed; an older value is read as one more spouse. */
  formerSpouseId?: string
  spouseOnRight?: boolean
  /** Đã mất, ngày mất không rõ */
  deceased?: boolean
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
  /** Left → right as drawn. */
  members: FamilyMember[]
  /** Several spouses: the person in the middle… */
  host?: FamilyMember
  /** …and their spouses in order (Vợ/Chồng 1, 2, …). */
  spouses?: FamilyMember[]
}

export interface FamilyTreeSettings {
  showBirthDate: boolean
  showDeathDate: boolean
  showSpouse: boolean
  showViewDetail: boolean
  /** Show "Nơi giỗ" on cards and in the notification bar (default true) */
  showMemorialPlace?: boolean
  /** Notification bar: show ngày giỗ / Lễ Tết within this many months (0 = hide the bar). Default 3. */
  notificationMonths?: number
  /** Lễ Tết shown in the notification bar (editable in admin settings). Missing = default list. */
  lunarEvents?: LunarEvent[]
  /** Lời ngỏ text (editable in admin). Missing = DEFAULT_LOI_NGO. */
  loiNgo?: LoiNgo
  showDateInfo?: boolean
}
