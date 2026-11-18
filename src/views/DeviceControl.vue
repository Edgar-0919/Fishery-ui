<template>
    <div class="page-devices">
        <!-- 统计概览 -->
        <div class="stat-row">
            <div class="card-wrapper stat-card">
                <span class="stat-label">设备总数</span>
                <span class="stat-value">{{ devices.length }}</span>
                <span class="stat-hint">可控设备 · {{ scopeHint }}</span>
            </div>
            <div class="card-wrapper stat-card">
                <span class="stat-label">运行中</span>
                <span class="stat-value success">{{ statusCount.running }}</span>
                <span class="stat-hint">正在执行任务</span>
            </div>
            <div class="card-wrapper stat-card">
                <span class="stat-label">在线</span>
                <span class="stat-value primary">{{ statusCount.online }}</span>
                <span class="stat-hint">待命状态</span>
            </div>
            <div class="card-wrapper stat-card">
                <span class="stat-label">离线</span>
                <span class="stat-value muted">{{ statusCount.offline }}</span>
                <span class="stat-hint">无法下发指令</span>
            </div>
        </div>

        <!-- 设备卡片 -->
        <div class="card-wrapper device-panel">
            <div class="card-header-row">
                <span class="card-title">设备控制</span>
                <div class="header-actions">
                    <el-tag type="info" size="small" effect="plain">
                        硬件未接线 · 状态为指令目标态
                    </el-tag>
                    <el-input
                        v-model="pondFilter"
                        placeholder="按鱼塘筛选列表"
                        size="small"
                        clearable
                        style="width: 160px;"
                        @change="loadCommands"
                    />
                    <el-button size="small" :loading="loading" @click="refreshAll">刷新</el-button>
                </div>
            </div>

            <el-empty
                v-if="!loading && devices.length === 0"
                description="暂无设备。请先在 control_devices 表中配置设备"
            />

            <div v-for="group in groupedDevices" :key="group.pondId" class="pond-group">
                <div class="pond-group-title">
                    <span>{{ group.pondName }}</span>
                    <span class="gray-tip">{{ group.devices.length }} 台</span>
                </div>
                <div class="device-grid">
                    <div
                        v-for="device in group.devices"
                        :key="device.id"
                        :class="['device-card', device.status === 'running' ? 'is-running' : '']"
                    >
                        <div class="device-card-head">
                            <div>
                                <div class="device-name">{{ device.device_name || device.device_identifier }}</div>
                                <div class="gray-tip">{{ deviceTypeLabel(device.device_type) }} · {{ device.device_identifier }}</div>
                            </div>
                            <el-tag :type="deviceStatusType(device.status)" size="small">
                                {{ deviceStatusLabel(device.status) }}
                            </el-tag>
                        </div>

                        <div class="device-card-body">
                            <span class="gray-tip">设备类型</span>
                            <span class="device-meta">{{ deviceTypeLabel(device.device_type) }}</span>
                        </div>

                        <div class="device-card-actions">
                            <el-button
                                v-if="device.status !== 'running'"
                                type="primary"
                                size="small"
                                :disabled="device.status === 'offline' || submittingId === device.id"
                                :loading="submittingId === device.id"
                                @click="handleCommand(device, `start_${device.device_type}`)"
                            >
                                启动
                            </el-button>
                            <el-button
                                v-else
                                type="warning"
                                size="small"
                                :loading="submittingId === device.id"
                                @click="handleCommand(device, `stop_${device.device_type}`)"
                            >
                                停止
                            </el-button>
                            <span v-if="device.status === 'offline'" class="gray-tip">设备离线，不可下发</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 指令记录 -->
        <div class="card-wrapper command-panel">
            <div class="card-header-row">
                <span class="card-title">最近指令记录</span>
                <span class="gray-tip">来自 Agent 自动决策与人工下发 · 闭环终点为指令登记</span>
            </div>
            <el-table
                :data="commands"
                v-loading="loading"
                empty-text="暂无指令记录"
                style="width: 100%"
                max-height="420"
            >
                <el-table-column label="时间" width="180">
                    <template #default="{ row }">{{ formatTime(row.ts) }}</template>
                </el-table-column>
                <el-table-column label="设备" min-width="160">
                    <template #default="{ row }">
                        <div>{{ row.device_id }}</div>
                        <div class="gray-tip">{{ row.pond_id }}</div>
                    </template>
                </el-table-column>
                <el-table-column label="指令" width="140">
                    <template #default="{ row }">
                        <span class="mono">{{ commandLabel(row.command_type) }}</span>
                    </template>
                </el-table-column>
                <el-table-column label="来源" width="100">
                    <template #default="{ row }">
                        <el-tag size="small" :type="row.trigger_source === 'manual' ? 'info' : 'primary'">
                            {{ row.trigger_source === 'manual' ? '人工' : 'Agent' }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="状态" width="110">
                    <template #default="{ row }">
                        <el-tag size="small" :type="commandStatusType(row.status)">
                            {{ commandStatusLabel(row.status) }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="关联告警" min-width="140">
                    <template #default="{ row }">
                        {{ formatAlertType(row.alert_type || row.trigger_alert_id) }}
                    </template>
                </el-table-column>
                <el-table-column label="执行结果" min-width="160" show-overflow-tooltip>
                    <template #default="{ row }">{{ row.result || '--' }}</template>
                </el-table-column>
            </el-table>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
    fetchAgentDecisions,
    sendDeviceCommand
} from '@/services/api'
import {
    deviceStore,
    refreshDevices,
    countDeviceStatus,
    deviceTypeLabel,
    deviceStatusLabel,
    deviceStatusType
} from '@/stores/deviceStore'

const commands = ref([])
const loading = ref(false)
const submittingId = ref(null)
const pondFilter = ref('')

const SENSOR_LABELS = {
    temperature: '水温',
    ph_value: 'pH',
    dissolved_oxygen: '溶解氧',
    ammonia_nitrogen: '氨氮',
    nitrite: '亚硝酸盐',
    ts_value: '浊度',
    water_level: '水位'
}

// 设备状态统一取自 deviceStore；池塘筛选只影响本页展示，不改变全局状态
const devices = computed(() => {
    const keyword = pondFilter.value.trim().toLowerCase()
    if (!keyword) return deviceStore.devices
    return deviceStore.devices.filter(device =>
        String(device.pond_id || '').toLowerCase().includes(keyword)
    )
})

const scopeHint = computed(() =>
    pondFilter.value.trim() ? `筛选：${pondFilter.value.trim()}` : '全部养殖池'
)

const statusCount = computed(() => countDeviceStatus(devices.value))

const groupedDevices = computed(() => {
    const map = new Map()
    devices.value.forEach(device => {
        const pondId = device.pond_id || '未分组'
        if (!map.has(pondId)) {
            map.set(pondId, {
                pondId,
                pondName: `养殖池 ${pondId}`,
                devices: []
            })
        }
        map.get(pondId).devices.push(device)
    })
    return Array.from(map.values())
})

function commandLabel(type) {
    const labels = {
        start_aerator: '启动增氧机',
        stop_aerator: '停止增氧机',
        start_pump: '启动水泵',
        stop_pump: '停止水泵',
        start_feeder: '启动投饵机',
        stop_feeder: '停止投饵机',
        alert_human: '转人工',
        no_action: '无动作'
    }
    return labels[type] || type || '--'
}

function commandStatusLabel(status) {
    return { executed: '已执行', pending_approval: '待确认', failed: '失败' }[status] || status || '--'
}

function commandStatusType(status) {
    return { executed: 'success', pending_approval: 'warning', failed: 'danger' }[status] || 'info'
}

function formatAlertType(type) {
    if (!type) return '--'
    if (type === 'effect_check_failed') return '指令效果未达标'
    let m = type.match(/^(.+?)_(low|high)_warning$/)
    if (m) return `${SENSOR_LABELS[m[1]] || m[1]}${m[2] === 'low' ? '偏低' : '偏高'}（预警）`
    m = type.match(/^(.+?)_trend_(rising|falling)$/)
    if (m) return `${SENSOR_LABELS[m[1]] || m[1]}持续${m[2] === 'rising' ? '上升' : '下降'}（趋势）`
    m = type.match(/^(.+?)_(low|high)$/)
    if (m) return `${SENSOR_LABELS[m[1]] || m[1]}${m[2] === 'low' ? '过低' : '过高'}`
    return type
}

function formatTime(value) {
    if (!value) return '--'
    return String(value).replace('T', ' ').slice(0, 19)
}

async function loadCommands() {
    const result = await fetchAgentDecisions({
        pondId: pondFilter.value.trim(),
        limit: 30
    })
    commands.value = result.success ? result.data : []
}

async function refreshAll() {
    loading.value = true
    try {
        await Promise.all([refreshDevices(), loadCommands()])
    } finally {
        loading.value = false
    }
}

/**
 * 下发控制指令
 * 停止增氧机/水泵属于高风险动作，需二次确认
 */
async function handleCommand(device, commandType) {
    const isHighRisk = commandType === 'stop_aerator' || commandType === 'stop_pump'

    try {
        if (isHighRisk) {
            await ElMessageBox.confirm(
                `确认停止 ${device.device_name || device.device_identifier}？` +
                '停止增氧机可能导致溶解氧快速下降，请确认当前水质安全。',
                '高风险操作确认',
                { type: 'warning', confirmButtonText: '确认执行', cancelButtonText: '取消' }
            )
        }

        submittingId.value = device.id
        const payload = {
            command_type: commandType,
            params: commandType.startsWith('start_') ? { duration: 30 } : {}
        }
        const result = await sendDeviceCommand(device.device_identifier, payload)

        if (result.success) {
            ElMessage.success(result.message || '指令已下发')
            await refreshAll()
        } else {
            ElMessage.error(result.message || '指令下发失败')
        }
    } catch (err) {
        // 用户取消确认弹窗
        if (err !== 'cancel' && err !== 'close') {
            console.error('[设备指令]', err)
        }
    } finally {
        submittingId.value = null
    }
}

let pollTimer = null

onMounted(() => {
    refreshAll()
    pollTimer = setInterval(refreshAll, 30000)
})

onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
})
</script>

<style scoped>
.page-devices {
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
    line-height: 1.1;
    color: #303133;
}

.stat-value.success { color: #67C23A; }
.stat-value.primary { color: #409EFF; }
.stat-value.muted { color: #909399; }

.stat-hint {
    font-size: 12px;
    color: #909399;
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

.device-panel {
    margin-bottom: 20px;
}

.pond-group {
    margin-bottom: 18px;
}

.pond-group:last-child {
    margin-bottom: 0;
}

.pond-group-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    color: #303133;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid #ebeef5;
}

.device-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
}

.device-card {
    background: #f5f9fc;
    border: 1px solid #d9ecff;
    border-radius: 8px;
    padding: 14px;
    transition: all 0.3s ease;
}

.device-card.is-running {
    background: #f0f9eb;
    border-color: #c2e7b0;
}

.device-card-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 10px;
}

.device-name {
    font-weight: 600;
    font-size: 16px;
    color: #303133;
    margin-bottom: 2px;
}

.device-card-body {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #606266;
    margin-bottom: 12px;
}

.device-meta {
    font-weight: 500;
}

.device-card-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}

.command-panel {
    min-height: 260px;
}

.mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
}

@media (max-width: 1200px) {
    .stat-row {
        grid-template-columns: repeat(2, 1fr);
    }
}
</style>
