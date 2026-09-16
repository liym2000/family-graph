import { createRouter, createWebHistory } from 'vue-router';
export const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('./components/StartupView.vue'),
  },
  {
    path: '/families/:familyId(\\d+)',
    component: () => import('./pages/FamilyLayout.vue'),
    children: [
      {
        path: '',
        name: 'family',
        component: () => import('./pages/OverviewPage.vue'),
      },
      {
        path: 'people',
        name: 'people',
        component: () => import('./pages/PeoplePage.vue'),
      },
      {
        path: 'person/:personId(\\d+)',
        name: 'person',
        component: () => import('./pages/PersonPage.vue'),
      },
      {
        path: 'graph',
        name: 'graph',
        component: () => import('./pages/GraphPage.vue'),
      },
      { path: 'tree', name: 'tree', component: () => import('./pages/TreePage.vue') },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('./pages/SettingsPage.vue'),
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];
export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
