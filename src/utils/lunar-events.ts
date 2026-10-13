// Lunar calendar festivals (Lễ, Tết) shown in the notification bar.
// The list is editable in the admin "Cài đặt" panel; this is the default when nothing is saved yet.

export interface LunarEvent {
  name: string
  day: number
  month: number
  /** Last day of the lunar month (29 or 30), e.g. Giao thừa. */
  lastDayOfMonth?: boolean
}

export const DEFAULT_LUNAR_EVENTS: LunarEvent[] = [
  { name: 'Mồng 1 Tết Nguyên Đán', day: 1, month: 1 },
  { name: 'Rằm tháng Giêng (Tết Nguyên Tiêu)', day: 15, month: 1 },
  { name: 'Giỗ Tổ Hùng Vương', day: 10, month: 3 },
  { name: 'Tết Đoan Ngọ', day: 5, month: 5 },
  { name: 'Lễ Vu Lan', day: 15, month: 7 },
  { name: 'Tết Trung Thu', day: 15, month: 8 },
  { name: 'Ông Công Ông Táo', day: 23, month: 12 },
  { name: 'Giao thừa', day: 30, month: 12, lastDayOfMonth: true },
]

export const MAX_LUNAR_EVENTS = 50
export const MAX_LUNAR_EVENT_NAME = 80

export const isValidLunarEvent = (value: unknown): value is LunarEvent => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const e = value as Record<string, unknown>
  return (
    typeof e.name === 'string' &&
    e.name.trim().length > 0 &&
    e.name.length <= MAX_LUNAR_EVENT_NAME &&
    typeof e.day === 'number' &&
    Number.isInteger(e.day) &&
    e.day >= 1 &&
    e.day <= 30 &&
    typeof e.month === 'number' &&
    Number.isInteger(e.month) &&
    e.month >= 1 &&
    e.month <= 12 &&
    (e.lastDayOfMonth === undefined || typeof e.lastDayOfMonth === 'boolean')
  )
}

export const isValidLunarEventList = (value: unknown): value is LunarEvent[] =>
  Array.isArray(value) && value.length <= MAX_LUNAR_EVENTS && value.every(isValidLunarEvent)

export const cloneLunarEvents = (events: LunarEvent[]): LunarEvent[] =>
  events.map((e) => ({ name: e.name, day: e.day, month: e.month, ...(e.lastDayOfMonth ? { lastDayOfMonth: true } : {}) }))
