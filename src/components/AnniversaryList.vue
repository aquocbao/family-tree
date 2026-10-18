<script setup lang="ts">
import { computed } from 'vue'
import type { FamilyMember } from '../types/family'
import { memorialPlaceLabel } from '../utils/memorial'
import type { LunarEvent } from '../utils/lunar-events'
import {
  daysInNextMonths,
  formatSolarDate,
  getUpcomingAnniversaries,
  getUpcomingLunarEvents,
  weekdayName,
} from '../utils/anniversary'

/** What the AnniversaryBar shows (same window and limits), as two blocks to read at a glance: đám giỗ, then Lễ Tết. */
const props = withDefaults(
  defineProps<{
    members: FamilyMember[]
    includeHidden?: boolean
    soonDays?: number
    limit?: number
    eventLimit?: number
    months?: number
    /** Lễ Tết list (admin-editable). Missing = default list. */
    lunarEvents?: LunarEvent[]
    showMemorialPlace?: boolean
  }>(),
  { includeHidden: false, soonDays: 14, limit: 5, eventLimit: 5, months: 4, showMemorialPlace: true },
)

const emit = defineEmits<{
  select: [id: string]
}>()

const windowDays = computed(() => daysInNextMonths(props.months))

const upcoming = computed(() =>
  getUpcomingAnniversaries(
    props.members.filter((member) => props.includeHidden || !member.isHidden),
    new Date(),
    windowDays.value,
  ).slice(0, props.limit),
)

const upcomingEvents = computed(() =>
  getUpcomingLunarEvents(new Date(), windowDays.value, props.lunarEvents).slice(0, props.eventLimit),
)

const memberMap = computed(() => new Map(props.members.map((member) => [member.id, member])))
const placeOf = (member: FamilyMember): string =>
  props.showMemorialPlace === false
    ? ''
    : memorialPlaceLabel(member, (id) => (id ? memberMap.value.get(id) : undefined))

const honorific = (member: FamilyMember): string =>
  member.gender === 'male' ? 'Ông ' : member.gender === 'female' ? 'Bà ' : ''

const whenLabel = (daysLeft: number): string => {
  if (daysLeft === 0) return 'Hôm nay'
  if (daysLeft === 1) return 'Ngày mai'
  return `Còn ${daysLeft} ngày`
}
</script>

<template>
  <div v-if="upcoming.length > 0 || upcomingEvents.length > 0" class="anniversary-blocks">
  <section v-if="upcoming.length > 0" class="anniversary-list" aria-labelledby="anniversary-list-title">
    <h3 id="anniversary-list-title" class="list-title">Đám giỗ sắp tới</h3>
    <ol class="list">
      <li v-for="item in upcoming" :key="item.member.id">
        <button
          type="button"
          class="row"
          :class="{ 'is-soon': item.daysLeft <= soonDays, 'is-today': item.daysLeft === 0 }"
          :title="`Xem ${item.member.name} trên cây gia phả`"
          @click="emit('select', item.member.id)"
        >
          <span class="row-date">
            <span class="lunar">{{ item.lunarDay }}/{{ item.lunarMonth }}</span>
            <span class="lunar-label">ÂL</span>
          </span>
          <span class="row-main">
            <strong class="name">{{ honorific(item.member) }}{{ item.member.name }}</strong>
            <span class="meta">
              {{ weekdayName(item.date) }}, {{ formatSolarDate(item.date) }}
              <template v-if="item.count"> · lần thứ {{ item.count }}</template>
              <template v-if="placeOf(item.member)"> · tại {{ placeOf(item.member) }}</template>
            </span>
          </span>
          <span class="row-when">{{ whenLabel(item.daysLeft) }}</span>
        </button>
      </li>
    </ol>
  </section>

  <section v-if="upcomingEvents.length > 0" class="anniversary-list" aria-labelledby="event-list-title">
    <h3 id="event-list-title" class="list-title">Lễ Tết sắp tới</h3>
    <ol class="list">
      <li v-for="item in upcomingEvents" :key="item.event.name">
        <div class="row is-event" :class="{ 'is-today': item.daysLeft === 0 }">
          <span v-if="item.event.calendar === 'solar'" class="row-date">
            <span class="lunar">{{ item.date.getDate() }}/{{ item.date.getMonth() + 1 }}</span>
            <span class="lunar-label">DL</span>
          </span>
          <span v-else class="row-date">
            <span class="lunar">{{ item.lunarDay }}/{{ item.lunarMonth }}</span>
            <span class="lunar-label">ÂL</span>
          </span>
          <span class="row-main">
            <strong class="name">{{ item.event.name }}</strong>
            <span class="meta">
              {{ weekdayName(item.date) }}, {{ formatSolarDate(item.date) }}
              <template v-if="item.event.calendar === 'solar'"> · {{ item.lunarDay }}/{{ item.lunarMonth }} âm lịch</template>
            </span>
          </span>
          <span class="row-when">{{ whenLabel(item.daysLeft) }}</span>
        </div>
      </li>
    </ol>
  </section>
  </div>
</template>

<style scoped>
/* đám giỗ (wider) and Lễ Tết side by side; stacked on phones */
.anniversary-blocks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.6rem;
  margin: 0 0 0.6rem;
}

.anniversary-blocks:has(> .anniversary-list:nth-child(2)) {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
}

.anniversary-list {
  margin: 0;
  padding: 0.4rem 0.55rem 0.5rem;
  background: linear-gradient(180deg, #fbf3dc 0%, #f4e6c1 100%);
  border: 1px solid #c9a24a;
  border-radius: 8px;
  box-shadow: 0 3px 8px rgba(60, 20, 8, 0.12);
  color: #3d2a17;
  font-family: 'Noto Serif', Georgia, serif;
}

.list-title {
  margin: 0 0 0.35rem;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7a1d16;
}

.list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  height: 100%;
  padding: 0.25rem 0.45rem 0.25rem 0.3rem;
  border: 1px solid rgba(176, 121, 78, 0.45);
  border-radius: 6px;
  background: rgba(255, 252, 243, 0.75);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.row:hover,
.row:focus-visible {
  background: #fffaf0;
  border-color: #c9a24a;
}

.row:focus-visible {
  outline: 2px solid #9b3a24;
  outline-offset: 1px;
}

.row.is-soon {
  border-color: #c9a24a;
  box-shadow: inset 3px 0 0 #9b3a24;
}

/* lunar date as a small red seal */
.row-date {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  padding: 0.15rem 0;
  border-radius: 4px;
  background: linear-gradient(180deg, #8f2419, #6e1a14);
  color: #f6e2a8;
  box-shadow: inset 0 0 0 1px rgba(241, 212, 138, 0.55);
}

.lunar {
  font-size: 0.85rem;
  font-weight: 700;
  line-height: 1.1;
}

.lunar-label {
  font-size: 0.58rem;
  letter-spacing: 0.04em;
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.name {
  color: #23345d;
  font-size: 0.82rem;
  line-height: 1.3;
  /* full name, wrapping onto a second line when the row is narrow */
  overflow-wrap: anywhere;
}

.meta {
  font-size: 0.72rem;
  line-height: 1.3;
  color: #6b4a2b;
}

.row-when {
  flex: none;
  align-self: center;
  padding: 0.05rem 0.4rem;
  border: 1px solid #c9a24a;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
  color: #7a1d16;
  background: #fff8e6;
}

.row.is-event {
  cursor: default;
  border-style: dashed;
}

.row.is-event .row-date {
  background: #c9a24a;
  color: #5e130e;
}

.row.is-today .row-when {
  background: #9b3a24;
  border-color: #9b3a24;
  color: #fff3d0;
}

@media (max-width: 640px) {
  .anniversary-blocks,
  .anniversary-blocks:has(> .anniversary-list:nth-child(2)) {
    grid-template-columns: 1fr;
    gap: 0.4rem;
  }

  .anniversary-list {
    padding: 0.35rem 0.4rem 0.4rem;
  }

  .list {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
}
</style>
