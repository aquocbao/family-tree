import { ref } from 'vue'

/**
 * "Nhà 3D" (the default) or "Kiểu sổ" (the red book). Shared by the gate, the Lời ngỏ and the tree;
 * this browser remembers the choice.
 */
const VIEW_STYLE_KEY = 'gia-pha-view-style'

const readHouseView = (): boolean => {
  try {
    return localStorage.getItem(VIEW_STYLE_KEY) !== 'book'
  } catch {
    return true
  }
}

export const isHouseView = ref(readHouseView())

export const setHouseView = (value: boolean): void => {
  isHouseView.value = value
  try {
    localStorage.setItem(VIEW_STYLE_KEY, value ? 'house' : 'book')
  } catch {
    // storage blocked: the choice lasts until the page is reloaded
  }
}
