<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

/**
 * A closed lacquered double door over the family tree. Clicking the lock lifts its shackle, the two
 * doors swing open and the tree appears. Remembered for the browser session (not shown again on reload).
 */
const props = withDefaults(defineProps<{ enabled?: boolean }>(), { enabled: true })

const STORAGE_KEY = 'gia-pha-gate-open'
const readOpened = (): boolean => {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

type GateState = 'closed' | 'unlocking' | 'opening' | 'open'
const state = ref<GateState>(readOpened() ? 'open' : 'closed')
// Admin pages (enabled = false) never show the door
const shown = computed<GateState>(() => (props.enabled ? state.value : 'open'))
const timers: number[] = []

const finish = (): void => {
  state.value = 'open'
  try {
    sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // private mode: just open for now
  }
  // the tree measured itself while hidden behind the doors: let it re-measure
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
}

const openGate = (): void => {
  if (state.value !== 'closed') return
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion) {
    finish()
    return
  }
  state.value = 'unlocking'
  timers.push(window.setTimeout(() => (state.value = 'opening'), 550))
  timers.push(window.setTimeout(finish, 550 + 1700))
}

onBeforeUnmount(() => timers.forEach((id) => clearTimeout(id)))
</script>

<template>
  <div class="gate" :class="`gate--${shown}`">
    <div class="gate-content" :aria-hidden="shown === 'closed' || shown === 'unlocking' ? 'true' : undefined">
      <slot />
    </div>

    <div v-if="shown !== 'open'" class="gate-doors">
      <div class="gate-beam" aria-hidden="true"></div>
      <div class="door door--left" aria-hidden="true">
        <div class="door-panel door-panel--top"><span class="door-glyph">家 (Gia)</span></div>
        <div class="door-panel door-panel--bottom"></div>
        <span class="door-ring door-ring--left"></span>
      </div>
      <div class="door door--right" aria-hidden="true">
        <div class="door-panel door-panel--top"><span class="door-glyph">譜 (Phả)</span></div>
        <div class="door-panel door-panel--bottom"></div>
        <span class="door-ring door-ring--right"></span>
      </div>

      <button type="button" class="gate-lock" aria-label="Mở khóa để xem gia phả" @click="openGate">
        <svg class="lock-icon" viewBox="0 0 64 80" aria-hidden="true">
          <defs>
            <linearGradient id="gate-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#fff0b8" />
              <stop offset="0.45" stop-color="#e2b34d" />
              <stop offset="1" stop-color="#9a6a1c" />
            </linearGradient>
          </defs>
          <path class="lock-shackle" d="M18 36V24a14 14 0 0 1 28 0v12" fill="none" stroke="url(#gate-gold)" stroke-width="7" stroke-linecap="round" />
          <rect x="6" y="34" width="52" height="40" rx="8" fill="url(#gate-gold)" stroke="#7a4f12" stroke-width="2" />
          <circle cx="32" cy="50" r="6" fill="#5a1a0e" />
          <path d="M29 53h6l2 12h-10z" fill="#5a1a0e" />
        </svg>
        <span class="lock-text">Nhấn vào khóa để mở gia phả</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.gate {
  position: relative;
}

/* Closed: a door-sized window; the tree is laid out underneath but not visible yet */
.gate--closed,
.gate--unlocking,
.gate--opening {
  height: clamp(420px, 72vh, 760px);
  overflow: hidden;
}

.gate-content {
  transition: opacity 1.2s ease 0.3s;
}

.gate--closed .gate-content,
.gate--unlocking .gate-content {
  opacity: 0;
  pointer-events: none;
}

.gate--opening .gate-content {
  opacity: 1;
  pointer-events: none;
}

.gate-doors {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  perspective: 2200px;
  padding-top: 26px; /* under the beam */
}

/* carved lintel across the top, with gold hồi văn */
.gate-beam {
  position: absolute;
  inset: 0 0 auto;
  height: 26px;
  z-index: 3;
  border-radius: 6px 6px 0 0;
  background:
    url('/gia-pha-hoi-van.svg') repeat-x left 0 center / 26px 16px,
    linear-gradient(#5a120c, #3e0b07);
  box-shadow:
    inset 0 -2px 0 #c9a24a,
    0 4px 10px rgba(40, 10, 4, 0.45);
  transition: opacity 0.6s ease 1.2s;
}

.gate--opening .gate-beam {
  opacity: 0;
}

.door {
  position: relative;
  flex: 1 1 50%;
  display: flex;
  flex-direction: column;
  gap: 4%;
  padding: 5% 6% 6%;
  /* red lacquer with gold studs */
  background:
    radial-gradient(circle at center, #f6d77c 0 3px, #9a6a1c 3.6px, transparent 4.5px) 0 0 / 46px 46px,
    linear-gradient(90deg, rgba(0, 0, 0, 0.22), transparent 18%, transparent 82%, rgba(0, 0, 0, 0.28)),
    linear-gradient(#a3241a, #7e160f 55%, #66110b);
  border: 3px solid #c9a24a;
  box-shadow:
    inset 0 0 0 6px #5a120c,
    inset 0 0 0 8px #c9a24a,
    inset 0 0 40px rgba(0, 0, 0, 0.35);
  transition: transform 1.6s cubic-bezier(0.55, 0.05, 0.25, 1);
  backface-visibility: hidden;
}

.door--left {
  transform-origin: left center;
  border-right-width: 1.5px;
}

.door--right {
  transform-origin: right center;
  border-left-width: 1.5px;
}

.gate--opening .door--left {
  transform: rotateY(-104deg);
}

.gate--opening .door--right {
  transform: rotateY(104deg);
}

/* raised inner panels */
.door-panel {
  position: relative;
  border: 2px solid #d9b45c;
  border-radius: 4px;
  background: linear-gradient(#8f1d14, #741410);
  box-shadow:
    inset 0 0 0 5px #6a130d,
    inset 0 0 0 7px rgba(217, 180, 92, 0.75),
    0 3px 8px rgba(0, 0, 0, 0.35);
}

.door-panel--top {
  flex: 3 1 0;
  display: grid;
  place-items: center;
}

.door-panel--bottom {
  flex: 1.4 1 0;
}

.door-glyph {
  font-family: 'Ma Shan Zheng', 'LXGW WenKai TC', serif;
  font-size: clamp(3rem, 9vw, 7rem);
  line-height: 1;
  color: #f3cf6e;
  text-shadow:
    0 2px 0 #6a3f0c,
    0 0 18px rgba(243, 207, 110, 0.35);
}

/* door knockers */
.door-ring {
  position: absolute;
  top: 55%;
  width: 46px;
  height: 46px;
  border: 5px solid #e2b34d;
  border-radius: 50%;
  box-shadow:
    0 0 0 2px #7a4f12,
    inset 0 0 0 2px #7a4f12,
    0 4px 6px rgba(0, 0, 0, 0.4);
}

.door-ring::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -16px;
  width: 22px;
  height: 22px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #fff0b8, #c99332 60%, #7a4f12);
}

.door-ring--left {
  right: 34px;
}

.door-ring--right {
  left: 34px;
}

/* the lock on the seam */
.gate-lock {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  transform: translate(-50%, -38%);
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  transition: opacity 0.4s ease;
}

.lock-icon {
  width: 72px;
  height: 90px;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5));
  animation: lock-glow 2.4s ease-in-out infinite;
}

.lock-shackle {
  transition: transform 0.45s ease;
}

.gate-lock:hover .lock-icon,
.gate-lock:focus-visible .lock-icon {
  transform: scale(1.06);
}

.gate-lock:focus-visible {
  outline: 3px solid #f3cf6e;
  outline-offset: 6px;
  border-radius: 12px;
}

.lock-text {
  padding: 0.35rem 0.9rem;
  border: 1px solid #c9a24a;
  border-radius: 999px;
  background: rgba(58, 12, 7, 0.85);
  color: #f6dfa0;
  font-family: 'Noto Serif', serif;
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
}

.gate--unlocking .lock-shackle {
  transform: translateY(-9px);
}

.gate--unlocking .lock-icon {
  animation: lock-shake 0.45s ease;
}

.gate--opening .gate-lock {
  opacity: 0;
}

@keyframes lock-glow {
  50% {
    filter: drop-shadow(0 0 12px rgba(246, 215, 124, 0.85));
  }
}

@keyframes lock-shake {
  20% {
    transform: rotate(-8deg);
  }
  50% {
    transform: rotate(7deg);
  }
  80% {
    transform: rotate(-3deg);
  }
}

@media (max-width: 640px) {
  .gate--closed,
  .gate--unlocking,
  .gate--opening {
    height: clamp(360px, 64vh, 560px);
  }

  .door {
    background-size: 30px 30px, auto, auto;
  }

  .door-ring {
    width: 32px;
    height: 32px;
    border-width: 4px;
  }

  .door-ring--left {
    right: 18px;
  }

  .door-ring--right {
    left: 18px;
  }

  .lock-icon {
    width: 54px;
    height: 68px;
  }

  .lock-text {
    font-size: 0.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .door,
  .lock-icon,
  .lock-shackle,
  .gate-content {
    transition: none;
    animation: none;
  }
}
</style>
