// ==UserScript==
// @name         JavDB & MissAV Bridge (完美直达版)
// @namespace    http://tampermonkey.net/
// @version      4.8
// @description  在 JavDB 和 MissAV 之间双向跳转；现代化UI、玻璃拟态风格、智能缓存
// @author       Gemini
// @match        https://javdb.com/v/*
// @match        https://missav.ws/*
// @match        https://missav.com/*
// @match        https://missav.ai/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=javdb.com
// @updateURL    https://github.com/wangxiangg1/my-youhou-js/raw/refs/heads/main/j-m.js
// @downloadURL  https://github.com/wangxiangg1/my-youhou-js/raw/refs/heads/main/j-m.js
// @grant        GM_xmlhttpRequest      // 跨域请求 JavDB
// @grant        GM_setValue             // 缓存写入、域名偏好记录
// @grant        GM_getValue             // 缓存读取
// @grant        GM_deleteValue          // 缓存惰性删除
// @grant        GM_listValues           // 缓存全量清理枚举
// @connect      javdb.com
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置常量 ====================
    const CONFIG = {
        // 脚本版本号（元数据 @version 同步修改）
        version: '4.8',
        // 是否开启调试日志
        debug: false,
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
        // 缓存键前缀
        cachePrefix: 'javdb_hash_'
    };

    // ==================== 统一日志工具 ====================
    const log = (...args) => CONFIG.debug && console.log('[Bridge]', ...args);
    const logError = (...args) => console.error('[Bridge]', ...args);

    // ==================== 现代化颜色主题 ====================
    const COLORS = {
        // JavDB 橙色主题 - 深橙色
        javdb: {
            bg: '#e67e22',
            bgHover: '#d35400',
            shadow: 'rgba(230, 126, 34, 0.5)'
        },
        // MissAV 红色主题 - 深红色
        missav: {
            bg: '#e74c3c',
            bgHover: '#c0392b',
            shadow: 'rgba(231, 76, 60, 0.5)'
        },
        // 搜索蓝色主题 - 深蓝色
        search: {
            bg: '#3498db',
            bgHover: '#2980b9',
            shadow: 'rgba(52, 152, 219, 0.5)'
        },
        // 加载中灰色 - 深灰色
        loading: {
            bg: '#7f8c8d',
            bgHover: '#95a5a6',
            shadow: 'rgba(127, 140, 141, 0.5)'
        },
        // 成功绿色 - 深绿色
        success: {
            bg: '#27ae60',
            bgHover: '#2ecc71',
            shadow: 'rgba(39, 174, 96, 0.5)'
        },
        // 错误红色 - 深红色
        error: {
            bg: '#c0392b',
            bgHover: '#e74c3c',
            shadow: 'rgba(192, 57, 43, 0.5)'
        }
    };

    // ==================== 统一 SVG 图标（img + data URI，免疫网站 CSS 干扰） ====================
    const _svgToImg = (svg) => `<img src="data:image/svg+xml,${encodeURIComponent(svg)}" width="14" height="14" />`;
    const ICONS = {
        play: _svgToImg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>'),
        search: _svgToImg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'),
        warning: _svgToImg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>'),
        error: _svgToImg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>'),
    };

    // ==================== 样式工具 ====================
    const StyleUtils = {
        /**
         * 注入全局 CSS
         */
        injectStyles() {
            if (document.getElementById('bridge-styles')) return;

            // 异步加载 HarmonyOS Sans 字体（非阻塞）
            if (!document.getElementById('bridge-font')) {
                const fontLink = document.createElement('link');
                fontLink.id = 'bridge-font';
                fontLink.rel = 'stylesheet';
                fontLink.href = 'https://fonts.cdnfonts.com/css/harmonyos-sans';
                document.head.appendChild(fontLink);
            }

            const style = document.createElement('style');
            style.id = 'bridge-styles';
            style.textContent = `
                
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

                @keyframes bridge-shimmer {
                    0% { background-position: -200% center; }
                    100% { background-position: 200% center; }
                }

                .bridge-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 6px 14px;
                    margin-left: 8px;
                    color: #ffffff;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 700;
                    font-family: 'HarmonyOS Sans', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    text-decoration: none;
                    cursor: pointer;
                    border: none;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    transition: all 0.2s ease;
                    animation: bridge-fadeIn 0.3s ease-out;
                    vertical-align: middle;
                    line-height: 1.2;
                    letter-spacing: 0.3px;
                    background-color: var(--btn-bg);
                    box-shadow: 0 4px 12px var(--btn-shadow);
                }

                .bridge-btn img {
                    width: 14px;
                    height: 14px;
                    flex-shrink: 0;
                    vertical-align: middle;
                    display: inline-block;
                }

                .bridge-btn:hover {
                    transform: translateY(-2px) scale(1.03);
                    filter: brightness(1.1);
                    background-color: var(--btn-bg-hover);
                }

                .bridge-btn:active {
                    transform: translateY(0) scale(0.98);
                }

                .bridge-btn.loading {
                    pointer-events: none;
                }

                .bridge-btn .spinner {
                    display: inline-block;
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: bridge-spin 0.8s linear infinite;
                }

                .bridge-btn.success {
                    animation: bridge-pulse 0.5s ease-out;
                }

                /* 统一按钮容器样式 */
                .bridge-container {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    margin-left: 10px;
                }
            `;
            document.head.appendChild(style);
        },

        /**
         * 创建按钮
         */
        createButton(text, url, colorTheme, options = {}) {
            const { tooltip = '', isLoading = false, icon = '' } = options;

            const btn = document.createElement('a');
            btn.href = url;
            btn.target = '_blank';
            btn.className = `bridge-btn ${isLoading ? 'loading' : ''}`;

            if (tooltip) {
                btn.title = tooltip;
            }

            // 通过 CSS 变量设置颜色主题
            btn.style.setProperty('--btn-bg', colorTheme.bg);
            btn.style.setProperty('--btn-bg-hover', colorTheme.bgHover);
            btn.style.setProperty('--btn-shadow', colorTheme.shadow);

            // 内容
            if (isLoading) {
                btn.innerHTML = `<span class="spinner"></span><span>${text}</span>`;
            } else {
                btn.innerHTML = `${icon ? icon + ' ' : ''}${text}`;
            }

            return btn;
        },

        /**
         * 更新按钮状态
         */
        updateButton(btn, text, colorTheme, options = {}) {
            const { icon = '', addSuccessAnimation = false, isLoading = false } = options;

            // 通过 CSS 变量更新颜色主题
            btn.style.setProperty('--btn-bg', colorTheme.bg);
            btn.style.setProperty('--btn-bg-hover', colorTheme.bgHover);
            btn.style.setProperty('--btn-shadow', colorTheme.shadow);

            // 统一处理 loading / 正常内容
            if (isLoading) {
                btn.innerHTML = `<span class="spinner"></span><span>${text}</span>`;
                btn.classList.add('loading');
            } else {
                btn.innerHTML = `${icon ? icon + ' ' : ''}${text}`;
                btn.classList.remove('loading');
            }

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
                if (cached && cached.timestamp) {
                    // 根据缓存类型选择过期时间
                    const expiry = cached.isNegative ? CONFIG.negativeCacheExpiry : CONFIG.cacheExpiry;
                    // 检查是否过期
                    if (Date.now() - cached.timestamp < expiry) {
                        return { url: cached.url, isNegative: !!cached.isNegative };
                    } else {
                        // 惰性删除：过期时物理删除该条目
                        GM_deleteValue(cacheKey);
                        log(`缓存已过期并删除: ${code}`);
                    }
                }
            } catch (e) {
                logError('缓存读取错误:', e);
            }
            return null;
        },

        /**
         * 设置正常缓存（找到了结果）
         */
        set(code, url) {
            try {
                GM_setValue(CONFIG.cachePrefix + code, {
                    url,
                    timestamp: Date.now(),
                    isNegative: false
                });
            } catch (e) {
                logError('缓存写入错误:', e);
            }
        },

        /**
         * 设置负缓存（搜索无结果，非网络错误）
         */
        setNotFound(code) {
            try {
                GM_setValue(CONFIG.cachePrefix + code, {
                    url: CONFIG.NOT_FOUND_MARKER,
                    timestamp: Date.now(),
                    isNegative: true
                });
                log(`负缓存已存储: ${code} (24小时内不再请求)`);
            } catch (e) {
                logError('负缓存写入错误:', e);
            }
        },

        /**
         * 全量清理过期缓存（每 24 小时最多执行一次）
         * 遍历所有 cachePrefix 开头的键，删除过期条目
         */
        cleanExpired() {
            const CLEAN_INTERVAL = 24 * 60 * 60 * 1000; // 24小时
            const lastClean = GM_getValue('_cache_last_clean', 0);
            if (Date.now() - lastClean < CLEAN_INTERVAL) return;

            try {
                const allKeys = GM_listValues().filter(k => k.startsWith(CONFIG.cachePrefix));
                let cleaned = 0;
                for (const key of allKeys) {
                    const data = GM_getValue(key);
                    if (data && data.timestamp) {
                        const expiry = data.isNegative ? CONFIG.negativeCacheExpiry : CONFIG.cacheExpiry;
                        if (Date.now() - data.timestamp >= expiry) {
                            GM_deleteValue(key);
                            cleaned++;
                        }
                    }
                }
                GM_setValue('_cache_last_clean', Date.now());
                log(`缓存清理完成，清除 ${cleaned} 条过期记录（共扫描 ${allKeys.length} 条）`);
            } catch (e) {
                logError('缓存清理错误:', e);
            }
        }
    };

    // ==================== 番号提取工具 ====================
    const CodeExtractor = {
        /**
         * 从 MissAV URL 提取番号
         * URL 格式: https://missav.ws/cn/xxxx-123
         */
        // 已知的非视频路径关键词
        NON_VIDEO_PATHS: ['actresses', 'genres', 'search', 'makers', 'labels', 'tags', 'rankings', 'playlists'],

        fromMissAVUrl() {
            const path = window.location.pathname;
            // 移除语言代码 (如 /cn/)
            const cleanPath = path.replace(/^\/(cn|en|ja|ko|tw)\//i, '/');

            // 排除已知的非视频路径
            if (this.NON_VIDEO_PATHS.some(p => cleanPath.startsWith(`/${p}`))) {
                return null;
            }

            const segments = cleanPath.split('/').filter(Boolean);
            const code = segments[segments.length - 1];

            // 验证是否是有效番号格式（至少2个字母 + 可选分隔符 + 至少2位数字）
            if (code && /^[a-zA-Z]{2,10}-?\d{2,}/i.test(code)) {
                return code.toUpperCase();
            }
            return null;
        },

        /**
         * 从 JavDB 页面提取番号
         */
        fromJavDBPage() {
            const panelBlocks = document.querySelectorAll('.panel-block');

            for (const block of panelBlocks) {
                // 先查 strong 元素再判断文本，减少无效遍历
                const strong = block.querySelector('strong');
                if (strong && (strong.textContent.includes('番號') || strong.textContent.includes('ID'))) {
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
        }
    };

    // ==================== DOM 工具 ====================
    /**
     * 等待指定选择器的元素出现
     * @param {string} selector - CSS 选择器
     * @param {number} timeout - 超时毫秒（默认 10000ms）
     * @returns {Promise<Element>} 找到的元素
     */
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    clearTimeout(timer);
                    resolve(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error(`waitForElement('${selector}') 超时 (${timeout}ms)`));
            }, timeout);
        });
    }

    // ==================== JavDB 服务 ====================
    const JavDBService = {
        /**
         * 获取 JavDB 详情页真实链接（Promise 版）
         * @param {string} code - 番号
         * @returns {Promise<{success: boolean, url?: string, fallbackUrl?: string, fromCache?: boolean, error?: string}>}
         */
        fetchRealUrl(code) {
            // 先检查缓存
            const cached = CacheManager.get(code);
            if (cached) {
                if (cached.isNegative) {
                    log(`负缓存命中: ${code} (JavDB无此资源)`);
                    const searchUrl = `${CONFIG.javdbBaseUrl}/search?q=${encodeURIComponent(code)}&f=all`;
                    return Promise.resolve({ success: false, fallbackUrl: searchUrl, fromCache: true });
                }
                log(`缓存命中: ${code} -> ${cached.url}`);
                return Promise.resolve({ success: true, url: cached.url, fromCache: true });
            }

            // 发起请求
            const searchUrl = `${CONFIG.javdbBaseUrl}/search?q=${encodeURIComponent(code)}&f=all`;

            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: searchUrl,
                    timeout: CONFIG.requestTimeout,
                    onload(response) {
                        if (response.status === 200) {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(response.responseText, 'text/html');
                            const firstResult = doc.querySelector('.movie-list a.box');

                            if (firstResult) {
                                const href = firstResult.getAttribute('href');
                                const realUrl = `${CONFIG.javdbBaseUrl}${href}`;
                                CacheManager.set(code, realUrl);
                                resolve({ success: true, url: realUrl });
                            } else {
                                CacheManager.setNotFound(code);
                                resolve({ success: false, fallbackUrl: searchUrl });
                            }
                        } else {
                            resolve({ success: false, error: `HTTP ${response.status}` });
                        }
                    },
                    onerror(err) {
                        logError('请求失败:', err);
                        resolve({ success: false, error: '网络错误' });
                    },
                    ontimeout() {
                        logError('请求超时');
                        resolve({ success: false, error: '请求超时' });
                    }
                });
            });
        },

        /**
         * 带自动退避重试的请求
         * 仅对网络错误/超时自动重试，"搜索无结果"不重试
         * @param {string} code - 番号
         * @param {number} maxRetries - 自动重试次数（默认 1 次）
         * @param {number} delay - 重试间隔毫秒（默认 2000ms）
         */
        async fetchWithRetry(code, maxRetries = 1, delay = 2000) {
            for (let i = 0; i <= maxRetries; i++) {
                const result = await this.fetchRealUrl(code);
                // 成功 或 有确定结果（搜索无结果写了负缓存）→ 不再重试
                if (result.success || result.fallbackUrl || result.fromCache) {
                    return result;
                }
                // 网络错误 / 超时 → 自动退避重试
                if (i < maxRetries) {
                    log(`请求失败，${delay}ms 后自动重试 (${i + 1}/${maxRetries})`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
            return { success: false, error: '自动重试失败' };
        }
    };

    // ==================== 页面处理器 ====================
    const PageHandler = {
        /**
         * 处理 JavDB 页面
         */
        handleJavDB() {
            // 防重复注入
            if (document.querySelector('.bridge-container')) return;

            const result = CodeExtractor.fromJavDBPage();
            if (!result) return;

            const { code, targetBlock } = result;

            // 创建按钮容器
            const container = document.createElement('span');
            container.className = 'bridge-container';

            // 按钮 1: MissAV 直达
            const directUrl = `${CONFIG.missavBaseUrl}/${encodeURIComponent(code.toLowerCase())}`;
            const btnDirect = StyleUtils.createButton('MissAV', directUrl, COLORS.missav, {
                tooltip: '直达 MissAV 播放页',
                icon: ICONS.play
            });

            // 按钮 2: MissAV 搜索
            const searchUrl = `${CONFIG.missavBaseUrl}/search/${encodeURIComponent(code)}`;
            const btnSearch = StyleUtils.createButton('搜索', searchUrl, COLORS.search, {
                tooltip: '在 MissAV 搜索',
                icon: ICONS.search
            });

            container.appendChild(btnDirect);
            container.appendChild(btnSearch);
            targetBlock.appendChild(container);

            // P0: 反向预热 - 将当前页面信息写入缓存
            // 这样下次在 MissAV 遇到相同番号时，无需发起网络请求
            CacheManager.set(code, window.location.href);
            log(`JavDB 页面增强完成: ${code} (已预热缓存)`);
        },

        /**
         * 处理 MissAV 页面
         */
        async handleMissAV() {
            // 防重复注入
            if (document.querySelector('.bridge-container')) return;

            const code = CodeExtractor.fromMissAVUrl();
            if (!code) return;

            // 等待 h1 元素出现（兼容 SPA 异步渲染）
            let titleElement;
            try {
                titleElement = await waitForElement('h1');
            } catch (e) {
                logError(e.message);
                return;
            }

            // 创建按钮容器
            const container = document.createElement('span');
            container.className = 'bridge-container';

            // 创建加载中状态的按钮
            const fallbackUrl = `${CONFIG.javdbBaseUrl}/search?q=${encodeURIComponent(code)}&f=all`;
            const btnJavDB = StyleUtils.createButton('JavDB', fallbackUrl, COLORS.loading, {
                tooltip: '正在查询 JavDB...',
                isLoading: true
            });

            container.appendChild(btnJavDB);
            titleElement.appendChild(container);

            // 手动重试计数器与上限
            const MAX_MANUAL_RETRIES = 3;
            let manualRetryCount = 0;

            /**
             * 根据请求结果更新按钮状态
             */
            const applyResult = (result) => {
                if (result.success) {
                    // 成功获取直达链接
                    btnJavDB.href = result.url;
                    StyleUtils.updateButton(btnJavDB, 'JavDB 直达', COLORS.javdb, {
                        icon: ICONS.play,
                        addSuccessAnimation: !result.fromCache
                    });
                    btnJavDB.title = result.fromCache ? '从缓存加载' : '已找到详情页';
                    btnJavDB.onclick = null;
                } else if (result.fallbackUrl) {
                    // 未找到但有搜索链接
                    btnJavDB.href = result.fallbackUrl;
                    StyleUtils.updateButton(btnJavDB, 'JavDB 搜索', COLORS.search, {
                        icon: ICONS.search
                    });
                    btnJavDB.title = '未找到直达链接，点击搜索';
                    btnJavDB.onclick = null;
                } else {
                    // 请求失败（自动重试也已用尽）
                    manualRetryCount++;
                    if (manualRetryCount >= MAX_MANUAL_RETRIES) {
                        // 超过手动重试上限 → 禁用按钮
                        StyleUtils.updateButton(btnJavDB, '失败', COLORS.error, { icon: ICONS.error });
                        btnJavDB.title = '多次重试失败，请稍后刷新页面';
                        btnJavDB.onclick = (e) => e.preventDefault();
                        btnJavDB.style.pointerEvents = 'none';
                        btnJavDB.style.opacity = '0.6';
                    } else {
                        StyleUtils.updateButton(btnJavDB, `重试 (${manualRetryCount}/${MAX_MANUAL_RETRIES})`, COLORS.error, {
                            icon: ICONS.warning
                        });
                        btnJavDB.title = result.error || '请求失败，点击重试';
                        // 点击手动重试
                        btnJavDB.onclick = async (e) => {
                            e.preventDefault();
                            StyleUtils.updateButton(btnJavDB, '重试中...', COLORS.loading, { isLoading: true });
                            const retryResult = await JavDBService.fetchWithRetry(code);
                            applyResult(retryResult);
                        };
                    }
                }
            };

            // 发起请求（自带 1 次自动退避重试）
            const result = await JavDBService.fetchWithRetry(code);
            applyResult(result);

            log(`MissAV 页面增强完成: ${code}`);
        }
    };

    // ==================== 主程序 ====================
    const App = {
        init() {
            // 注入全局样式
            StyleUtils.injectStyles();

            // 启动时清理过期缓存（低频，每 24 小时最多一次）
            CacheManager.cleanExpired();

            // 输出版本信息
            console.log(
                `%c🔗 JavDB & MissAV Bridge v${CONFIG.version} %c已加载`,
                'background: linear-gradient(135deg, #f39c12, #e67e22); color: white; padding: 4px 8px; border-radius: 4px 0 0 4px; font-weight: bold;',
                'background: linear-gradient(135deg, #f857a6, #ff5858); color: white; padding: 4px 8px; border-radius: 0 4px 4px 0; font-weight: bold;'
            );

            // 根据当前站点执行对应处理
            const currentUrl = window.location.href;

            if (currentUrl.includes('javdb.com')) {
                PageHandler.handleJavDB();
            } else if (currentUrl.includes('missav')) {
                // 记录当前 MissAV 域名偏好
                GM_setValue('missav_origin', window.location.origin);
                PageHandler.handleMissAV();

                // SPA 路由变化监听：URL 改变时重新执行
                let lastUrl = location.href;
                const routeObserver = new MutationObserver(() => {
                    if (location.href !== lastUrl) {
                        lastUrl = location.href;
                        log(`SPA 路由变化: ${lastUrl}`);
                        PageHandler.handleMissAV();
                    }
                });
                routeObserver.observe(document.body, { childList: true, subtree: true });
            }
        }
    };

    // ==================== 启动 ====================
    App.init();

})();