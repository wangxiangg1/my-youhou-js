// ==UserScript==
// @name         JavDB & MissAV & Jable Bridge (完美直达版)
// @namespace    http://tampermonkey.net/
// @version      6.1.4
// @description  在 JavDB、MissAV、Jable 之间互相跳转；现代化UI、玻璃拟态风格、智能缓存
// @author       Gemini
// @match        https://javdb.com/v/*
// @match        *://*.missav.com/*
// @match        *://*.missav.ws/*
// @match        *://*.missav.ai/*
// @match        *://*.missav.li/*
// @match        *://*.missav.cc/*
// @match        *://*.missav.to/*
// @match        *://missav.com/*
// @match        *://missav.ws/*
// @match        *://missav.ai/*
// @match        *://missav.li/*
// @match        *://missav.cc/*
// @match        *://missav.to/*
// @match        https://jable.tv/videos/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=javdb.com
// @updateURL    https://github.com/wangxiangg1/my-youhou-js/raw/refs/heads/main/j-m.js
// @downloadURL  https://github.com/wangxiangg1/my-youhou-js/raw/refs/heads/main/j-m.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @connect      javdb.com
// @connect      jable.tv
// @connect      missav.ws
// @connect      missav.com
// @connect      missav.ai
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置常量 ====================
    const CONFIG = {
        // 版本号（与 @version 保持一致）
        version: '6.1.4',
        // 正常缓存过期时间 (7天)
        cacheExpiry: 7 * 24 * 60 * 60 * 1000,
        // 负缓存过期时间 (24小时) - 用于"搜索无结果"的情况
        negativeCacheExpiry: 24 * 60 * 60 * 1000,
        // 负缓存标记
        NOT_FOUND_MARKER: '__NOT_FOUND__',
        // 请求超时时间 (10秒)
        requestTimeout: 10000,
        // MissAV 基础 URL (获取配置的域名或自动检测的域名)
        get missavBaseUrl() {
            let origin = GM_getValue('missav_origin');
            if (origin) {
                // 双重保障校验逻辑
                if (!/^https?:\/\//i.test(origin)) {
                    origin = 'https://' + origin;
                }
                origin = origin.replace(/\/+$/, '').replace(/\/(cn|en|ja|ko|tw)$/i, '');
            } else {
                origin = 'https://missav.ws';
            }
            return `${origin}/cn`;
        },
        // JavDB 基础 URL
        javdbBaseUrl: 'https://javdb.com',
        // Jable 基础 URL
        jableBaseUrl: 'https://jable.tv',
        // 缓存键前缀
        cachePrefix: 'javdb_hash_'
    };

    // ==================== Premium SVG 图标 ====================
    const ICONS = {
        play: `<svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
        search: `<svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
        spinner: `<svg xmlns="http://www.w3.org/2000/svg" class="btn-icon spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`
    };

    // ==================== 样式工具 ====================
    const StyleUtils = {
        _iconTemplates: {}, // 缓存预解析的 SVG DOM

        /**
         * 注入全局 CSS
         */
        injectStyles() {
            if (document.getElementById('bridge-styles')) return;

            const style = document.createElement('style');
            style.id = 'bridge-styles';
            style.textContent = `
                :root {
                    /* === Organic 色板 === */
                    --sage: #8B9D83;           /* 鼠尾草 — 主色 */
                    --clay: #B08B6E;           /* 陶土 — 辅色 */
                    --terracotta: #C66B3D;     /* 赭石 — 强调色/盈利 */
                    --ochre: #C08E3A;          /* 赭黄 — 警告/中性 */
                    --moss: #606C38;           /* 苔藓 — 盈利深色 */
                    --sand: #E8DCC7;           /* 沙色 — 浅色背景 */
                    --oat: #D4B895;            /* 燕麦 — 卡片背景 */
                    --earth-dark: #3D3226;     /* 深棕 — 文字 */
                    --earth-darker: #2A2118;   /* 更深棕 — 标题 */
                    --loss-red: #9B3B2A;       /* 泥土红 — 亏损 */
                    --profit-green: #606C38;   /* 苔藓绿 — 盈利 */
                    /* === 结构 === */
                    --radius-sm: 16px;
                    --ease-gentle: cubic-bezier(0.25, 0.46, 0.45, 0.94);
                    --duration-gentle: 400ms;
                }

                @keyframes bridge-spin {
                    to { transform: rotate(360deg); }
                }

                @keyframes bridge-pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }

                @keyframes bridge-fadeIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .organic-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 5px 14px;
                    margin-left: 8px;
                    color: #ffffff !important;
                    border-radius: var(--radius-sm);
                    font-size: 13px;
                    font-weight: 600;
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji';
                    text-decoration: none !important;
                    cursor: pointer;
                    border: none;
                    transition: all var(--duration-gentle) var(--ease-gentle);
                    vertical-align: middle;
                    line-height: 1.2;
                    white-space: nowrap;
                    background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 100%);
                    box-shadow: 
                        inset 0 1px 1px rgba(255, 255, 255, 0.3),
                        inset 0 -1px 2px rgba(0, 0, 0, 0.15),
                        0 2px 8px rgba(0, 0, 0, 0.08);
                    animation: bridge-fadeIn 0.4s var(--ease-gentle) both;
                }

                .organic-btn:hover {
                    transform: translateY(-1.5px);
                    box-shadow: 
                        inset 0 1px 1px rgba(255, 255, 255, 0.4),
                        inset 0 -1px 2px rgba(0, 0, 0, 0.15),
                        0 4px 12px rgba(0, 0, 0, 0.15);
                    filter: brightness(1.08);
                }

                .organic-btn:active {
                    transform: translateY(1px) scale(0.98);
                    box-shadow: 
                        inset 0 3px 6px rgba(0, 0, 0, 0.2),
                        0 1px 2px rgba(0, 0, 0, 0.05);
                    background-image: linear-gradient(180deg, rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0) 100%);
                }

                .organic-btn.organic-missav {
                    background-color: var(--loss-red) !important;
                }

                .organic-btn.organic-jable {
                    background-color: var(--clay) !important;
                }

                .organic-btn.organic-javdb {
                    background-color: var(--sage) !important;
                    color: var(--earth-darker) !important;
                }

                .organic-btn.organic-search {
                    background-color: var(--ochre) !important;
                }

                .organic-btn.organic-loading {
                    background-color: var(--oat) !important;
                    color: var(--earth-dark) !important;
                    pointer-events: none;
                    opacity: 0.8;
                }

                .organic-btn.organic-success {
                    background-color: var(--profit-green) !important;
                    animation: bridge-pulse 0.5s ease-out;
                }

                .organic-btn.organic-error {
                    background-color: var(--loss-red) !important;
                }

                .organic-btn.success {
                    animation: bridge-pulse 0.5s ease-out;
                }

                .organic-btn .btn-icon {
                    width: 13px;
                    height: 13px;
                    stroke: currentColor;
                    fill: none;
                    transition: transform var(--duration-gentle) var(--ease-gentle);
                }

                .organic-btn:hover .btn-icon:not(.spinner) {
                    transform: translateX(2px);
                }

                .organic-btn .spinner {
                    transform-origin: center;
                    animation: bridge-spin 1s linear infinite;
                }

                /* Bridge 按钮容器通用样式 */
                .bridge-action-container {
                    display: inline-flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-left: 10px;
                }
            `;
            document.head.appendChild(style);
        },

        /**
         * 安全设置按钮内容（使用缓存的 SVG Template）
         */
        _setButtonContent(btn, text, iconKey, isLoading) {
            btn.textContent = '';
            
            const activeIconKey = isLoading ? 'spinner' : iconKey;
            const iconSvg = ICONS[activeIconKey];
            
            if (iconSvg) {
                if (!this._iconTemplates[activeIconKey]) {
                    const template = document.createElement('template');
                    template.innerHTML = iconSvg.trim();
                    this._iconTemplates[activeIconKey] = template.content.firstChild;
                }
                btn.appendChild(this._iconTemplates[activeIconKey].cloneNode(true));
            }

            const textSpan = document.createElement('span');
            textSpan.textContent = text;
            btn.appendChild(textSpan);
        },

        /**
         * 创建按钮
         */
        createButton(text, url, btnType, options = {}) {
            const { tooltip = '', isLoading = false, icon = '' } = options;

            const btn = document.createElement('a');
            btn.href = url;
            btn.target = '_blank';
            btn.rel = 'noopener noreferrer';
            btn.className = `organic-btn organic-${isLoading ? 'loading' : btnType}`;

            if (tooltip) {
                btn.title = tooltip;
            }

            this._setButtonContent(btn, text, icon, isLoading);

            return btn;
        },

        /**
         * 更新按钮状态
         */
        updateButton(btn, text, btnType, options = {}) {
            const { icon = '', addSuccessAnimation = false, isLoading = false } = options;

            btn.className = `organic-btn organic-${isLoading ? 'loading' : btnType}`;

            this._setButtonContent(btn, text, icon, isLoading);

            if (addSuccessAnimation) {
                btn.classList.add('success');
                setTimeout(() => btn.classList.remove('success'), 500);
            }
        }
    };

    // ==================== 缓存管理 ====================
    const CacheManager = {
        /**
         * 获取缓存
         * @returns {object|null} { url, isNegative } 或 null（无缓存/已过期）
         */
        get(code) {
            const cacheKey = CONFIG.cachePrefix + code;
            try {
                const cached = GM_getValue(cacheKey);
                if (cached) {
                    const { url, timestamp, isNegative } = JSON.parse(cached);
                    // 根据缓存类型选择过期时间
                    const expiry = isNegative ? CONFIG.negativeCacheExpiry : CONFIG.cacheExpiry;
                    // 检查是否过期
                    if (Date.now() - timestamp < expiry) {
                        return { url, isNegative: !!isNegative };
                    } else {
                        // 惰性删除：过期时物理删除该条目
                        GM_deleteValue(cacheKey);
                        console.log(`[Bridge] 缓存已过期并删除: ${code}`);
                    }
                }
            } catch (e) {
                console.error('[Bridge] 缓存读取错误:', e);
            }
            return null;
        },

        /**
         * 设置正常缓存（找到了结果）
         */
        set(code, url) {
            try {
                GM_setValue(CONFIG.cachePrefix + code, JSON.stringify({
                    url: url,
                    timestamp: Date.now(),
                    isNegative: false
                }));
            } catch (e) {
                console.error('[Bridge] 缓存写入错误:', e);
            }
        },

        /**
         * 设置负缓存（搜索无结果，非网络错误）
         */
        setNotFound(code) {
            try {
                GM_setValue(CONFIG.cachePrefix + code, JSON.stringify({
                    url: CONFIG.NOT_FOUND_MARKER,
                    timestamp: Date.now(),
                    isNegative: true
                }));
                console.log(`[Bridge] 负缓存已存储: ${code} (24小时内不再请求)`);
            } catch (e) {
                console.error('[Bridge] 负缓存写入错误:', e);
            }
        },

        /**
         * 主动清理过期缓存
         */
        cleanup() {
            try {
                if (typeof GM_listValues === 'undefined') return;
                
                const lastCleanup = GM_getValue('last_cleanup_date', 0);
                // 每天最多全量清理一次
                if (Date.now() - lastCleanup < 24 * 60 * 60 * 1000) return;
                GM_setValue('last_cleanup_date', Date.now());

                const keys = GM_listValues();
                let deletedCount = 0;
                for (const key of keys) {
                    if (key.startsWith(CONFIG.cachePrefix)) {
                        const cached = GM_getValue(key);
                        if (cached) {
                            try {
                                const { timestamp, isNegative } = JSON.parse(cached);
                                const expiry = isNegative ? CONFIG.negativeCacheExpiry : CONFIG.cacheExpiry;
                                if (Date.now() - timestamp >= expiry) {
                                    GM_deleteValue(key);
                                    deletedCount++;
                                }
                            } catch (e) {
                                GM_deleteValue(key);
                            }
                        }
                    }
                }
                if (deletedCount > 0) {
                    console.log(`[Bridge] 缓存清理完成，共删除了 ${deletedCount} 条过期数据`);
                }
            } catch (e) {
                console.error('[Bridge] 缓存清理错误:', e);
            }
        }
    };

    // ==================== 番号提取工具 ====================
    const CodeExtractor = {
        /**
         * 统一清洗番号方法
         * 1. 过滤常见非番号后缀（中文字幕、画质、无码等），支持多段数字后缀如 4k-1
         * 2. 若过滤后包含数字，则作为番号大写返回
         * 3. 否则，回退到提取首个连续数字的策略
         */
        cleanCode(rawCode) {
            if (!rawCode) return null;
            
            // 过滤常见非番号后缀 (不区分大小写，全局匹配)
            // 支持：-chinese-subtitle, -uncensored, -4k, -8k, -vr, -leak, -sub, -c, -hd, -sd, -fv, -uncut, -vip, -h264 等，且兼容可能有后续数字后缀如 -4k-1
            let temp = rawCode.replace(/-(chinese-subtitle|chinese|uncensored|4k|8k|vr|leak|sub|c|hd|sd|fv|uncut|vip|leak|h264)(-\d+)?/ig, '');
            
            // 如果清洗后仍包含数字，则直接转换大写返回，如 fc2-ppv-123456-7
            if (/\d+/.test(temp)) {
                return temp.toUpperCase();
            }
            
            // 否则，兜底回退到第一段连续数字的匹配
            const codeMatch = rawCode.match(/^(.*?\d+)/i);
            if (codeMatch) {
                return codeMatch[1].toUpperCase();
            }
            
            return rawCode.toUpperCase();
        },

        /**
         * 从 MissAV URL 提取番号
         * URL 格式: https://missav.ws/cn/xxxx-123 或 https://missav.ws/cn/xxxx-123-chinese-subtitle
         */
        fromMissAVUrl() {
            const path = window.location.pathname;
            // 移除语言代码 (如 /cn/)
            const cleanPath = path.replace(/^\/(cn|en|ja|ko|tw)\//i, '/');
            const segments = cleanPath.split('/').filter(Boolean);
            const rawCode = segments[segments.length - 1];

            return this.cleanCode(rawCode);
        },

        /**
         * 从 JavDB 页面提取番号
         *
         * 采用“结构优先 + 文案兜底”的双重策略，避免因页面语言切换
         * （繁體「番號」/ 简体「番号」/ 英文 ID）导致提取失败：
         *   1. 优先用固定的结构特征 `.panel-block.first-block` 定位番号行；
         *   2. 结构未命中时，回退到文案匹配（繁体/简体/ID 全覆盖）。
         */
        fromJavDBPage() {
            let block = null;

            // —— 主路径：用固定结构特征定位，完全不受语言文案影响 ——
            const firstBlock = document.querySelector('.panel-block.first-block');
            if (firstBlock && firstBlock.querySelector('.value')) {
                block = firstBlock;
            }

            // —— 兜底：结构变化时，回退到文案匹配（繁/简/ID 全覆盖） ——
            if (!block) {
                const panelBlocks = document.querySelectorAll('.panel-block');
                for (const b of panelBlocks) {
                    const text = b.textContent || '';
                    if (text.includes('番號') || text.includes('番号') || text.includes('ID')) {
                        if (b.querySelector('.value')) {
                            block = b;
                            break;
                        }
                    }
                }
            }

            if (!block) return null;

            const valueSpan = block.querySelector('.value');
            if (!valueSpan) return null;

            return {
                code: valueSpan.textContent.trim().toUpperCase(),
                targetBlock: block
            };
        },

        /**
         * 从 Jable URL 提取番号
         * URL 格式: https://jable.tv/videos/xxxx-123/ 或 https://jable.tv/videos/xxxx-123-chinese-subtitle/
         */
        fromJableUrl() {
            const path = window.location.pathname;
            // 匹配 /videos/xxxx-123/ 格式
            const match = path.match(/\/videos\/([^\/]+)/);
            if (match && match[1]) {
                return this.cleanCode(match[1]);
            }
            return null;
        }
    };

    // ==================== JavDB 服务 ====================
    const JavDBService = {
        /**
         * 获取 JavDB 详情页真实链接
         */
        fetchRealUrl(code, callback) {
            // 先检查缓存
            const cached = CacheManager.get(code);
            if (cached) {
                if (cached.isNegative) {
                    // 负缓存：之前搜索过但没找到
                    console.log(`[Bridge] 负缓存命中: ${code} (JavDB无此资源)`);
                    const searchUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
                    callback({ success: false, fallbackUrl: searchUrl, fromCache: true });
                    return;
                }
                // 正常缓存
                console.log(`[Bridge] 缓存命中: ${code} -> ${cached.url}`);
                callback({ success: true, url: cached.url, fromCache: true });
                return;
            }

            // 发起请求
            const searchUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;

            GM_xmlhttpRequest({
                method: 'GET',
                url: searchUrl,
                timeout: CONFIG.requestTimeout,
                onload: function (response) {
                    let doc = null;
                    try {
                        const parser = new DOMParser();
                        doc = parser.parseFromString(response.responseText, 'text/html');
                    } catch (e) {
                        console.error('[Bridge] 解析返回的 HTML 失败:', e);
                    }

                    // 检查是否遭遇 Cloudflare 5秒盾或验证码等异常拦截
                    const isCFChallenge = 
                        response.status === 403 || 
                        response.status === 503 || 
                        (doc && (
                            doc.title.includes('Just a moment') || 
                            doc.title.includes('Attention Required') || 
                            doc.querySelector('#cf-challenge') || 
                            doc.body.textContent.includes('cf-challenge') ||
                            doc.body.textContent.includes('Just a moment...')
                        ));

                    if (isCFChallenge) {
                        console.warn('[Bridge] JavDB 请求遭遇 Cloudflare 拦截或异常防护，不写入缓存');
                        callback({ success: false, error: 'Cloudflare 拦截' });
                        return;
                    }

                    if (response.status === 200 && doc) {
                        const firstResult = doc.querySelector('.movie-list a.box');

                        if (firstResult) {
                            // 校验搜索结果的番号是否与查询番号精确匹配 (防止短番号错误匹配长番号，如 PPV-123 误匹配 FC2-PPV-123)
                            const resultTitle = firstResult.querySelector('.video-title strong, strong');
                            const resultCode = resultTitle ? resultTitle.textContent.trim().toUpperCase() : '';

                            // 考虑某些特殊格式去标点后全等或仅包含合理后缀（如 VR）
                            const pureResult = resultCode.replace(/[^A-Z0-9]/ig, '');
                            const pureCode = code.toUpperCase().replace(/[^A-Z0-9]/ig, '');

                            // 精确判定逻辑：
                            // 1. 去除标点后完全相等
                            // 2. 或满足合理的后缀修饰（如 SSIS-123-VR 去除标点后为 SSIS123VR，以 SSIS123 开头且后缀为不超过3位的纯字母）
                            let isMatch = (pureResult === pureCode);
                            if (!isMatch && pureResult.startsWith(pureCode)) {
                                const suffix = pureResult.slice(pureCode.length);
                                if (suffix.length <= 3 && /^[A-Z]*$/.test(suffix)) {
                                    isMatch = true;
                                }
                            }

                            if (isMatch) {
                                const href = firstResult.getAttribute('href');
                                const realUrl = `${CONFIG.javdbBaseUrl}${href}`;

                                // 写入正常缓存
                                CacheManager.set(code, realUrl);

                                callback({ success: true, url: realUrl });
                            } else {
                                // 搜索结果番号不匹配 -> 当作未找到处理
                                console.log(`[Bridge] 搜索结果番号不匹配: 期望 ${code}, 实际 ${resultCode}`);
                                CacheManager.setNotFound(code);
                                callback({ success: false, fallbackUrl: searchUrl });
                            }
                        } else {
                            // 搜索成功但无结果 -> 写入负缓存
                            CacheManager.setNotFound(code);
                            callback({ success: false, fallbackUrl: searchUrl });
                        }
                    } else {
                        callback({ success: false, error: `HTTP ${response.status}` });
                    }
                },
                onerror: function (err) {
                    console.error('[Bridge] 请求失败:', err);
                    callback({ success: false, error: '网络错误' });
                },
                ontimeout: function () {
                    console.error('[Bridge] 请求超时');
                    callback({ success: false, error: '请求超时' });
                }
            });
        }
    };

    // ==================== 页面处理器 ====================
    const PageHandler = {
        /**
         * 创建 JavDB 查询结果的统一回调处理函数
         * @param {HTMLElement} btnJavDB - JavDB 按钮元素
         * @param {string} code - 番号
         * @returns {function} 回调函数
         */
        _createFetchResultHandler(btnJavDB, code) {
            let retryCount = 0;
            const MAX_RETRIES = 3;
            const handleFetchResult = (result) => {
                if (result.success) {
                    btnJavDB.href = result.url;
                    StyleUtils.updateButton(btnJavDB, 'JavDB 直达', 'javdb', {
                        icon: 'play',
                        addSuccessAnimation: !result.fromCache
                    });
                    btnJavDB.title = result.fromCache ? '从缓存加载' : '已找到详情页';
                    btnJavDB.onclick = null;
                } else if (result.fallbackUrl) {
                    btnJavDB.href = result.fallbackUrl;
                    StyleUtils.updateButton(btnJavDB, 'JavDB 搜索', 'search', {
                        icon: 'search'
                    });
                    btnJavDB.title = '未找到直达链接，点击搜索';
                    btnJavDB.onclick = null;
                } else if (retryCount >= MAX_RETRIES) {
                    // 超过最大重试次数，显示终态失败
                    const searchUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
                    btnJavDB.href = searchUrl;
                    StyleUtils.updateButton(btnJavDB, 'JavDB 搜索', 'error', {
                        icon: 'search'
                    });
                    btnJavDB.title = `重试 ${MAX_RETRIES} 次后仍失败，点击手动搜索`;
                    btnJavDB.onclick = null;
                } else {
                    retryCount++;
                    StyleUtils.updateButton(btnJavDB, `重试 (${retryCount}/${MAX_RETRIES})`, 'error');
                    btnJavDB.title = result.error || '请求失败';
                    btnJavDB.onclick = (e) => {
                        e.preventDefault();
                        StyleUtils.updateButton(btnJavDB, '重试中...', 'javdb', { isLoading: true });
                        JavDBService.fetchRealUrl(code, handleFetchResult);
                    };
                }
            };
            return handleFetchResult;
        },

        /**
         * 提炼出一个通用的 Bridge 按钮容器创建及异步绑定工厂方法
         * @param {string} currentPlatform - 当前所在平台 ('missav' | 'jable')
         * @param {string} code - 番号
         * @returns {HTMLElement} 包含完整事件绑定及状态的按钮容器
         */
        _createBridgeContainer(currentPlatform, code) {
            const container = document.createElement('span');
            container.className = 'bridge-action-container';

            let directBtn;
            if (currentPlatform === 'missav') {
                // 在 MissAV 页面，需要 Jable 直达按钮
                const jableDirectUrl = `${CONFIG.jableBaseUrl}/videos/${code.toLowerCase()}/`;
                directBtn = StyleUtils.createButton('Jable', jableDirectUrl, 'jable', {
                    tooltip: '直达 Jable 播放页',
                    icon: 'play'
                });
            } else if (currentPlatform === 'jable') {
                // 在 Jable 页面，需要 MissAV 直达按钮
                const missavDirectUrl = `${CONFIG.missavBaseUrl}/${code.toLowerCase()}`;
                directBtn = StyleUtils.createButton('MissAV', missavDirectUrl, 'missav', {
                    tooltip: '直达 MissAV 播放页',
                    icon: 'play'
                });
            }

            // JavDB（动态查询）
            const fallbackUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
            const btnJavDB = StyleUtils.createButton('JavDB', fallbackUrl, 'javdb', {
                tooltip: '正在查询 JavDB...',
                isLoading: true
            });

            if (directBtn) {
                container.appendChild(directBtn);
            }
            container.appendChild(btnJavDB);

            // 发起请求获取真实链接并绑定回调状态
            const handleFetchResult = this._createFetchResultHandler(btnJavDB, code);
            JavDBService.fetchRealUrl(code, handleFetchResult);

            return container;
        },

        /**
         * 处理 JavDB 页面
         */
        handleJavDB() {
            const result = CodeExtractor.fromJavDBPage();
            if (!result) return;

            const { code, targetBlock } = result;

            // 防重复注入
            if (targetBlock.querySelector('.bridge-action-container')) return;

            // 创建按钮容器
            const container = document.createElement('span');
            container.className = 'bridge-action-container';

            // 按钮 1: MissAV 直达
            const missavDirectUrl = `${CONFIG.missavBaseUrl}/${code.toLowerCase()}`;
            const btnMissAV = StyleUtils.createButton('MissAV', missavDirectUrl, 'missav', {
                tooltip: '直达 MissAV 播放页',
                icon: 'play'
            });

            // 按钮 2: Jable 直达
            const jableDirectUrl = `${CONFIG.jableBaseUrl}/videos/${code.toLowerCase()}/`;
            const btnJable = StyleUtils.createButton('Jable', jableDirectUrl, 'jable', {
                tooltip: '直达 Jable 播放页',
                icon: 'play'
            });

            // 按钮 3: MissAV 搜索
            const searchUrl = `${CONFIG.missavBaseUrl}/search/${code}`;
            const btnSearch = StyleUtils.createButton('搜索', searchUrl, 'search', {
                tooltip: '在 MissAV 搜索',
                icon: 'search'
            });

            container.appendChild(btnMissAV);
            container.appendChild(btnJable);
            container.appendChild(btnSearch);
            targetBlock.appendChild(container);

            // P0: 反向预热 - 将当前页面信息写入缓存
            CacheManager.set(code, window.location.href);
            console.log(`[Bridge] JavDB 页面增强完成: ${code} (已预热缓存)`);
        },

        /**
         * 处理 MissAV 页面
         */
        handleMissAV() {
            const code = CodeExtractor.fromMissAVUrl();
            if (!code) return;

            const titleElement = document.querySelector('h1');
            if (!titleElement) return;

            // 防重复注入
            if (titleElement.querySelector('.bridge-action-container')) return;

            const container = this._createBridgeContainer('missav', code);
            titleElement.appendChild(container);

            console.log(`[Bridge] MissAV 页面增强完成: ${code}`);
        },

        /**
         * 处理 Jable 页面
         */
        handleJable() {
            const code = CodeExtractor.fromJableUrl();
            if (!code) {
                console.log('[Bridge] Jable: 无法提取番号');
                return;
            }

            console.log(`[Bridge] Jable: 提取到番号 ${code}，正在查找标题元素...`);

            // 方法1: 优先尝试常见的标题精确选择器
            let titleElement = null;
            const selectors = [
                '.header-left h4',
                '.video-info h1',
                '.video-detail h1',
                '.video-title',
                '.header-right h4'
            ];

            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el && el.textContent.trim().toUpperCase().includes(code)) {
                    titleElement = el;
                    console.log(`[Bridge] Jable: 通过精确选择器找到标题元素 (${selector})`);
                    break;
                }
            }

            // 方法2: 如果没找到，退级遍历所有 Heading
            if (!titleElement) {
                const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5');
                for (const heading of allHeadings) {
                    if (heading.textContent && heading.textContent.toUpperCase().includes(code)) {
                        titleElement = heading;
                        console.log(`[Bridge] Jable: 通过遍历标题找到元素 (${heading.tagName})`);
                        break;
                    }
                }
            }

            if (!titleElement) {
                console.log('[Bridge] Jable: 未找到标题元素，尝试播放器下方');
                // 尝试找到播放器下方的视频信息区域
                const playerContainer = document.querySelector('.video-info, .video-detail, .player-box, #player, .player-container');
                if (playerContainer) {
                    // 在播放器容器后插入按钮
                    this._injectAfterElement(code, playerContainer);
                    return;
                }
                // 最后备选：浮动模式
                this._injectFloatingButtons(code);
                return;
            }

            this._injectJableButtons(code, titleElement);
        },

        /**
         * 在指定元素后面注入按钮
         */
        _injectAfterElement(code, targetElement) {
            // 检查是否已经注入过
            if (document.getElementById('jable-bridge-after')) return;

            const container = this._createBridgeContainer('jable', code);
            container.id = 'jable-bridge-after';
            container.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 10px;
                padding: 10px;
            `;

            // 插入到目标元素后面
            targetElement.insertAdjacentElement('afterend', container);
            console.log(`[Bridge] Jable 页面增强完成 (元素后插入模式): ${code}`);
        },

        /**
         * 在固定位置注入按钮（找不到合适标题元素时的备选方案）
         */
        _injectFloatingButtons(code) {
            // 检查是否已经注入过
            if (document.getElementById('jable-bridge-floating')) return;

            const container = this._createBridgeContainer('jable', code);
            container.id = 'jable-bridge-floating';
            container.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;

            document.body.appendChild(container);
            console.log(`[Bridge] Jable 页面增强完成 (浮动模式): ${code}`);
        },

        /**
         * 在 Jable 页面注入按钮
         */
        _injectJableButtons(code, titleElement) {
            // 检查是否已经注入过
            if (titleElement.querySelector('.bridge-action-container')) {
                console.log('[Bridge] Jable: 按钮已存在，跳过');
                return;
            }

            const container = this._createBridgeContainer('jable', code);
            titleElement.appendChild(container);
            console.log(`[Bridge] Jable 页面增强完成: ${code}`);
        },
    };

    // ==================== 主程序 ====================
    const App = {
        init() {
            // 注入全局样式
            StyleUtils.injectStyles();

            // 注册自定义 MissAV 域名菜单
            if (typeof GM_registerMenuCommand !== 'undefined') {
                GM_registerMenuCommand('🔧 设置自定义 MissAV 域名', () => {
                    const current = GM_getValue('missav_origin', 'https://missav.ws');
                    const input = prompt('请输入自定义 MissAV 域名（例如 https://missav.ws）：\n(若置空则清除自定义，恢复自动检测)', current);
                    if (input === null) return;
                    
                    const trimmed = input.trim();
                    if (trimmed === '') {
                        GM_deleteValue('missav_origin');
                        GM_deleteValue('missav_origin_custom');
                        alert('已清除自定义域名，将使用自动检测。');
                    } else {
                        let domain = trimmed;
                        if (!/^https?:\/\//i.test(domain)) {
                            domain = 'https://' + domain;
                        }
                        domain = domain.replace(/\/+$/, '').replace(/\/(cn|en|ja|ko|tw)$/i, '');
                        
                        GM_setValue('missav_origin', domain);
                        GM_setValue('missav_origin_custom', true);
                        alert(`自定义 MissAV 域名设置成功：\n${domain}\n\n脚本将使用此域名作为直达基础 URL（自动拼接语言路径 /cn）。`);
                    }
                });
            }

            // 以较小概率（例如 5%）执行过期的缓存清理，防止影响页面加载性能
            if (Math.random() < 0.05) {
                CacheManager.cleanup();
            }

            // 输出版本信息
            console.log(
                `%c🔗 JavDB & MissAV & Jable Bridge v${CONFIG.version} %c已加载`,
                'background: linear-gradient(135deg, #f39c12, #e67e22); color: white; padding: 4px 8px; border-radius: 4px 0 0 4px; font-weight: bold;',
                'background: linear-gradient(135deg, #9b59b6, #8e44ad); color: white; padding: 4px 8px; border-radius: 0 4px 4px 0; font-weight: bold;'
            );

            // 直接执行（Tampermonkey 注入时 DOM 已就绪，无需等待 load 事件）
            this.route();

            // 针对 MissAV / Jable 等使用 PJAX 或 Turbolinks 的单页应用进行兼容监听
            this._setupSpaObserver();
        },

        /**
         * 判定当前 URL 是否为支持的详情页
         */
        isDetailPage(urlStr) {
            try {
                const parsedUrl = new URL(urlStr);
                const path = parsedUrl.pathname;
                const host = parsedUrl.hostname;

                if (host.includes('javdb.com')) {
                    // JavDB 详情页特征：/v/xxxx
                    return /^\/v\/[a-z0-9]+/i.test(path);
                }
                if (host.includes('missav')) {
                    // MissAV 详情页特征：排除已知的列表、分类、搜索等非详情路径
                    const skipPaths = ['/', '/search', '/genres', '/actresses', '/makers', '/directors', '/new', '/release', '/saved'];
                    const cleanPath = path.replace(/^\/(cn|en|ja|ko|tw)/i, '');
                    const firstSegment = cleanPath.split('/').filter(Boolean)[0];
                    
                    if (!firstSegment || skipPaths.includes('/' + firstSegment)) {
                        return false;
                    }
                    if (path.includes('/search')) {
                        return false;
                    }
                    return true;
                }
                if (host.includes('jable.tv')) {
                    // Jable 详情页特征：/videos/xxxx/
                    return path.startsWith('/videos/');
                }
            } catch (e) {
                console.error('[Bridge] isDetailPage 判定解析出错:', e);
            }
            return false;
        },

        /**
         * 销毁页面上所有可能残留的桥梁容器，防止多详情页跳转残留
         */
        _clearOldContainers() {
            const selectors = ['.bridge-action-container', '#jable-bridge-floating', '#jable-bridge-after'];
            selectors.forEach(sel => {
                const els = document.querySelectorAll(sel);
                els.forEach(el => {
                    try {
                        el.remove();
                    } catch (e) {
                        console.error('[Bridge] 清除旧容器失败:', e);
                    }
                });
            });
        },

        /**
         * 路由派发
         */
        route() {
            const currentUrl = window.location.href;

            // 每次路由分发前，主动清除旧桥梁容器，以防 DOM 残留
            this._clearOldContainers();

            // 如果当前不是详情页，跳过路由分发
            if (!this.isDetailPage(currentUrl)) {
                return;
            }

            if (currentUrl.includes('javdb.com')) {
                PageHandler.handleJavDB();
            } else if (window.location.hostname.includes('missav')) {
                // 记录当前 MissAV 域名偏好 (减少无用 I/O，且非自定义时才更新)
                const currentOrigin = window.location.origin;
                if (!GM_getValue('missav_origin_custom')) {
                    if (GM_getValue('missav_origin') !== currentOrigin) {
                        GM_setValue('missav_origin', currentOrigin);
                    }
                }
                PageHandler.handleMissAV();
            } else if (currentUrl.includes('jable.tv')) {
                PageHandler.handleJable();
            }
        },

        /**
         * 监听单页应用(SPA)的动态页面变化 (使用 History API)
         */
        _setupSpaObserver() {
            let lastUrl = window.location.href;

            const checkUrlChange = () => {
                if (window.location.href !== lastUrl) {
                    lastUrl = window.location.href;
                    console.log(`[Bridge] SPA 路由变化检测到: ${lastUrl}`);
                    
                    // 路由变化时，立即清理旧桥梁容器以备重新注入，并延迟执行以等待 DOM 渲染完毕
                    this._clearOldContainers();
                    setTimeout(() => this.route(), 500);
                }
            };

            // 拦截 pushState 和 replaceState
            const originalPushState = history.pushState;
            history.pushState = function() {
                originalPushState.apply(this, arguments);
                checkUrlChange();
            };

            const originalReplaceState = history.replaceState;
            history.replaceState = function() {
                originalReplaceState.apply(this, arguments);
                checkUrlChange();
            };

            window.addEventListener('popstate', checkUrlChange);

            // 低频轮询：针对局部刷新导致的按钮消失，使用 setInterval 替代高频的 MutationObserver
            // 页面不可见或非详情页时直接跳过，避免多余的 DOM 查询开销
            setInterval(() => {
                if (document.hidden) return;
                if (!this.isDetailPage(window.location.href)) return;
                if (!document.querySelector('.bridge-action-container')) {
                    this.route();
                }
            }, 2000);
        }
    };

    // ==================== 启动 ====================
    App.init();

})();
