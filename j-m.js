// ==UserScript==
// @name         JavDB & MissAV & Jable Bridge (完美直达版)
// @namespace    http://tampermonkey.net/
// @version      6.1.1
// @description  在 JavDB、MissAV、Jable 之间互相跳转；现代化UI、玻璃拟态风格、智能缓存
// @author       Gemini
// @match        https://javdb.com/v/*
// @match        https://missav.ws/*
// @match        https://missav.com/*
// @match        https://missav.ai/*
// @match        https://jable.tv/videos/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=javdb.com
// @updateURL    https://github.com/wangxiangg1/my-youhou-js/raw/refs/heads/main/j-m.js
// @downloadURL  https://github.com/wangxiangg1/my-youhou-js/raw/refs/heads/main/j-m.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
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
        version: '6.1.1',
        // 正常缓存过期时间 (7天)
        cacheExpiry: 7 * 24 * 60 * 60 * 1000,
        // 负缓存过期时间 (24小时) - 用于"搜索无结果"的情况
        negativeCacheExpiry: 24 * 60 * 60 * 1000,
        // 负缓存标记
        NOT_FOUND_MARKER: '__NOT_FOUND__',
        // 请求超时时间 (10秒)
        requestTimeout: 10000,
        // MissAV 基础 URL (动态获取)
        get missavBaseUrl() {
            const stored = GM_getValue('missav_origin');
            return stored ? `${stored}/cn` : 'https://missav.ws/cn';
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
                @import url('https://fonts.googleapis.com/css2?family=Epilogue:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

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
                    font-family: 'Epilogue', system-ui, -apple-system, sans-serif;
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
         * 从 MissAV URL 提取番号
         * URL 格式: https://missav.ws/cn/xxxx-123 或 https://missav.ws/cn/xxxx-123-chinese-subtitle
         */
        fromMissAVUrl() {
            const path = window.location.pathname;
            // 移除语言代码 (如 /cn/)
            const cleanPath = path.replace(/^\/(cn|en|ja|ko|tw)\//i, '/');
            const segments = cleanPath.split('/').filter(Boolean);
            const rawCode = segments[segments.length - 1];

            if (!rawCode) return null;

            // 精确提取番号部分，截取到最后一个数字为止（兼容 -中文字幕, -4k 等非纯字母后缀）
            const codeMatch = rawCode.match(/^(.*?\d+)/i);
            if (codeMatch) {
                return codeMatch[1].toUpperCase();
            }
            return null;
        },

        /**
         * 从 JavDB 页面提取番号
         */
        fromJavDBPage() {
            const panelBlocks = document.querySelectorAll('.panel-block');

            for (const block of panelBlocks) {
                if (block.textContent.includes('番號') || block.textContent.includes('ID')) {
                    const valueSpan = block.querySelector('.value');
                    if (valueSpan) {
                        return {
                            code: valueSpan.textContent.trim().toUpperCase(),
                            targetBlock: block
                        };
                    }
                }
            }
            return null;
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
                const rawCode = match[1];
                // 精确提取番号部分，截取到最后一个数字为止（兼容非纯字母后缀）
                const codeMatch = rawCode.match(/^(.*?\d+)/i);
                if (codeMatch) {
                    return codeMatch[1].toUpperCase();
                }
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
                    if (response.status === 200) {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, 'text/html');

                        // 检查是否遭遇 Cloudflare 5秒盾等异常拦截（页面无关键元素且非正常搜索结果页）
                        if (!doc.querySelector('.movie-list') && !doc.title.includes('JavDB')) {
                            console.warn('[Bridge] JavDB 返回内容异常，可能触发了 Cloudflare 拦截');
                            callback({ success: false, error: '安全拦截或页面异常' });
                            return;
                        }

                        const firstResult = doc.querySelector('.movie-list a.box');

                        if (firstResult) {
                            // 校验搜索结果的番号是否与查询番号精确匹配 (防止短番号错误匹配长番号)
                            const resultTitle = firstResult.querySelector('.video-title strong, strong');
                            const resultCode = resultTitle ? resultTitle.textContent.trim().toUpperCase() : '';

                            const regex = new RegExp(`\\b${code.toUpperCase()}\\b`, 'i');
                            
                            // 考虑某些特殊格式去标点后全等
                            const pureResult = resultCode.replace(/[^A-Z0-9]/ig, '');
                            const pureCode = code.toUpperCase().replace(/[^A-Z0-9]/ig, '');

                            if (regex.test(resultCode) || pureResult === pureCode) {
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
            // 这样下次在 MissAV 遇到相同番号时，无需发起网络请求
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

            // 创建按钮容器
            const container = document.createElement('span');
            container.className = 'bridge-action-container';

            // 按钮 1: Jable 直达
            const jableDirectUrl = `${CONFIG.jableBaseUrl}/videos/${code.toLowerCase()}/`;
            const btnJable = StyleUtils.createButton('Jable', jableDirectUrl, 'jable', {
                tooltip: '直达 Jable 播放页',
                icon: 'play'
            });

            // 按钮 2: JavDB（动态查询）
            const fallbackUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
            const btnJavDB = StyleUtils.createButton('JavDB', fallbackUrl, 'javdb', {
                tooltip: '正在查询 JavDB...',
                isLoading: true
            });

            container.appendChild(btnJable);
            container.appendChild(btnJavDB);
            titleElement.appendChild(container);

            // 发起请求获取真实链接
            const handleFetchResult = this._createFetchResultHandler(btnJavDB, code);
            JavDBService.fetchRealUrl(code, handleFetchResult);

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

            // 创建容器
            const container = document.createElement('div');
            container.id = 'jable-bridge-after';
            container.className = 'bridge-action-container';
            container.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 10px;
                padding: 10px;
            `;

            // 按钮 1: MissAV 直达
            const missavDirectUrl = `${CONFIG.missavBaseUrl}/${code.toLowerCase()}`;
            const btnMissAV = StyleUtils.createButton('MissAV', missavDirectUrl, 'missav', {
                tooltip: '直达 MissAV 播放页',
                icon: 'play'
            });

            // 按钮 2: JavDB（动态查询）
            const fallbackUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
            const btnJavDB = StyleUtils.createButton('JavDB', fallbackUrl, 'javdb', {
                tooltip: '正在查询 JavDB...',
                isLoading: true
            });

            container.appendChild(btnMissAV);
            container.appendChild(btnJavDB);

            // 插入到目标元素后面
            targetElement.insertAdjacentElement('afterend', container);

            // 发起请求获取真实链接
            const handleFetchResult = this._createFetchResultHandler(btnJavDB, code);
            JavDBService.fetchRealUrl(code, handleFetchResult);
            console.log(`[Bridge] Jable 页面增强完成 (元素后插入模式): ${code}`);
        },

        /**
         * 在固定位置注入按钮（找不到合适标题元素时的备选方案）
         */
        _injectFloatingButtons(code) {
            // 检查是否已经注入过
            if (document.getElementById('jable-bridge-floating')) return;

            // 创建浮动容器
            const container = document.createElement('div');
            container.id = 'jable-bridge-floating';
            container.className = 'bridge-action-container';
            container.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;

            // 按钮 1: MissAV 直达
            const missavDirectUrl = `${CONFIG.missavBaseUrl}/${code.toLowerCase()}`;
            const btnMissAV = StyleUtils.createButton('MissAV', missavDirectUrl, 'missav', {
                tooltip: '直达 MissAV 播放页',
                icon: 'play'
            });

            // 按钮 2: JavDB（动态查询）
            const fallbackUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
            const btnJavDB = StyleUtils.createButton('JavDB', fallbackUrl, 'javdb', {
                tooltip: '正在查询 JavDB...',
                isLoading: true
            });

            container.appendChild(btnMissAV);
            container.appendChild(btnJavDB);
            document.body.appendChild(container);

            // 发起请求获取真实链接
            const handleFetchResult = this._createFetchResultHandler(btnJavDB, code);
            JavDBService.fetchRealUrl(code, handleFetchResult);
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

            // 创建按钮容器
            const container = document.createElement('span');
            container.className = 'bridge-action-container';

            // 按钮 1: MissAV 直达
            const missavDirectUrl = `${CONFIG.missavBaseUrl}/${code.toLowerCase()}`;
            const btnMissAV = StyleUtils.createButton('MissAV', missavDirectUrl, 'missav', {
                tooltip: '直达 MissAV 播放页',
                icon: 'play'
            });

            // 按钮 2: JavDB（动态查询）
            const fallbackUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
            const btnJavDB = StyleUtils.createButton('JavDB', fallbackUrl, 'javdb', {
                tooltip: '正在查询 JavDB...',
                isLoading: true
            });

            container.appendChild(btnMissAV);
            container.appendChild(btnJavDB);
            titleElement.appendChild(container);

            // 发起请求获取真实链接
            const handleFetchResult = this._createFetchResultHandler(btnJavDB, code);
            JavDBService.fetchRealUrl(code, handleFetchResult);

            console.log(`[Bridge] Jable 页面增强完成: ${code}`);
        },
    };

    // ==================== 主程序 ====================
    const App = {
        init() {
            // 注入全局样式
            StyleUtils.injectStyles();

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
         * 路由派发
         */
        route() {
            const currentUrl = window.location.href;

            if (currentUrl.includes('javdb.com')) {
                PageHandler.handleJavDB();
            } else if (window.location.hostname.includes('missav')) {
                // 记录当前 MissAV 域名偏好 (减少无用 I/O)
                const currentOrigin = window.location.origin;
                if (GM_getValue('missav_origin') !== currentOrigin) {
                    GM_setValue('missav_origin', currentOrigin);
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
                    setTimeout(() => this.route(), 500); // 延迟执行等待 DOM 渲染
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
            setInterval(() => {
                if (!document.querySelector('.bridge-action-container')) {
                    this.route();
                }
            }, 2000);
        }
    };

    // ==================== 启动 ====================
    App.init();

})();
