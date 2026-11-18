<template>
    <div class="placeholder-page flex-center">
        <div class="placeholder-content card-wrapper">
            <el-icon size="60px" color="#909399"><Timer /></el-icon>
            <h2 style="margin-top: 20px; color: #606266;">页面开发中</h2>
            <p style="color: #909399; margin-top: 10px;">该功能模块正在建设中，敬请期待...</p>
            <el-button type="primary" style="margin-top: 20px;" @click="$router.push('/home')">
                返回首页
            </el-button>
        </div>
    </div>
</template>

<script setup>
import { Timer } from '@element-plus/icons-vue'
</script>

<style scoped>
.placeholder-page {
    width: 100%;
    min-height: 60vh;
    display: flex;
    justify-content: center;
    align-items: center;
}
.placeholder-content {
    text-align: center;
    padding: 60px 80px;
    max-width: 500px;
}
</style>