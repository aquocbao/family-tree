// Upcoming death anniversaries (ngày giỗ), observed by the lunar calendar.
import type { FamilyMember } from '../types/family'
import { solarToLunar } from './lunar'

export interface UpcomingAnniversary {
  member: FamilyMember
  /** Solar date of this year's ngày giỗ. */
  date: Date
  /** 0 = today, 1 = tomorrow, ... */
  daysLeft: number
  lunarDay: number
  lunarMonth: number
  /** Giỗ lần thứ N (only when the death year is known). */
  count?: number
}

interface LunarDeath {
  day: number
  month: number
  year?: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Reads "15-03-2024", "15/3", "15.03", "ngày 15 tháng 3 năm Giáp Thìn", "15 tháng 3"... */
export const parseLunarDayMonth = (text?: string): LunarDeath | null => {
  if (!text) {
    return null
  }

  const value = text.trim().toLowerCase()
  let match = /(\d{1,2})\s*tháng\s*(\d{1,2})/.exec(value)
  if (!match) {
    match = /^(?:ngày\s*)?(\d{1,2})\s*[-/.]\s*(\d{1,2})/.exec(value)
  }
  if (!match) {
    return null
  }

  const day = Number(match[1])
  const month = Number(match[2])
  if (day < 1 || day > 30 || month < 1 || month > 12) {
    return null
  }

  const yearMatch = /[-/.]\s*\d{1,2}\s*(?:nhuận\s*)?[-/.]\s*(\d{4})/.exec(value)
  return { day, month, year: yearMatch ? Number(yearMatch[1]) : undefined }
}

/** Lunar day/month of death: the admin-entered lunar date wins, otherwise converted from the solar date. */
export const lunarDeathOf = (member: FamilyMember): LunarDeath | null => {
  const manual = parseLunarDayMonth(member.deathDateLunar)
  if (manual) {
    return manual
  }

  const iso = member.deathDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(member.deathDate) : null
  if (!iso) {
    return null
  }

  const lunar = solarToLunar(Number(iso[3]), Number(iso[2]), Number(iso[1]))
  return { day: lunar.day, month: lunar.month, year: lunar.year }
}

const lunarOf = (date: Date) => solarToLunar(date.getDate(), date.getMonth() + 1, date.getFullYear())

/**
 * Members whose ngày giỗ falls within the next `days` days (today included).
 * Giỗ is kept in the regular (non-leap) month; if the month has only 29 days, day 30 is observed on day 29.
 */
export const getUpcomingAnniversaries = (
  members: FamilyMember[],
  today: Date = new Date(),
  days = 14,
): UpcomingAnniversary[] => {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const calendar = Array.from({ length: days + 2 }, (_, offset) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset)
    return { date, lunar: lunarOf(date) }
  })

  const results: UpcomingAnniversary[] = []
  for (const member of members) {
    const death = lunarDeathOf(member)
    if (!death) {
      continue
    }

    for (let offset = 0; offset <= days; offset += 1) {
      const { date, lunar } = calendar[offset]
      if (lunar.leap || lunar.month !== death.month) {
        continue
      }

      const isLastDayOfShortMonth = death.day === 30 && lunar.day === 29 && calendar[offset + 1].lunar.day === 1
      if (lunar.day !== death.day && !isLastDayOfShortMonth) {
        continue
      }

      const count = death.year ? lunar.year - death.year : undefined
      if (count !== undefined && count < 1) {
        break // died this lunar year: no anniversary yet
      }

      results.push({ member, date, daysLeft: offset, lunarDay: death.day, lunarMonth: death.month, count })
      break
    }
  }

  return results.sort((a, b) => a.daysLeft - b.daysLeft || a.member.name.localeCompare(b.member.name, 'vi'))
}

export const formatSolarDate = (date: Date): string =>
  `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']
export const weekdayName = (date: Date): string => WEEKDAYS[date.getDay()]
