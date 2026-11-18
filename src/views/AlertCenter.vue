<template>
    <div class="page-alerts">
        <!-- 统计概览 -->
        <div class="stat-row">
            <div class="card-wrapper stat-card">
                <span class="stat-label">活跃告警</span>
                <span class="stat-value danger">{{ activeAlerts.length }}</span>
                <span class="stat-hint">持续中，待恢复</span>
            </div>
            <div class="card-wrapper stat-card">
                <span class="stat-label">已升级</span>
                <span class="stat-value warning">{{ escalatedAlerts.length }}</span>
                <span class="stat-hint">超过 {{ escalationMinutes }} 分钟</span>
            </div>
            <div class="card-wrapper stat-card">
                <span class="stat-label">Agent 决策</span>
                <span class="stat-value primary">{{ decisions.length }}</span>
                <span class="stat-hint">最近 {{ decisionLimit }} 条</span>
            </div>
            <div class="card-wrapper stat-card">
                <span class="stat-label">最近刷新</span>
                <span class="stat-value small">{{ lastRefresh }}</span>
                <span class="stat-hint">
                    <span v-if="loadError" class="error-text">{{ loadError }}</span>
                    <span v-else>每 30 秒自动刷新</span>
                </span>
            </div>
        </div>

        <!-- 明细 -->
        <div class="card-wrapper detail-card">
            <div class="card-header-row">
                <span class="card-title">告警与决策中心</span>
                <div class="header-actions">
                    <el-input
                        v-model="pondFilter"
                        placeholder="按鱼塘筛选，如 pond1"
                        size="small"
                        clearable
                        style="width: 200px;"
                        @change="loadAll"
                    />
                    <el-button size="small" :loading="loading" @click="loadAll">刷新</el-button>
                </div>
            </div>

            <el-tabs v-model="activeTab">
                <el-tab-pane :label="`活跃告警 (${activeAlerts.length})`" name="active">
                    <el-table
                        :data="activeAlerts"
                        v-loading="loading"
                        empty-text="当前没有活跃告警"
                        style="width: 100%"
                    >
                        <el-table-column type="expand">
                            <template #default="{ row }">
                                <div class="expand-block">
                                    <p><strong>Agent 分析：</strong>{{ row.agent_decision || '暂无决策记录' }}</p>
                                    <p><strong>执行动作：</strong>{{ formatAction(row.agent_action) }}</p>
                                    <p><strong>告警原始类型：</strong>{{ row.alert_type }}</p>
                                </div>
                            </template>
                        </el-table-column>
                        <el-table-column label="告警" min-width="150">
                            <template #default="{ row }">
                                <span class="alert-name">{{ formatAlertType(row.alert_type) }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column label="鱼塘 / 设备" min-width="150">
                            <template #default="{ row }">
                                <div>{{ row.pond_id }}</div>
                                <div class="gray-tip">{{ row.device_id }}</div>
                            </template>
                        </el-table-column>
                        <el-table-column label="当前值 / 阈值" min-width="140">
                            <template #default="{ row }">
                                <span :class="['mono', isExceeded(row) ? 'danger-text' : '']">
                                    {{ formatNumber(row.alert_value) }} / {{ formatNumber(row.threshold_value) }}
                                </span>
                            </template>
                        </el-table-column>
                        <el-table-column label="持续时长" width="120">
                            <template #default="{ row }">
                                {{ formatDuration(row.duration_minutes) }}
                            </template>
                        </el-table-column>
                        <el-table-column label="开始时间" width="180">
                            <template #default="{ row }">{{ formatTime(row.started_at) }}</template>
                        </el-table-column>
                        <el-table-column label="状态" width="100">
                            <template #default="{ row }">
                                <el-tag :type="statusTagType(row.status)" size="small">
                                    {{ statusLabel(row.status) }}
                                </el-tag>
                            </template>
                        </el-table-column>
                    </el-table>
                </el-tab-pane>

                <el-tab-pane :label="`已升级 (${escalatedAlerts.length})`" name="escalated">
                    <el-table
                        :data="escalatedAlerts"
                        v-loading="loading"
                        empty-text="暂无升级记录"
                        style="width: 100%"
                    >
                        <el-table-column type="expand">
                            <template #default="{ row }">
                                <div class="expand-block">
                                    <p><strong>Agent 分析：</strong>{{ row.agent_decision || '暂无决策记录' }}</p>
                                    <p><strong>执行动作：</strong>{{ formatAction(row.agent_action) }}</p>
                                </div>
                            </template>
                        </el-table-column>
                        <el-table-column label="告警" min-width="150">
                            <template #default="{ row }">{{ formatAlertType(row.alert_type) }}</template>
                        </el-table-column>
                        <el-table-column label="鱼塘 / 设备" min-width="150">
                            <template #default="{ row }">
                                <div>{{ row.pond_id }}</div>
                                <div class="gray-tip">{{ row.device_id }}</div>
                            </template>
                        </el-table-column>
                        <el-table-column label="峰值 / 阈值" min-width="140">
                            <template #default="{ row }">
                                <span class="mono">
                                    {{ formatNumber(row.alert_value) }} / {{ formatNumber(row.threshold_value) }}
                                </span>
                            </template>
                        </el-table-column>
                        <el-table-column label="持续时长" width="120">
                            <template #default="{ row }">{{ formatDuration(row.duration_minutes) }}</template>
                        </el-table-column>
                        <el-table-column label="开始时间" width="180">
                            <template #default="{ row }">{{ formatTime(row.started_at) }}</template>
                        </el-table-column>
                        <el-table-column label="状态" width="100">
                            <template #default="{ row }">
                                <el-tag :type="statusTagType(row.status)" size="small">
                                    {{ statusLabel(row.status) }}
                                </el-tag>
                            </template>
                        </el-table-column>
                    </el-table>
                </el-tab-pane>

                <el-tab-pane :label="`Agent 决策记录 (${decisions.length})`" name="decisions">
                    <el-table
                        :data="decisions"
                        v-loading="loading"
                        empty-text="暂无决策记录"
                        style="width: 100%"
                    >
                        <el-table-column label="时间" width="180">
                            <template #default="{ row }">{{ formatTime(row.ts) }}</template>
                        </el-table-column>
                        <el-table-column label="指令" min-width="130">
                            <template #default="{ row }">
                                <span class="mono">{{ row.command_type }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column label="来源" width="100">
                            <template #default="{ row }">
                                <el-tag size="small" :type="row.trigger_source === 'manual' ? 'info' : 'primary'">
                                    {{ row.trigger_source === 'manual' ? '人工' : 'Agent' }}
                                </el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column label="关联告警" min-width="140">
                            <template #default="{ row }">
                                {{ formatAlertType(row.alert_type || row.trigger_alert_id) }}
                            </template>
                        </el-table-column>
                        <el-table-column label="结果" width="120">
                            <template #default="{ row }">
                                <el-tag size="small" :type="commandStatusType(row.status)">
                                    {{ commandStatusLabel(row.status) }}
                                </el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column label="决策分析" min-width="260" show-overflow-tooltip>
                            <template #default="{ row }">{{ row.agent_decision || '--' }}</template>
                        </el-table-column>
                    </el-table>
                </el-tab-pane>
            </el-tabs>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import {
    fetchActiveAlerts,
    fetchEscalatedAlerts,
    fetchAgentDecisions
} from '@/services/api'
import { dataStore } from '@/stores/dataStore'

const activeTab = ref('active')
const activeAlerts = ref([])
const escalatedAlerts = ref([])
const decisions = ref([])
const loading = ref(false)
const loadError = ref('')
const lastRefresh = ref('--:--:--')
const pondFilter = ref('')

const decisionLimit = 20
const escalationMinutes = 60

const SENSOR_LABELS = {
    temperature: '水温',
    ph_value: 'pH',
    dissolved_oxygen: '溶解氧',
    ammonia_nitrogen: '氨氮',
    nitrite: '亚硝酸盐',
    ts_value: '浊度',
    water_level: '水位'
}

/**
 * 把后端 alert_type 转成可读中文
 * 支持 {sensor}_low / _high / _low_warning / _high_warning / _trend_rising / _trend_falling
 */
function formatAlertType(type) {
    if (!type) return '--'
    if (type === 'effect_check_failed') return '指令效果未达标'

    let m = type.match(/^(.+?)_(low|high)_warning$/)
    if (m) {
        return `${SENSOR_LABELS[m[1]] || m[1]}${m[2] === 'low' ? '偏低' : '偏高'}（预警）`
    }
    m = type.match(/^(.+?)_trend_(rising|falling)$/)
    if (m) {
        return `${SENSOR_LABELS[m[1]] || m[1]}持续${m[2] === 'rising' ? '上升' : '下降'}（趋势）`
    }
    m = type.match(/^(.+?)_(low|high)$/)
    if (m) {
        return `${SENSOR_LABELS[m[1]] || m[1]}${m[2] === 'low' ? '过低' : '过高'}`
    }
    return type
}

function formatAction(action) {
    const actionLabels = {
        start_aerator: '开启增氧机',
        stop_aerator: '关闭增氧机',
        start_pump: '开启水泵',
        stop_pump: '关闭水泵',
        start_feeder: '开启投饵机',
        stop_feeder: '关闭投饵机',
        alert_human: '转人工处理',
        no_action: '无需处理'
    }
    return actionLabels[action] || action || '--'
}

function formatNumber(val) {
    if (val === null || val === undefined || Number.isNaN(Number(val))) return '--'
    const num = Number(val)
    return Number.isInteger(num) ? String(num) : num.toFixed(2)
}

function formatTime(value) {
    if (!value) return '--'
    return String(value).replace('T', ' ').slice(0, 19)
}

function formatDuration(minutes) {
    const m = Number(minutes) || 0
    if (m < 60) return `${m} 分钟`
    const h = Math.floor(m / 60)
    return `${h} 小时 ${m % 60} 分`
}

function isExceeded(row) {
    const value = Number(row.alert_value)
    const threshold = Number(row.threshold_value)
    if (!Number.isFinite(value) || !Number.isFinite(threshold)) return false
    const type = row.alert_type || ''
    if (type.endsWith('_low') || type.endsWith('_low_warning')) return value < threshold
    return value > threshold
}

function statusLabel(status) {
    return { active: '活跃', escalated: '已升级', resolved: '已解决' }[status] || status || '--'
}

function statusTagType(status) {
    return { active: 'warning', escalated: 'danger', resolved: 'success' }[status] || 'info'
}

function commandStatusLabel(status) {
    return {
        executed: '已执行',
        pending_approval: '待确认',
        failed: '失败'
    }[status] || status || '--'
}

function commandStatusType(status) {
    return { executed: 'success', pending_approval: 'warning', failed: 'danger' }[status] || 'info'
}

/**
 * 加载全部数据：活跃告警、已升级告警、决策记录
 */
async function loadAll() {
    loading.value = true
    loadError.value = ''
    try {
        const pondId = pondFilter.value.trim()
        const [activeRes, escalatedRes, decisionRes] = await Promise.all([
            fetchActiveAlerts(pondId),
            fetchEscalatedAlerts(pondId),
            fetchAgentDecisions({ pondId, limit: decisionLimit })
        ])

        activeAlerts.value = activeRes.success ? activeRes.data : []
        escalatedAlerts.value = escalatedRes.success ? escalatedRes.data : []
        decisions.value = decisionRes.success ? decisionRes.data : []

        // 同步首页告警侧栏
        dataStore.activeAlerts = activeAlerts.value
        dataStore.deviceTip = activeAlerts.value.length
            ? `当前 ${activeAlerts.value.length} 条活跃告警，Agent 已介入处理`
            : '暂无告警'

        if (!activeRes.success || !escalatedRes.success) {
            loadError.value = activeRes.message || escalatedRes.message || '部分数据加载失败'
        }
        lastRefresh.value = new Date().toTimeString().slice(0, 8)
    } finally {
        loading.value = false
    }
}

let pollTimer = null

onMounted(() => {
    loadAll()
    pollTimer = setInterval(loadAll, 30000)
})

onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
})
</script>

<style scoped>
.page-alerts {
    width: 96%;
    max-width: 1920px;
    margin: 0 auto;
    padding-bottom: 40px;
}

.stat-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 20px;
}

.stat-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 120px;
    justify-content: center;
}

.stat-label {
    font-size: 15px;
    color: #606266;
    font-weight: 500;
}

.stat-value {
    font-size: 34px;
    font-weight: 700;
    color: #303133;
    line-height: 1.1;
}

.stat-value.small {
    font-size: 24px;
    color: #409EFF;
}

.stat-value.danger { color: #F56C6C; }
.stat-value.warning { color: #E6A23C; }
.stat-value.primary { color: #409EFF; }

.stat-hint {
    font-size: 12px;
    color: #909399;
}

.error-text {
    color: #E6A23C;
}

.detail-card {
    min-height: 420px;
}

.card-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    gap: 12px;
    flex-wrap: wrap;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}

.expand-block {
    padding: 12px 20px;
    background: #f5f7fa;
    border-radius: 6px;
    line-height: 1.9;
    font-size: 13px;
    color: #606266;
}

.alert-name {
    font-weight: 600;
    color: #303133;
}

.mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
}

.danger-text {
    color: #F56C6C;
    font-weight: 600;
}

@media (max-width: 1200px) {
    .stat-row {
        grid-template-columns: repeat(2, 1fr);
    }
}
</style>
