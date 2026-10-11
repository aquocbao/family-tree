export type FamilyGender = 'female' | 'male' | 'other'

export interface FamilyMember {
  id: string
  name: string
  position?: number
  birthDate?: string
  deathDate?: string
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
  showDateInfo?: boolean
}
