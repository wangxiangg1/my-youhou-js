// ==UserScript==
// @name         TorrentKitty to MissAV & JavDB with Cover + Settings
// @namespace    http://tampermonkey.net/
// @version      4.9.1
// @description  TorrentKitty 增强：卡片化网格浏览流、版本标签识别、无缝大图日志抽屉、自动补充排队加载 (Organic 配色版)
// @author       Gemini 4 Neon
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
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_setClipboard
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

    // ==================== 0. 早期广告弹窗拦截与磁力防劫持 ====================
    const pageWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    const adPopupDomains = ['rebrand.ly', 'wingsmob.com', 'acscdn.com', 'rapidadexchange.com'];
    const openPopup = pageWindow.open;
    if (typeof openPopup === 'function') {
        pageWindow.open = function (url, ...args) {
            let host;
            try {
                host = new URL(url, location.href).hostname;
            } catch {
                // 交由浏览器按原样处理非法 URL
            }
            if (host && adPopupDomains.some(domain => host === domain || host.endsWith('.' + domain))) {
                return null;
            }
            return Reflect.apply(openPopup, this, [url, ...args]);
        };
    }

    // 跳过站点延迟推广点击劫持，保留原生磁力链接行为
    window.addEventListener('click', event => {
        if (event.target?.closest?.('a[href^="magnet:"]')) {
            event.stopImmediatePropagation();
        }
    }, true);

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
                onerror: () => reject(new Error('网络请求失败')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    // ==================== 通用工具函数 ====================
    const Utils = {
        escapeRegExp(str) {
            return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        /**
         * 统一提取表格行文本：在离线 DOMParser 文档和隐藏表格上都稳定保留列间空格
         */
        getRowText(row) {
            if (!row) return '';
            if (row.cells && row.cells.length > 0) {
                return Array.from(row.cells)
                    .map(cell => (cell.textContent || '').trim())
                    .filter(Boolean)
                    .join(' ');
            }
            return (row.textContent || '').trim();
        },

        /**
         * 从磁力链提取稳定去重键（BTIH），无磁力链时回退到标题哈希
         */
        buildRowKey(code, magnet, title, fallbackIndex) {
            const btihMatch = magnet && magnet.match(/btih:([a-zA-Z0-9]+)/i);
            if (btihMatch) {
                return `${code}-${btihMatch[1].toLowerCase().slice(0, 12)}`;
            }
            // 简单稳定的字符串哈希，避免重复或非法 DOM ID 字符
            const raw = `${code}|${title || ''}|${fallbackIndex}`;
            let hash = 0;
            for (let i = 0; i < raw.length; i++) {
                hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
            }
            return `${code}-${(hash >>> 0).toString(36)}`;
        },

        /**
         * 识别同番号不同版本标签：中字(C)、破解无码(U)、超级AI无码(LTX)
         */
        detectVersionTags(title, code) {
            if (!title) return [];
            const tags = [];
            const upperTitle = title.toUpperCase();
            const upperCode = (code || '').toUpperCase();
            const compactCode = upperCode.replace(/-/g, '');

            // 1. 超级 AI 无码 (LTX)
            const hasLtx = /(?:^|[^A-Z0-9])LTX(?:[^A-Z0-9]|$)/i.test(upperTitle);
            if (hasLtx) {
                tags.push({ label: 'AI无码', type: 'ai' });
            }

            // 2. 紧跟在番号后的常见后缀，如 SSIS-001-C / SSIS-001-U / SSIS-001-UC / SSIS001C
            let hasC = false;
            let hasU = false;
            const codePatterns = [upperCode, compactCode].filter(Boolean);
            for (const cp of codePatterns) {
                const suffixRegex = new RegExp(`${this.escapeRegExp(cp)}[-_. ]?(UC|CU|C|U)(?=$|[^A-Z0-9])`, 'i');
                const m = upperTitle.match(suffixRegex);
                if (m) {
                    const suffix = m[1].toUpperCase();
                    if (suffix.includes('C')) hasC = true;
                    if (suffix.includes('U')) hasU = true;
                }
            }

            // 独立标记或中文关键词兜底（若已命中 LTX，不再仅因“无码”二字重复打破解无码）
            if (/(?:^|[\s[\](_-])(UC|CU)(?=$|[\s[\])_.-])/i.test(upperTitle)) {
                hasC = true;
                hasU = true;
            }
            if (!hasC && (/(?:^|[\s[\](_-])C(?=$|[\s[\])_.-])/i.test(upperTitle) || /中字|中文字幕|字幕/.test(title))) {
                hasC = true;
            }
            const uChineseRegex = hasLtx ? /破解|流出/ : /破解|无码|流出/;
            if (!hasU && (/(?:^|[\s[\](_-])U(?=$|[\s[\])_.-])/i.test(upperTitle) || uChineseRegex.test(title))) {
                hasU = true;
            }

            if (hasU) tags.push({ label: '破解无码', type: 'uncensored' });
            if (hasC) tags.push({ label: '中字', type: 'sub' });

            return tags;
        },

        /**
         * 清洗标题中的常见站点/发布组水印，避免 SIS001 / hhd800.com 等前缀被误识别为番号
         */
        sanitizeCodeSource(text) {
            if (!text) return '';
            return String(text)
                // 移除带顶级域名的站点水印，如 hhd800.com@ / sis001.com@ / [ThZu.Cc] / sex8.cc@
                .replace(/(?:^|[\s@[\]()_.-])[a-z0-9-]+\.(?:com|net|org|cc|tv|me|xyz|info|biz|top|club|vip|site|la|pw|tk|ml|ga|cf|gq|co|io)(?=$|[\s@[\]()_.-])/gi, ' ')
                // 移除常见无连字符站点/编码标识，如 @SIS001@ / HHD800 / XP1024 / X1080X
                .replace(/(?:^|[\s@[\]()_.-])(?:SIS001|HHD800|XP1024|X1080X|H264|H265|X264|X265)(?=$|[\s@[\]()_.-])/gi, ' ');
        },

        /**
         * 统一提取并标准化番号：
         * 1. 先剥离常见站点水印前缀
         * 2. 优先匹配带连字符的标准番号（如 SSIS-858），避免被前置无连字符标识误抢
         * 3. 回退匹配无连字符番号（如 SSIS858 -> SSIS-858）与 n1234 格式
         */
        extractCode(text) {
            const cleaned = this.sanitizeCodeSource(text);
            if (!cleaned) return null;

            const dashedMatch = cleaned.match(CONFIG.dashedCodeRegex);
            if (dashedMatch) {
                return dashedMatch[1].toUpperCase();
            }

            const fallbackMatch = cleaned.match(CONFIG.codeRegex);
            if (!fallbackMatch) return null;

            let code = (fallbackMatch[1] || fallbackMatch[2]).toUpperCase();
            if (!code.includes('-') && /^[A-Z]{2,}/.test(code)) {
                code = code.replace(/([A-Z]+)(\d+)/, '$1-$2');
            }
            return code;
        },

        /**
         * 复制文本：优先使用 GM_setClipboard，兼容非 HTTPS 与失焦场景
         */
        copyText(text) {
            if (!text) return Promise.reject(new Error('空内容'));
            if (typeof GM_setClipboard === 'function') {
                try {
                    GM_setClipboard(text, 'text');
                    return Promise.resolve();
                } catch (e) {
                    // 降级到 navigator.clipboard
                }
            }
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                return navigator.clipboard.writeText(text);
            }
            return Promise.reject(new Error('剪贴板不可用'));
        }
    };

    // ==================== 版本与配置常量 ====================
    const VERSION = (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '4.9.1';

    const CONFIG = {
        defaults: {
            coverWidth: 280,
            pageMaxWidth: 1200,
            maxPagesToFetch: 10
        },
        queue: {
            baseDelay: 1500,
            minRandomDelay: 500,
            maxRandomDelay: 1500,
            maxRequestsPerMinute: 24,
            errorBackoff: 5000,
            maxBackoff: 60000,
            maxTaskRetries: 2
        },
        pagination: {
            maxPageRetries: 3,
            maxConsecutiveEmptyPages: 5
        },
        cache: {
            maxSize: 80
        },
        dashedCodeRegex: /(?<![A-Z0-9])(?!GB|MB|KB|MP|AES|UTF|ISO|SHA|MD5|CPU|GPU|USB|SSD|HDD|RAM|ROM|PDF|CSS|DNS|FTP|HTTP)([A-Z]{2,6}-\d{3,5})(?![A-Z0-9])/i,
        codeRegex: /(?<![A-Z0-9])(?!GB|MB|KB|MP|AES|UTF|ISO|SHA|MD5|CPU|GPU|USB|SSD|HDD|RAM|ROM|PDF|CSS|DNS|FTP|HTTP)([A-Z]{2,6}-?\d{3,5})(?![A-Z0-9])|(?<![A-Z0-9])(n\d{4})(?![A-Z0-9])/i,
        errorCacheExpiry: 5 * 60 * 1000,
        storageKey: 'torrentkitty_settings'
    };

    // ==================== 样式工具函数 ====================
    const StyleUtils = {
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
                    --tk-sage: #186459;
                    --tk-clay: #495968;
                    --tk-terracotta: #963f32;
                    --tk-ochre: #805816;
                    --tk-moss: #205e54;
                    --tk-sand: #f3ecdc;
                    --tk-oat: #fcf8ef;
                    --tk-earth-dark: #4d5b67;
                    --tk-earth-darker: #192630;
                    --tk-loss-red: #963f32;

                    --tk-bg: var(--tk-sand);
                    --tk-card-bg: var(--tk-oat);
                    --tk-card-border: #ded3bf;
                    --tk-control-border: #83939e;
                    --tk-text-main: var(--tk-earth-darker);
                    --tk-text-muted: var(--tk-earth-dark);
                    --tk-primary: var(--tk-sage);
                    --tk-accent-pink: var(--tk-terracotta);
                    --tk-accent-cyan: var(--tk-moss);
                    --tk-success: var(--tk-moss);

                    --tk-font-display: 'Fraunces', serif;
                    --tk-font-body: 'Epilogue', system-ui, 'Microsoft YaHei', sans-serif;
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

                header .login,
                header .login a {
                    color: var(--tk-text-muted) !important;
                }

                header .login a {
                    font-weight: 600;
                    text-decoration: underline;
                    text-underline-offset: 3px;
                }

                #main nav > a.menu {
                    background: #e4f1ee !important;
                    color: var(--tk-moss) !important;
                    border: 1px solid #b6cbc5;
                }

                #main nav > a.menu:hover {
                    background: var(--tk-primary) !important;
                    color: #fff !important;
                }

                header .login a:focus-visible,
                #main nav > a.menu:focus-visible {
                    outline: 2px solid var(--tk-primary);
                    outline-offset: 2px;
                }

                .wrapper {
                    width: 95% !important;
                    max-width: var(--tk-page-max-width, 1200px) !important;
                    margin: 0 auto !important;
                }

                .reco-container,
                .vpn-warning,
                #sticky-banner.sticky-banner,
                body > div.becbdbcf,
                body > div:has(> a[href*="zoog.pro/"]),
                body > a[href*="rapidadexchange.com/"],
                #main .wrapper > div:has(> #rotator1_div),
                .tk-page-clutter {
                    display: none !important;
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
                    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--tk-card-width, 280px)), 1fr));
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
                    background: var(--tk-bg);
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
                    background: linear-gradient(90deg, var(--tk-bg) 25%, var(--tk-card-bg) 50%, var(--tk-bg) 75%);
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
                    z-index: 2;
                }

                /* 版本角标（中字 / 破解无码 / AI无码） */
                .tk-ver-badges {
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 5px;
                    z-index: 3;
                    pointer-events: none;
                }

                .tk-ver-tag {
                    padding: 2px 7px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.2px;
                    line-height: 1.4;
                    box-shadow: 0 2px 6px rgba(25, 38, 48, 0.18);
                }

                .tk-ver-sub {
                    background: #186459;
                    color: #fcf8ef;
                }

                .tk-ver-uncensored {
                    background: #963f32;
                    color: #fcf8ef;
                }

                .tk-ver-ai {
                    background: #805816;
                    color: #fcf8ef;
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
                    gap: 8px;
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
                    font-size: 12px;
                    color: var(--tk-text-muted);
                    font-variant-numeric: tabular-nums;
                }

                .tk-card-title {
                    font-size: 15px;
                    font-weight: 650;
                    color: var(--tk-earth-darker);
                    line-height: 1.5;
                    height: 3em;
                    overflow-wrap: anywhere;
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
                    font-size: 12px;
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

                .tk-btn-magnet, .tk-btn-javdb {
                    background: #e4f1ee;
                    color: var(--tk-moss);
                    border-color: rgba(139, 157, 131, 0.3);
                }
                .tk-btn-magnet:hover {
                    background: var(--tk-sage);
                    color: #fff;
                }

                .tk-btn-missav {
                    background: #fbeeea;
                    color: var(--tk-loss-red);
                    border-color: rgba(198, 107, 61, 0.25);
                }
                .tk-btn-missav:hover {
                    background: var(--tk-terracotta);
                    color: #fff;
                }

                .tk-btn-javdb:hover:not(.disabled) {
                    background: var(--tk-sage);
                    color: #fff;
                }
                .tk-btn-javdb.disabled {
                    background: #edf1f4;
                    color: var(--tk-text-muted);
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
                    background: var(--tk-card-bg);
                    border: 1px solid var(--tk-control-border);
                    color: var(--tk-text-main);
                    border-radius: 8px;
                    padding: 8px 12px;
                    font-size: 13px;
                    transition: all 0.2s;
                }

                .tk-input-modern:focus {
                    border-color: var(--tk-primary);
                }

                .tk-main-container :is(button, a, input):focus-visible,
                .tk-detail-drawer :is(button, a, input):focus-visible {
                    outline: 2px solid var(--tk-primary);
                    outline-offset: 2px;
                }

                #tk-status-banner .tk-toolbar-btn {
                    background: var(--tk-primary);
                    color: #fff;
                    border-color: transparent;
                    margin: 4px 0 4px 12px;
                }

                #tk-status-banner .tk-toolbar-btn:hover {
                    background: #114d45;
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
                    background: var(--tk-bg);
                    border-left: 1px solid var(--tk-card-border);
                    z-index: 99999;
                    box-shadow: -15px 0 40px rgba(61, 50, 38, 0.15);
                    transition: right 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                    padding: 30px 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                    box-sizing: border-box;
                    overflow-y: auto;
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
        debugInfoMap: new Map(),     // code -> debugInfo（替代隐藏 DOM 寄生）
        dispatchedCodes: new Set(),  // 已派发/已完成封面请求的番号集合，避免同番号重复请求
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
        pageRetryCount: 0,
        requestTimestamps: [],
        currentBackoff: 0,
        consecutiveErrors: 0,
        hadProcessedRows: false,
        rowSeq: 0
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
        }
    };

    // ==================== 缓存管理器 ====================
    const CacheManager = {
        STORAGE_KEY: 'tk_javdb_cache',
        ORDER_KEY: 'tk_cache_order',
        EXPIRY_TIME: 24 * 60 * 60 * 1000,
        _orderDirty: false,
        _persistTimer: null,

        init() {
            try {
                const orderData = GM_getValue(this.ORDER_KEY, null);
                if (orderData) {
                    const parsed = typeof orderData === 'string' ? JSON.parse(orderData) : orderData;
                    const now = Date.now();
                    const expired = [];
                    state.cacheOrder = parsed.filter(item => {
                        const isExpired = (now - item.timestamp) >= this.EXPIRY_TIME;
                        if (isExpired) expired.push(item);
                        return !isExpired;
                    });
                    expired.forEach(item => GM_deleteValue(this.STORAGE_KEY + '_' + item.code));
                    if (expired.length > 0) {
                        this._orderDirty = true;
                        this.flushOrder();
                    }
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

        _isEntryExpired(code, entry) {
            if (!entry) return true;
            const now = Date.now();
            if (entry.isError && entry.errorExpiry && now > entry.errorExpiry) {
                return true;
            }
            const orderItem = state.cacheOrder.find(item => item.code === code);
            if (orderItem && (now - orderItem.timestamp) >= this.EXPIRY_TIME) {
                return true;
            }
            return false;
        },

        get(code) {
            if (state.javdbCache[code]) {
                const entry = state.javdbCache[code];
                if (this._isEntryExpired(code, entry)) {
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
                    if (this._isEntryExpired(code, data)) {
                        this.remove(code);
                        return null;
                    }
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
        },

        _updateOrder(code) {
            const now = Date.now();
            const index = state.cacheOrder.findIndex(item => item.code === code);
            if (index !== -1) {
                state.cacheOrder.splice(index, 1);
            }
            state.cacheOrder.push({ code, timestamp: now });
            this._orderDirty = true;
            this._schedulePersistOrder();
        },

        _schedulePersistOrder() {
            if (this._persistTimer) return;
            this._persistTimer = setTimeout(() => {
                this._persistTimer = null;
                this.flushOrder();
            }, 500);
        },

        flushOrder() {
            if (this._persistTimer) {
                clearTimeout(this._persistTimer);
                this._persistTimer = null;
            }
            if (!this._orderDirty) return;
            this._orderDirty = false;
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
            this._orderDirty = true;
            this._schedulePersistOrder();
        },

        remove(code) {
            delete state.javdbCache[code];
            state.cacheOrder = state.cacheOrder.filter(item => item.code !== code);
            GM_deleteValue(this.STORAGE_KEY + '_' + code);
            this._orderDirty = true;
            this._schedulePersistOrder();
        }
    };

    // ==================== 条目缓存管理器 (缓存翻页获取到的条目) ====================
    const EntryCacheManager = {
        STORAGE_PREFIX: 'tk_entry_cache_',
        MAX_ENTRIES: 20,
        EXPIRY_TIME: 60 * 60 * 1000,

        getKey() {
            const url = new URL(window.location.href);
            return this.STORAGE_PREFIX + url.origin + url.pathname + url.search;
        },

        save(validParsedData, fetchPageNum) {
            const dataToCache = validParsedData.map(d => ({
                rowKey: d.rowKey,
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
                if (Date.now() - cacheObj.timestamp > this.EXPIRY_TIME) {
                    GM_deleteValue(this.getKey());
                    return null;
                }
                return cacheObj;
            } catch (e) {
                console.error('[TorrentKitty] 读取条目缓存失败:', e);
                return null;
            }
        },

        cleanupStale() {
            if (typeof GM_listValues !== 'function') return;
            try {
                const now = Date.now();
                const all = GM_listValues()
                    .filter(key => key.startsWith(this.STORAGE_PREFIX))
                    .map(key => {
                        const raw = GM_getValue(key, null);
                        if (!raw) return null;
                        try {
                            const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
                            return { key, timestamp: obj.timestamp || 0 };
                        } catch (e) {
                            return { key, timestamp: 0, corrupt: true };
                        }
                    })
                    .filter(Boolean);

                let deletedCount = 0;
                for (const item of all) {
                    if (item.corrupt || (now - item.timestamp) > this.EXPIRY_TIME) {
                        GM_deleteValue(item.key);
                        deletedCount++;
                    }
                }

                const live = all
                    .filter(item => !item.corrupt && (now - item.timestamp) <= this.EXPIRY_TIME)
                    .sort((a, b) => b.timestamp - a.timestamp);

                if (live.length > this.MAX_ENTRIES) {
                    for (let i = this.MAX_ENTRIES; i < live.length; i++) {
                        GM_deleteValue(live[i].key);
                        deletedCount++;
                    }
                }

                if (deletedCount > 0) {
                    console.log(`[TorrentKitty] 条目缓存清理完成，共删除 ${deletedCount} 条陈旧数据`);
                }
            } catch (e) {
                console.error('[TorrentKitty] 条目缓存清理失败:', e);
            }
        }
    };

    // ==================== 请求队列管理 ====================
    const QueueManager = {
        add(code) {
            if (!code || state.dispatchedCodes.has(code)) return;
            state.dispatchedCodes.add(code);
            state.requestQueue.push({ code, retries: 0 });
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
                    if (banner && (banner.textContent.includes('正在异步') || banner.textContent.includes('排队加载'))) {
                        App.showStatusBanner('封面数据全部加载完成！', true);
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
                await JavDBService.fetchInfo(task.code, task.retries);
                this.resetError();
            } catch (e) {
                console.error('[TorrentKitty] 队列处理错误:', e);
                this.handleError();

                // 限流或验证码允许退避重试；IP 封禁或超过重试次数则直接落入失败态展示
                const canRetry = ['RATE_LIMITED', 'CAPTCHA_DETECTED'].includes(e.message)
                    && task.retries < CONFIG.queue.maxTaskRetries;

                if (canRetry) {
                    task.retries++;
                    state.requestQueue.push(task);
                } else {
                    const debugInfo = state.debugInfoMap.get(task.code) || JavDBService.createDebugInfo(task.code);
                    if (!debugInfo.errorMessage) {
                        debugInfo.errorMessage = e.message || String(e);
                    }
                    UIUpdater.updateCode(task.code, debugInfo, {
                        url: null,
                        coverId: null,
                        fallbackLabel: `[${debugInfo.errorMessage}]`
                    });
                }
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

        async fetchInfo(code, retryAttempt = 0) {
            const debugInfo = this.createDebugInfo(code);
            if (retryAttempt > 0) {
                debugInfo.retryAttempt = retryAttempt;
            }

            const cached = CacheManager.get(code);
            if (cached) {
                state.debugInfoMap.set(code, cached.debugInfo || debugInfo);
                UIUpdater.updateCode(code, cached.debugInfo || debugInfo, cached);
                return;
            }

            try {
                const searchUrl = `https://javdb.com/search?q=${encodeURIComponent(code)}&f=all`;
                debugInfo.fetchUrl = searchUrl;

                const response = await gmFetch(searchUrl);
                debugInfo.fetchStatus = `HTTP ${response.status} ${response.statusText}`;

                if (response.status === 429) {
                    debugInfo.errorMessage = '请求过于频繁 (429)';
                    throw new Error('RATE_LIMITED');
                }

                if (response.status === 403) {
                    debugInfo.errorMessage = 'IP 被封禁 (403)';
                    throw new Error('IP_BANNED');
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await response.text();

                if (html.includes('cf-challenge') || html.includes('captcha')) {
                    debugInfo.errorMessage = '检测到 Cloudflare 挑战/验证码';
                    throw new Error('CAPTCHA_DETECTED');
                }

                const result = this.parseSearchResult(html, code);

                if (result) {
                    debugInfo.foundResult = true;
                    debugInfo.javdbUrl = result.url;
                    debugInfo.coverId = result.coverId;
                    debugInfo.coverUrl = this.getCoverUrl(result.coverId);

                    const payload = { ...result, debugInfo };
                    state.debugInfoMap.set(code, debugInfo);
                    CacheManager.set(code, payload);
                    UIUpdater.updateCode(code, debugInfo, payload);
                } else {
                    debugInfo.errorMessage = '未找到匹配的番号数据';
                    const payload = { url: null, coverId: null, debugInfo };
                    state.debugInfoMap.set(code, debugInfo);
                    CacheManager.set(code, payload);
                    UIUpdater.updateCode(code, debugInfo, payload);
                }
            } catch (error) {
                debugInfo.errorMessage = debugInfo.errorMessage || error.message || String(error);
                state.debugInfoMap.set(code, debugInfo);
                console.error('[TorrentKitty] JavDB 请求出错:', error);

                const isRateOrBan = ['RATE_LIMITED', 'IP_BANNED', 'CAPTCHA_DETECTED'].includes(error.message);
                if (isRateOrBan) {
                    // 实时更新抽屉日志（即使尚未最终放弃，也可在抽屉看到当前状态）
                    UIUpdater.refreshDrawerLogs(code, debugInfo);
                    throw error;
                }

                const payload = {
                    url: null,
                    coverId: null,
                    debugInfo,
                    isError: true,
                    errorExpiry: Date.now() + CONFIG.errorCacheExpiry
                };
                CacheManager.set(code, payload);
                UIUpdater.updateCode(code, debugInfo, {
                    ...payload,
                    fallbackLabel: `[拉取失败: ${debugInfo.errorMessage}]`
                });
            }
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

        parseSearchResult(html, expectedCode) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const firstResult = doc.querySelector('.movie-list a.box');
            if (firstResult?.getAttribute('href')) {
                const href = firstResult.getAttribute('href');

                if (expectedCode) {
                    const resultTitle = firstResult.querySelector('.video-title strong, strong');
                    const resultCode = resultTitle ? resultTitle.textContent.trim().toUpperCase() : '';

                    const pureResult = resultCode.replace(/[^A-Z0-9]/ig, '');
                    const pureExpected = expectedCode.toUpperCase().replace(/[^A-Z0-9]/ig, '');

                    if (pureResult && pureExpected && pureResult !== pureExpected) {
                        const escaped = Utils.escapeRegExp(expectedCode.toUpperCase());
                        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
                        if (!regex.test(resultCode)) {
                            return null;
                        }
                    }
                }

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

            const nameEl = row.querySelector('.name') || row.cells?.[0];
            const nameText = nameEl ? nameEl.textContent.trim() : '未知标题';

            const magnetEl = row.querySelector('a[href^="magnet:"]');
            const magnet = magnetEl ? magnetEl.href : '';

            let size = '未知大小';
            let date = '未知日期';

            if (row.cells && row.cells.length > 0) {
                for (let i = 0; i < row.cells.length; i++) {
                    const txt = (row.cells[i].textContent || '').trim();
                    if (/\d+(\.\d+)?\s*(GB|MB|KB|Bytes)/i.test(txt)) {
                        size = txt;
                    } else if (/\d{4}-\d{2}-\d{2}/.test(txt)) {
                        date = txt;
                    }
                }
            }

            const pageNum = parseInt(row.dataset.pageNum, 10) || state.currentPageNum || 1;

            const downloadBtn = Array.from(row.querySelectorAll('a')).find(el =>
                el.textContent?.includes('Download') || el.href?.includes('action=download')
            );
            const downloadUrl = downloadBtn ? downloadBtn.href : (magnet || '#');

            if (!row.dataset.rowKey) {
                state.rowSeq++;
                row.dataset.rowKey = Utils.buildRowKey(code, magnet, nameText, state.rowSeq);
            }

            return {
                rowKey: row.dataset.rowKey,
                code,
                title: nameText,
                magnet,
                size,
                date,
                downloadUrl,
                pageNum,
                searchText: Utils.getRowText(row),
                versionTags: Utils.detectVersionTags(nameText, code)
            };
        }
    };

    // ==================== 2. 网格容器渲染器 ====================
    const GridContainer = {
        init() {
            if (document.getElementById('tk-modern-grid-root')) return;

            const originalTable = App._findResultTable(document);
            if (!originalTable) return;

            const root = document.createElement('div');
            root.id = 'tk-modern-grid-root';
            root.className = 'tk-main-container';

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

            const grid = document.createElement('div');
            grid.id = 'tk-modern-grid';
            grid.className = 'tk-grid-wrapper';
            root.appendChild(grid);

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

            originalTable.parentNode.insertBefore(root, originalTable);
            originalTable.style.display = 'none';

            overlay.onclick = () => this.closeDrawer();
            document.getElementById('tk-drawer-close-btn').onclick = () => this.closeDrawer();

            const excInput = document.getElementById('tk-add-exclude-input');
            excInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    ExclusionManager.addKeyword(excInput.value);
                    excInput.value = '';
                }
            });

            document.getElementById('tk-btn-config').onclick = () => ModalManager.showSettings();
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

            const copyCodeBtn = document.getElementById('tk-drawer-copy-code');
            copyCodeBtn.onclick = () => {
                Utils.copyText(data.code).then(() => {
                    copyCodeBtn.textContent = '✅ 已复制番号';
                    setTimeout(() => { copyCodeBtn.textContent = '📋 复制番号'; }, 1500);
                }).catch(() => {
                    alert('复制失败，请手动选中番号复制');
                });
            };

            const copyMagnetBtn = document.getElementById('tk-drawer-copy-magnet');
            copyMagnetBtn.onclick = () => {
                if (data.magnet) {
                    Utils.copyText(data.magnet).then(() => {
                        copyMagnetBtn.textContent = '✅ 已复制磁力链';
                        setTimeout(() => { copyMagnetBtn.textContent = '🧲 一键复制磁力链接'; }, 1500);
                    }).catch(() => {
                        alert('复制失败，请手动复制磁力链接');
                    });
                } else {
                    alert('未获取到磁力链接！');
                }
            };

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

    // ==================== 3. 卡片工厂（纯 DOM API 构建，杜绝 XSS & 同番号全展示） ====================
    const CardFactory = {
        createCard(data) {
            const safeKey = data.rowKey.replace(/[^a-zA-Z0-9_-]/g, '');
            const cardId = `tk-card-${safeKey}`;
            let card = document.getElementById(cardId);
            if (card) return card;

            card = document.createElement('div');
            card.id = cardId;
            card.className = 'tk-media-card';
            card.dataset.code = data.code;
            card.dataset.rowKey = data.rowKey;
            card.dataset.searchText = data.searchText || `${data.code} ${data.title} ${data.size} ${data.date}`;

            // 封面区
            const coverWrapper = document.createElement('div');
            coverWrapper.className = 'tk-card-cover-wrapper';

            const skeleton = document.createElement('div');
            skeleton.className = 'tk-skeleton';

            const img = document.createElement('img');
            img.className = 'tk-cover-img';
            img.alt = data.code;

            const fallback = document.createElement('div');
            fallback.className = 'tk-cover-fallback';
            fallback.style.display = 'none';
            fallback.textContent = '[可能需代理/未收录]';

            coverWrapper.append(skeleton, img, fallback);

            // 版本角标（AI无码 / 破解无码 / 中字）
            if (data.versionTags && data.versionTags.length > 0) {
                const badgeWrap = document.createElement('div');
                badgeWrap.className = 'tk-ver-badges';
                data.versionTags.forEach(tag => {
                    const span = document.createElement('span');
                    span.className = `tk-ver-tag tk-ver-${tag.type}`;
                    span.textContent = tag.label;
                    badgeWrap.appendChild(span);
                });
                coverWrapper.appendChild(badgeWrap);
            }

            // 内容区
            const content = document.createElement('div');
            content.className = 'tk-card-content';

            const header = document.createElement('div');
            header.className = 'tk-card-header';

            const codeSpan = document.createElement('span');
            codeSpan.className = 'tk-card-code';
            codeSpan.textContent = data.code;

            const sizeSpan = document.createElement('span');
            sizeSpan.className = 'tk-card-meta';
            sizeSpan.textContent = data.size;

            header.append(codeSpan, sizeSpan);

            const titleDiv = document.createElement('div');
            titleDiv.className = 'tk-card-title';
            titleDiv.title = data.title;
            titleDiv.textContent = data.title;

            const dateDiv = document.createElement('div');
            dateDiv.className = 'tk-card-meta';
            dateDiv.style.marginTop = '-4px';
            dateDiv.textContent = `📅 ${data.date}`;

            // 底部按钮区
            const actions = document.createElement('div');
            actions.className = 'tk-card-actions';

            const magnetBtn = document.createElement('span');
            magnetBtn.className = 'tk-btn-modern tk-btn-magnet';
            magnetBtn.textContent = '🧲 复制磁力';
            magnetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (data.magnet) {
                    Utils.copyText(data.magnet).then(() => {
                        magnetBtn.textContent = '✅ 已复制';
                        setTimeout(() => { magnetBtn.textContent = '🧲 复制磁力'; }, 1500);
                    }).catch(() => {
                        alert('复制失败，请在详情抽屉中手动复制');
                    });
                } else {
                    alert('未获取到磁力链接！');
                }
            });

            const missavAnchor = document.createElement('a');
            missavAnchor.href = `https://missav.ws/cn/${encodeURIComponent(data.code)}`;
            missavAnchor.target = '_blank';
            missavAnchor.rel = 'noopener noreferrer';
            missavAnchor.className = 'tk-btn-modern tk-btn-missav';
            missavAnchor.textContent = '▶ MissAV';
            missavAnchor.addEventListener('click', (e) => e.stopPropagation());

            const javdbAnchor = document.createElement('a');
            javdbAnchor.href = '#';
            javdbAnchor.target = '_blank';
            javdbAnchor.rel = 'noopener noreferrer';
            javdbAnchor.className = 'tk-btn-modern tk-btn-javdb disabled';
            javdbAnchor.textContent = '🔗 JavDB';
            javdbAnchor.addEventListener('click', (e) => {
                e.stopPropagation();
                if (javdbAnchor.classList.contains('disabled')) {
                    e.preventDefault();
                }
            });

            actions.append(magnetBtn, missavAnchor, javdbAnchor);
            content.append(header, titleDiv, dateDiv, actions);
            card.append(coverWrapper, content);

            // 点击整个卡片展示右侧抽屉
            card.addEventListener('click', () => {
                const debugInfo = state.debugInfoMap.get(data.code) || null;
                GridContainer.showDrawer(data, debugInfo);
            });

            // 如果该番号已有缓存或已有结果，立刻同步到新卡片
            const cached = CacheManager.get(data.code);
            if (cached) {
                UIUpdater.applyToCard(card, cached.debugInfo || state.debugInfoMap.get(data.code) || {}, cached);
            }

            return card;
        }
    };

    // ==================== 4. UI 更新器 ====================
    const UIUpdater = {
        PLACEHOLDER_FAILED: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='150'%3E%3Crect width='100%25' height='100%25' fill='%23D4B895'/%3E%3Ctext x='50%25' y='50%25' font-family='monospace' font-size='12' fill='%239B3B2A' text-anchor='middle' dy='.3em'%3E%E5%9B%BE%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5%3C/text%3E%3C/svg%3E",
        PLACEHOLDER_EMPTY: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='150'%3E%3Crect width='100%25' height='100%25' fill='%23D4B895'/%3E%3Ctext x='50%25' y='50%25' font-family='monospace' font-size='12' fill='%233D3226' text-anchor='middle' dy='.3em'%3E%E6%9C%AA%E6%94%B6%E5%BD%95%3C/text%3E%3C/svg%3E",

        /**
         * 将封面与 JavDB 链接同步到所有同番号卡片
         */
        updateCode(code, debugInfo, result) {
            const payload = result || CacheManager.get(code);
            if (!payload) return;

            const cards = document.querySelectorAll(`.tk-media-card[data-code="${CSS.escape(code)}"]`);
            cards.forEach(card => this.applyToCard(card, debugInfo, payload));

            this.refreshDrawerLogs(code, debugInfo);
        },

        applyToCard(card, debugInfo, payload) {
            const { url, coverId, fallbackLabel } = payload;
            const img = card.querySelector('.tk-cover-img');
            const skeleton = card.querySelector('.tk-skeleton');
            const fallback = card.querySelector('.tk-cover-fallback');
            const javdbBtn = card.querySelector('.tk-btn-javdb');

            if (javdbBtn) {
                if (url) {
                    javdbBtn.href = url;
                    javdbBtn.classList.remove('disabled');
                } else {
                    javdbBtn.href = '#';
                    javdbBtn.classList.add('disabled');
                }
            }

            if (img && skeleton) {
                if (coverId) {
                    const coverUrl = JavDBService.getCoverUrl(coverId);
                    img.onload = () => {
                        if (debugInfo) debugInfo.imageLoadSuccess = true;
                        img.classList.add('loaded');
                        skeleton.style.display = 'none';
                        if (fallback) fallback.style.display = 'none';
                    };
                    img.onerror = () => {
                        if (debugInfo) debugInfo.imageLoadSuccess = false;
                        img.onerror = null;
                        img.src = this.PLACEHOLDER_FAILED;
                        img.classList.add('loaded');
                        skeleton.style.display = 'none';
                        if (fallback) {
                            fallback.textContent = fallbackLabel || '[可能需代理/图片加载失败]';
                            fallback.style.display = 'block';
                        }
                    };
                    img.src = coverUrl;
                } else {
                    img.src = fallbackLabel ? this.PLACEHOLDER_FAILED : this.PLACEHOLDER_EMPTY;
                    if (debugInfo) debugInfo.imageLoadSuccess = false;
                    img.classList.add('loaded');
                    skeleton.style.display = 'none';
                    if (fallback && fallbackLabel) {
                        fallback.textContent = fallbackLabel;
                        fallback.style.display = 'block';
                    }
                }
            }
        },

        refreshDrawerLogs(code, debugInfo) {
            const activeDrawerCode = document.getElementById('tk-drawer-code');
            if (activeDrawerCode && activeDrawerCode.textContent === code) {
                const logsPre = document.getElementById('tk-drawer-logs');
                if (logsPre && debugInfo) {
                    logsPre.textContent = ModalManager.formatDebugInfo(debugInfo);
                }
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

        createButton(text, onClick) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.className = 'tk-toolbar-btn';
            btn.style.margin = '0 0 0 8px';
            if (onClick) btn.onclick = onClick;
            return btn;
        },

        formatDebugInfo(debugInfo) {
            const retryLine = debugInfo.retryAttempt ? `\n[+] 重试轮次: 第 ${debugInfo.retryAttempt} 次` : '';
            return `>> SYSTEM DIAGNOSTICS: JAVDB MODULE
============================================================
[+] 番号: ${debugInfo.code}
[+] 时间戳: ${debugInfo.timestamp}
[+] 请求地址: ${debugInfo.fetchUrl}
[+] HTTP 状态: ${debugInfo.fetchStatus}${retryLine}
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
                            <span style="color: var(--tk-moss); font-weight: 700;"><span id="page-width-value">${state.settings.pageMaxWidth || CONFIG.defaults.pageMaxWidth}</span> PX</span>
                        </label>
                        <input type="range" id="page-width-slider" class="tk-slider" min="1000" max="1800" step="50" value="${state.settings.pageMaxWidth || CONFIG.defaults.pageMaxWidth}">
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; justify-content: space-between; font-size: 13px; color: var(--tk-text-muted); margin-bottom: 8px;">
                            <span>自动翻页加载最大页数</span>
                            <span style="color: var(--tk-accent-pink); font-weight: 700;"><span id="pages-value">${state.settings.maxPagesToFetch || CONFIG.defaults.maxPagesToFetch}</span> 页</span>
                        </label>
                        <input type="range" id="pages-slider" class="tk-slider" min="1" max="30" value="${state.settings.maxPagesToFetch || CONFIG.defaults.maxPagesToFetch}">
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

            pageWidthSlider.oninput = () => { pageWidthValue.textContent = pageWidthSlider.value; };
            pagesSlider.oninput = () => { pagesValue.textContent = pagesSlider.value; };
            widthSlider.oninput = () => { widthValue.textContent = widthSlider.value; };

            const resetBtn = this.createButton('重置', () => {
                pageWidthSlider.value = CONFIG.defaults.pageMaxWidth;
                pageWidthValue.textContent = CONFIG.defaults.pageMaxWidth;
                pagesSlider.value = CONFIG.defaults.maxPagesToFetch;
                pagesValue.textContent = CONFIG.defaults.maxPagesToFetch;
                widthSlider.value = CONFIG.defaults.coverWidth;
                widthValue.textContent = CONFIG.defaults.coverWidth;
            });

            const saveBtn = this.createButton('保存', () => {
                state.settings.pageMaxWidth = parseInt(pageWidthSlider.value, 10);
                state.settings.maxPagesToFetch = parseInt(pagesSlider.value, 10);
                state.settings.coverWidth = parseInt(widthSlider.value, 10);
                SettingsManager.save();
                UIUpdater.updateAllCovers();
                overlay.remove();
            });

            buttonsContainer.append(resetBtn, saveBtn);
        }
    };

    // ==================== 6. 排除关键字管理器 ====================
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

        isTextExcluded(text) {
            if (!text || state.excludeKeywords.length === 0) return false;
            return state.excludeKeywords.some(kw => kw && text.includes(kw));
        },

        applyExclusion() {
            const cards = document.querySelectorAll('.tk-media-card');
            cards.forEach(card => {
                const searchText = card.dataset.searchText || '';
                const isExcluded = this.isTextExcluded(searchText);
                card.style.display = isExcluded ? 'none' : '';
                card.dataset.excluded = isExcluded ? 'true' : 'false';
            });

            // 同步更新隐藏行的排除状态，保留 validCode 以便随时恢复
            const rows = App.getResultRows();
            rows.forEach(row => {
                if (!row.dataset.validCode) return;
                const isExcluded = this.isTextExcluded(Utils.getRowText(row));
                if (isExcluded) {
                    row.dataset.excluded = 'true';
                } else {
                    delete row.dataset.excluded;
                }
            });

            App.updateVisibleCount();
            App.checkPaginationAndDispatch();
        },

        updateList() {
            const container = document.getElementById('tk-exclude-tags-container');
            if (!container) return;
            container.textContent = '';

            state.excludeKeywords.forEach(kw => {
                const tag = document.createElement('span');
                tag.className = 'tk-tag';

                const labelSpan = document.createElement('span');
                labelSpan.textContent = `🛡️ ${kw}`;

                const delSpan = document.createElement('span');
                delSpan.className = 'tk-tag-del';
                delSpan.textContent = '×';
                delSpan.addEventListener('click', () => this.removeKeyword(kw));

                tag.append(labelSpan, delSpan);
                container.appendChild(tag);
            });
        }
    };

    // ==================== 主逻辑 ====================
    const App = {
        createVirtualRow(data) {
            const tr = document.createElement('tr');
            tr.dataset.validCode = data.code;
            if (data.rowKey) tr.dataset.rowKey = data.rowKey;
            tr.dataset.isVirtual = 'true';
            tr.dataset.pageNum = data.pageNum || 1;
            tr.style.display = 'none';

            const tdName = document.createElement('td');
            tdName.className = 'name';
            tdName.textContent = data.title;
            tr.appendChild(tdName);

            const tdSize = document.createElement('td');
            tdSize.textContent = data.size;
            tr.appendChild(tdSize);

            const tdDate = document.createElement('td');
            tdDate.textContent = data.date;
            tr.appendChild(tdDate);

            const tdAction = document.createElement('td');
            tdAction.className = 'action';

            const aMagnet = document.createElement('a');
            aMagnet.href = data.magnet;
            aMagnet.textContent = 'Magnet';
            tdAction.appendChild(aMagnet);

            const aDownload = document.createElement('a');
            aDownload.href = data.downloadUrl;
            aDownload.textContent = 'Download';
            tdAction.appendChild(aDownload);

            tr.appendChild(tdAction);
            return tr;
        },

        _findResultTable(doc = document) {
            return doc.querySelector('table#archiveResult')
                || doc.querySelector('table.results')
                || doc.querySelector('.search-results table');
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
                    (el.textContent?.includes('Download')) || el.value === 'Download'
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
                return parseInt(pathParts[2], 10) || 1;
            }
            const activePageEl = document.querySelector('.pagination .active, .pagination strong, .pages .current');
            if (activePageEl) {
                const num = parseInt(activePageEl.textContent, 10);
                if (!isNaN(num)) return num;
            }
            return 1;
        },

        getNextPageUrl(pageNum) {
            const url = new URL(window.location.href);
            const paginationLinks = document.querySelectorAll('.pagination a[href], .pages a[href]');
            for (const link of paginationLinks) {
                const href = link.getAttribute('href');
                if (!href) continue;
                const linkUrl = new URL(href, url);
                if (linkUrl.origin !== url.origin) continue;
                const linkPage = linkUrl.pathname.split('/').filter(Boolean).pop();
                if (linkPage === String(pageNum)) return linkUrl.href;
            }

            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts[0] === 'search' && pathParts[1]) {
                if (/^\d+$/.test(pathParts[2] || '')) {
                    pathParts[2] = String(pageNum);
                } else {
                    pathParts.splice(2, 0, String(pageNum));
                }
                url.pathname = '/' + pathParts.join('/');
                url.hash = '';
                return url.href;
            }
            return null;
        },

        processRows() {
            document.querySelectorAll('#main .wrapper > p, #main .wrapper > div > style').forEach(node => {
                if (node.tagName === 'P' && /^Latest Search\s*:/i.test(node.textContent.trim())) {
                    node.classList.add('tk-page-clutter');
                } else if (node.tagName === 'STYLE' && node.textContent.includes('#M230766ScriptRoot')) {
                    node.parentElement.classList.add('tk-page-clutter');
                }
            });
            GridContainer.init();

            const resultRows = this.getResultRows();
            const validParsedData = [];
            const hadProcessedBefore = state.hadProcessedRows === true;

            resultRows.forEach(row => {
                try {
                    const rowText = Utils.getRowText(row);

                    if (!row.dataset.validCode) {
                        const code = Utils.extractCode(rowText);
                        if (!code) {
                            row.style.display = 'none';
                            return;
                        }
                        row.dataset.validCode = code;
                    }

                    const isExcluded = ExclusionManager.isTextExcluded(rowText);
                    if (isExcluded) {
                        row.dataset.excluded = 'true';
                    } else {
                        delete row.dataset.excluded;
                    }

                    const data = DataParser.parseRow(row);
                    if (data) {
                        data.isExcluded = isExcluded;
                        validParsedData.push(data);
                    }
                } catch (e) {
                    console.error('[TorrentKitty] 处理行时出错:', e, row);
                }
            });

            // 渲染网格（所有有效资源均保留展示，排除项仅隐藏而非销毁）
            const grid = document.getElementById('tk-modern-grid');
            if (grid) {
                let lastRowPageNum = null;

                validParsedData.forEach(data => {
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
                    if (card) {
                        card.style.display = data.isExcluded ? 'none' : '';
                        card.dataset.excluded = data.isExcluded ? 'true' : 'false';
                        if (card.parentNode !== grid) {
                            grid.appendChild(card);
                        }
                    }
                });
            }

            this.updateVisibleCount();

            // 保存条目列表缓存
            EntryCacheManager.save(validParsedData, state.fetchPageNum);

            // 首次解析完已知行后立刻派发队列，让现有番号封面与后续翻页并行
            if (!hadProcessedBefore) {
                state.hadProcessedRows = true;
                this.dispatchQueue();
            }

            this.checkPaginationAndDispatch();
        },

        /**
         * 严格以实际可见卡片数量为准，杜绝计数与页面脱节
         */
        getVisibleCardsCount() {
            return document.querySelectorAll('.tk-media-card:not([data-excluded="true"])').length;
        },

        updateVisibleCount() {
            const totalCountBadge = document.getElementById('tk-total-count');
            if (totalCountBadge) {
                totalCountBadge.textContent = `${this.getVisibleCardsCount()} 条项目`;
            }
        },

        showStatusBanner(text, showContinueBtn = false) {
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

            banner.textContent = '';
            const textSpan = document.createElement('span');
            textSpan.textContent = text;
            banner.appendChild(textSpan);

            if (showContinueBtn) {
                const btn = document.createElement('button');
                btn.textContent = '加载更多';
                btn.className = 'tk-toolbar-btn';
                btn.onclick = () => {
                    state.pageRetryCount = 0;
                    state.consecutiveEmptyPages = 0;
                    state.targetValidCount = this.getVisibleCardsCount() + 8;
                    this.showStatusBanner('正在拉取数据...', false);
                    this.checkPaginationAndDispatch();
                };
                banner.appendChild(btn);
            }

            banner.style.display = 'block';
            banner.style.opacity = '1';
        },

        checkPaginationAndDispatch() {
            if (state.isFetchingPage) return;

            const visibleCount = this.getVisibleCardsCount();
            if (visibleCount < state.targetValidCount) {
                if (state.fetchPageNum - state.currentPageNum >= (state.settings.maxPagesToFetch || CONFIG.defaults.maxPagesToFetch)) {
                    this.showStatusBanner(`已加载至页数限制阈值。当前展示项目: ${visibleCount} 条`, true);
                    this.dispatchQueue();
                    return;
                }

                state.fetchPageNum++;
                this.loadNextPage(state.fetchPageNum);
            } else {
                this.showStatusBanner(`共收集到 ${visibleCount} 条项目，正在异步加载封面数据...`, true);
                this.dispatchQueue();
            }
        },

        dispatchQueue() {
            const visibleCards = document.querySelectorAll('.tk-media-card:not([data-excluded="true"])');
            visibleCards.forEach(card => {
                const code = card.dataset.code;
                if (!code) return;

                const cached = CacheManager.get(code);
                if (cached) {
                    UIUpdater.applyToCard(card, cached.debugInfo || state.debugInfoMap.get(code) || {}, cached);
                    return;
                }

                QueueManager.add(code);
            });

            if (state.requestQueue.length === 0 && !state.isProcessing) {
                this.showStatusBanner('封面数据已从本地缓存全部加载完成！', true);
            }
        },

        loadNextPage(pageNum) {
            const nextUrl = this.getNextPageUrl(pageNum);
            if (!nextUrl) {
                console.warn(`[TorrentKitty] 无法解析第 ${pageNum} 页 URL`, window.location.href);
                this.showStatusBanner(`已无更多页面或无法解析翻页链接。当前累计项目: ${this.getVisibleCardsCount()} 条`, true);
                this.dispatchQueue();
                return;
            }

            this.showStatusBanner(`正在载入第 ${pageNum} 页数据以补充卡片... (当前展示项目: ${this.getVisibleCardsCount()}/${state.targetValidCount})`);
            state.isFetchingPage = true;

            gmFetch(nextUrl).then(response => {
                if (response.status === 404 || response.status === 410) {
                    const err = new Error('NO_MORE_PAGES');
                    err.status = response.status;
                    throw err;
                }
                if (response.status === 403) {
                    const err = new Error('ACCESS_DENIED');
                    err.status = response.status;
                    throw err;
                }
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            }).then(html => {
                state.pageRetryCount = 0;

                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const nextRows = this.getResultRows(doc);

                const resultsTable = this.getResultsTable();
                if (!resultsTable) {
                    console.error('[TorrentKitty] 已获取翻页响应，但当前页找不到结果表格容器');
                    state.isFetchingPage = false;
                    state.fetchPageNum = Math.max(state.currentPageNum, pageNum - 1);
                    this.showStatusBanner('已获取下一页，但无法识别结果表格。请检查页面结构或脚本版本。', true);
                    return;
                }

                let addedCount = 0;
                nextRows.forEach(row => {
                    const rowText = Utils.getRowText(row);
                    if (Utils.extractCode(rowText)) {
                        const importedRow = document.importNode(row, true);
                        importedRow.dataset.pageNum = pageNum;
                        importedRow.style.display = 'none';
                        resultsTable.appendChild(importedRow);
                        if (!ExclusionManager.isTextExcluded(rowText)) {
                            addedCount++;
                        }
                    }
                });

                state.isFetchingPage = false;
                if (addedCount === 0) {
                    state.consecutiveEmptyPages++;
                    if (state.consecutiveEmptyPages >= CONFIG.pagination.maxConsecutiveEmptyPages) {
                        this.showStatusBanner(`由于连续 ${CONFIG.pagination.maxConsecutiveEmptyPages} 页未探测到有效番号资源，停止自动追加。`, true);
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
                state.fetchPageNum = Math.max(state.currentPageNum, pageNum - 1);

                if (error.message === 'NO_MORE_PAGES') {
                    this.showStatusBanner(`已到达最后一页。当前累计项目: ${this.getVisibleCardsCount()} 条`, false);
                    this.dispatchQueue();
                    return;
                }

                if (error.message === 'ACCESS_DENIED') {
                    this.showStatusBanner(`翻页请求被站点拦截 (HTTP 403)，已停止自动翻页。`, true);
                    this.dispatchQueue();
                    return;
                }

                state.pageRetryCount++;
                console.error(`[TorrentKitty] 自动翻页错误 (第 ${state.pageRetryCount} 次):`, error);

                if (state.pageRetryCount > CONFIG.pagination.maxPageRetries) {
                    this.showStatusBanner(`拉取第 ${pageNum} 页连续失败 ${CONFIG.pagination.maxPageRetries} 次，已停止自动重试。`, true);
                    this.dispatchQueue();
                    return;
                }

                this.showStatusBanner(`拉取第 ${pageNum} 页失败 (${state.pageRetryCount}/${CONFIG.pagination.maxPageRetries})，3 秒后重试...`);
                setTimeout(() => {
                    this.checkPaginationAndDispatch();
                }, 3000);
            });
        },

        init() {
            StyleUtils.injectGlobalStyles();
            SettingsManager.load();
            CacheManager.init();
            EntryCacheManager.cleanupStale();

            state.currentPageNum = this.getCurrentPageNum();
            state.fetchPageNum = state.currentPageNum;

            // 恢复已缓存的翻页条目（按磁力 BTIH / rowKey 精确去重，不再吞同番号不同版本）
            const cachedEntries = EntryCacheManager.load();
            if (cachedEntries && cachedEntries.data && cachedEntries.data.length > 0) {
                const resultsTable = this.getResultsTable();
                if (resultsTable) {
                    const existingRows = this.getResultRows();
                    const existingKeys = new Set(existingRows.map((row, idx) => {
                        const rowText = Utils.getRowText(row);
                        const code = Utils.extractCode(rowText);
                        if (!code) return '';
                        const magnet = row.querySelector('a[href^="magnet:"]')?.href || '';
                        const title = (row.querySelector('.name') || row.cells?.[0])?.textContent?.trim() || '';
                        return Utils.buildRowKey(code, magnet, title, idx + 1);
                    }).filter(Boolean));

                    let restoreCount = 0;
                    cachedEntries.data.forEach((item, idx) => {
                        const fixedCode = Utils.extractCode(item.title) || item.code;
                        const fixedItem = fixedCode !== item.code
                            ? { ...item, code: fixedCode, rowKey: Utils.buildRowKey(fixedCode, item.magnet, item.title, idx + 1) }
                            : item;
                        const key = fixedItem.rowKey || Utils.buildRowKey(fixedItem.code, fixedItem.magnet, fixedItem.title, idx + 1);
                        if (!existingKeys.has(key)) {
                            existingKeys.add(key);
                            const vRow = this.createVirtualRow({ ...fixedItem, rowKey: key });
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
                // 排除脚本自身容器与已隐藏的原站结果表格，避免自我触发风暴
                const hasRelevantChanges = mutations.some(m =>
                    m.target.nodeType === 1 &&
                    !m.target.closest?.('.tk-main-container') &&
                    !m.target.closest?.('.tk-detail-drawer') &&
                    !m.target.closest?.('.tk-drawer-overlay') &&
                    !m.target.closest?.('table#archiveResult, table.results, .search-results')
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
            CacheManager.flushOrder();
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init(), { once: true });
    } else {
        App.init();
    }

    window.addEventListener('beforeunload', () => App.cleanup());

})();
