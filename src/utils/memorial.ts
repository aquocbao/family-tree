import type { FamilyMember } from '../types/family'
import { solarDateTextToLunarText } from './lunar'

/** Deceased = marked "đã mất" (date unknown), or has a death date (lunar typed in, or from the solar date). */
export const isDeceased = (member: FamilyMember): boolean =>
  Boolean(member.deceased || member.deathDateLunar?.trim() || solarDateTextToLunarText(member.deathDate))

export const honorific = (member: FamilyMember): string =>
  member.gender === 'male' ? 'ông ' : member.gender === 'female' ? 'bà ' : ''

/** "Nhà ông PHẠM VĂN A" for the chosen host, or the older free-text place. */
export const memorialPlaceLabel = (
  member: FamilyMember,
  memberById: (id?: string) => FamilyMember | undefined,
): string => {
  const host = member.memorialHostId ? memberById(member.memorialHostId) : undefined
  if (host) {
    return `Nhà ${honorific(host)}${host.name}`
  }
  return member.memorialPlace?.trim() ?? ''
}
