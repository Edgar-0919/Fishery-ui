/**
 * 统一 API 调用层
 *
 * 约定：
 * 1. 所有后端接口都在这里集中封装，组件不直接 fetch
 * 2. 后端地址通过 VITE_API_BASE_URL 配置，默认 http://localhost:8000
 * 3. 所有函数都不抛异常，返回 { success, data, message } 结构，便于组件统一处理
 */

// 未配置环境变量时回退本地开发地址；显式配置为空字符串表示走同源（需自行配置反向代理）
const ENV_BASE_URL = import.meta.env.VITE_API_BASE_URL
const BASE_URL = (
    ENV_BASE_URL === undefined ? 'http://localhost:8000' : ENV_BASE_URL
).replace(/\/$/, '')

// 普通查询超时（毫秒）
const QUERY_TIMEOUT = 15000
// AI 问答超时：GLM-4.5 长文本生成较慢
const CHAT_TIMEOUT = 90000
// 本地缓存有效期：仅在后端不可达时兜底
const CACHE_DURATION = 5 * 60 * 1000

// localStorage 中的令牌键名
const TOKEN_KEY = 'fishery_token'
const USER_KEY = 'fishery_user'

/**
 * 读取本地令牌
 */
export function getAuthToken() {
    return localStorage.getItem(TOKEN_KEY) || ''
}

/**
 * 保存令牌与用户信息
 */
export function setAuthSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token)
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
}

/**
 * 读取缓存的用户信息
 */
export function getAuthUser() {
    try {
        return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    } catch {
        return null
    }
}

/**
 * 清除登录态
 */
export function clearAuthSession() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    // 会话与用户绑定，退出登录必须一并清除，避免换账号后串用上下文
    localStorage.removeItem(CHAT_SESSION_KEY)
}

/**
 * 指标字段映射：前端展示名 → 后端 sensor_data 字段名
 */
export const METRIC_FIELD_MAP = {
    '水温': 'temperature',
    '溶解氧（DO）': 'dissolved_oxygen',
    'pH 值': 'ph_value',
    '氨氮': 'ammonia_nitrogen',
    '亚硝酸盐': 'nitrite',
    '浊度': 'ts_value',
    '水位': 'water_level'
}

/** 各指标单位 */
export const METRIC_UNIT_MAP = {
    '水温': '℃',
    '溶解氧（DO）': 'mg/L',
    'pH 值': '',
    '氨氮': 'mg/L',
    '亚硝酸盐': 'mg/L',
    '浊度': 'NTU',
    '水位': 'm'
}

/**
 * 尝试解析响应 JSON，失败时返回 null
 */
async function safeJson(response) {
    try {
        return await response.json()
    } catch {
        return null
    }
}

/**
 * 基础请求封装
 * @param {string} path - 以 / 开头的接口路径
 * @param {object} options - { method, body, timeout, skipAuthRedirect }
 * @returns {Promise<any>} 后端 JSON 响应
 */
async function request(path, {
    method = 'GET',
    body,
    timeout = QUERY_TIMEOUT,
    skipAuthRedirect = false
} = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    const headers = {}
    if (body) headers['Content-Type'] = 'application/json'
    const token = getAuthToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal
        })

        // 令牌失效：清除本地登录态并跳转登录页（登录接口自身除外）
        if (response.status === 401) {
            const detail = await safeJson(response)
            if (!skipAuthRedirect) {
                clearAuthSession()
                if (!window.location.pathname.startsWith('/login')) {
                    window.location.href = '/login'
                }
            }
            throw new Error(detail?.detail || '登录已过期，请重新登录')
        }

        if (!response.ok) {
            const detail = await safeJson(response)
            const message = typeof detail?.detail === 'string'
                ? detail.detail
                : `HTTP ${response.status}`
            throw new Error(message)
        }

        return await response.json()
    } finally {
        clearTimeout(timer)
    }
}

// ---------- 认证 ----------

/**
 * 登录，成功后自动保存令牌
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{success: boolean, user?: object, message?: string}>}
 */
export async function login(username, password) {
    try {
        const result = await request('/api/auth/login', {
            method: 'POST',
            body: { username, password },
            skipAuthRedirect: true
        })
        if (result.success && result.token) {
            setAuthSession(result.token, result.user)
            return { success: true, user: result.user }
        }
        return { success: false, message: result.message || '登录失败' }
    } catch (err) {
        return { success: false, message: err.message || '登录失败，请检查网络' }
    }
}

/**
 * 退出登录，清除本地令牌
 */
export function logout() {
    clearAuthSession()
}

/**
 * 校验当前令牌是否有效，并返回最新用户信息
 */
export async function fetchCurrentUser() {
    try {
        const result = await request('/api/auth/me')
        return { success: result.success ?? false, user: result.user ?? null }
    } catch (err) {
        return { success: false, user: null, message: err.message }
    }
}

/**
 * 修改当前用户密码
 * @param {string} oldPassword
 * @param {string} newPassword
 */
export async function changePassword(oldPassword, newPassword) {
    try {
        const result = await request('/api/auth/change-password', {
            method: 'POST',
            body: { old_password: oldPassword, new_password: newPassword }
        })
        return { success: result.success ?? false, message: result.message }
    } catch (err) {
        return { success: false, message: err.message || '密码修改失败' }
    }
}

// ---------- 传感器数据 ----------

/**
 * 获取传感器数据（后端优先返回最近 1 分钟，无数据回退最近 10 条）
 * @param {string} pondId
 * @param {string} deviceId
 */
async function requestSensorData(pondId = 'pond1', deviceId = '') {
    const params = new URLSearchParams()
    if (pondId) params.append('pond_id', pondId)
    if (deviceId) params.append('device_id', deviceId)
    return request(`/api/sensor-data?${params}`)
}

/**
 * 拉取最新一条环境数据，返回已映射为前端字段的对象
 * @param {string} pondId
 * @param {string} deviceId
 * @returns {Promise<{success: boolean, data: object|null, message?: string}>}
 */
export async function fetchLatestEnvData(pondId = 'pond1', deviceId = '') {
    const cacheKey = `latest_env_${pondId}`
    try {
        const result = await requestSensorData(pondId, deviceId)
        if (!result.success || !result.data || result.data.length === 0) {
            return { success: false, data: getFromCache(cacheKey), message: '后端暂无数据' }
        }

        const latest = [...result.data].sort((a, b) => new Date(b.ts) - new Date(a.ts))[0]
        const envPatch = {
            waterTemp: latest.temperature ?? null,
            dissolvedOxygen: latest.dissolved_oxygen ?? null,
            ph: latest.ph_value ?? null,
            ammoniaNitrogen: latest.ammonia_nitrogen ?? null,
            nitrite: latest.nitrite ?? null,
            turbidity: latest.ts_value ?? null,
            waterLevel: latest.water_level ?? null,
            currentTime: latest.ts ? String(latest.ts).slice(11, 16) : '--:--'
        }
        saveToCache(cacheKey, envPatch)
        return { success: true, data: envPatch }
    } catch (err) {
        console.error('[最新数据请求失败]:', err.message)
        const cached = getFromCache(cacheKey)
        return {
            success: false,
            data: cached,
            message: cached ? '网络异常，使用本地缓存' : '服务器不可达且无缓存'
        }
    }
}

/**
 * 获取指定指标的时序数据（用于趋势图）
 * @param {string} metric - 前端展示名，如 '水温'
 * @param {string} pondId
 * @param {string} deviceId
 * @returns {Promise<{data: {xAxis: string[], values: number[]}, fromCache: boolean, error: string|null}>}
 */
export async function fetchPredictData(metric, pondId = 'pond1', deviceId = '') {
    const cacheKey = `metric_${metric}_${pondId}`
    const cached = getFromCache(cacheKey)

    try {
        const result = await requestSensorData(pondId, deviceId)
        if (result.success && result.data?.length > 0) {
            const sorted = [...result.data].sort((a, b) => new Date(b.ts) - new Date(a.ts))
            const chartData = extractMetricSeries(sorted, metric)
            saveToCache(cacheKey, chartData)
            return { data: chartData, fromCache: false, error: null }
        }
        if (cached) {
            return { data: cached, fromCache: true, error: '后端暂无新数据，使用缓存' }
        }
        return { data: { xAxis: [], values: [] }, fromCache: false, error: '暂无该指标数据' }
    } catch (err) {
        console.error(`[API 请求失败] ${metric}:`, err.message)
        if (cached) {
            return { data: cached, fromCache: true, error: '网络异常，使用本地缓存' }
        }
        return { data: { xAxis: [], values: [] }, fromCache: false, error: '服务器不可达且无缓存' }
    }
}

/**
 * 查询历史数据（用于多指标对比）
 * @param {string} pondId
 * @param {string} start - 'YYYY-MM-DD HH:mm:ss'
 * @param {string} end
 * @param {string[]} metrics - 后端字段名数组
 */
export async function fetchHistoryData(pondId, start, end, metrics) {
    try {
        const params = new URLSearchParams({ pond_id: pondId, start, end })
        if (metrics?.length) params.append('metrics', metrics.join(','))
        const result = await request(`/api/sensor-data/history?${params}`)
        return { success: result.success ?? false, data: result.data ?? [], message: result.message }
    } catch (err) {
        console.error('[历史数据请求失败]:', err.message)
        return { success: false, data: [], message: '历史数据请求失败' }
    }
}

// ---------- Agent 问答与决策 ----------

const CHAT_SESSION_KEY = 'fishery_chat_session'

/**
 * 获取（或创建）当前浏览器的问答会话ID
 * 组件不直接操作 localStorage，统一经由 services/api.js 访问
 */
export function getChatSessionId() {
    let id = localStorage.getItem(CHAT_SESSION_KEY)
    if (!id) {
        id = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`
        localStorage.setItem(CHAT_SESSION_KEY, id)
    }
    return id
}

/** 开启新会话（清空本地会话标识） */
export function resetChatSession() {
    localStorage.removeItem(CHAT_SESSION_KEY)
}

/** 切换到指定会话 */
export function setChatSessionId(sessionId) {
    if (sessionId) localStorage.setItem(CHAT_SESSION_KEY, sessionId)
}

/** 新建会话：ID 由服务端生成并自动设为当前会话 */
export async function createChatSession() {
    try {
        const result = await request('/api/agent/sessions', { method: 'POST' })
        const sessionId = result.session_id || ''
        if (sessionId) setChatSessionId(sessionId)
        return { success: Boolean(sessionId), sessionId }
    } catch (err) {
        console.error('[新建会话失败]:', err.message)
        return { success: false, sessionId: '' }
    }
}

/** 获取当前用户的会话列表 */
export async function fetchChatSessions(limit = 20) {
    try {
        const result = await request(`/api/agent/sessions?limit=${limit}`)
        return { success: result.success ?? true, data: result.data ?? [] }
    } catch (err) {
        console.error('[会话列表请求失败]:', err.message)
        return { success: false, data: [] }
    }
}

/** 回放指定会话的消息（刷新页面后恢复对话界面） */
export async function fetchChatMessages(sessionId, limit = 200) {
    try {
        const result = await request(
            `/api/agent/sessions/${encodeURIComponent(sessionId)}/messages?limit=${limit}`
        )
        return { success: result.success ?? true, data: result.data ?? [] }
    } catch (err) {
        console.error('[会话消息请求失败]:', err.message)
        return { success: false, data: [] }
    }
}

/** 删除会话及其全部消息 */
export async function deleteChatSession(sessionId) {
    try {
        const result = await request(
            `/api/agent/sessions/${encodeURIComponent(sessionId)}`,
            { method: 'DELETE' }
        )
        return { success: result.success ?? true }
    } catch (err) {
        console.error('[删除会话失败]:', err.message)
        return { success: false }
    }
}

/**
 * AI 养殖助手问答（含 RAG 检索增强与多轮上下文）
 * @param {string} message
 * @param {string} sessionId
 */
export async function chatAgent(message, sessionId) {
    const body = { message }
    if (sessionId) body.session_id = sessionId
    try {
        const result = await request('/api/agent/chat', {
            method: 'POST',
            body,
            timeout: CHAT_TIMEOUT
        })
        return {
            success: result.success ?? false,
            reply: result.reply ?? '',
            sources: result.sources ?? []
        }
    } catch (err) {
        console.error('[AI 问答请求失败]:', err.message)
        return { success: false, reply: 'AI 服务不可达，请稍后重试', sources: [] }
    }
}

/**
 * 解析单个 SSE 帧，返回 { event, data }；注释帧或非法 JSON 返回 null
 */
function parseSseFrame(frame) {
    let event = 'message'
    const dataLines = []
    for (const line of frame.split(/\r?\n/)) {
        if (!line || line.startsWith(':')) continue
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
    }
    if (!dataLines.length) return null
    try {
        return { event, data: JSON.parse(dataLines.join('\n')) }
    } catch {
        return null
    }
}

/**
 * SSE 流式 AI 问答：逐块接收 Markdown 文本，先收到 RAG 参考来源
 *
 * 与 chatAgent 的区别：不返回完整文本，而是通过回调把增量内容交给组件。
 * 建立流失败时会抛异常，调用方需降级到 chatAgent；流已开始后失败则通过
 * onError 回调通知，避免重复发起请求造成重复回答。
 *
 * @param {string} message
 * @param {string} sessionId
 * @param {{signal?: AbortSignal, onMeta?: Function, onDelta?: Function,
 *          onError?: Function, onDone?: Function}} handlers
 * @returns {Promise<{success: boolean}>} 是否收到后端的结束标记
 */
export async function chatAgentStream(message, sessionId, handlers = {}) {
    const { signal, onMeta, onDelta, onError, onDone } = handlers
    const body = { message }
    if (sessionId) body.session_id = sessionId

    const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
    const token = getAuthToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    const response = await fetch(`${BASE_URL}/api/agent/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal
    })

    // 令牌失效：与普通请求保持一致的处理（EventSource 不支持自定义头，故这里用 fetch）
    if (response.status === 401) {
        const detail = await safeJson(response)
        clearAuthSession()
        if (!window.location.pathname.startsWith('/login')) {
            window.location.href = '/login'
        }
        throw new Error(detail?.detail || '登录已过期，请重新登录')
    }
    if (!response.ok) {
        const detail = await safeJson(response)
        throw new Error(
            typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`
        )
    }
    if (!response.body?.getReader) {
        throw new Error('当前浏览器不支持流式响应')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let completed = false

    function dispatch(frame) {
        const parsed = parseSseFrame(frame)
        if (!parsed) return
        const { event, data } = parsed
        if (event === 'meta') onMeta?.(data.sources ?? [])
        else if (event === 'delta' && data.content) onDelta?.(data.content)
        else if (event === 'error') onError?.(data.message ?? '生成失败')
        else if (event === 'done') {
            completed = true
            onDone?.(data)
        }
    }

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            // 一个网络分块可能包含半个或多个 SSE 帧，按空行切分并保留尾部残片
            buffer += decoder.decode(value, { stream: true })
            const frames = buffer.split(/\r?\n\r?\n/)
            buffer = frames.pop() ?? ''
            for (const frame of frames) dispatch(frame)
        }
        buffer += decoder.decode()
        if (buffer.trim()) dispatch(buffer)
    } finally {
        try { reader.releaseLock() } catch { /* 流被中止时忽略 */ }
    }

    return { success: completed }
}

/**
 * 查询 Agent 决策记录（设备指令 + 关联告警）
 * @param {{pondId?: string, limit?: number}} options
 */
export async function fetchAgentDecisions({ pondId = '', limit = 20 } = {}) {
    try {
        const params = new URLSearchParams({ limit: String(limit) })
        if (pondId) params.append('pond_id', pondId)
        const result = await request(`/api/agent/decisions?${params}`)
        return { success: result.success ?? false, data: result.data ?? [], message: result.message }
    } catch (err) {
        console.error('[决策记录请求失败]:', err.message)
        return { success: false, data: [], message: '决策记录请求失败' }
    }
}

// ---------- 告警 ----------

/**
 * 查询活跃告警
 * @param {string} pondId
 */
export async function fetchActiveAlerts(pondId = '') {
    try {
        const params = new URLSearchParams()
        if (pondId) params.append('pond_id', pondId)
        const result = await request(`/api/alerts/active?${params}`)
        return { success: result.success ?? false, data: result.data ?? [], message: result.message }
    } catch (err) {
        console.error('[活跃告警请求失败]:', err.message)
        return { success: false, data: [], message: '告警服务不可达' }
    }
}

/**
 * 查询已升级告警
 * @param {string} pondId
 */
export async function fetchEscalatedAlerts(pondId = '') {
    try {
        const params = new URLSearchParams()
        if (pondId) params.append('pond_id', pondId)
        const result = await request(`/api/alerts/escalated?${params}`)
        return { success: result.success ?? false, data: result.data ?? [], message: result.message }
    } catch (err) {
        console.error('[升级告警请求失败]:', err.message)
        return { success: false, data: [], message: '告警服务不可达' }
    }
}

// ---------- 人工工单 ----------

/**
 * 查询工单列表
 * @param {{status?: string, pondId?: string}} options
 */
export async function fetchManualTasks({ status = '', pondId = '' } = {}) {
    try {
        const params = new URLSearchParams()
        if (status) params.append('status', status)
        if (pondId) params.append('pond_id', pondId)
        const result = await request(`/api/manual-tasks?${params}`)
        return { success: result.success ?? false, data: result.data ?? [], message: result.message }
    } catch (err) {
        console.error('[工单请求失败]:', err.message)
        return { success: false, data: [], message: '工单服务不可达' }
    }
}

/**
 * 标记工单为处理中
 * @param {number} taskId
 * @param {{handler: string, remark: string}} payload
 */
export async function processManualTask(taskId, payload) {
    try {
        const result = await request(`/api/manual-tasks/${taskId}/process`, {
            method: 'POST',
            body: { handler: payload.handler || 'admin', remark: payload.remark || '' }
        })
        return { success: result.success ?? false, message: result.message }
    } catch (err) {
        console.error('[工单处理失败]:', err.message)
        return { success: false, message: '操作失败，请稍后重试' }
    }
}

/**
 * 标记工单为已解决
 * @param {number} taskId
 * @param {{handler: string, remark: string}} payload
 */
export async function resolveManualTask(taskId, payload) {
    try {
        const result = await request(`/api/manual-tasks/${taskId}/resolve`, {
            method: 'POST',
            body: { handler: payload.handler || 'admin', remark: payload.remark || '' }
        })
        return { success: result.success ?? false, message: result.message }
    } catch (err) {
        console.error('[工单处理失败]:', err.message)
        return { success: false, message: '操作失败，请稍后重试' }
    }
}

// ---------- 设备控制 ----------

/**
 * 查询可控设备列表
 * @param {string} pondId
 */
export async function fetchControlDevices(pondId = '') {
    try {
        const params = new URLSearchParams()
        if (pondId) params.append('pond_id', pondId)
        const result = await request(`/api/control-devices?${params}`)
        return { success: result.success ?? false, data: result.data ?? [], message: result.message }
    } catch (err) {
        console.error('[设备列表请求失败]:', err.message)
        return { success: false, data: [], message: '设备服务不可达' }
    }
}

/**
 * 手动下发设备指令
 * @param {string} deviceIdentifier
 * @param {{command_type: string, params: object}} payload
 */
export async function sendDeviceCommand(deviceIdentifier, payload) {
    try {
        const result = await request(
            `/api/control-devices/${encodeURIComponent(deviceIdentifier)}/command`,
            {
                method: 'POST',
                body: {
                    command_type: payload.command_type,
                    params: payload.params || {}
                }
            }
        )
        return { success: result.success ?? false, message: result.message }
    } catch (err) {
        console.error('[设备指令下发失败]:', err.message)
        return { success: false, message: '指令下发失败，请稍后重试' }
    }
}

// ---------- 工具函数 ----------

/**
 * 从原始数据中提取指定指标的时序数据（过滤 null）
 * @param {Array} sortedData - 已按时间倒序排列的数据
 * @param {string} metric - 前端展示名
 */
function extractMetricSeries(sortedData, metric) {
    const field = METRIC_FIELD_MAP[metric]
    if (!field) return { xAxis: [], values: [] }

    const xAxis = []
    const values = []
    // 转为时间正序
    const ascending = [...sortedData].reverse()
    ascending.forEach(item => {
        const val = item[field]
        if (val !== null && val !== undefined) {
            xAxis.push(item.ts ? String(item.ts).slice(0, 16) : '')
            values.push(val)
        }
    })
    return { xAxis, values }
}

function getFromCache(key) {
    try {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const { data, timestamp } = JSON.parse(raw)
        if (Date.now() - timestamp > CACHE_DURATION) {
            localStorage.removeItem(key)
            return null
        }
        return data
    } catch {
        return null
    }
}

function saveToCache(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify({
            data: value,
            timestamp: Date.now()
        }))
    } catch (e) {
        console.warn('缓存写入失败:', e.message)
    }
}
