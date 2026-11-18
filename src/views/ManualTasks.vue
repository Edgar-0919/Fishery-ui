<template>
    <div class="page-tasks">
        <!-- 统计概览 -->
        <div class="stat-row">
            <div class="card-wrapper stat-card">
                <span class="stat-label">待处理</span>
                <span class="stat-value danger">{{ statusCount.pending }}</span>
                <span class="stat-hint">需要人工介入</span>
            </div>
            <div class="card-wrapper stat-card">
                <span class="stat-label">处理中</span>
                <span class="stat-value warning">{{ statusCount.processing }}</span>
                <span class="stat-hint">已认领，尚未关闭</span>
            </div>
            <div class="card-wrapper stat-card">
                <span class="stat-label">已解决</span>
                <span class="stat-value success">{{ statusCount.resolved }}</span>
                <span class="stat-hint">处理完成</span>
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

        <div class="card-wrapper detail-card">
            <div class="card-header-row">
                <span class="card-title">人工工单</span>
                <div class="header-actions">
                    <el-select
                        v-model="statusFilter"
                        placeholder="全部状态"
                        size="small"
                        clearable
                        style="width: 140px;"
                        @change="loadTasks"
                    >
                        <el-option label="待处理" value="pending" />
                        <el-option label="处理中" value="processing" />
                        <el-option label="已解决" value="resolved" />
                    </el-select>
                    <el-input
                        v-model="pondFilter"
                        placeholder="鱼塘ID"
                        size="small"
                        clearable
                        style="width: 140px;"
                        @change="loadTasks"
                    />
                    <el-button size="small" :loading="loading" @click="loadTasks">刷新</el-button>
                </div>
            </div>

            <el-table
                :data="tasks"
                v-loading="loading"
                empty-text="暂无工单。告警持续超过 60 分钟会自动生成工单"
                style="width: 100%"
            >
                <el-table-column prop="id" label="工单号" width="100" />
                <el-table-column label="告警类型" min-width="150">
                    <template #default="{ row }">
                        <span class="alert-name">{{ formatAlertType(row.alert_type) }}</span>
                    </template>
                </el-table-column>
                <el-table-column label="鱼塘" width="120">
                    <template #default="{ row }">{{ row.pond_id }}</template>
                </el-table-column>
                <el-table-column label="异常值 / 阈值" width="150">
                    <template #default="{ row }">
                        <span class="mono">
                            {{ formatNumber(row.alert_value) }} / {{ formatNumber(row.threshold_value) }}
                        </span>
                    </template>
                </el-table-column>
                <el-table-column label="异常开始" width="180">
                    <template #default="{ row }">{{ formatTime(row.started_at) }}</template>
                </el-table-column>
                <el-table-column label="升级时间" width="180">
                    <template #default="{ row }">{{ formatTime(row.escalated_at) }}</template>
                </el-table-column>
                <el-table-column label="状态" width="110">
                    <template #default="{ row }">
                        <el-tag :type="statusTagType(row.status)" size="small">
                            {{ statusLabel(row.status) }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="处理人" width="120">
                    <template #default="{ row }">{{ row.handler || '--' }}</template>
                </el-table-column>
                <el-table-column label="备注" min-width="180" show-overflow-tooltip>
                    <template #default="{ row }">{{ row.remark || '--' }}</template>
                </el-table-column>
                <el-table-column label="操作" width="180" fixed="right">
                    <template #default="{ row }">
                        <el-button
                            v-if="row.status === 'pending'"
                            size="small"
                            type="primary"
                            link
                            @click="openDialog(row, 'process')"
                        >
                            开始处理
                        </el-button>
                        <el-button
                            v-if="row.status !== 'resolved'"
                            size="small"
                            type="success"
                            link
                            @click="openDialog(row, 'resolve')"
                        >
                            标记已解决
                        </el-button>
                        <span v-if="row.status === 'resolved'" class="gray-tip">已闭环</span>
                    </template>
                </el-table-column>
            </el-table>
        </div>

        <!-- 处理弹窗 -->
        <el-dialog
            v-model="dialogVisible"
            :title="dialogMode === 'process' ? '开始处理工单' : '标记工单已解决'"
            width="460px"
        >
            <el-form :model="form" label-width="80px">
                <el-form-item label="工单号">
                    <span class="mono">#{{ currentTask?.id }}</span>
                </el-form-item>
                <el-form-item label="告警">
                    <span>{{ formatAlertType(currentTask?.alert_type) }}</span>
                </el-form-item>
                <el-form-item label="处理人">
                    <el-input v-model="form.handler" placeholder="请输入处理人" />
                </el-form-item>
                <el-form-item label="处理备注">
                    <el-input
                        v-model="form.remark"
                        type="textarea"
                        :rows="3"
                        placeholder="如：已现场增开增氧机，溶解氧回升至 5.2mg/L"
                    />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="dialogVisible = false">取消</el-button>
                <el-button type="primary" :loading="submitting" @click="submit">
                    确认
                </el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
    fetchManualTasks,
    processManualTask,
    resolveManualTask
} from '@/services/api'

const tasks = ref([])
const loading = ref(false)
const submitting = ref(false)
const loadError = ref('')
const lastRefresh = ref('--:--:--')
const statusFilter = ref('')
const pondFilter = ref('')

const dialogVisible = ref(false)
const dialogMode = ref('process')
const currentTask = ref(null)
const form = reactive({ handler: 'admin', remark: '' })

const SENSOR_LABELS = {
    temperature: '水温',
    ph_value: 'pH',
    dissolved_oxygen: '溶解氧',
    ammonia_nitrogen: '氨氮',
    nitrite: '亚硝酸盐',
    ts_value: '浊度',
    water_level: '水位'
}

const statusCount = computed(() => {
    const result = { pending: 0, processing: 0, resolved: 0 }
    tasks.value.forEach(task => {
        if (result[task.status] !== undefined) result[task.status] += 1
    })
    return result
})

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

function formatNumber(val) {
    if (val === null || val === undefined || Number.isNaN(Number(val))) return '--'
    const num = Number(val)
    return Number.isInteger(num) ? String(num) : num.toFixed(2)
}

function formatTime(value) {
    if (!value) return '--'
    return String(value).replace('T', ' ').slice(0, 19)
}

function statusLabel(status) {
    return { pending: '待处理', processing: '处理中', resolved: '已解决' }[status] || status || '--'
}

function statusTagType(status) {
    return { pending: 'danger', processing: 'warning', resolved: 'success' }[status] || 'info'
}

async function loadTasks() {
    loading.value = true
    loadError.value = ''
    try {
        const result = await fetchManualTasks({
            status: statusFilter.value || '',
            pondId: pondFilter.value.trim()
        })
        tasks.value = result.success ? result.data : []
        if (!result.success) loadError.value = result.message || '工单加载失败'
        lastRefresh.value = new Date().toTimeString().slice(0, 8)
    } finally {
        loading.value = false
    }
}

function openDialog(task, mode) {
    currentTask.value = task
    dialogMode.value = mode
    form.handler = task.handler || 'admin'
    form.remark = task.remark || ''
    dialogVisible.value = true
}

async function submit() {
    if (!currentTask.value) return
    if (!form.handler.trim()) {
        ElMessage.warning('请填写处理人')
        return
    }

    submitting.value = true
    try {
        const action = dialogMode.value === 'process' ? processManualTask : resolveManualTask
        const result = await action(currentTask.value.id, {
            handler: form.handler.trim(),
            remark: form.remark.trim()
        })
        if (result.success) {
            ElMessage.success(result.message || '操作成功')
            dialogVisible.value = false
            await loadTasks()
        } else {
            ElMessage.error(result.message || '操作失败')
        }
    } finally {
        submitting.value = false
    }
}

let pollTimer = null

onMounted(() => {
    loadTasks()
    pollTimer = setInterval(loadTasks, 30000)
})

onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
})
</script>

<style scoped>
.page-tasks {
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

.stat-value.small {
    font-size: 24px;
    color: #409EFF;
}

.stat-value.danger { color: #F56C6C; }
.stat-value.warning { color: #E6A23C; }
.stat-value.success { color: #67C23A; }

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

.alert-name {
    font-weight: 600;
    color: #303133;
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
