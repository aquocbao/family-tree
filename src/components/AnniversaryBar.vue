<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { FamilyMember } from '../types/family'
import { formatSolarDate, getUpcomingAnniversaries, getUpcomingLunarEvents, weekdayName } from '../utils/anniversary'

const props = withDefaults(
  defineProps<{
    members: FamilyMember[]
    includeHidden?: boolean
    /** Ngày giỗ within this many days are highlighted as "soon". */
    soonDays?: number
    /** How many of the nearest ngày giỗ to show. */
    limit?: number
    /** How many of the nearest lunar festivals (Tết, Trung Thu...) to show. */
    eventLimit?: number
    /** Only show ngày giỗ / festivals within this many months from today. */
    months?: number
  }>(),
  { includeHidden: false, soonDays: 14, limit: 5, eventLimit: 5, months: 3 },
)

const emit = defineEmits<{
  select: [id: string]
}>()

// Number of days from today until the same date `months` months later (e.g. 13/10 → 13/01).
const windowDays = computed(() => {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const end = new Date(start.getFullYear(), start.getMonth() + props.months, start.getDate())
  return Math.round((end.getTime() - start.getTime()) / 86400000)
})

const upcoming = computed(() =>
  getUpcomingAnniversaries(
    props.members.filter((member) => props.includeHidden || !member.isHidden),
    new Date(),
    windowDays.value,
  ).slice(0, props.limit),
)

const upcomingEvents = computed(() => getUpcomingLunarEvents(new Date(), windowDays.value).slice(0, props.eventLimit))

// One list for the ticker: ngày giỗ and festivals, nearest first.
type TickerItem =
  | { kind: 'gio'; key: string; daysLeft: number; data: (typeof upcoming.value)[number] }
  | { kind: 'event'; key: string; daysLeft: number; data: (typeof upcomingEvents.value)[number] }

const items = computed<TickerItem[]>(() =>
  [
    ...upcoming.value.map((data) => ({ kind: 'gio' as const, key: `gio-${data.member.id}`, daysLeft: data.daysLeft, data })),
    ...upcomingEvents.value.map((data) => ({
      kind: 'event' as const,
      key: `event-${data.event.name}`,
      daysLeft: data.daysLeft,
      data,
    })),
  ].sort((a, b) => a.daysLeft - b.daysLeft),
)

const hasSoon = computed(() => upcoming.value.some((item) => item.daysLeft <= props.soonDays))

// Ticker speed: roughly the same reading speed whatever the number of entries.
const duration = computed(() => `${Math.max(14, items.value.length * 9)}s`)

// Scroll only when the entries don't fit in the bar.
const tickerRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement[] | null>(null)
const isOverflowing = ref(false)
let resizeObserver: ResizeObserver | undefined

const measure = (): void => {
  const ticker = tickerRef.value
  const list = listRef.value?.[0]
  if (!ticker || !list) {
    isOverflowing.value = false
    return
  }
  isOverflowing.value = list.scrollWidth > ticker.clientWidth + 1
}

const observe = async (): Promise<void> => {
  await nextTick()
  resizeObserver?.disconnect()
  if (typeof ResizeObserver === 'undefined') {
    measure()
    return
  }
  resizeObserver = new ResizeObserver(() => measure())
  if (tickerRef.value) resizeObserver.observe(tickerRef.value)
  const list = listRef.value?.[0]
  if (list) resizeObserver.observe(list)
  measure()
}

onMounted(() => {
  void observe()
  // Fonts loading late can change the text width.
  void document.fonts?.ready.then(() => measure())
})

watch(items, () => {
  void observe()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

const whenLabel = (daysLeft: number): string => {
  if (daysLeft === 0) return 'Hôm nay'
  if (daysLeft === 1) return 'Ngày mai'
  return `Còn ${daysLeft} ngày`
}
</script>

<template>
  <aside v-if="items.length > 0" class="anniversary-bar" role="status" aria-live="off">
    <span class="anniversary-title">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3c1.2 1.6 1.2 3 0 4.4C10.8 6 10.8 4.6 12 3z" />
        <path d="M12 8.5v8M8.5 10v6.5M15.5 10v6.5" />
        <path d="M5 16.5h14l-1.5 4.5h-11z" />
      </svg>
      {{ hasSoon ? 'Sắp đến ngày giỗ' : 'Lịch âm sắp tới' }}
    </span>

    <!-- Ticker: when the entries don't fit, they scroll left → right (hover pauses); the list is then rendered twice for a seamless loop. -->
    <div
      ref="tickerRef"
      class="ticker"
      :class="{ 'is-scrolling': isOverflowing }"
      :style="{ '--ticker-duration': duration }"
    >
      <div class="ticker-track">
        <ul
          v-for="copy in isOverflowing ? 2 : 1"
          :key="copy"
          ref="listRef"
          class="ticker-list"
          :aria-hidden="copy === 2 ? 'true' : undefined"
        >
          <li v-for="item in items" :key="`${copy}-${item.key}`">
            <button
              v-if="item.kind === 'gio'"
              type="button"
              class="anniversary-item"
              :class="{ 'is-soon': item.daysLeft <= soonDays }"
              :tabindex="copy === 2 ? -1 : undefined"
              @click="emit('select', item.data.member.id)"
            >
              <span class="item-tag">Giỗ</span>
              <strong>{{ item.data.member.name }}</strong>
              <span class="anniversary-when" :class="{ 'is-today': item.daysLeft === 0 }">{{ whenLabel(item.daysLeft) }}</span>
              <span class="anniversary-date">
                {{ item.data.lunarDay }}/{{ item.data.lunarMonth }} âm lịch · {{ weekdayName(item.data.date) }},
                {{ formatSolarDate(item.data.date) }}<template v-if="item.data.count"> · giỗ lần thứ {{ item.data.count }}</template>
              </span>
            </button>
            <span v-else class="anniversary-item is-event">
              <span class="item-tag item-tag--event">Lễ Tết</span>
              <strong>{{ item.data.event.name }}</strong>
              <span class="anniversary-when" :class="{ 'is-today': item.daysLeft === 0 }">{{ whenLabel(item.daysLeft) }}</span>
              <span class="anniversary-date">
                {{ item.data.lunarDay }}/{{ item.data.lunarMonth }} âm lịch · {{ weekdayName(item.data.date) }},
                {{ formatSolarDate(item.data.date) }}
              </span>
            </span>
          </li>
        </ul>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.anniversary-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0 0.8rem;
  padding: 0.45rem 0.6rem 0.45rem 0.9rem;
  color: #f6e2a8;
  background: linear-gradient(180deg, #8f2419, #6e1a14);
  border: 2px solid #c9a24a;
  border-radius: 10px;
  box-shadow:
    inset 0 0 0 3px #6e1a14,
    inset 0 0 0 4px rgba(241, 212, 138, 0.55),
    0 8px 18px rgba(60, 20, 8, 0.28);
  overflow: hidden;
}

.anniversary-title {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding-right: 0.75rem;
  border-right: 1px solid rgba(241, 212, 138, 0.45);
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.anniversary-title svg {
  width: 1.3em;
  height: 1.3em;
  fill: none;
  stroke: #f1d48a;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ticker {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.ticker-track {
  display: flex;
  width: max-content;
}

/* Only when the entries are wider than the bar */
.ticker.is-scrolling {
  /* soft fade at both ends */
  mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
}

.ticker.is-scrolling .ticker-track {
  animation: ticker-left-to-right var(--ticker-duration, 30s) linear infinite;
}

.ticker:hover .ticker-track,
.ticker:focus-within .ticker-track {
  animation-play-state: paused;
}

/* Track holds two identical copies: sliding from -50% to 0 moves everything left → right and loops seamlessly */
@keyframes ticker-left-to-right {
  from {
    transform: translateX(-50%);
  }
  to {
    transform: translateX(0);
  }
}

.ticker-list {
  display: flex;
  gap: 0.6rem;
  margin: 0;
  padding: 0 0.6rem 0 0;
  list-style: none;
}

.anniversary-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  white-space: nowrap;
  border: 1px solid rgba(241, 212, 138, 0.55);
  border-radius: 8px;
  background: rgba(255, 244, 223, 0.08);
  color: inherit;
  font: inherit;
  padding: 0.3rem 0.65rem;
  cursor: pointer;
}

.anniversary-item.is-event {
  cursor: default;
  border-style: dashed;
}

.item-tag {
  align-self: center;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0.05rem 0.4rem;
  border-radius: 4px;
  background: rgba(241, 212, 138, 0.18);
  color: #f1d48a;
}

.item-tag--event {
  background: #c9a24a;
  color: #5e130e;
}

.anniversary-item.is-soon {
  border-color: #f1d48a;
  background: rgba(241, 212, 138, 0.2);
  box-shadow: 0 0 0 1px rgba(241, 212, 138, 0.5);
}

button.anniversary-item:hover,
button.anniversary-item:focus-visible {
  background: rgba(255, 244, 223, 0.22);
}

.anniversary-item strong {
  color: #fff3d0;
}

.anniversary-when {
  font-weight: 700;
  color: #f1d48a;
}

.anniversary-when.is-today {
  background: #c9a24a;
  color: #5e130e;
  border-radius: 999px;
  padding: 0 0.45rem;
}

.anniversary-date {
  font-size: 0.85rem;
  color: #ecd6a0;
}

/* People who prefer less motion get a static, swipeable row instead of the ticker */
@media (prefers-reduced-motion: reduce) {
  .ticker,
  .ticker.is-scrolling {
    overflow-x: auto;
    mask-image: none;
    -webkit-mask-image: none;
  }

  .ticker.is-scrolling .ticker-track {
    animation: none;
  }

  .ticker-list[aria-hidden='true'] {
    display: none;
  }
}

@media (max-width: 640px) {
  .anniversary-bar {
    gap: 0.5rem;
    padding: 0.4rem 0.45rem 0.4rem 0.6rem;
    border-radius: 8px;
    font-size: 0.85rem;
  }

  .anniversary-title {
    padding-right: 0.5rem;
    font-size: 0;
    gap: 0;
  }

  .anniversary-title svg {
    width: 20px;
    height: 20px;
  }

  .anniversary-date {
    font-size: 0.78rem;
  }
}
</style>
