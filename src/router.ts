import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { ADMIN_PATH, SUPER_ADMIN_PATH } from './admin-paths'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    // The public page lives at the site root
    {
      path: '/',
      name: 'view',
      component: App,
    },
    {
      path: ADMIN_PATH,
      name: 'admin',
      component: App,
    },
    {
      path: SUPER_ADMIN_PATH,
      name: 'super-admin',
      component: App,
    },
    // Old /view links and unknown paths → the public page
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})
