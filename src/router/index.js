import { createRouter, createWebHistory } from 'vue-router'
import { getAuthToken } from '@/services/api'

const routes = [
    { path: '/', redirect: '/home' },
    {
        path: '/login',
        name: 'Login',
        component: () => import('@/views/Login.vue'),
        meta: { title: '登录', public: true }
    },
    {
        path: '/home',
        name: 'Home',
        component: () => import('@/views/RealtimeMonitor.vue'),
        meta: { title: '实时监控' }
    },
    {
        path: '/alerts',
        name: 'Alerts',
        component: () => import('@/views/AlertCenter.vue'),
        meta: { title: '告警中心' }
    },
    {
        path: '/tasks',
        name: 'Tasks',
        component: () => import('@/views/ManualTasks.vue'),
        meta: { title: '人工工单' }
    },
    {
        path: '/devices',
        name: 'Devices',
        component: () => import('@/views/DeviceControl.vue'),
        meta: { title: '设备控制' }
    },
    {
        path: '/data-analysis',
        name: 'DataAnalysis',
        component: () => import('@/views/DeviceDataAnalysis.vue'),
        meta: { title: '数据分析' }
    },
    {
        path: '/agent-chat',
        name: 'AgentChat',
        component: () => import('@/views/AgentChat.vue'),
        meta: { title: 'AI 养殖助手' }
    },
    {
        path: '/settings',
        name: 'Settings',
        component: () => import('@/views/PlaceholderPage.vue'),
        meta: { title: '设置' }
    },
    { path: '/:pathMatch(.*)*', redirect: '/home' }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

/**
 * 全局前置守卫：未登录只能访问公开页面
 */
router.beforeEach((to) => {
    const token = getAuthToken()

    if (to.meta.public) {
        // 已登录用户访问登录页时直接回首页
        return token ? '/home' : true
    }

    if (!token) {
        return { path: '/login', query: { redirect: to.fullPath } }
    }

    return true
})

router.afterEach((to) => {
    document.title = to.meta?.title
        ? `${to.meta.title} - 水产养殖智能监控系统`
        : '水产养殖智能监控系统'
})

export default router
