import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/view',
    },
    {
      path: '/view',
      name: 'view',
      component: App,
    },
    {
      path: '/admin',
      name: 'admin',
      component: App,
    },
    {
      path: '/super-admin',
      name: 'super-admin',
      component: App,
    },
  ],
})
