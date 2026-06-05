// ==UserScript==
// @name         TorrentKitty to MissAV & JavDB with Cover + Settings
// @namespace    http://tampermonkey.net/
// @version      4.3
// @description  TorrentKitty 增强：卡片化网格浏览流、无缝大图日志抽屉、自动补充排队加载 (Organic 配色版)
// @author       Gemini
// @match        *://www.torrentkitty.tv/*
// @match        *://torrentkitty.tv/*
// @match        *://www.torrentkitty.com/*
// @match        *://torrentkitty.com/*
// @match        *://www.torrentkitty.io/*
// @match        *://torrentkitty.io/*
// @match        *://www.torrentkitty.live/*
// @match        *://torrentkitty.live/*
// @match        *://www.torkitty.net/*
// @match        *://torkitty.net/*
// @match        *://www.torrentkitty.ink/*
// @match        *://torrentkitty.ink/*
// @match        *://www.torrentkitty.asia/*
// @match        *://torrentkitty.asia/*
// @match        *://www.torrentkitty.cam/*
// @match        *://torrentkitty.cam/*
// @match        *://www.torrentkitty.one/*
// @match        *://torrentkitty.one/*
// @match        *://www.torrentkitty.dev/*
// @match        *://torrentkitty.dev/*
// @updateURL    https://raw.githubusercontent.com/wangxiangg1/my-youhou-js/main/torrentkitty.user.js
// @downloadURL  https://raw.githubusercontent.com/wangxiangg1/my-youhou-js/main/torrentkitty.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      javdb.com
// @connect      jdbstatic.com
// @connect      torrentkitty.tv
// @connect      torrentkitty.com
// @connect      torrentkitty.io
// @connect      torrentkitty.live
// @connect      torkitty.net
// @connect      torrentkitty.ink
// @connect      torrentkitty.asia
// @connect      torrentkitty.cam
// @connect      torrentkitty.one
// @connect      torrentkitty.dev
// ==/UserScript==

(function () {
    'use strict';

    // ==================== GM_xmlhttpRequest Promise 封装 ====================
    function gmFetch(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                timeout: 15000,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'zh-CN,zh;q=0.9'
                },
                onload: (response) => resolve({
                    ok: response.status >= 200 && response.status < 300,
                    status: response.status,
                    statusText: response.statusText,
                    text: () => Promise.resolve(response.responseText)
                }),
                onerror: (error) => reject(new Error('网络请求失败')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    // ==================== 版本常量 ====================
    const VERSION = (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '4.3';

    // ==================== 配置常量 ====================
    const CONFIG = {
        defaults: {
            coverWidth: 280,
            coverHeight: 210,
            pageMaxWidth: 1200,
            maxPagesToFetch: 10
        },
        queue: {
            baseDelay: 1500,
            minRandomDelay: 500,
            maxRandomDelay: 1500,
            maxConcurrent: 1,
            maxRequestsPerMinute: 24,
            errorBackoff: 5000,
            maxBackoff: 60000
        },
        cache: {
            maxSize: 80
        },
        codeRegex: /\b(?!GB|MB|KB|MP|AES|UTF|ISO|SHA|MD5|CPU|GPU|USB|SSD|HDD|RAM|ROM|PDF|CSS|DNS|FTP|HTTP)([A-Z]{2,6}-?\d{3,5})\b|\b(n\d{4})\b/i,
        errorCacheExpiry: 5 * 60 * 1000,
        maxPagesToFetch: 10,
        storageKey: 'torrentkitty_settings'
    };

    // ==================== 现代化莫兰迪颜色主题 (Organic) ====================
    const COLORS = {
        primary: {
            bg: 'rgba(139, 157, 131, 0.15)', // sage 鼠尾草
            bgSolid: '#8B9D83',
            border: 'rgba(139, 157, 131, 0.3)',
            hover: 'rgba(139, 157, 131, 0.25)',
            shadow: 'rgba(0, 0, 0, 0.02)'
        },
        success: {
            bg: 'rgba(96, 108, 56, 0.12)', // moss 苔藓
            bgSolid: '#606C38',
            border: 'rgba(96, 108, 56, 0.25)',
            hover: 'rgba(96, 108, 56, 0.2)',
            shadow: 'rgba(0, 0, 0, 0.02)'
        },
        warning: {
            bg: 'rgba(192, 142, 58, 0.12)', // ochre 赭黄
            bgSolid: '#C08E3A',
            border: 'rgba(192, 142, 58, 0.25)',
            hover: 'rgba(192, 142, 58, 0.2)',
            shadow: 'rgba(0, 0, 0, 0.02)'
        },
        danger: {
            bg: 'rgba(155, 59, 42, 0.12)', // loss-red 泥土红
            bgSolid: '#9B3B2A',
            border: 'rgba(155, 59, 42, 0.25)',
            hover: 'rgba(155, 59, 42, 0.2)',
            shadow: 'rgba(0, 0, 0, 0.02)'
        },
        info: {
            bg: 'rgba(176, 139, 110, 0.12)', // clay 陶土
            bgSolid: '#B08B6E',
            border: 'rgba(176, 139, 110, 0.25)',
            hover: 'rgba(176, 139, 110, 0.2)',
            shadow: 'rgba(0, 0, 0, 0.02)'
        },
        pink: {
            bg: 'rgba(198, 107, 61, 0.12)', // terracotta 赭石
            bgSolid: '#C66B3D',
            border: 'rgba(198, 107, 61, 0.25)',
            hover: 'rgba(198, 107, 61, 0.2)',
            shadow: 'rgba(0, 0, 0, 0.02)'
        },
        neutral: {
            bg: 'rgba(61, 50, 38, 0.08)', // earth-dark 深棕
            bgSolid: '#3D3226',
            border: 'rgba(61, 50, 38, 0.15)',
            hover: 'rgba(61, 50, 38, 0.12)',
            shadow: 'rgba(0, 0, 0, 0.02)'
        },
        error: {
            bg: 'rgba(155, 59, 42, 0.08)',
            border: 'rgba(155, 59, 42, 0.2)',
            text: '#9B3B2A',
            backdrop: 'blur(8px)'
        },
        noResult: {
            bg: 'rgba(61, 50, 38, 0.06)',
            border: 'rgba(61, 50, 38, 0.15)',
            text: '#3D3226',
            backdrop: 'blur(8px)'
        },
        settingsGradient: 'linear-gradient(135deg, #E8DCC7 0%, #D4B895 100%)',
        glass: {
            bg: 'rgba(232, 220, 199, 0.75)',
            border: 'rgba(61, 50, 38, 0.08)',
            blur: 'backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);'
        },
        dark: {
            bg: '#E8DCC7',
            card: '#D4B895',
            border: 'rgba(61, 50, 38, 0.15)',
            text: '#2A2118',
            textMuted: '#3D3226'
        }
    };

    // ==================== 样式工具函数 ====================
    const StyleUtils = {
        buttonBase(color, options = {}) {
            const {
                padding = '8px 16px',
                fontSize = '12px',
                margin = '0',
                display = 'inline-flex'
            } = options;

            return `
                display: ${display};
                align-items: center;
                justify-content: center;
                padding: ${padding};
                background: ${color.bg};
                color: ${color.bgSolid};
                border-radius: 8px;
                text-decoration: none;
                font-size: ${fontSize};
                font-weight: 600;
                font-family: 'Epilogue', sans-serif;
                border: 1px solid ${color.border};
                cursor: pointer;
                margin: ${margin};
                transition: all 0.2s ease;
            `;
        },

        overlay() {
            return `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(61, 50, 38, 0.3);
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
                z-index: 99999;
                display: flex;
                justify-content: center;
                align-items: center;
                animation: fadeIn 0.2s ease-out;
            `;
        },

        modal(options = {}) {
            const {
                maxWidth = '500px',
                padding = '24px',
                maxHeight = '80vh'
            } = options;

            return `
                background: #e0d3be;
                border: 1px solid rgba(61, 50, 38, 0.15);
                padding: ${padding};
                border-radius: 16px;
                box-shadow: 0 20px 40px rgba(61, 50, 38, 0.15);
                max-width: ${maxWidth};
                width: 90%;
                max-height: ${maxHeight};
                overflow-y: auto;
                animation: slideIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            `;
        },

        infoBox(color, maxWidth) {
            return `
                padding: 12px 16px;
                background: ${color.bg};
                border: 1px solid ${color.border};
                border-radius: 10px;
                color: ${color.text || color.bgSolid};
                font-size: 13px;
                font-weight: 500;
                font-family: 'Epilogue', sans-serif;
                margin-top: 8px;
                max-width: ${maxWidth}px;
            `;
        },

        coverImage(width, height) {
            return `
                max-width: ${width}px;
                max-height: ${height}px;
                border-radius: 10px;
                object-fit: cover;
            `;
        },

        injectGlobalStyles() {
            if (document.getElementById('tk-enhanced-styles')) return;

            const fontLink = document.createElement('link');
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.loli.net/css2?family=Epilogue:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;700&family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&display=swap';
            document.head.appendChild(fontLink);

            const style = document.createElement('style');
            style.id = 'tk-enhanced-styles';
            style.textContent = `
                :root {
                    --tk-sage: #8B9D83;           /* 鼠尾草 — 主色 */
                    --tk-clay: #B08B6E;           /* 陶土 — 辅色 */
                    --tk-terracotta: #C66B3D;     /* 赭石 — 强调色 */
                    --tk-ochre: #C08E3A;          /* 赭黄 — 警告 */
                    --tk-moss: #606C38;           /* 苔藓 — 盈利 */
                    --tk-sand: #E8DCC7;           /* 沙色 — 浅色背景 */
                    --tk-oat: #D4B895;            /* 燕麦 — 卡片背景 */
                    --tk-earth-dark: #3D3226;     /* 深棕 — 文字 */
                    --tk-earth-darker: #2A2118;   /* 更深棕 — 标题 */
                    --tk-loss-red: #9B3B2A;       /* 泥土红 */

                    /* === 表面 === */
                    --tk-bg: var(--tk-sand);
                    --tk-card-bg: var(--tk-oat);
                    --tk-card-border: rgba(61, 50, 38, 0.15);
                    --tk-text-main: var(--tk-earth-darker);
                    --tk-text-muted: var(--tk-earth-dark);
                    --tk-primary: var(--tk-sage);
                    --tk-accent-pink: var(--tk-terracotta);
                    --tk-accent-cyan: var(--tk-moss);
                    --tk-success: var(--tk-moss);

                    --tk-font-display: 'Fraunces', serif;
                    --tk-font-body: 'Epilogue', sans-serif;
                    --tk-font-mono: 'IBM Plex Mono', monospace;
                    --tk-page-max-width: 1200px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(16px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                @keyframes tk-shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }

                /* 强行覆盖原网页背景与质感，清除原有容器的残留绿色背景 */
                body, html, #main, .wrapper, header, footer, #header, #footer, .becbdbcf, .reco-container, #overlay, #note {
                    background-color: var(--tk-bg) !important;
                    background-image: none !important;
                    background: var(--tk-bg) !important;
                }

                /* 放宽原生 .wrapper 的最大宽度限制 */
                .wrapper {
                    width: 95% !important;
                    max-width: var(--tk-page-max-width, 1200px) !important;
                    margin: 0 auto !important;
                }

                /* 隐藏原网页表格与分页器 */
                table#archiveResult, table.results, .search-results table,
                .pagination, .pages {
                    display: none !important;
                }

                /* 整体容器 */
                .tk-main-container {
                    font-family: var(--tk-font-body);
                    color: var(--tk-text-main);
                    padding: 24px;
                    background: var(--tk-bg);
                    border-radius: 24px;
                    box-shadow: 0 10px 30px rgba(61, 50, 38, 0.06);
                    border: 1px solid var(--tk-card-border);
                }

                /* 网格布局 */
                .tk-grid-wrapper {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(var(--tk-card-width, 280px), 1fr));
                    gap: 24px;
                    padding: 16px 0;
                }

                /* 媒体卡片 */
                .tk-media-card {
                    background: var(--tk-card-bg);
                    border: 1px solid var(--tk-card-border);
                    border-radius: 20px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                    box-shadow: 0 4px 16px rgba(61, 50, 38, 0.05);
                    position: relative;
                    cursor: pointer;
                }

                .tk-media-card:hover {
                    transform: translateY(-6px);
                    border-color: var(--tk-sage);
                    box-shadow: 0 16px 32px rgba(61, 50, 38, 0.12);
                }

                /* 封面图容器与骨架屏 */
                .tk-card-cover-wrapper {
                    position: relative;
                    width: 100%;
                    background: #e0d3be;
                    overflow: hidden;
                    aspect-ratio: 4 / 3;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    border-bottom: 1px solid var(--tk-card-border);
                }

                .tk-skeleton {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: linear-gradient(90deg, #e0d3be 25%, #ebdcb7 50%, #e0d3be 75%);
                    background-size: 200% 100%;
                    animation: tk-shimmer 1.5s infinite;
                    z-index: 1;
                }

                .tk-cover-img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    opacity: 0;
                    transition: opacity 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.5s ease;
                }

                .tk-cover-img.loaded {
                    opacity: 1;
                }

                .tk-media-card:hover .tk-cover-img.loaded {
                    transform: scale(1.04);
                }

                /* 封面代理异常遮罩 */
                .tk-cover-fallback {
                    position: absolute;
                    bottom: 0; left: 0; right: 0;
                    background: var(--tk-loss-red);
                    color: #fff;
                    text-align: center;
                    padding: 6px;
                    font-size: 10px;
                    font-weight: 600;
                    font-family: var(--tk-font-mono);
                }

                /* 卡片内容区 */
                .tk-card-content {
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    flex-grow: 1;
                    gap: 10px;
                }

                .tk-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .tk-card-code {
                    font-family: var(--tk-font-mono);
                    font-weight: 700;
                    font-size: 13px;
                    color: var(--tk-earth-darker);
                    background: rgba(61, 50, 38, 0.08);
                    padding: 2px 8px;
                    border-radius: 6px;
                    border: 1px solid var(--tk-card-border);
                }

                .tk-card-meta {
                    font-size: 11px;
                    color: var(--tk-earth-dark);
                    font-family: var(--tk-font-mono);
                }

                .tk-card-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--tk-earth-darker);
                    line-height: 1.5;
                    height: 38px;
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    text-overflow: ellipsis;
                }

                /* 卡片操作按钮 */
                .tk-card-actions {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 8px;
                    margin-top: auto;
                    padding-top: 4px;
                }

                .tk-btn-modern {
                    padding: 8px 4px;
                    font-size: 11px;
                    font-weight: 700;
                    border-radius: 8px;
                    text-align: center;
                    cursor: pointer;
                    text-decoration: none;
                    transition: all 0.2s ease;
                    border: 1px solid transparent;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                }

                .tk-btn-download {
                    background: rgba(176, 139, 110, 0.15); /* clay 辅色 */
                    color: var(--tk-earth-dark);
                    border-color: rgba(176, 139, 110, 0.3);
                }
                .tk-btn-download:hover {
                    background: var(--tk-clay);
                    color: #fff;
                }

                .tk-btn-missav {
                    background: rgba(198, 107, 61, 0.12); /* terracotta 赭石 */
                    color: var(--tk-loss-red);
                    border-color: rgba(198, 107, 61, 0.25);
                }
                .tk-btn-missav:hover {
                    background: var(--tk-terracotta);
                    color: #fff;
                }

                .tk-btn-javdb {
                    background: rgba(139, 157, 131, 0.15); /* sage 鼠尾草 */
                    color: var(--tk-moss);
                    border-color: rgba(139, 157, 131, 0.3);
                }
                .tk-btn-javdb:hover:not(.disabled) {
                    background: var(--tk-sage);
                    color: #fff;
                }
                .tk-btn-javdb.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                /* 顶部控制栏 */
                .tk-modern-toolbar {
                    background: var(--tk-card-bg);
                    border: 1px solid var(--tk-card-border);
                    border-radius: 20px;
                    padding: 16px 24px;
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    justify-content: space-between;
                    gap: 20px;
                    margin-bottom: 24px;
                    box-shadow: 0 4px 16px rgba(61, 50, 38, 0.05);
                }

                .tk-toolbar-left {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .tk-logo-text {
                    font-family: var(--tk-font-display);
                    font-size: 20px;
                    font-weight: 800;
                    color: var(--tk-earth-darker);
                    letter-spacing: 0.2px;
                }

                .tk-count-badge {
                    background: rgba(96, 108, 56, 0.12);
                    color: var(--tk-moss);
                    font-family: var(--tk-font-mono);
                    font-weight: 600;
                    font-size: 11px;
                    padding: 2px 8px;
                    border-radius: 9999px;
                }

                .tk-toolbar-center {
                    flex-grow: 1;
                    max-width: 520px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                /* 排除词展示区 */
                .tk-exclusion-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }

                .tk-tag {
                    background: rgba(155, 59, 42, 0.08);
                    border: 1px solid rgba(155, 59, 42, 0.2);
                    color: var(--tk-loss-red);
                    padding: 3px 8px;
                    border-radius: 6px;
                    font-size: 11px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-weight: 600;
                }

                .tk-tag-del {
                    cursor: pointer;
                    color: var(--tk-loss-red);
                    font-weight: bold;
                }
                .tk-tag-del:hover {
                    color: #000;
                }

                .tk-toolbar-right {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .tk-toolbar-btn {
                    background: rgba(255,255,255,0.4);
                    border: 1px solid var(--tk-card-border);
                    color: var(--tk-text-main);
                    padding: 8px 16px;
                    border-radius: 10px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .tk-toolbar-btn:hover {
                    background: rgba(255,255,255,0.7);
                    border-color: rgba(61, 50, 38, 0.3);
                }

                /* 现代化输入框 */
                .tk-input-modern {
                    background: #f0e6d3; /* 浅沙 */
                    border: 1px solid var(--tk-card-border);
                    color: var(--tk-text-main);
                    border-radius: 8px;
                    padding: 8px 12px;
                    font-size: 13px;
                    outline: none;
                    transition: all 0.2s;
                }

                .tk-input-modern:focus {
                    border-color: var(--tk-clay);
                    background: #fff;
                    box-shadow: 0 0 0 3px rgba(176, 139, 110, 0.15);
                }

                /* 右侧抽屉 */
                .tk-drawer-overlay {
                    position: fixed;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(61, 50, 38, 0.3);
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                    z-index: 99998;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.3s ease;
                }

                .tk-drawer-overlay.active {
                    opacity: 1;
                    pointer-events: auto;
                }

                .tk-detail-drawer {
                    position: fixed;
                    top: 0; right: -420px; width: 380px; height: 100%;
                    background: #e0d3be;
                    border-left: 1px solid var(--tk-card-border);
                    z-index: 99999;
                    box-shadow: -15px 0 40px rgba(61, 50, 38, 0.15);
                    transition: right 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                    padding: 30px 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                    box-sizing: border-box;
                }

                .tk-detail-drawer.active {
                    right: 0;
                }

                .tk-drawer-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid var(--tk-card-border);
                    padding-bottom: 16px;
                }

                .tk-drawer-close {
                    cursor: pointer;
                    font-size: 20px;
                    color: var(--tk-text-muted);
                    transition: color 0.2s;
                }

                .tk-drawer-close:hover {
                    color: var(--tk-earth-darker);
                }

                .tk-drawer-section {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .tk-drawer-label {
                    font-size: 11px;
                    color: var(--tk-text-muted);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    font-weight: 700;
                }

                .tk-drawer-value {
                    font-size: 13px;
                    color: var(--tk-text-main);
                    background: rgba(255,255,255,0.4);
                    padding: 10px 14px;
                    border-radius: 8px;
                    border: 1px solid rgba(61, 50, 38, 0.08);
                    word-break: break-all;
                }

                .tk-drawer-value-code {
                    font-family: var(--tk-font-mono);
                    color: var(--tk-loss-red);
                    font-size: 14px;
                    font-weight: 700;
                }

                .tk-drawer-btn {
                    background: rgba(139, 157, 131, 0.15);
                    color: var(--tk-moss);
                    border: 1px solid rgba(139, 157, 131, 0.3);
                    padding: 10px 16px;
                    border-radius: 8px;
                    font-weight: 700;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: center;
                }

                .tk-drawer-btn:hover {
                    background: var(--tk-sage);
                    color: #fff;
                }

                /* 设置滑动条样式 */
                .tk-slider {
                    -webkit-appearance: none;
                    width: 100%;
                    height: 4px;
                    border-radius: 2px;
                    background: rgba(61, 50, 38, 0.1);
                    outline: none;
                    cursor: pointer;
                    position: relative;
                }

                .tk-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: var(--tk-clay);
                    cursor: pointer;
                    transition: transform 0.1s;
                }

                .tk-slider::-webkit-slider-thumb:hover {
                    transform: scale(1.2);
                }

                .tk-page-marker-modern {
                    background: rgba(139, 157, 131, 0.06);
                    border: 1px dashed rgba(139, 157, 131, 0.3);
                    color: var(--tk-earth-dark);
                    text-align: center;
                    padding: 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                    margin: 16px 0;
                    grid-column: 1 / -1;
                    font-family: var(--tk-font-mono);
                }
            `;
            document.head.appendChild(style);
        }
    };

    // ==================== 状态管理 ====================
    const state = {
        javdbCache: {},
        cacheOrder: [],
        requestQueue: [],
        isProcessing: false,
        isFetchingPage: false,
        settings: { ...CONFIG.defaults },
        excludeKeywords: typeof GM_getValue === 'function' ? GM_getValue('tk_exclude_keywords', []) : [],
        observer: null,
        loadHandler: null,
        currentPageNum: 1,
        fetchPageNum: 1,
        targetValidCount: 8,
        consecutiveEmptyPages: 0,
        bannerTimeout: null,
        requestTimestamps: [],
        currentBackoff: 0,
        consecutiveErrors: 0
    };

    // ==================== 设置管理 ====================
    const SettingsManager = {
        load() {
            const saved = GM_getValue(CONFIG.storageKey, null);
            if (saved) {
                try {
                    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                    state.settings = { ...CONFIG.defaults, ...parsed };
                } catch (e) {
                    console.error('[TorrentKitty] 加载设置失败:', e);
                }
            }
        },

        save() {
            GM_setValue(CONFIG.storageKey, state.settings);
        },

        reset() {
            state.settings = { ...CONFIG.defaults };
            this.save();
        }
    };

    // ==================== 缓存管理器 ====================
    const CacheManager = {
        STORAGE_KEY: 'tk_javdb_cache',
        ORDER_KEY: 'tk_cache_order',
        EXPIRY_TIME: 24 * 60 * 60 * 1000,

        init() {
            try {
                const orderData = GM_getValue(this.ORDER_KEY, null);
                if (orderData) {
                    const parsed = typeof orderData === 'string' ? JSON.parse(orderData) : orderData;
                    const now = Date.now();
                    state.cacheOrder = parsed.filter(item => {
                        if (now - item.timestamp < this.EXPIRY_TIME) {
                            return true;
                        }
                        GM_deleteValue(this.STORAGE_KEY + '_' + item.code);
                        return false;
                    });
                } else {
                    state.cacheOrder = [];
                }

                state.cacheOrder.forEach(item => {
                    const cached = GM_getValue(this.STORAGE_KEY + '_' + item.code, null);
                    if (cached) {
                        try {
                            const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
                            state.javdbCache[item.code] = data;
                        } catch (e) {
                            GM_deleteValue(this.STORAGE_KEY + '_' + item.code);
                        }
                    }
                });
                console.log(`[TorrentKitty] 从 GM 存储加载了 ${state.cacheOrder.length} 条缓存`);
            } catch (e) {
                console.error('[TorrentKitty] 加载缓存失败:', e);
                state.cacheOrder = [];
            }
        },

        get(code) {
            if (state.javdbCache[code]) {
                const entry = state.javdbCache[code];
                if (entry.isError && entry.errorExpiry && Date.now() > entry.errorExpiry) {
                    this.remove(code);
                    return null;
                }
                this._updateOrder(code);
                return entry;
            }

            try {
                const cached = GM_getValue(this.STORAGE_KEY + '_' + code, null);
                if (cached) {
                    const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
                    state.javdbCache[code] = data;
                    this._updateOrder(code);
                    return data;
                }
            } catch (e) {
                console.error('[TorrentKitty] 读取缓存失败:', e);
            }
            return null;
        },

        set(code, data) {
            const isNew = !state.javdbCache[code];
            if (isNew) {
                this._ensureCapacity();
            }

            state.javdbCache[code] = data;

            try {
                GM_setValue(this.STORAGE_KEY + '_' + code, data);
            } catch (e) {
                console.error('[TorrentKitty] 缓存写入失败:', e);
                this._clearOldest(10);
                try {
                    GM_setValue(this.STORAGE_KEY + '_' + code, data);
                } catch (e2) {
                    console.error('[TorrentKitty] 重试写入仍失败:', e2);
                }
            }

            this._updateOrder(code);
            this._persistOrder();
        },

        _updateOrder(code) {
            const now = Date.now();
            const index = state.cacheOrder.findIndex(item => item.code === code);
            if (index !== -1) {
                state.cacheOrder.splice(index, 1);
            }
            state.cacheOrder.push({ code, timestamp: now });
        },

        _persistOrder() {
            try {
                GM_setValue(this.ORDER_KEY, state.cacheOrder);
            } catch (e) {
                console.error('[TorrentKitty] 保存缓存顺序失败:', e);
            }
        },

        _ensureCapacity() {
            while (state.cacheOrder.length >= CONFIG.cache.maxSize) {
                this._clearOldest(1);
            }
        },

        _clearOldest(count) {
            for (let i = 0; i < count && state.cacheOrder.length > 0; i++) {
                const oldest = state.cacheOrder.shift();
                if (oldest) {
                    delete state.javdbCache[oldest.code];
                    GM_deleteValue(this.STORAGE_KEY + '_' + oldest.code);
                }
            }
            this._persistOrder();
        },

        remove(code) {
            delete state.javdbCache[code];
            state.cacheOrder = state.cacheOrder.filter(item => item.code !== code);
            GM_deleteValue(this.STORAGE_KEY + '_' + code);
            this._persistOrder();
        }
    };

    // ==================== 条目缓存管理器 (缓存翻页获取到的条目) ====================
    const EntryCacheManager = {
        getKey() {
            const url = new URL(window.location.href);
            return 'tk_entry_cache_' + url.origin + url.pathname + url.search;
        },

        save(validParsedData, fetchPageNum) {
            const dataToCache = validParsedData.map(d => ({
                code: d.code,
                title: d.title,
                magnet: d.magnet,
                size: d.size,
                date: d.date,
                downloadUrl: d.downloadUrl,
                pageNum: d.pageNum || 1
            }));

            if (dataToCache.length === 0) return;

            const cacheObj = {
                timestamp: Date.now(),
                fetchPageNum: fetchPageNum,
                data: dataToCache
            };

            try {
                GM_setValue(this.getKey(), JSON.stringify(cacheObj));
            } catch (e) {
                console.error('[TorrentKitty] 写入条目缓存失败:', e);
            }
        },

        load() {
            try {
                const cachedStr = GM_getValue(this.getKey(), null);
                if (!cachedStr) return null;

                const cacheObj = typeof cachedStr === 'string' ? JSON.parse(cachedStr) : cachedStr;
                const expiry = 60 * 60 * 1000; // 缓存有效期 1 小时
                if (Date.now() - cacheObj.timestamp > expiry) {
                    GM_deleteValue(this.getKey());
                    return null;
                }
                return cacheObj;
            } catch (e) {
                console.error('[TorrentKitty] 读取条目缓存失败:', e);
                return null;
            }
        }
    };

    // ==================== 请求队列管理 ====================
    const QueueManager = {
        add(task) {
            state.requestQueue.push(task);
            this.process();
        },

        getNextDelay() {
            const { baseDelay, minRandomDelay, maxRandomDelay, maxBackoff } = CONFIG.queue;
            const randomRange = maxRandomDelay - minRandomDelay;
            const randomPart = minRandomDelay + Math.random() * randomRange;
            let delay = baseDelay + randomPart;

            if (state.currentBackoff > 0) {
                delay = Math.max(delay, state.currentBackoff);
            }
            return Math.min(delay, maxBackoff);
        },

        isRateLimited() {
            const now = Date.now();
            const oneMinuteAgo = now - 60000;
            state.requestTimestamps = state.requestTimestamps.filter(ts => ts > oneMinuteAgo);
            return state.requestTimestamps.length >= CONFIG.queue.maxRequestsPerMinute;
        },

        recordRequest() {
            state.requestTimestamps.push(Date.now());
        },

        handleError() {
            state.consecutiveErrors++;
            state.currentBackoff = Math.min(
                CONFIG.queue.errorBackoff * Math.pow(2, state.consecutiveErrors - 1),
                CONFIG.queue.maxBackoff
            );
        },

        resetError() {
            state.consecutiveErrors = 0;
            state.currentBackoff = 0;
        },

        async process() {
            if (state.isProcessing || state.requestQueue.length === 0) {
                if (!state.isProcessing && state.requestQueue.length === 0 && typeof App !== 'undefined' && App.showStatusBanner) {
                    const banner = document.getElementById('tk-status-banner');
                    if (banner && (banner.innerText.includes('正在异步') || banner.innerText.includes('排队加载'))) {
                        App.showStatusBanner('封面数据全部加载完成！', true);
                        App.hideStatusBanner(3000);
                    }
                }
                return;
            }

            if (this.isRateLimited()) {
                setTimeout(() => this.process(), 5000);
                return;
            }

            state.isProcessing = true;
            const task = state.requestQueue.shift();

            try {
                this.recordRequest();
                await JavDBService.fetchInfo(task.code, task.row);
                this.resetError();
            } catch (e) {
                console.error('[TorrentKitty] 队列处理错误:', e);
                this.handleError();
            }

            const delay = this.getNextDelay();
            setTimeout(() => {
                state.isProcessing = false;
                this.process();
            }, delay);
        }
    };

    // ==================== JavDB 服务 ====================
    const JavDBService = {
        getCoverUrl(coverId) {
            const prefix = coverId.substring(0, 2).toLowerCase();
            return `https://c0.jdbstatic.com/covers/${prefix}/${coverId}.jpg`;
        },

        async fetchInfo(code, row) {
            const debugInfo = this.createDebugInfo(code);
            const cached = CacheManager.get(code);
            if (cached) {
                UIUpdater.updateRow(row, code, cached.debugInfo || debugInfo);
                return;
            }

            try {
                const searchUrl = `https://javdb.com/search?q=${encodeURIComponent(code)}&f=all`;
                debugInfo.fetchUrl = searchUrl;

                const response = await gmFetch(searchUrl);
                debugInfo.fetchStatus = `HTTP ${response.status} ${response.statusText}`;

                if (response.status === 429) {
                    debugInfo.errorMessage = '⚠️ 请求过于频繁 (429)';
                    throw new Error('RATE_LIMITED');
                }

                if (response.status === 403) {
                    debugInfo.errorMessage = '🚫 IP 被封禁 (403)';
                    throw new Error('IP_BANNED');
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await response.text();

                if (html.includes('cf-challenge') || html.includes('captcha')) {
                    debugInfo.errorMessage = '🤖 检测到 Cloudflare 挑战/验证码';
                    throw new Error('CAPTCHA_DETECTED');
                }

                const result = this.parseSearchResult(html);

                if (result) {
                    debugInfo.foundResult = true;
                    debugInfo.javdbUrl = result.url;
                    debugInfo.coverId = result.coverId;
                    debugInfo.coverUrl = this.getCoverUrl(result.coverId);

                    CacheManager.set(code, { ...result, debugInfo });
                } else {
                    debugInfo.errorMessage = '未找到匹配的番号数据';
                    CacheManager.set(code, { url: null, coverId: null, debugInfo });
                }
            } catch (error) {
                debugInfo.errorMessage = debugInfo.errorMessage || error.message || String(error);
                console.error('[TorrentKitty] JavDB 请求出错:', error);

                const isRetryableError = ['RATE_LIMITED', 'IP_BANNED', 'CAPTCHA_DETECTED'].includes(error.message);

                if (isRetryableError) {
                    UIUpdater.updateRow(row, code, debugInfo);
                    throw error;
                }

                CacheManager.set(code, {
                    url: null, coverId: null, debugInfo,
                    isError: true,
                    errorExpiry: Date.now() + CONFIG.errorCacheExpiry
                });
            }

            UIUpdater.updateRow(row, code, debugInfo);
        },

        createDebugInfo(code) {
            return {
                code,
                timestamp: new Date().toISOString(),
                fetchUrl: '',
                fetchStatus: '',
                foundResult: false,
                javdbUrl: '',
                coverId: '',
                coverUrl: '',
                errorMessage: ''
            };
        },

        parseSearchResult(html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const firstResult = doc.querySelector('.movie-list a.box');
            if (firstResult?.getAttribute('href')) {
                const href = firstResult.getAttribute('href');
                return {
                    url: 'https://javdb.com' + href,
                    coverId: href.split('/').pop()
                };
            }
            return null;
        }
    };

    // ==================== 1. 数据解析器 ====================
    const DataParser = {
        parseRow(row) {
            const code = row.dataset.validCode;
            if (!code) return null;

            const nameEl = row.querySelector('.name') || row.cells[0];
            const nameText = nameEl ? nameEl.innerText.trim() : '未知标题';

            // 获取磁力链
            const magnetEl = row.querySelector('a[href^="magnet:"]');
            const magnet = magnetEl ? magnetEl.href : '';

            // 智能提取大小和发布日期
            let size = '未知大小';
            let date = '未知日期';
            
            if (row.cells && row.cells.length > 0) {
                for (let i = 0; i < row.cells.length; i++) {
                    const txt = row.cells[i].innerText.trim();
                    if (/\d+(\.\d+)?\s*(GB|MB|KB|Bytes)/i.test(txt)) {
                        size = txt;
                    } else if (/\d{4}-\d{2}-\d{2}/.test(txt)) {
                        date = txt;
                    }
                }
            }

            // 获取页码信息（向下兼容）
            const pageNum = parseInt(row.dataset.pageNum) || state.currentPageNum || 1;

            // 下载链接
            let downloadBtn = Array.from(row.querySelectorAll('a')).find(el => 
                el.innerText?.includes('Download') || el.href?.includes('action=download')
            );
            const downloadUrl = downloadBtn ? downloadBtn.href : (magnet || '#');

            return {
                code,
                title: nameText,
                magnet,
                size,
                date,
                downloadUrl,
                pageNum,
                rowRef: row
            };
        }
    };

    // ==================== 2. 网格容器渲染器 ====================
    const GridContainer = {
        init() {
            if (document.getElementById('tk-modern-grid-root')) return;

            const originalTable = App._findResultTable(document);
            if (!originalTable) return;

            // 创建主包装容器
            const root = document.createElement('div');
            root.id = 'tk-modern-grid-root';
            root.className = 'tk-main-container';

            // 创建顶部控制栏 Toolbar
            const toolbar = document.createElement('div');
            toolbar.className = 'tk-modern-toolbar';
            toolbar.innerHTML = `
                <div class="tk-toolbar-left">
                    <span class="tk-logo-text">TorrentKitty Enhanced</span>
                    <span class="tk-count-badge" id="tk-total-count">0 条项目</span>
                </div>
                <div class="tk-toolbar-center">
                    <div class="tk-exclusion-tags" id="tk-exclude-tags-container"></div>
                    <input type="text" id="tk-add-exclude-input" class="tk-input-modern" style="width: 100%; box-sizing: border-box;" placeholder="🛡️ 输入排除词以过滤结果，回车确认...">
                </div>
                <div class="tk-toolbar-right">
                    <button class="tk-toolbar-btn" id="tk-btn-config">⚙️ 设置</button>
                </div>
            `;
            root.appendChild(toolbar);

            // 创建网格容器
            const grid = document.createElement('div');
            grid.id = 'tk-modern-grid';
            grid.className = 'tk-grid-wrapper';
            root.appendChild(grid);

            // 创建抽屉 Detail Drawer 及其 Overlay
            const overlay = document.createElement('div');
            overlay.id = 'tk-drawer-overlay';
            overlay.className = 'tk-drawer-overlay';
            document.body.appendChild(overlay);

            const drawer = document.createElement('div');
            drawer.id = 'tk-detail-drawer';
            drawer.className = 'tk-detail-drawer';
            drawer.innerHTML = `
                <div class="tk-drawer-header">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #2A2118;">资源详细档案</h3>
                    <span class="tk-drawer-close" id="tk-drawer-close-btn">✕</span>
                </div>
                <div class="tk-drawer-section">
                    <span class="tk-drawer-label">神秘番号</span>
                    <div class="tk-drawer-value tk-drawer-value-code" id="tk-drawer-code">N/A</div>
                </div>
                <div class="tk-drawer-section">
                    <span class="tk-drawer-label">资源名称</span>
                    <div class="tk-drawer-value" id="tk-drawer-title" style="max-height: 120px; overflow-y: auto; line-height: 1.6;">N/A</div>
                </div>
                <div class="tk-drawer-section">
                    <span class="tk-drawer-label">文件体积</span>
                    <div class="tk-drawer-value" id="tk-drawer-size">N/A</div>
                </div>
                <div class="tk-drawer-section">
                    <span class="tk-drawer-label">发布时间</span>
                    <div class="tk-drawer-value" id="tk-drawer-date">N/A</div>
                </div>
                <div class="tk-drawer-section" style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
                    <button class="tk-drawer-btn" id="tk-drawer-copy-code">📋 复制番号</button>
                    <button class="tk-drawer-btn" id="tk-drawer-copy-magnet">🧲 一键复制磁力链接</button>
                </div>
                <div class="tk-drawer-section" style="margin-top: 12px; border-top: 1px solid var(--tk-card-border); padding-top: 16px;">
                    <span class="tk-drawer-label">系统运行诊断数据</span>
                    <pre id="tk-drawer-logs" style="font-family: var(--tk-font-mono); font-size: 11px; color: #606C38; background: rgba(255,255,255,0.4); padding: 12px; border-radius: 8px; overflow-x: auto; margin: 0; white-space: pre-wrap; word-break: break-all; max-height: 180px; overflow-y: auto; border: 1px solid rgba(61, 50, 38, 0.08);">无记录</pre>
                </div>
            `;
            document.body.appendChild(drawer);

            // 隐藏原表格，插入新主容器
            originalTable.parentNode.insertBefore(root, originalTable);
            originalTable.style.display = 'none';

            // 注册抽屉关闭和遮罩层关闭事件
            overlay.onclick = () => this.closeDrawer();
            document.getElementById('tk-drawer-close-btn').onclick = () => this.closeDrawer();

            // 绑定排除词回车添加事件
            const excInput = document.getElementById('tk-add-exclude-input');
            excInput.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    ExclusionManager.addKeyword(excInput.value);
                    excInput.value = '';
                }
            };

            // 绑定设置按钮
            document.getElementById('tk-btn-config').onclick = () => ModalManager.showSettings();
            
            // 同步一次设置的尺寸
            this.syncConfigDimensions();
        },

        syncConfigDimensions() {
            const { coverWidth, pageMaxWidth } = state.settings;
            document.documentElement.style.setProperty('--tk-card-width', `${coverWidth}px`);
            document.documentElement.style.setProperty('--tk-page-max-width', `${pageMaxWidth || 1200}px`);
        },

        showDrawer(data, debugInfo) {
            document.getElementById('tk-drawer-code').textContent = data.code;
            document.getElementById('tk-drawer-title').textContent = data.title;
            document.getElementById('tk-drawer-size').textContent = data.size;
            document.getElementById('tk-drawer-date').textContent = data.date;

            // 绑定复制事件
            document.getElementById('tk-drawer-copy-code').onclick = () => {
                navigator.clipboard.writeText(data.code).then(() => {
                    const btn = document.getElementById('tk-drawer-copy-code');
                    btn.textContent = '✅ 已复制番号';
                    setTimeout(() => btn.textContent = '📋 复制番号', 1500);
                });
            };

            document.getElementById('tk-drawer-copy-magnet').onclick = () => {
                if (data.magnet) {
                    navigator.clipboard.writeText(data.magnet).then(() => {
                        const btn = document.getElementById('tk-drawer-copy-magnet');
                        btn.textContent = '✅ 已复制磁力链';
                        setTimeout(() => btn.textContent = '🧲 一键复制磁力链接', 1500);
                    });
                } else {
                    alert('未获取到磁力链接！');
                }
            };

            // 展示诊断日志
            const logsPre = document.getElementById('tk-drawer-logs');
            if (debugInfo) {
                logsPre.textContent = ModalManager.formatDebugInfo(debugInfo);
            } else {
                logsPre.textContent = '等待封面数据接口拉取...';
            }

            document.getElementById('tk-drawer-overlay').classList.add('active');
            document.getElementById('tk-detail-drawer').classList.add('active');
        },

        closeDrawer() {
            document.getElementById('tk-drawer-overlay').classList.remove('active');
            document.getElementById('tk-detail-drawer').classList.remove('active');
        }
    };

    // ==================== 3. 卡片工厂 ====================
    const CardFactory = {
        createCard(data) {
            const cardId = `tk-card-${data.code.replace(/[^a-zA-Z0-9-]/g, '')}`;
            let card = document.getElementById(cardId);
            if (card) return card;

            card = document.createElement('div');
            card.id = cardId;
            card.className = 'tk-media-card';
            card.dataset.code = data.code;

            card.innerHTML = `
                <div class="tk-card-cover-wrapper">
                    <div class="tk-skeleton" id="${cardId}-skeleton"></div>
                    <img class="tk-cover-img" id="${cardId}-img" alt="Cover">
                    <div class="tk-cover-fallback" id="${cardId}-fallback" style="display: none;">[可能需代理/未收录]</div>
                </div>
                <div class="tk-card-content">
                    <div class="tk-card-header">
                        <span class="tk-card-code">${data.code}</span>
                        <span class="tk-card-meta">${data.size}</span>
                    </div>
                    <div class="tk-card-title" title="${data.title}">${data.title}</div>
                    <div class="tk-card-meta" style="margin-top: -4px;">📅 ${data.date}</div>
                    <div class="tk-card-actions">
                        <span class="tk-btn-modern tk-btn-download" id="${cardId}-magnet-btn" onclick="event.stopPropagation();">🧲 复制磁力</span>
                        <a href="https://missav.ws/cn/${data.code}" target="_blank" class="tk-btn-modern tk-btn-missav" onclick="event.stopPropagation();">▶ MissAV</a>
                        <a href="#" target="_blank" class="tk-btn-modern tk-btn-javdb disabled" id="${cardId}-javdb-btn" onclick="event.stopPropagation(); return false;">🔗 JavDB</a>
                    </div>
                </div>
            `;

            // 点击整个卡片（除操作按钮外）展示侧边抽屉
            card.onclick = () => {
                let debugInfo = null;
                const coverContainer = data.rowRef.querySelector('.javdb-cover-container');
                if (coverContainer && coverContainer.dataset.debugInfo) {
                    try {
                        debugInfo = JSON.parse(coverContainer.dataset.debugInfo);
                    } catch(e){}
                }
                GridContainer.showDrawer(data, debugInfo);
            };

            // 绑定复制磁力按钮事件
            const magnetBtn = card.querySelector(`#${cardId}-magnet-btn`);
            if (magnetBtn) {
                magnetBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (data.magnet) {
                        navigator.clipboard.writeText(data.magnet).then(() => {
                            const originalText = magnetBtn.innerHTML;
                            magnetBtn.innerHTML = '✅ 已复制';
                            setTimeout(() => { magnetBtn.innerHTML = originalText; }, 1500);
                        }).catch(() => {
                            alert('复制失败，请在详情抽屉中手动复制');
                        });
                    } else {
                        alert('未获取到磁力链接！');
                    }
                };
            }

            return card;
        }
    };

    // ==================== 4. UI更新器 ====================
    const UIUpdater = {
        updateRow(row, code, debugInfo) {
            const cache = CacheManager.get(code);
            if (!cache) return;

            const { url, coverId } = cache;

            // 更新 tr 属性（向下兼容）
            const originalCoverContainer = row.querySelector('.javdb-cover-container');
            if (originalCoverContainer) {
                originalCoverContainer.dataset.debugInfo = JSON.stringify(debugInfo);
            }
            const originalJavdbBtn = row.querySelector('.javdb-btn');
            if (originalJavdbBtn) {
                this.updateJavDBButton(originalJavdbBtn, url);
            }

            // 同步更新现代化卡片
            const cardId = `tk-card-${code.replace(/[^a-zA-Z0-9-]/g, '')}`;
            const card = document.getElementById(cardId);
            if (card) {
                const img = document.getElementById(`${cardId}-img`);
                const skeleton = document.getElementById(`${cardId}-skeleton`);
                const fallback = document.getElementById(`${cardId}-fallback`);
                const javdbBtn = document.getElementById(`${cardId}-javdb-btn`);

                if (javdbBtn) {
                    if (url) {
                         javdbBtn.href = url;
                         javdbBtn.classList.remove('disabled');
                         javdbBtn.onclick = (e) => e.stopPropagation();
                    } else {
                         javdbBtn.classList.add('disabled');
                         javdbBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); };
                    }
                }

                if (img && skeleton) {
                    if (coverId) {
                        const coverUrl = JavDBService.getCoverUrl(coverId);
                        img.src = coverUrl;
                        img.onload = () => {
                            img.classList.add('loaded');
                            skeleton.style.display = 'none';
                        };
                        img.onerror = () => {
                            img.onerror = null;
                            img.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTUwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjRDRCODUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzlCM0IyQSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlvlm77niYflu4常1TwvdGV4dD48L3N2Zz4=';
                            img.classList.add('loaded');
                            skeleton.style.display = 'none';
                            if (fallback) fallback.style.display = 'block';
                        };
                    } else {
                        // 未收录
                        img.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTUwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjRDRCODUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzNEMzIyNiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlvmnqOaUtuW9eV08vdGV4dD48L3N2Zz4=';
                        img.classList.add('loaded');
                        skeleton.style.display = 'none';
                    }
                }
            }

            // 更新已开启抽屉的日志
            const activeDrawerCode = document.getElementById('tk-drawer-code');
            if (activeDrawerCode && activeDrawerCode.textContent === code) {
                const logsPre = document.getElementById('tk-drawer-logs');
                if (logsPre) {
                    logsPre.textContent = ModalManager.formatDebugInfo(debugInfo);
                }
            }
        },

        updateJavDBButton(btn, url) {
            if (!btn) return;
            if (url) {
                btn.href = url;
                btn.innerText = '🔗 JavDB';
            } else {
                btn.innerText = 'Ø 无详情';
                btn.href = '#';
                btn.onclick = (e) => e.preventDefault();
            }
        },

        updateAllCovers() {
            GridContainer.syncConfigDimensions();
        }
    };

    // ==================== 5. 模态框管理器 ====================
    const ModalManager = {
        createOverlay(content) {
            const overlay = document.createElement('div');
            overlay.style.cssText = StyleUtils.overlay();
            overlay.appendChild(content);

            overlay.onclick = (e) => {
                if (e.target === overlay) overlay.remove();
            };

            document.body.appendChild(overlay);
            return overlay;
        },

        createButton(text, color, onClick) {
            const btn = document.createElement('button');
            btn.innerText = text;
            btn.className = 'tk-toolbar-btn';
            btn.style.margin = '0 0 0 8px';
            btn.onclick = onClick;
            return btn;
        },

        showDebugInfo(debugInfo) {
            const info = this.formatDebugInfo(debugInfo);

            const modal = document.createElement('div');
            modal.style.cssText = StyleUtils.modal({ maxWidth: '600px' });

            const title = document.createElement('h3');
            title.textContent = '运行诊断日志';
            title.style.margin = '0 0 16px 0';
            title.style.color = '#2A2118';

            const textarea = document.createElement('textarea');
            textarea.value = info;
            textarea.readOnly = true;
            textarea.style.cssText = `
                width: 100%;
                height: 300px;
                font-family: var(--tk-font-mono);
                font-size: 12px;
                padding: 12px;
                background: #E8DCC7;
                border: 1px solid rgba(61, 50, 38, 0.15);
                border-radius: 8px;
                color: #3D3226;
                resize: none;
                box-sizing: border-box;
            `;

            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'margin-top: 16px; display: flex; justify-content: flex-end;';

            const closeBtn = this.createButton('关闭', COLORS.neutral, null);
            buttonContainer.appendChild(closeBtn);

            modal.append(title, textarea, buttonContainer);
            const overlay = this.createOverlay(modal);

            closeBtn.onclick = () => overlay.remove();
        },

        formatDebugInfo(debugInfo) {
            return `>> SYSTEM DIAGNOSTICS: JAVDB MODULE
============================================================
[+] 番号: ${debugInfo.code}
[+] 时间戳: ${debugInfo.timestamp}
[+] 请求地址: ${debugInfo.fetchUrl}
[+] HTTP 状态: ${debugInfo.fetchStatus}
[+] 命中成功: ${debugInfo.foundResult ? '[ 是 ]' : '[ 否 ]'}
[+] JavDB 地址: ${debugInfo.javdbUrl || '无'}
[+] 封面 ID: ${debugInfo.coverId || '无'}
[+] 封面加载: ${debugInfo.imageLoadSuccess !== undefined ? (debugInfo.imageLoadSuccess ? '[ 成功 ]' : '[ 失败 ]') : '[ 排队中 ]'}
[!] 错误捕获: ${debugInfo.errorMessage || '无异常'}
============================================================`;
        },

        showSettings() {
            const panel = document.createElement('div');
            panel.style.cssText = StyleUtils.modal({ maxWidth: '400px' });

            panel.innerHTML = `
                <h3 style="margin: 0 0 20px 0; color: #2A2118; font-weight: 700; font-family: var(--tk-font-display);">网格显示配置</h3>
                <div style="background: rgba(255,255,255,0.4); border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid rgba(61, 50, 38, 0.08);">
                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; justify-content: space-between; font-size: 13px; color: var(--tk-text-muted); margin-bottom: 8px;">
                            <span>页面版面最大宽度</span>
                            <span style="color: var(--tk-moss); font-weight: 700;"><span id="page-width-value">${state.settings.pageMaxWidth || 1200}</span> PX</span>
                        </label>
                        <input type="range" id="page-width-slider" class="tk-slider" min="1000" max="1800" step="50" value="${state.settings.pageMaxWidth || 1200}">
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; justify-content: space-between; font-size: 13px; color: var(--tk-text-muted); margin-bottom: 8px;">
                            <span>自动翻页加载最大页数</span>
                            <span style="color: var(--tk-accent-pink); font-weight: 700;"><span id="pages-value">${state.settings.maxPagesToFetch || 10}</span> 页</span>
                        </label>
                        <input type="range" id="pages-slider" class="tk-slider" min="1" max="30" value="${state.settings.maxPagesToFetch || 10}">
                    </div>
                    <div>
                        <label style="display: flex; justify-content: space-between; font-size: 13px; color: var(--tk-text-muted); margin-bottom: 8px;">
                            <span>卡片横向宽度</span>
                            <span style="color: var(--tk-accent-cyan); font-weight: 700;"><span id="width-value">${state.settings.coverWidth}</span> PX</span>
                        </label>
                        <input type="range" id="width-slider" class="tk-slider" min="200" max="500" value="${state.settings.coverWidth}">
                    </div>
                </div>
                <div id="settings-buttons" style="display: flex; justify-content: flex-end; gap: 8px;"></div>
            `;

            const overlay = this.createOverlay(panel);
            
            const pageWidthSlider = panel.querySelector('#page-width-slider');
            const pageWidthValue = panel.querySelector('#page-width-value');
            const pagesSlider = panel.querySelector('#pages-slider');
            const pagesValue = panel.querySelector('#pages-value');
            const widthSlider = panel.querySelector('#width-slider');
            const widthValue = panel.querySelector('#width-value');
            const buttonsContainer = panel.querySelector('#settings-buttons');

            pageWidthSlider.oninput = () => {
                pageWidthValue.textContent = pageWidthSlider.value;
            };

            pagesSlider.oninput = () => {
                pagesValue.textContent = pagesSlider.value;
            };

            widthSlider.oninput = () => {
                widthValue.textContent = widthSlider.value;
            };

            const resetBtn = this.createButton('重置', COLORS.neutral, () => {
                pageWidthSlider.value = 1200;
                pageWidthValue.textContent = 1200;
                pagesSlider.value = 10;
                pagesValue.textContent = 10;
                widthSlider.value = 280;
                widthValue.textContent = 280;
            });

            const saveBtn = this.createButton('保存', COLORS.primary, () => {
                state.settings.pageMaxWidth = parseInt(pageWidthSlider.value);
                state.settings.maxPagesToFetch = parseInt(pagesSlider.value);
                state.settings.coverWidth = parseInt(widthSlider.value);
                state.settings.coverHeight = Math.round(parseInt(widthSlider.value) * 0.75); 
                SettingsManager.save();
                UIUpdater.updateAllCovers();
                overlay.remove();
            });

            buttonsContainer.appendChild(resetBtn);
            buttonsContainer.appendChild(saveBtn);
        }
    };

    // ==================== 6. 按钮工厂 ====================
    const ButtonFactory = {
        createLinkButton(text, href, color, className) {
            const btn = document.createElement('a');
            btn.href = href;
            btn.target = '_blank';
            btn.innerText = text;
            btn.className = `${className} tk-btn-hover`;
            btn.style.cssText = StyleUtils.buttonBase(color, { margin: '0 0 0 8px' });
            return btn;
        },

        createSettingsButton() {
            // 整合入 Toolbar，浮动按钮无操作
        }
    };

    // ==================== 7. 排除关键字管理器 ====================
    const ExclusionManager = {
        init() {
            this.updateList();
        },
        saveKeywords() {
            if (typeof GM_setValue === 'function') {
                GM_setValue('tk_exclude_keywords', state.excludeKeywords);
            }
        },
        addKeyword(kw) {
            kw = kw.trim();
            if (kw && !state.excludeKeywords.includes(kw)) {
                state.excludeKeywords.push(kw);
                this.saveKeywords();
                this.updateList();
                this.applyExclusion();
            }
        },
        removeKeyword(kw) {
            state.excludeKeywords = state.excludeKeywords.filter(k => k !== kw);
            this.saveKeywords();
            this.updateList();
            this.applyExclusion();
        },
        applyExclusion() {
            const cards = document.querySelectorAll('.tk-media-card');
            cards.forEach(card => {
                const code = card.dataset.code;
                const trs = Array.from(document.querySelectorAll('table tr'));
                const matchedTr = trs.find(t => t.dataset.validCode === code);
                if (matchedTr) {
                    const isExcluded = state.excludeKeywords.some(kw => kw && matchedTr.innerText.includes(kw));
                    if (isExcluded) {
                        card.style.display = 'none';
                        matchedTr.style.display = 'none';
                        matchedTr.dataset.excluded = 'true';
                    } else {
                        card.style.display = '';
                        matchedTr.style.display = '';
                        delete matchedTr.dataset.excluded;
                    }
                }
            });

            if (typeof App !== 'undefined') {
                App.processRows();
            }
        },
        updateList() {
            const container = document.getElementById('tk-exclude-tags-container');
            if (!container) return;
            container.innerHTML = '';
            state.excludeKeywords.forEach(kw => {
                const tag = document.createElement('span');
                tag.className = 'tk-tag';
                tag.innerHTML = `
                    🛡️ ${kw}
                    <span class="tk-tag-del" data-kw="${kw}">×</span>
                `;
                tag.querySelector('.tk-tag-del').onclick = () => {
                    this.removeKeyword(kw);
                };
                container.appendChild(tag);
            });
        }
    };

    // ==================== 8. 原站按钮美化 ====================
    const OriginalButtonStyler = {
        style() {
            // 已完全隐藏表格，无额外原站按钮美化
        }
    };

    // ==================== 主逻辑 ====================
    const App = {
        createVirtualRow(data) {
            const tr = document.createElement('tr');
            tr.dataset.validCode = data.code;
            tr.dataset.isVirtual = 'true';
            tr.dataset.pageNum = data.pageNum || 1;
            tr.style.display = 'none';

            const tdName = document.createElement('td');
            tdName.className = 'name';
            tdName.innerText = data.title;
            tr.appendChild(tdName);

            const tdSize = document.createElement('td');
            tdSize.innerText = data.size;
            tr.appendChild(tdSize);

            const tdDate = document.createElement('td');
            tdDate.innerText = data.date;
            tr.appendChild(tdDate);

            const tdAction = document.createElement('td');
            tdAction.className = 'action';
            
            const aMagnet = document.createElement('a');
            aMagnet.href = data.magnet;
            aMagnet.innerText = 'Magnet';
            tdAction.appendChild(aMagnet);

            const aDownload = document.createElement('a');
            aDownload.href = data.downloadUrl;
            aDownload.innerText = 'Download';
            tdAction.appendChild(aDownload);

            tr.appendChild(tdAction);
            return tr;
        },

        _findResultTable(doc = document) {
            return doc.querySelector('table#archiveResult') || doc.querySelector('table.results') || doc.querySelector('.search-results table');
        },

        getResultRows(doc = document) {
            const table = this._findResultTable(doc);
            if (table) {
                return Array.from(table.querySelectorAll('tr')).slice(1);
            }
            const trs = Array.from(doc.querySelectorAll('tr'));
            return trs.filter(tr => {
                const hasMagnet = tr.querySelector('a[href^="magnet:"]');
                const hasDownload = Array.from(tr.querySelectorAll('a, input, button')).some(el =>
                    (el.innerText?.includes('Download')) || el.value === 'Download'
                );
                return hasMagnet || hasDownload;
            });
        },

        getResultsTable() {
            const table = this._findResultTable(document);
            if (table) {
                return table.querySelector('tbody') || table;
            }
            const firstRow = this.getResultRows()[0];
            return firstRow ? firstRow.parentNode : null;
        },

        getCurrentPageNum() {
            const url = new URL(window.location.href);
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts[0] === 'search' && pathParts[1]) {
                return parseInt(pathParts[2]) || 1;
            }
            const activePageEl = document.querySelector('.pagination .active, .pagination strong, .pages .current');
            if (activePageEl) {
                const num = parseInt(activePageEl.innerText);
                if (!isNaN(num)) return num;
            }
            return 1;
        },

        getNextPageUrl(pageNum) {
            const url = new URL(window.location.href);
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts[0] === 'search' && pathParts[1]) {
                return `${url.origin}/search/${pathParts[1]}/${pageNum}`;
            }
            const paginationLinks = document.querySelectorAll('.pagination a, .pages a');
            for (let link of paginationLinks) {
                const href = link.getAttribute('href');
                const regex = new RegExp(`\\/${pageNum}(?:$|\\/|\\?|#)`);
                if (href && regex.test(href)) {
                    return new URL(href, window.location.origin).href;
                }
            }
            return null;
        },

        processRows() {
            GridContainer.init();

            const resultRows = this.getResultRows();
            const validParsedData = [];

            resultRows.forEach(row => {
                try {
                    const rowText = row.innerText;
                    
                    const isExcluded = state.excludeKeywords.some(kw => kw && rowText.includes(kw));
                    if (isExcluded) {
                        row.style.display = 'none';
                        row.dataset.excluded = 'true';
                        delete row.dataset.validCode;
                        state.requestQueue = state.requestQueue.filter(task => task.row !== row);
                        return;
                    }
                    
                    if (row.dataset.excluded === 'true') {
                        row.style.display = 'none';
                        delete row.dataset.excluded;
                    }

                    if (row.dataset.validCode) {
                        const data = DataParser.parseRow(row);
                        if (data) validParsedData.push(data);
                        return;
                    }

                    const match = rowText.match(CONFIG.codeRegex);
                    if (match) {
                        let code = (match[1] || match[2]).toUpperCase();
                        if (!code.includes('-') && /^[A-Z]{2,}/.test(code)) {
                            code = code.replace(/([A-Z]+)(\d+)/, '$1-$2');
                        }
                        row.dataset.validCode = code;
                        
                        const data = DataParser.parseRow(row);
                        if (data) validParsedData.push(data);
                    } else {
                        row.style.display = 'none';
                    }
                } catch (e) {
                    console.error('[TorrentKitty] 处理行时出错:', e, row);
                }
            });

            // 渲染网格
            const grid = document.getElementById('tk-modern-grid');
            if (grid) {
                let lastRowPageNum = null;
                
                validParsedData.forEach(data => {
                    // 如果页码发生变化，且不是首个页码，则在网格流中在此处追加对应的页码分割线
                    if (lastRowPageNum !== null && data.pageNum !== lastRowPageNum) {
                        const markerId = `tk-page-marker-${data.pageNum}`;
                        if (!document.getElementById(markerId)) {
                            const marker = document.createElement('div');
                            marker.id = markerId;
                            marker.className = 'tk-page-marker-modern';
                            marker.textContent = `─── 原第 ${data.pageNum} 页数据补充加载完成 ───`;
                            grid.appendChild(marker);
                        }
                    }
                    lastRowPageNum = data.pageNum;

                    const card = CardFactory.createCard(data);
                    if (card && card.parentNode !== grid) {
                        grid.appendChild(card);
                    }
                });
            }

            // 更新计数器
            const totalCountBadge = document.getElementById('tk-total-count');
            if (totalCountBadge) {
                totalCountBadge.textContent = `${this.getValidRowsCount()} 条项目`;
            }

            // 保存条目列表缓存
            EntryCacheManager.save(validParsedData, state.fetchPageNum);

            this.checkPaginationAndDispatch();
        },

        enhanceRow(row, code) {
            // 保留 tr 中的 enhancement 标记（向下兼容与数据一致）
            let targetBtn = Array.from(row.querySelectorAll('a, input, button')).find(el =>
                (el.innerText?.includes('Download')) || el.value === 'Download'
            );

            if (!targetBtn) {
                targetBtn = row.querySelector('a[href^="magnet:"]');
            }

            if (!targetBtn) return;

            const parent = targetBtn.parentNode;

            const missavBtn = ButtonFactory.createLinkButton(
                '▶ MissAV',
                `https://missav.ws/cn/${code}`,
                COLORS.pink,
                'missav-btn'
            );
            parent.insertBefore(missavBtn, targetBtn.nextSibling);

            const javdbBtn = ButtonFactory.createLinkButton(
                '⏳ 加载中...',
                '#',
                COLORS.neutral,
                'javdb-btn'
            );
            parent.insertBefore(javdbBtn, missavBtn.nextSibling);

            const coverContainer = document.createElement('div');
            coverContainer.className = 'javdb-cover-container';
            coverContainer.style.display = 'none'; // 保持隐藏，仅存放 debugInfo 元数据
            parent.appendChild(coverContainer);

            row.dataset.enhanced = 'true';

            const cached = CacheManager.get(code);
            if (cached) {
                UIUpdater.updateRow(row, code, cached.debugInfo || {});
                return;
            }

            QueueManager.add({ code, row });
        },

        getValidRowsCount() {
            return document.querySelectorAll('tr[data-valid-code]').length;
        },

        showStatusBanner(text, showContinueBtn = false) {
            if (state.bannerTimeout) {
                clearTimeout(state.bannerTimeout);
                state.bannerTimeout = null;
            }

            let banner = document.getElementById('tk-status-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'tk-status-banner';
                banner.style.cssText = `
                    margin: 20px auto;
                    padding: 15px 20px;
                    max-width: 600px;
                    background: var(--tk-card-bg);
                    color: var(--tk-text-main);
                    border: 1px solid var(--tk-card-border);
                    border-radius: 12px;
                    text-align: center;
                    font-family: var(--tk-font-body);
                    font-weight: 500;
                    font-size: 13px;
                    box-shadow: 0 10px 25px rgba(61,50,38,0.08);
                    transition: all 0.3s ease;
                `;
                const rootContainer = document.getElementById('tk-modern-grid-root');
                if (rootContainer) {
                    rootContainer.appendChild(banner);
                } else {
                    document.body.appendChild(banner);
                }
            }

            banner.innerHTML = '';
            const textSpan = document.createElement('span');
            textSpan.textContent = text;
            banner.appendChild(textSpan);
            
            if (showContinueBtn) {
                const btn = document.createElement('button');
                btn.innerText = '加载更多';
                btn.className = 'tk-toolbar-btn';
                btn.style.marginLeft = '12px';
                btn.onclick = () => {
                    state.targetValidCount += 8;
                    this.showStatusBanner('正在拉取数据...', false);
                    this.checkPaginationAndDispatch();
                };
                banner.appendChild(btn);
            }

            banner.style.display = 'block';
            banner.style.opacity = '1';
        },

        hideStatusBanner(delay = 0) {
            if (state.bannerTimeout) {
                clearTimeout(state.bannerTimeout);
                state.bannerTimeout = null;
            }
            if (delay > 0) {
                state.bannerTimeout = setTimeout(() => this.hideStatusBanner(0), delay);
                return;
            }
            const banner = document.getElementById('tk-status-banner');
            if (banner) {
                banner.style.opacity = '0';
                state.bannerTimeout = setTimeout(() => {
                    banner.style.display = 'none';
                }, 300);
            }
        },

        checkPaginationAndDispatch() {
            if (state.isFetchingPage) return;

            const validCount = this.getValidRowsCount();
            if (validCount < state.targetValidCount) {
                if (state.fetchPageNum - state.currentPageNum >= (state.settings.maxPagesToFetch || 10)) {
                    this.showStatusBanner(`已加载至页数限制阈值。当前收集到番号项目: ${validCount} 条`, true);
                    this.dispatchQueue();
                    return;
                }
                
                state.fetchPageNum++;
                this.loadNextPage(state.fetchPageNum);
            } else {
                this.showStatusBanner(`共收集到 ${validCount} 条番号项目，正在异步加载封面数据...`, true);
                this.dispatchQueue();
            }
        },

        dispatchQueue() {
            const validRows = document.querySelectorAll('tr[data-valid-code]:not([data-enhanced="true"])');
            validRows.forEach(row => {
                const code = row.dataset.validCode;
                if (code) {
                    this.enhanceRow(row, code);
                }
            });

            if (state.requestQueue.length === 0) {
                this.showStatusBanner('封面数据已从本地缓存全部加载完成！', true);
                this.hideStatusBanner(3000);
            }
        },

        loadNextPage(pageNum) {
            const nextUrl = this.getNextPageUrl(pageNum);
            if (!nextUrl) {
                this.showStatusBanner(`已无更多页面或无法解析翻页链接。当前累计项目: ${this.getValidRowsCount()} 条`, true);
                this.dispatchQueue();
                return;
            }

            this.showStatusBanner(`正在载入第 ${pageNum} 页数据以补充卡片... (当前收集项目: ${this.getValidRowsCount()}/${state.targetValidCount})`);
            state.isFetchingPage = true;

            gmFetch(nextUrl).then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            }).then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const nextRows = this.getResultRows(doc);
                
                const resultsTable = this.getResultsTable();
                if (!resultsTable) {
                    state.isFetchingPage = false;
                    return;
                }

                let lastValidRow = null;
                nextRows.forEach(row => {
                    const rowText = row.innerText;
                    if (rowText.match(CONFIG.codeRegex)) {
                        const isExcluded = state.excludeKeywords.some(kw => kw && rowText.includes(kw));
                        if (isExcluded) return;

                        const importedRow = document.importNode(row, true);
                        importedRow.dataset.pageNum = pageNum;
                        importedRow.style.display = 'none'; // 原始 tr 保持隐藏
                        resultsTable.appendChild(importedRow);
                        lastValidRow = importedRow;
                    }
                });

                state.isFetchingPage = false;
                let addedAny = !!lastValidRow;
                if (!addedAny) {
                    state.consecutiveEmptyPages++;
                    if (state.consecutiveEmptyPages > 5) {
                        this.showStatusBanner('由于连续 5 页未探测到有效影视番号资源，停止自动追加。', true);
                        this.dispatchQueue();
                        return;
                    }
                    setTimeout(() => this.checkPaginationAndDispatch(), 1000);
                } else {
                    state.consecutiveEmptyPages = 0;
                    this.processRows();
                }
            }).catch(error => {
                state.isFetchingPage = false;
                console.error('[TorrentKitty] 自动翻页错误:', error);
                this.showStatusBanner(`拉取第 ${pageNum} 页失败，将在 3 秒后重试...`);
                setTimeout(() => {
                    state.fetchPageNum--;
                    this.checkPaginationAndDispatch();
                }, 3000);
            });
        },

        init() {
            StyleUtils.injectGlobalStyles();
            SettingsManager.load();
            CacheManager.init();

            state.currentPageNum = this.getCurrentPageNum();
            state.fetchPageNum = state.currentPageNum;

            // 恢复已缓存的翻页条目，避免刷新页面时产生重复的网络翻页等待
            const cachedEntries = EntryCacheManager.load();
            if (cachedEntries && cachedEntries.data && cachedEntries.data.length > 0) {
                const resultsTable = this.getResultsTable();
                if (resultsTable) {
                    const existingRows = this.getResultRows();
                    const existingCodes = existingRows.map(row => {
                        const match = row.innerText.match(CONFIG.codeRegex);
                        return match ? (match[1] || match[2]).toUpperCase() : '';
                    }).filter(Boolean);

                    let restoreCount = 0;
                    cachedEntries.data.forEach(item => {
                        const isDuplicate = existingCodes.some(c => 
                            c === item.code || c.replace('-', '') === item.code.replace('-', '')
                        );
                        if (!isDuplicate) {
                            const vRow = this.createVirtualRow(item);
                            resultsTable.appendChild(vRow);
                            restoreCount++;
                        }
                    });

                    if (restoreCount > 0) {
                        state.fetchPageNum = cachedEntries.fetchPageNum;
                        console.log(`[TorrentKitty] 成功从本地缓存恢复了 ${restoreCount} 个翻页条目，当前加载至第 ${state.fetchPageNum} 页`);
                    }
                }
            }

            console.log(
                `%c [TK_GRID_PORTAL] %c VER_${VERSION} %c SYSTEM_READY (Organic Palette) `,
                'background: #8B9D83; color: #3D3226; font-weight: bold; border-radius: 4px 0 0 4px; padding: 2px 0;',
                'background: #E8DCC7; color: #2A2118; border: 1px solid #8B9D83; border-left: none; border-right: none; padding: 1px 4px; font-family: monospace;',
                'background: #606C38; color: #fff; font-weight: bold; border-radius: 0 4px 4px 0; padding: 2px 0;'
            );

            state.loadHandler = () => {
                ExclusionManager.init();
                this.processRows();
            };

            if (document.readyState === 'complete') {
                state.loadHandler();
            } else {
                window.addEventListener('load', state.loadHandler);
            }

            let debounceTimer = null;
            state.observer = new MutationObserver((mutations) => {
                const hasRelevantChanges = mutations.some(m =>
                    !m.target.closest?.('.tk-main-container') &&
                    !m.target.closest?.('.tk-detail-drawer') &&
                    !m.target.closest?.('.tk-drawer-overlay')
                );
                if (hasRelevantChanges) {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => this.processRows(), 300);
                }
            });

            const startObserving = () => {
                if (document.body) {
                    state.observer.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                } else {
                    setTimeout(startObserving, 100);
                }
            };
            startObserving();
        },

        cleanup() {
            if (state.observer) {
                state.observer.disconnect();
                state.observer = null;
            }
            if (state.loadHandler) {
                window.removeEventListener('load', state.loadHandler);
                state.loadHandler = null;
            }
        }
    };

    App.init();

    window.addEventListener('beforeunload', () => App.cleanup());

})();