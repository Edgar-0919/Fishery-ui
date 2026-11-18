<template>
    <div id="app-root">
        <!-- 登录页不显示导航栏 -->
        <TopNavbar v-if="!isPublicPage" />
        <div :class="isPublicPage ? 'public-content' : 'page-content'">
            <router-view />
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TopNavbar from '@/components/TopNavbar.vue'

const route = useRoute()
const isPublicPage = computed(() => Boolean(route.meta?.public))
</script>

<style scoped>
#app-root {
    width: 100%;
    min-height: 100vh;
    background: var(--bg-gradient);
}
.page-content {
    padding-top: 100px;
    min-height: calc(100vh - 80px);
}
.public-content {
    min-height: 100vh;
}
</style>
