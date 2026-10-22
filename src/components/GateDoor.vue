<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, provide, ref, watch } from 'vue'
import { DEFAULT_LOI_NGO, type LoiNgo } from '../data/loi-ngo'
import { isHouseView } from '../view-style'

/**
 * A closed lacquered double door over the family tree. Clicking the lock lifts its shackle, the two
 * doors swing open onto a page with the Lời ngỏ; "Vào xem gia phả" then shows the tree. Remembered for the browser session (not shown again on reload).
 */
const props = withDefaults(defineProps<{ enabled?: boolean; loiNgo?: LoiNgo }>(), {
  enabled: true,
  loiNgo: () => DEFAULT_LOI_NGO,
})

const STORAGE_KEY = 'gia-pha-gate-open'
const readOpened = (): boolean => {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

type GateState = 'closed' | 'unlocking' | 'opening' | 'welcome' | 'open'
const state = ref<GateState>(readOpened() ? 'open' : 'closed')
// Admin pages (enabled = false) never show the door
const shown = computed<GateState>(() => (props.enabled ? state.value : 'open'))
// What is on screen: the door, the Lời ngỏ page or the tree (App.vue places the câu đối scrolls accordingly)
type GatePhase = 'door' | 'welcome' | 'open'
const emit = defineEmits<{ phase: [phase: GatePhase] }>()
watch(
  // the layout stays the door's while the doors swing (nothing jumps behind them); the Lời ngỏ page comes once they are open
  (): GatePhase => (shown.value === 'open' ? 'open' : shown.value === 'welcome' ? 'welcome' : 'door'),
  (phase) => emit('phase', phase),
  { immediate: true },
)
// Lets the tree wait until it can be seen (e.g. before scrolling to the default person)
provide(
  'gateOpen',
  computed(() => shown.value === 'open'),
)
const timers: number[] = []

const welcomeRef = ref<HTMLElement | null>(null)

// Doors are open: the Lời ngỏ page (already behind the doors while they swing) stays until the reader goes in
const showWelcome = async (): Promise<void> => {
  state.value = 'welcome'
  await nextTick()
  welcomeRef.value?.focus({ preventScroll: true })
}

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
    void showWelcome()
    return
  }
  state.value = 'unlocking'
  timers.push(window.setTimeout(() => (state.value = 'opening'), 550))
  timers.push(window.setTimeout(() => void showWelcome(), 550 + 1500))
}

// "✕" on the gia phả: close the doors again and go back to the first page (the lock)
const closeGate = async (): Promise<void> => {
  timers.forEach((id) => clearTimeout(id))
  timers.length = 0
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen()
    } catch {
      // still close the doors
    }
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // private mode: nothing stored
  }
  state.value = 'closed'
  await nextTick()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
// Only on the view page (admin pages have no door)
provide(
  'closeGate',
  computed(() => (props.enabled ? closeGate : null)),
)

onBeforeUnmount(() => timers.forEach((id) => clearTimeout(id)))
</script>

<template>
  <div class="gate" :class="[`gate--${shown}`, { 'gate--house': isHouseView }]">
    <div class="gate-content" :aria-hidden="shown === 'open' ? undefined : 'true'">
      <slot />
    </div>

    <section
      v-if="shown === 'welcome'"
      ref="welcomeRef"
      class="gate-welcome"
      tabindex="-1"
      aria-labelledby="gate-welcome-title"
    >
      <div class="scroll-rod" aria-hidden="true"></div>
      <div class="scroll-paper">
        <p class="welcome-kicker">范氏家谱 · Phạm Thị Gia Phả</p>
        <h2 id="gate-welcome-title" class="welcome-title">Lời ngỏ</h2>
        <div class="welcome-divider" aria-hidden="true"><span>❖</span></div>
        <p v-for="(text, index) in props.loiNgo.paragraphs" :key="index" class="welcome-text">{{ text }}</p>
        <p v-if="props.loiNgo.sign" class="welcome-sign">{{ props.loiNgo.sign }}</p>
        <button type="button" class="welcome-enter" @click="finish">Vào xem gia phả →</button>
      </div>
      <div class="scroll-rod" aria-hidden="true"></div>
    </section>

    <Transition name="doors-fade">
    <div v-if="shown !== 'open' && shown !== 'welcome'" class="gate-doors">
      <div class="gate-beam" aria-hidden="true"></div>
      <div class="door door--left" aria-hidden="true">
        <div class="door-panel door-panel--top"><span class="door-glyph"><span class="glyph-han">家</span><span class="glyph-reading">Gia</span></span></div>
        <div class="door-panel door-panel--bottom"></div>
        <span class="door-ring door-ring--left"></span>
      </div>
      <div class="door door--right" aria-hidden="true">
        <div class="door-panel door-panel--top"><span class="door-glyph"><span class="glyph-han">譜</span><span class="glyph-reading">Phả</span></span></div>
        <div class="door-panel door-panel--bottom"></div>
        <span class="door-ring door-ring--right"></span>
      </div>

      <button type="button" class="gate-lock" aria-label="Mở khóa để xem gia phả" @click="openGate">
        <span class="lock-glow" aria-hidden="true"></span>
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
    </Transition>
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

/* "Vào xem gia phả": the tree fades in instead of popping up (opacity only, so sticky bars keep working) */
.gate--open .gate-content {
  animation: content-in 0.6s ease both;
}

@keyframes content-in {
  from {
    opacity: 0;
  }
}

/* Lời ngỏ page: the tree stays laid out but out of sight until the reader goes in */
.gate--opening .gate-content,
.gate--welcome .gate-content {
  position: absolute;
  inset: 0 0 auto;
  height: 0;
  overflow: hidden;
  visibility: hidden;
}

.gate-welcome {
  width: min(860px, 100%);
  margin: 0 auto 2rem;
  outline: none;
  animation: welcome-in 0.7s ease both;
}

/* wooden rods at both ends of the scroll */
.scroll-rod {
  height: 18px;
  margin: 0 -14px;
  border-radius: 9px;
  background:
    radial-gradient(circle at 9px 50%, #f3cf6e 0 5px, #9a6a1c 6px, transparent 7px) left center / 18px 18px no-repeat,
    radial-gradient(circle at 9px 50%, #f3cf6e 0 5px, #9a6a1c 6px, transparent 7px) right center / 18px 18px no-repeat,
    linear-gradient(#8a3a1c, #5e1f0c 60%, #3e1306);
  box-shadow: 0 3px 6px rgba(40, 10, 4, 0.4);
  position: relative;
  z-index: 1;
}

.scroll-paper {
  padding: 2rem clamp(1.1rem, 5vw, 3.25rem) 2.25rem;
  background:
    linear-gradient(90deg, rgba(120, 70, 20, 0.12), transparent 6%, transparent 94%, rgba(120, 70, 20, 0.12)),
    linear-gradient(180deg, #fbf3dc 0%, #f4e6c1 100%);
  border-left: 1px solid #c9a24a;
  border-right: 1px solid #c9a24a;
  color: #3d2a17;
  font-family: 'Noto Serif', Georgia, serif;
  transform-origin: top center;
  animation: scroll-unroll 1.1s cubic-bezier(0.22, 0.8, 0.3, 1) 0.15s both;
}

.welcome-kicker {
  margin: 0;
  text-align: center;
  font-size: 0.85rem;
  letter-spacing: 0.18em;
  color: #8a5a2b;
}

.welcome-title {
  margin: 0.35rem 0 0;
  text-align: center;
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #7a1d16;
}

.welcome-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: min(280px, 70%);
  margin: 0.6rem auto 0.4rem;
  color: #b8892f;
}

.welcome-divider::before,
.welcome-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid #c9a24a;
}

.welcome-text {
  margin: 1rem 0 0;
  font-size: 1.05rem;
  line-height: 1.85;
  text-align: justify;
  text-indent: 2em;
}

.welcome-sign {
  margin: 1.25rem 0 0;
  text-align: right;
  font-style: italic;
  font-weight: 600;
}

.welcome-enter {
  display: block;
  margin: 1.75rem auto 0;
  padding: 0.65rem 1.6rem;
  border: 2px solid #c9a24a;
  border-radius: 999px;
  background: linear-gradient(#a3241a, #7e160f);
  color: #f6dfa0;
  font-family: 'Noto Serif', Georgia, serif;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(60, 20, 8, 0.3);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.welcome-enter:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(60, 20, 8, 0.38);
}

.welcome-enter:focus-visible {
  outline: 3px solid #f3cf6e;
  outline-offset: 3px;
}

@keyframes welcome-in {
  from {
    opacity: 0;
  }
}

@keyframes scroll-unroll {
  from {
    opacity: 0;
    transform: scaleY(0.05);
  }
}

.gate--closed .gate-content,
.gate--unlocking .gate-content {
  opacity: 0;
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

/* warm light shining through as the doors part */
.gate-doors::before {
  content: '';
  position: absolute;
  inset: 26px 0 0;
  background:
    radial-gradient(ellipse at 50% 45%, #fffaf0 0%, #fbf0d2 35%, #f1dfb0 70%, #e6cd92 100%);
  opacity: 0;
  transition: opacity 0.9s ease 0.2s;
}

.gate--opening .gate-doors::before {
  opacity: 1;
}

/* doors are open: the frame fades away while the Lời ngỏ scroll unrolls */
.doors-fade-leave-active {
  transition: opacity 0.45s ease;
}

/* the gate is already in "welcome" while the frame fades: keep it as it was at the end of the swing */
.doors-fade-leave-active::before {
  opacity: 1;
}

.doors-fade-leave-active .gate-beam,
.doors-fade-leave-active .gate-lock {
  opacity: 0;
}

.doors-fade-leave-active .door--left {
  transform: rotateY(-104deg);
}

.doors-fade-leave-active .door--right {
  transform: rotateY(104deg);
}

.doors-fade-leave-to {
  opacity: 0;
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
  transition: transform 1.6s cubic-bezier(0.45, 0.05, 0.25, 1);
  backface-visibility: hidden;
  /* own GPU layer: the lacquer, studs and shadows are painted once, then only rotated */
  will-change: transform;
  z-index: 1;
}

/* the door darkens as it turns away from the light (opacity only, cheap to animate) */
.door::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(20, 4, 2, 0.55);
  opacity: 0;
  pointer-events: none;
  transition: opacity 1.4s ease-in;
}

.gate--opening .door::after {
  opacity: 1;
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

/* the character, with its Vietnamese reading underneath (stays inside the panel at any width) */
.door-glyph {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15em;
  max-width: 100%;
  color: #f3cf6e;
  text-shadow:
    0 2px 0 #6a3f0c,
    0 0 18px rgba(243, 207, 110, 0.35);
}

.glyph-han {
  font-family: 'Ma Shan Zheng', 'LXGW WenKai TC', serif;
  font-size: clamp(3rem, 10vw, 7rem);
  line-height: 1;
}

.glyph-reading {
  font-family: 'Noto Serif', Georgia, serif;
  font-size: clamp(0.85rem, 2.2vw, 1.5rem);
  font-weight: 700;
  letter-spacing: 0.12em;
  line-height: 1;
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
  position: relative;
  width: 72px;
  height: 90px;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5));
  /* `scale` (not `transform`) so the hover zoom and the unlock shake don't override each other */
  transition: scale 0.25s ease;
}

/* pulsing halo behind the lock: an opacity/scale animation instead of an animated filter (no repaint each frame) */
.lock-glow {
  position: absolute;
  top: -12px;
  left: 50%;
  width: 116px;
  height: 116px;
  margin-left: -58px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(246, 215, 124, 0.7) 0%, rgba(246, 215, 124, 0.25) 40%, transparent 68%);
  pointer-events: none;
  will-change: opacity, transform;
  animation: lock-glow 2.4s ease-in-out infinite;
}

.lock-shackle {
  transition: transform 0.45s cubic-bezier(0.3, 1.4, 0.5, 1);
}

.gate-lock:hover .lock-icon,
.gate-lock:focus-visible .lock-icon {
  scale: 1.06;
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
  0%,
  100% {
    opacity: 0.15;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
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

/* tablets & phones: the câu đối scrolls hang beside the plaque. The door and the Lời ngỏ page move up
   into the gap between them (--couplet-lift is the spacer height set by App.vue). */
@media (max-width: 1099px) {
  .gate:not(.gate--open) {
    margin-top: calc(-1 * var(--couplet-lift, 0px));
  }

  .gate-doors {
    left: 5.25rem;
    right: 5.25rem;
  }

  .gate-welcome {
    width: auto;
    margin: 0 5.25rem 2rem;
  }
}

@media (max-width: 640px) {
  .gate-doors {
    left: 3.65rem;
    right: 3.65rem;
  }

  /* phones: App.vue hides the scrolls on the Lời ngỏ page, so it uses the full width */
  .gate-welcome {
    margin: 0 auto 2rem;
  }

  .gate--closed,
  .gate--unlocking,
  .gate--opening {
    height: clamp(360px, 64vh, 560px);
  }

  .door {
    background-size: 30px 30px, auto, auto;
  }

  /* narrow doors: the knockers would sit under the lock and its label */
  .door-ring {
    display: none;
  }

  .door {
    padding: 7% 7% 8%;
    gap: 5%;
  }

  .door-panel {
    box-shadow:
      inset 0 0 0 3px #6a130d,
      inset 0 0 0 4px rgba(217, 180, 92, 0.75),
      0 2px 5px rgba(0, 0, 0, 0.35);
  }

  /* character in the upper part of the panel, clear of the lock in the middle */
  .door-panel--top {
    place-items: start center;
    padding-top: 14%;
  }

  .glyph-han {
    font-size: clamp(2.6rem, 14vw, 3.6rem);
  }

  .glyph-reading {
    font-size: 0.85rem;
  }

  .gate-lock {
    transform: translate(-50%, -30%);
    gap: 0.45rem;
  }

  .lock-icon {
    width: 50px;
    height: 62px;
  }

  .lock-glow {
    top: -9px;
    width: 80px;
    height: 80px;
    margin-left: -40px;
  }

  .lock-text {
    padding: 0.3rem 0.75rem;
    font-size: 0.78rem;
  }

  .welcome-text {
    font-size: 0.98rem;
    line-height: 1.7;
    text-align: left;
    text-indent: 1.25em;
  }

  .scroll-rod {
    margin: 0 -6px;
  }
}

/* ==== "Nhà 3D": the entrance of a wooden house (roof, lanterns, plank doors) opening onto the hills,
   and the Lời ngỏ pinned on a wooden notice board under a small roof ==== */
.gate--house {
  --roof: 96px;
}

.gate--house .gate-doors {
  padding-top: var(--roof);
}

/* through the open doors: sky and hills, like the tree */
.gate--house .gate-doors::before {
  inset: var(--roof) 0 0;
  background:
    url('/gia-pha-house-hills.svg') center bottom / 100% 45% no-repeat,
    radial-gradient(ellipse at 50% 30%, rgba(255, 246, 214, 0.95), transparent 55%),
    linear-gradient(180deg, #a9cde6, #dcebf2 55%, #f4ead4);
}

/* the roof: dark shingles, wider than the doors */
.gate--house .gate-beam {
  inset: 0 -3% auto;
  height: calc(var(--roof) + 6px);
  border-radius: 0;
  background:
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.25) 0 2px, transparent 2px 12px),
    linear-gradient(180deg, #6a3d1d, #3a200e);
  clip-path: polygon(50% 0, 100% 80%, 100% 100%, 0 100%, 0 80%);
  box-shadow: none;
}

/* planked gable with a glowing round window */
.gate--house .gate-beam::after {
  content: '';
  position: absolute;
  left: 22%;
  right: 22%;
  bottom: 6px;
  height: calc(var(--roof) - 22px);
  background:
    radial-gradient(circle at 50% 62%, #fff0b8 0 9px, #ffc65c 10px 13px, #5a3518 13px 16px, transparent 16px),
    repeating-linear-gradient(90deg, #b47c46 0 18px, #8f5d31 18px 19px);
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
}

/* two red lanterns hanging from the eaves */
.gate--house .gate-doors::after {
  content: '';
  position: absolute;
  top: var(--roof);
  left: 7%;
  right: 7%;
  height: 78px;
  z-index: 3;
  pointer-events: none;
  background:
    /* cords */
    linear-gradient(#3a200e, #3a200e) left 21px top 0 / 2px 18px no-repeat,
    linear-gradient(#3a200e, #3a200e) right 21px top 0 / 2px 18px no-repeat,
    /* lanterns */
    radial-gradient(ellipse 21px 26px at 50% 50%, #ffd27a 0, #e2452c 45%, #a3241a 80%, transparent 82%) left 0 top 18px / 44px 56px no-repeat,
    radial-gradient(ellipse 21px 26px at 50% 50%, #ffd27a 0, #e2452c 45%, #a3241a 80%, transparent 82%) right 0 top 18px / 44px 56px no-repeat;
  filter: drop-shadow(0 0 10px rgba(255, 170, 70, 0.55));
  transition: opacity 0.5s ease;
}

.gate--house.gate--opening .gate-doors::after {
  opacity: 0;
}

/* plank doors: vertical boards, two cross battens, a dark wooden frame */
.gate--house .door {
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.25), transparent 16%, transparent 84%, rgba(0, 0, 0, 0.3)),
    linear-gradient(transparent 21%, #6e4220 21% 25%, transparent 25% 77%, #6e4220 77% 81%, transparent 81%),
    repeating-linear-gradient(90deg, transparent 0 52px, rgba(50, 25, 8, 0.55) 52px 54px),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.04) 0 3px, transparent 3px 9px),
    linear-gradient(#b27a43, #94602f 55%, #7d4c25);
  border-color: #4b2b12;
  box-shadow:
    inset 0 0 0 6px #5a3518,
    inset 0 0 0 8px #c08a4f,
    inset 0 0 40px rgba(40, 20, 5, 0.4);
}

/* recessed wooden panels; the characters are carved in gold */
.gate--house .door-panel {
  border-color: #c08a4f;
  background: linear-gradient(#6e4220, #573318);
  box-shadow:
    inset 0 6px 12px rgba(0, 0, 0, 0.45),
    inset 0 0 0 5px #4b2b12,
    inset 0 0 0 7px rgba(192, 138, 79, 0.7),
    0 3px 8px rgba(0, 0, 0, 0.3);
}

.gate--house .lock-text {
  border-color: #c08a4f;
  background: rgba(58, 32, 14, 0.88);
  color: #fbecd0;
}

/* Lời ngỏ page: a wooden notice board under a small roof */
.gate--house .gate-welcome {
  padding-top: 8px;
}

.gate--house .scroll-rod:first-child {
  height: 70px;
  margin: 0 -38px -4px;
  border-radius: 0;
  background:
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.25) 0 2px, transparent 2px 11px),
    linear-gradient(180deg, #6a3d1d, #3a200e);
  clip-path: polygon(50% 0, 100% 82%, 100% 100%, 0 100%, 0 82%);
  box-shadow: none;
}

.gate--house .scroll-rod:last-child {
  height: 16px;
  margin: 0 -10px;
  border-radius: 3px;
  background: linear-gradient(#8a552a, #5a3518);
  box-shadow: 0 8px 14px rgba(40, 20, 5, 0.4);
}

.gate--house .scroll-paper {
  border: 12px solid #7a4a24;
  border-image: linear-gradient(160deg, #a06a3a, #5a3518 45%, #7a4a24 55%, #a06a3a) 1;
  background:
    radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255, 232, 170, 0.55), transparent 75%),
    linear-gradient(180deg, #fcf4de, #f0deb3);
  box-shadow:
    inset 0 12px 18px -10px rgba(60, 30, 8, 0.35),
    6px 7px 0 #4b2b12;
}

.gate--house .welcome-title {
  color: #5a3518;
}

.gate--house .welcome-enter {
  border-color: #c08a4f;
  background: linear-gradient(#8a552a, #5a3518);
  color: #fbecd0;
  box-shadow: 0 3px 0 #3a200e, 0 6px 12px rgba(40, 20, 5, 0.35);
}

@media (max-width: 640px) {
  .gate--house {
    --roof: 64px;
  }

  /* narrow doors: the lanterns would hang over the characters */
  .gate--house .gate-doors::after {
    display: none;
  }

  .gate--house .door {
    background-size: auto, auto, 34px 100%, auto, auto;
    background-repeat: no-repeat, no-repeat, repeat, repeat, no-repeat;
  }

  /* full-width board: no overhang past the screen edge */
  .gate--house .scroll-rod:first-child {
    height: 48px;
    margin: 0 0 -4px;
  }

  .gate--house .scroll-rod:last-child {
    margin: 0;
  }

  .gate--house .scroll-paper {
    border-width: 8px;
    box-shadow: inset 0 12px 18px -10px rgba(60, 30, 8, 0.35);
  }
}

@media (prefers-reduced-motion: reduce) {
  .door,
  .door::after,
  .lock-icon,
  .lock-glow,
  .lock-shackle,
  .gate-content,
  .gate-welcome,
  .scroll-paper {
    transition: none;
    animation: none;
  }
}
</style>
