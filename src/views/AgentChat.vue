<template>
    <div class="agent-chat-page">
        <!-- 左栏：对话区 -->
        <div class="card-wrapper chat-panel">
            <div class="card-header-row">
                <span class="card-title">AI 养殖助手</span>
                <el-tag size="small" type="success">知识库增强</el-tag>
            </div>

            <!-- 消息列表 -->
            <div ref="messageList" class="message-list">
                <!-- 空状态欢迎语 -->
                <div v-if="messages.length === 0" class="welcome-tip">
                    <el-icon size="40px" color="#c0c4cc"><ChatDotRound /></el-icon>
                    <p>你好，我是鳜鱼养殖 AI 助手。可以问我水质管理、病害防治、投喂等问题。</p>
                </div>

                <!-- 消息气泡 -->
                <div v-for="(msg, index) in messages" :key="index" class="message-row"
                    :class="msg.role === 'user' ? 'row-user' : 'row-assistant'">
                    <div class="bubble" :class="msg.role === 'user' ? 'bubble-user' : 'bubble-assistant'">
                        <!-- 用户消息纯文本 -->
                        <div v-if="msg.role === 'user'" class="msg-text">{{ msg.content }}</div>

                        <!-- AI 回复：Markdown 正文 + 参考来源 -->
                        <template v-else>
                            <MarkdownContent
                                class="msg-reply"
                                :content="msg.content"
                                :streaming="msg.streaming"
                            />

                            <!-- 回答依据 -->
                            <el-collapse v-if="msg.sources && msg.sources.length > 0" class="source-collapse">
                                <el-collapse-item :name="index">
                                    <template #title>
                                        <span class="source-title">
                                            <el-icon size="14px"><Document /></el-icon>
                                            回答依据（{{ msg.sources.length }}）
                                        </span>
                                    </template>
                                    <p class="source-hint">
                                        以下为系统检索到的养殖知识片段，回答由模型结合这些资料生成；编号与回答中的 [来源N] 对应。
                                    </p>
                                    <div v-for="(src, sIdx) in msg.sources" :key="sIdx" class="source-item">
                                        <div class="source-summary">
                                            <div class="source-path">
                                                <span class="source-index">来源 {{ sIdx + 1 }}</span>
                                                <el-tag size="small" type="info">{{ categoryLabel(src) }}</el-tag>
                                                <span class="source-name">{{ knowledgeTitle(src) }}</span>
                                            </div>
                                            <el-button
                                                v-if="src.content"
                                                link
                                                type="primary"
                                                size="small"
                                                @click="toggleSourceContent(msg, sIdx)"
                                            >
                                                {{ src._open ? '收起原文' : '查看原文' }}
                                            </el-button>
                                        </div>

                                        <div v-if="src.content && src._open" class="source-content">
                                            <div class="source-content-title">{{ knowledgeTitle(src) }}</div>
                                            <pre class="source-content-text">{{ src.content }}</pre>
                                        </div>

                                    </div>
                                </el-collapse-item>
                            </el-collapse>

                            <!-- 加载中提示 -->
                            <div v-if="msg.loading" class="typing-tip">
                                <el-icon class="is-loading"><Loading /></el-icon>
                                <span>正在检索知识库并生成回答...</span>
                            </div>
                        </template>
                    </div>
                </div>
            </div>

            <!-- 输入区 -->
            <div class="input-area">
                <el-input
                    v-model="inputText"
                    type="textarea"
                    :rows="2"
                    resize="none"
                    placeholder="请输入养殖相关问题，例如：溶解氧偏低怎么办？"
                    @keydown.enter.prevent="handleSend"
                />
                <div class="input-actions">
                    <el-button v-if="sending" plain @click="stopGeneration">
                        停止生成
                    </el-button>
                    <el-button
                        type="primary"
                        :loading="sending"
                        :disabled="!inputText.trim()"
                        @click="handleSend"
                    >
                        发送
                    </el-button>
                </div>
            </div>
        </div>

        <!-- 右栏：历史会话 + 快捷问题 + 功能说明 -->
        <div class="card-wrapper side-panel">
            <div class="card-header-row">
                <span class="card-title">历史会话</span>
                <el-button size="small" type="primary" text :disabled="sending" @click="handleNewSession">
                    新建会话
                </el-button>
            </div>
            <div v-if="sessions.length === 0" class="session-empty">暂无历史会话</div>
            <div v-else class="session-list">
                <div
                    v-for="s in sessions"
                    :key="s.session_id"
                    class="session-item"
                    :class="{ 'is-active': s.session_id === currentSessionId }"
                    @click="switchSession(s.session_id)"
                >
                    <span class="session-title" :title="s.title || '新会话'">
                        {{ s.title || '新会话' }}
                    </span>
                    <el-button class="session-del" text size="small" @click.stop="handleDeleteSession(s)">
                        <el-icon><Delete /></el-icon>
                    </el-button>
                </div>
            </div>

            <div class="card-header-row" style="margin-top: 24px;">
                <span class="card-title">快捷提问</span>
            </div>
            <div class="quick-list">
                <el-button
                    v-for="q in quickQuestions"
                    :key="q"
                    class="quick-btn"
                    text
                    :disabled="sending"
                    @click="askQuick(q)"
                >
                    {{ q }}
                </el-button>
            </div>

            <div class="card-header-row" style="margin-top: 24px;">
                <span class="card-title">功能说明</span>
            </div>
            <div class="feature-desc">
                <p>本助手会先从本地养殖知识库（水质管理、病害防治、养殖技术）检索相关资料，再结合这些资料生成回答。</p>
                <p class="gray-tip">每条回答下方可展开查看回答依据与资料原文。</p>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ChatDotRound, Document, Loading, Delete } from '@element-plus/icons-vue'
import MarkdownContent from '@/components/MarkdownContent.vue'
import {
    chatAgent, chatAgentStream, getChatSessionId, setChatSessionId,
    createChatSession, fetchChatSessions, fetchChatMessages, deleteChatSession
} from '@/services/api'

// 知识资料中文展示名，取自 knowledge/ 下各文档的一级标题
const KNOWLEDGE_TITLES = {
    'water_quality/parameters.md': '水质参数详解',
    'water_quality/regulation.md': '水质调控方法',
    'water_quality/emergency.md': '水质突变应急处理',
    'diseases/bacterial.md': '细菌性疾病',
    'diseases/fungal_viral.md': '真菌病与病毒病',
    'diseases/parasitic.md': '寄生虫病',
    'breeding/fry.md': '苗种培育',
    'breeding/adult.md': '成鱼养殖',
    'breeding/feeding.md': '饲料与投喂',
    'breeding/daily_mgmt.md': '日常管理'
}

const CATEGORY_LABELS = {
    water_quality: '水质管理',
    diseases: '病害防治',
    breeding: '养殖技术',
    general: '综合资料'
}

// 消息列表：{ role: 'user' | 'assistant', content, sources, loading, streaming }
const messages = ref([])

/** 规范化来源：兼容没有原文的旧会话，并挂上前端展开状态 */
function normalizeSources(list) {
    return (Array.isArray(list) ? list : []).map(item => ({
        ...item,
        content: typeof item.content === 'string' ? item.content : '',
        _open: false
    }))
}

function toggleSourceContent(msg, index) {
    const src = msg?.sources?.[index]
    if (src) src._open = !src._open
}

function knowledgeTitle(src) {
    return KNOWLEDGE_TITLES[src?.source] || src?.title || '养殖知识资料'
}

function categoryLabel(src) {
    return CATEGORY_LABELS[src?.category] || '养殖知识'
}

const inputText = ref('')
const sending = ref(false)
const messageList = ref(null)
const sessions = ref([])
const currentSessionId = ref('')

// 流式空闲超时：超过该时长没有新分块则自动停止，比整体超时更适合长回答
const STREAM_IDLE_TIMEOUT = 90000
// 降级到一次性接口时的打字机节奏
const TYPE_CHARS_PER_TICK = 6
const TYPE_TICK_MS = 16

let activeController = null
let idleTimer = null
let stopRequested = false

const quickQuestions = [
    '溶解氧偏低怎么办？',
    '烂鳃病怎么治疗？',
    '氨氮超标如何处理？',
    '鳜鱼适宜的水温是多少？',
    '如何预防水霉病？'
]

// ---------- 会话管理 ----------

/** 加载当前用户的会话列表 */
async function loadSessions() {
    const result = await fetchChatSessions()
    sessions.value = result.data || []
}

/** 回放会话消息：刷新页面后界面与后端上下文保持一致 */
async function restoreMessages(sessionId) {
    const result = await fetchChatMessages(sessionId)
    messages.value = (result.data || []).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content || '',
        sources: normalizeSources(m.sources),
        loading: false,
        streaming: false
    }))
    autoScroll(true)
}

/** 新建会话：ID 由服务端生成，同时切换本地当前会话 */
async function handleNewSession() {
    if (sending.value) return
    const result = await createChatSession()
    if (!result.success) {
        ElMessage.error('新建会话失败，请稍后重试')
        return
    }
    activeController?.abort()
    currentSessionId.value = result.sessionId
    messages.value = []
    inputText.value = ''
    await loadSessions()
}

/** 切换会话 */
async function switchSession(sessionId) {
    if (sending.value || !sessionId || sessionId === currentSessionId.value) return
    setChatSessionId(sessionId)
    currentSessionId.value = sessionId
    await restoreMessages(sessionId)
}

/** 删除会话；若删的是当前会话则自动开一个新会话 */
async function handleDeleteSession(item) {
    if (sending.value) return
    try {
        await ElMessageBox.confirm('删除后该会话的所有消息将无法恢复，是否继续？', '删除会话', {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消'
        })
    } catch {
        return
    }
    const result = await deleteChatSession(item.session_id)
    if (!result.success) {
        ElMessage.error('删除会话失败')
        return
    }
    if (item.session_id === currentSessionId.value) await handleNewSession()
    else await loadSessions()
}

function clearIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
}

function resetIdleTimer(controller) {
    clearIdleTimer()
    idleTimer = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT)
}

/** 仅在用户没有向上翻阅时自动跟随底部，避免流式输出打断阅读 */
function autoScroll(force = false) {
    nextTick(() => {
        const el = messageList.value
        if (!el) return
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
        if (force || nearBottom) el.scrollTop = el.scrollHeight
    })
}

/** 一次性接口的打字机降级：把完整回复逐段追加，保持流式观感 */
async function typewriter(msg, text, controller) {
    msg.streaming = true
    for (let i = 0; i < text.length; i += TYPE_CHARS_PER_TICK) {
        if (controller.signal.aborted) break
        msg.content += text.slice(i, i + TYPE_CHARS_PER_TICK)
        await new Promise(resolve => setTimeout(resolve, TYPE_TICK_MS))
        autoScroll()
    }
    msg.streaming = false
}

/**
 * 发送消息：优先走 SSE 流式接口，逐块渲染 Markdown 正文
 * 流式不可用时（旧版后端 / 网络异常）降级为一次性接口 + 打字机效果
 */
async function handleSend() {
    const text = inputText.value.trim()
    if (!text || sending.value) return

    messages.value.push({
        role: 'user', content: text, sources: [], loading: false, streaming: false
    })
    inputText.value = ''

    // reactive 包装：流式过程中直接修改该对象即可触发视图更新
    const assistantMsg = reactive({
        role: 'assistant', content: '', sources: [], loading: true, streaming: false
    })
    messages.value.push(assistantMsg)
    sending.value = true
    stopRequested = false
    autoScroll(true)

    const controller = new AbortController()
    activeController = controller
    resetIdleTimer(controller)

    let receivedAny = false
    let streamError = ''
    let streamFailure = null
    let streamResult = null

    function appendDelta(chunk) {
        receivedAny = true
        assistantMsg.loading = false
        assistantMsg.streaming = true
        assistantMsg.content += chunk
        resetIdleTimer(controller)
        autoScroll()
    }

    try {
        streamResult = await chatAgentStream(text, getChatSessionId(), {
            signal: controller.signal,
            onMeta: sources => {
                assistantMsg.sources = normalizeSources(sources)
                resetIdleTimer(controller)
            },
            onDelta: appendDelta,
            onError: message => { streamError = message },
            onDone: clearIdleTimer
        })
    } catch (err) {
        streamFailure = err
        console.warn('[流式问答不可用]:', err.message)
    }

    const streamDone = Boolean(streamResult?.success)
    const authFailed = Boolean(streamFailure?.message?.includes('登录'))
    // 流已正常结束、已收到正文或已被中止时都不再重发请求，避免重复回答
    const canFallback = !streamDone && !controller.signal.aborted &&
        !receivedAny && !streamError && !authFailed

    if (canFallback) {
        const result = await chatAgent(text, getChatSessionId())
        assistantMsg.sources = normalizeSources(result.sources)
        assistantMsg.loading = false
        await typewriter(assistantMsg, result.reply || '', controller)
    } else if (streamError) {
        assistantMsg.content += `\n\n> ${streamError}`
    } else if (authFailed) {
        assistantMsg.content = '登录已过期，请重新登录。'
    } else if (streamDone && !assistantMsg.content) {
        assistantMsg.content = '本次未生成内容，请重新提问。'
    } else if (controller.signal.aborted && !stopRequested) {
        assistantMsg.content += '\n\n> 生成超时，已停止。'
    } else if (streamFailure && receivedAny && !controller.signal.aborted) {
        assistantMsg.content += '\n\n> 连接中断，以上为已生成的内容。'
    }

    assistantMsg.loading = false
    assistantMsg.streaming = false
    sending.value = false
    activeController = null
    clearIdleTimer()
    autoScroll(true)
    // 新会话首次回答后才会落库，刷新列表以显示标题与消息数
    loadSessions()
}

/** 用户主动停止生成：保留已有内容 */
function stopGeneration() {
    stopRequested = true
    activeController?.abort()
}

/**
 * 快捷问题直接发送
 */
function askQuick(question) {
    inputText.value = question
    handleSend()
}

onMounted(async () => {
    currentSessionId.value = getChatSessionId()
    // 刷新后从后端回放消息，界面不再空、上下文也不再静默续接
    await Promise.all([
        loadSessions(),
        restoreMessages(currentSessionId.value)
    ])
})

onBeforeUnmount(() => {
    clearIdleTimer()
    activeController?.abort()
})
</script>

<style scoped>
.agent-chat-page {
    display: flex;
    gap: 20px;
    padding: 20px;
    max-width: 1400px;
    margin: 0 auto;
    min-height: 70vh;
}

.chat-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
}

.side-panel {
    width: 320px;
    flex-shrink: 0;
    padding: 20px;
}

.card-wrapper {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.card-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
}

/* 消息列表 */
.message-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px 4px;
    min-height: 400px;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.welcome-tip {
    text-align: center;
    color: #909399;
    padding: 60px 20px;
}
.welcome-tip p {
    margin-top: 12px;
    font-size: 14px;
}

.message-row {
    display: flex;
}
.row-user {
    justify-content: flex-end;
}
.row-assistant {
    justify-content: flex-start;
}

.bubble {
    max-width: 78%;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
}
.bubble-user {
    background: #409EFF;
    color: #fff;
    border-bottom-right-radius: 4px;
}
.bubble-assistant {
    background: #f4f6f8;
    color: #303133;
    border-bottom-left-radius: 4px;
}

/* Markdown 正文由块级标签控制换行，不再沿用气泡的 pre-wrap */
.msg-reply {
    white-space: normal;
}

/* 回答依据 */
.source-collapse {
    margin-top: 8px;
    border: none;
    background: transparent;
    --el-collapse-border-color: transparent;
    --el-collapse-header-bg-color: transparent;
    --el-collapse-content-bg-color: transparent;
}
.source-title {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #909399;
}
.source-hint {
    margin: 0 0 8px;
    font-size: 12px;
    color: #a8abb2;
    line-height: 1.6;
}
.source-item {
    padding: 6px 0;
    border-bottom: 1px dashed #e4e7ed;
    font-size: 12px;
}
.source-item:last-child {
    border-bottom: none;
}
.source-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.source-path {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex-wrap: wrap;
}
.source-index {
    color: #909399;
    flex-shrink: 0;
}
.source-name {
    color: #606266;
    word-break: break-all;
}
.source-content {
    margin-top: 6px;
    padding: 8px 10px;
    background: #f7f9fb;
    border-left: 3px solid #d9ecff;
    border-radius: 4px;
}
.source-content-title {
    margin-bottom: 4px;
    font-weight: 600;
    color: #303133;
}
.source-content-text {
    margin: 0;
    max-height: 220px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.7;
    color: #606266;
}

/* 输入区 */
.input-area {
    margin-top: 16px;
    border-top: 1px solid #e4e7ed;
    padding-top: 16px;
}
.input-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
}

/* 加载动画 */
.typing-tip {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    font-size: 12px;
    color: #909399;
}

/* 历史会话 */
.session-empty {
    font-size: 12px;
    color: #909399;
    padding: 8px 4px;
}
.session-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 220px;
    overflow-y: auto;
}
.session-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: #606266;
}
.session-item:hover {
    background: #ecf5ff;
}
.session-item.is-active {
    background: #409EFF;
    color: #fff;
}
.session-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.session-del {
    margin-left: 4px;
    padding: 2px;
    color: inherit;
}

/* 快捷问题 */
.quick-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.quick-btn {
    justify-content: flex-start;
    color: #409EFF;
    white-space: normal;
    text-align: left;
    height: auto;
    padding: 8px 12px;
    border-radius: 6px;
}
.quick-btn:hover {
    background: #ecf5ff;
}

.feature-desc {
    font-size: 13px;
    color: #606266;
    line-height: 1.7;
}
.feature-desc p {
    margin-top: 8px;
}
</style>