// ==UserScript==
// @name         JavDB & MissAV Bridge (完美直达版)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  在 JavDB 和 MissAV 之间双向跳转；现代化UI、玻璃拟态风格、智能缓存
// @author       Gemini
// @match        https://javdb.com/v/*
// @match        https://missav.ws/*
// @match        https://missav.com/*
// @match        https://missav.ai/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=javdb.com
// @updateURL    https://github.com/wangxiangg1/my-youhou-js/raw/refs/heads/main/j-m.js
// @downloadURL  https://github.com/wangxiangg1/my-youhou-js/raw/refs/heads/main/j-m.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      javdb.com
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置常量 ====================
    const CONFIG = {
        // 缓存过期时间 (24小时)
        cacheExpiry: 24 * 60 * 60 * 1000,
        // 请求超时时间 (10秒)
        requestTimeout: 10000,
        // MissAV 基础 URL
        missavBaseUrl: 'https://missav.ws/cn',
        // JavDB 基础 URL
        javdbBaseUrl: 'https://javdb.com',
        // 缓存键前缀
        cachePrefix: 'javdb_hash_'
    };

    // ==================== 现代化颜色主题 ====================
    const COLORS = {
        // JavDB 橙色主题
        javdb: {
            bg: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)',
            bgSolid: '#f39c12',
            shadow: 'rgba(243, 156, 18, 0.4)',
            hover: 'linear-gradient(135deg, #e67e22 0%, #f39c12 100%)'
        },
        // MissAV 粉红主题
        missav: {
            bg: 'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)',
            bgSolid: '#f857a6',
            shadow: 'rgba(248, 87, 166, 0.4)',
            hover: 'linear-gradient(135deg, #ff5858 0%, #f857a6 100%)'
        },
        // 搜索蓝色主题
        search: {
            bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            bgSolid: '#4facfe',
            shadow: 'rgba(79, 172, 254, 0.4)',
            hover: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)'
        },
        // 加载中灰色
        loading: {
            bg: 'linear-gradient(135deg, #bdc3c7 0%, #95a5a6 100%)',
            bgSolid: '#95a5a6',
            shadow: 'rgba(149, 165, 166, 0.4)',
            hover: 'linear-gradient(135deg, #95a5a6 0%, #bdc3c7 100%)'
        },
        // 成功绿色
        success: {
            bg: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
            bgSolid: '#11998e',
            shadow: 'rgba(56, 239, 125, 0.4)',
            hover: 'linear-gradient(135deg, #38ef7d 0%, #11998e 100%)'
        },
        // 错误红色
        error: {
            bg: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
            bgSolid: '#ff416c',
            shadow: 'rgba(255, 65, 108, 0.4)',
            hover: 'linear-gradient(135deg, #ff4b2b 0%, #ff416c 100%)'
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
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap');

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
                    padding: 8px 16px;
                    margin-left: 10px;
                    color: white;
                    border-radius: 10px;
                    font-size: 13px;
                    font-weight: 600;
                    font-family: 'Inter', 'Segoe UI', -apple-system, sans-serif;
                    text-decoration: none;
                    cursor: pointer;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    animation: bridge-fadeIn 0.4s ease-out;
                    vertical-align: middle;
                    line-height: 1;
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
                    gap: 8px;
                    margin-left: 10px;
                }

                /* MissAV 页面专用样式 */
                .missav-bridge-container {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    margin-left: 12px;
                }

                /* Tooltip */
                .bridge-btn[data-tooltip] {
                    position: relative;
                }

                .bridge-btn[data-tooltip]::after {
                    content: attr(data-tooltip);
                    position: absolute;
                    bottom: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: 6px 10px;
                    background: rgba(15, 23, 42, 0.9);
                    color: white;
                    font-size: 11px;
                    font-weight: 500;
                    border-radius: 6px;
                    white-space: nowrap;
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.2s;
                    margin-bottom: 6px;
                    pointer-events: none;
                }

                .bridge-btn[data-tooltip]:hover::after {
                    opacity: 1;
                    visibility: visible;
                }
            `;
            document.head.appendChild(style);
        },

        /**
         * 创建现代化按钮
         */
        createButton(text, url, colorTheme, options = {}) {
            const { tooltip = '', isLoading = false, icon = '' } = options;

            const btn = document.createElement('a');
            btn.href = url;
            btn.target = '_blank';
            btn.className = `bridge-btn ${isLoading ? 'loading' : ''}`;

            if (tooltip) {
                btn.setAttribute('data-tooltip', tooltip);
            }

            // 设置渐变背景
            btn.style.background = colorTheme.bg;
            btn.style.boxShadow = `0 4px 15px ${colorTheme.shadow}, 0 2px 4px rgba(0,0,0,0.1)`;

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
            const { icon = '', addSuccessAnimation = false } = options;

            btn.style.background = colorTheme.bg;
            btn.style.boxShadow = `0 4px 15px ${colorTheme.shadow}, 0 2px 4px rgba(0,0,0,0.1)`;
            btn.innerHTML = `${icon ? icon + ' ' : ''}${text}`;
            btn.classList.remove('loading');

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
         */
        get(code) {
            try {
                const cached = GM_getValue(CONFIG.cachePrefix + code);
                if (cached) {
                    const { url, timestamp } = JSON.parse(cached);
                    // 检查是否过期
                    if (Date.now() - timestamp < CONFIG.cacheExpiry) {
                        return url;
                    }
                }
            } catch (e) {
                console.error('[Bridge] 缓存读取错误:', e);
            }
            return null;
        },

        /**
         * 设置缓存
         */
        set(code, url) {
            try {
                GM_setValue(CONFIG.cachePrefix + code, JSON.stringify({
                    url: url,
                    timestamp: Date.now()
                }));
            } catch (e) {
                console.error('[Bridge] 缓存写入错误:', e);
            }
        }
    };

    // ==================== 番号提取工具 ====================
    const CodeExtractor = {
        /**
         * 从 MissAV URL 提取番号
         * URL 格式: https://missav.ws/cn/xxxx-123
         */
        fromMissAVUrl() {
            const path = window.location.pathname;
            // 移除语言代码 (如 /cn/)
            const cleanPath = path.replace(/^\/(cn|en|ja|ko|tw)\//i, '/');
            const segments = cleanPath.split('/').filter(Boolean);
            const code = segments[segments.length - 1];

            // 验证是否是有效番号格式
            if (code && /^[a-zA-Z]+-?\d+/i.test(code)) {
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
        }
    };

    // ==================== JavDB 服务 ====================
    const JavDBService = {
        /**
         * 获取 JavDB 详情页真实链接
         */
        fetchRealUrl(code, callback) {
            // 先检查缓存
            const cachedUrl = CacheManager.get(code);
            if (cachedUrl) {
                console.log(`[Bridge] 使用缓存: ${code} -> ${cachedUrl}`);
                callback({ success: true, url: cachedUrl, fromCache: true });
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
                            const href = firstResult.getAttribute('href');
                            const realUrl = `${CONFIG.javdbBaseUrl}${href}`;

                            // 写入缓存
                            CacheManager.set(code, realUrl);

                            callback({ success: true, url: realUrl });
                        } else {
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
            const directUrl = `${CONFIG.missavBaseUrl}/${code.toLowerCase()}`;
            const btnDirect = StyleUtils.createButton('MissAV', directUrl, COLORS.missav, {
                tooltip: '直达 MissAV 播放页',
                icon: '▶'
            });

            // 按钮 2: MissAV 搜索
            const searchUrl = `${CONFIG.missavBaseUrl}/search/${code}`;
            const btnSearch = StyleUtils.createButton('搜索', searchUrl, COLORS.search, {
                tooltip: '在 MissAV 搜索',
                icon: '🔍'
            });

            container.appendChild(btnDirect);
            container.appendChild(btnSearch);
            targetBlock.appendChild(container);

            console.log(`[Bridge] JavDB 页面增强完成: ${code}`);
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

            // 创建加载中状态的按钮
            const fallbackUrl = `${CONFIG.javdbBaseUrl}/search?q=${code}&f=all`;
            const btnJavDB = StyleUtils.createButton('JavDB', fallbackUrl, COLORS.loading, {
                tooltip: '正在查询 JavDB...',
                isLoading: true
            });

            container.appendChild(btnJavDB);
            titleElement.appendChild(container);

            // 发起请求获取真实链接
            JavDBService.fetchRealUrl(code, (result) => {
                if (result.success) {
                    // 成功获取直达链接
                    btnJavDB.href = result.url;
                    StyleUtils.updateButton(btnJavDB, 'JavDB 直达', COLORS.javdb, {
                        icon: '▶',
                        addSuccessAnimation: !result.fromCache
                    });
                    btnJavDB.setAttribute('data-tooltip', result.fromCache ? '从缓存加载' : '已找到详情页');
                } else if (result.fallbackUrl) {
                    // 未找到但有搜索链接
                    btnJavDB.href = result.fallbackUrl;
                    StyleUtils.updateButton(btnJavDB, 'JavDB 搜索', COLORS.search, {
                        icon: '🔍'
                    });
                    btnJavDB.setAttribute('data-tooltip', '未找到直达链接，点击搜索');
                } else {
                    // 请求失败
                    StyleUtils.updateButton(btnJavDB, '重试', COLORS.error, {
                        icon: '⚠️'
                    });
                    btnJavDB.setAttribute('data-tooltip', result.error || '请求失败');
                    // 点击重试
                    btnJavDB.onclick = (e) => {
                        e.preventDefault();
                        StyleUtils.updateButton(btnJavDB, 'JavDB', COLORS.loading, { isLoading: true });
                        btnJavDB.classList.add('loading');
                        btnJavDB.innerHTML = `<span class="spinner"></span><span>重试中...</span>`;
                        JavDBService.fetchRealUrl(code, arguments.callee);
                    };
                }
            });

            console.log(`[Bridge] MissAV 页面增强完成: ${code}`);
        }
    };

    // ==================== 主程序 ====================
    const App = {
        init() {
            // 注入全局样式
            StyleUtils.injectStyles();

            // 输出版本信息
            console.log(
                '%c🔗 JavDB & MissAV Bridge v4.0 %c已加载',
                'background: linear-gradient(135deg, #f39c12, #e67e22); color: white; padding: 4px 8px; border-radius: 4px 0 0 4px; font-weight: bold;',
                'background: linear-gradient(135deg, #f857a6, #ff5858); color: white; padding: 4px 8px; border-radius: 0 4px 4px 0; font-weight: bold;'
            );

            // 页面加载完成后执行
            window.addEventListener('load', () => {
                const currentUrl = window.location.href;

                if (currentUrl.includes('javdb.com')) {
                    PageHandler.handleJavDB();
                } else if (currentUrl.includes('missav')) {
                    PageHandler.handleMissAV();
                }
            });
        }
    };

    // ==================== 启动 ====================
    App.init();

})();
