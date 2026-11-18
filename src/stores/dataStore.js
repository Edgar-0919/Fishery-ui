import { reactive } from 'vue'

/**
 * 全局状态
 *
 * 约定：这里只放「最新一次拉取到的真实数据」，不放任何演示用的硬编码数值。
 * 未获取到数据时统一为 null，由视图渲染为 "--"。
 */

const METRIC_TABS = ['水温', '溶解氧（DO）', 'pH 值', '氨氮', '亚硝酸盐', '浊度', '水位']

function createEmptyChartMap() {
    const map = {}
    METRIC_TABS.forEach(tab => {
        map[tab] = { xAxis: [], values: [], fromCache: false, error: null }
    })
    return map
}

export const dataStore = reactive({
    currentTime: '--:--',
    poolId: 'pond1',

    // 7 项真实指标，未获取到数据时为 null
    envData: {
        waterTemp: null,
        dissolvedOxygen: null,
        ph: null,
        ammoniaNitrogen: null,
        nitrite: null,
        turbidity: null,
        waterLevel: null
    },

    // 设备联动提示（由活跃告警动态生成）
    deviceTip: '暂无告警',

    // 首页告警侧栏数据源
    activeAlerts: [],

    predictTabs: METRIC_TABS,
    activePredictTab: '水温',
    predictChartMap: createEmptyChartMap()
})

/**
 * 清空所有指标的趋势数据（切换鱼塘时调用）
 */
export function resetChartMap() {
    dataStore.predictChartMap = createEmptyChartMap()
}
