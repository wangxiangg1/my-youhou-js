// ==UserScript==
// @name         JavDB & MissAV & Jable Bridge (完美直达版)
// @namespace    http://tampermonkey.net/
// @version      6.0
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
// @connect      javdb.com
// @connect      jable.tv
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置常量 ====================
    const CONFIG = {
        // 版本号（与 @version 保持一致）
        version: '6.0',
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
        // Jable 紫色主题 - 深紫色
        jable: {
            bg: '#9b59b6',
            bgHover: '#8e44ad',
            shadow: 'rgba(155, 89, 182, 0.5)'
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

    // ==================== 样式工具 ====================
    const StyleUtils = {
        /**
         * 注入全局 CSS
         */
        injectStyles() {
            if (document.getElementById('bridge-styles')) return;

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
                }

                .bridge-btn:hover {
                    transform: translateY(-2px) scale(1.03);
                    filter: brightness(1.1);
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

                /* JavDB 页面专用样式 */
                .javdb-bridge-container {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    margin-left: 10px;
                }

                /* MissAV 页面专用样式 */
                .missav-bridge-container {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    margin-left: 10px;
                }
            `;
            document.head.appendChild(style);
        },

        /**
         * 安全设置按钮内容（避免 innerHTML XSS 风险）
         */
        _setButtonContent(btn, text, icon, isLoading) {
            btn.textContent = '';
            if (isLoading) {
                const spinner = document.createElement('span');
                spinner.className = 'spinner';
                const textSpan = document.createElement('span');
                textSpan.textContent = text;
                btn.appendChild(spinner);
                btn.appendChild(textSpan);
            } else {
                btn.textContent = (icon ? icon + ' ' : '') + text;
            }
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
                btn.title = tooltip;  // 使用原生 title 属性
            }

            // 设置纯色背景
            btn.style.backgroundColor = colorTheme.bg;
            btn.style.boxShadow = `0 4px 12px ${colorTheme.shadow}`;

            // Hover 效果
            btn.onmouseenter = () => {
                btn.style.backgroundColor = colorTheme.bgHover;
            };
            btn.onmouseleave = () => {
                btn.style.backgroundColor = colorTheme.bg;
            };

            // 保存颜色主题供后续更新使用
            btn._colorTheme = colorTheme;

            // 内容（使用安全 DOM API）
            this._setButtonContent(btn, text, icon, isLoading);

            return btn;
        },

        /**
         * 更新按钮状态
         */
        updateButton(btn, text, colorTheme, options = {}) {
            const { icon = '', addSuccessAnimation = false, isLoading = false } = options;

            btn.style.backgroundColor = colorTheme.bg;
            btn.style.boxShadow = `0 4px 12px ${colorTheme.shadow}`;

            if (isLoading) {
                this._setButtonContent(btn, text, '', true);
                btn.classList.add('loading');
            } else {
                this._setButtonContent(btn, text, icon, false);
                btn.classList.remove('loading');
            }

            // 更新 Hover 效果
            btn.onmouseenter = () => {
                btn.style.backgroundColor = colorTheme.bgHover;
            };
            btn.onmouseleave = () => {
                btn.style.backgroundColor = colorTheme.bg;
            };

            // 保存新的颜色主题
            btn._colorTheme = colorTheme;

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

            // 精确提取番号部分，排除后面的纯字母后缀（如 -chinese-subtitle, -uncensored）
            // 支持格式：SNOS-059, FC2-PPV-1234567, n1234, ABC123
            // 规则：匹配到最后一个数字为止，之后的 -纯字母 后缀被排除
            const codeMatch = rawCode.match(/^(.*\d)(?:-[a-zA-Z].*)?$/i);
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
                // 精确提取番号部分，排除后面的纯字母后缀（如 -chinese-subtitle, -uncensored）
                // 支持格式：SNOS-059, FC2-PPV-1234567, n1234, ABC123
                // 规则：匹配到最后一个数字为止，之后的 -纯字母 后缀被排除
                const codeMatch = rawCode.match(/^(.*\d)(?:-[a-zA-Z].*)?$/i);
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

                        const firstResult = doc.querySelector('.movie-list a.box');

                        if (firstResult) {
                            // 校验搜索结果的番号是否与查询番号精确匹配
                            const resultTitle = firstResult.querySelector('.video-title strong, strong');
                            const resultCode = resultTitle ? resultTitle.textContent.trim().toUpperCase() : '';

                            if (resultCode === code.toUpperCase()) {
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
                    StyleUtils.updateButton(btnJavDB, 'JavDB 直达', COLORS.javdb, {
                        icon: '▶',
                        addSuccessAnimation: !result.fromCache
                    });
                    btnJavDB.title = result.fromCache ? '从缓存加载' : '已找到详情页';
                    btnJavDB.onclick = null;
                } else if (result.fallbackUrl) {
                    btnJavDB.href = result.fallbackUrl;
                    StyleUtils.updateButton(btnJavDB, 'JavDB 搜索', COLORS.search, {
                        icon: '🔍'
                    });
                    btnJavDB.title = '未找到直达链接，点击搜索';
                    btnJavDB.onclick = null;
                } else if (retryCount >= MAX_RETRIES) {
                    // 超过最大重试次数，显示终态失败
                    const searchUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
                    btnJavDB.href = searchUrl;
                    StyleUtils.updateButton(btnJavDB, 'JavDB 搜索', COLORS.error, {
                        icon: '🔍'
                    });
                    btnJavDB.title = `重试 ${MAX_RETRIES} 次后仍失败，点击手动搜索`;
                    btnJavDB.onclick = null;
                } else {
                    retryCount++;
                    StyleUtils.updateButton(btnJavDB, `重试 (${retryCount}/${MAX_RETRIES})`, COLORS.error, {
                        icon: '⚠️'
                    });
                    btnJavDB.title = result.error || '请求失败';
                    btnJavDB.onclick = (e) => {
                        e.preventDefault();
                        StyleUtils.updateButton(btnJavDB, '重试中...', COLORS.loading, { isLoading: true });
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

            // 创建按钮容器
            const container = document.createElement('span');
            container.className = 'javdb-bridge-container';

            // 按钮 1: MissAV 直达
            const missavDirectUrl = `${CONFIG.missavBaseUrl}/${code.toLowerCase()}`;
            const btnMissAV = StyleUtils.createButton('MissAV', missavDirectUrl, COLORS.missav, {
                tooltip: '直达 MissAV 播放页',
                icon: '▶'
            });

            // 按钮 2: Jable 直达
            const jableDirectUrl = `${CONFIG.jableBaseUrl}/videos/${code.toLowerCase()}/`;
            const btnJable = StyleUtils.createButton('Jable', jableDirectUrl, COLORS.jable, {
                tooltip: '直达 Jable 播放页',
                icon: '▶'
            });

            // 按钮 3: MissAV 搜索
            const searchUrl = `${CONFIG.missavBaseUrl}/search/${code}`;
            const btnSearch = StyleUtils.createButton('搜索', searchUrl, COLORS.search, {
                tooltip: '在 MissAV 搜索',
                icon: '🔍'
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

            // 创建按钮容器
            const container = document.createElement('span');
            container.className = 'missav-bridge-container';

            // 按钮 1: Jable 直达
            const jableDirectUrl = `${CONFIG.jableBaseUrl}/videos/${code.toLowerCase()}/`;
            const btnJable = StyleUtils.createButton('Jable', jableDirectUrl, COLORS.jable, {
                tooltip: '直达 Jable 播放页',
                icon: '▶'
            });

            // 按钮 2: JavDB（动态查询）
            const fallbackUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
            const btnJavDB = StyleUtils.createButton('JavDB', fallbackUrl, COLORS.loading, {
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

            // 方法1: 通过番号搜索包含它的标题元素
            const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5');
            let titleElement = null;

            for (const heading of allHeadings) {
                // 检查元素的文本内容是否包含番号（大小写不敏感）
                if (heading.textContent && heading.textContent.toUpperCase().includes(code)) {
                    titleElement = heading;
                    console.log(`[Bridge] Jable: 通过番号找到标题元素 (${heading.tagName})`);
                    break;
                }
            }

            // 方法2: 如果没找到，尝试常见的标题选择器
            if (!titleElement) {
                const selectors = [
                    '.video-info h1',
                    '.video-detail h1',
                    '.video-title',
                    'h1'
                ];

                for (const selector of selectors) {
                    const el = document.querySelector(selector);
                    if (el && el.textContent.trim()) {
                        titleElement = el;
                        console.log(`[Bridge] Jable: 通过选择器找到标题元素 (${selector})`);
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
            container.className = 'missav-bridge-container';
            container.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 10px;
                padding: 10px;
            `;

            // 按钮 1: MissAV 直达
            const missavDirectUrl = `${CONFIG.missavBaseUrl}/${code.toLowerCase()}`;
            const btnMissAV = StyleUtils.createButton('MissAV', missavDirectUrl, COLORS.missav, {
                tooltip: '直达 MissAV 播放页',
                icon: '▶'
            });

            // 按钮 2: JavDB（动态查询）
            const fallbackUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
            const btnJavDB = StyleUtils.createButton('JavDB', fallbackUrl, COLORS.loading, {
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
            const btnMissAV = StyleUtils.createButton('MissAV', missavDirectUrl, COLORS.missav, {
                tooltip: '直达 MissAV 播放页',
                icon: '▶'
            });

            // 按钮 2: JavDB（动态查询）
            const fallbackUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
            const btnJavDB = StyleUtils.createButton('JavDB', fallbackUrl, COLORS.loading, {
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
            if (titleElement.querySelector('.missav-bridge-container')) {
                console.log('[Bridge] Jable: 按钮已存在，跳过');
                return;
            }

            // 创建按钮容器
            const container = document.createElement('span');
            container.className = 'missav-bridge-container';

            // 按钮 1: MissAV 直达
            const missavDirectUrl = `${CONFIG.missavBaseUrl}/${code.toLowerCase()}`;
            const btnMissAV = StyleUtils.createButton('MissAV', missavDirectUrl, COLORS.missav, {
                tooltip: '直达 MissAV 播放页',
                icon: '▶'
            });

            // 按钮 2: JavDB（动态查询）
            const fallbackUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
            const btnJavDB = StyleUtils.createButton('JavDB', fallbackUrl, COLORS.loading, {
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

            // 输出版本信息
            console.log(
                `%c🔗 JavDB & MissAV & Jable Bridge v${CONFIG.version} %c已加载`,
                'background: linear-gradient(135deg, #f39c12, #e67e22); color: white; padding: 4px 8px; border-radius: 4px 0 0 4px; font-weight: bold;',
                'background: linear-gradient(135deg, #9b59b6, #8e44ad); color: white; padding: 4px 8px; border-radius: 0 4px 4px 0; font-weight: bold;'
            );

            // 直接执行（Tampermonkey 注入时 DOM 已就绪，无需等待 load 事件）
            const currentUrl = window.location.href;

            if (currentUrl.includes('javdb.com')) {
                PageHandler.handleJavDB();
            } else if (window.location.hostname.includes('missav')) {
                // 记录当前 MissAV 域名偏好
                GM_setValue('missav_origin', window.location.origin);
                PageHandler.handleMissAV();
            } else if (currentUrl.includes('jable.tv')) {
                PageHandler.handleJable();
            }
        }
    };

    // ==================== 启动 ====================
    App.init();

})();