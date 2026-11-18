<template>
    <nav class="top-navbar">
        <div class="navbar-inner">
            <!-- 汉堡菜单按钮 -->
            <el-button class="hamburger-btn" text @click="toggleMenu">
                <el-icon size="24px"><Menu /></el-icon>
            </el-button>

            <!-- Logo -->
            <div class="logo-wrapper">
                <img class="logo-img" src="../static/newfish_logo.png" alt="Logo" />
                <span class="logo-placeholder">Logo</span>
            </div>

            <!-- 导航菜单按钮区域 -->
            <div class="nav-menu-area">
                <el-button
                    v-for="item in navItems"
                    :key="item.key"
                    :class="['nav-btn', { 'active-nav': activeNav === item.key }]"
                    @click="navigateTo(item.key, item.route)"
                >
                    {{ item.label }}
                </el-button>
            </div>

            <!-- 用户菜单 -->
            <div class="user-area">
                <el-dropdown trigger="click" @command="handleCommand">
                    <span class="user-trigger">
                        <el-icon size="18px"><UserFilled /></el-icon>
                        <span class="user-name">{{ displayName }}</span>
                        <el-icon size="12px"><ArrowDown /></el-icon>
                    </span>
                    <template #dropdown>
                        <el-dropdown-menu>
                            <el-dropdown-item disabled>{{ roleLabel }}</el-dropdown-item>
                            <el-dropdown-item command="password" divided>修改密码</el-dropdown-item>
                            <el-dropdown-item command="logout">退出登录</el-dropdown-item>
                        </el-dropdown-menu>
                    </template>
                </el-dropdown>
            </div>
        </div>

        <!-- 修改密码弹窗 -->
        <el-dialog v-model="passwordVisible" title="修改密码" width="420px" append-to-body>
            <el-form label-width="86px">
                <el-form-item label="原密码">
                    <el-input v-model="passwordForm.oldPassword" type="password" show-password />
                </el-form-item>
                <el-form-item label="新密码">
                    <el-input v-model="passwordForm.newPassword" type="password" show-password />
                </el-form-item>
                <el-form-item label="确认新密码">
                    <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="passwordVisible = false">取消</el-button>
                <el-button type="primary" :loading="submitting" @click="submitPassword">确认修改</el-button>
            </template>
        </el-dialog>
    </nav>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowDown, Menu, UserFilled } from '@element-plus/icons-vue'
import {
    changePassword,
    fetchCurrentUser,
    getAuthUser,
    logout
} from '@/services/api'

const router = useRouter()
const route = useRoute()

const navItems = [
    { key: 'home', label: '首页', route: '/home' },
    { key: 'alerts', label: '告警中心', route: '/alerts' },
    { key: 'tasks', label: '工单管理', route: '/tasks' },
    { key: 'devices', label: '设备控制', route: '/devices' },
    { key: 'dataAnalysis', label: '数据分析', route: '/data-analysis' },
    { key: 'agentChat', label: 'AI 助手', route: '/agent-chat' },
    { key: 'settings', label: '设置', route: '/settings' }
]

const activeNav = ref('home')
const currentUser = ref(getAuthUser() || {})
const passwordVisible = ref(false)
const submitting = ref(false)
const passwordForm = reactive({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
})

const displayName = computed(() =>
    currentUser.value?.display_name || currentUser.value?.username || '用户'
)
const roleLabel = computed(() =>
    currentUser.value?.role === 'admin' ? '管理员' : '操作员'
)

watch(() => route.path, (newPath) => {
    const matched = navItems.find(item => item.route === newPath)
    activeNav.value = matched ? matched.key : 'home'
}, { immediate: true })

function navigateTo(key, path) {
    activeNav.value = key
    if (path) router.push(path)
}

function toggleMenu() {
    console.log('汉堡菜单点击 - 可扩展侧边栏功能')
}

async function handleCommand(command) {
    if (command === 'logout') {
        logout()
        router.replace('/login')
        return
    }
    if (command === 'password') {
        passwordForm.oldPassword = ''
        passwordForm.newPassword = ''
        passwordForm.confirmPassword = ''
        passwordVisible.value = true
    }
}

async function submitPassword() {
    if (!passwordForm.oldPassword || !passwordForm.newPassword) {
        ElMessage.warning('请填写原密码与新密码')
        return
    }
    if (passwordForm.newPassword.length < 6) {
        ElMessage.warning('新密码至少 6 位')
        return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        ElMessage.warning('两次输入的新密码不一致')
        return
    }

    submitting.value = true
    try {
        const result = await changePassword(passwordForm.oldPassword, passwordForm.newPassword)
        if (result.success) {
            ElMessage.success(result.message || '密码已更新，请重新登录')
            passwordVisible.value = false
            logout()
            router.replace('/login')
        } else {
            ElMessage.error(result.message || '密码修改失败')
        }
    } finally {
        submitting.value = false
    }
}

onMounted(async () => {
    // 刷新一次用户信息，顺便校验令牌是否仍然有效
    const result = await fetchCurrentUser()
    if (result.success && result.user) {
        currentUser.value = result.user
    }
})
</script>

<style scoped>
.top-navbar {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 80px;
    background-color: var(--primary);
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.navbar-inner {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 16px;
}
.hamburger-btn {
    flex-shrink: 0;
    margin-right: 14px;
    color: #fff !important;
    background: transparent !important;
    border: none !important;
    padding: 8px;
    border-radius: 8px;
    transition: background 0.3s;
}
.hamburger-btn:hover {
    background: rgba(255, 255, 255, 0.2) !important;
}
.logo-wrapper {
    flex-shrink: 0;
    width: 110px;
    height: 56px;
    margin-right: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    overflow: hidden;
}
.logo-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: none;
}
.logo-img[src]:not([src=""]) {
    display: block;
}
.logo-placeholder {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 2px;
}
.logo-img[src]:not([src=""]) ~ .logo-placeholder {
    display: none;
}
.nav-menu-area {
    flex: 1;
    display: flex;
    justify-content: space-evenly;
    align-items: center;
    gap: 8px;
}
.user-area {
    flex-shrink: 0;
    margin-left: 12px;
}
.user-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 8px;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.18);
    transition: background 0.3s;
    outline: none;
}
.user-trigger:hover {
    background: rgba(255, 255, 255, 0.32);
}
.user-name {
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
@media (max-width: 1500px) {
    .user-name {
        display: none;
    }
}
</style>
