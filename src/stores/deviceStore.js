import { reactive } from 'vue'
import { fetchControlDevices } from '@/services/api'

/**
 * 设备状态全局单一数据源。
 *
 * 此前设备控制页查全部池塘、数据分析页固定只查 pond1，两页各自统计，
 * 导致「运行中/在线/离线」与设备总数对不上。这里统一拉取全量设备，
 * 页面只负责展示与本地筛选，不再各自决定统计范围。
 */
export const deviceStore = reactive({
    devices: [],
    loading: false,
    updatedAt: null,
    error: ''
})

let pendingRequest = null

/**
 * 刷新全量设备状态；并发调用复用同一个请求。
 * 请求失败时保留上一次成功的数据，避免页面状态瞬间归零。
 */
export function refreshDevices() {
    if (pendingRequest) return pendingRequest

    deviceStore.loading = true
    pendingRequest = (async () => {
        try {
            // 不传 pond_id：后端返回所有养殖池的设备
            const result = await fetchControlDevices()
            if (result.success) {
                deviceStore.devices = result.data || []
                deviceStore.updatedAt = new Date()
                deviceStore.error = ''
            } else {
                deviceStore.error = result.message || '设备状态加载失败'
            }
            return result.success
        } finally {
            deviceStore.loading = false
            pendingRequest = null
        }
    })()
    return pendingRequest
}

const DEVICE_TYPE_LABELS = {
    aerator: '增氧机',
    pump: '水泵',
    feeder: '投饵机'
}

const DEVICE_STATUS_LABELS = { running: '运行中', online: '在线', offline: '离线' }
const DEVICE_STATUS_TYPES = { running: 'success', online: 'primary', offline: 'info' }

/** 统一的状态统计口径：running / online / offline */
export function countDeviceStatus(list = []) {
    const result = { running: 0, online: 0, offline: 0 }
    list.forEach(device => {
        if (result[device.status] !== undefined) result[device.status] += 1
    })
    return result
}

export function deviceTypeLabel(type) {
    return DEVICE_TYPE_LABELS[type] || type || '--'
}

export function deviceStatusLabel(status) {
    return DEVICE_STATUS_LABELS[status] || status || '--'
}

export function deviceStatusType(status) {
    return DEVICE_STATUS_TYPES[status] || 'info'
}
