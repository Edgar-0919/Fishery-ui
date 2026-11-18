<template>
    <div class="page-realtime">
        <!-- ==================== 上半部分：三栏布局 ==================== -->
        <div class="three-column-row">
            <!-- 左栏：当前养殖环境数据卡片 -->
            <div class="card-wrapper left-col">
                <div class="card-header-row">
                    <span class="card-title">当前养殖环境数据</span>
                    <div class="header-right">
                        <span class="time-text">{{ dataStore.currentTime }}</span>
                        <span class="pool-tag">养殖池编号：{{ dataStore.poolId }}</span>
                    </div>
                </div>

                <div class="data-grid">
                    <div class="data-mini-card">
                        <span class="metric-label">水温</span>
                        <span class="metric-value">{{ formatValue(dataStore.envData.waterTemp, '℃') }}</span>
                    </div>
                    <div class="data-mini-card">
                        <span class="metric-label">溶解氧（DO）</span>
                        <span class="metric-value">{{ formatValue(dataStore.envData.dissolvedOxygen, 'mg/L') }}</span>
                    </div>
                    <div class="data-mini-card">
                        <span class="metric-label">pH 值</span>
                        <span class="metric-value">{{ formatValue(dataStore.envData.ph) }}</span>
                    </div>
                    <div class="data-mini-card">
                        <span class="metric-label">氨氮（NH3-N）</span>
                        <span class="metric-value">{{ formatValue(dataStore.envData.ammoniaNitrogen, 'mg/L') }}</span>
                    </div>
                    <div class="data-mini-card">
                        <span class="metric-label">亚硝酸盐</span>
                        <span class="metric-value">{{ formatValue(dataStore.envData.nitrite, 'mg/L') }}</span>
                    </div>
                    <div class="data-mini-card">
                        <span class="metric-label">浊度</span>
                        <span class="metric-value">{{ formatValue(dataStore.envData.turbidity, 'NTU') }}</span>
                    </div>
                    <div class="data-mini-card span-all">
                        <span class="metric-label">水位</span>
                        <span class="metric-value">{{ formatValue(dataStore.envData.waterLevel, 'm') }}</span>
                    </div>
                </div>
                <p class="gray-tip device-tip">
                    设备联动提示：{{ dataStore.deviceTip }}
                    <span v-if="syncError" class="error-text">（{{ syncError }}）</span>
                </p>
            </div>

            <!-- 中栏：实时监控卡片 -->
            <div class="card-wrapper mid-col">
                <div class="card-header-row">
                    <span class="card-title">实时监控</span>
                    <span class="pool-tag">养殖池编号：{{ dataStore.poolId }}</span>
                </div>
                <div class="monitor-placeholder">
                    <!-- 此处填入监控/卫星地图图片路径 -->
                    <img class="monitor-img" src="../static/ai俯拍鱼.png" alt="实时监控画面" />
                    <div class="monitor-empty">
                        <el-icon size="48px" color="#c0c4cc"><VideoCamera /></el-icon>
                        <span class="gray-tip">监控画面占位</span>
                    </div>
                </div>
            </div>

            <!-- 右栏：告警与通知侧边栏 -->
            <div class="card-wrapper right-col">
                <div class="card-header-row">
                    <span class="card-title">活跃告警</span>
                    <div class="fish-icon-placeholder">
                        <el-icon size="28px" color="#409EFF"><Opportunity /></el-icon>
                    </div>
                </div>
                <div class="notification-list">
                    <el-empty
                        v-if="dataStore.activeAlerts.length === 0"
                        description="暂无活跃告警"
                        :image-size="70"
                    />
                    <div
                        v-for="alert in dataStore.activeAlerts"
                        :key="alert.id"
                        class="notification-item"
                    >
                        <el-tag
                            :type="alert.status === 'escalated' ? 'danger' : 'warning'"
                            size="small"
                            class="notify-tag"
                        >
                            {{ formatAlertType(alert.alert_type) }}
                        </el-tag>
                        <span class="gray-tip notify-content">{{ alertMessage(alert) }}</span>
                    </div>
                </div>
                <p class="blue-link more-link" @click="$router.push('/alerts')">查看全部告警</p>
            </div>
        </div>

        <!-- ==================== 下半部分：实时趋势 ==================== -->
        <div class="card-wrapper predict-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 class="card-title" style="margin-bottom:0;">实时趋势</h3>
                <span v-if="activeError" style="color:#E6A23C; font-size:12px;">{{ activeError }}</span>
                <span v-else-if="activeFromCache" style="color:#909399; font-size:12px;">缓存数据（离线）</span>
            </div>

            <div class="predict-tabs">
                <el-button
                    v-for="tab in dataStore.predictTabs"
                    :key="tab"
                    :class="['predict-tab-btn', { 'active-nav': dataStore.activePredictTab === tab }]"
                    :style="dataStore.activePredictTab === tab
                        ? 'background:#409EFF;color:#fff;border-color:#409EFF;'
                        : 'background:#ecf5ff;color:#606266;border-color:#d9ecff;'"
                    size="default"
                    @click="switchTab(tab)"
                >
                    {{ tab }}
                </el-button>
            </div>
            <div ref="predictChartRef" class="chart-box"></div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { VideoCamera, Opportunity } from '@element-plus/icons-vue'
import { dataStore } from '@/stores/dataStore'
import { fetchPredictData, fetchLatestEnvData, fetchActiveAlerts } from '@/services/api'

const predictChartRef = ref(null)
let predictChart = null
const activeFromCache = ref(false)
const activeError = ref(null)
const syncError = ref('')

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
 * 格式化指标数值，无数据显示 "--"
 */
function formatValue(value, unit = '') {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
    return `${Number(value).toFixed(2)}${unit}`
}

function formatAlertType(type) {
    if (!type) return '--'
    if (type === 'effect_check_failed') return '指令效果未达标'
    let m = type.match(/^(.+?)_(low|high)_warning$/)
    if (m) return `${SENSOR_LABELS[m[1]] || m[1]}${m[2] === 'low' ? '偏低' : '偏高'}`
    m = type.match(/^(.+?)_trend_(rising|falling)$/)
    if (m) return `${SENSOR_LABELS[m[1]] || m[1]}${m[2] === 'rising' ? '上升' : '下降'}`
    m = type.match(/^(.+?)_(low|high)$/)
    if (m) return `${SENSOR_LABELS[m[1]] || m[1]}${m[2] === 'low' ? '过低' : '过高'}`
    return type
}

function alertMessage(alert) {
    if (alert.agent_decision) return alert.agent_decision
    return `${alert.pond_id} 持续 ${alert.duration_minutes || 0} 分钟`
}

/**
 * 加载指定指标的数据（网络优先 + 缓存退化）
 */
async function loadDataForMetric(metric) {
    const res = await fetchPredictData(metric, dataStore.poolId)
    dataStore.predictChartMap[metric] = {
        xAxis: res.data.xAxis,
        values: res.data.values,
        fromCache: res.fromCache,
        error: res.error
    }
    return res
}

/**
 * 绘制/更新 ECharts 图表
 */
function renderChart() {
    if (!predictChartRef.value) return
    if (!predictChart) predictChart = echarts.init(predictChartRef.value)

    const metric = dataStore.activePredictTab
    const chartData = dataStore.predictChartMap[metric]
    if (!chartData || chartData.xAxis.length === 0) {
        predictChart.clear()
        return
    }

    const option = {
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(255,255,255,0.95)',
            borderColor: '#409EFF',
            textStyle: { color: '#303133' },
            formatter: (params) => {
                const p = params[0]
                const val = typeof p.value === 'number' ? p.value.toFixed(2) : p.value
                return `<strong>${p.axisValue}</strong><br/>${metric}：<span style="color:#409EFF;font-weight:700;">${val}</span>`
            }
        },
        grid: { left: '5%', right: '5%', bottom: '8%', top: '10%', containLabel: true },
        xAxis: {
            type: 'category',
            data: chartData.xAxis,
            boundaryGap: false,
            axisLabel: { color: '#606266', fontSize: 11, rotate: 30 }
        },
        yAxis: {
            type: 'value',
            axisLabel: { color: '#606266', fontSize: 11 },
            splitLine: { lineStyle: { color: '#e8e8e8', type: 'dashed' } }
        },
        series: [{
            name: metric,
            type: 'line',
            data: chartData.values,
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { color: '#409EFF', width: 2.5 },
            itemStyle: { color: '#409EFF' },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(64,158,255,0.3)' },
                    { offset: 1, color: 'rgba(64,158,255,0.02)' }
                ])
            }
        }]
    }
    predictChart.setOption(option, true)
}

/**
 * 切换标签并加载数据
 */
async function switchTab(tab) {
    dataStore.activePredictTab = tab
    const current = dataStore.predictChartMap[tab]
    if (!current || current.xAxis.length === 0) {
        await loadDataForMetric(tab)
    }
    activeFromCache.value = dataStore.predictChartMap[tab]?.fromCache || false
    activeError.value = dataStore.predictChartMap[tab]?.error || null
    renderChart()
}

/**
 * 同步环境数据（左上角卡片）
 */
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
        syncError.value = ''
    } else {
        syncError.value = res.message || '数据不可用'
    }
}

/**
 * 同步活跃告警（右侧栏 + 设备联动提示）
 */
async function syncAlerts() {
    const res = await fetchActiveAlerts(dataStore.poolId)
    dataStore.activeAlerts = res.success ? res.data : []
    dataStore.deviceTip = dataStore.activeAlerts.length
        ? `当前 ${dataStore.activeAlerts.length} 条活跃告警，Agent 已介入处理`
        : '暂无告警'
}

// 命名函数：resize 事件处理（避免匿名函数导致 removeEventListener 失效）
const handleResize = () => predictChart?.resize()

// ---------- 生命周期 ----------
let envTimer = null
let alertTimer = null

onMounted(async () => {
    await syncEnvData()
    await syncAlerts()
    const defaultTab = dataStore.activePredictTab
    await loadDataForMetric(defaultTab)
    activeError.value = dataStore.predictChartMap[defaultTab]?.error || null
    activeFromCache.value = dataStore.predictChartMap[defaultTab]?.fromCache || false
    nextTick(() => renderChart())
    window.addEventListener('resize', handleResize)

    // 5 秒轮询环境数据与当前指标趋势
    envTimer = setInterval(async () => {
        await syncEnvData()
        const currentTab = dataStore.activePredictTab
        await loadDataForMetric(currentTab)
        activeError.value = dataStore.predictChartMap[currentTab]?.error || null
        activeFromCache.value = dataStore.predictChartMap[currentTab]?.fromCache || false
        renderChart()
    }, 5000)

    // 15 秒轮询告警，避免过于频繁查库
    alertTimer = setInterval(syncAlerts, 15000)
})

onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
    if (envTimer) clearInterval(envTimer)
    if (alertTimer) clearInterval(alertTimer)
    envTimer = null
    alertTimer = null
    predictChart?.dispose()
    predictChart = null
})
</script>

<style scoped>
.page-realtime { width: 96%; max-width: 1920px; margin: 0 auto; padding-bottom: 40px; }
.three-column-row { display: flex; gap: 20px; min-height: 400px; margin-bottom: 20px; }
.left-col { width: 30%; flex-shrink: 0; display: flex; flex-direction: column; }
.mid-col { width: 40%; flex-shrink: 0; display: flex; flex-direction: column; }
.right-col { width: 30%; flex-shrink: 0; display: flex; flex-direction: column; }
.card-header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.time-text { font-size: 18px; font-weight: 600; color: #409EFF; }
.pool-tag { font-size: 13px; color: #909399; white-space: nowrap; }
.data-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; flex: 1; }
.data-mini-card.span-all { grid-column: 1 / -1; }
.data-grid .metric-value { font-size: 19px; }
.device-tip { margin-top: 20px; text-align: left; }
.error-text { color: #E6A23C; }
.monitor-placeholder { width: 100%; height: 300px; border-radius: 8px; overflow: hidden; position: relative; background: #eef5f9; display: flex; align-items: center; justify-content: center; }
.monitor-img { width: 100%; height: 100%; object-fit: cover; display: none; }
.monitor-img[src]:not([src=""]) { display: block; }
.monitor-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.monitor-img[src]:not([src=""]) ~ .monitor-empty { display: none; }
.fish-icon-placeholder { width: 60px; height: 60px; border-radius: 50%; background: #ecf5ff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.notification-list { flex: 1; display: flex; flex-direction: column; gap: 15px; overflow-y: auto; }
.notification-item { display: flex; align-items: flex-start; gap: 10px; }
.notify-tag { flex-shrink: 0; font-size: 12px; }
.notify-content { line-height: 1.5; flex: 1; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.more-link { margin-top: 20px; text-align: right; }
.predict-section { margin-top: 0; width: 102%; }
.predict-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.chart-box { width: 100%; height: 400px; }
@media (max-width: 1400px) {
    .three-column-row { flex-wrap: wrap; }
    .left-col, .mid-col, .right-col { width: 100%; min-width: 0; }
    .monitor-placeholder { height: 220px; }
}
</style>
