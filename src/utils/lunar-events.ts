// Festivals (Lễ, Tết) shown in the notification bar — on the lunar (âm lịch) or solar (dương lịch) calendar.
// The list is editable in the admin "Cài đặt" panel; this is the default when nothing is saved yet.

export type EventCalendar = 'lunar' | 'solar'

export interface LunarEvent {
  name: string
  day: number
  month: number
  /** 'solar' = dương lịch; missing/'lunar' = âm lịch. */
  calendar?: EventCalendar
  /** Last day of the lunar month (29 or 30), e.g. Giao thừa. Lunar events only. */
  lastDayOfMonth?: boolean
}

export const isSolarEvent = (event: LunarEvent): boolean => event.calendar === 'solar'

/** Days in a solar month (February counts 29 so 29/02 is allowed; it then only shows in leap years). */
export const solarDaysInMonth = (month: number): number => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31

export const DEFAULT_LUNAR_EVENTS: LunarEvent[] = [
  { name: 'Mồng 1 Tết Nguyên Đán', day: 1, month: 1 },
  { name: 'Rằm tháng Giêng (Tết Nguyên Tiêu)', day: 15, month: 1 },
  { name: 'Giỗ Tổ Hùng Vương', day: 10, month: 3 },
  { name: 'Tết Đoan Ngọ', day: 5, month: 5 },
  { name: 'Lễ Vu Lan', day: 15, month: 7 },
  { name: 'Tết Trung Thu', day: 15, month: 8 },
  { name: 'Ông Công Ông Táo', day: 23, month: 12 },
  { name: 'Giao thừa', day: 30, month: 12, lastDayOfMonth: true },
  // Dương lịch
  { name: 'Tết Dương lịch', day: 1, month: 1, calendar: 'solar' },
  { name: 'Ngày Quốc tế Phụ nữ', day: 8, month: 3, calendar: 'solar' },
  { name: 'Ngày Giải phóng miền Nam', day: 30, month: 4, calendar: 'solar' },
  { name: 'Ngày Quốc tế Lao động', day: 1, month: 5, calendar: 'solar' },
  { name: 'Quốc khánh', day: 2, month: 9, calendar: 'solar' },
  { name: 'Ngày Phụ nữ Việt Nam', day: 20, month: 10, calendar: 'solar' },
  { name: 'Ngày Nhà giáo Việt Nam', day: 20, month: 11, calendar: 'solar' },
]

export const MAX_LUNAR_EVENTS = 50
export const MAX_LUNAR_EVENT_NAME = 80

export const isValidLunarEvent = (value: unknown): value is LunarEvent => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const e = value as Record<string, unknown>
  const solar = e.calendar === 'solar'
  return (
    (e.calendar === undefined || e.calendar === 'lunar' || e.calendar === 'solar') &&
    typeof e.name === 'string' &&
    e.name.trim().length > 0 &&
    e.name.length <= MAX_LUNAR_EVENT_NAME &&
    typeof e.day === 'number' &&
    Number.isInteger(e.day) &&
    e.day >= 1 &&
    typeof e.month === 'number' &&
    Number.isInteger(e.month) &&
    e.month >= 1 &&
    e.month <= 12 &&
    e.day <= (solar ? solarDaysInMonth(e.month) : 30) &&
    (e.lastDayOfMonth === undefined || typeof e.lastDayOfMonth === 'boolean') &&
    !(solar && e.lastDayOfMonth)
  )
}

export const isValidLunarEventList = (value: unknown): value is LunarEvent[] =>
  Array.isArray(value) && value.length <= MAX_LUNAR_EVENTS && value.every(isValidLunarEvent)

export const cloneLunarEvents = (events: LunarEvent[]): LunarEvent[] =>
  events.map((e) => ({
    name: e.name,
    day: e.day,
    month: e.month,
    ...(e.calendar === 'solar' ? { calendar: 'solar' as const } : {}),
    ...(e.lastDayOfMonth && e.calendar !== 'solar' ? { lastDayOfMonth: true } : {}),
  }))
