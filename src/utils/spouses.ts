import type { FamilyMember } from '../types/family'

/**
 * All spouses of a member, in order (Vợ/Chồng 1, 2, …).
 * Reads the list `spouseIds`, plus older data: `spouseId` and the removed divorce field `formerSpouseId`.
 */
export const spouseIdsOf = (member: FamilyMember): string[] => {
  const ids: string[] = []
  for (const id of [...(member.spouseIds ?? []), member.spouseId, member.formerSpouseId]) {
    const value = id?.trim()
    if (value && value !== member.id && !ids.includes(value)) {
      ids.push(value)
    }
  }
  return ids
}

/** "Vợ 2" / "Chồng 2" / "Vợ/Chồng 2" for the n-th spouse (1-based) of `host`. */
export const spouseOrderLabel = (host: FamilyMember, spouse: FamilyMember, order: number): string => {
  const word =
    spouse.gender === 'female' ? 'Vợ' : spouse.gender === 'male' ? 'Chồng' : host.gender === 'male' ? 'Vợ' : host.gender === 'female' ? 'Chồng' : 'Vợ/Chồng'
  return `${word} ${order}`
}
