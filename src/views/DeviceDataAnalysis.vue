<template>
    <div class="page-device">
        <!-- ==================== 上半部分：三栏布局 ==================== -->
        <div class="three-column-row-top">
            <!-- 左栏：当前养殖环境数据 -->
            <div class="card-wrapper left-col-top">
                <div class="card-header-row">
                    <span class="card-title">当前养殖环境数据</span>
                    <span class="time-text">{{ dataStore.currentTime }}</span>
                </div>
                <div class="env-list">
                    <div v-for="item in envItems" :key="item.label" class="env-row">
                        <span class="metric-label">{{ item.label }}</span>
                        <span class="env-value">{{ formatValue(item.value, item.unit) }}</span>
                    </div>
                </div>
                <p class="gray-tip device-tip">
                    设备联动提示：{{ dataStore.deviceTip }}
                </p>
            </div>

            <!-- 中栏：设备状态概览 -->
            <div class="card-wrapper mid-col-top">
                <div class="card-header-row">
                    <span class="card-title">设备状态</span>
                    <span class="gray-tip">共 {{ devices.length }} 台 · 全部养殖池</span>
                </div>

                <div class="device-status-row">
                    <div class="status-chip running">
                        <span class="chip-value">{{ statusCount.running }}</span>
                        <span class="chip-label">运行中</span>
                    </div>
                    <div class="status-chip online">
                        <span class="chip-value">{{ statusCount.online }}</span>
                        <span class="chip-label">在线</span>
                    </div>
                    <div class="status-chip offline">
                        <span class="chip-value">{{ statusCount.offline }}</span>
                        <span class="chip-label">离线</span>
                    </div>
                </div>

                <el-table :data="devices" size="small" max-height="220" empty-text="暂无设备">
                    <el-table-column label="设备" min-width="120">
                        <template #default="{ row }">
                            {{ row.device_name || row.device_identifier }}
                        </template>
                    </el-table-column>
                    <el-table-column label="养殖池" width="90">
                        <template #default="{ row }">{{ row.pond_id || '--' }}</template>
                    </el-table-column>
                    <el-table-column label="类型" width="80">
                        <template #default="{ row }">{{ deviceTypeLabel(row.device_type) }}</template>
                    </el-table-column>
                    <el-table-column label="状态" width="90">
                        <template #default="{ row }">
                            <el-tag :type="deviceStatusType(row.status)" size="small">
                                {{ deviceStatusLabel(row.status) }}
                            </el-tag>
                        </template>
                    </el-table-column>
                </el-table>
            </div>

            <!-- 右栏：实时监控 -->
            <div class="card-wrapper right-col-top">
                <div class="card-header-row">
                    <span class="card-title">实时监控</span>
                    <span class="pool-tag">养殖池编号：{{ dataStore.poolId }}</span>
                </div>
                <div class="monitor-placeholder-sm">
                    <img class="monitor-img-sm" src="../static/ai俯拍鱼.png" alt="实时监控画面" />
                    <div class="monitor-empty-sm">
                        <el-icon size="36px" color="#c0c4cc"><VideoCamera /></el-icon>
                        <span class="gray-tip">监控画面占位</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- ==================== 下半部分：两栏布局 ==================== -->
        <div class="two-column-row-bottom">
            <!-- 左栏：多指标历史趋势 -->
            <div class="card-wrapper left-col-bottom">
                <div class="card-header-row">
                    <span class="card-title">历史趋势对比</span>
                    <div class="analysis-controls">
                        <el-select
                            v-model="rangeHours"
                            size="small"
                            style="width: 110px;"
                            @change="loadHistory"
                        >
                            <el-option label="近 1 小时" :value="1" />
                            <el-option label="近 6 小时" :value="6" />
                            <el-option label="近 24 小时" :value="24" />
                        </el-select>
                        <el-select
                            v-model="selectedMetrics"
                            multiple
                            collapse-tags
                            size="small"
                            style="width: 220px;"
                            placeholder="选择指标"
                            @change="loadHistory"
                        >
                            <el-option
                                v-for="metric in METRIC_OPTIONS"
                                :key="metric.field"
                                :label="metric.label"
                                :value="metric.field"
                            />
                        </el-select>
                        <el-button size="small" :loading="historyLoading" @click="loadHistory">刷新</el-button>
                    </div>
                </div>

                <p v-if="historyError" class="gray-tip" style="margin-bottom: 8px;">
                    {{ historyError }}
                </p>
                <div ref="historyChartRef" class="chart-box-history"></div>
            </div>

            <!-- 右栏：指标统计摘要 -->
            <div class="card-wrapper right-col-bottom">
                <div class="card-header-row">
                    <span class="card-title">指标统计</span>
                    <span class="gray-tip">{{ rangeLabel }} · {{ historyRows.length }} 个采样点</span>
                </div>

                <el-table
                    :data="statsRows"
                    v-loading="historyLoading"
                    size="small"
                    empty-text="暂无历史数据"
                    max-height="420"
                >
                    <el-table-column label="指标" min-width="120">
                        <template #default="{ row }">
                            <span class="alert-name">{{ row.label }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="均值" width="100">
                        <template #default="{ row }">
                            <span class="mono">{{ formatNumber(row.avg) }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="最小" width="100">
                        <template #default="{ row }">
                            <span class="mono">{{ formatNumber(row.min) }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="最大" width="100">
                        <template #default="{ row }">
                            <span class="mono">{{ formatNumber(row.max) }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="单位" width="80">
                        <template #default="{ row }">{{ row.unit || '--' }}</template>
                    </el-table-column>
                </el-table>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { VideoCamera } from '@element-plus/icons-vue'
import { dataStore } from '@/stores/dataStore'
import {
    deviceStore,
    refreshDevices,
    countDeviceStatus,
    deviceTypeLabel,
    deviceStatusLabel,
    deviceStatusType
} from '@/stores/deviceStore'
import {
    fetchLatestEnvData,
    fetchHistoryData
} from '@/services/api'

const METRIC_OPTIONS = [
    { label: '水温', field: 'temperature', unit: '℃' },
    { label: '溶解氧', field: 'dissolved_oxygen', unit: 'mg/L' },
    { label: 'pH 值', field: 'ph_value', unit: '' },
    { label: '氨氮', field: 'ammonia_nitrogen', unit: 'mg/L' },
    { label: '亚硝酸盐', field: 'nitrite', unit: 'mg/L' },
    { label: '浊度', field: 'ts_value', unit: 'NTU' },
    { label: '水位', field: 'water_level', unit: 'm' }
]

const historyChartRef = ref(null)
let historyChart = null

// 与设备控制页共用同一份全量设备状态，避免两页统计口径不一致
const devices = computed(() => deviceStore.devices)
const statusCount = computed(() => countDeviceStatus(devices.value))

const historyRows = ref([])
const historyLoading = ref(false)
const historyError = ref('')
const rangeHours = ref(6)
const selectedMetrics = ref(['temperature', 'dissolved_oxygen', 'ph_value'])

const envItems = computed(() => [
    { label: '水温', value: dataStore.envData.waterTemp, unit: '℃' },
    { label: '溶解氧', value: dataStore.envData.dissolvedOxygen, unit: 'mg/L' },
    { label: 'pH 值', value: dataStore.envData.ph, unit: '' },
    { label: '氨氮', value: dataStore.envData.ammoniaNitrogen, unit: 'mg/L' },
    { label: '亚硝酸盐', value: dataStore.envData.nitrite, unit: 'mg/L' },
    { label: '浊度', value: dataStore.envData.turbidity, unit: 'NTU' },
    { label: '水位', value: dataStore.envData.waterLevel, unit: 'm' }
])

const rangeLabel = computed(() => `近 ${rangeHours.value} 小时`)

const statsRows = computed(() => {
    return selectedMetrics.value.map(field => {
        const meta = METRIC_OPTIONS.find(item => item.field === field) || { label: field, unit: '' }
        const values = historyRows.value
            .map(row => row[field])
            .filter(v => v !== null && v !== undefined && !Number.isNaN(Number(v)))
            .map(Number)

        if (values.length === 0) {
            return { label: meta.label, unit: meta.unit, avg: null, min: null, max: null }
        }
        const sum = values.reduce((acc, cur) => acc + cur, 0)
        return {
            label: meta.label,
            unit: meta.unit,
            avg: sum / values.length,
            min: Math.min(...values),
            max: Math.max(...values)
        }
    })
})

function formatValue(value, unit = '') {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
    return `${Number(value).toFixed(2)}${unit}`
}

function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
    return Number(value).toFixed(2)
}

function formatDateTime(date) {
    const pad = n => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function normalizeTime(value) {
    if (!value) return ''
    return String(value).replace('T', ' ').slice(0, 19)
}

async function syncEnvData() {
    const res = await fetchLatestEnvData(dataStore.poolId)
    if (res.success && res.data) {
        Object.assign(dataStore.envData, {
            waterTemp: res.data.waterTemp,
            dissolvedOxygen: res.data.dissolvedOxygen,
            ph: res.data.ph,
            ammoniaNitrogen: res.data.ammoniaNitrogen,
            nitrite: res.data.nitrite,
            turbidity: res.data.turbidity,
            waterLevel: res.data.waterLevel
        })
        dataStore.currentTime = res.data.currentTime || dataStore.currentTime
    }
}

async function loadHistory() {
    if (selectedMetrics.value.length === 0) {
        historyRows.value = []
        historyError.value = '请至少选择一个指标'
        renderHistoryChart()
        return
    }

    historyLoading.value = true
    historyError.value = ''
    try {
        const end = new Date()
        const start = new Date(end.getTime() - rangeHours.value * 3600 * 1000)
        const result = await fetchHistoryData(
            dataStore.poolId,
            formatDateTime(start),
            formatDateTime(end),
            selectedMetrics.value
        )
        historyRows.value = result.success ? result.data : []
        if (!result.success) {
            historyError.value = result.message || '历史数据加载失败'
        } else if (result.data.length === 0) {
            historyError.value = '所选时间范围内没有数据'
        }
    } finally {
        historyLoading.value = false
        await nextTick()
        renderHistoryChart()
    }
}

function renderHistoryChart() {
    if (!historyChartRef.value) return
    if (!historyChart) historyChart = echarts.init(historyChartRef.value)

    if (historyRows.value.length === 0) {
        historyChart.clear()
        return
    }

    const xAxis = historyRows.value.map(row => normalizeTime(row.ts).slice(11, 19))
    const palette = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399', '#9B59B6', '#1ABC9C']

    const series = selectedMetrics.value.map((field, index) => {
        const meta = METRIC_OPTIONS.find(item => item.field === field) || { label: field }
        return {
            name: meta.label,
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: historyRows.value.map(row => {
                const val = row[field]
                return val === null || val === undefined ? null : Number(val)
            }),
            lineStyle: { width: 2, color: palette[index % palette.length] },
            itemStyle: { color: palette[index % palette.length] }
        }
    })

    historyChart.setOption({
        tooltip: { trigger: 'axis' },
        legend: {
            data: selectedMetrics.value.map(field =>
                (METRIC_OPTIONS.find(item => item.field === field) || { label: field }).label
            ),
            bottom: 0,
            textStyle: { fontSize: 12, color: '#606266' }
        },
        grid: { left: '4%', right: '4%', top: '8%', bottom: '16%', containLabel: true },
        xAxis: {
            type: 'category',
            data: xAxis,
            boundaryGap: false,
            axisLabel: { color: '#606266', fontSize: 10, rotate: 30 }
        },
        yAxis: {
            type: 'value',
            axisLabel: { color: '#606266', fontSize: 10 },
            splitLine: { lineStyle: { color: '#e8e8e8', type: 'dashed' } }
        },
        series
    }, true)
}

function handleResize() {
    historyChart?.resize()
}

// ---------- 生命周期 ----------
let envTimer = null
let dataTimer = null

onMounted(async () => {
    await Promise.all([syncEnvData(), refreshDevices()])
    await loadHistory()
    window.addEventListener('resize', handleResize)

    envTimer = setInterval(() => {
        syncEnvData()
        refreshDevices()
    }, 15000)

    // 历史趋势每分钟刷新一次即可
    dataTimer = setInterval(loadHistory, 60000)
})

onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
    if (envTimer) clearInterval(envTimer)
    if (dataTimer) clearInterval(dataTimer)
    envTimer = null
    dataTimer = null
    historyChart?.dispose()
    historyChart = null
})
</script>

<style scoped>
.page-device { width: 96%; max-width: 1920px; margin: 0 auto; padding-bottom: 40px; }
.three-column-row-top { display: flex; gap: 20px; min-height: 300px; margin-bottom: 20px; }
.left-col-top { width: 30%; flex-shrink: 0; display: flex; flex-direction: column; }
.mid-col-top { width: 40%; flex-shrink: 0; display: flex; flex-direction: column; }
.right-col-top { width: 29%; flex-shrink: 0; display: flex; flex-direction: column; }
.card-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; flex-wrap: wrap; }
.time-text { font-size: 16px; font-weight: 600; color: #409EFF; }
.pool-tag { font-size: 13px; color: #909399; white-space: nowrap; }

.env-list { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.env-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #f0f7fc; border-radius: 6px; }
.env-value { font-weight: 700; font-size: 16px; color: #303133; }
.device-tip { margin-top: 14px; text-align: left; }

.device-status-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
.status-chip { display: flex; flex-direction: column; align-items: center; padding: 10px; border-radius: 8px; background: #f5f7fa; }
.status-chip.running { background: #f0f9eb; }
.status-chip.online { background: #ecf5ff; }
.status-chip.offline { background: #f4f4f5; }
.chip-value { font-size: 22px; font-weight: 700; color: #303133; }
.chip-label { font-size: 12px; color: #909399; }

.monitor-placeholder-sm { width: 100%; height: 200px; border-radius: 8px; overflow: hidden; position: relative; background: #eef5f9; display: flex; align-items: center; justify-content: center; flex: 1; }
.monitor-img-sm { width: 100%; height: 100%; object-fit: cover; display: none; }
.monitor-img-sm[src]:not([src=""]) { display: block; }
.monitor-empty-sm { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.monitor-img-sm[src]:not([src=""]) ~ .monitor-empty-sm { display: none; }

.two-column-row-bottom { display: flex; gap: 20px; min-height: 460px; }
.left-col-bottom { width: 58%; flex-shrink: 0; display: flex; flex-direction: column; }
.right-col-bottom { width: 42%; flex-shrink: 0; display: flex; flex-direction: column; }
.analysis-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.chart-box-history { width: 100%; flex: 1; min-height: 380px; }
.alert-name { font-weight: 600; color: #303133; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }

@media (max-width: 1400px) {
    .three-column-row-top { flex-wrap: wrap; }
    .left-col-top, .mid-col-top, .right-col-top { width: 100%; min-width: 0; }
    .two-column-row-bottom { flex-wrap: wrap; }
    .left-col-bottom, .right-col-bottom { width: 100%; }
    .monitor-placeholder-sm { height: 180px; }
}
</style>
