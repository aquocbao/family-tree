<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FamilyMember } from '../types/family'
import { formatSolarDate, getUpcomingAnniversaries, weekdayName } from '../utils/anniversary'

const props = withDefaults(
  defineProps<{
    members: FamilyMember[]
    includeHidden?: boolean
    /** Ngày giỗ within this many days are highlighted as "soon". */
    soonDays?: number
  }>(),
  { includeHidden: false, soonDays: 14 },
)

const emit = defineEmits<{
  select: [id: string]
}>()

const todayKey = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
})()
const STORAGE_KEY = 'gia-pha-anniversary-dismissed'

const readDismissed = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === todayKey
  } catch {
    return false
  }
}

const isDismissed = ref(readDismissed())
const isExpanded = ref(false)

const upcoming = computed(() =>
  getUpcomingAnniversaries(
    props.members.filter((member) => props.includeHidden || !member.isHidden),
    new Date(),
    400, // look ahead a full lunar year (up to 13 months), so the bar always lists the nearest ones
  ),
)

const hasSoon = computed(() => upcoming.value.some((item) => item.daysLeft <= props.soonDays))

const VISIBLE_COUNT = 5 // show the 5 nearest; the rest behind "+N người khác"
const visibleItems = computed(() => (isExpanded.value ? upcoming.value : upcoming.value.slice(0, VISIBLE_COUNT)))

const whenLabel = (daysLeft: number): string => {
  if (daysLeft === 0) return 'Hôm nay'
  if (daysLeft === 1) return 'Ngày mai'
  return `Còn ${daysLeft} ngày`
}

const dismiss = (): void => {
  isDismissed.value = true
  try {
    localStorage.setItem(STORAGE_KEY, todayKey)
  } catch {
    // storage unavailable: hide for this visit only
  }
}
</script>

<template>
  <aside v-if="upcoming.length > 0 && !isDismissed" class="anniversary-bar" role="status" aria-live="polite">
    <div class="anniversary-inner">
      <span class="anniversary-title">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3c1.2 1.6 1.2 3 0 4.4C10.8 6 10.8 4.6 12 3z" />
          <path d="M12 8.5v8M8.5 10v6.5M15.5 10v6.5" />
          <path d="M5 16.5h14l-1.5 4.5h-11z" />
        </svg>
        {{ hasSoon ? 'Sắp đến ngày giỗ' : 'Ngày giỗ sắp tới' }}
      </span>
      <ul class="anniversary-list">
        <li v-for="item in visibleItems" :key="item.member.id">
          <button
            type="button"
            class="anniversary-item"
            :class="{ 'is-soon': item.daysLeft <= soonDays }"
            @click="emit('select', item.member.id)"
          >
            <strong>{{ item.member.name }}</strong>
            <span class="anniversary-when" :class="{ 'is-today': item.daysLeft === 0 }">{{ whenLabel(item.daysLeft) }}</span>
            <span class="anniversary-date">
              {{ item.lunarDay }}/{{ item.lunarMonth }} âm lịch · {{ weekdayName(item.date) }}, {{ formatSolarDate(item.date) }}<template
                v-if="item.count"
              > · giỗ lần thứ {{ item.count }}</template>
            </span>
          </button>
        </li>
      </ul>
      <button
        v-if="upcoming.length > VISIBLE_COUNT"
        type="button"
        class="anniversary-more"
        @click="isExpanded = !isExpanded"
      >
        {{ isExpanded ? 'Thu gọn' : `+${upcoming.length - VISIBLE_COUNT} người khác` }}
      </button>
      <button type="button" class="anniversary-close" aria-label="Ẩn thông báo hôm nay" title="Ẩn hôm nay" @click="dismiss">
        ✕
      </button>
    </div>
  </aside>
</template>

<style scoped>
.anniversary-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  margin: 0 0 0.8rem;
  color: #f6e2a8;
  background: linear-gradient(180deg, #8f2419, #6e1a14);
  border: 2px solid #c9a24a;
  border-radius: 10px;
  box-shadow:
    inset 0 0 0 3px #6e1a14,
    inset 0 0 0 4px rgba(241, 212, 138, 0.55),
    0 8px 18px rgba(60, 20, 8, 0.28);
}

.anniversary-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.9rem;
  padding: 0.6rem 2.6rem 0.6rem 0.9rem;
  position: relative;
}

.anniversary-title {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
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

.anniversary-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.anniversary-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15rem 0.5rem;
  border: 1px solid rgba(241, 212, 138, 0.55);
  border-radius: 8px;
  background: rgba(255, 244, 223, 0.08);
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
}

.anniversary-item.is-soon {
  border-color: #f1d48a;
  background: rgba(241, 212, 138, 0.2);
  box-shadow: 0 0 0 1px rgba(241, 212, 138, 0.5);
}

.anniversary-item:hover,
.anniversary-item:focus-visible {
  background: rgba(255, 244, 223, 0.18);
}

.anniversary-item strong {
  color: #fff3d0;
}

.anniversary-when {
  font-weight: 700;
  color: #f1d48a;
}

.anniversary-when.is-today {
  color: #fff;
  background: #c9a24a;
  color: #5e130e;
  border-radius: 999px;
  padding: 0 0.45rem;
}

.anniversary-date {
  font-size: 0.85rem;
  color: #ecd6a0;
}

.anniversary-more {
  border: 0;
  background: transparent;
  color: #f1d48a;
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}

.anniversary-close {
  position: absolute;
  top: 50%;
  right: 0.6rem;
  transform: translateY(-50%);
  width: 1.8rem;
  height: 1.8rem;
  border: 1px solid rgba(241, 212, 138, 0.6);
  border-radius: 50%;
  background: transparent;
  color: #f1d48a;
  cursor: pointer;
  line-height: 1;
}

.anniversary-close:hover {
  background: rgba(255, 244, 223, 0.15);
}

@media (max-width: 640px) {
  .anniversary-bar {
    margin: 0 0 0.6rem;
    border-radius: 8px;
  }

  .anniversary-inner {
    padding: 0.5rem 2.4rem 0.5rem 0.65rem;
    font-size: 0.85rem;
  }

  .anniversary-list,
  .anniversary-item {
    width: 100%;
  }

  .anniversary-date {
    font-size: 0.78rem;
  }
}
</style>
