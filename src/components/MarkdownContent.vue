<template>
    <div class="markdown-body" :class="{ 'is-streaming': streaming }" v-html="html" @click="handleLinkClick"></div>
</template>

<script setup>
/**
 * Agent 回复的 Markdown 渲染
 * - 先由 marked 解析，再经 DOMPurify 消毒，避免模型输出中的 HTML/脚本造成 XSS
 * - 流式输出时按帧节流重渲染，避免高频 delta 反复解析整篇文本
 */
import { ref, watch, onBeforeUnmount } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps({
    content: { type: String, default: '' },
    streaming: { type: Boolean, default: false }
})

marked.setOptions({ gfm: true, breaks: true })

function render(text) {
    return DOMPurify.sanitize(marked.parse(text || ''), {
        FORBID_TAGS: ['style', 'form', 'input', 'iframe', 'object', 'embed'],
        FORBID_ATTR: ['style']
    })
}

// 外链统一新窗口打开；href 已由 DOMPurify 过滤掉 javascript: 等危险协议
function handleLinkClick(event) {
    const link = event.target?.closest?.('a')
    if (!link || !link.href) return
    event.preventDefault()
    window.open(link.href, '_blank', 'noopener,noreferrer')
}

const html = ref(render(props.content))
let frameId = 0

watch(
    () => [props.content, props.streaming],
    () => {
        // 生成结束（或降级打字结束）时立即同步渲染，保证最终内容不丢帧
        if (!props.streaming) {
            if (frameId) cancelAnimationFrame(frameId)
            frameId = 0
            html.value = render(props.content)
            return
        }
        if (frameId) return
        frameId = requestAnimationFrame(() => {
            frameId = 0
            html.value = render(props.content)
        })
    }
)

onBeforeUnmount(() => {
    if (frameId) cancelAnimationFrame(frameId)
})
</script>

<style scoped>
.markdown-body {
    font-size: 14px;
    line-height: 1.75;
    /* 覆盖气泡继承的 pre-wrap，换行交给 Markdown 块级标签处理 */
    white-space: normal;
    word-break: break-word;
    color: #303133;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(blockquote),
.markdown-body :deep(pre),
.markdown-body :deep(table),
.markdown-body :deep(hr) {
    margin: 0 0 10px;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
    margin: 14px 0 8px;
    font-weight: 600;
    line-height: 1.4;
}
.markdown-body :deep(h1) { font-size: 1.35em; }
.markdown-body :deep(h2) { font-size: 1.2em; }
.markdown-body :deep(h3) { font-size: 1.08em; }
.markdown-body :deep(h4) { font-size: 1em; }

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
    padding-left: 22px;
}
.markdown-body :deep(li) {
    margin: 3px 0;
}
.markdown-body :deep(strong) {
    font-weight: 600;
    color: #1f2d3d;
}

.markdown-body :deep(a) {
    color: #409EFF;
    text-decoration: none;
}
.markdown-body :deep(a:hover) {
    text-decoration: underline;
}

.markdown-body :deep(code) {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 0.9em;
    background: rgba(64, 158, 255, 0.1);
    padding: 2px 5px;
    border-radius: 4px;
}
.markdown-body :deep(pre) {
    background: #2d3139;
    color: #e6e9ef;
    padding: 12px 14px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 12.5px;
    line-height: 1.6;
}
.markdown-body :deep(pre code) {
    background: transparent;
    color: inherit;
    padding: 0;
    font-size: inherit;
}

.markdown-body :deep(blockquote) {
    border-left: 3px solid #409EFF;
    background: rgba(64, 158, 255, 0.06);
    padding: 4px 12px;
    color: #606266;
}
.markdown-body :deep(hr) {
    border: none;
    border-top: 1px solid #dcdfe6;
}

.markdown-body :deep(table) {
    display: block;
    width: 100%;
    border-collapse: collapse;
    overflow-x: auto;
    font-size: 13px;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
    border: 1px solid #dcdfe6;
    padding: 6px 10px;
    text-align: left;
}
.markdown-body :deep(th) {
    background: #eef2f7;
    font-weight: 600;
}

.markdown-body :deep(img) {
    max-width: 100%;
    border-radius: 6px;
}

/* 流式生成时的闪烁光标 */
.markdown-body.is-streaming::after {
    content: '';
    display: inline-block;
    width: 2px;
    height: 1em;
    margin-left: 2px;
    vertical-align: -0.15em;
    background: #409EFF;
    animation: md-cursor-blink 1s step-end infinite;
}
@keyframes md-cursor-blink {
    50% { opacity: 0; }
}
</style>
