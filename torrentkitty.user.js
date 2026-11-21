// ==UserScript==
// @name         TorrentKitty to MissAV & JavDB with Cover + Settings
// @namespace    http://tampermonkey.net/
// @version      5.0.4
// @description  TorrentKitty 增强：卡片化网格浏览流、三源高清封面分摊与熔断、两级图文收藏夹与本地 WebP 分片缓存、CF Worker+D1 端到端加密云同步 (Organic 配色版)
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
// @connect      fourhoi.com
// @connect      www.jav321.com
// @connect      jav321.com
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
// @connect      *
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
            const ctx = (this === undefined || this === null) ? pageWindow : this;
            return Reflect.apply(openPopup, ctx, [url, ...args]);
        };
    }

    // 跳过站点延迟推广点击劫持，保留原生磁力链接行为
    window.addEventListener('click', event => {
        if (event.target?.closest?.('a[href^="magnet:"]')) {
            event.stopImmediatePropagation();
        }
    }, true);

    // ==================== GM_xmlhttpRequest Promise 封装 ====================
    function gmRequest(url, options = {}) {
        const {
            method = 'GET',
            headers = {},
            data = undefined,
            responseType = 'text',
            timeout = 20000
        } = options;
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('缺少 GM_xmlhttpRequest 权限'));
                return;
            }
            GM_xmlhttpRequest({
                method,
                url,
                headers,
                data,
                responseType: responseType === 'text' ? undefined : responseType,
                timeout,
                onload: (response) => {
                    const rawText = typeof response.responseText === 'string' ? response.responseText : '';
                    resolve({
                        ok: response.status >= 200 && response.status < 300,
                        status: response.status,
                        statusText: response.statusText,
                        finalUrl: response.finalUrl || url,
                        response: response.response,
                        responseHeaders: response.responseHeaders || '',
                        text: () => Promise.resolve(rawText),
                        json: () => Promise.resolve().then(() => JSON.parse(rawText)),
                        blob: () => Promise.resolve(response.response instanceof Blob ? response.response : new Blob([response.response || rawText])),
                        arrayBuffer: () => Promise.resolve(
                            response.response instanceof ArrayBuffer
                                ? response.response
                                : (ArrayBuffer.isView(response.response)
                                    ? response.response.buffer.slice(response.response.byteOffset, response.response.byteOffset + response.response.byteLength)
                                    : new TextEncoder().encode(rawText).buffer)
                        )
                    });
                },
                onerror: () => reject(new Error('网络请求失败')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    function gmFetch(url, extraHeaders = {}) {
        return gmRequest(url, {
            method: 'GET',
            timeout: 15000,
            headers: {
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                ...extraHeaders
            }
        });
    }

    // ==================== 同源原生 Fetch 封装（优先复用标签页 Cookie 与安全头） ====================
    async function sameOriginFetch(url) {
        let targetUrl;
        try {
            targetUrl = new URL(url, window.location.href);
        } catch {
            return gmFetch(url);
        }

        if (targetUrl.origin !== window.location.origin) {
            return gmFetch(url);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(targetUrl.href, {
                method: 'GET',
                credentials: 'same-origin',
                referrer: window.location.href,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                signal: controller.signal
            });
            clearTimeout(timer);
            return {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                finalUrl: response.url || targetUrl.href,
                text: () => response.text()
            };
        } catch (err) {
            clearTimeout(timer);
            if (err && err.name === 'AbortError') {
                throw new Error('请求超时');
            }
            // 同源跳转若发生跨域重定向被 CORS 拦截，再降级到 GM_xmlhttpRequest
            console.warn('[TorrentKitty] 同源 fetch 异常，尝试降级 GM_xmlhttpRequest:', err);
            return gmFetch(url, { Referer: window.location.href });
        }
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
    const VERSION = (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '5.0.4';

    const CONFIG = {
        defaults: {
            coverWidth: 280,
            pageMaxWidth: 1200,
            maxPagesToFetch: 10,
            coverSourceMode: 'jav321_first'
        },
        queue: {
            baseDelay: 2500,
            minRandomDelay: 800,
            maxRandomDelay: 2200,
            maxRequestsPerMinute: 12,
            missavDelay: 120,
            jav321Delay: 350,
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

                /* JavDB 登录/验证提醒条 */
                .tk-javdb-notice {
                    display: none;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin: 0 0 18px 0;
                    padding: 12px 16px;
                    border-radius: 12px;
                    font-family: var(--tk-font-body);
                    font-size: 13px;
                    line-height: 1.5;
                    box-shadow: 0 4px 14px rgba(61, 50, 38, 0.06);
                    transition: all 0.25s ease;
                }

                .tk-javdb-notice.is-visible {
                    display: flex;
                }

                .tk-javdb-notice--info {
                    background: #fbf4e4;
                    border: 1px solid rgba(128, 88, 22, 0.28);
                    color: #5a4218;
                }

                .tk-javdb-notice--warning {
                    background: #fdf0ec;
                    border: 1px solid rgba(150, 63, 50, 0.35);
                    color: #7a2e23;
                }

                .tk-javdb-notice-text {
                    flex: 1 1 260px;
                    font-weight: 500;
                }

                .tk-javdb-notice-actions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .tk-javdb-notice-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 6px 12px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    text-decoration: none;
                    border: 1px solid transparent;
                    transition: all 0.2s ease;
                }

                .tk-javdb-notice-btn--primary {
                    background: #805816;
                    color: #fcf8ef !important;
                }

                .tk-javdb-notice--warning .tk-javdb-notice-btn--primary {
                    background: #963f32;
                }

                .tk-javdb-notice-btn--primary:hover {
                    filter: brightness(1.08);
                    transform: translateY(-1px);
                }

                .tk-javdb-notice-btn--secondary {
                    background: rgba(255, 255, 255, 0.72);
                    color: inherit;
                    border-color: rgba(61, 50, 38, 0.2);
                }

                .tk-javdb-notice-btn--secondary:hover {
                    background: rgba(255, 255, 255, 0.95);
                }

                .tk-javdb-notice-btn--ghost {
                    background: transparent;
                    color: inherit;
                    opacity: 0.75;
                    padding: 6px 8px;
                }

                .tk-javdb-notice-btn--ghost:hover {
                    opacity: 1;
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

                /* 卡片操作按钮（2x2 网格：复制磁力 / 收藏 / MissAV / JavDB） */
                .tk-card-actions {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                    margin-top: auto;
                    padding-top: 4px;
                }

                .tk-btn-modern {
                    padding: 8px 6px;
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
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    font-family: inherit;
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

                .tk-btn-fav {
                    background: #fbf4e4;
                    color: #805816;
                    border-color: rgba(128, 88, 22, 0.28);
                }
                .tk-btn-fav:hover {
                    background: #805816;
                    color: #fcf8ef;
                }
                .tk-btn-fav.is-favorited {
                    background: #805816;
                    border-color: #6b4810;
                    color: #fcf8ef;
                }
                .tk-btn-fav.is-favorited:hover {
                    background: #96681b;
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
                    flex-wrap: wrap;
                    gap: 10px;
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

                #tk-status-banner .tk-toolbar-btn--secondary {
                    background: rgba(255, 255, 255, 0.72);
                    color: var(--tk-text-main);
                    border-color: var(--tk-card-border);
                }

                #tk-status-banner .tk-toolbar-btn--secondary:hover {
                    background: rgba(255, 255, 255, 0.95);
                    border-color: var(--tk-primary);
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

                /* 挂载于 document.body 的动态定位选夹气泡 */
                .tk-fav-popover {
                    position: fixed;
                    z-index: 100020;
                    width: 248px;
                    max-width: calc(100vw - 16px);
                    background: #fcf8ef;
                    border: 1px solid var(--tk-card-border);
                    border-radius: 14px;
                    padding: 12px;
                    box-shadow: 0 14px 36px rgba(25, 38, 48, 0.24);
                    display: flex;
                    flex-direction: column;
                    gap: 9px;
                    box-sizing: border-box;
                    font-family: var(--tk-font-body);
                }

                .tk-fav-popover-title {
                    font-size: 12px;
                    font-weight: 700;
                    color: var(--tk-text-muted);
                }

                .tk-fav-popover-cats {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    max-height: 160px;
                    overflow-y: auto;
                }

                .tk-fav-cat-chip {
                    padding: 5px 10px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    border: 1px solid var(--tk-card-border);
                    background: rgba(243, 236, 220, 0.7);
                    color: var(--tk-earth-darker);
                    cursor: pointer;
                    transition: all 0.15s ease;
                }

                .tk-fav-cat-chip:hover {
                    border-color: var(--tk-sage);
                }

                .tk-fav-cat-chip.is-active {
                    background: var(--tk-sage);
                    border-color: var(--tk-sage);
                    color: #fff;
                }

                .tk-fav-popover-new {
                    display: flex;
                    gap: 6px;
                }

                .tk-fav-popover-new input {
                    flex: 1;
                    min-width: 0;
                    padding: 6px 8px;
                    border-radius: 7px;
                    border: 1px solid var(--tk-control-border);
                    font-size: 12px;
                    background: #fff;
                    color: var(--tk-text-main);
                }

                .tk-fav-popover-new button,
                .tk-fav-popover-remove {
                    padding: 6px 10px;
                    border-radius: 7px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    border: 1px solid transparent;
                    white-space: nowrap;
                }

                .tk-fav-popover-new button {
                    background: var(--tk-sage);
                    color: #fff;
                }

                .tk-fav-popover-remove {
                    background: rgba(150, 63, 50, 0.1);
                    color: var(--tk-loss-red);
                    border-color: rgba(150, 63, 50, 0.25);
                    width: 100%;
                }

                .tk-fav-popover-remove:hover {
                    background: var(--tk-loss-red);
                    color: #fff;
                }

                /* 两级收藏浮层 */
                .tk-fav-modal {
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden !important;
                }

                .tk-fav-modal-body {
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    max-height: calc(90vh - 44px);
                    gap: 12px;
                }

                .tk-fav-modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 10px;
                }

                .tk-fav-modal-title {
                    margin: 0;
                    color: var(--tk-earth-darker);
                    font-weight: 700;
                    font-family: var(--tk-font-display);
                    font-size: 18px;
                }

                .tk-fav-top-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    align-items: center;
                }

                .tk-fav-search-row {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }

                .tk-fav-scroll-area {
                    flex: 1;
                    min-height: 0;
                    overflow-y: auto;
                    padding-right: 4px;
                }

                .tk-fav-search-summary {
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--tk-text-muted);
                    margin-bottom: 10px;
                }

                .tk-fav-empty {
                    text-align: center;
                    padding: 40px 16px;
                    color: var(--tk-text-muted);
                    font-size: 13px;
                    background: rgba(255, 255, 255, 0.45);
                    border-radius: 12px;
                    border: 1px dashed var(--tk-card-border);
                }

                /* 一级视图：收藏夹卡片网格 */
                .tk-fav-folder-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                    gap: 14px;
                }

                .tk-fav-folder-card {
                    background: rgba(252, 248, 239, 0.94);
                    border: 1px solid var(--tk-card-border);
                    border-radius: 14px;
                    overflow: hidden;
                    cursor: pointer;
                    display: flex;
                    flex-direction: column;
                    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
                }

                .tk-fav-folder-card:hover {
                    transform: translateY(-3px);
                    border-color: var(--tk-sage);
                    box-shadow: 0 10px 24px rgba(25, 38, 48, 0.12);
                }

                .tk-fav-folder-card.is-all-card {
                    border-color: rgba(24, 100, 89, 0.35);
                    background: rgba(228, 241, 238, 0.72);
                }

                .tk-fav-folder-collage {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    grid-template-rows: repeat(2, 1fr);
                    gap: 2px;
                    aspect-ratio: 16 / 10;
                    background: rgba(61, 50, 38, 0.08);
                }

                .tk-fav-collage-slot {
                    position: relative;
                    overflow: hidden;
                    background: rgba(243, 236, 220, 0.85);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .tk-fav-collage-slot.is-empty {
                    background: rgba(61, 50, 38, 0.04);
                }

                .tk-fav-collage-slot img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .tk-fav-collage-code {
                    font-family: var(--tk-font-mono);
                    font-size: 10px;
                    font-weight: 700;
                    color: var(--tk-text-muted);
                    padding: 2px 4px;
                    text-align: center;
                    word-break: break-all;
                }

                .tk-fav-folder-info {
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .tk-fav-folder-name-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 6px;
                }

                .tk-fav-folder-name {
                    font-size: 14px;
                    font-weight: 700;
                    color: var(--tk-earth-darker);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .tk-fav-folder-tag {
                    font-size: 10px;
                    font-weight: 700;
                    padding: 2px 6px;
                    border-radius: 9999px;
                    background: rgba(128, 88, 22, 0.14);
                    color: #805816;
                    flex-shrink: 0;
                }

                .tk-fav-folder-tag.is-all {
                    background: rgba(24, 100, 89, 0.16);
                    color: var(--tk-sage);
                }

                .tk-fav-folder-count {
                    font-size: 12px;
                    color: var(--tk-text-muted);
                }

                .tk-fav-folder-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 5px;
                    margin-top: 4px;
                }

                /* 二级视图：图文收藏详情网格 */
                .tk-fav-detail-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 14px;
                }

                .tk-fav-detail-card {
                    background: rgba(252, 248, 239, 0.96);
                    border: 1px solid var(--tk-card-border);
                    border-radius: 14px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .tk-fav-detail-cover {
                    position: relative;
                    width: 100%;
                    aspect-ratio: 16 / 10;
                    background: rgba(61, 50, 38, 0.08);
                    overflow: hidden;
                }

                .tk-fav-detail-img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    cursor: zoom-in;
                    transition: transform 0.25s ease;
                }

                .tk-fav-detail-cover:hover .tk-fav-detail-img {
                    transform: scale(1.03);
                }

                .tk-fav-detail-cover-empty {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    color: var(--tk-text-muted);
                    font-size: 12px;
                }

                .tk-fav-detail-body {
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    flex: 1;
                }

                .tk-fav-item-meta {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 6px;
                }

                .tk-fav-folder-select {
                    margin-left: auto;
                    padding: 3px 8px;
                    border-radius: 6px;
                    border: 1px solid var(--tk-card-border);
                    background: #fff;
                    font-size: 11px;
                    color: var(--tk-text-main);
                    max-width: 130px;
                }

                .tk-fav-detail-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--tk-earth-darker);
                    line-height: 1.45;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    word-break: break-word;
                }

                .tk-fav-magnet-box {
                    background: rgba(61, 50, 38, 0.06);
                    border: 1px solid rgba(61, 50, 38, 0.1);
                    border-radius: 8px;
                    padding: 7px 8px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .tk-fav-magnet-mono {
                    font-family: var(--tk-font-mono);
                    font-size: 11px;
                    line-height: 1.4;
                    color: var(--tk-earth-darker);
                    word-break: break-all;
                    max-height: 46px;
                    overflow-y: auto;
                    user-select: all;
                }

                .tk-fav-magnet-actions {
                    display: flex;
                    gap: 6px;
                    flex-wrap: wrap;
                }

                .tk-fav-item-actions {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 6px;
                    margin-top: auto;
                }

                .tk-fav-mini-btn {
                    padding: 5px 10px;
                    border-radius: 7px;
                    font-size: 11px;
                    font-weight: 700;
                    border: 1px solid var(--tk-card-border);
                    background: rgba(255, 255, 255, 0.85);
                    color: var(--tk-earth-darker);
                    cursor: pointer;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    font-family: inherit;
                }

                .tk-fav-mini-btn:hover {
                    background: var(--tk-sage);
                    color: #fff;
                    border-color: var(--tk-sage);
                }

                .tk-fav-mini-btn.is-primary {
                    background: var(--tk-sage);
                    color: #fff;
                    border-color: var(--tk-sage);
                }

                .tk-fav-mini-btn.is-primary:hover {
                    filter: brightness(1.08);
                }

                .tk-fav-mini-btn.is-danger {
                    color: var(--tk-loss-red);
                    border-color: rgba(150, 63, 50, 0.25);
                }

                .tk-fav-mini-btn.is-danger:hover {
                    background: var(--tk-loss-red);
                    color: #fff;
                }

                /* 同步状态与云同步/备份卡片 */
                .tk-sync-pill {
                    padding: 4px 10px;
                    border-radius: 9999px;
                    font-size: 11px;
                    font-weight: 700;
                    border: 1px solid var(--tk-card-border);
                    background: rgba(255, 255, 255, 0.72);
                    color: var(--tk-text-muted);
                    cursor: pointer;
                }

                .tk-sync-pill.is-synced {
                    background: rgba(24, 100, 89, 0.14);
                    border-color: rgba(24, 100, 89, 0.35);
                    color: var(--tk-sage);
                }

                .tk-sync-pill.is-dirty,
                .tk-sync-pill.is-syncing {
                    background: rgba(128, 88, 22, 0.14);
                    border-color: rgba(128, 88, 22, 0.35);
                    color: #805816;
                }

                .tk-sync-pill.is-error {
                    background: rgba(150, 63, 50, 0.14);
                    border-color: rgba(150, 63, 50, 0.35);
                    color: var(--tk-loss-red);
                }

                .tk-sync-sections {
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                }

                .tk-sync-card {
                    background: rgba(252, 248, 239, 0.9);
                    border: 1px solid var(--tk-card-border);
                    border-radius: 14px;
                    padding: 14px 16px;
                }

                .tk-sync-card-title {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 8px;
                    font-size: 14px;
                    font-weight: 700;
                    color: var(--tk-earth-darker);
                    margin-bottom: 10px;
                }

                .tk-sync-toggle {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .tk-sync-form-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 10px;
                    margin-bottom: 10px;
                }

                .tk-sync-label {
                    display: block;
                    font-size: 11px;
                    font-weight: 600;
                    color: var(--tk-text-muted);
                    margin-bottom: 4px;
                }

                .tk-sync-token-row {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                    margin-bottom: 10px;
                    padding: 8px 10px;
                    background: rgba(61, 50, 38, 0.05);
                    border-radius: 8px;
                }

                .tk-sync-token-code {
                    font-family: var(--tk-font-mono);
                    font-size: 11px;
                    color: var(--tk-moss);
                    background: rgba(255, 255, 255, 0.7);
                    padding: 2px 6px;
                    border-radius: 4px;
                }

                .tk-sync-btn-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }

                .tk-sync-feedback {
                    margin-top: 10px;
                    font-size: 12px;
                    color: var(--tk-text-muted);
                    line-height: 1.5;
                }

                .tk-backup-dropzone {
                    border: 2px dashed rgba(24, 100, 89, 0.35);
                    border-radius: 10px;
                    padding: 16px;
                    text-align: center;
                    font-size: 12px;
                    color: var(--tk-text-muted);
                    background: rgba(255, 255, 255, 0.55);
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .tk-backup-dropzone:hover,
                .tk-backup-dropzone.is-dragover {
                    border-color: var(--tk-sage);
                    background: rgba(228, 241, 238, 0.6);
                }

                .tk-backup-preview {
                    margin-top: 10px;
                    padding: 10px 12px;
                    border-radius: 10px;
                    background: rgba(255, 255, 255, 0.8);
                    border: 1px solid var(--tk-card-border);
                }

                /* 图片灯箱放大预览 */
                .tk-lightbox-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 100050;
                    background: rgba(25, 38, 48, 0.78);
                    backdrop-filter: blur(6px);
                    -webkit-backdrop-filter: blur(6px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }

                .tk-lightbox-content {
                    position: relative;
                    max-width: 92vw;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 10px;
                }

                .tk-lightbox-content img {
                    max-width: 92vw;
                    max-height: 82vh;
                    border-radius: 12px;
                    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
                    object-fit: contain;
                }

                .tk-lightbox-caption {
                    color: #fcf8ef;
                    font-size: 13px;
                    text-align: center;
                    max-width: 80vw;
                    word-break: break-word;
                }

                .tk-lightbox-close {
                    position: absolute;
                    top: -12px;
                    right: -12px;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    border: none;
                    background: #fcf8ef;
                    color: #192630;
                    font-size: 16px;
                    font-weight: 700;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }

                /* 页面下滑后固定在视口最上方右上角的收藏夹悬浮胶囊 */
                .tk-fav-floating-bar {
                    position: fixed;
                    top: 12px;
                    right: 16px;
                    z-index: 9990;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 5px 6px;
                    border-radius: 9999px;
                    background: rgba(252, 248, 239, 0.88);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    border: 1px solid rgba(24, 100, 89, 0.28);
                    box-shadow: 0 8px 24px rgba(25, 38, 48, 0.16);
                    opacity: 0;
                    transform: translateY(-14px);
                    pointer-events: none;
                    transition: opacity 0.22s ease, transform 0.22s ease;
                    font-family: var(--tk-font-body);
                }

                .tk-fav-floating-bar.is-visible {
                    opacity: 1;
                    transform: translateY(0);
                    pointer-events: auto;
                }

                .tk-fav-float-btn,
                .tk-fav-float-top {
                    border: none;
                    border-radius: 9999px;
                    cursor: pointer;
                    font-family: inherit;
                    font-weight: 700;
                    transition: background 0.18s ease, color 0.18s ease, transform 0.15s ease;
                }

                .tk-fav-float-btn {
                    padding: 6px 13px;
                    font-size: 12px;
                    background: var(--tk-sage);
                    color: #fcf8ef;
                }

                .tk-fav-float-btn:hover {
                    background: #114d45;
                }

                .tk-fav-float-top {
                    width: 28px;
                    height: 28px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 13px;
                    background: rgba(61, 50, 38, 0.08);
                    color: var(--tk-earth-darker);
                }

                .tk-fav-float-top:hover {
                    background: rgba(61, 50, 38, 0.16);
                }

                /* 手机窄屏响应式适配 */
                @media (max-width: 640px) {
                    .tk-fav-floating-bar {
                        top: 8px;
                        right: 10px;
                        padding: 4px 5px;
                    }
                    .tk-fav-float-btn {
                        padding: 5px 11px;
                        font-size: 12px;
                    }
                    .tk-main-container {
                        padding: 12px;
                        border-radius: 16px;
                    }
                    .tk-modern-toolbar {
                        padding: 12px;
                        gap: 12px;
                    }
                    .tk-fav-modal {
                        width: 96% !important;
                        padding: 14px !important;
                        max-height: 92vh !important;
                    }
                    .tk-fav-folder-grid,
                    .tk-fav-detail-grid {
                        grid-template-columns: 1fr;
                    }
                    .tk-detail-drawer {
                        width: 100%;
                        right: -100%;
                    }
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
        missavQueue: [],
        jav321Queue: [],
        isProcessing: false,
        isProcessingMissav: false,
        isProcessingJav321: false,
        taskCounter: 0,
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
        rowSeq: 0,
        isPausedForLogin: false,
        javdbBlockedUntil: 0,
        javdbBlockedMessage: '',
        javdbSuccessCount: 0,
        javdbConsecutiveMisses: 0,
        failedCodesForRetry: new Set(),
        javdbNoticeLevel: null,
        favFolders: [],
        favItems: [],
        favLastFolderId: 'default',
        syncStatus: {
            state: 'unconfigured',
            label: '未配置云同步',
            lastSyncAt: 0,
            dirty: false,
            stats: null,
            error: ''
        },
        cardDataMap: new Map(),
        activeDrawerData: null
    };

    // ==================== 设置管理 ====================
    const VALID_COVER_SOURCE_MODES = ['jav321_first', 'missav_first', 'balanced', 'javdb_first', 'no_javdb', 'missav_only'];

    const SettingsManager = {
        load() {
            const saved = GM_getValue(CONFIG.storageKey, null);
            if (saved) {
                try {
                    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                    state.settings = { ...CONFIG.defaults, ...parsed };
                    if (state.settings.coverSourceMode === 'missav_only') {
                        state.settings.coverSourceMode = 'no_javdb';
                    }
                    if (!VALID_COVER_SOURCE_MODES.includes(state.settings.coverSourceMode)) {
                        state.settings.coverSourceMode = CONFIG.defaults.coverSourceMode;
                    }
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
        },

        clearAll() {
            let coverCount = 0;
            let entryCount = 0;

            if (this._persistTimer) {
                clearTimeout(this._persistTimer);
                this._persistTimer = null;
            }
            this._orderDirty = false;

            if (typeof GM_listValues === 'function' && typeof GM_deleteValue === 'function') {
                try {
                    const keys = GM_listValues();
                    keys.forEach(key => {
                        if (key.startsWith(this.STORAGE_KEY + '_')) {
                            GM_deleteValue(key);
                            coverCount++;
                        } else if (key === this.ORDER_KEY) {
                            GM_deleteValue(key);
                        } else if (key.startsWith(EntryCacheManager.STORAGE_PREFIX)) {
                            GM_deleteValue(key);
                            entryCount++;
                        }
                    });
                } catch (e) {
                    console.error('[TorrentKitty] 枚举清理缓存失败:', e);
                }
            } else if (typeof GM_deleteValue === 'function') {
                state.cacheOrder.forEach(item => {
                    GM_deleteValue(this.STORAGE_KEY + '_' + item.code);
                    coverCount++;
                });
                GM_deleteValue(this.ORDER_KEY);
            }

            state.javdbCache = {};
            state.cacheOrder = [];
            state.dispatchedCodes.clear();
            state.failedCodesForRetry.clear();
            state.debugInfoMap.clear();
            state.requestQueue = [];
            state.missavQueue = [];
            state.jav321Queue = [];
            state.javdbSuccessCount = 0;
            state.javdbConsecutiveMisses = 0;

            return { coverCount, entryCount };
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

    // ==================== 收藏夹与分类管理器 (Schema v2 + Tombstone) ====================
    const FavoritesManager = {
        V2_KEY: 'tk_favorites_v2',
        V1_FAVS_KEY: 'tk_favorites_items',
        V1_CATS_KEY: 'tk_favorites_categories',
        V1_LAST_CAT_KEY: 'tk_favorites_last_cat',
        DEFAULT_FOLDER_ID: 'default',
        DEFAULT_FOLDER_NAME: '默认收藏',
        LEGACY_PRESETS: ['默认收藏', '中字精选', '待下载'],

        _hashStr(str) {
            let h = 2166136261;
            const s = String(str || '');
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            return (h >>> 0).toString(36);
        },

        makeLegacyFolderId(name) {
            if (!name || name === this.DEFAULT_FOLDER_NAME) return this.DEFAULT_FOLDER_ID;
            return `fld_v1_${this._hashStr(name)}`;
        },

        makeNewFolderId() {
            return `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        },

        nowTs() {
            const lastSyncAt = (state.syncStatus && state.syncStatus.lastSyncAt) || 0;
            return Math.max(Date.now(), lastSyncAt > 0 ? lastSyncAt + 1 : 0);
        },

        createDefaultFolder(now = Date.now()) {
            return {
                id: this.DEFAULT_FOLDER_ID,
                name: this.DEFAULT_FOLDER_NAME,
                isDefault: true,
                createdAt: now,
                updatedAt: now,
                deletedAt: null
            };
        },

        buildV2FromLegacy(rawCats, rawFavs, rawLastCat, now = Date.now()) {
            const defaultFolder = this.createDefaultFolder(now);
            const folders = [defaultFolder];
            const nameToId = new Map([[this.DEFAULT_FOLDER_NAME, this.DEFAULT_FOLDER_ID]]);

            const legacyFavs = Array.isArray(rawFavs) ? rawFavs.filter(Boolean) : [];
            const legacyCats = Array.isArray(rawCats) ? rawCats : [];

            const usedCatNames = new Set();
            legacyFavs.forEach(entry => {
                const cat = String(entry.category || '').trim();
                if (cat) usedCatNames.add(cat);
            });

            const candidateCats = new Set();
            legacyCats.forEach(c => {
                const name = String(c || '').trim();
                if (!name || name === this.DEFAULT_FOLDER_NAME) return;
                // 未曾使用过的旧版预设分类（中字精选/待下载）不再初始化，仅保留用户实际使用或自建的夹
                if (!this.LEGACY_PRESETS.includes(name) || usedCatNames.has(name)) {
                    candidateCats.add(name);
                }
            });
            usedCatNames.forEach(name => {
                if (name !== this.DEFAULT_FOLDER_NAME) {
                    candidateCats.add(name);
                }
            });

            candidateCats.forEach(catName => {
                const id = this.makeLegacyFolderId(catName);
                if (!nameToId.has(catName)) {
                    nameToId.set(catName, id);
                    folders.push({
                        id,
                        name: catName,
                        isDefault: false,
                        createdAt: now,
                        updatedAt: now,
                        deletedAt: null
                    });
                }
            });

            const itemMap = new Map();
            legacyFavs.forEach(entry => {
                if (!entry || (!entry.magnet && !entry.code)) return;
                const id = entry.id || this.buildKey(entry);
                if (!id) return;
                const catName = String(entry.category || '').trim() || this.DEFAULT_FOLDER_NAME;
                const folderId = nameToId.get(catName) || this.DEFAULT_FOLDER_ID;
                const createdAt = Number(entry.createdAt) || now;
                const updatedAt = Number(entry.updatedAt) || createdAt;
                itemMap.set(id, {
                    id,
                    folderId,
                    code: entry.code || 'UNKNOWN',
                    title: entry.title || '',
                    magnet: entry.magnet || '',
                    size: entry.size || '未知',
                    date: entry.date || '未知',
                    coverUrl: entry.coverUrl || '',
                    hasCover: false,
                    coverUpdatedAt: 0,
                    createdAt,
                    updatedAt,
                    deletedAt: null
                });
            });

            const lastFolderId = (rawLastCat && nameToId.get(String(rawLastCat).trim())) || this.DEFAULT_FOLDER_ID;
            return {
                schemaVersion: 2,
                defaultFolderId: this.DEFAULT_FOLDER_ID,
                lastFolderId,
                folders,
                items: Array.from(itemMap.values()),
                migratedFromV1: legacyFavs.length > 0 || candidateCats.size > 0
            };
        },

        ensureDefaultFolder() {
            let def = state.favFolders.find(f => f && f.id === this.DEFAULT_FOLDER_ID);
            if (!def) {
                def = this.createDefaultFolder();
                state.favFolders.unshift(def);
            } else {
                def.name = this.DEFAULT_FOLDER_NAME;
                def.isDefault = true;
                def.deletedAt = null;
            }
        },

        init() {
            try {
                const rawV2 = typeof GM_getValue === 'function' ? GM_getValue(this.V2_KEY, null) : null;
                if (rawV2) {
                    const parsed = typeof rawV2 === 'string' ? JSON.parse(rawV2) : rawV2;
                    state.favFolders = Array.isArray(parsed?.folders) ? parsed.folders.filter(Boolean) : [];
                    state.favItems = Array.isArray(parsed?.items) ? parsed.items.filter(Boolean) : [];
                    this.ensureDefaultFolder();
                    const lastId = parsed?.lastFolderId;
                    state.favLastFolderId = this.getFolderById(lastId) ? lastId : this.DEFAULT_FOLDER_ID;
                    return;
                }

                // 检查并无损迁移旧版 4.9.9 数据
                const rawFavs = typeof GM_getValue === 'function' ? GM_getValue(this.V1_FAVS_KEY, null) : null;
                const rawCats = typeof GM_getValue === 'function' ? GM_getValue(this.V1_CATS_KEY, null) : null;
                const rawLastCat = typeof GM_getValue === 'function' ? GM_getValue(this.V1_LAST_CAT_KEY, '') : '';

                const parsedFavs = rawFavs ? (typeof rawFavs === 'string' ? JSON.parse(rawFavs) : rawFavs) : [];
                const parsedCats = rawCats ? (typeof rawCats === 'string' ? JSON.parse(rawCats) : rawCats) : [];

                const v2 = this.buildV2FromLegacy(parsedCats, parsedFavs, rawLastCat);
                state.favFolders = v2.folders;
                state.favItems = v2.items;
                state.favLastFolderId = v2.lastFolderId;
                this.ensureDefaultFolder();
                this.save({ markDirty: false, notifySync: false });
                if (v2.migratedFromV1) {
                    console.log(`[TorrentKitty] 已无损迁移旧版收藏夹：${this.getFolders().length} 个收藏夹，${this.getItems().length} 条收藏`);
                }
            } catch (e) {
                console.error('[TorrentKitty] 加载收藏夹失败:', e);
                state.favFolders = [this.createDefaultFolder()];
                state.favItems = [];
                state.favLastFolderId = this.DEFAULT_FOLDER_ID;
            }
        },

        save(options = {}) {
            const { markDirty = true, notifySync = true } = options;
            this.ensureDefaultFolder();
            try {
                if (typeof GM_setValue === 'function') {
                    GM_setValue(this.V2_KEY, {
                        schemaVersion: 2,
                        defaultFolderId: this.DEFAULT_FOLDER_ID,
                        lastFolderId: state.favLastFolderId || this.DEFAULT_FOLDER_ID,
                        folders: state.favFolders,
                        items: state.favItems
                    });
                }
            } catch (e) {
                console.error('[TorrentKitty] 保存收藏夹失败:', e);
            }
            this.syncUI();
            if (markDirty && notifySync && typeof SyncEngine !== 'undefined') {
                SyncEngine.schedulePush();
            }
        },

        buildKey(data) {
            if (!data) return '';
            const btihMatch = data.magnet && String(data.magnet).match(/btih:([a-zA-Z0-9]+)/i);
            if (btihMatch) return `btih:${btihMatch[1].toLowerCase()}`;
            if (data.magnet) return `mag:${String(data.magnet).trim()}`;
            return `meta:${String(data.code || '').toUpperCase()}::${String(data.title || '').trim()}`;
        },

        getFolders() {
            const active = state.favFolders.filter(f => f && !f.deletedAt);
            return active.sort((a, b) => {
                if (a.id === this.DEFAULT_FOLDER_ID) return -1;
                if (b.id === this.DEFAULT_FOLDER_ID) return 1;
                return (a.createdAt || 0) - (b.createdAt || 0);
            });
        },

        getFolderById(folderId, includeDeleted = false) {
            return state.favFolders.find(f => f && f.id === folderId && (includeDeleted || !f.deletedAt)) || null;
        },

        getFolderName(folderId) {
            const f = this.getFolderById(folderId);
            return f ? f.name : this.DEFAULT_FOLDER_NAME;
        },

        findById(id, includeDeleted = false) {
            return state.favItems.find(item => item && item.id === id && (includeDeleted || !item.deletedAt)) || null;
        },

        findByData(data) {
            const id = this.buildKey(data);
            return id ? this.findById(id, false) : null;
        },

        getItems(folderId = '__ALL__') {
            const list = state.favItems.filter(item => {
                if (!item || item.deletedAt) return false;
                if (folderId === '__ALL__') return true;
                const resolvedFolderId = this.getFolderById(item.folderId) ? item.folderId : this.DEFAULT_FOLDER_ID;
                return resolvedFolderId === folderId;
            });
            return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        },

        getFolderCount(folderId = '__ALL__') {
            return this.getItems(folderId).length;
        },

        getRecentItems(folderId, limit = 4) {
            return this.getItems(folderId).slice(0, limit);
        },

        addOrUpdate(data, folderId = state.favLastFolderId, coverUrl = '') {
            const id = this.buildKey(data);
            if (!id) return null;

            const targetFolder = this.getFolderById(folderId) ? folderId : this.DEFAULT_FOLDER_ID;
            state.favLastFolderId = targetFolder;

            const now = this.nowTs();
            const existingAny = this.findById(id, true);
            const resolvedCover = coverUrl || (data.code && CacheManager.get(data.code)?.coverUrl) || '';

            if (existingAny) {
                const wasDeleted = Boolean(existingAny.deletedAt);
                existingAny.folderId = targetFolder;
                existingAny.code = data.code || existingAny.code || 'UNKNOWN';
                existingAny.title = data.title || existingAny.title || '';
                existingAny.magnet = data.magnet || existingAny.magnet || '';
                existingAny.size = data.size || existingAny.size || '未知';
                existingAny.date = data.date || existingAny.date || '未知';
                if (resolvedCover) existingAny.coverUrl = resolvedCover;
                if (wasDeleted) {
                    existingAny.createdAt = now;
                    existingAny.deletedAt = null;
                }
                existingAny.updatedAt = now;
                this.save();
                if (resolvedCover && typeof CoverMediaStore !== 'undefined' && !CoverMediaStore.hasLocalCover(id)) {
                    CoverMediaStore.captureFromUrl(id, resolvedCover);
                }
                return existingAny;
            }

            const record = {
                id,
                folderId: targetFolder,
                code: data.code || 'UNKNOWN',
                title: data.title || '',
                magnet: data.magnet || '',
                size: data.size || '未知',
                date: data.date || '未知',
                coverUrl: resolvedCover,
                hasCover: false,
                coverUpdatedAt: 0,
                createdAt: now,
                updatedAt: now,
                deletedAt: null
            };
            state.favItems.unshift(record);
            this.save();
            if (resolvedCover && typeof CoverMediaStore !== 'undefined') {
                CoverMediaStore.captureFromUrl(id, resolvedCover);
            }
            return record;
        },

        remove(id) {
            const item = this.findById(id, false);
            if (!item) return false;
            const now = this.nowTs();
            item.deletedAt = now;
            item.updatedAt = now;
            item.hasCover = false;
            if (typeof CoverMediaStore !== 'undefined') {
                CoverMediaStore.deleteLocalCover(id);
            }
            this.save();
            return true;
        },

        moveItem(id, targetFolderId) {
            const targetId = this.getFolderById(targetFolderId) ? targetFolderId : this.DEFAULT_FOLDER_ID;
            const item = this.findById(id, false);
            if (!item) return false;
            item.folderId = targetId;
            item.updatedAt = this.nowTs();
            state.favLastFolderId = targetId;
            this.save();
            return true;
        },

        addFolder(name) {
            const clean = String(name || '').trim();
            if (!clean) return { ok: false, error: '收藏夹名称不能为空' };
            const duplicate = this.getFolders().find(f => f.name === clean);
            if (duplicate) {
                return { ok: false, error: '已存在同名收藏夹' };
            }
            const now = this.nowTs();
            const folder = {
                id: this.makeNewFolderId(),
                name: clean,
                isDefault: false,
                createdAt: now,
                updatedAt: now,
                deletedAt: null
            };
            state.favFolders.push(folder);
            this.save();
            return { ok: true, folder };
        },

        renameFolder(folderId, newName) {
            if (folderId === this.DEFAULT_FOLDER_ID) {
                return { ok: false, error: '默认收藏夹不可重命名' };
            }
            const folder = this.getFolderById(folderId, false);
            if (!folder) return { ok: false, error: '收藏夹不存在' };

            const clean = String(newName || '').trim();
            if (!clean) return { ok: false, error: '新名称不能为空' };
            if (clean === folder.name) return { ok: true, folder };

            const duplicate = this.getFolders().find(f => f.id !== folderId && f.name === clean);
            if (duplicate) {
                return { ok: false, error: '目标收藏夹名称已存在' };
            }

            folder.name = clean;
            folder.updatedAt = this.nowTs();
            this.save();
            return { ok: true, folder };
        },

        /**
         * 删除收藏夹
         * @param {string} folderId
         * @param {'move_to_default'|'delete_items'} mode
         */
        deleteFolder(folderId, mode = 'move_to_default') {
            if (folderId === this.DEFAULT_FOLDER_ID) {
                return { ok: false, error: '默认收藏夹不可删除' };
            }
            const folder = this.getFolderById(folderId, false);
            if (!folder) return { ok: false, error: '收藏夹不存在' };

            const now = this.nowTs();
            let affectedCount = 0;
            state.favItems.forEach(item => {
                if (!item || item.deletedAt || item.folderId !== folderId) return;
                affectedCount++;
                if (mode === 'delete_items') {
                    item.deletedAt = now;
                    item.updatedAt = now;
                    item.hasCover = false;
                    if (typeof CoverMediaStore !== 'undefined') {
                        CoverMediaStore.deleteLocalCover(item.id);
                    }
                } else {
                    item.folderId = this.DEFAULT_FOLDER_ID;
                    item.updatedAt = now;
                }
            });

            folder.deletedAt = now;
            folder.updatedAt = now;
            if (state.favLastFolderId === folderId) {
                state.favLastFolderId = this.DEFAULT_FOLDER_ID;
            }
            this.save();
            return { ok: true, affectedCount, mode };
        },

        markCoverSaved(id, coverUrl = '') {
            const item = this.findById(id, false);
            if (!item) return;
            const now = this.nowTs();
            if (coverUrl && !item.coverUrl) {
                item.coverUrl = coverUrl;
            }
            item.hasCover = true;
            item.coverUpdatedAt = now;
            item.updatedAt = now;
            this.save({ markDirty: true, notifySync: true });
        },

        applyButtonState(btn, data) {
            if (!btn || !data) return;
            const fav = this.findByData(data);
            if (fav) {
                const folderName = this.getFolderName(fav.folderId);
                btn.classList.add('is-favorited');
                btn.textContent = `★ ${folderName}`;
                btn.title = `已收藏到「${folderName}」，点击切换收藏夹或取消收藏`;
            } else {
                btn.classList.remove('is-favorited');
                btn.textContent = '☆ 收藏';
                btn.title = '点击选择收藏夹并收藏';
            }
        },

        syncUI() {
            if (typeof document === 'undefined') return;
            const countText = String(this.getItems().length);
            const countEl = document.getElementById('tk-fav-count');
            if (countEl) {
                countEl.textContent = countText;
            }
            const floatCountEl = document.getElementById('tk-fav-float-count');
            if (floatCountEl) {
                floatCountEl.textContent = countText;
            }
            const cards = document.querySelectorAll('.tk-media-card');
            cards.forEach(card => {
                const rowKey = card.dataset.rowKey;
                const data = rowKey && state.cardDataMap.get(rowKey);
                const btn = card.querySelector('.tk-btn-fav');
                if (btn && data) {
                    this.applyButtonState(btn, data);
                }
            });
            if (typeof GridContainer !== 'undefined' && GridContainer.refreshDrawerFavState) {
                GridContainer.refreshDrawerFavState();
            }
        }
    };

    // ==================== 封面 WebP 压缩与分片缓存 ====================
    const CoverMediaStore = {
        PREFIX: 'tk_fav_img_',
        MAX_SHORT_SIDE: 480,
        MAX_LONG_SIDE: 1280,
        QUALITY: 0.95,
        _inflight: new Map(),
        _listeners: new Set(),

        keyFor(id) {
            return `${this.PREFIX}${id}`;
        },

        onCoverReady(fn) {
            if (typeof fn === 'function') {
                this._listeners.add(fn);
            }
            return () => this._listeners.delete(fn);
        },

        _emitCoverReady(id, dataUrl) {
            this._listeners.forEach(fn => {
                try {
                    fn(id, dataUrl);
                } catch {
                    // 忽略 UI 回调异常
                }
            });
        },

        getLocalCover(id) {
            if (!id || typeof GM_getValue !== 'function') return '';
            try {
                const val = GM_getValue(this.keyFor(id), '');
                return typeof val === 'string' && val.startsWith('data:image/') ? val : '';
            } catch {
                return '';
            }
        },

        hasLocalCover(id) {
            return Boolean(this.getLocalCover(id));
        },

        saveLocalCover(id, dataUrl) {
            if (!id || !dataUrl || typeof GM_setValue !== 'function') return false;
            try {
                GM_setValue(this.keyFor(id), dataUrl);
                this._emitCoverReady(id, dataUrl);
                return true;
            } catch (e) {
                console.error('[TorrentKitty] 写入封面分片失败:', e);
                return false;
            }
        },

        deleteLocalCover(id) {
            if (!id || typeof GM_deleteValue !== 'function') return;
            try {
                GM_deleteValue(this.keyFor(id));
            } catch {
                // 忽略删除异常
            }
        },

        dataUrlToBytes(dataUrl) {
            if (!dataUrl || typeof dataUrl !== 'string') return new Uint8Array(0);
            const commaIdx = dataUrl.indexOf(',');
            const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
            return CryptoHelper.base64ToBytes(b64);
        },

        detectMimeFromBytes(bytes) {
            if (!bytes || bytes.length < 12) return 'image/webp';
            // RIFF....WEBP
            if (
                bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
            ) {
                return 'image/webp';
            }
            // JPEG: FF D8 FF
            if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
                return 'image/jpeg';
            }
            // PNG: 89 50 4E 47
            if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
                return 'image/png';
            }
            return 'image/webp';
        },

        bytesToDataUrl(bytes) {
            if (!bytes || bytes.length === 0) return '';
            const mime = this.detectMimeFromBytes(bytes);
            return `data:${mime};base64,${CryptoHelper.bytesToBase64(bytes)}`;
        },

        async _decodeImageSource(blob) {
            if (typeof createImageBitmap === 'function') {
                try {
                    const bitmap = await createImageBitmap(blob);
                    return {
                        source: bitmap,
                        width: bitmap.width,
                        height: bitmap.height,
                        cleanup: () => {
                            try { bitmap.close(); } catch {}
                        }
                    };
                } catch {
                    // 回退到 HTMLImageElement
                }
            }
            return new Promise((resolve, reject) => {
                const objUrl = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    resolve({
                        source: img,
                        width: img.naturalWidth || img.width,
                        height: img.naturalHeight || img.height,
                        cleanup: () => URL.revokeObjectURL(objUrl)
                    });
                };
                img.onerror = () => {
                    URL.revokeObjectURL(objUrl);
                    reject(new Error('图片解码失败'));
                };
                img.src = objUrl;
            });
        },

        computeTargetSize(srcW, srcH) {
            if (!srcW || !srcH) return { width: 0, height: 0 };
            const shortSide = Math.min(srcW, srcH);
            const longSide = Math.max(srcW, srcH);
            let scale = 1;
            if (shortSide > this.MAX_SHORT_SIDE) {
                scale = this.MAX_SHORT_SIDE / shortSide;
            }
            if (longSide * scale > this.MAX_LONG_SIDE) {
                scale = this.MAX_LONG_SIDE / longSide;
            }
            if (scale >= 1) {
                return { width: srcW, height: srcH };
            }
            return {
                width: Math.max(1, Math.round(srcW * scale)),
                height: Math.max(1, Math.round(srcH * scale))
            };
        },

        async compressBlobToDataUrl(blob) {
            if (!blob || blob.size === 0) {
                throw new Error('图片内容为空');
            }
            const decoded = await this._decodeImageSource(blob);
            try {
                const srcW = decoded.width;
                const srcH = decoded.height;
                if (!srcW || !srcH) {
                    throw new Error('无效的图片尺寸');
                }
                const { width: targetW, height: targetH } = this.computeTargetSize(srcW, srcH);

                const canvas = document.createElement('canvas');
                canvas.width = targetW;
                canvas.height = targetH;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    throw new Error('无法创建 2D Canvas 上下文');
                }
                ctx.drawImage(decoded.source, 0, 0, targetW, targetH);

                let dataUrl = canvas.toDataURL('image/webp', this.QUALITY);
                if (!dataUrl || !dataUrl.startsWith('data:image/webp')) {
                    // 不支持 WebP 导出的浏览器自动降级为 JPEG 0.80
                    dataUrl = canvas.toDataURL('image/jpeg', this.QUALITY);
                }
                return dataUrl;
            } finally {
                decoded.cleanup();
            }
        },

        async captureFromUrl(id, url, options = {}) {
            if (!id || !url || !/^https?:\/\//i.test(url)) return '';
            const { force = false } = options;
            if (!force && this.hasLocalCover(id)) {
                return this.getLocalCover(id);
            }
            if (this._inflight.has(id)) {
                return this._inflight.get(id);
            }

            const task = (async () => {
                try {
                    const res = await gmRequest(url, {
                        method: 'GET',
                        responseType: 'blob',
                        timeout: 15000,
                        headers: {
                            'Accept': 'image/avif,image/webp,image/apng,image/jpeg,image/*,*/*;q=0.8'
                        }
                    });
                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}`);
                    }
                    const blob = await res.blob();
                    const dataUrl = await this.compressBlobToDataUrl(blob);
                    this.saveLocalCover(id, dataUrl);
                    if (typeof FavoritesManager !== 'undefined') {
                        FavoritesManager.markCoverSaved(id, url);
                    }
                    if (typeof SyncEngine !== 'undefined') {
                        SyncEngine.queueCoverUpload(id);
                    }
                    return dataUrl;
                } catch (err) {
                    console.warn(`[TorrentKitty] 封面转存 WebP 失败 (${id}):`, err?.message || err);
                    return '';
                } finally {
                    this._inflight.delete(id);
                }
            })();

            this._inflight.set(id, task);
            return task;
        },

        getStats() {
            const activeIds = new Set(
                (typeof FavoritesManager !== 'undefined' ? FavoritesManager.getItems() : []).map(item => item.id)
            );
            let count = 0;
            let totalBytes = 0;
            const orphanIds = [];
            const coveredIds = new Set();

            if (typeof GM_listValues === 'function' && typeof GM_getValue === 'function') {
                try {
                    const keys = GM_listValues();
                    for (const key of keys) {
                        if (!key.startsWith(this.PREFIX)) continue;
                        const id = key.slice(this.PREFIX.length);
                        const val = GM_getValue(key, '');
                        const str = typeof val === 'string' ? val : '';
                        if (!str) {
                            orphanIds.push(id);
                            continue;
                        }
                        count++;
                        // 按 base64 实际占用估算或按字符长度
                        totalBytes += str.length;
                        if (activeIds.has(id)) {
                            coveredIds.add(id);
                        } else {
                            orphanIds.push(id);
                        }
                    }
                } catch (e) {
                    console.error('[TorrentKitty] 统计封面缓存失败:', e);
                }
            }

            return {
                count,
                totalBytes,
                totalMb: (totalBytes / (1024 * 1024)).toFixed(2),
                orphanCount: orphanIds.length,
                orphanIds,
                coveredIds
            };
        },

        cleanupOrphans() {
            const stats = this.getStats();
            let removedCount = 0;
            let freedBytes = 0;
            if (typeof GM_getValue === 'function' && typeof GM_deleteValue === 'function') {
                for (const id of stats.orphanIds) {
                    const key = this.keyFor(id);
                    const val = GM_getValue(key, '');
                    freedBytes += typeof val === 'string' ? val.length : 0;
                    GM_deleteValue(key);
                    removedCount++;
                }
            }
            return {
                removedCount,
                freedBytes,
                freedMb: (freedBytes / (1024 * 1024)).toFixed(2)
            };
        },

        clearAllLocalCovers() {
            if (typeof GM_listValues !== 'function' || typeof GM_deleteValue !== 'function') return 0;
            let count = 0;
            GM_listValues().forEach(key => {
                if (key.startsWith(this.PREFIX)) {
                    GM_deleteValue(key);
                    count++;
                }
            });
            return count;
        }
    };

    // ==================== 客户端端到端加密 (AES-256-GCM) ====================
    const CryptoHelper = {
        PBKDF2_SALT: 'torrentkitty-favorites-e2ee-salt-v1',
        PBKDF2_ITERATIONS: 100000,
        _keyCache: new Map(),

        getSubtle() {
            const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || (typeof window !== 'undefined' && window.crypto);
            if (!c || !c.subtle) {
                throw new Error('当前环境不支持 WebCrypto (crypto.subtle)，请确认站点处于 HTTPS 安全上下文');
            }
            return c;
        },

        bytesToHex(bytes) {
            let hex = '';
            for (let i = 0; i < bytes.length; i++) {
                hex += bytes[i].toString(16).padStart(2, '0');
            }
            return hex;
        },

        bytesToBase64(bytes) {
            const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            let binary = '';
            const CHUNK = 0x8000;
            for (let i = 0; i < u8.length; i += CHUNK) {
                const sub = u8.subarray(i, i + CHUNK);
                binary += String.fromCharCode.apply(null, sub);
            }
            return btoa(binary);
        },

        base64ToBytes(b64) {
            const binary = atob(String(b64 || '').trim());
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        },

        encodeBase64UrlUtf8(str) {
            const bytes = new TextEncoder().encode(String(str));
            return this.bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        },

        decodeBase64UrlUtf8(b64url) {
            let b64 = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4 !== 0) b64 += '=';
            const bytes = this.base64ToBytes(b64);
            return new TextDecoder().decode(bytes);
        },

        async deriveAuthToken(passphrase) {
            const clean = String(passphrase || '');
            if (!clean) return '';
            const c = this.getSubtle();
            const data = new TextEncoder().encode(`tk-auth:${clean}`);
            const digest = await c.subtle.digest('SHA-256', data);
            return this.bytesToHex(new Uint8Array(digest));
        },

        async deriveKeys(passphrase) {
            const clean = String(passphrase || '');
            if (!clean) {
                throw new Error('同步密钥不能为空');
            }
            if (this._keyCache.has(clean)) {
                return this._keyCache.get(clean);
            }
            const c = this.getSubtle();
            const enc = new TextEncoder();
            const authToken = await this.deriveAuthToken(clean);
            const keyMaterial = await c.subtle.importKey(
                'raw',
                enc.encode(clean),
                { name: 'PBKDF2' },
                false,
                ['deriveKey']
            );
            const encKey = await c.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: enc.encode(this.PBKDF2_SALT),
                    iterations: this.PBKDF2_ITERATIONS,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            const result = { authToken, encKey };
            this._keyCache.set(clean, result);
            return result;
        },

        async encryptBytes(encKey, plainBytes) {
            const c = this.getSubtle();
            const iv = c.getRandomValues(new Uint8Array(12));
            const input = plainBytes instanceof Uint8Array ? plainBytes : new Uint8Array(plainBytes);
            const cipherBuffer = await c.subtle.encrypt(
                { name: 'AES-GCM', iv },
                encKey,
                input
            );
            const cipherBytes = new Uint8Array(cipherBuffer);
            const out = new Uint8Array(iv.length + cipherBytes.length);
            out.set(iv, 0);
            out.set(cipherBytes, iv.length);
            return out;
        },

        async decryptBytes(encKey, combinedBytes) {
            const c = this.getSubtle();
            const input = combinedBytes instanceof Uint8Array ? combinedBytes : new Uint8Array(combinedBytes);
            if (input.byteLength <= 12) {
                throw new Error('密文数据长度无效');
            }
            const iv = input.subarray(0, 12);
            const body = input.subarray(12);
            const plainBuffer = await c.subtle.decrypt(
                { name: 'AES-GCM', iv },
                encKey,
                body
            );
            return new Uint8Array(plainBuffer);
        },

        async encryptText(encKey, plainText) {
            const bytes = new TextEncoder().encode(String(plainText || ''));
            const encrypted = await this.encryptBytes(encKey, bytes);
            return this.bytesToBase64(encrypted);
        },

        async decryptText(encKey, b64Cipher) {
            const encrypted = this.base64ToBytes(b64Cipher);
            const plainBytes = await this.decryptBytes(encKey, encrypted);
            return new TextDecoder().decode(plainBytes);
        },

        async encryptJson(encKey, obj) {
            return this.encryptText(encKey, JSON.stringify(obj));
        },

        async decryptJson(encKey, b64Cipher) {
            const text = await this.decryptText(encKey, b64Cipher);
            return JSON.parse(text);
        }
    };

    // ==================== LWW + Tombstone 合并纯函数 ====================
    const SyncMerge = {
        effectiveTs(rec) {
            if (!rec) return 0;
            return Math.max(Number(rec.updatedAt) || 0, Number(rec.deletedAt) || 0);
        },

        compareRecords(a, b) {
            const tsA = this.effectiveTs(a);
            const tsB = this.effectiveTs(b);
            if (tsA !== tsB) return tsA > tsB ? 1 : -1;
            // 相同时间戳下，已删除记录优先以防复活
            const delA = a && a.deletedAt ? 1 : 0;
            const delB = b && b.deletedAt ? 1 : 0;
            if (delA !== delB) return delA > delB ? 1 : -1;
            return 0;
        },

        mergeLists(localList, remoteList) {
            const localMap = new Map();
            const remoteMap = new Map();
            (localList || []).forEach(r => { if (r && r.id) localMap.set(r.id, r); });
            (remoteList || []).forEach(r => { if (r && r.id) remoteMap.set(r.id, r); });

            const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
            const merged = [];
            const toPush = [];
            let changedLocally = false;

            for (const id of allIds) {
                const loc = localMap.get(id);
                const rem = remoteMap.get(id);
                if (loc && !rem) {
                    merged.push(loc);
                    toPush.push(loc);
                } else if (!loc && rem) {
                    merged.push(rem);
                    changedLocally = true;
                } else {
                    const cmp = this.compareRecords(loc, rem);
                    if (cmp > 0) {
                        merged.push(loc);
                        toPush.push(loc);
                    } else if (cmp < 0) {
                        if (!rem.deletedAt && !loc.deletedAt && ('coverUrl' in loc || 'hasCover' in loc)) {
                            const mergedRec = { ...rem };
                            if (!mergedRec.coverUrl && loc.coverUrl) mergedRec.coverUrl = loc.coverUrl;
                            if (!mergedRec.hasCover && loc.hasCover) mergedRec.hasCover = true;
                            merged.push(mergedRec);
                        } else {
                            merged.push(rem);
                        }
                        changedLocally = true;
                    } else {
                        merged.push(loc);
                    }
                }
            }

            return { merged, changedLocally, toPush };
        }
    };

    // ==================== Cloudflare Worker + D1 自动同步引擎 ====================
    const SyncEngine = {
        CONFIG_KEY: 'tk_sync_config',
        PASSCODE_PREFIX: 'TK-SYNC-V1:',
        _pushTimer: null,
        _syncPromise: null,
        _coverFetching: new Map(),
        _statusListeners: new Set(),

        config: {
            enabled: false,
            apiUrl: '',
            passphrase: '',
            lastSyncAt: 0,
            dirty: false,
            pendingCoverUploads: []
        },

        init() {
            this.loadConfig();
            this.refreshStatusSummary();
            if (typeof window !== 'undefined') {
                window.addEventListener('online', () => {
                    if (this.isConfigured() && (this.config.dirty || (this.config.pendingCoverUploads || []).length > 0)) {
                        this.syncNow({ reason: 'online-recover' });
                    }
                });
            }
        },

        onStatusChange(fn) {
            if (typeof fn === 'function') this._statusListeners.add(fn);
            return () => this._statusListeners.delete(fn);
        },

        _setSyncStatus(patch) {
            state.syncStatus = { ...state.syncStatus, ...patch };
            this._statusListeners.forEach(fn => {
                try { fn(state.syncStatus); } catch {}
            });
        },

        refreshStatusSummary() {
            if (!this.isConfigured()) {
                this._setSyncStatus({
                    state: 'unconfigured',
                    label: '未配置云同步',
                    lastSyncAt: this.config.lastSyncAt || 0,
                    dirty: Boolean(this.config.dirty),
                    error: ''
                });
                return;
            }
            this._setSyncStatus({
                state: this.config.dirty ? 'dirty' : 'synced',
                label: this.config.dirty ? '待推送更改' : (this.config.lastSyncAt ? '☁️ 已同步' : '☁️ 就绪'),
                lastSyncAt: this.config.lastSyncAt || 0,
                dirty: Boolean(this.config.dirty)
            });
        },

        loadConfig() {
            if (typeof GM_getValue !== 'function') return;
            try {
                const raw = GM_getValue(this.CONFIG_KEY, null);
                if (raw) {
                    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    this.config = {
                        enabled: Boolean(parsed.enabled),
                        apiUrl: this.normalizeApiUrl(parsed.apiUrl || ''),
                        passphrase: String(parsed.passphrase || ''),
                        lastSyncAt: Number(parsed.lastSyncAt) || 0,
                        dirty: Boolean(parsed.dirty),
                        pendingCoverUploads: Array.isArray(parsed.pendingCoverUploads) ? parsed.pendingCoverUploads : []
                    };
                }
            } catch (e) {
                console.error('[TorrentKitty] 读取同步配置失败:', e);
            }
        },

        saveConfig() {
            if (typeof GM_setValue !== 'function') return;
            try {
                GM_setValue(this.CONFIG_KEY, {
                    ...this.config,
                    apiUrl: this.normalizeApiUrl(this.config.apiUrl)
                });
            } catch (e) {
                console.error('[TorrentKitty] 保存同步配置失败:', e);
            }
            this.refreshStatusSummary();
        },

        normalizeApiUrl(url) {
            return String(url || '').trim().replace(/\/+$/, '');
        },

        isConfigured() {
            return Boolean(this.config.enabled && this.normalizeApiUrl(this.config.apiUrl) && this.config.passphrase);
        },

        updateSettings({ enabled, apiUrl, passphrase }) {
            const cleanUrl = this.normalizeApiUrl(apiUrl);
            const cleanPass = String(passphrase || '');
            const changedEndpoint = cleanUrl !== this.config.apiUrl || cleanPass !== this.config.passphrase;
            this.config.enabled = Boolean(enabled);
            this.config.apiUrl = cleanUrl;
            this.config.passphrase = cleanPass;
            if (changedEndpoint) {
                this.config.lastSyncAt = 0;
                this.config.dirty = true;
            }
            this.saveConfig();
        },

        exportPasscode() {
            const cleanUrl = this.normalizeApiUrl(this.config.apiUrl);
            const cleanPass = String(this.config.passphrase || '');
            if (!cleanUrl || !cleanPass) {
                throw new Error('请先填写同步 API 地址与同步密钥');
            }
            const json = JSON.stringify({ apiUrl: cleanUrl, passphrase: cleanPass });
            return `${this.PASSCODE_PREFIX}${CryptoHelper.encodeBase64UrlUtf8(json)}`;
        },

        importPasscode(rawCode) {
            const text = String(rawCode || '').trim();
            if (!text.startsWith(this.PASSCODE_PREFIX)) {
                throw new Error('配置口令格式不正确（应以 TK-SYNC-V1: 开头）');
            }
            const payload = text.slice(this.PASSCODE_PREFIX.length);
            const decoded = JSON.parse(CryptoHelper.decodeBase64UrlUtf8(payload));
            if (!decoded || !decoded.apiUrl || !decoded.passphrase) {
                throw new Error('配置口令缺少必要字段');
            }
            this.updateSettings({
                enabled: true,
                apiUrl: decoded.apiUrl,
                passphrase: decoded.passphrase
            });
            return {
                apiUrl: this.config.apiUrl,
                passphrase: this.config.passphrase
            };
        },

        async _authedRequest(path, options = {}) {
            const base = this.normalizeApiUrl(this.config.apiUrl);
            if (!base || !this.config.passphrase) {
                throw new Error('未填写同步 API 地址或同步密钥');
            }
            const { authToken, encKey } = await CryptoHelper.deriveKeys(this.config.passphrase);
            const url = `${base}${path.startsWith('/') ? path : '/' + path}`;
            const res = await gmRequest(url, {
                method: options.method || 'GET',
                data: options.data,
                responseType: options.responseType || 'text',
                timeout: options.timeout || 25000,
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    ...(options.headers || {})
                }
            });
            if (res.status === 404 && !options.allowNotFound) {
                throw new Error('服务端返回 404（请检查 API 地址或 SYNC_AUTH_TOKEN 是否匹配）');
            }
            return { res, encKey, authToken };
        },

        async ping() {
            const { res } = await this._authedRequest('/api/ping', { method: 'GET' });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            if (!data || !data.ok) {
                throw new Error(data?.error || 'Ping 失败');
            }
            this._setSyncStatus({ stats: data.stats || null });
            return data;
        },

        schedulePush() {
            this.config.dirty = true;
            this.saveConfig();
            if (!this.isConfigured()) return;
            if (this._pushTimer) clearTimeout(this._pushTimer);
            this._pushTimer = setTimeout(() => {
                this._pushTimer = null;
                this.syncNow({ reason: 'auto-debounce' });
            }, 2500);
        },

        queueCoverUpload(itemId) {
            if (!itemId) return;
            if (!this.config.pendingCoverUploads.includes(itemId)) {
                this.config.pendingCoverUploads.push(itemId);
                this.saveConfig();
            }
            if (this.isConfigured()) {
                this.flushPendingCovers();
            }
        },

        async flushPendingCovers() {
            if (!this.isConfigured()) return;
            const queue = [...new Set(this.config.pendingCoverUploads || [])];
            if (queue.length === 0) return;

            const remaining = [];
            let lastErr = '';
            for (const id of queue) {
                const item = FavoritesManager.findById(id, false);
                if (!item) continue;
                const localDataUrl = CoverMediaStore.getLocalCover(id);
                if (!localDataUrl) continue;
                try {
                    await this.uploadLocalCover(id, localDataUrl);
                } catch (e) {
                    lastErr = e?.message || String(e);
                    console.warn(`[TorrentKitty] 上传封面失败 (${id}):`, lastErr);
                    remaining.push(id);
                }
            }
            this.config.pendingCoverUploads = remaining;
            if (remaining.length > 0 && lastErr) {
                this._setSyncStatus({ error: `部分封面上传失败 (${remaining.length} 张): ${lastErr}` });
            }
            this.saveConfig();
        },

        async uploadLocalCover(itemId, dataUrlOverride = '') {
            const dataUrl = dataUrlOverride || CoverMediaStore.getLocalCover(itemId);
            if (!dataUrl) return false;
            const plainBytes = CoverMediaStore.dataUrlToBytes(dataUrl);
            if (plainBytes.length === 0) return false;
            const { encKey } = await CryptoHelper.deriveKeys(this.config.passphrase);
            const cipherBytes = await CryptoHelper.encryptBytes(encKey, plainBytes);
            const payloadBlob = typeof Blob === 'function'
                ? new Blob([cipherBytes], { type: 'application/octet-stream' })
                : cipherBytes.buffer;
            const { res } = await this._authedRequest(`/api/covers/${encodeURIComponent(itemId)}`, {
                method: 'PUT',
                data: payloadBlob,
                headers: { 'Content-Type': 'application/octet-stream' }
            });
            if (!res.ok) {
                throw new Error(`上传封面失败: HTTP ${res.status}`);
            }
            return true;
        },

        async fetchAndCacheRemoteCover(itemId) {
            if (!itemId || !this.isConfigured()) return '';
            const local = CoverMediaStore.getLocalCover(itemId);
            if (local) return local;

            if (this._coverFetching.has(itemId)) {
                return this._coverFetching.get(itemId);
            }

            const task = (async () => {
                try {
                    const { res, encKey } = await this._authedRequest(`/api/covers/${encodeURIComponent(itemId)}`, {
                        method: 'GET',
                        responseType: 'arraybuffer',
                        allowNotFound: true
                    });
                    if (!res.ok) return '';
                    const buf = await res.arrayBuffer();
                    const cipherBytes = new Uint8Array(buf);
                    if (cipherBytes.byteLength <= 12) return '';
                    const plainBytes = await CryptoHelper.decryptBytes(encKey, cipherBytes);
                    const dataUrl = CoverMediaStore.bytesToDataUrl(plainBytes);
                    if (dataUrl) {
                        CoverMediaStore.saveLocalCover(itemId, dataUrl);
                    }
                    return dataUrl;
                } catch (err) {
                    console.warn(`[TorrentKitty] 拉取解密云端封面失败 (${itemId}):`, err?.message || err);
                    return '';
                } finally {
                    this._coverFetching.delete(itemId);
                }
            })();

            this._coverFetching.set(itemId, task);
            return task;
        },

        async syncNow({ reason = 'manual', forceFull = false } = {}) {
            if (!this.isConfigured()) {
                return { ok: false, error: '云同步未配置或未启用' };
            }
            if (this._syncPromise) {
                return this._syncPromise;
            }

            this._syncPromise = (async () => {
                this._setSyncStatus({ state: 'syncing', label: '☁️ 同步中...', error: '' });
                try {
                    const { encKey } = await CryptoHelper.deriveKeys(this.config.passphrase);
                    const lastSyncAt = forceFull ? 0 : (Number(this.config.lastSyncAt) || 0);

                    // 筛选需提交的本地增量记录（首次同步或全量同步时发送全部）
                    const foldersToSend = lastSyncAt === 0
                        ? state.favFolders
                        : state.favFolders.filter(f => SyncMerge.effectiveTs(f) > lastSyncAt);
                    const itemsToSend = lastSyncAt === 0
                        ? state.favItems
                        : state.favItems.filter(it => SyncMerge.effectiveTs(it) > lastSyncAt);

                    const encFolders = await Promise.all(foldersToSend.map(async f => ({
                        id: f.id,
                        payload: await CryptoHelper.encryptJson(encKey, f),
                        updatedAt: Number(f.updatedAt) || Date.now(),
                        deletedAt: f.deletedAt || null
                    })));

                    const encItems = await Promise.all(itemsToSend.map(async it => ({
                        id: it.id,
                        folderId: it.folderId || FavoritesManager.DEFAULT_FOLDER_ID,
                        payload: await CryptoHelper.encryptJson(encKey, it),
                        hasCover: Boolean(it.hasCover || CoverMediaStore.hasLocalCover(it.id)),
                        updatedAt: Number(it.updatedAt) || Date.now(),
                        deletedAt: it.deletedAt || null
                    })));

                    const { res } = await this._authedRequest('/api/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        data: JSON.stringify({
                            lastSyncAt,
                            folders: encFolders,
                            items: encItems
                        })
                    });
                    if (!res.ok) {
                        throw new Error(`同步请求失败: HTTP ${res.status}`);
                    }
                    const data = await res.json();
                    if (!data || !data.ok) {
                        throw new Error(data?.error || '同步响应无效');
                    }

                    // 解密远端记录
                    const remoteFolders = [];
                    for (const rf of (data.folders || [])) {
                        try {
                            const dec = await CryptoHelper.decryptJson(encKey, rf.payload);
                            remoteFolders.push({
                                ...dec,
                                id: rf.id,
                                updatedAt: Number(rf.updatedAt) || dec.updatedAt || 0,
                                deletedAt: rf.deletedAt !== undefined ? rf.deletedAt : (dec.deletedAt || null)
                            });
                        } catch {
                            throw new Error('远端收藏夹解密失败，请核对同步密钥是否一致');
                        }
                    }

                    const remoteItems = [];
                    for (const ri of (data.items || [])) {
                        try {
                            const dec = await CryptoHelper.decryptJson(encKey, ri.payload);
                            remoteItems.push({
                                ...dec,
                                id: ri.id,
                                folderId: ri.folderId || dec.folderId || FavoritesManager.DEFAULT_FOLDER_ID,
                                hasCover: Boolean(ri.hasCover || dec.hasCover),
                                updatedAt: Number(ri.updatedAt) || dec.updatedAt || 0,
                                deletedAt: ri.deletedAt !== undefined ? ri.deletedAt : (dec.deletedAt || null)
                            });
                        } catch {
                            throw new Error('远端收藏条目解密失败，请核对同步密钥是否一致');
                        }
                    }

                    const mergedFoldersRes = SyncMerge.mergeLists(state.favFolders, remoteFolders);
                    const mergedItemsRes = SyncMerge.mergeLists(state.favItems, remoteItems);

                    // 清理刚被远端删除条目的本地缓存分片
                    mergedItemsRes.merged.forEach(it => {
                        if (it && it.deletedAt) {
                            CoverMediaStore.deleteLocalCover(it.id);
                        }
                    });

                    state.favFolders = mergedFoldersRes.merged;
                    state.favItems = mergedItemsRes.merged;
                    FavoritesManager.ensureDefaultFolder();

                    // 若本地还有未推送给刚才服务端的新增量（例如本地比较晚或首次合并），标记 dirty；否则清零
                    const hasUnpushed = (mergedFoldersRes.toPush.length > encFolders.length)
                        || (mergedItemsRes.toPush.length > encItems.length);

                    this.config.lastSyncAt = Number(data.serverTime) || Date.now();
                    this.config.dirty = hasUnpushed;
                    this.saveConfig();

                    FavoritesManager.save({ markDirty: false, notifySync: false });

                    // 增量上传新生成的封面（或本地有但未标记上传的）
                    itemsToSend.forEach(it => {
                        if (it && !it.deletedAt && CoverMediaStore.hasLocalCover(it.id)) {
                            if (!this.config.pendingCoverUploads.includes(it.id)) {
                                this.config.pendingCoverUploads.push(it.id);
                            }
                        }
                    });
                    await this.flushPendingCovers();

                    try {
                        await this.ping();
                    } catch {
                        // 统计查询失败不影响主同步结果
                    }

                    this._setSyncStatus({
                        state: 'synced',
                        label: '☁️ 已同步',
                        lastSyncAt: this.config.lastSyncAt,
                        dirty: this.config.dirty
                    });

                    if (hasUnpushed && reason !== 'followup') {
                        return await this.syncNow({ reason: 'followup' });
                    }

                    return {
                        ok: true,
                        changedLocally: mergedFoldersRes.changedLocally || mergedItemsRes.changedLocally,
                        serverTime: this.config.lastSyncAt
                    };
                } catch (err) {
                    const msg = err?.message || '同步失败';
                    this.config.dirty = true;
                    this.saveConfig();
                    this._setSyncStatus({
                        state: 'error',
                        label: '⚠️ 同步失败',
                        error: msg,
                        dirty: true
                    });
                    return { ok: false, error: msg };
                } finally {
                    this._syncPromise = null;
                }
            })();

            return this._syncPromise;
        },

        async overwriteCloudWithLocal() {
            if (!this.isConfigured()) {
                throw new Error('请先配置并启用云同步');
            }
            this._setSyncStatus({ state: 'syncing', label: '☁️ 正在覆盖云端...', error: '' });
            const { res } = await this._authedRequest('/api/reset', { method: 'POST' });
            if (!res.ok) {
                throw new Error(`重置云端失败: HTTP ${res.status}`);
            }
            this.config.lastSyncAt = 0;
            this.config.dirty = true;
            // 将所有本地存在封面的活跃条目加入上传队列
            const localIds = FavoritesManager.getItems()
                .filter(it => CoverMediaStore.hasLocalCover(it.id))
                .map(it => it.id);
            this.config.pendingCoverUploads = localIds;
            this.saveConfig();

            return this.syncNow({ reason: 'overwrite-cloud', forceFull: true });
        }
    };

    // ==================== 本地文件备份与恢复 ====================
    const BackupManager = {
        estimateExportSize(includeCovers = true) {
            const folders = FavoritesManager.getFolders();
            const items = FavoritesManager.getItems();
            const metaSample = JSON.stringify({
                schemaVersion: 2,
                exportedAt: new Date().toISOString(),
                includeCovers,
                folders,
                items
            });
            let totalBytes = metaSample.length;
            let coverCount = 0;
            if (includeCovers) {
                for (const it of items) {
                    const c = CoverMediaStore.getLocalCover(it.id);
                    if (c) {
                        coverCount++;
                        totalBytes += it.id.length + c.length + 6;
                    }
                }
            }
            return {
                folderCount: folders.length,
                itemCount: items.length,
                coverCount,
                estimatedBytes: totalBytes,
                formattedSize: totalBytes >= 1024 * 1024
                    ? `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`
                    : `${Math.max(1, Math.round(totalBytes / 1024))} KB`
            };
        },

        buildExportData(includeCovers = true) {
            const folders = FavoritesManager.getFolders();
            const items = FavoritesManager.getItems();
            const out = {
                schemaVersion: 2,
                exportedAt: new Date().toISOString(),
                includeCovers: Boolean(includeCovers),
                folders,
                items
            };
            if (includeCovers) {
                const covers = {};
                for (const it of items) {
                    const c = CoverMediaStore.getLocalCover(it.id);
                    if (c) covers[it.id] = c;
                }
                out.covers = covers;
            }
            return out;
        },

        formatFilename() {
            const d = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
            return `torrentkitty-favorites-${stamp}.json`;
        },

        downloadBackup(includeCovers = true) {
            const payload = this.buildExportData(includeCovers);
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.formatFilename();
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return json.length;
        },

        inspectImport(rawInput) {
            const parsed = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
            if (!parsed || typeof parsed !== 'object') {
                throw new Error('无效的 JSON 对象');
            }

            // 兼容 v2
            if (parsed.schemaVersion === 2 || Array.isArray(parsed.items)) {
                const rawFolders = Array.isArray(parsed.folders) ? parsed.folders.filter(Boolean) : [];
                const rawItems = Array.isArray(parsed.items) ? parsed.items.filter(Boolean) : [];
                const covers = parsed.covers && typeof parsed.covers === 'object' ? parsed.covers : {};
                const activeFolders = rawFolders.filter(f => !f.deletedAt);
                const activeItems = rawItems.filter(it => !it.deletedAt);
                return {
                    versionLabel: 'v2 (5.0.0+)',
                    exportedAt: parsed.exportedAt || '未知时间',
                    folderCount: activeFolders.length || 1,
                    itemCount: activeItems.length,
                    coverCount: Object.keys(covers).length,
                    normalized: {
                        folders: rawFolders,
                        items: rawItems,
                        covers
                    }
                };
            }

            // 兼容 v1 (4.9.9)
            if (Array.isArray(parsed.favorites)) {
                const v2 = FavoritesManager.buildV2FromLegacy(
                    parsed.categories || [],
                    parsed.favorites || [],
                    ''
                );
                return {
                    versionLabel: 'v1 (4.9.9 兼容)',
                    exportedAt: parsed.exportedAt || '未知时间',
                    folderCount: v2.folders.length,
                    itemCount: v2.items.length,
                    coverCount: 0,
                    normalized: {
                        folders: v2.folders,
                        items: v2.items,
                        covers: {}
                    }
                };
            }

            throw new Error('无法识别的备份格式（缺少 items 或 favorites 数组）');
        },

        applyImport(normalized, mode = 'merge') {
            const now = FavoritesManager.nowTs();
            const incomingFolders = Array.isArray(normalized?.folders) ? normalized.folders : [];
            const incomingItems = Array.isArray(normalized?.items) ? normalized.items : [];
            const incomingCovers = normalized?.covers && typeof normalized.covers === 'object' ? normalized.covers : {};

            let added = 0;
            let updated = 0;
            let coversRestored = 0;

            if (mode === 'overwrite') {
                // 对现有未包含在导入集中的记录打上 Tombstone，保证后续同步正确删除旧数据
                const incomingFolderIds = new Set(incomingFolders.map(f => f.id));
                const incomingItemIds = new Set(incomingItems.map(i => i.id));

                const nextFolders = [];
                state.favFolders.forEach(f => {
                    if (f.id !== FavoritesManager.DEFAULT_FOLDER_ID && !incomingFolderIds.has(f.id)) {
                        nextFolders.push({ ...f, deletedAt: now, updatedAt: now });
                    }
                });
                incomingFolders.forEach(f => {
                    if (!f || !f.id) return;
                    nextFolders.push({
                        ...f,
                        updatedAt: Math.max(Number(f.updatedAt) || now, now),
                        deletedAt: f.deletedAt || null
                    });
                });

                const nextItems = [];
                state.favItems.forEach(it => {
                    if (!incomingItemIds.has(it.id)) {
                        CoverMediaStore.deleteLocalCover(it.id);
                        nextItems.push({ ...it, deletedAt: now, updatedAt: now, hasCover: false });
                    }
                });
                incomingItems.forEach(it => {
                    if (!it || (!it.magnet && !it.code)) return;
                    const id = it.id || FavoritesManager.buildKey(it);
                    const hasCoverData = Boolean(incomingCovers[id]);
                    if (hasCoverData) {
                        CoverMediaStore.saveLocalCover(id, incomingCovers[id]);
                        coversRestored++;
                        SyncEngine.queueCoverUpload(id);
                    }
                    nextItems.push({
                        id,
                        folderId: it.folderId || FavoritesManager.DEFAULT_FOLDER_ID,
                        code: it.code || 'UNKNOWN',
                        title: it.title || '',
                        magnet: it.magnet || '',
                        size: it.size || '未知',
                        date: it.date || '未知',
                        coverUrl: it.coverUrl || '',
                        hasCover: Boolean(hasCoverData || it.hasCover),
                        coverUpdatedAt: hasCoverData ? now : (it.coverUpdatedAt || 0),
                        createdAt: it.createdAt || now,
                        updatedAt: Math.max(Number(it.updatedAt) || now, now),
                        deletedAt: it.deletedAt || null
                    });
                    added++;
                });

                state.favFolders = nextFolders;
                state.favItems = nextItems;
                FavoritesManager.ensureDefaultFolder();
                FavoritesManager.save();
                return { added, updated, coversRestored, total: FavoritesManager.getItems().length };
            }

            // 智能合并模式
            const folderMap = new Map(state.favFolders.map(f => [f.id, f]));
            incomingFolders.forEach(f => {
                if (!f || !f.id || f.deletedAt) return;
                if (!folderMap.has(f.id)) {
                    const clone = { ...f, updatedAt: now, deletedAt: null };
                    state.favFolders.push(clone);
                    folderMap.set(f.id, clone);
                } else {
                    const cur = folderMap.get(f.id);
                    if (cur.deletedAt) {
                        cur.deletedAt = null;
                        cur.name = f.name || cur.name;
                        cur.updatedAt = now;
                    }
                }
            });

            const itemMap = new Map(state.favItems.map(it => [it.id, it]));
            incomingItems.forEach(entry => {
                if (!entry || entry.deletedAt || (!entry.magnet && !entry.code)) return;
                const id = entry.id || FavoritesManager.buildKey(entry);
                const targetFolderId = folderMap.get(entry.folderId) && !folderMap.get(entry.folderId).deletedAt
                    ? entry.folderId
                    : FavoritesManager.DEFAULT_FOLDER_ID;
                const coverData = incomingCovers[id];

                if (itemMap.has(id)) {
                    const cur = itemMap.get(id);
                    let touched = false;
                    if (cur.deletedAt) {
                        cur.deletedAt = null;
                        cur.folderId = targetFolderId;
                        touched = true;
                    }
                    if (!cur.coverUrl && entry.coverUrl) {
                        cur.coverUrl = entry.coverUrl;
                        touched = true;
                    }
                    if (coverData && !CoverMediaStore.hasLocalCover(id)) {
                        CoverMediaStore.saveLocalCover(id, coverData);
                        cur.hasCover = true;
                        cur.coverUpdatedAt = now;
                        coversRestored++;
                        SyncEngine.queueCoverUpload(id);
                        touched = true;
                    }
                    if (touched) cur.updatedAt = now;
                    updated++;
                } else {
                    const hasCoverData = Boolean(coverData);
                    if (hasCoverData) {
                        CoverMediaStore.saveLocalCover(id, coverData);
                        coversRestored++;
                        SyncEngine.queueCoverUpload(id);
                    }
                    const rec = {
                        id,
                        folderId: targetFolderId,
                        code: entry.code || 'UNKNOWN',
                        title: entry.title || '',
                        magnet: entry.magnet || '',
                        size: entry.size || '未知',
                        date: entry.date || '未知',
                        coverUrl: entry.coverUrl || '',
                        hasCover: Boolean(hasCoverData || entry.hasCover),
                        coverUpdatedAt: hasCoverData ? now : (entry.coverUpdatedAt || 0),
                        createdAt: entry.createdAt || now,
                        updatedAt: now,
                        deletedAt: null
                    };
                    state.favItems.push(rec);
                    itemMap.set(id, rec);
                    added++;
                }
            });

            FavoritesManager.ensureDefaultFolder();
            FavoritesManager.save();
            return { added, updated, coversRestored, total: FavoritesManager.getItems().length };
        }
    };

    // ==================== 请求队列与三源协同协调器 ====================
    const QueueManager = {
        getMode() {
            const mode = state.settings.coverSourceMode || CONFIG.defaults.coverSourceMode || 'jav321_first';
            return mode === 'missav_only' ? 'no_javdb' : mode;
        },

        createDebugInfo(code, mode = this.getMode()) {
            const existing = state.debugInfoMap.get(code);
            if (existing) {
                existing.mode = mode;
                return existing;
            }
            return {
                code,
                mode,
                timestamp: new Date().toISOString(),
                coverSource: '',
                jav321Tried: false,
                jav321Status: '未请求',
                jav321Url: '',
                missavTried: false,
                missavStatus: '未请求',
                missavUrl: MissAVService.getPageUrl(code),
                javdbTried: false,
                fetchUrl: '',
                fetchStatus: '未请求',
                foundResult: false,
                javdbUrl: '',
                coverId: '',
                coverUrl: '',
                fallbackCoverUrl: '',
                errorMessage: ''
            };
        },

        buildPipeline(mode) {
            if (mode === 'no_javdb') {
                return ['jav321', 'missav'];
            }
            if (mode === 'missav_first') {
                return ['missav', 'jav321', 'javdb'];
            }
            if (mode === 'javdb_first') {
                return ['javdb', 'jav321', 'missav'];
            }
            if (mode === 'balanced') {
                const idx = state.taskCounter++;
                return idx % 2 === 0
                    ? ['jav321', 'missav', 'javdb']
                    : ['missav', 'jav321', 'javdb'];
            }
            // 默认 jav321_first：JAV321(DMM原图) -> MissAV高清 -> JavDB兜底
            return ['jav321', 'missav', 'javdb'];
        },

        isSourceAvailable(source, mode = this.getMode()) {
            if (source === 'javdb') {
                return mode !== 'no_javdb' && !state.isPausedForLogin && !JavDBService.isCircuitBroken();
            }
            return true;
        },

        isCacheUsable(cached, mode) {
            if (!cached) return false;
            // 自动淘汰上一版本缓存的低清 MissAV cover-t.jpg，刷新为 800x538 高清图
            if (cached.coverUrl && cached.coverUrl.includes('/cover-t.jpg')) {
                return false;
            }
            if (cached.coverUrl || cached.coverId) return true;

            // 对旧空缓存或之前仅部分源失败的记录：只要还有当前策略下未尝试且可用的源，允许重拉
            if (!cached.triedMissav) return false;
            if (!cached.triedJav321) return false;
            if (cached.isError && this.isSourceAvailable('javdb', mode) && !cached.triedJavdb) {
                return false;
            }
            return true;
        },

        add(code) {
            if (!code || state.dispatchedCodes.has(code)) return;
            state.dispatchedCodes.add(code);

            const mode = this.getMode();
            const cached = CacheManager.get(code);
            if (this.isCacheUsable(cached, mode)) {
                const debugInfo = cached.debugInfo || this.createDebugInfo(code, mode);
                if (cached.coverSource === 'javdb' || cached.coverId) {
                    state.javdbSuccessCount++;
                }
                state.debugInfoMap.set(code, debugInfo);
                UIUpdater.updateCode(code, debugInfo, cached);
                return;
            }
            if (cached) {
                CacheManager.remove(code);
            }

            const debugInfo = this.createDebugInfo(code, mode);
            state.debugInfoMap.set(code, debugInfo);

            const task = {
                code,
                pipeline: this.buildPipeline(mode),
                nextIndex: 0,
                retries: 0
            };
            this.advanceTask(task, debugInfo, { prepend: false });
        },

        advanceTask(task, debugInfo, { prepend = false } = {}) {
            const mode = this.getMode();
            let chosen = null;

            while (task.nextIndex < task.pipeline.length) {
                const candidate = task.pipeline[task.nextIndex++];
                if (candidate === 'jav321' && debugInfo.jav321Tried) continue;
                if (candidate === 'missav' && debugInfo.missavTried) continue;
                if (candidate === 'javdb' && (debugInfo.javdbTried || !this.isSourceAvailable('javdb', mode))) continue;
                chosen = candidate;
                break;
            }

            if (!chosen) {
                let fallbackLabel = '[多源均未收录]';
                let isError = false;
                if (JavDBService.isCircuitBroken() && !debugInfo.javdbTried && mode !== 'no_javdb') {
                    fallbackLabel = '[未收录 / JavDB熔断]';
                    isError = true;
                } else if (state.isPausedForLogin && !debugInfo.javdbTried && mode !== 'no_javdb') {
                    fallbackLabel = '[未收录 / JavDB需登录]';
                    isError = true;
                } else if (debugInfo.errorMessage) {
                    fallbackLabel = `[${debugInfo.errorMessage}]`;
                    isError = Boolean(!debugInfo.missavTried || !debugInfo.jav321Tried);
                }
                this.commitFailure(task.code, debugInfo, { fallbackLabel, isError });
                return;
            }

            if (chosen === 'jav321') {
                if (prepend) state.jav321Queue.unshift(task);
                else state.jav321Queue.push(task);
                this.processJav321();
            } else if (chosen === 'missav') {
                if (prepend) state.missavQueue.unshift(task);
                else state.missavQueue.push(task);
                this.processMissav();
            } else {
                task.retries = 0;
                if (prepend) state.requestQueue.unshift(task);
                else state.requestQueue.push(task);
                this.process();
            }
            UIUpdater.refreshDrawerLogs(task.code, debugInfo);
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

        commitSuccess(code, debugInfo, payload) {
            state.failedCodesForRetry.delete(code);
            state.debugInfoMap.set(code, debugInfo);
            CacheManager.set(code, payload);
            UIUpdater.updateCode(code, debugInfo, payload);
        },

        commitFailure(code, debugInfo, { fallbackLabel = '[未收录]', isError = false, cacheResult = true } = {}) {
            state.failedCodesForRetry.add(code);
            const payload = {
                url: null,
                javdbSearchUrl: JavDBService.getSearchUrl(code),
                coverId: null,
                coverUrl: null,
                fallbackCoverUrl: '',
                coverSource: 'none',
                triedJav321: Boolean(debugInfo.jav321Tried),
                triedMissav: Boolean(debugInfo.missavTried),
                triedJavdb: Boolean(debugInfo.javdbTried),
                debugInfo,
                ...(isError ? { isError: true, errorExpiry: Date.now() + CONFIG.errorCacheExpiry } : {})
            };
            state.debugInfoMap.set(code, debugInfo);
            if (cacheResult) {
                CacheManager.set(code, payload);
            }
            UIUpdater.updateCode(code, debugInfo, {
                ...payload,
                fallbackLabel
            });
        },

        checkQueueCompletion() {
            const allDone = !state.isProcessing
                && !state.isProcessingMissav
                && !state.isProcessingJav321
                && state.requestQueue.length === 0
                && state.missavQueue.length === 0
                && state.jav321Queue.length === 0;
            if (allDone && typeof App !== 'undefined' && App.showStatusBanner) {
                const banner = document.getElementById('tk-status-banner');
                if (banner && (banner.textContent.includes('正在异步') || banner.textContent.includes('排队加载') || banner.textContent.includes('正在重试拉取'))) {
                    const msg = JavDBService.isCircuitBroken()
                        ? '高清封面加载完成（JavDB 熔断保护中）'
                        : '封面数据全部加载完成！';
                    App.showStatusBanner(msg, true);
                }
            }
        },

        drainJavdbQueue(reasonLabel) {
            if (state.requestQueue.length === 0) return;
            const pending = state.requestQueue.splice(0, state.requestQueue.length);
            pending.forEach(item => {
                const debugInfo = this.createDebugInfo(item.code);
                if (!debugInfo.errorMessage && reasonLabel) {
                    debugInfo.errorMessage = reasonLabel;
                }
                this.advanceTask(item, debugInfo);
            });
        },

        showSuspendedNotice(resumeText = '') {
            if (typeof GridContainer === 'undefined' || !GridContainer.showJavdbNotice) return;
            const resumeHint = resumeText ? `（预计 ${resumeText} 恢复）` : '';
            GridContainer.showJavdbNotice({
                level: 'warning',
                message: `检测到 JavDB 账号被临时停用${resumeHint}，已自动熔断 JavDB 请求并由 JAV321/MissAV 高清源接管。`,
                showLoginLink: true,
                showRetry: false,
                showResetCircuit: true,
                showUseMissavOnly: this.getMode() !== 'no_javdb'
            });
        },

        requeueCodes(codes) {
            if (!codes || codes.length === 0) return 0;
            const mode = this.getMode();
            const queuedCodes = new Set([
                ...state.requestQueue.map(i => i.code),
                ...state.missavQueue.map(i => i.code),
                ...state.jav321Queue.map(i => i.code)
            ]);
            let count = 0;

            for (let i = codes.length - 1; i >= 0; i--) {
                const code = codes[i];
                const cached = CacheManager.get(code);
                if (cached && (!(cached.coverUrl || cached.coverId) || cached.isError)) {
                    CacheManager.remove(code);
                }
                if (queuedCodes.has(code)) continue;
                queuedCodes.add(code);

                const debugInfo = this.createDebugInfo(code, mode);
                debugInfo.jav321Tried = false;
                debugInfo.missavTried = false;
                debugInfo.javdbTried = false;
                debugInfo.errorMessage = '';

                const task = {
                    code,
                    pipeline: this.buildPipeline(mode),
                    nextIndex: 0,
                    retries: 0
                };
                this.advanceTask(task, debugInfo, { prepend: true });
                count++;
            }

            return count;
        },

        async resolveCoverOnce(code) {
            if (!code || code === 'UNKNOWN') return '';
            const mode = this.getMode();
            const cached = CacheManager.get(code);
            if (cached && (cached.coverUrl || cached.coverId)) {
                return cached.coverUrl || (cached.coverId ? JavDBService.getCoverUrl(cached.coverId) : '');
            }

            const debugInfo = this.createDebugInfo(code, mode);
            const pipeline = this.buildPipeline(mode);
            for (const source of pipeline) {
                if (source === 'jav321') {
                    const res = await JAV321Service.fetchCover(code, debugInfo);
                    if (res && res.found && res.coverUrl) {
                        const payload = {
                            url: null,
                            javdbSearchUrl: JavDBService.getSearchUrl(code),
                            coverId: null,
                            coverUrl: res.coverUrl,
                            fallbackCoverUrl: res.fallbackCoverUrl || '',
                            coverSource: 'jav321',
                            triedJav321: true,
                            triedMissav: Boolean(debugInfo.missavTried),
                            triedJavdb: Boolean(debugInfo.javdbTried),
                            debugInfo
                        };
                        this.commitSuccess(code, debugInfo, payload);
                        return res.coverUrl;
                    }
                } else if (source === 'missav') {
                    const res = await MissAVService.fetchCover(code, debugInfo);
                    if (res && res.found && res.coverUrl) {
                        const payload = {
                            url: null,
                            javdbSearchUrl: JavDBService.getSearchUrl(code),
                            coverId: null,
                            coverUrl: res.coverUrl,
                            fallbackCoverUrl: res.fallbackCoverUrl || '',
                            coverSource: 'missav',
                            triedJav321: Boolean(debugInfo.jav321Tried),
                            triedMissav: true,
                            triedJavdb: Boolean(debugInfo.javdbTried),
                            debugInfo
                        };
                        this.commitSuccess(code, debugInfo, payload);
                        return res.coverUrl;
                    }
                } else if (source === 'javdb' && this.isSourceAvailable('javdb', mode)) {
                    try {
                        const res = await JavDBService.fetchInfo(code, 0, debugInfo);
                        if (res && res.found && res.payload) {
                            this.commitSuccess(code, debugInfo, res.payload);
                            return res.payload.coverUrl || (res.payload.coverId ? JavDBService.getCoverUrl(res.payload.coverId) : '');
                        }
                    } catch {
                        // 忽略单次兜底异常，继续后续流程
                    }
                }
            }
            return '';
        },

        resumeAfterLogin() {
            state.isPausedForLogin = false;
            this.resetError();
            state.javdbConsecutiveMisses = 0;

            const codesToRetry = Array.from(state.failedCodesForRetry);
            state.failedCodesForRetry.clear();

            if (typeof GridContainer !== 'undefined' && GridContainer.hideJavdbNotice) {
                GridContainer.hideJavdbNotice();
            }

            const queuedCount = this.requeueCodes(codesToRetry);
            if (typeof App !== 'undefined' && App.showStatusBanner && queuedCount > 0) {
                App.showStatusBanner(`正在重试拉取封面数据（剩余 ${queuedCount} 项）...`, true);
            }
        },

        resetCircuitAndRetry() {
            JavDBService.clearCircuitBreaker();
            this.resumeAfterLogin();
        },

        onSettingsChanged() {
            const mode = this.getMode();
            if (mode === 'no_javdb') {
                this.drainJavdbQueue('已切换为零 JavDB 模式');
            }
            const retryCodes = Array.from(state.failedCodesForRetry);
            if (retryCodes.length > 0) {
                state.failedCodesForRetry.clear();
                this.requeueCodes(retryCodes);
            }
        },

        async processJav321() {
            if (state.isProcessingJav321 || state.jav321Queue.length === 0) {
                this.checkQueueCompletion();
                return;
            }

            state.isProcessingJav321 = true;
            const task = state.jav321Queue.shift();
            const debugInfo = this.createDebugInfo(task.code);

            try {
                const res = await JAV321Service.fetchCover(task.code, debugInfo);
                if (res.found) {
                    const payload = {
                        url: null,
                        javdbSearchUrl: JavDBService.getSearchUrl(task.code),
                        jav321Url: res.jav321Url || '',
                        coverId: null,
                        coverUrl: res.coverUrl,
                        fallbackCoverUrl: res.fallbackCoverUrl || '',
                        coverSource: 'jav321',
                        triedJav321: true,
                        triedMissav: Boolean(debugInfo.missavTried),
                        triedJavdb: Boolean(debugInfo.javdbTried),
                        debugInfo
                    };
                    this.commitSuccess(task.code, debugInfo, payload);
                } else {
                    this.advanceTask(task, debugInfo);
                }
            } catch (e) {
                console.error('[TorrentKitty] JAV321 队列处理错误:', e);
                debugInfo.jav321Status = e.message || '请求出错';
                this.advanceTask(task, debugInfo);
            }

            const delay = CONFIG.queue.jav321Delay || 350;
            setTimeout(() => {
                state.isProcessingJav321 = false;
                this.processJav321();
            }, delay);
        },

        async processMissav() {
            if (state.isProcessingMissav || state.missavQueue.length === 0) {
                this.checkQueueCompletion();
                return;
            }

            state.isProcessingMissav = true;
            const task = state.missavQueue.shift();
            const debugInfo = this.createDebugInfo(task.code);

            try {
                const res = await MissAVService.fetchCover(task.code, debugInfo);
                if (res.found) {
                    const payload = {
                        url: null,
                        javdbSearchUrl: JavDBService.getSearchUrl(task.code),
                        coverId: null,
                        coverUrl: res.coverUrl,
                        fallbackCoverUrl: res.fallbackCoverUrl || '',
                        coverSource: 'missav',
                        triedJav321: Boolean(debugInfo.jav321Tried),
                        triedMissav: true,
                        triedJavdb: Boolean(debugInfo.javdbTried),
                        debugInfo
                    };
                    this.commitSuccess(task.code, debugInfo, payload);
                } else {
                    this.advanceTask(task, debugInfo);
                }
            } catch (e) {
                console.error('[TorrentKitty] MissAV 队列处理错误:', e);
                debugInfo.missavStatus = e.message || '请求出错';
                this.advanceTask(task, debugInfo);
            }

            const delay = CONFIG.queue.missavDelay || 120;
            setTimeout(() => {
                state.isProcessingMissav = false;
                this.processMissav();
            }, delay);
        },

        async process() {
            if (state.isProcessing) return;

            if (!this.isSourceAvailable('javdb')) {
                const label = JavDBService.isCircuitBroken() ? 'JavDB 熔断中' : '请先登录 JavDB';
                this.drainJavdbQueue(label);
                this.checkQueueCompletion();
                return;
            }

            if (state.requestQueue.length === 0) {
                this.checkQueueCompletion();
                return;
            }

            if (this.isRateLimited()) {
                setTimeout(() => this.process(), 5000);
                return;
            }

            state.isProcessing = true;
            const task = state.requestQueue.shift();
            const debugInfo = this.createDebugInfo(task.code);

            try {
                this.recordRequest();
                const res = await JavDBService.fetchInfo(task.code, task.retries, debugInfo);
                this.resetError();

                if (res && res.found && res.payload) {
                    this.commitSuccess(task.code, debugInfo, res.payload);
                } else {
                    const hasMoreSteps = task.nextIndex < task.pipeline.length;
                    this.advanceTask(task, debugInfo);
                    if (!hasMoreSteps && state.javdbSuccessCount === 0 && state.javdbConsecutiveMisses >= 3 && typeof GridContainer !== 'undefined' && GridContainer.showJavdbNotice) {
                        GridContainer.showJavdbNotice({
                            level: 'warning',
                            message: '已连续多次未能从 JavDB 拉取到封面，可能尚未登录或需要通过验证。建议优先使用 JAV321 / MissAV 高清分摊策略。',
                            showRetry: true
                        });
                    }
                }
            } catch (e) {
                console.error('[TorrentKitty] JavDB 队列处理错误:', e);

                if (e.message === 'ACCOUNT_SUSPENDED' || e.message === 'CIRCUIT_OPEN') {
                    state.isProcessing = false;
                    this.showSuspendedNotice(JavDBService.getBlockedUntilLabel());
                    this.advanceTask(task, debugInfo);
                    this.drainJavdbQueue('JavDB 账号停用');
                    if (typeof App !== 'undefined' && App.showStatusBanner) {
                        App.showStatusBanner('JavDB 已进入冷却保护，自动由 JAV321 / MissAV 接管封面获取。', true);
                    }
                    return;
                }

                if (e.message === 'LOGIN_REQUIRED') {
                    state.isPausedForLogin = true;
                    state.isProcessing = false;
                    if (!debugInfo.errorMessage) {
                        debugInfo.errorMessage = '需要登录 JavDB';
                    }
                    state.failedCodesForRetry.add(task.code);
                    this.advanceTask(task, debugInfo);
                    this.drainJavdbQueue('需要登录 JavDB');

                    if (typeof GridContainer !== 'undefined' && GridContainer.showJavdbNotice) {
                        GridContainer.showJavdbNotice({
                            level: 'warning',
                            message: '检测到 JavDB 需要登录（已暂停 JavDB 队列，改由 JAV321/MissAV 接管可用封面）。登录后可点击重试。',
                            showRetry: true,
                            showUseMissavOnly: this.getMode() !== 'no_javdb'
                        });
                    }
                    if (typeof App !== 'undefined' && App.showStatusBanner) {
                        App.showStatusBanner('JavDB 需要登录，已自动改由 JAV321/MissAV 接管封面获取。', true);
                    }
                    return;
                }

                this.handleError();

                const canRetry = ['RATE_LIMITED', 'CAPTCHA_DETECTED'].includes(e.message)
                    && task.retries < CONFIG.queue.maxTaskRetries;

                if (canRetry) {
                    task.retries++;
                    state.requestQueue.push(task);
                } else {
                    if (!debugInfo.errorMessage) {
                        debugInfo.errorMessage = e.message || String(e);
                    }

                    if (e.message === 'IP_BANNED') {
                        JavDBService.activateCircuitBreaker(
                            Date.now() + 15 * 60 * 1000,
                            'JavDB 返回 403 访问拦截，已暂停 15 分钟请求'
                        );
                    }

                    state.failedCodesForRetry.add(task.code);
                    this.advanceTask(task, debugInfo);

                    if (e.message === 'IP_BANNED') {
                        this.drainJavdbQueue('JavDB 403 拦截');
                    }

                    if (['IP_BANNED', 'CAPTCHA_DETECTED'].includes(e.message) && typeof GridContainer !== 'undefined' && GridContainer.showJavdbNotice) {
                        GridContainer.showJavdbNotice({
                            level: 'warning',
                            message: 'JavDB 触发访问限制或验证（403/验证码），已自动尝试其他高清封面源兜底。',
                            showRetry: true,
                            showResetCircuit: JavDBService.isCircuitBroken(),
                            showUseMissavOnly: this.getMode() !== 'no_javdb'
                        });
                    }
                }
            }

            const delay = this.getNextDelay();
            setTimeout(() => {
                state.isProcessing = false;
                this.process();
            }, delay);
        }
    };

    // ==================== JAV321 / DMM 原图服务 ====================
    const JAV321Service = {
        SEARCH_URL: 'https://www.jav321.com/search',

        normalizeHttpsUrl(url) {
            if (!url) return '';
            let out = String(url).trim().replace(/^http:\/\//i, 'https://');
            out = out.replace(/^(https:\/\/[^/]+)\/{2,}/i, '$1/');
            return out;
        },

        buildDmmFallback(url) {
            if (!url || !/^https:\/\/pics\.dmm\.co\.jp\//i.test(url)) return '';
            return url.replace(/^https:\/\/pics\.dmm\.co\.jp\//i, 'https://www.jav321.com/');
        },

        postSearch(code) {
            return new Promise((resolve, reject) => {
                if (typeof GM_xmlhttpRequest !== 'function') {
                    reject(new Error('缺少 GM_xmlhttpRequest 权限'));
                    return;
                }
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: this.SEARCH_URL,
                    data: `sn=${encodeURIComponent(code)}`,
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    onload: (res) => resolve(res),
                    onerror: () => reject(new Error('JAV321 网络请求失败')),
                    ontimeout: () => reject(new Error('JAV321 请求超时'))
                });
            });
        },

        isCodeMatched(expectedCode, pinbanText, finalUrl) {
            const pureExpected = String(expectedCode || '').toUpperCase().replace(/[^A-Z0-9]/ig, '');
            if (!pureExpected) return false;

            if (pinbanText) {
                const pureResult = pinbanText.toUpperCase().replace(/[^A-Z0-9]/ig, '');
                if (pureResult === pureExpected) return true;
                // 兼容 300MIUM-1000 在页面标为 mium-1000 的情况
                if (pureResult.length >= 4 && pureExpected.replace(/^\d+/, '') === pureResult) return true;
                return false;
            }

            // 若未找到 <b>品番</b>，比对 URL path 末尾，如 /video/sone00300 对 SONE-300
            if (finalUrl) {
                const slug = finalUrl.split('/').pop().toUpperCase().replace(/[^A-Z0-9]/ig, '');
                if (slug === pureExpected) return true;
                const mExp = pureExpected.match(/^([A-Z]+)(\d+)$/);
                const mSlug = slug.match(/^([A-Z]+)(\d+)$/);
                if (mExp && mSlug && mExp[1] === mSlug[1] && parseInt(mExp[2], 10) === parseInt(mSlug[2], 10)) {
                    return true;
                }
            }
            return false;
        },

        parseDetail(html, finalUrl, expectedCode) {
            if (!html) return null;
            if (!/\/video\//i.test(finalUrl || '') && !html.includes('<b>品番</b>')) {
                return null;
            }

            const pinbanMatch = html.match(/<b>\s*品番\s*<\/b>\s*:\s*([^<\r\n]+)/i);
            const pinban = pinbanMatch ? pinbanMatch[1].trim() : '';
            if (!this.isCodeMatched(expectedCode, pinban, finalUrl)) {
                return null;
            }

            // 1) 优先提取 DMM 800x538 高清无水印原图 *pl.jpg
            const dmmPlMatch = html.match(/https?:\/\/pics\.dmm\.co\.jp[^"'\s>]+pl\.jpg/i);
            if (dmmPlMatch) {
                const coverUrl = this.normalizeHttpsUrl(dmmPlMatch[0]);
                return {
                    coverUrl,
                    fallbackCoverUrl: this.buildDmmFallback(coverUrl),
                    jav321Url: finalUrl || ''
                };
            }

            // 2) 若只有 jav321 自家镜像 pl.jpg
            const jav321PlMatch = html.match(/https?:\/\/www\.jav321\.com[^"'\s>]+pl\.jpg/i);
            if (jav321PlMatch) {
                return {
                    coverUrl: this.normalizeHttpsUrl(jav321PlMatch[0]),
                    fallbackCoverUrl: '',
                    jav321Url: finalUrl || ''
                };
            }

            // 3) 若只有 DMM 首图 *ps.jpg，推导出 *pl.jpg 高清版本（附带 jav321 镜像兜底）
            const dmmPsMatch = html.match(/https?:\/\/pics\.dmm\.co\.jp[^"'\s>]+ps\.jpg/i);
            if (dmmPsMatch) {
                const plUrl = this.normalizeHttpsUrl(dmmPsMatch[0].replace(/ps\.jpg$/i, 'pl.jpg'));
                return {
                    coverUrl: plUrl,
                    fallbackCoverUrl: this.buildDmmFallback(plUrl),
                    jav321Url: finalUrl || ''
                };
            }

            // 4) MGS/素人片高清横版大图 pb_e_...jpg
            const pbMatch = html.match(/https:\/\/www\.jav321\.com\/images\/[^"'\s>]*pb_e_[^"'\s>]+\.jpg/i);
            if (pbMatch) {
                return {
                    coverUrl: this.normalizeHttpsUrl(pbMatch[0]),
                    fallbackCoverUrl: '',
                    jav321Url: finalUrl || ''
                };
            }

            // 5) 素人首图 pf_o1_... 可尝试衍生 pb_e_，失败退回原 HTTPS 首图
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const mainImg = doc.querySelector('.panel-body .col-md-3 img');
            const mainSrc = mainImg ? mainImg.getAttribute('src') : '';
            if (mainSrc && /^https:\/\//i.test(mainSrc)) {
                if (/\/pf_o1_/i.test(mainSrc)) {
                    return {
                        coverUrl: mainSrc.replace(/\/pf_o1_/i, '/pb_e_'),
                        fallbackCoverUrl: mainSrc,
                        jav321Url: finalUrl || ''
                    };
                }
                return {
                    coverUrl: mainSrc,
                    fallbackCoverUrl: '',
                    jav321Url: finalUrl || ''
                };
            }

            // 注：image.jav321.com 仅支持 HTTP，在 HTTPS 页面会被 Mixed Content 拦截，跳过交由 MissAV/JavDB 处理
            return null;
        },

        async fetchCover(code, debugInfo) {
            debugInfo.jav321Tried = true;
            try {
                const res = await this.postSearch(code);
                if (res.status !== 200) {
                    debugInfo.jav321Status = `HTTP ${res.status}`;
                    return { found: false, reason: 'HTTP_ERROR' };
                }

                const html = res.responseText || '';
                if (html.includes('cf-challenge') || /Just a moment/i.test(html)) {
                    debugInfo.jav321Status = 'CF 验证拦截';
                    return { found: false, reason: 'CF_BLOCKED' };
                }

                const parsed = this.parseDetail(html, res.finalUrl, code);
                if (parsed && parsed.coverUrl) {
                    debugInfo.foundResult = true;
                    debugInfo.coverSource = 'jav321';
                    debugInfo.coverUrl = parsed.coverUrl;
                    debugInfo.fallbackCoverUrl = parsed.fallbackCoverUrl || '';
                    debugInfo.jav321Url = parsed.jav321Url;
                    debugInfo.jav321Status = 'HTTP 200 (800px 原图)';
                    return { found: true, ...parsed };
                }

                debugInfo.jav321Status = '未收录或无 HTTPS 高清图';
                return { found: false, reason: 'NOT_FOUND' };
            } catch (err) {
                debugInfo.jav321Status = err.message || '请求失败';
                return { found: false, reason: 'NETWORK_ERROR', error: err };
            }
        }
    };

    // ==================== MissAV 高清封面服务（fourhoi 静态 CDN） ====================
    const MissAVService = {
        getPageUrl(code) {
            return `https://missav.ws/cn/${encodeURIComponent(code || '')}`;
        },

        buildSlugCandidates(code) {
            if (!code) return [];
            const clean = String(code).trim().toLowerCase().replace(/[\s_]+/g, '-');
            const dashed = clean.replace(/^([a-z]{2,6})(\d{3,5})$/i, '$1-$2');
            const list = [];
            if (dashed !== clean) list.push(dashed);
            list.push(clean);
            return [...new Set(list)];
        },

        getCoverUrl(slug, variant = 'cover-n.jpg') {
            return `https://fourhoi.com/${encodeURIComponent(slug)}/${variant}`;
        },

        headRequest(url) {
            return new Promise((resolve, reject) => {
                if (typeof GM_xmlhttpRequest !== 'function') {
                    reject(new Error('缺少 GM_xmlhttpRequest 权限'));
                    return;
                }
                GM_xmlhttpRequest({
                    method: 'HEAD',
                    url,
                    timeout: 8000,
                    headers: {
                        'Accept': 'image/avif,image/webp,image/apng,image/jpeg,image/*,*/*;q=0.8'
                    },
                    onload: (res) => resolve(res),
                    onerror: () => reject(new Error('MissAV CDN 网络请求失败')),
                    ontimeout: () => reject(new Error('MissAV CDN 请求超时'))
                });
            });
        },

        probeImageElement(url) {
            return new Promise((resolve) => {
                const img = new Image();
                let settled = false;
                const finish = (ok, status) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    img.onload = null;
                    img.onerror = null;
                    resolve({ ok, status });
                };
                const timer = setTimeout(() => finish(false, 'TIMEOUT'), 8000);
                img.referrerPolicy = 'no-referrer';
                img.onload = () => finish(true, 200);
                img.onerror = () => finish(false, 'IMG_ERROR');
                img.src = url;
            });
        },

        async fetchCover(code, debugInfo) {
            const candidates = this.buildSlugCandidates(code);
            debugInfo.missavTried = true;
            debugInfo.missavUrl = this.getPageUrl(code);

            for (const slug of candidates) {
                // 优先取 cover-n.jpg（800x538 高清大图），若 404 再降级 cover-t.jpg
                for (const variant of ['cover-n.jpg', 'cover-t.jpg']) {
                    const coverUrl = this.getCoverUrl(slug, variant);
                    try {
                        const res = await this.headRequest(coverUrl);
                        const headersText = res.responseHeaders || '';
                        const ctMatch = headersText.match(/content-type\s*:\s*([^\r\n;]+)/i);
                        const contentType = ctMatch ? ctMatch[1].trim().toLowerCase() : '';

                        if (res.status === 200 && (!contentType || contentType.startsWith('image/'))) {
                            debugInfo.foundResult = true;
                            debugInfo.coverSource = 'missav';
                            debugInfo.coverUrl = coverUrl;
                            debugInfo.fallbackCoverUrl = variant === 'cover-n.jpg' ? this.getCoverUrl(slug, 'cover-t.jpg') : '';
                            debugInfo.missavStatus = `HTTP 200 (${slug}/${variant})`;
                            return { found: true, coverUrl, fallbackCoverUrl: debugInfo.fallbackCoverUrl };
                        }

                        if (res.status === 405) {
                            const imgProbe = await this.probeImageElement(coverUrl);
                            if (imgProbe.ok) {
                                debugInfo.foundResult = true;
                                debugInfo.coverSource = 'missav';
                                debugInfo.coverUrl = coverUrl;
                                debugInfo.missavStatus = `IMG 200 (${slug}/${variant})`;
                                return { found: true, coverUrl, fallbackCoverUrl: '' };
                            }
                        }

                        if (res.status === 404) {
                            debugInfo.missavStatus = `HTTP 404 (${slug} 未收录)`;
                            continue;
                        }

                        debugInfo.missavStatus = `HTTP ${res.status || 'ERR'} (${slug})`;
                        return { found: false, reason: 'NETWORK_ERROR' };
                    } catch (err) {
                        debugInfo.missavStatus = err.message || '请求失败';
                        return { found: false, reason: 'NETWORK_ERROR', error: err };
                    }
                }
            }

            return { found: false, reason: 'NOT_FOUND' };
        }
    };

    // ==================== JavDB 服务 ====================
    const JavDBService = {
        CIRCUIT_UNTIL_KEY: 'tk_javdb_blocked_until',
        CIRCUIT_MSG_KEY: 'tk_javdb_blocked_msg',

        getSearchUrl(code) {
            return `https://javdb.com/search?q=${encodeURIComponent(code || '')}&f=all`;
        },

        getCoverUrl(coverId) {
            const prefix = coverId.substring(0, 2).toLowerCase();
            return `https://c0.jdbstatic.com/covers/${prefix}/${coverId}.jpg`;
        },

        loadCircuitState() {
            if (typeof GM_getValue !== 'function') return;
            const until = Number(GM_getValue(this.CIRCUIT_UNTIL_KEY, 0)) || 0;
            const msg = GM_getValue(this.CIRCUIT_MSG_KEY, '') || '';
            if (until > Date.now()) {
                state.javdbBlockedUntil = until;
                state.javdbBlockedMessage = msg;
            } else if (until > 0) {
                this.clearCircuitBreaker();
            }
        },

        isCircuitBroken() {
            if (!state.javdbBlockedUntil) return false;
            if (state.javdbBlockedUntil <= Date.now()) {
                this.clearCircuitBreaker();
                return false;
            }
            return true;
        },

        getBlockedUntilLabel() {
            if (state.javdbBlockedMessage) return state.javdbBlockedMessage;
            if (!state.javdbBlockedUntil) return '';
            const d = new Date(state.javdbBlockedUntil);
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        },

        activateCircuitBreaker(blockedUntil, message = '') {
            const until = (blockedUntil && blockedUntil > Date.now())
                ? blockedUntil
                : (Date.now() + 2 * 60 * 60 * 1000);
            state.javdbBlockedUntil = until;
            state.javdbBlockedMessage = message || '';
            if (typeof GM_setValue === 'function') {
                GM_setValue(this.CIRCUIT_UNTIL_KEY, until);
                GM_setValue(this.CIRCUIT_MSG_KEY, state.javdbBlockedMessage);
            }
        },

        clearCircuitBreaker() {
            state.javdbBlockedUntil = 0;
            state.javdbBlockedMessage = '';
            if (typeof GM_deleteValue === 'function') {
                GM_deleteValue(this.CIRCUIT_UNTIL_KEY);
                GM_deleteValue(this.CIRCUIT_MSG_KEY);
            }
        },

        detectSuspension(html) {
            if (!html) return null;
            const isSuspended = /帳號已被臨時停用|账号已被临时停用|異常採集行為|异常采集行为|瀏覽速度遠超正常用戶|浏览速度远超正常用户|暫時停用帳號|暂时停用账号/i.test(html);
            if (!isSuspended) return null;

            const resumeMatch = html.match(/(?:將於|将于)\s*([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2})(?:[（(][^）)]+[）)])?\s*(?:自動恢復|自动恢复)/i);
            const resumeText = resumeMatch ? resumeMatch[1].trim() : '';
            let blockedUntil = Date.now() + 6 * 60 * 60 * 1000;
            if (resumeText) {
                const dtMatch = resumeText.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
                if (dtMatch) {
                    const parsed = Date.parse(`${dtMatch[1]}T${dtMatch[2]}:00+08:00`);
                    if (!Number.isNaN(parsed) && parsed > Date.now()) {
                        blockedUntil = parsed;
                    }
                }
            }
            return { resumeText, blockedUntil };
        },

        isLoginRequired(response, html) {
            if (response && response.status === 401) return true;
            const finalUrl = (response && response.finalUrl) || '';
            if (/\/(?:login|users\/sign_in)(?:[/?#]|$)/i.test(finalUrl)) {
                return true;
            }
            if (!html) return false;
            if (html.includes('movie-list')) return false;
            return (
                /action=["'][^"']*\/users\/sign_in["']/i.test(html) ||
                /name=["']user\[email\]["']/i.test(html) ||
                /請先登入|请先登录|登入後才能|登录后才能|需要登入|需要登录|Please sign in/i.test(html)
            );
        },

        async fetchInfo(code, retryAttempt = 0, existingDebugInfo = null) {
            const debugInfo = existingDebugInfo || QueueManager.createDebugInfo(code);
            debugInfo.javdbTried = true;
            if (retryAttempt > 0) {
                debugInfo.retryAttempt = retryAttempt;
            }

            if (this.isCircuitBroken()) {
                debugInfo.errorMessage = 'JavDB 处于风控熔断冷却期';
                debugInfo.fetchStatus = '已跳过 (熔断保护)';
                throw new Error('CIRCUIT_OPEN');
            }

            try {
                const searchUrl = this.getSearchUrl(code);
                debugInfo.fetchUrl = searchUrl;

                const response = await gmFetch(searchUrl);
                debugInfo.fetchStatus = `HTTP ${response.status} ${response.statusText}`;

                if (response.status === 401) {
                    debugInfo.errorMessage = '需要登录 JavDB 才能拉取封面 (401)';
                    throw new Error('LOGIN_REQUIRED');
                }

                if (response.status === 429) {
                    debugInfo.errorMessage = 'JavDB 请求过于频繁 (429)';
                    throw new Error('RATE_LIMITED');
                }

                if (response.status === 403) {
                    debugInfo.errorMessage = 'JavDB 访问被限制 (403)';
                    throw new Error('IP_BANNED');
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await response.text();

                const suspension = this.detectSuspension(html);
                if (suspension) {
                    const label = suspension.resumeText || this.getBlockedUntilLabel();
                    this.activateCircuitBreaker(suspension.blockedUntil, suspension.resumeText);
                    debugInfo.fetchStatus = 'HTTP 200 (账号临时停用)';
                    debugInfo.errorMessage = `JavDB 账号临时停用${label ? ` (${label}恢复)` : ''}`;
                    throw new Error('ACCOUNT_SUSPENDED');
                }

                if (this.isLoginRequired(response, html)) {
                    debugInfo.errorMessage = '需要登录 JavDB 才能拉取封面';
                    throw new Error('LOGIN_REQUIRED');
                }

                if (html.includes('cf-challenge') || html.includes('captcha')) {
                    debugInfo.errorMessage = '检测到 JavDB Cloudflare 挑战/验证码';
                    throw new Error('CAPTCHA_DETECTED');
                }

                const result = this.parseSearchResult(html, code);

                if (result) {
                    state.javdbSuccessCount++;
                    state.javdbConsecutiveMisses = 0;
                    if (state.javdbNoticeLevel === 'info' && typeof GridContainer !== 'undefined' && GridContainer.hideJavdbNotice) {
                        GridContainer.hideJavdbNotice();
                    }

                    const coverUrl = this.getCoverUrl(result.coverId);
                    debugInfo.foundResult = true;
                    debugInfo.coverSource = 'javdb';
                    debugInfo.javdbUrl = result.url;
                    debugInfo.coverId = result.coverId;
                    debugInfo.coverUrl = coverUrl;
                    debugInfo.errorMessage = '';

                    const payload = {
                        ...result,
                        javdbSearchUrl: searchUrl,
                        coverUrl,
                        fallbackCoverUrl: '',
                        coverSource: 'javdb',
                        triedJav321: Boolean(debugInfo.jav321Tried),
                        triedMissav: Boolean(debugInfo.missavTried),
                        triedJavdb: true,
                        debugInfo
                    };
                    return { found: true, payload };
                }

                state.javdbConsecutiveMisses++;
                debugInfo.fetchStatus = `${debugInfo.fetchStatus} (无匹配)`;
                return { found: false, reason: 'NOT_FOUND' };
            } catch (error) {
                debugInfo.errorMessage = debugInfo.errorMessage || error.message || String(error);
                state.debugInfoMap.set(code, debugInfo);
                console.error('[TorrentKitty] JavDB 请求出错:', error);

                const isSpecialControl = ['ACCOUNT_SUSPENDED', 'CIRCUIT_OPEN', 'LOGIN_REQUIRED', 'RATE_LIMITED', 'IP_BANNED', 'CAPTCHA_DETECTED'].includes(error.message);
                if (isSpecialControl) {
                    UIUpdater.refreshDrawerLogs(code, debugInfo);
                    throw error;
                }

                state.javdbConsecutiveMisses++;
                return { found: false, reason: 'NETWORK_ERROR', error };
            }
        },

        createDebugInfo(code) {
            return QueueManager.createDebugInfo(code);
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
                    <button class="tk-toolbar-btn" id="tk-btn-favorites">⭐ 收藏夹 (<span id="tk-fav-count">0</span>)</button>
                    <button class="tk-toolbar-btn" id="tk-btn-clear-cache" title="清除本地封面与翻页缓存并重拉当前页封面（保留设置与收藏）">🗑️ 清缓存</button>
                    <button class="tk-toolbar-btn" id="tk-btn-config">⚙️ 设置</button>
                </div>
            `;
            root.appendChild(toolbar);

            const javdbNotice = document.createElement('div');
            javdbNotice.id = 'tk-javdb-notice';
            javdbNotice.className = 'tk-javdb-notice';
            root.appendChild(javdbNotice);

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
                    <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px;">
                        <select id="tk-drawer-fav-cat" style="flex: 1; padding: 9px 10px; border-radius: 8px; border: 1px solid var(--tk-control-border); background: rgba(255,255,255,0.85); color: var(--tk-text-main); font-size: 12px;"></select>
                        <button class="tk-drawer-btn" id="tk-drawer-fav-btn" style="flex: 1;">☆ 收藏此资源</button>
                    </div>
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

            document.getElementById('tk-btn-favorites').onclick = () => ModalManager.showFavorites();

            // 页面向下滚动超过顶部工具栏时，在视口最上方右上角常驻悬浮收藏夹入口
            if (!document.getElementById('tk-fav-floating-bar')) {
                const floatBar = document.createElement('div');
                floatBar.id = 'tk-fav-floating-bar';
                floatBar.className = 'tk-fav-floating-bar';
                floatBar.innerHTML = `
                    <button type="button" class="tk-fav-float-btn" id="tk-fav-float-btn" title="打开我的收藏夹">⭐ 收藏夹 (<span id="tk-fav-float-count">0</span>)</button>
                    <button type="button" class="tk-fav-float-top" id="tk-fav-float-top" title="回到顶部">↑</button>
                `;
                document.body.appendChild(floatBar);

                document.getElementById('tk-fav-float-btn').onclick = () => ModalManager.showFavorites();
                document.getElementById('tk-fav-float-top').onclick = () => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                };

                const updateFloatingVisibility = () => {
                    const rect = toolbar.getBoundingClientRect();
                    floatBar.classList.toggle('is-visible', rect.bottom < 8);
                };
                if (typeof IntersectionObserver === 'function') {
                    const io = new IntersectionObserver((entries) => {
                        const entry = entries[0];
                        if (!entry) return;
                        const passedTop = !entry.isIntersecting && entry.boundingClientRect.bottom < 8;
                        floatBar.classList.toggle('is-visible', passedTop);
                    }, { threshold: 0 });
                    io.observe(toolbar);
                } else {
                    window.addEventListener('scroll', updateFloatingVisibility, { passive: true });
                }
                updateFloatingVisibility();
            }
            document.getElementById('tk-btn-clear-cache').onclick = () => {
                const { coverCount, entryCount } = CacheManager.clearAll();
                const cards = document.querySelectorAll('.tk-media-card');
                const codes = new Set();
                cards.forEach(card => {
                    const img = card.querySelector('.tk-cover-img');
                    const skeleton = card.querySelector('.tk-skeleton');
                    const fallback = card.querySelector('.tk-cover-fallback');
                    if (img) {
                        img.onload = null;
                        img.onerror = null;
                        img.classList.remove('loaded');
                        img.removeAttribute('src');
                    }
                    if (skeleton) skeleton.style.display = '';
                    if (fallback) fallback.style.display = 'none';
                    if (card.dataset.code) codes.add(card.dataset.code);
                });
                codes.forEach(code => QueueManager.add(code));
                const clearBtn = document.getElementById('tk-btn-clear-cache');
                if (clearBtn) {
                    clearBtn.textContent = '✅ 已清除';
                    setTimeout(() => { clearBtn.textContent = '🗑️ 清缓存'; }, 1800);
                }
                if (typeof App !== 'undefined' && App.showStatusBanner) {
                    App.showStatusBanner(`已清除 ${coverCount} 条封面缓存与 ${entryCount} 组翻页缓存，正在重新拉取当前页封面...`, true);
                }
            };
            document.getElementById('tk-btn-config').onclick = () => ModalManager.showSettings();
            if (typeof FavoritesManager !== 'undefined') {
                FavoritesManager.syncUI();
            }
            this.syncConfigDimensions();

            // 熔断或纯 JavDB 优先模式下的顶部引导状态
            if (typeof JavDBService !== 'undefined' && JavDBService.isCircuitBroken()) {
                const untilLabel = JavDBService.getBlockedUntilLabel();
                const mode = state.settings.coverSourceMode || CONFIG.defaults.coverSourceMode;
                this.showJavdbNotice({
                    level: 'warning',
                    message: `JavDB 账号处于风控冷却保护中${untilLabel ? `（预计 ${untilLabel} 恢复）` : ''}，已自动由 JAV321 / MissAV 高清源接管封面加载。`,
                    showLoginLink: true,
                    showRetry: false,
                    showResetCircuit: true,
                    showUseMissavOnly: mode !== 'no_javdb' && mode !== 'missav_only'
                });
            } else {
                const loginTipDismissed = typeof GM_getValue === 'function'
                    ? GM_getValue('tk_javdb_login_tip_dismissed', false)
                    : false;
                const mode = state.settings.coverSourceMode || CONFIG.defaults.coverSourceMode;
                if (!loginTipDismissed && mode === 'javdb_first' && state.javdbSuccessCount === 0) {
                    this.showJavdbNotice({
                        level: 'info',
                        message: '💡 提示：当前为 JavDB 优先模式，若无法加载封面，请先登录 JavDB 或在配置中切换 JAV321/MissAV 分摊模式。',
                        showRetry: false,
                        showDismissForever: true
                    });
                }
            }
        },

        showJavdbNotice({
            level = 'warning',
            message,
            showLoginLink = true,
            showRetry = true,
            showResetCircuit = false,
            showUseMissavOnly = false,
            showDismissForever = false
        } = {}) {
            const notice = document.getElementById('tk-javdb-notice');
            if (!notice) return;

            state.javdbNoticeLevel = level;
            notice.className = `tk-javdb-notice tk-javdb-notice--${level} is-visible`;
            notice.textContent = '';

            const textEl = document.createElement('div');
            textEl.className = 'tk-javdb-notice-text';
            textEl.textContent = message || '请先前往 JavDB 登录账号以正常拉取封面。';
            notice.appendChild(textEl);

            const actionsEl = document.createElement('div');
            actionsEl.className = 'tk-javdb-notice-actions';

            if (showLoginLink) {
                const loginLink = document.createElement('a');
                loginLink.className = 'tk-javdb-notice-btn tk-javdb-notice-btn--primary';
                loginLink.href = 'https://javdb.com/login';
                loginLink.target = '_blank';
                loginLink.rel = 'noopener noreferrer';
                loginLink.textContent = '🔐 前往 JavDB';
                actionsEl.appendChild(loginLink);
            }

            if (showResetCircuit) {
                const resetBtn = document.createElement('button');
                resetBtn.type = 'button';
                resetBtn.className = 'tk-javdb-notice-btn tk-javdb-notice-btn--secondary';
                resetBtn.textContent = '🔓 解除熔断并重试';
                resetBtn.onclick = () => QueueManager.resetCircuitAndRetry();
                actionsEl.appendChild(resetBtn);
            } else if (showRetry) {
                const retryBtn = document.createElement('button');
                retryBtn.type = 'button';
                retryBtn.className = 'tk-javdb-notice-btn tk-javdb-notice-btn--secondary';
                retryBtn.textContent = '↻ 我已登录，重试拉取';
                retryBtn.onclick = () => QueueManager.resumeAfterLogin();
                actionsEl.appendChild(retryBtn);
            }

            if (showUseMissavOnly) {
                const missavBtn = document.createElement('button');
                missavBtn.type = 'button';
                missavBtn.className = 'tk-javdb-notice-btn tk-javdb-notice-btn--secondary';
                missavBtn.textContent = '⚡ 切换零 JavDB';
                missavBtn.onclick = () => {
                    state.settings.coverSourceMode = 'no_javdb';
                    SettingsManager.save();
                    QueueManager.onSettingsChanged();
                    this.hideJavdbNotice();
                    if (typeof App !== 'undefined' && App.showStatusBanner) {
                        App.showStatusBanner('已切换为零 JavDB 模式（仅使用 JAV321 与 MissAV 高清封面）。', true);
                    }
                };
                actionsEl.appendChild(missavBtn);
            }

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'tk-javdb-notice-btn tk-javdb-notice-btn--ghost';
            closeBtn.textContent = showDismissForever ? '不再提示' : '✕ 关闭';
            closeBtn.onclick = () => {
                if (showDismissForever && typeof GM_setValue === 'function') {
                    GM_setValue('tk_javdb_login_tip_dismissed', true);
                }
                this.hideJavdbNotice();
            };
            actionsEl.appendChild(closeBtn);

            notice.appendChild(actionsEl);
        },

        hideJavdbNotice() {
            const notice = document.getElementById('tk-javdb-notice');
            if (!notice) return;
            state.javdbNoticeLevel = null;
            notice.classList.remove('is-visible');
        },

        syncConfigDimensions() {
            const { coverWidth, pageMaxWidth } = state.settings;
            document.documentElement.style.setProperty('--tk-card-width', `${coverWidth}px`);
            document.documentElement.style.setProperty('--tk-page-max-width', `${pageMaxWidth || 1200}px`);
        },

        refreshDrawerFavState() {
            const data = state.activeDrawerData;
            const drawer = document.getElementById('tk-detail-drawer');
            if (!data || !drawer || !drawer.classList.contains('active')) return;
            const favCatSelect = document.getElementById('tk-drawer-fav-cat');
            const favBtn = document.getElementById('tk-drawer-fav-btn');
            if (!favCatSelect || !favBtn || typeof FavoritesManager === 'undefined') return;

            const existing = FavoritesManager.findByData(data);
            const folders = FavoritesManager.getFolders();
            favCatSelect.textContent = '';
            folders.forEach(folder => {
                const opt = document.createElement('option');
                opt.value = folder.id;
                opt.textContent = folder.name;
                favCatSelect.appendChild(opt);
            });
            const fallbackId = FavoritesManager.getFolderById(state.favLastFolderId)
                ? state.favLastFolderId
                : FavoritesManager.DEFAULT_FOLDER_ID;
            favCatSelect.value = existing && FavoritesManager.getFolderById(existing.folderId)
                ? existing.folderId
                : fallbackId;
            favBtn.textContent = existing ? '★ 取消收藏' : '☆ 收藏此资源';
            favBtn.style.background = existing ? 'rgba(128, 88, 22, 0.16)' : '';
            favBtn.style.color = existing ? '#805816' : '';
        },

        showDrawer(data, debugInfo) {
            state.activeDrawerData = data;
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

            const favCatSelect = document.getElementById('tk-drawer-fav-cat');
            const favBtn = document.getElementById('tk-drawer-fav-btn');
            if (favCatSelect && favBtn && typeof FavoritesManager !== 'undefined') {
                this.refreshDrawerFavState();

                favCatSelect.onchange = () => {
                    const existing = FavoritesManager.findByData(data);
                    if (existing) {
                        FavoritesManager.moveItem(existing.id, favCatSelect.value);
                    } else {
                        state.favLastFolderId = favCatSelect.value;
                    }
                };

                favBtn.onclick = () => {
                    const existing = FavoritesManager.findByData(data);
                    if (existing) {
                        FavoritesManager.remove(existing.id);
                    } else {
                        const card = document.getElementById(`tk-card-${data.rowKey.replace(/[^a-zA-Z0-9_-]/g, '')}`);
                        const img = card && card.querySelector('.tk-cover-img');
                        const coverUrl = (img && img.src && img.src.startsWith('http')) ? img.src : '';
                        FavoritesManager.addOrUpdate(data, favCatSelect.value, coverUrl);
                    }
                };
            }

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
            state.activeDrawerData = null;
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
            state.cardDataMap.set(data.rowKey, data);

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

            // 底部 2x2 按钮区（复制磁力 / 收藏 / MissAV / JavDB）
            const actions = document.createElement('div');
            actions.className = 'tk-card-actions';

            const magnetBtn = document.createElement('button');
            magnetBtn.type = 'button';
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

            const favBtn = document.createElement('button');
            favBtn.type = 'button';
            favBtn.className = 'tk-btn-modern tk-btn-fav';
            if (typeof FavoritesManager !== 'undefined') {
                FavoritesManager.applyButtonState(favBtn, data);
            } else {
                favBtn.textContent = '☆ 收藏';
            }
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                CardFactory.handleFavButtonClick(favBtn, data, img);
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

            actions.append(magnetBtn, favBtn, missavAnchor, javdbAnchor);
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
        },

        _activePopoverCleanup: null,

        closeAllFavPopovers() {
            if (typeof this._activePopoverCleanup === 'function') {
                this._activePopoverCleanup();
                this._activePopoverCleanup = null;
            }
            document.querySelectorAll('.tk-fav-popover').forEach(el => el.remove());
        },

        handleFavButtonClick(favBtn, data, img) {
            const currentOpen = document.querySelector(`.tk-fav-popover[data-for-row="${CSS.escape(data.rowKey)}"]`);
            this.closeAllFavPopovers();
            if (currentOpen) return;

            const currentUrl = (img && img.src && /^https?:\/\//i.test(img.src)) ? img.src : '';
            const existing = FavoritesManager.findByData(data);

            const popover = document.createElement('div');
            popover.className = 'tk-fav-popover';
            popover.dataset.forRow = data.rowKey;
            popover.addEventListener('click', (e) => e.stopPropagation());

            const title = document.createElement('div');
            title.className = 'tk-fav-popover-title';
            title.textContent = existing
                ? `已收藏「${data.code}」，点击切换夹：`
                : `收藏「${data.code}」到：`;

            const foldersWrap = document.createElement('div');
            foldersWrap.className = 'tk-fav-popover-cats';
            FavoritesManager.getFolders().forEach(folder => {
                const chip = document.createElement('button');
                chip.type = 'button';
                const isActive = Boolean(existing && existing.folderId === folder.id);
                chip.className = `tk-fav-cat-chip${isActive ? ' is-active' : ''}`;
                chip.textContent = folder.name;
                chip.onclick = () => {
                    FavoritesManager.addOrUpdate(data, folder.id, currentUrl);
                    this.closeAllFavPopovers();
                };
                foldersWrap.appendChild(chip);
            });

            const newWrap = document.createElement('div');
            newWrap.className = 'tk-fav-popover-new';
            const newInput = document.createElement('input');
            newInput.type = 'text';
            newInput.placeholder = '新收藏夹名称...';
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.textContent = '新建并存入';
            const createAndSave = () => {
                const name = newInput.value.trim();
                if (!name) return;
                const res = FavoritesManager.addFolder(name);
                if (!res.ok) {
                    const existingFolder = FavoritesManager.getFolders().find(f => f.name === name);
                    if (existingFolder) {
                        FavoritesManager.addOrUpdate(data, existingFolder.id, currentUrl);
                        this.closeAllFavPopovers();
                    } else {
                        alert(res.error);
                    }
                    return;
                }
                FavoritesManager.addOrUpdate(data, res.folder.id, currentUrl);
                this.closeAllFavPopovers();
            };
            addBtn.onclick = createAndSave;
            newInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    createAndSave();
                }
            });
            newWrap.append(newInput, addBtn);

            popover.append(title, foldersWrap, newWrap);

            if (existing) {
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'tk-fav-popover-remove';
                removeBtn.textContent = '🗑️ 取消收藏';
                removeBtn.onclick = () => {
                    FavoritesManager.remove(existing.id);
                    this.closeAllFavPopovers();
                };
                popover.appendChild(removeBtn);
            }

            // 挂载到 document.body 并动态计算视口坐标，防止被卡片 overflow:hidden 裁切
            popover.style.visibility = 'hidden';
            document.body.appendChild(popover);

            const positionPopover = () => {
                if (!document.body.contains(favBtn) || !document.body.contains(popover)) return;
                const btnRect = favBtn.getBoundingClientRect();
                const popW = Math.min(256, window.innerWidth - 16);
                popover.style.width = `${popW}px`;
                const popH = popover.offsetHeight || 180;

                let left = btnRect.right - popW;
                if (left < 8) left = Math.max(8, btnRect.left);
                if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;

                const spaceBelow = window.innerHeight - btnRect.bottom - 8;
                const spaceAbove = btnRect.top - 8;
                let top;
                if (spaceBelow >= popH || spaceBelow >= spaceAbove) {
                    top = Math.min(window.innerHeight - popH - 8, btnRect.bottom + 6);
                } else {
                    top = Math.max(8, btnRect.top - popH - 6);
                }
                popover.style.left = `${Math.round(left)}px`;
                popover.style.top = `${Math.round(top)}px`;
                popover.style.visibility = 'visible';
            };

            positionPopover();

            const onOutside = (ev) => {
                if (!popover.contains(ev.target) && ev.target !== favBtn && !favBtn.contains(ev.target)) {
                    this.closeAllFavPopovers();
                }
            };
            const onViewportChange = () => this.closeAllFavPopovers();
            const bindTimer = setTimeout(() => {
                document.addEventListener('click', onOutside);
                window.addEventListener('scroll', onViewportChange, true);
                window.addEventListener('resize', onViewportChange);
            }, 0);

            this._activePopoverCleanup = () => {
                clearTimeout(bindTimer);
                document.removeEventListener('click', onOutside);
                window.removeEventListener('scroll', onViewportChange, true);
                window.removeEventListener('resize', onViewportChange);
            };
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
            const { url, javdbSearchUrl, coverId, fallbackLabel, fallbackCoverUrl } = payload;
            const code = card.dataset.code || (debugInfo && debugInfo.code) || '';
            const coverUrl = payload.coverUrl || (coverId ? JavDBService.getCoverUrl(coverId) : '');
            const img = card.querySelector('.tk-cover-img');
            const skeleton = card.querySelector('.tk-skeleton');
            const fallback = card.querySelector('.tk-cover-fallback');
            const javdbBtn = card.querySelector('.tk-btn-javdb');

            if (javdbBtn) {
                if (url) {
                    javdbBtn.href = url;
                    javdbBtn.textContent = '🔗 JavDB';
                    javdbBtn.title = '打开 JavDB 详情页';
                    javdbBtn.classList.remove('disabled');
                } else if (javdbSearchUrl || code) {
                    javdbBtn.href = javdbSearchUrl || JavDBService.getSearchUrl(code);
                    javdbBtn.textContent = '🔍 JavDB';
                    javdbBtn.title = '前往 JavDB 搜索该番号';
                    javdbBtn.classList.remove('disabled');
                } else {
                    javdbBtn.href = '#';
                    javdbBtn.textContent = '🔗 JavDB';
                    javdbBtn.title = '';
                    javdbBtn.classList.add('disabled');
                }
            }

            if (img && skeleton) {
                if (coverUrl) {
                    let triedFallbackUrl = false;
                    img.referrerPolicy = 'no-referrer';
                    img.classList.remove('loaded');
                    skeleton.style.display = '';
                    if (fallback) fallback.style.display = 'none';
                    img.onload = () => {
                        if (debugInfo) debugInfo.imageLoadSuccess = true;
                        img.classList.add('loaded');
                        skeleton.style.display = 'none';
                        if (fallback) fallback.style.display = 'none';

                        // 若收藏时封面尚未就绪，加载完成后自动抓取 WebP 并回填分片缓存
                        const rowKey = card.dataset.rowKey;
                        const cardData = rowKey && state.cardDataMap.get(rowKey);
                        if (cardData && typeof FavoritesManager !== 'undefined' && typeof CoverMediaStore !== 'undefined') {
                            const fav = FavoritesManager.findByData(cardData);
                            if (fav && /^https?:\/\//i.test(img.src) && !CoverMediaStore.hasLocalCover(fav.id)) {
                                CoverMediaStore.captureFromUrl(fav.id, img.src);
                            }
                        }
                    };
                    img.onerror = () => {
                        if (!triedFallbackUrl && fallbackCoverUrl && fallbackCoverUrl !== img.src) {
                            triedFallbackUrl = true;
                            if (debugInfo) debugInfo.coverUrl = fallbackCoverUrl;
                            img.src = fallbackCoverUrl;
                            return;
                        }
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
            overlay.className = 'tk-modal-overlay';
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
            const sourceMap = {
                jav321: 'JAV321 (DMM/MGS 800px 原图)',
                missav: 'MissAV CDN (fourhoi 高清)',
                javdb: 'JavDB'
            };
            const modeMap = {
                jav321_first: 'JAV321 原图优先 (MissAV 高清 / JavDB 兜底)',
                balanced: '高清双源交替分摊 (JAV321 / MissAV 各半)',
                missav_first: 'MissAV 高清优先 (JAV321 / JavDB 兜底)',
                javdb_first: 'JavDB 优先 (异常或未命中切 JAV321 / MissAV)',
                no_javdb: '零 JavDB 模式 (仅 JAV321 + MissAV 高清)',
                missav_only: '零 JavDB 模式 (仅 JAV321 + MissAV 高清)'
            };
            const sourceLabel = sourceMap[debugInfo.coverSource] || (debugInfo.foundResult ? '未知来源' : '未命中');
            const modeLabel = modeMap[debugInfo.mode] || debugInfo.mode || '默认';
            return `>> SYSTEM DIAGNOSTICS: COVER ENGINE
    ============================================================
    [+] 番号: ${debugInfo.code}
    [+] 调度策略: ${modeLabel}
    [+] 封面来源: ${sourceLabel}
    [+] 时间戳: ${debugInfo.timestamp}
    [+] JAV321 状态: ${debugInfo.jav321Status || '未请求'}
    [+] MissAV 状态: ${debugInfo.missavStatus || '未请求'}
    [+] JavDB 请求: ${debugInfo.fetchUrl || '未请求'}
    [+] JavDB 状态: ${debugInfo.fetchStatus || '未请求'}${retryLine}
    [+] 命中成功: ${debugInfo.foundResult ? '[ 是 ]' : '[ 否 ]'}
    [+] JavDB 地址: ${debugInfo.javdbUrl || '无'}
    [+] 封面地址: ${debugInfo.coverUrl || '无'}
    [+] 封面加载: ${debugInfo.imageLoadSuccess !== undefined ? (debugInfo.imageLoadSuccess ? '[ 成功 ]' : '[ 失败 ]') : '[ 排队中 ]'}
    [!] 错误捕获: ${debugInfo.errorMessage || '无异常'}
    ============================================================`;
        },

        showSettings() {
            const panel = document.createElement('div');
            panel.style.cssText = StyleUtils.modal({ maxWidth: '430px' });
            const rawMode = state.settings.coverSourceMode || CONFIG.defaults.coverSourceMode;
            const currentMode = rawMode === 'missav_only' ? 'no_javdb' : rawMode;

            panel.innerHTML = `
                <h3 style="margin: 0 0 20px 0; color: #2A2118; font-weight: 700; font-family: var(--tk-font-display);">网格显示配置</h3>
                <div style="background: rgba(255,255,255,0.4); border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid rgba(61, 50, 38, 0.08);">
                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; justify-content: space-between; font-size: 13px; color: var(--tk-text-muted); margin-bottom: 8px;">
                            <span>封面来源与压力分摊</span>
                        </label>
                        <select id="cover-source-select" style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(61, 50, 38, 0.2); background: rgba(255,255,255,0.85); color: #2A2118; font-size: 13px; outline: none;">
                            <option value="jav321_first">JAV321/DMM 原图优先（推荐：800px 无水印，MissAV/JavDB 兜底）</option>
                            <option value="balanced">双源高清交替分摊（JAV321 与 MissAV 高清各半，JavDB 兜底）</option>
                            <option value="missav_first">MissAV 高清优先（800px cover-n，JAV321/JavDB 兜底）</option>
                            <option value="javdb_first">JavDB 优先（限流/停用时自动切 JAV321 与 MissAV）</option>
                            <option value="no_javdb">零 JavDB 模式（仅 JAV321 + MissAV 高清，防封/冷却期适用）</option>
                        </select>
                    </div>
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

            const coverSourceSelect = panel.querySelector('#cover-source-select');
            coverSourceSelect.value = currentMode;
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
                coverSourceSelect.value = CONFIG.defaults.coverSourceMode;
                pageWidthSlider.value = CONFIG.defaults.pageMaxWidth;
                pageWidthValue.textContent = CONFIG.defaults.pageMaxWidth;
                pagesSlider.value = CONFIG.defaults.maxPagesToFetch;
                pagesValue.textContent = CONFIG.defaults.maxPagesToFetch;
                widthSlider.value = CONFIG.defaults.coverWidth;
                widthValue.textContent = CONFIG.defaults.coverWidth;
            });

            const saveBtn = this.createButton('保存', () => {
                const prevMode = state.settings.coverSourceMode || CONFIG.defaults.coverSourceMode;
                const nextMode = coverSourceSelect.value;
                state.settings.coverSourceMode = nextMode;
                state.settings.pageMaxWidth = parseInt(pageWidthSlider.value, 10);
                state.settings.maxPagesToFetch = parseInt(pagesSlider.value, 10);
                state.settings.coverWidth = parseInt(widthSlider.value, 10);
                SettingsManager.save();
                UIUpdater.updateAllCovers();
                if (prevMode !== nextMode && typeof QueueManager.onSettingsChanged === 'function') {
                    QueueManager.onSettingsChanged();
                }
                overlay.remove();
            });

            buttonsContainer.append(resetBtn, saveBtn);
        },

        openPromptModal({ title, placeholder = '', initialValue = '', confirmText = '确认', onConfirm }) {
            const box = document.createElement('div');
            box.style.cssText = StyleUtils.modal({ maxWidth: '400px', padding: '20px' });

            const heading = document.createElement('h4');
            heading.style.cssText = 'margin: 0 0 12px 0; color: var(--tk-earth-darker); font-family: var(--tk-font-display); font-size: 16px;';
            heading.textContent = title;

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'tk-input-modern';
            input.style.cssText = 'width: 100%; box-sizing: border-box; margin-bottom: 14px;';
            input.placeholder = placeholder;
            input.value = initialValue;

            const btns = document.createElement('div');
            btns.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px;';

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'tk-fav-mini-btn';
            cancelBtn.textContent = '取消';

            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.className = 'tk-fav-mini-btn is-primary';
            okBtn.textContent = confirmText;

            btns.append(cancelBtn, okBtn);
            box.append(heading, input, btns);

            const overlay = this.createOverlay(box);
            cancelBtn.onclick = () => overlay.remove();

            const submit = () => {
                const val = input.value.trim();
                if (!val) return;
                const keepOpen = onConfirm && onConfirm(val, overlay) === false;
                if (!keepOpen) overlay.remove();
            };
            okBtn.onclick = submit;
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                }
            });
            setTimeout(() => { input.focus(); input.select(); }, 30);
        },

        openDeleteFolderModal(folder, itemCount, onDeleted) {
            const box = document.createElement('div');
            box.style.cssText = StyleUtils.modal({ maxWidth: '440px', padding: '22px' });

            const heading = document.createElement('h4');
            heading.style.cssText = 'margin: 0 0 10px 0; color: var(--tk-earth-darker); font-family: var(--tk-font-display); font-size: 16px;';
            heading.textContent = `删除收藏夹「${folder.name}」`;

            const desc = document.createElement('p');
            desc.style.cssText = 'margin: 0 0 16px 0; font-size: 13px; line-height: 1.6; color: var(--tk-text-muted);';
            desc.textContent = itemCount > 0
                ? `该收藏夹内包含 ${itemCount} 条收藏记录，请选择对夹内条目的处理方式：`
                : `确认删除空收藏夹「${folder.name}」？`;

            const actions = document.createElement('div');
            actions.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

            const overlay = this.createOverlay(box);

            if (itemCount > 0) {
                const moveBtn = document.createElement('button');
                moveBtn.type = 'button';
                moveBtn.className = 'tk-fav-mini-btn is-primary';
                moveBtn.style.padding = '9px 12px';
                moveBtn.textContent = `📦 条目移回「${FavoritesManager.DEFAULT_FOLDER_NAME}」并删除夹`;
                moveBtn.onclick = () => {
                    FavoritesManager.deleteFolder(folder.id, 'move_to_default');
                    overlay.remove();
                    if (onDeleted) onDeleted();
                };

                const purgeBtn = document.createElement('button');
                purgeBtn.type = 'button';
                purgeBtn.className = 'tk-fav-mini-btn is-danger';
                purgeBtn.style.padding = '9px 12px';
                purgeBtn.textContent = `🗑️ 连同夹内 ${itemCount} 条收藏一起删除`;
                purgeBtn.onclick = () => {
                    FavoritesManager.deleteFolder(folder.id, 'delete_items');
                    overlay.remove();
                    if (onDeleted) onDeleted();
                };

                actions.append(moveBtn, purgeBtn);
            } else {
                const confirmBtn = document.createElement('button');
                confirmBtn.type = 'button';
                confirmBtn.className = 'tk-fav-mini-btn is-danger';
                confirmBtn.style.padding = '9px 12px';
                confirmBtn.textContent = '🗑️ 确认删除';
                confirmBtn.onclick = () => {
                    FavoritesManager.deleteFolder(folder.id, 'move_to_default');
                    overlay.remove();
                    if (onDeleted) onDeleted();
                };
                actions.appendChild(confirmBtn);
            }

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'tk-fav-mini-btn';
            cancelBtn.style.padding = '8px 12px';
            cancelBtn.textContent = '取消';
            cancelBtn.onclick = () => overlay.remove();

            actions.appendChild(cancelBtn);
            box.append(heading, desc, actions);
        },

        openLightbox(src, titleText = '') {
            if (!src) return;
            const overlay = document.createElement('div');
            overlay.className = 'tk-lightbox-overlay';

            const wrap = document.createElement('div');
            wrap.className = 'tk-lightbox-content';

            const img = document.createElement('img');
            img.src = src;
            img.alt = titleText || '预览大图';
            img.referrerPolicy = 'no-referrer';

            const caption = document.createElement('div');
            caption.className = 'tk-lightbox-caption';
            caption.textContent = titleText || '';

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'tk-lightbox-close';
            closeBtn.textContent = '✕';

            wrap.append(img, caption, closeBtn);
            overlay.appendChild(wrap);
            document.body.appendChild(overlay);

            const close = () => {
                document.removeEventListener('keydown', onKey);
                overlay.remove();
            };
            const onKey = (e) => {
                if (e.key === 'Escape') close();
            };
            document.addEventListener('keydown', onKey);
            closeBtn.onclick = close;
            overlay.onclick = (e) => {
                if (e.target === overlay) close();
            };
        },

        async loadFavoritePreview(item, imgEl, options = {}) {
            const { onEmptyOrFail = null, onLoaded = null } = options;
            if (!item || !imgEl) return;

            const applyDataUrl = (src) => {
                imgEl.dataset.resolvedSrc = src;
                imgEl.src = src;
                imgEl.style.display = 'block';
                if (onLoaded) onLoaded(src);
            };

            // 1. 优先读取本地 WebP 分片缓存
            const local = CoverMediaStore.getLocalCover(item.id);
            if (local) {
                applyDataUrl(local);
                return;
            }

            // 2. 本地缺失且云端存在时，异步从 CF Worker 拉取解密并缓存到本地
            if (item.hasCover && SyncEngine.isConfigured()) {
                const remoteDataUrl = await SyncEngine.fetchAndCacheRemoteCover(item.id);
                if (remoteDataUrl) {
                    applyDataUrl(remoteDataUrl);
                    return;
                }
            }

            // 3. 降级使用外链 coverUrl 并在后台抓取转存 WebP
            if (item.coverUrl && /^https?:\/\//i.test(item.coverUrl)) {
                imgEl.referrerPolicy = 'no-referrer';
                imgEl.onload = () => {
                    imgEl.style.display = 'block';
                    if (onLoaded) onLoaded(item.coverUrl);
                    if (!CoverMediaStore.hasLocalCover(item.id)) {
                        CoverMediaStore.captureFromUrl(item.id, item.coverUrl).then((webPUrl) => {
                            if (webPUrl && document.body.contains(imgEl)) {
                                imgEl.dataset.resolvedSrc = webPUrl;
                                imgEl.src = webPUrl;
                            }
                        });
                    }
                };
                imgEl.onerror = () => {
                    imgEl.style.display = 'none';
                    if (onEmptyOrFail) onEmptyOrFail();
                };
                imgEl.dataset.resolvedSrc = item.coverUrl;
                imgEl.src = item.coverUrl;
                return;
            }

            imgEl.style.display = 'none';
            if (onEmptyOrFail) onEmptyOrFail();
        },

        showFavorites() {
            const panel = document.createElement('div');
            panel.className = 'tk-fav-modal';
            panel.style.cssText = StyleUtils.modal({ maxWidth: '980px', maxHeight: '90vh', padding: '20px' });
            const overlay = this.createOverlay(panel);

            const viewState = {
                view: 'folders', // 'folders' | 'detail' | 'sync'
                activeFolderId: FavoritesManager.DEFAULT_FOLDER_ID,
                globalQuery: '',
                detailQuery: '',
                pendingImport: null
            };

            const bodyWrap = document.createElement('div');
            bodyWrap.className = 'tk-fav-modal-body';
            panel.appendChild(bodyWrap);

            const buildSyncPill = () => {
                const pill = document.createElement('button');
                pill.type = 'button';
                pill.className = `tk-sync-pill is-${state.syncStatus.state || 'unconfigured'}`;
                pill.textContent = state.syncStatus.label || '未配置云同步';
                pill.title = state.syncStatus.error || '点击管理云端同步与本地备份';
                pill.onclick = () => {
                    viewState.view = 'sync';
                    renderCurrentView();
                };
                return pill;
            };

            const copyMagnets = (items, btnEl, defaultText) => {
                const magnets = items.map(i => i.magnet).filter(Boolean);
                if (magnets.length === 0) {
                    alert('当前范围下没有可复制的磁力链接。');
                    return;
                }
                Utils.copyText(magnets.join('\n')).then(() => {
                    btnEl.textContent = `✅ 已复制 ${magnets.length} 条`;
                    setTimeout(() => { btnEl.textContent = defaultText; }, 1500);
                });
            };

            const renderDetailCard = (item, onMutate) => {
                const card = document.createElement('div');
                card.className = 'tk-fav-detail-card';

                // 16:10 大图封面区
                const coverBox = document.createElement('div');
                coverBox.className = 'tk-fav-detail-cover';

                const imgEl = document.createElement('img');
                imgEl.className = 'tk-fav-detail-img';
                imgEl.alt = item.code || '封面';
                imgEl.style.display = 'none';

                const placeholder = document.createElement('div');
                placeholder.className = 'tk-fav-detail-cover-empty';

                const emptyText = document.createElement('span');
                emptyText.textContent = '暂无本地封面';

                const refetchBtn = document.createElement('button');
                refetchBtn.type = 'button';
                refetchBtn.className = 'tk-fav-mini-btn';
                refetchBtn.textContent = '🔄 补抓封面';
                refetchBtn.onclick = async (e) => {
                    e.stopPropagation();
                    refetchBtn.disabled = true;
                    refetchBtn.textContent = '⏳ 抓取中...';
                    try {
                        const resolvedUrl = await QueueManager.resolveCoverOnce(item.code);
                        if (!resolvedUrl) {
                            emptyText.textContent = '多源暂未收录该番号封面';
                            refetchBtn.textContent = '🔄 重试补抓';
                            refetchBtn.disabled = false;
                            return;
                        }
                        const webpUrl = await CoverMediaStore.captureFromUrl(item.id, resolvedUrl, { force: true });
                        if (webpUrl) {
                            imgEl.dataset.resolvedSrc = webpUrl;
                            imgEl.src = webpUrl;
                            imgEl.style.display = 'block';
                            placeholder.style.display = 'none';
                        } else {
                            item.coverUrl = resolvedUrl;
                            item.updatedAt = FavoritesManager.nowTs();
                            FavoritesManager.save();
                            imgEl.referrerPolicy = 'no-referrer';
                            imgEl.dataset.resolvedSrc = resolvedUrl;
                            imgEl.src = resolvedUrl;
                            imgEl.style.display = 'block';
                            placeholder.style.display = 'none';
                        }
                    } catch {
                        refetchBtn.textContent = '🔄 重试补抓';
                        refetchBtn.disabled = false;
                    }
                };

                placeholder.append(emptyText, refetchBtn);
                coverBox.append(imgEl, placeholder);

                imgEl.addEventListener('click', () => {
                    const src = imgEl.dataset.resolvedSrc || imgEl.src;
                    if (src) this.openLightbox(src, `${item.code} · ${item.title || ''}`);
                });

                this.loadFavoritePreview(item, imgEl, {
                    onLoaded: () => {
                        placeholder.style.display = 'none';
                    },
                    onEmptyOrFail: () => {
                        placeholder.style.display = 'flex';
                    }
                });

                // 内容区
                const infoBox = document.createElement('div');
                infoBox.className = 'tk-fav-detail-body';

                const metaRow = document.createElement('div');
                metaRow.className = 'tk-fav-item-meta';

                const codeBadge = document.createElement('span');
                codeBadge.className = 'tk-card-code';
                codeBadge.style.cursor = 'pointer';
                codeBadge.title = '点击复制番号';
                codeBadge.textContent = item.code || 'UNKNOWN';
                codeBadge.onclick = () => {
                    Utils.copyText(item.code).then(() => {
                        const old = codeBadge.textContent;
                        codeBadge.textContent = `✅ ${old}`;
                        setTimeout(() => { codeBadge.textContent = old; }, 1000);
                    });
                };

                const sizeDate = document.createElement('span');
                sizeDate.className = 'tk-card-meta';
                sizeDate.textContent = `${item.size || '未知'} · 📅 ${item.date || '未知'}`;

                const folderSelect = document.createElement('select');
                folderSelect.className = 'tk-fav-folder-select';
                FavoritesManager.getFolders().forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.id;
                    opt.textContent = f.name;
                    folderSelect.appendChild(opt);
                });
                folderSelect.value = FavoritesManager.getFolderById(item.folderId)
                    ? item.folderId
                    : FavoritesManager.DEFAULT_FOLDER_ID;
                folderSelect.onchange = () => {
                    FavoritesManager.moveItem(item.id, folderSelect.value);
                    if (onMutate) onMutate();
                };

                metaRow.append(codeBadge, sizeDate, folderSelect);

                const titleEl = document.createElement('div');
                titleEl.className = 'tk-fav-detail-title';
                titleEl.title = item.title || item.code;
                titleEl.textContent = item.title || item.code;

                // 独立等宽磁力链区域 + 复制/唤起按钮
                const magnetSection = document.createElement('div');
                magnetSection.className = 'tk-fav-magnet-box';

                const magnetText = document.createElement('div');
                magnetText.className = 'tk-fav-magnet-mono';
                magnetText.textContent = item.magnet || '无磁力链接';

                const magnetBtns = document.createElement('div');
                magnetBtns.className = 'tk-fav-magnet-actions';

                const copyMagBtn = document.createElement('button');
                copyMagBtn.type = 'button';
                copyMagBtn.className = 'tk-fav-mini-btn is-primary';
                copyMagBtn.textContent = '🧲 复制磁力';
                copyMagBtn.onclick = () => {
                    if (!item.magnet) return;
                    Utils.copyText(item.magnet).then(() => {
                        copyMagBtn.textContent = '✅ 已复制';
                        setTimeout(() => { copyMagBtn.textContent = '🧲 复制磁力'; }, 1200);
                    });
                };

                const launchMagLink = document.createElement('a');
                launchMagLink.className = 'tk-fav-mini-btn';
                launchMagLink.href = item.magnet || '#';
                launchMagLink.textContent = '⚡ 唤起下载';
                if (!item.magnet) {
                    launchMagLink.style.pointerEvents = 'none';
                    launchMagLink.style.opacity = '0.5';
                }

                magnetBtns.append(copyMagBtn, launchMagLink);
                magnetSection.append(magnetText, magnetBtns);

                // 管理与外链
                const footerActions = document.createElement('div');
                footerActions.className = 'tk-fav-item-actions';

                const missavLink = document.createElement('a');
                missavLink.className = 'tk-fav-mini-btn';
                missavLink.href = `https://missav.ws/cn/${encodeURIComponent(item.code)}`;
                missavLink.target = '_blank';
                missavLink.rel = 'noopener noreferrer';
                missavLink.textContent = '▶ MissAV';

                const javdbLink = document.createElement('a');
                javdbLink.className = 'tk-fav-mini-btn';
                javdbLink.href = JavDBService.getSearchUrl(item.code);
                javdbLink.target = '_blank';
                javdbLink.rel = 'noopener noreferrer';
                javdbLink.textContent = '🔍 JavDB';

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'tk-fav-mini-btn is-danger';
                removeBtn.style.marginLeft = 'auto';
                removeBtn.textContent = '🗑️ 移出收藏';
                removeBtn.onclick = () => {
                    FavoritesManager.remove(item.id);
                    if (onMutate) onMutate();
                };

                footerActions.append(missavLink, javdbLink, removeBtn);
                infoBox.append(metaRow, titleEl, magnetSection, footerActions);
                card.append(coverBox, infoBox);
                return card;
            };

            const renderFoldersView = () => {
                bodyWrap.textContent = '';

                const header = document.createElement('div');
                header.className = 'tk-fav-modal-header';

                const titleEl = document.createElement('h3');
                titleEl.className = 'tk-fav-modal-title';
                const totalItems = FavoritesManager.getItems().length;
                titleEl.textContent = `⭐ 我的收藏夹（${totalItems}）`;

                const topActions = document.createElement('div');
                topActions.className = 'tk-fav-top-actions';

                const newFolderBtn = document.createElement('button');
                newFolderBtn.type = 'button';
                newFolderBtn.className = 'tk-fav-mini-btn is-primary';
                newFolderBtn.textContent = '+ 新建收藏夹';
                newFolderBtn.onclick = () => {
                    this.openPromptModal({
                        title: '新建收藏夹',
                        placeholder: '输入收藏夹名称...',
                        confirmText: '创建',
                        onConfirm: (name) => {
                            const res = FavoritesManager.addFolder(name);
                            if (!res.ok) {
                                alert(res.error);
                                return false;
                            }
                            renderCurrentView();
                            return true;
                        }
                    });
                };

                const syncPill = buildSyncPill();

                const syncCenterBtn = document.createElement('button');
                syncCenterBtn.type = 'button';
                syncCenterBtn.className = 'tk-fav-mini-btn';
                syncCenterBtn.textContent = '☁️ 云同步 / 备份';
                syncCenterBtn.onclick = () => {
                    viewState.view = 'sync';
                    renderCurrentView();
                };

                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'tk-fav-mini-btn';
                closeBtn.textContent = '✕ 关闭';
                closeBtn.onclick = () => overlay.remove();

                topActions.append(newFolderBtn, syncPill, syncCenterBtn, closeBtn);
                header.append(titleEl, topActions);

                const searchRow = document.createElement('div');
                searchRow.className = 'tk-fav-search-row';

                const searchInput = document.createElement('input');
                searchInput.type = 'text';
                searchInput.className = 'tk-input-modern';
                searchInput.style.flex = '1';
                searchInput.placeholder = '🔍 全局搜索所有收藏夹中的番号、标题或磁力链接...';
                searchInput.value = viewState.globalQuery;

                const clearSearchBtn = document.createElement('button');
                clearSearchBtn.type = 'button';
                clearSearchBtn.className = 'tk-fav-mini-btn';
                clearSearchBtn.textContent = '清空搜索';
                clearSearchBtn.style.display = viewState.globalQuery.trim() ? '' : 'none';

                searchRow.append(searchInput, clearSearchBtn);

                const contentArea = document.createElement('div');
                contentArea.className = 'tk-fav-scroll-area';

                const renderDirectoryOrSearch = () => {
                    contentArea.textContent = '';
                    const kw = viewState.globalQuery.trim().toLowerCase();
                    clearSearchBtn.style.display = kw ? '' : 'none';

                    if (kw) {
                        const matched = FavoritesManager.getItems('__ALL__').filter(it =>
                            (it.code && it.code.toLowerCase().includes(kw)) ||
                            (it.title && it.title.toLowerCase().includes(kw)) ||
                            (it.magnet && it.magnet.toLowerCase().includes(kw))
                        );
                        const summary = document.createElement('div');
                        summary.className = 'tk-fav-search-summary';
                        summary.textContent = `全局搜索「${viewState.globalQuery.trim()}」匹配到 ${matched.length} 条结果`;
                        contentArea.appendChild(summary);

                        if (matched.length === 0) {
                            const empty = document.createElement('div');
                            empty.className = 'tk-fav-empty';
                            empty.textContent = '未找到匹配的收藏条目。';
                            contentArea.appendChild(empty);
                            return;
                        }

                        const grid = document.createElement('div');
                        grid.className = 'tk-fav-detail-grid';
                        matched.forEach(item => {
                            grid.appendChild(renderDetailCard(item, renderDirectoryOrSearch));
                        });
                        contentArea.appendChild(grid);
                        return;
                    }

                    // 一级视图：收藏夹卡片网格（含「全部收藏」汇总入口 + 各用户夹）
                    const folderGrid = document.createElement('div');
                    folderGrid.className = 'tk-fav-folder-grid';

                    const buildFolderCard = ({ id, name, isDefault, isAll }) => {
                        const items = FavoritesManager.getItems(id);
                        const count = items.length;
                        const card = document.createElement('div');
                        card.className = `tk-fav-folder-card${isAll ? ' is-all-card' : ''}`;

                        // 1-4 张封面拼图预览区
                        const collage = document.createElement('div');
                        collage.className = 'tk-fav-folder-collage';
                        const recent = items.slice(0, 4);
                        for (let i = 0; i < 4; i++) {
                            const slot = document.createElement('div');
                            slot.className = 'tk-fav-collage-slot';
                            const sample = recent[i];
                            if (sample) {
                                const img = document.createElement('img');
                                img.alt = sample.code || '';
                                img.style.display = 'none';
                                const fallbackLabel = document.createElement('span');
                                fallbackLabel.className = 'tk-fav-collage-code';
                                fallbackLabel.textContent = sample.code || '';
                                slot.append(img, fallbackLabel);
                                this.loadFavoritePreview(sample, img, {
                                    onLoaded: () => { fallbackLabel.style.display = 'none'; },
                                    onEmptyOrFail: () => { fallbackLabel.style.display = 'block'; }
                                });
                            } else {
                                slot.classList.add('is-empty');
                            }
                            collage.appendChild(slot);
                        }

                        const body = document.createElement('div');
                        body.className = 'tk-fav-folder-info';

                        const nameRow = document.createElement('div');
                        nameRow.className = 'tk-fav-folder-name-row';

                        const nameEl = document.createElement('div');
                        nameEl.className = 'tk-fav-folder-name';
                        nameEl.textContent = name;

                        if (isDefault) {
                            const badge = document.createElement('span');
                            badge.className = 'tk-fav-folder-tag';
                            badge.textContent = '默认';
                            nameRow.append(nameEl, badge);
                        } else if (isAll) {
                            const badge = document.createElement('span');
                            badge.className = 'tk-fav-folder-tag is-all';
                            badge.textContent = '汇总';
                            nameRow.append(nameEl, badge);
                        } else {
                            nameRow.appendChild(nameEl);
                        }

                        const countEl = document.createElement('div');
                        countEl.className = 'tk-fav-folder-count';
                        countEl.textContent = `${count} 条收藏`;

                        const foot = document.createElement('div');
                        foot.className = 'tk-fav-folder-actions';

                        const copyBtn = document.createElement('button');
                        copyBtn.type = 'button';
                        copyBtn.className = 'tk-fav-mini-btn';
                        copyBtn.textContent = '📋 复制磁力';
                        copyBtn.onclick = (e) => {
                            e.stopPropagation();
                            copyMagnets(items, copyBtn, '📋 复制磁力');
                        };
                        foot.appendChild(copyBtn);

                        if (!isDefault && !isAll) {
                            const renameBtn = document.createElement('button');
                            renameBtn.type = 'button';
                            renameBtn.className = 'tk-fav-mini-btn';
                            renameBtn.textContent = '✎ 重命名';
                            renameBtn.onclick = (e) => {
                                e.stopPropagation();
                                this.openPromptModal({
                                    title: `重命名收藏夹「${name}」`,
                                    initialValue: name,
                                    confirmText: '保存',
                                    onConfirm: (nextName) => {
                                        const res = FavoritesManager.renameFolder(id, nextName);
                                        if (!res.ok) {
                                            alert(res.error);
                                            return false;
                                        }
                                        renderCurrentView();
                                        return true;
                                    }
                                });
                            };

                            const delBtn = document.createElement('button');
                            delBtn.type = 'button';
                            delBtn.className = 'tk-fav-mini-btn is-danger';
                            delBtn.textContent = '🗑️ 删除';
                            delBtn.onclick = (e) => {
                                e.stopPropagation();
                                const folderObj = FavoritesManager.getFolderById(id);
                                if (!folderObj) return;
                                this.openDeleteFolderModal(folderObj, count, () => renderCurrentView());
                            };

                            foot.append(renameBtn, delBtn);
                        }

                        body.append(nameRow, countEl, foot);
                        card.append(collage, body);
                        card.onclick = () => {
                            viewState.activeFolderId = id;
                            viewState.detailQuery = '';
                            viewState.view = 'detail';
                            renderCurrentView();
                        };
                        return card;
                    };

                    folderGrid.appendChild(buildFolderCard({
                        id: '__ALL__',
                        name: '📚 全部收藏',
                        isDefault: false,
                        isAll: true
                    }));

                    FavoritesManager.getFolders().forEach(folder => {
                        folderGrid.appendChild(buildFolderCard({
                            id: folder.id,
                            name: folder.name,
                            isDefault: folder.id === FavoritesManager.DEFAULT_FOLDER_ID,
                            isAll: false
                        }));
                    });

                    contentArea.appendChild(folderGrid);
                };

                searchInput.oninput = () => {
                    viewState.globalQuery = searchInput.value;
                    renderDirectoryOrSearch();
                };
                clearSearchBtn.onclick = () => {
                    viewState.globalQuery = '';
                    searchInput.value = '';
                    renderDirectoryOrSearch();
                };

                bodyWrap.append(header, searchRow, contentArea);
                renderDirectoryOrSearch();
            };

            const renderDetailView = () => {
                bodyWrap.textContent = '';
                const isAll = viewState.activeFolderId === '__ALL__';
                const folder = isAll ? null : FavoritesManager.getFolderById(viewState.activeFolderId);
                if (!isAll && !folder) {
                    viewState.view = 'folders';
                    renderFoldersView();
                    return;
                }
                const folderName = isAll ? '📚 全部收藏' : folder.name;
                const folderItemsAll = FavoritesManager.getItems(viewState.activeFolderId);

                const header = document.createElement('div');
                header.className = 'tk-fav-modal-header';

                const leftNav = document.createElement('div');
                leftNav.style.cssText = 'display: flex; align-items: center; gap: 10px; flex-wrap: wrap;';

                const backBtn = document.createElement('button');
                backBtn.type = 'button';
                backBtn.className = 'tk-fav-mini-btn';
                backBtn.textContent = '← 返回收藏夹';
                backBtn.onclick = () => {
                    viewState.view = 'folders';
                    renderCurrentView();
                };

                const titleEl = document.createElement('h3');
                titleEl.className = 'tk-fav-modal-title';
                titleEl.textContent = `${folderName} (${folderItemsAll.length})`;

                leftNav.append(backBtn, titleEl);

                const topActions = document.createElement('div');
                topActions.className = 'tk-fav-top-actions';

                const copyAllBtn = document.createElement('button');
                copyAllBtn.type = 'button';
                copyAllBtn.className = 'tk-fav-mini-btn is-primary';
                copyAllBtn.textContent = '📋 复制本夹全部磁力';

                topActions.appendChild(copyAllBtn);

                if (!isAll && folder.id !== FavoritesManager.DEFAULT_FOLDER_ID) {
                    const renameBtn = document.createElement('button');
                    renameBtn.type = 'button';
                    renameBtn.className = 'tk-fav-mini-btn';
                    renameBtn.textContent = '✎ 重命名';
                    renameBtn.onclick = () => {
                        this.openPromptModal({
                            title: `重命名收藏夹「${folder.name}」`,
                            initialValue: folder.name,
                            confirmText: '保存',
                            onConfirm: (nextName) => {
                                const res = FavoritesManager.renameFolder(folder.id, nextName);
                                if (!res.ok) {
                                    alert(res.error);
                                    return false;
                                }
                                renderCurrentView();
                                return true;
                            }
                        });
                    };
                    topActions.appendChild(renameBtn);
                }

                const syncBtn = document.createElement('button');
                syncBtn.type = 'button';
                syncBtn.className = 'tk-fav-mini-btn';
                syncBtn.textContent = '☁️ 同步 / 备份';
                syncBtn.onclick = () => {
                    viewState.view = 'sync';
                    renderCurrentView();
                };

                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'tk-fav-mini-btn';
                closeBtn.textContent = '✕ 关闭';
                closeBtn.onclick = () => overlay.remove();

                topActions.append(syncBtn, closeBtn);
                header.append(leftNav, topActions);

                const searchRow = document.createElement('div');
                searchRow.className = 'tk-fav-search-row';
                const searchInput = document.createElement('input');
                searchInput.type = 'text';
                searchInput.className = 'tk-input-modern';
                searchInput.style.flex = '1';
                searchInput.placeholder = `🔍 在「${folderName}」内搜索番号、标题或磁力链...`;
                searchInput.value = viewState.detailQuery;
                searchRow.appendChild(searchInput);

                const contentArea = document.createElement('div');
                contentArea.className = 'tk-fav-scroll-area';

                const getFiltered = () => {
                    const base = FavoritesManager.getItems(viewState.activeFolderId);
                    const kw = viewState.detailQuery.trim().toLowerCase();
                    if (!kw) return base;
                    return base.filter(it =>
                        (it.code && it.code.toLowerCase().includes(kw)) ||
                        (it.title && it.title.toLowerCase().includes(kw)) ||
                        (it.magnet && it.magnet.toLowerCase().includes(kw))
                    );
                };

                const renderGrid = () => {
                    contentArea.textContent = '';
                    const items = getFiltered();
                    titleEl.textContent = `${folderName} (${FavoritesManager.getItems(viewState.activeFolderId).length})`;

                    if (items.length === 0) {
                        const empty = document.createElement('div');
                        empty.className = 'tk-fav-empty';
                        empty.textContent = viewState.detailQuery.trim()
                            ? '当前搜索条件下暂无匹配收藏。'
                            : '该收藏夹暂无内容，点击浏览流卡片底部的「☆ 收藏」即可存入。';
                        contentArea.appendChild(empty);
                        return;
                    }

                    const grid = document.createElement('div');
                    grid.className = 'tk-fav-detail-grid';
                    items.forEach(item => {
                        grid.appendChild(renderDetailCard(item, renderGrid));
                    });
                    contentArea.appendChild(grid);
                };

                copyAllBtn.onclick = () => copyMagnets(getFiltered(), copyAllBtn, '📋 复制本夹全部磁力');
                searchInput.oninput = () => {
                    viewState.detailQuery = searchInput.value;
                    renderGrid();
                };

                bodyWrap.append(header, searchRow, contentArea);
                renderGrid();
            };

            const renderSyncBackupView = () => {
                bodyWrap.textContent = '';

                const header = document.createElement('div');
                header.className = 'tk-fav-modal-header';

                const leftNav = document.createElement('div');
                leftNav.style.cssText = 'display: flex; align-items: center; gap: 10px;';

                const backBtn = document.createElement('button');
                backBtn.type = 'button';
                backBtn.className = 'tk-fav-mini-btn';
                backBtn.textContent = '← 返回收藏夹';
                backBtn.onclick = () => {
                    viewState.view = 'folders';
                    renderCurrentView();
                };

                const titleEl = document.createElement('h3');
                titleEl.className = 'tk-fav-modal-title';
                titleEl.textContent = '☁️ 云端同步（E2EE）与本地备份';

                leftNav.append(backBtn, titleEl);

                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'tk-fav-mini-btn';
                closeBtn.textContent = '✕ 关闭';
                closeBtn.onclick = () => overlay.remove();

                header.append(leftNav, closeBtn);

                const scrollArea = document.createElement('div');
                scrollArea.className = 'tk-fav-scroll-area tk-sync-sections';

                // --- A. Cloudflare Worker + D1 同步区 ---
                const cloudCard = document.createElement('div');
                cloudCard.className = 'tk-sync-card';
                cloudCard.innerHTML = `
                    <div class="tk-sync-card-title">
                        <span>☁️ Cloudflare Worker + D1 自动同步（AES-256-GCM 零知识加密）</span>
                        <label class="tk-sync-toggle"><input type="checkbox" id="tk-sync-enable"> 启用自动同步</label>
                    </div>
                    <div class="tk-sync-form-grid">
                        <div>
                            <label class="tk-sync-label">同步 API 地址（Worker 域名）</label>
                            <input type="url" id="tk-sync-api" class="tk-input-modern" style="width:100%;box-sizing:border-box;" placeholder="https://sync.yourdomain.com">
                        </div>
                        <div>
                            <label class="tk-sync-label">同步密钥 Passphrase（仅用于本地派生加密密钥，永不上传明文）</label>
                            <div style="display:flex;gap:6px;">
                                <input type="password" id="tk-sync-pass" class="tk-input-modern" style="flex:1;box-sizing:border-box;" placeholder="输入高强度自定义口令">
                                <button type="button" id="tk-sync-toggle-pass" class="tk-fav-mini-btn">👁️</button>
                            </div>
                        </div>
                    </div>
                    <div class="tk-sync-token-row">
                        <span>Worker Secret (<code>SYNC_AUTH_TOKEN</code>)：</span>
                        <code id="tk-sync-auth-preview" class="tk-sync-token-code">填写密钥后自动生成</code>
                        <button type="button" id="tk-sync-copy-token" class="tk-fav-mini-btn">复制 Token</button>
                    </div>
                    <div class="tk-sync-btn-row">
                        <button type="button" id="tk-sync-save-test" class="tk-fav-mini-btn is-primary">🔌 保存并测试连接</button>
                        <button type="button" id="tk-sync-now-btn" class="tk-fav-mini-btn">🔄 立即双向同步</button>
                        <button type="button" id="tk-sync-copy-passcode" class="tk-fav-mini-btn">📋 复制配置口令</button>
                        <button type="button" id="tk-sync-paste-passcode" class="tk-fav-mini-btn">📥 粘贴口令导入</button>
                        <button type="button" id="tk-sync-overwrite-cloud" class="tk-fav-mini-btn is-danger">⚠️ 用本地覆盖云端</button>
                    </div>
                    <div id="tk-sync-feedback" class="tk-sync-feedback"></div>
                `;

                const enableCb = cloudCard.querySelector('#tk-sync-enable');
                const apiInput = cloudCard.querySelector('#tk-sync-api');
                const passInput = cloudCard.querySelector('#tk-sync-pass');
                const togglePassBtn = cloudCard.querySelector('#tk-sync-toggle-pass');
                const authPreview = cloudCard.querySelector('#tk-sync-auth-preview');
                const copyTokenBtn = cloudCard.querySelector('#tk-sync-copy-token');
                const feedbackEl = cloudCard.querySelector('#tk-sync-feedback');

                enableCb.checked = Boolean(SyncEngine.config.enabled);
                apiInput.value = SyncEngine.config.apiUrl || '';
                passInput.value = SyncEngine.config.passphrase || '';

                const updateAuthPreview = async () => {
                    const p = passInput.value;
                    if (!p) {
                        authPreview.textContent = '填写密钥后自动生成';
                        authPreview.dataset.fullToken = '';
                        return;
                    }
                    try {
                        const token = await CryptoHelper.deriveAuthToken(p);
                        authPreview.dataset.fullToken = token;
                        authPreview.textContent = `${token.slice(0, 12)}...${token.slice(-8)}`;
                    } catch (e) {
                        authPreview.textContent = e.message || '当前上下文不支持 WebCrypto';
                        authPreview.dataset.fullToken = '';
                    }
                };
                updateAuthPreview();

                const renderSyncFeedback = (extra = '') => {
                    const lastStr = SyncEngine.config.lastSyncAt
                        ? new Date(SyncEngine.config.lastSyncAt).toLocaleString()
                        : '从未同步';
                    const stats = state.syncStatus.stats;
                    const formatBytes = (b) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} MB` : `${Math.round(b / 1024)} KB`;
                    const statsStr = stats
                        ? ` ｜ 云端统计：${stats.folders} 夹 / ${stats.items} 条 / ${stats.covers} 张图 (${formatBytes(stats.coverBytes || 0)})`
                        : '';
                    const errStr = state.syncStatus.error ? ` ｜ ⚠️ ${state.syncStatus.error}` : '';
                    feedbackEl.textContent = `状态：${state.syncStatus.label} ｜ 上次同步：${lastStr}${statsStr}${errStr}${extra ? ' ｜ ' + extra : ''}`;
                };
                renderSyncFeedback();

                passInput.oninput = updateAuthPreview;
                togglePassBtn.onclick = () => {
                    passInput.type = passInput.type === 'password' ? 'text' : 'password';
                };
                copyTokenBtn.onclick = () => {
                    const full = authPreview.dataset.fullToken;
                    if (!full) {
                        alert('请先输入同步密钥');
                        return;
                    }
                    Utils.copyText(full).then(() => {
                        copyTokenBtn.textContent = '✅ 已复制';
                        setTimeout(() => { copyTokenBtn.textContent = '复制 Token'; }, 1500);
                    });
                };

                const applyFormToConfig = () => {
                    SyncEngine.updateSettings({
                        enabled: enableCb.checked,
                        apiUrl: apiInput.value,
                        passphrase: passInput.value
                    });
                };
                enableCb.onchange = applyFormToConfig;

                cloudCard.querySelector('#tk-sync-save-test').onclick = async () => {
                    applyFormToConfig();
                    renderSyncFeedback('正在连接测试...');
                    try {
                        const pingRes = await SyncEngine.ping();
                        renderSyncFeedback(`连接成功（服务器时间 ${new Date(pingRes.serverTime).toLocaleTimeString()}）`);
                        if (SyncEngine.isConfigured()) {
                            await SyncEngine.syncNow({ reason: 'test-sync' });
                            renderSyncFeedback('已完成首次同步');
                        }
                    } catch (e) {
                        renderSyncFeedback(`连接失败：${e.message || e}`);
                    }
                };

                cloudCard.querySelector('#tk-sync-now-btn').onclick = async () => {
                    applyFormToConfig();
                    if (!SyncEngine.isConfigured()) {
                        enableCb.checked = true;
                        applyFormToConfig();
                    }
                    renderSyncFeedback('正在同步...');
                    const res = await SyncEngine.syncNow({ reason: 'manual' });
                    renderSyncFeedback(res.ok ? '双向同步完成' : `失败：${res.error}`);
                };

                cloudCard.querySelector('#tk-sync-copy-passcode').onclick = () => {
                    try {
                        applyFormToConfig();
                        const code = SyncEngine.exportPasscode();
                        Utils.copyText(code).then(() => {
                            alert('配置口令已复制到剪贴板，可在手机端直接粘贴导入！');
                        });
                    } catch (e) {
                        alert(e.message || e);
                    }
                };

                cloudCard.querySelector('#tk-sync-paste-passcode').onclick = () => {
                    this.openPromptModal({
                        title: '粘贴配置口令一键配置',
                        placeholder: '粘贴以 TK-SYNC-V1: 开头的配置口令...',
                        confirmText: '导入并同步',
                        onConfirm: (rawCode) => {
                            try {
                                const imported = SyncEngine.importPasscode(rawCode);
                                enableCb.checked = true;
                                apiInput.value = imported.apiUrl;
                                passInput.value = imported.passphrase;
                                updateAuthPreview();
                                renderSyncFeedback('口令导入成功，正在同步...');
                                SyncEngine.syncNow({ reason: 'passcode-import' }).then(res => {
                                    renderSyncFeedback(res.ok ? '已连接并同步完成' : `同步失败：${res.error}`);
                                });
                                return true;
                            } catch (e) {
                                alert(e.message || e);
                                return false;
                            }
                        }
                    });
                };

                cloudCard.querySelector('#tk-sync-overwrite-cloud').onclick = async () => {
                    applyFormToConfig();
                    if (!SyncEngine.isConfigured()) {
                        alert('请先勾选启用并填写 API 地址与同步密钥');
                        return;
                    }
                    if (!window.confirm('确定要用本地收藏夹完全覆盖云端数据吗？云端原有记录与封面将被清空并替换为当前设备数据。')) {
                        return;
                    }
                    try {
                        renderSyncFeedback('正在清空云端并上传本地全量数据...');
                        const res = await SyncEngine.overwriteCloudWithLocal();
                        renderSyncFeedback(res.ok ? '已用本地数据完整覆盖云端' : `失败：${res.error}`);
                    } catch (e) {
                        renderSyncFeedback(`覆盖失败：${e.message || e}`);
                    }
                };

                // --- B. 本地 WebP 封面缓存区 ---
                const cacheCard = document.createElement('div');
                cacheCard.className = 'tk-sync-card';
                const renderMediaCacheCard = () => {
                    const stats = CoverMediaStore.getStats();
                    cacheCard.innerHTML = `
                        <div class="tk-sync-card-title"><span>🖼️ 本地 WebP 封面缓存管理（跨镜像域名共享）</span></div>
                        <div class="tk-sync-feedback" style="margin-bottom: 10px;">
                            已缓存封面：<strong>${stats.count}</strong> 张 ｜ 占用体积：<strong>${stats.totalMb} MB</strong> ｜ 无用孤儿图：<strong>${stats.orphanCount}</strong> 张
                        </div>
                        <div class="tk-sync-btn-row">
                            <button type="button" id="tk-clean-orphan-covers" class="tk-fav-mini-btn">🧹 清理无用孤儿图</button>
                            <button type="button" id="tk-refresh-all-covers" class="tk-fav-mini-btn">🔄 按 480p 重抓刷新封面</button>
                        </div>
                        <div id="tk-cover-refresh-progress" class="tk-card-meta" style="margin-top:8px;"></div>
                    `;
                    cacheCard.querySelector('#tk-clean-orphan-covers').onclick = () => {
                        const res = CoverMediaStore.cleanupOrphans();
                        renderMediaCacheCard();
                        alert(`已清理 ${res.removedCount} 张孤儿封面，释放 ${res.freedMb} MB 存储空间。`);
                    };
                    const refreshBtn = cacheCard.querySelector('#tk-refresh-all-covers');
                    const progressEl = cacheCard.querySelector('#tk-cover-refresh-progress');
                    refreshBtn.onclick = async () => {
                        const items = FavoritesManager.getItems();
                        if (items.length === 0) {
                            alert('当前暂无收藏条目。');
                            return;
                        }
                        refreshBtn.disabled = true;
                        let done = 0;
                        let updated = 0;
                        for (const item of items) {
                            done++;
                            progressEl.textContent = `正在重抓刷新 (${done}/${items.length})：${item.code}...`;
                            try {
                                let url = item.coverUrl;
                                if (!url && typeof QueueManager !== 'undefined') {
                                    url = await QueueManager.resolveCoverOnce(item.code);
                                }
                                if (url) {
                                    const resUrl = await CoverMediaStore.captureFromUrl(item.id, url, { force: true });
                                    if (resUrl) updated++;
                                }
                            } catch {
                                // 跳过单条异常
                            }
                        }
                        renderMediaCacheCard();
                        cacheCard.querySelector('#tk-cover-refresh-progress').textContent = `✅ 刷新完成：共处理 ${items.length} 条，成功更新 ${updated} 张 480p 封面。`;
                    };
                };
                renderMediaCacheCard();

                // --- C. 本地文件备份与恢复区 ---
                const backupCard = document.createElement('div');
                backupCard.className = 'tk-sync-card';
                backupCard.innerHTML = `
                    <div class="tk-sync-card-title"><span>💾 本地文件备份与恢复（兼容 v1 / v2）</span></div>
                    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:10px;">
                        <label class="tk-sync-toggle">
                            <input type="checkbox" id="tk-backup-include-covers" checked>
                            包含本地 WebP 封面（完整离线包）
                        </label>
                        <span id="tk-backup-est" class="tk-card-meta"></span>
                    </div>
                    <div class="tk-sync-btn-row" style="margin-bottom: 14px;">
                        <button type="button" id="tk-backup-download" class="tk-fav-mini-btn is-primary">💾 下载备份文件 (.json)</button>
                        <button type="button" id="tk-backup-copy-json" class="tk-fav-mini-btn">📋 复制 JSON 到剪贴板</button>
                    </div>
                    <div id="tk-backup-dropzone" class="tk-backup-dropzone">
                        <div>📂 点击选择或拖拽 <code>.json</code> 备份文件到此处恢复</div>
                        <input type="file" id="tk-backup-file-input" accept=".json,application/json" style="display:none;">
                        <button type="button" id="tk-backup-paste-toggle" class="tk-fav-mini-btn" style="margin-top:8px;">📝 或粘贴 JSON 文本</button>
                    </div>
                    <div id="tk-backup-paste-box" style="display:none;margin-top:8px;">
                        <textarea id="tk-backup-paste-area" rows="4" class="tk-input-modern" style="width:100%;box-sizing:border-box;font-family:var(--tk-font-mono);font-size:11px;" placeholder="粘贴 v1 或 v2 备份 JSON 内容..."></textarea>
                        <button type="button" id="tk-backup-parse-text" class="tk-fav-mini-btn" style="margin-top:6px;">🔍 解析预览</button>
                    </div>
                    <div id="tk-backup-preview" class="tk-backup-preview" style="display:none;"></div>
                `;

                const includeCoversCb = backupCard.querySelector('#tk-backup-include-covers');
                const estSpan = backupCard.querySelector('#tk-backup-est');
                const updateEst = () => {
                    const est = BackupManager.estimateExportSize(includeCoversCb.checked);
                    estSpan.textContent = `预计体积：${est.formattedSize}（${est.folderCount} 夹 / ${est.itemCount} 条${includeCoversCb.checked ? ` / ${est.coverCount} 张图` : ''}）`;
                };
                updateEst();
                includeCoversCb.onchange = updateEst;

                backupCard.querySelector('#tk-backup-download').onclick = () => {
                    BackupManager.downloadBackup(includeCoversCb.checked);
                };
                const copyJsonBtn = backupCard.querySelector('#tk-backup-copy-json');
                copyJsonBtn.onclick = () => {
                    const data = BackupManager.buildExportData(includeCoversCb.checked);
                    Utils.copyText(JSON.stringify(data, null, 2)).then(() => {
                        copyJsonBtn.textContent = '✅ 已复制 JSON';
                        setTimeout(() => { copyJsonBtn.textContent = '📋 复制 JSON 到剪贴板'; }, 1500);
                    });
                };

                const dropzone = backupCard.querySelector('#tk-backup-dropzone');
                const fileInput = backupCard.querySelector('#tk-backup-file-input');
                const pasteToggle = backupCard.querySelector('#tk-backup-paste-toggle');
                const pasteBox = backupCard.querySelector('#tk-backup-paste-box');
                const pasteArea = backupCard.querySelector('#tk-backup-paste-area');
                const previewBox = backupCard.querySelector('#tk-backup-preview');

                const showImportPreview = (rawText) => {
                    try {
                        const info = BackupManager.inspectImport(rawText);
                        viewState.pendingImport = info.normalized;
                        previewBox.style.display = 'block';
                        previewBox.innerHTML = `
                            <div style="font-size:12px;line-height:1.6;margin-bottom:8px;">
                                <strong>备份解析成功：</strong><br>
                                格式版本：${info.versionLabel} ｜ 导出时间：${info.exportedAt}<br>
                                包含内容：<strong>${info.folderCount}</strong> 个收藏夹、<strong>${info.itemCount}</strong> 条收藏、<strong>${info.coverCount}</strong> 张本地封面
                            </div>
                            <div class="tk-sync-btn-row">
                                <button type="button" id="tk-import-merge" class="tk-fav-mini-btn is-primary">🔀 智能合并恢复</button>
                                <button type="button" id="tk-import-overwrite" class="tk-fav-mini-btn is-danger">⚠️ 完全覆盖恢复</button>
                            </div>
                        `;
                        previewBox.querySelector('#tk-import-merge').onclick = () => {
                            const res = BackupManager.applyImport(viewState.pendingImport, 'merge');
                            previewBox.style.display = 'none';
                            renderMediaCacheCard();
                            updateEst();
                            alert(`合并恢复完成：新增 ${res.added} 条，更新 ${res.updated} 条，恢复 ${res.coversRestored} 张封面，共 ${res.total} 条。`);
                        };
                        previewBox.querySelector('#tk-import-overwrite').onclick = () => {
                            if (!window.confirm('完全覆盖恢复将清空当前本地收藏夹与本地封面并替换为备份内容，确定继续？')) return;
                            const res = BackupManager.applyImport(viewState.pendingImport, 'overwrite');
                            previewBox.style.display = 'none';
                            renderMediaCacheCard();
                            updateEst();
                            alert(`覆盖恢复完成：共载入 ${res.total} 条收藏，恢复 ${res.coversRestored} 张封面。`);
                        };
                    } catch (err) {
                        previewBox.style.display = 'block';
                        previewBox.textContent = `❌ 解析失败：${err.message || err}`;
                    }
                };

                dropzone.onclick = (e) => {
                    if (e.target === pasteToggle) return;
                    fileInput.click();
                };
                dropzone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dropzone.classList.add('is-dragover');
                });
                dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
                dropzone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropzone.classList.remove('is-dragover');
                    const file = e.dataTransfer?.files?.[0];
                    if (file) file.text().then(showImportPreview);
                });
                fileInput.onchange = () => {
                    const file = fileInput.files?.[0];
                    if (file) file.text().then(showImportPreview);
                    fileInput.value = '';
                };
                pasteToggle.onclick = (e) => {
                    e.stopPropagation();
                    pasteBox.style.display = pasteBox.style.display === 'none' ? 'block' : 'none';
                };
                backupCard.querySelector('#tk-backup-parse-text').onclick = () => {
                    if (pasteArea.value.trim()) showImportPreview(pasteArea.value);
                };

                scrollArea.append(cloudCard, cacheCard, backupCard);
                bodyWrap.append(header, scrollArea);
            };

            const renderCurrentView = () => {
                if (viewState.view === 'detail') {
                    renderDetailView();
                } else if (viewState.view === 'sync') {
                    renderSyncBackupView();
                } else {
                    renderFoldersView();
                }
            };

            renderCurrentView();

            // 打开收藏夹时若配置了云同步，静默触发增量同步并在本地有变更时自动刷新当前视图
            if (typeof SyncEngine !== 'undefined' && SyncEngine.isConfigured()) {
                SyncEngine.syncNow({ reason: 'modal-open' }).then((res) => {
                    if (!document.body.contains(overlay)) return;
                    if (res && res.changedLocally) {
                        renderCurrentView();
                    } else {
                        const pill = bodyWrap.querySelector('.tk-sync-pill');
                        if (pill) {
                            pill.className = `tk-sync-pill is-${state.syncStatus.state || 'synced'}`;
                            pill.textContent = state.syncStatus.label || '☁️ 已同步';
                        }
                    }
                });
            }
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
    const CF_VERIFY_WINDOW_NAME = 'tk_cf_verify';

    const App = {
        _cfVerifyTimer: null,
        _cfVerifyPopup: null,

        _clearCfVerifyWatch() {
            if (this._cfVerifyTimer) {
                clearInterval(this._cfVerifyTimer);
                this._cfVerifyTimer = null;
            }
        },

        isCloudflareChallengeDoc(doc) {
            if (!doc) return false;
            const title = (doc.title || '').toLowerCase();
            if (title.includes('just a moment') || title.includes('attention required')) {
                return true;
            }
            return Boolean(
                doc.querySelector('#challenge-form, #challenge-running, .cf-challenge, .cf-turnstile, [src*="challenge-platform"], [src*="/cdn-cgi/challenge-platform"]')
            );
        },

        isCloudflareHtml(status, html) {
            if (status === 403) return true;
            if (!html) return status === 503;
            const lower = html.toLowerCase();
            if (lower.includes('archiveresult')) return false;
            const hasCfMarker = lower.includes('cf-challenge')
                || lower.includes('challenge-platform')
                || lower.includes('cf-turnstile')
                || lower.includes('<title>just a moment');
            return status === 503 ? true : hasCfMarker;
        },

        resumeAfterCfVerify() {
            this._clearCfVerifyWatch();
            if (this._cfVerifyPopup && !this._cfVerifyPopup.closed) {
                try {
                    this._cfVerifyPopup.close();
                } catch {
                    // 忽略窗口关闭权限异常
                }
            }
            this._cfVerifyPopup = null;
            state.pageRetryCount = 0;
            state.consecutiveEmptyPages = 0;
            state.targetValidCount = this.getVisibleCardsCount() + 8;
            this.showStatusBanner('正在重新拉取下一页数据...', false);
            this.checkPaginationAndDispatch();
        },

        openCfVerifyPopup(targetUrl, pageNum) {
            if (!targetUrl) return;
            this._clearCfVerifyWatch();

            if (this._cfVerifyPopup && !this._cfVerifyPopup.closed) {
                this._cfVerifyPopup.focus();
                return;
            }

            const width = 520;
            const height = 640;
            const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
            const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
            const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;

            const popup = window.open(targetUrl, CF_VERIFY_WINDOW_NAME, features);
            if (!popup) {
                this.stopPagination(
                    '浏览器拦截了弹窗，请点击右侧链接在新标签页完成 CF 验证后点重试。',
                    { label: '↻ 已过验证，继续加载', secondary: true },
                    [{ label: `打开第 ${pageNum} 页过盾 ↗`, href: targetUrl }]
                );
                return;
            }

            this._cfVerifyPopup = popup;
            let cancelled = false;
            const startedAt = Date.now();
            const maxWaitMs = 5 * 60 * 1000;

            this.showStatusBanner(
                `请在弹出的小窗内完成 Cloudflare 验证，通过后将自动继续加载第 ${pageNum} 页...`,
                false,
                [
                    {
                        label: '↻ 我已过验证，继续加载',
                        onClick: () => this.resumeAfterCfVerify()
                    },
                    {
                        label: '取消',
                        secondary: true,
                        onClick: () => {
                            cancelled = true;
                            this._clearCfVerifyWatch();
                            if (!popup.closed) {
                                try { popup.close(); } catch {}
                            }
                            this._cfVerifyPopup = null;
                            this.stopPagination(
                                '已取消验证，需要时可重新弹出小窗过 CF 盾。',
                                { label: '↻ 重试加载', secondary: true },
                                [{ label: '🛡️ 弹出小窗过 CF 盾', onClick: () => this.openCfVerifyPopup(targetUrl, pageNum) }]
                            );
                        }
                    }
                ]
            );

            this._cfVerifyTimer = setInterval(() => {
                if (cancelled) return;

                if (Date.now() - startedAt > maxWaitMs) {
                    this._clearCfVerifyWatch();
                    this.stopPagination(
                        '等待验证超时，完成验证后请手动点击继续加载。',
                        { label: '↻ 继续加载', secondary: true },
                        [{ label: '🛡️ 重新打开验证小窗', onClick: () => this.openCfVerifyPopup(targetUrl, pageNum) }]
                    );
                    return;
                }

                if (popup.closed) {
                    this._clearCfVerifyWatch();
                    this._cfVerifyPopup = null;
                    setTimeout(() => this.resumeAfterCfVerify(), 200);
                    return;
                }

                // 留出初始跳转窗口期，避免误读 about:blank 或中间页
                if (Date.now() - startedAt < 1000) return;

                try {
                    if (popup.location.origin !== window.location.origin) return;
                    if (popup.location.href === 'about:blank') return;
                    const doc = popup.document;
                    if (!doc || doc.readyState !== 'complete') return;
                    if (this.isCloudflareChallengeDoc(doc)) return;

                    const hasTable = Boolean(this._findResultTable(doc));
                    if (hasTable || doc.querySelector('#main .wrapper')) {
                        this._clearCfVerifyWatch();
                        console.log(`[TorrentKitty] 检测到验证小窗已通过 CF 并进入目标页，自动续拉第 ${pageNum} 页`);
                        setTimeout(() => this.resumeAfterCfVerify(), 250);
                    }
                } catch {
                    // 验证跳转期间若短暂处于外部域，忽略跨域读取异常等待回到同源
                }
            }, 600);
        },
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
            let container = null;
            if (table) {
                container = table.querySelector('tbody') || table;
            } else {
                const firstRow = this.getResultRows()[0];
                container = firstRow ? firstRow.parentNode : null;
            }
            if (container && container.dataset) {
                container.dataset.tkResultTable = 'true';
            }
            return container;
        },

        getCurrentPageNum() {
            const url = new URL(window.location.href);
            const queryPage = parseInt(url.searchParams.get('page') || url.searchParams.get('p'), 10);
            if (!isNaN(queryPage) && queryPage > 0) {
                return queryPage;
            }
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
            const currentUrl = new URL(window.location.href);
            const targetStr = String(pageNum);
            const paginationLinks = document.querySelectorAll('.pagination a[href], .pages a[href], .pager a[href], .page-nav a[href]');

            for (const link of paginationLinks) {
                const href = link.getAttribute('href');
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;

                let linkUrl;
                try {
                    linkUrl = new URL(href, currentUrl);
                } catch {
                    continue;
                }
                if (linkUrl.origin !== currentUrl.origin || linkUrl.href === currentUrl.href) continue;

                const lastPathPart = linkUrl.pathname.split('/').filter(Boolean).pop();
                const queryPage = linkUrl.searchParams.get('page') || linkUrl.searchParams.get('p');
                const linkText = (link.textContent || '').trim();
                if (lastPathPart === targetStr || queryPage === targetStr || linkText === targetStr) {
                    return linkUrl.href;
                }
            }

            if (currentUrl.searchParams.has('page') || currentUrl.searchParams.has('p')) {
                const paramName = currentUrl.searchParams.has('page') ? 'page' : 'p';
                const nextUrl = new URL(currentUrl.href);
                nextUrl.searchParams.set(paramName, targetStr);
                nextUrl.hash = '';
                return nextUrl.href;
            }

            const hadTrailingSlash = currentUrl.pathname.endsWith('/');
            const pathParts = currentUrl.pathname.split('/').filter(Boolean);
            if (pathParts[0] === 'search' && pathParts[1]) {
                if (/^\d+$/.test(pathParts[2] || '')) {
                    pathParts[2] = targetStr;
                } else {
                    pathParts.splice(2, 0, targetStr);
                }
                const nextUrl = new URL(currentUrl.href);
                nextUrl.pathname = '/' + pathParts.join('/') + (hadTrailingSlash ? '/' : '');
                nextUrl.hash = '';
                return nextUrl.href;
            }
            return null;
        },

        /**
         * 提取当前结果表格中已有条目的去重键集合（优先使用磁力 BTIH 派生键）
         */
        getExistingRowKeys() {
            const keys = new Set();
            this.getResultRows().forEach((row, idx) => {
                if (row.dataset.rowKey) {
                    keys.add(row.dataset.rowKey);
                }
                const rowText = Utils.getRowText(row);
                const code = row.dataset.validCode || Utils.extractCode(rowText);
                if (!code) return;
                const magnet = row.querySelector('a[href^="magnet:"]')?.href || '';
                const title = (row.querySelector('.name') || row.cells?.[0])?.textContent?.trim() || '';
                keys.add(Utils.buildRowKey(code, magnet, title, idx + 1));
                if (!magnet) {
                    keys.add(`no-magnet:${code}|${title}`);
                }
            });
            return keys;
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

        showStatusBanner(text, continueOption = false, extraActions = null) {
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

            const actionsList = Array.isArray(extraActions)
                ? extraActions
                : (extraActions && extraActions.href ? [extraActions] : []);

            actionsList.forEach(action => {
                if (!action) return;
                const el = action.href ? document.createElement('a') : document.createElement('button');
                el.textContent = action.label || '操作';
                el.className = action.secondary ? 'tk-toolbar-btn tk-toolbar-btn--secondary' : 'tk-toolbar-btn';
                if (action.href) {
                    el.href = action.href;
                    el.target = action.target || '_blank';
                    el.rel = 'noopener noreferrer';
                    el.style.textDecoration = 'none';
                    el.style.display = 'inline-block';
                } else {
                    el.type = 'button';
                }
                if (typeof action.onClick === 'function') {
                    el.onclick = action.onClick;
                }
                banner.appendChild(el);
            });

            if (continueOption) {
                const isObj = typeof continueOption === 'object';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = (isObj && continueOption.label) || '加载更多';
                btn.className = (isObj && continueOption.secondary)
                    ? 'tk-toolbar-btn tk-toolbar-btn--secondary'
                    : 'tk-toolbar-btn';
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

        stopPagination(message, continueOption = true, extraActions = null) {
            state.targetValidCount = this.getVisibleCardsCount();
            this.showStatusBanner(message, continueOption, extraActions);
            this.dispatchQueue({ preserveBanner: true });
        },

        checkPaginationAndDispatch() {
            if (state.isFetchingPage) return;

            const visibleCount = this.getVisibleCardsCount();
            if (visibleCount < state.targetValidCount) {
                if (state.fetchPageNum - state.currentPageNum >= (state.settings.maxPagesToFetch || CONFIG.defaults.maxPagesToFetch)) {
                    this.stopPagination(`已加载至页数限制阈值。当前展示项目: ${visibleCount} 条`, true);
                    return;
                }

                state.fetchPageNum++;
                this.loadNextPage(state.fetchPageNum);
            } else {
                this.showStatusBanner(`共收集到 ${visibleCount} 条项目，正在异步加载封面数据...`, true);
                this.dispatchQueue();
            }
        },

        dispatchQueue(options = {}) {
            const { preserveBanner = false } = options;
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

            if (!preserveBanner && state.requestQueue.length === 0 && !state.isProcessing) {
                this.showStatusBanner('封面数据已从本地缓存全部加载完成！', true);
            }
        },

        loadNextPage(pageNum) {
            const nextUrl = this.getNextPageUrl(pageNum);
            if (!nextUrl) {
                state.fetchPageNum = Math.max(state.currentPageNum, pageNum - 1);
                console.warn(`[TorrentKitty] 无法解析第 ${pageNum} 页 URL`, window.location.href);
                this.stopPagination(`已无更多页面或无法解析翻页链接。当前累计项目: ${this.getVisibleCardsCount()} 条`, true);
                return;
            }

            console.log(`[TorrentKitty] 开始拉取第 ${pageNum} 页:`, nextUrl);
            this.showStatusBanner(`正在载入第 ${pageNum} 页数据以补充卡片... (当前展示项目: ${this.getVisibleCardsCount()}/${state.targetValidCount})`);
            state.isFetchingPage = true;

            sameOriginFetch(nextUrl).then(async response => {
                console.log(`[TorrentKitty] 第 ${pageNum} 页响应: HTTP ${response.status} -> ${response.finalUrl}`);
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
                const html = await response.text();
                if (this.isCloudflareHtml(response.status, html)) {
                    const err = new Error('ACCESS_DENIED');
                    err.status = response.status;
                    throw err;
                }
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return html;
            }).then(html => {
                state.pageRetryCount = 0;

                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const hasResultTable = Boolean(this._findResultTable(doc));
                const nextRows = this.getResultRows(doc);

                const resultsTable = this.getResultsTable();
                if (!resultsTable) {
                    console.error('[TorrentKitty] 已获取翻页响应，但当前页找不到结果表格容器');
                    state.isFetchingPage = false;
                    state.fetchPageNum = Math.max(state.currentPageNum, pageNum - 1);
                    this.stopPagination('已获取下一页，但无法识别结果表格。请检查页面结构或脚本版本。', true);
                    return;
                }

                if (nextRows.length === 0) {
                    console.warn(`[TorrentKitty] 第 ${pageNum} 页无结果行`, {
                        nextUrl,
                        hasResultTable,
                        title: doc.title,
                        htmlLength: html.length
                    });
                    state.isFetchingPage = false;
                    state.fetchPageNum = Math.max(state.currentPageNum, pageNum - 1);
                    const msg = hasResultTable
                        ? `第 ${pageNum} 页已无更多搜索结果。当前累计项目: ${this.getVisibleCardsCount()} 条`
                        : `第 ${pageNum} 页未检测到结果列表（页面标题: ${doc.title || '未知'}），可能无更多页或触发站点拦截`;
                    this.stopPagination(msg, !hasResultTable);
                    return;
                }

                const existingKeys = this.getExistingRowKeys();
                let parsedCount = 0;
                let duplicateCount = 0;
                let newTotalCount = 0;
                let addedVisibleCount = 0;

                nextRows.forEach((row, idx) => {
                    const rowText = Utils.getRowText(row);
                    const code = Utils.extractCode(rowText);
                    if (!code) return;

                    parsedCount++;
                    const magnet = row.querySelector('a[href^="magnet:"]')?.href || '';
                    const title = (row.querySelector('.name') || row.cells?.[0])?.textContent?.trim() || '';
                    const rowKey = Utils.buildRowKey(code, magnet, title, idx + 1);
                    const dedupeKey = magnet ? rowKey : `no-magnet:${code}|${title}`;

                    if (existingKeys.has(rowKey) || existingKeys.has(dedupeKey)) {
                        duplicateCount++;
                        return;
                    }

                    existingKeys.add(rowKey);
                    existingKeys.add(dedupeKey);

                    const importedRow = document.importNode(row, true);
                    importedRow.dataset.pageNum = pageNum;
                    if (magnet) importedRow.dataset.rowKey = rowKey;
                    importedRow.style.display = 'none';
                    resultsTable.appendChild(importedRow);
                    newTotalCount++;

                    if (!ExclusionManager.isTextExcluded(rowText)) {
                        addedVisibleCount++;
                    }
                });

                console.log(`[TorrentKitty] 第 ${pageNum} 页解析汇总: 原始行=${nextRows.length}, 有效番号=${parsedCount}, 重复=${duplicateCount}, 新增=${newTotalCount}, 未排除=${addedVisibleCount}`);
                state.isFetchingPage = false;

                if (parsedCount > 0 && newTotalCount === 0) {
                    state.fetchPageNum = Math.max(state.currentPageNum, pageNum - 1);
                    this.stopPagination(`第 ${pageNum} 页返回内容与当前结果重复，暂无更多新数据（当前共 ${this.getVisibleCardsCount()} 条）`, true);
                    return;
                }

                if (addedVisibleCount === 0) {
                    state.consecutiveEmptyPages++;
                    if (state.consecutiveEmptyPages >= CONFIG.pagination.maxConsecutiveEmptyPages) {
                        if (newTotalCount === 0) {
                            state.fetchPageNum = Math.max(state.currentPageNum, pageNum - 1);
                        }
                        this.stopPagination(`由于连续 ${CONFIG.pagination.maxConsecutiveEmptyPages} 页未探测到有效番号资源，停止自动追加。`, true);
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
                    this.stopPagination(`已到达最后一页。当前累计项目: ${this.getVisibleCardsCount()} 条`, false);
                    return;
                }

                if (error.message === 'ACCESS_DENIED') {
                    this.stopPagination(
                        '站点触发 Cloudflare 验证 (HTTP 403)，请点击按钮弹出小窗过盾，完成后将自动继续拉页。',
                        { label: '↻ 重试加载', secondary: true },
                        [
                            {
                                label: '🛡️ 弹出小窗过 CF 盾',
                                onClick: () => this.openCfVerifyPopup(nextUrl, pageNum)
                            }
                        ]
                    );
                    return;
                }

                state.pageRetryCount++;
                console.error(`[TorrentKitty] 自动翻页错误 (第 ${state.pageRetryCount} 次):`, error);

                if (state.pageRetryCount > CONFIG.pagination.maxPageRetries) {
                    this.stopPagination(`拉取第 ${pageNum} 页连续失败 ${CONFIG.pagination.maxPageRetries} 次，已停止自动重试。`, true);
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
            JavDBService.loadCircuitState();
            FavoritesManager.init();
            if (typeof SyncEngine !== 'undefined') {
                SyncEngine.init();
                if (SyncEngine.isConfigured()) {
                    setTimeout(() => SyncEngine.syncNow({ reason: 'startup' }), 800);
                }
            }
            CacheManager.init();
            EntryCacheManager.cleanupStale();

            state.currentPageNum = this.getCurrentPageNum();
            state.fetchPageNum = state.currentPageNum;

            // 恢复已缓存的翻页条目（按磁力 BTIH / rowKey 精确去重，不再吞同番号不同版本）
            const cachedEntries = EntryCacheManager.load();
            if (cachedEntries && cachedEntries.data && cachedEntries.data.length > 0) {
                const resultsTable = this.getResultsTable();
                if (resultsTable) {
                    const existingKeys = this.getExistingRowKeys();

                    let restoreCount = 0;
                    cachedEntries.data.forEach((item, idx) => {
                        const fixedCode = Utils.extractCode(item.title) || item.code;
                        const fixedItem = fixedCode !== item.code
                            ? { ...item, code: fixedCode, rowKey: Utils.buildRowKey(fixedCode, item.magnet, item.title, idx + 1) }
                            : item;
                        const key = fixedItem.rowKey || Utils.buildRowKey(fixedItem.code, fixedItem.magnet, fixedItem.title, idx + 1);
                        const dedupeKey = fixedItem.magnet ? key : `no-magnet:${fixedItem.code}|${fixedItem.title}`;
                        if (!existingKeys.has(key) && !existingKeys.has(dedupeKey)) {
                            existingKeys.add(key);
                            existingKeys.add(dedupeKey);
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
                    !m.target.closest?.('.tk-modal-overlay') &&
                    !m.target.closest?.('.tk-fav-popover') &&
                    !m.target.closest?.('.tk-fav-floating-bar') &&
                    !m.target.closest?.('.tk-lightbox-overlay') &&
                    !m.target.closest?.('table#archiveResult, table.results, .search-results, [data-tk-result-table="true"]')
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
            this._clearCfVerifyWatch();
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

    if (window.name === CF_VERIFY_WINDOW_NAME) {
        console.log('[TorrentKitty] 当前为 Cloudflare 验证小窗，跳过网格渲染以加快验证完成');
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init(), { once: true });
    } else {
        App.init();
    }

    window.addEventListener('beforeunload', () => App.cleanup());

})();
