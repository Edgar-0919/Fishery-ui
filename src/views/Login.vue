<template>
    <div class="login-page">
        <div class="login-card card-wrapper">
            <div class="brand">
                <img class="brand-logo" src="../static/newfish_logo.png" alt="Logo" />
                <h1 class="brand-title">智慧渔业养殖管理系统</h1>
                <p class="gray-tip">IoT + AI Agent 水质监控与自动决策</p>
            </div>

            <el-form class="login-form" @submit.prevent="handleLogin">
                <el-form-item>
                    <el-input
                        v-model="form.username"
                        placeholder="用户名"
                        size="large"
                        :prefix-icon="User"
                        clearable
                    />
                </el-form-item>
                <el-form-item>
                    <el-input
                        v-model="form.password"
                        type="password"
                        placeholder="密码"
                        size="large"
                        :prefix-icon="Lock"
                        show-password
                        @keyup.enter="handleLogin"
                    />
                </el-form-item>

                <el-alert
                    v-if="errorMessage"
                    :title="errorMessage"
                    type="error"
                    :closable="false"
                    show-icon
                    class="login-alert"
                />

                <el-button
                    type="primary"
                    size="large"
                    class="login-btn"
                    :loading="loading"
                    @click="handleLogin"
                >
                    登 录
                </el-button>
            </el-form>

            <p class="login-tip gray-tip">
                默认账号 admin / admin123，首次登录后请及时修改密码
            </p>
        </div>
    </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Lock, User } from '@element-plus/icons-vue'
import { login } from '@/services/api'

const router = useRouter()
const route = useRoute()

const form = reactive({
    username: 'admin',
    password: ''
})
const loading = ref(false)
const errorMessage = ref('')

async function handleLogin() {
    const username = form.username.trim()
    if (!username || !form.password) {
        errorMessage.value = '请输入用户名和密码'
        return
    }

    loading.value = true
    errorMessage.value = ''
    try {
        const result = await login(username, form.password)
        if (result.success) {
            // 登录成功后回到原本要访问的页面
            const redirect = typeof route.query.redirect === 'string'
                ? route.query.redirect
                : '/home'
            router.replace(redirect)
        } else {
            errorMessage.value = result.message || '登录失败'
        }
    } finally {
        loading.value = false
    }
}
</script>

<style scoped>
.login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--bg-gradient);
}

.login-card {
    width: 100%;
    max-width: 420px;
    padding: 40px 36px 28px;
    background: rgba(255, 255, 255, 0.92);
}

.brand {
    text-align: center;
    margin-bottom: 28px;
}

.brand-logo {
    width: 120px;
    height: 64px;
    object-fit: contain;
    margin-bottom: 12px;
}

.brand-title {
    font-size: 21px;
    font-weight: 700;
    color: #303133;
    letter-spacing: 1px;
    margin-bottom: 6px;
}

.login-form {
    margin-top: 8px;
}

.login-btn {
    width: 100%;
    margin-top: 6px;
    letter-spacing: 4px;
}

.login-alert {
    margin-bottom: 12px;
}

.login-tip {
    margin-top: 20px;
    text-align: center;
    font-size: 12px;
}
</style>
