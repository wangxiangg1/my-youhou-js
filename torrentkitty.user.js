// ==UserScript==
// @name         TorrentKitty to MissAV & JavDB with Cover + Settings
// @namespace    http://tampermonkey.net/
// @version      3.7
// @description  TorrentKitty 增强：增加悬浮框排除关键字过滤，无结果不卡死、排队优化
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
    /**
     * 将 GM_xmlhttpRequest 封装为类 fetch 的 Promise 接口
     * 使用 GM API 绕过浏览器同源策略 (CORS) 限制
     */
    function gmFetch(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                timeout: 15000, // 强制15秒超时，防止队列假死
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
    const VERSION = (typeof GM_info !== 'undefined' && GM_info?.script?.version) || '3.7';

    // ==================== 配置常量 ====================
    const CONFIG = {
        // 默认封面尺寸
        defaults: {
            coverWidth: 400,
            coverHeight: 300
        },
        // 请求队列配置 - 防止IP被封禁的保守设置
        // 计算依据: 每分钟24请求 → 平均2.5秒/请求
        // 延迟范围: 1500 + (500~1500) = 2000~3000ms，略保守确保不超限
        queue: {
            baseDelay: 1500,          // 基础请求间隔(ms)
            minRandomDelay: 500,      // 最小随机延迟(ms)
            maxRandomDelay: 1500,     // 最大随机延迟(ms) - 实际延迟为 baseDelay + minRandom~maxRandom
            maxConcurrent: 1,         // 最大并发数
            maxRequestsPerMinute: 24, // 每分钟最大请求数
            errorBackoff: 5000,       // 错误退避时间(ms)
            maxBackoff: 60000         // 最大退避时间(ms)
        },
        // 缓存配置
        cache: {
            maxSize: 80               // 最大缓存条数
        },
        // 正则表达式 - 支持多种番号格式
        // 格式1: ABC-123 (带连字符，字母2-6位)
        // 格式2: ABC123 (不带连字符，字母2-6位)
        // 格式3: n1234 (东热番号，单字母n + 4位数字)
        // 使用词边界\b防止误匹配，排除常见非番号前缀 (GB/MB/KB/MP/AES/UTF/ISO/SHA/MD5)
        codeRegex: /\b(?!GB|MB|KB|MP|AES|UTF|ISO|SHA|MD5|CPU|GPU|USB|SSD|HDD|RAM|ROM|PDF|CSS|DNS|FTP|HTTP)([A-Z]{2,6}-?\d{3,5})\b|\b(n\d{4})\b/i,
        // 错误缓存过期时间 (5分钟) - 网络错误等短期缓存，避免永久阻止重试
        errorCacheExpiry: 5 * 60 * 1000,
        // 自动拉取最大页数限制，防止死循环
        maxPagesToFetch: 10,
        // 存储键名
        storageKey: 'torrentkitty_settings'
    };

    // ==================== 现代化颜色主题 (Neon Glassmorphism) ====================
    const COLORS = {
        // 主题色 - 深空紫与赛博青渐变
        primary: {
            bg: 'linear-gradient(135deg, #6b21a8 0%, #06b6d4 100%)',
            bgSolid: '#06b6d4',
            border: 'rgba(6, 182, 212, 0.4)',
            hover: 'linear-gradient(135deg, #06b6d4 0%, #6b21a8 100%)',
            shadow: 'rgba(6, 182, 212, 0.5)'
        },
        // 成功 - 荧光绿
        success: {
            bg: 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
            bgSolid: '#10b981',
            border: 'rgba(16, 185, 129, 0.4)',
            hover: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
            shadow: 'rgba(16, 185, 129, 0.5)'
        },
        // 警告 - 赛博黄
        warning: {
            bg: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
            bgSolid: '#f59e0b',
            border: 'rgba(245, 158, 11, 0.4)',
            hover: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
            shadow: 'rgba(245, 158, 11, 0.5)'
        },
        // 危险 - 霓虹红
        danger: {
            bg: 'linear-gradient(135deg, #9f1239 0%, #f43f5e 100%)',
            bgSolid: '#f43f5e',
            border: 'rgba(244, 63, 94, 0.4)',
            hover: 'linear-gradient(135deg, #f43f5e 0%, #9f1239 100%)',
            shadow: 'rgba(244, 63, 94, 0.5)'
        },
        // 信息 - 电光蓝
        info: {
            bg: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
            bgSolid: '#3b82f6',
            border: 'rgba(59, 130, 246, 0.4)',
            hover: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            shadow: 'rgba(59, 130, 246, 0.5)'
        },
        // 粉色 - 赛博粉
        pink: {
            bg: 'linear-gradient(135deg, #be185d 0%, #ec4899 100%)',
            bgSolid: '#ec4899',
            border: 'rgba(236, 72, 153, 0.4)',
            hover: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
            shadow: 'rgba(236, 72, 153, 0.5)'
        },
        // 中性 - 深空灰玻璃
        neutral: {
            bg: 'linear-gradient(135deg, rgba(51, 65, 85, 0.8) 0%, rgba(30, 41, 59, 0.8) 100%)',
            bgSolid: '#475569',
            border: 'rgba(148, 163, 184, 0.3)',
            hover: 'linear-gradient(135deg, rgba(71, 85, 105, 0.9) 0%, rgba(51, 65, 85, 0.9) 100%)',
            shadow: 'rgba(15, 23, 42, 0.6)'
        },

        // 错误/提示框 - 极致磨砂玻璃
        error: {
            bg: 'rgba(244, 63, 94, 0.15)',
            border: 'rgba(244, 63, 94, 0.5)',
            text: '#fda4af',
            backdrop: 'blur(16px) saturate(180%)'
        },
        noResult: {
            bg: 'rgba(245, 158, 11, 0.15)',
            border: 'rgba(245, 158, 11, 0.5)',
            text: '#fcd34d',
            backdrop: 'blur(16px) saturate(180%)'
        },

        // 设置按钮 - 赛博幻彩
        settingsGradient: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 33%, #8b5cf6 66%, #ec4899 100%)',

        // 玻璃效果 - 毛玻璃预设
        glass: {
            bg: 'rgba(15, 23, 42, 0.65)',
            border: 'rgba(255, 255, 255, 0.1)',
            blur: 'backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%);'
        },

        // 深色模式基础 - 极深渊黑
        dark: {
            bg: 'rgba(2, 6, 23, 0.85)',
            card: 'rgba(15, 23, 42, 0.75)',
            border: 'rgba(51, 65, 85, 0.5)',
            text: '#f8fafc',
            textMuted: '#94a3b8'
        }
    };

    // ==================== 样式工具函数 ====================
    const StyleUtils = {
        /**
         * 生成现代化按钮样式 - 渐变背景、圆角、高级阴影
         */
        buttonBase(color, options = {}) {
            const {
                padding = '6px 14px',
                fontSize = '12px',
                margin = '0 4px',
                display = 'inline-flex'
            } = options;

            return `
                display: ${display};
                align-items: center;
                justify-content: center;
                padding: ${padding};
                background: ${color.bg};
                color: #fff;
                border-radius: 8px;
                text-decoration: none;
                font-size: ${fontSize};
                font-weight: 600;
                font-family: 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                border: 1px solid ${color.border};
                cursor: pointer;
                margin: ${margin};
                box-shadow: 0 4px 15px ${color.shadow || 'rgba(0,0,0,0.2)'}, 
                            0 1px 3px rgba(0,0,0,0.1),
                            inset 0 1px 0 rgba(255,255,255,0.2);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                letter-spacing: 0.3px;
                position: relative;
                overflow: hidden;
            `;
        },

        /**
         * 生成玻璃拟态遮罩层样式
         */
        overlay() {
            return `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.95) 100%);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 99999;
                display: flex;
                justify-content: center;
                align-items: center;
                animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            `;
        },

        /**
         * 生成玻璃拟态模态框样式
         */
        modal(options = {}) {
            const {
                maxWidth = '700px',
                padding = '32px',
                maxHeight = '85vh'
            } = options;

            return `
                background: linear-gradient(145deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.98) 100%);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                padding: ${padding};
                border-radius: 20px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4),
                            0 0 0 1px rgba(255, 255, 255, 0.1),
                            inset 0 1px 1px rgba(255, 255, 255, 0.8);
                max-width: ${maxWidth};
                width: 90%;
                max-height: ${maxHeight};
                overflow: auto;
                animation: slideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                border: 1px solid rgba(255, 255, 255, 0.3);
            `;
        },

        /**
         * 生成现代化提示框样式 - 玻璃拟态 + 柔和配色
         */
        infoBox(color, maxWidth) {
            return `
                padding: 14px 18px;
                background: ${color.bg};
                backdrop-filter: ${color.backdrop || 'blur(10px)'};
                -webkit-backdrop-filter: ${color.backdrop || 'blur(10px)'};
                border: 1px solid ${color.border};
                border-radius: 12px;
                color: ${color.text};
                font-size: 13px;
                font-weight: 500;
                font-family: 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                cursor: pointer;
                margin-top: 8px;
                max-width: ${maxWidth}px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
                            0 2px 4px -1px rgba(0, 0, 0, 0.06);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            `;
        },

        /**
         * 生成封面图片样式 - 高级阴影 + 悬浮效果
         */
        coverImage(width, height) {
            return `
                max-width: ${width}px;
                max-height: ${height}px;
                border-radius: 12px;
                margin-top: 8px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3),
                            0 4px 12px rgba(0,0,0,0.15),
                            0 0 0 1px rgba(255,255,255,0.1);
                cursor: pointer;
                transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                object-fit: cover;
            `;
        },

        /**
         * 注入全局CSS动画 (Neon Cyberpunk & Glassmorphism)
         */
        injectGlobalStyles() {
            if (document.getElementById('tk-enhanced-styles')) return;

            const style = document.createElement('style');
            style.id = 'tk-enhanced-styles';

            // 字体异步加载 - 添加一个更具科幻感的字体 (JetBrains Mono) 用于数字和代码
            const fontLink = document.createElement('link');
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.loli.net/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap';
            document.head.appendChild(fontLink);

            style.textContent = `
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; filter: blur(10px); }
                    to { opacity: 1; filter: blur(0); }
                }
                
                @keyframes slideIn {
                    from { 
                        opacity: 0; 
                        transform: translateY(20px) scale(0.95); 
                        filter: blur(10px);
                    }
                    to { 
                        opacity: 1; 
                        transform: translateY(0) scale(1); 
                        filter: blur(0);
                    }
                }
                
                @keyframes neonPulse {
                    0%, 100% { box-shadow: 0 0 10px rgba(6, 182, 212, 0.5), 0 0 20px rgba(6, 182, 212, 0.3); }
                    50% { box-shadow: 0 0 20px rgba(6, 182, 212, 0.8), 0 0 40px rgba(6, 182, 212, 0.5); }
                }
                
                @keyframes cyberGlow {
                    0%, 100% { box-shadow: 0 0 15px rgba(236, 72, 153, 0.5), inset 0 0 10px rgba(236, 72, 153, 0.2); }
                    50% { box-shadow: 0 0 30px rgba(236, 72, 153, 0.8), inset 0 0 20px rgba(236, 72, 153, 0.4); }
                }
                
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-8px); }
                }
                
                .tk-btn-hover {
                    position: relative;
                    z-index: 1;
                }
                
                .tk-btn-hover::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    border-radius: inherit;
                    background: inherit;
                    filter: blur(8px);
                    opacity: 0;
                    z-index: -1;
                    transition: opacity 0.3s ease;
                }
                
                .tk-btn-hover:hover {
                    transform: translateY(-2px) scale(1.05);
                    filter: brightness(1.2) contrast(1.1);
                    box-shadow: 0 0 15px rgba(255,255,255,0.2) !important;
                }
                
                .tk-btn-hover:hover::before {
                    opacity: 0.6;
                }
                
                .tk-btn-hover:active {
                    transform: translateY(1px) scale(0.98);
                    filter: brightness(0.9);
                }
                
                .tk-cover-hover {
                    border: 1px solid rgba(255,255,255,0.1);
                    position: relative;
                }
                
                .tk-cover-hover:hover {
                    transform: translateY(-10px) scale(1.05) perspective(1000px) rotateX(2deg) rotateY(-2deg);
                    box-shadow: 0 30px 60px rgba(0,0,0,0.6),
                                0 0 20px rgba(6, 182, 212, 0.4),
                                inset 0 0 0 1px rgba(255,255,255,0.2);
                    z-index: 10;
                    border-color: rgba(6, 182, 212, 0.6);
                }
                
                .tk-info-hover:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 12px rgba(255,255,255,0.1);
                    border-color: rgba(255,255,255,0.3);
                }
                
                .tk-settings-fab {
                    animation: float 4s ease-in-out infinite, cyberGlow 3s ease-in-out infinite;
                    border: 2px solid rgba(255,255,255,0.15);
                    background-size: 200% 200%;
                }
                
                .tk-settings-fab:hover {
                    animation: none;
                    transform: scale(1.2) rotate(180deg) !important;
                    box-shadow: 0 0 30px rgba(6, 182, 212, 0.8), 0 0 60px rgba(236, 72, 153, 0.6) !important;
                    border-color: rgba(255,255,255,0.5);
                }
                
                /* 滚动条美化 - 极暗风格 */
                .tk-modal-scroll::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                
                .tk-modal-scroll::-webkit-scrollbar-track {
                    background: rgba(2, 6, 23, 0.5);
                    border-radius: 3px;
                }
                
                .tk-modal-scroll::-webkit-scrollbar-thumb {
                    background: rgba(51, 65, 85, 0.8);
                    border-radius: 3px;
                    border: 1px solid rgba(255,255,255,0.05);
                }
                
                .tk-modal-scroll::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(180deg, #06b6d4, #6b21a8);
                    box-shadow: 0 0 10px rgba(6, 182, 212, 0.5);
                }
                
                /* 输入框聚焦效果 - 霓虹发光 */
                .tk-input-modern:focus {
                    outline: none;
                    border-color: #06b6d4 !important;
                    box-shadow: 0 0 0 2px rgba(2, 6, 23, 0.8), 0 0 0 4px rgba(6, 182, 212, 0.5), inset 0 0 8px rgba(6, 182, 212, 0.2) !important;
                    background: rgba(15, 23, 42, 0.9) !important;
                }
                
                /* 滑块美化 - 赛博朋克线形 */
                .tk-slider {
                    -webkit-appearance: none;
                    width: 100%;
                    height: 4px;
                    border-radius: 2px;
                    background: rgba(51, 65, 85, 0.5);
                    outline: none;
                    cursor: pointer;
                    position: relative;
                }
                
                .tk-slider::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; height: 100%;
                    background: linear-gradient(90deg, #06b6d4, #ec4899);
                    border-radius: 2px;
                    width: var(--progress, 50%);
                    z-index: 1;
                    box-shadow: 0 0 10px rgba(236, 72, 153, 0.5);
                }
                
                .tk-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #020617;
                    border: 2px solid #06b6d4;
                    box-shadow: 0 0 10px #06b6d4, inset 0 0 4px #06b6d4;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    z-index: 2;
                }
                
                .tk-slider::-webkit-slider-thumb:hover {
                    transform: scale(1.4);
                    background: #06b6d4;
                    box-shadow: 0 0 15px #06b6d4, 0 0 30px #06b6d4;
                }
                
                /* 状态信息包装器 */
                .tk-status-wrapper {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                /* 刷新重试按钮 - 强烈对比 */
                .tk-refresh-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 8px 16px;
                    background: rgba(15, 23, 42, 0.8);
                    color: #06b6d4;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 700;
                    font-family: 'JetBrains Mono', 'Inter', sans-serif;
                    border: 1px solid rgba(6, 182, 212, 0.5);
                    cursor: pointer;
                    max-width: fit-content;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), inset 0 0 10px rgba(6, 182, 212, 0.1);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                
                .tk-refresh-btn:hover {
                    background: rgba(6, 182, 212, 0.1);
                    border-color: #06b6d4;
                    box-shadow: 0 0 15px rgba(6, 182, 212, 0.4), inset 0 0 15px rgba(6, 182, 212, 0.2);
                    color: #fff;
                    text-shadow: 0 0 5px #06b6d4;
                }
            `;
            document.head.appendChild(style);
        }
    };

    // ==================== 状态管理 ====================
    const state = {
        javdbCache: {},
        cacheOrder: [],         // 缓存访问顺序 (用于 LRU 淘汰和持久化)
        requestQueue: [],
        isProcessing: false,
        isFetchingPage: false,   // 是否正在请求下一页 (修复 #2)
        settings: { ...CONFIG.defaults },
        excludeKeywords: typeof GM_getValue === 'function' ? GM_getValue('tk_exclude_keywords', []) : [], // 排除关键字列表
        observer: null,          // MutationObserver 实例
        loadHandler: null,       // load 事件处理函数引用
        // 分页获取状态
        currentPageNum: 1,       // 初始加载时的页面页码
        fetchPageNum: 1,         // 当前正在获取/已获取的最高页码
        targetValidCount: 8,     // 当前目标要收集的有效项目数
        consecutiveEmptyPages: 0,// 连续空页计数
        bannerTimeout: null,     // 提示框倒计时句柄
        // 速率限制追踪
        requestTimestamps: [],  // 记录最近的请求时间戳
        currentBackoff: 0,      // 当前退避时间
        consecutiveErrors: 0    // 连续错误计数
    };

    // ==================== 设置管理 ====================
    const SettingsManager = {
        load() {
            const saved = GM_getValue(CONFIG.storageKey, null);
            if (saved) {
                try {
                    // 防御性设计：防范历史旧版本以 JSON 字符串形式持久化在 GM 存储中 (优化 #12)
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
    // 实现 LRU 缓存，使用 GM_getValue/GM_setValue 持久化存储
    // 限制最大条数为 CONFIG.cache.maxSize (默认80条)
    const CacheManager = {
        // 存储键名
        STORAGE_KEY: 'tk_javdb_cache',
        ORDER_KEY: 'tk_cache_order',
        // 缓存过期时间 (24小时)
        EXPIRY_TIME: 24 * 60 * 60 * 1000,

        /**
         * 初始化 - 从 GM 存储加载缓存
         */
        init() {
            try {
                // 加载缓存顺序
                const orderData = GM_getValue(this.ORDER_KEY, null);
                if (orderData) {
                    const parsed = typeof orderData === 'string' ? JSON.parse(orderData) : orderData;
                    // 过滤掉过期的
                    const now = Date.now();
                    state.cacheOrder = parsed.filter(item => {
                        if (now - item.timestamp < this.EXPIRY_TIME) {
                            return true;
                        }
                        // 过期的也从缓存中删除
                        GM_deleteValue(this.STORAGE_KEY + '_' + item.code);
                        return false;
                    });
                    // 移除重建 Map 索引逻辑，采用更高效的 findIndex 方案 (修复 #3)
                } else {
                    state.cacheOrder = [];
                }

                // 加载缓存数据到内存
                state.cacheOrder.forEach(item => {
                    const cached = GM_getValue(this.STORAGE_KEY + '_' + item.code, null);
                    if (cached) {
                        try {
                            // 防御性设计：防范历史旧版本以 JSON 字符串形式持久化在 GM 存储中 (优化 #12)
                            const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
                            state.javdbCache[item.code] = data;
                        } catch (e) {
                            // 解析失败则删除
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

        /**
         * 获取缓存
         */
        get(code) {
            // 先从内存获取
            if (state.javdbCache[code]) {
                const entry = state.javdbCache[code];
                // 检查是否为已过期的错误缓存
                if (entry.isError && entry.errorExpiry && Date.now() > entry.errorExpiry) {
                    console.log(`[TorrentKitty] 错误缓存已过期，允许重试: ${code}`);
                    this.remove(code);
                    return null;
                }
                this._updateOrder(code);
                return entry;
            }

            // 再从 GM 存储获取
            try {
                const cached = GM_getValue(this.STORAGE_KEY + '_' + code, null);
                if (cached) {
                    // 防御性设计：防范历史旧版本以 JSON 字符串形式持久化在 GM 存储中 (优化 #12)
                    const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
                    // 写入内存
                    state.javdbCache[code] = data;
                    this._updateOrder(code);
                    console.log(`[TorrentKitty] 从 GM 存储恢复缓存: ${code}`);
                    return data;
                }
            } catch (e) {
                console.error('[TorrentKitty] 读取缓存失败:', e);
            }

            return null;
        },

        /**
         * 设置缓存
         */
        set(code, data) {
            // 如果是新key，先检查是否需要清理
            const isNew = !state.javdbCache[code];
            if (isNew) {
                this._ensureCapacity();
            }

            // 写入内存
            state.javdbCache[code] = data;

            // 写入 GM 存储
            try {
                GM_setValue(this.STORAGE_KEY + '_' + code, data);
            } catch (e) {
                console.error('[TorrentKitty] 缓存写入失败:', e);
                // GM 存储一般不会满，但仍做防御性处理
                this._clearOldest(10);
                try {
                    GM_setValue(this.STORAGE_KEY + '_' + code, data);
                } catch (e2) {
                    console.error('[TorrentKitty] 重试写入仍失败:', e2);
                }
            }

            // 更新访问顺序
            this._updateOrder(code);

            // 持久化顺序
            this._persistOrder();

            console.log(`[TorrentKitty] 缓存更新: ${code} (当前缓存: ${state.cacheOrder.length}/${CONFIG.cache.maxSize})`);
        },

        /**
         * 更新访问顺序 (修复 #3 - 实时 findIndex 定位避免索引失效)
         */
        _updateOrder(code) {
            const now = Date.now();
            const index = state.cacheOrder.findIndex(item => item.code === code);
            if (index !== -1) {
                state.cacheOrder.splice(index, 1);
            }
            // 添加到末尾 (最近访问)
            state.cacheOrder.push({ code, timestamp: now });
        },

        /**
         * 持久化顺序到 GM 存储
         */
        _persistOrder() {
            try {
                GM_setValue(this.ORDER_KEY, state.cacheOrder);
            } catch (e) {
                console.error('[TorrentKitty] 保存缓存顺序失败:', e);
            }
        },

        /**
         * 确保缓存容量
         */
        _ensureCapacity() {
            while (state.cacheOrder.length >= CONFIG.cache.maxSize) {
                this._clearOldest(1);
            }
        },

        /**
         * 清理最旧的N条缓存
         */
        _clearOldest(count) {
            for (let i = 0; i < count && state.cacheOrder.length > 0; i++) {
                const oldest = state.cacheOrder.shift();
                if (oldest) {
                    // 从内存删除
                    delete state.javdbCache[oldest.code];
                    // 从 GM 存储删除
                    GM_deleteValue(this.STORAGE_KEY + '_' + oldest.code);
                    console.log(`[TorrentKitty] 缓存淘汰: ${oldest.code}`);
                }
            }
            this._persistOrder();
        },

        /**
         * 获取当前缓存数量
         */
        size() {
            return state.cacheOrder.length;
        },

        /**
         * 删除指定番号的缓存
         */
        remove(code) {
            // 从内存删除
            delete state.javdbCache[code];
            // 从缓存顺序中删除
            state.cacheOrder = state.cacheOrder.filter(item => item.code !== code);
            // 从 GM 存储删除
            GM_deleteValue(this.STORAGE_KEY + '_' + code);
            // 持久化顺序
            this._persistOrder();
            console.log(`[TorrentKitty] 缓存已删除: ${code}`);
        }
    };

    // ==================== 请求队列管理 ====================
    const QueueManager = {
        add(task) {
            state.requestQueue.push(task);
            this.process();
        },

        /**
         * 计算下一次请求的延迟时间
         */
        getNextDelay() {
            const { baseDelay, minRandomDelay, maxRandomDelay, maxBackoff } = CONFIG.queue;

            // 基础延迟 + 随机延迟(在min~max范围内)
            const randomRange = maxRandomDelay - minRandomDelay;
            const randomPart = minRandomDelay + Math.random() * randomRange;
            let delay = baseDelay + randomPart;

            // 如果有退避，使用退避时间
            if (state.currentBackoff > 0) {
                delay = Math.max(delay, state.currentBackoff);
            }

            return Math.min(delay, maxBackoff);
        },

        /**
         * 检查是否超过速率限制
         */
        isRateLimited() {
            const now = Date.now();
            const oneMinuteAgo = now - 60000;

            // 清理过期的时间戳
            state.requestTimestamps = state.requestTimestamps.filter(ts => ts > oneMinuteAgo);

            // 检查是否超过每分钟限制
            return state.requestTimestamps.length >= CONFIG.queue.maxRequestsPerMinute;
        },

        /**
         * 记录请求时间戳
         */
        recordRequest() {
            state.requestTimestamps.push(Date.now());
        },

        /**
         * 处理错误退避
         */
        handleError() {
            state.consecutiveErrors++;
            // 指数退避：5s, 10s, 20s, 40s... 最大60s
            state.currentBackoff = Math.min(
                CONFIG.queue.errorBackoff * Math.pow(2, state.consecutiveErrors - 1),
                CONFIG.queue.maxBackoff
            );
            console.warn(`[TorrentKitty] 请求错误，退避 ${state.currentBackoff / 1000} 秒`);
        },

        /**
         * 重置错误状态
         */
        resetError() {
            state.consecutiveErrors = 0;
            state.currentBackoff = 0;
        },

        async process() {
            if (state.isProcessing || state.requestQueue.length === 0) {
                if (!state.isProcessing && state.requestQueue.length === 0 && typeof App !== 'undefined' && App.showStatusBanner) {
                    const banner = document.getElementById('tk-status-banner');
                    if (banner && banner.innerText.includes('排队加载封面')) {
                        App.showStatusBanner('封面加载完成！', true);
                    }
                }
                return;
            }

            // 检查速率限制
            if (this.isRateLimited()) {
                console.log('[TorrentKitty] 达到速率限制，等待中...');
                setTimeout(() => this.process(), 5000);
                return;
            }

            state.isProcessing = true;
            const task = state.requestQueue.shift();

            try {
                this.recordRequest();
                await JavDBService.fetchInfo(task.code, task.row);
                this.resetError(); // 成功后重置错误状态
            } catch (e) {
                console.error('[TorrentKitty] 队列处理错误:', e);
                this.handleError();
            }

            const delay = this.getNextDelay();
            console.log(`[TorrentKitty] 下次请求延迟: ${(delay / 1000).toFixed(1)}s`);

            setTimeout(() => {
                state.isProcessing = false;
                this.process();
            }, delay);
        }
    };

    // ==================== JavDB 服务 ====================
    const JavDBService = {
        /**
         * 生成封面URL
         */
        getCoverUrl(coverId) {
            const prefix = coverId.substring(0, 2).toLowerCase();
            return `https://c0.jdbstatic.com/covers/${prefix}/${coverId}.jpg`;
        },

        /**
         * 获取 JavDB 信息
         */
        async fetchInfo(code, row) {
            // 创建调试信息对象
            const debugInfo = this.createDebugInfo(code);

            // 检查缓存
            const cached = CacheManager.get(code);
            if (cached) {
                UIUpdater.updateRow(row, code, cached.debugInfo);
                return;
            }

            try {
                const searchUrl = `https://javdb.com/search?q=${encodeURIComponent(code)}&f=all`;
                debugInfo.fetchUrl = searchUrl;

                const response = await gmFetch(searchUrl);
                debugInfo.fetchStatus = `HTTP ${response.status} ${response.statusText}`;

                // 检测速率限制和封禁
                if (response.status === 429) {
                    debugInfo.errorMessage = '⚠️ 请求过于频繁 (429 Too Many Requests)';
                    throw new Error('RATE_LIMITED'); // 触发退避
                }

                if (response.status === 403) {
                    debugInfo.errorMessage = '🚫 IP可能被封禁 (403 Forbidden)';
                    throw new Error('IP_BANNED'); // 触发退避
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await response.text();

                // 检查是否被重定向到验证页面
                if (html.includes('cf-challenge') || html.includes('captcha')) {
                    debugInfo.errorMessage = '🤖 检测到验证码/Cloudflare挑战';
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
                    debugInfo.errorMessage = '搜索结果为空或未找到匹配项';
                    CacheManager.set(code, { url: null, coverId: null, debugInfo });
                }
            } catch (error) {
                debugInfo.errorMessage = debugInfo.errorMessage || error.message || String(error);
                console.error('[TorrentKitty] JavDB 请求错误:', error);

                const isRetryableError = ['RATE_LIMITED', 'IP_BANNED', 'CAPTCHA_DETECTED'].includes(error.message);

                if (isRetryableError) {
                    // 速率限制/封禁/验证码 → 不缓存，直接触发退避重试
                    UIUpdater.updateRow(row, code, debugInfo);
                    throw error;
                }

                // 其他网络错误 → 短期缓存(5分钟后过期可重试)
                CacheManager.set(code, {
                    url: null, coverId: null, debugInfo,
                    isError: true,
                    errorExpiry: Date.now() + CONFIG.errorCacheExpiry
                });
            }

            UIUpdater.updateRow(row, code, debugInfo);
        },

        /**
         * 创建调试信息对象
         */
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

        /**
         * 解析搜索结果
         */
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

    // ==================== UI 更新器 ====================
    const UIUpdater = {
        /**
         * 更新行内容
         */
        updateRow(row, code, debugInfo) {
            const cache = CacheManager.get(code);
            if (!cache) return;

            const javdbBtn = row.querySelector('.javdb-btn');
            const coverContainer = row.querySelector('.javdb-cover-container');
            const { url, coverId } = cache;

            // 更新调试信息
            if (coverContainer) {
                coverContainer.dataset.debugInfo = JSON.stringify(debugInfo);
            }

            // 更新 JavDB 按钮
            this.updateJavDBButton(javdbBtn, url);

            // 更新封面展示区域
            const { fetchStatus, foundResult } = debugInfo;
            if (fetchStatus === 'ERROR') {
                this.showStatusMessage(coverContainer, debugInfo, {
                    icon: '❌',
                    text: '[ERROR] NETWORK_FAIL',
                    color: { border: '#ef4444', text: '#ef4444' }
                });
            } else if (!foundResult) {
                this.showStatusMessage(coverContainer, debugInfo, {
                    icon: '🚫',
                    text: '[INFO] NO_RECORD_FOUND',
                    color: { border: '#f59e0b', text: '#fcd34d' }
                });
            } else {
                this.updateCover(coverContainer, coverId, debugInfo);
            }
        },

        /**
         * 更新 JavDB 按钮状态
         */
        updateJavDBButton(btn, url) {
            if (!btn) return;

            if (url) {
                btn.href = url;
                btn.innerText = '🔗 DB_LINK';
                btn.style.background = 'rgba(6, 182, 212, 0.15)';
                btn.style.border = '1px solid rgba(6, 182, 212, 0.5)';
                btn.style.color = '#06b6d4';
                btn.style.fontFamily = "'JetBrains Mono', sans-serif";
                btn.style.boxShadow = `0 4px 15px rgba(6, 182, 212, 0.2)`;
            } else {
                btn.innerText = 'Ø NO_LINK';
                btn.style.background = 'rgba(15, 23, 42, 0.8)';
                btn.style.border = '1px solid rgba(148, 163, 184, 0.3)';
                btn.style.color = '#94a3b8';
                btn.style.fontFamily = "'JetBrains Mono', sans-serif";
                btn.style.boxShadow = `0 4px 15px rgba(0, 0, 0, 0.3)`;
                btn.href = '#';
                btn.onclick = (e) => e.preventDefault();
            }
        },

        /**
         * 更新封面显示
         */
        updateCover(container, coverId, debugInfo) {
            if (!container) return;

            if (coverId) {
                this.showCoverImage(container, coverId, debugInfo);
            } else {
                this.showStatusMessage(container, debugInfo, {
                    icon: '⚠️',
                    text: '[ERROR] NOT_FOUND',
                    color: { border: '#eab308', text: '#eab308' }
                });
            }
        },

        /**
         * 显示封面图片
         */
        showCoverImage(container, coverId, debugInfo) {
            const coverUrl = JavDBService.getCoverUrl(coverId);
            const { coverWidth, coverHeight } = state.settings;
            
            // 重置容器，应用极简发光风格边框
            container.innerHTML = '';
            container.style.padding = '0';
            container.style.background = 'transparent';
            container.style.border = 'none';
            container.style.boxShadow = 'none';

            const wrapper = document.createElement('div');
            wrapper.className = 'tk-cover-hover';
            wrapper.style.cssText = `
                position: relative; 
                display: inline-block;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.5), 0 0 10px rgba(6, 182, 212, 0.1);
                background: rgba(2, 6, 23, 0.9);
                border: 1px solid rgba(6, 182, 212, 0.3);
                transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            `;

            const link = document.createElement('a');
            link.href = coverUrl;
            link.target = '_blank';
            link.style.display = 'block';

            const img = document.createElement('img');
            img.src = coverUrl;
            img.className = 'javdb-cover-img';
            img.alt = 'Cover';
            img.style.cssText = `
                max-width: ${coverWidth}px; 
                max-height: ${coverHeight}px; 
                display: block;
                transition: transform 0.5s ease;
            `;

            // 加载成功
            img.onload = () => {
                debugInfo.imageLoadSuccess = true;
                debugInfo.imageSize = `${img.naturalWidth}x${img.naturalHeight}`;
                container.dataset.debugInfo = JSON.stringify(debugInfo);
            };

            // 加载失败
            img.onerror = () => {
                debugInfo.imageLoadSuccess = false;
                debugInfo.imageError = 'HTTP 请求失败（404 或网络错误）';
                container.dataset.debugInfo = JSON.stringify(debugInfo);
                this.showStatusMessage(container, debugInfo, {
                    icon: '🚫',
                    text: '[ERROR] LOAD_FAILED',
                    color: { border: '#ef4444', text: '#ef4444' }
                });
            };

            const fallbackMsg = document.createElement('div');
            fallbackMsg.style.cssText = `
                display: none; 
                position: absolute; 
                bottom: 0; left: 0; right: 0; 
                background: rgba(244, 63, 94, 0.9); 
                color: #fff; 
                text-align: center; 
                padding: 6px; 
                font-size: 11px;
                font-family: 'JetBrains Mono', monospace;
                letter-spacing: 1px;
                text-transform: uppercase;
                border-top: 1px solid rgba(255, 255, 255, 0.2);
            `;
            fallbackMsg.innerText = '[WARN] PROXY_REQUIRED';
            
            // 绑定 onError 用于显示代理提醒 (这主要是处理本地被拦截但能触发onerror的情况)
            img.onerror = function() {
                this.onerror=null; 
                // base64 SVG placeholder (赛博红)
                this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTUwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJyZ2JhKDIsIDYsIDIzLCAwLjkpIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJtb25vc3BhY2UiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiNlZjQ0NDQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5bSU1BR0VfRkFJTF08L3RleHQ+PC9zdmc+'; 
                this.nextElementSibling.style.display='block';
                
                debugInfo.imageLoadSuccess = false;
                debugInfo.imageError = 'Image loading blocked or 404';
                container.dataset.debugInfo = JSON.stringify(debugInfo);
            };

            link.appendChild(img);
            link.appendChild(fallbackMsg);
            wrapper.appendChild(link);
            container.appendChild(wrapper);

            // 阻止冒泡，避免点击图片触发容器的点击事件（若有），同时点击包装器可查看调试
            wrapper.onclick = (e) => {
                if (e.target.tagName !== 'IMG') {
                    ModalManager.showDebugInfo(debugInfo);
                }
            };
        },

        /**
         * 显示状态消息（统一处理错误和无结果）
         * @param {HTMLElement} container - 容器元素
         * @param {Object} debugInfo - 调试信息
         * @param {Object} options - { icon, text, color }
         */
        showStatusMessage(container, debugInfo, { icon, text, color }) {
            container.innerHTML = '';

            const wrapper = document.createElement('div');
            wrapper.className = 'tk-status-wrapper';

            const msgDiv = document.createElement('div');
            msgDiv.className = 'tk-info-hover';
            msgDiv.style.cssText = `
                width: ${state.settings.coverWidth}px;
                padding: 16px;
                background: rgba(2, 6, 23, 0.8);
                border: 1px solid ${color.border};
                border-radius: 8px;
                color: ${color.text || color.bgSolid};
                text-align: center;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 4px 15px rgba(0,0,0,0.5), inset 0 0 10px ${color.border};
                font-family: 'JetBrains Mono', 'Inter', sans-serif;
                backdrop-filter: blur(10px);
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                min-height: ${state.settings.coverHeight / 2}px;
            `;
            msgDiv.innerHTML = `
                <div style="font-size: 24px; margin-bottom: 8px; filter: drop-shadow(0 0 8px ${color.border});">${icon}</div>
                <div style="font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">${text}</div>
                <small style="opacity: 0.6; margin-top: 8px; font-size: 10px; font-family: 'JetBrains Mono', monospace;">[CLICK_FOR_DIAGNOSTICS]</small>
            `;
            msgDiv.onclick = () => ModalManager.showDebugInfo(debugInfo);

            const refreshBtn = document.createElement('button');
            refreshBtn.className = 'tk-btn-hover tk-refresh-btn';
            refreshBtn.innerHTML = 'RETRY_SYNC';
            refreshBtn.style.marginTop = '10px';
            refreshBtn.onclick = (e) => {
                e.stopPropagation();
                this.refreshCover(container, debugInfo.code);
            };

            wrapper.appendChild(msgDiv);
            wrapper.appendChild(refreshBtn);
            container.appendChild(wrapper);
        },

        /**
         * 刷新封面 - 删除缓存并重新请求
         */
        refreshCover(container, code) {
            // 显示加载中状态
            container.innerHTML = `
                <div style="
                    margin-top: 12px; 
                    font-size: 12px; 
                    color: #94a3b8;
                    font-family: 'JetBrains Mono', 'Inter', sans-serif;
                    padding: 14px 18px;
                    background: linear-gradient(145deg, rgba(15, 23, 42, 0.8), rgba(2, 6, 23, 0.9));
                    border-radius: 8px;
                    border: 1px solid rgba(6, 182, 212, 0.2);
                    display: inline-block;
                    box-shadow: 0 10px 20px rgba(0,0,0,0.5), inset 0 0 15px rgba(6, 182, 212, 0.05);
                ">
                    <span style="display: inline-flex; align-items: center; gap: 10px;">
                        <span style="display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(6, 182, 212, 0.2); border-top-color: #06b6d4; border-radius: 50%; animation: spin 1s linear infinite, neonPulse 2s infinite;"></span>
                        <span style="color: #06b6d4; text-transform: uppercase; letter-spacing: 1px; text-shadow: 0 0 5px rgba(6, 182, 212, 0.5);">RE-SYNCING...</span>
                    </span>
                </div>
            `;

            // 删除缓存
            CacheManager.remove(code);

            // 查找对应的行
            const row = container.closest('tr');
            if (row) {
                // 重新加入请求队列
                QueueManager.add({ code, row });
            }
        },

        /**
         * 更新所有封面尺寸
         */
        updateAllCovers() {
            const { coverWidth, coverHeight } = state.settings;

            document.querySelectorAll('.javdb-cover-img').forEach(img => {
                img.style.maxWidth = `${coverWidth}px`;
                img.style.maxHeight = `${coverHeight}px`;
            });

            document.querySelectorAll('.javdb-cover-container > div').forEach(div => {
                div.style.maxWidth = `${coverWidth}px`;
            });
            
            // 同步更新消息框的宽度
            document.querySelectorAll('.tk-info-hover').forEach(div => {
                div.style.width = `${coverWidth}px`;
            });
        }
    };

    // ==================== 模态框管理器 ====================
    const ModalManager = {
        /**
         * 创建模态框基础结构
         */
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

        /**
         * 创建按钮
         */
        createButton(text, color, onClick) {
            const btn = document.createElement('button');
            btn.innerText = text;
            btn.className = 'tk-btn-hover';
            btn.style.cssText = StyleUtils.buttonBase(color, {
                padding: '10px 24px',
                fontSize: '14px',
                margin: '0'
            });
            btn.style.fontFamily = "'JetBrains Mono', 'Inter', sans-serif";
            btn.style.letterSpacing = "1px";
            btn.style.textTransform = "uppercase";
            btn.onclick = onClick;
            return btn;
        },

        /**
         * 显示调试信息
         */
        showDebugInfo(debugInfo) {
            const info = this.formatDebugInfo(debugInfo);

            const modal = document.createElement('div');
            modal.className = 'tk-modal-scroll';
            modal.style.cssText = StyleUtils.modal({ maxWidth: '750px' });
            modal.style.background = 'linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(2, 6, 23, 0.98))';
            modal.style.border = '1px solid rgba(6, 182, 212, 0.3)';
            modal.style.boxShadow = '0 30px 60px rgba(0, 0, 0, 0.6), 0 0 20px rgba(6, 182, 212, 0.2)';

            // 标题 - 赛博渐变效果
            const title = document.createElement('h3');
            title.innerHTML = '⚡ <span style="background: linear-gradient(135deg, #06b6d4, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-transform: uppercase; letter-spacing: 2px;">System Debug Log</span>';
            title.style.cssText = `
                margin: 0 0 20px 0; 
                color: #f8fafc; 
                font-size: 20px;
                font-weight: 700;
                font-family: 'JetBrains Mono', 'Segoe UI', sans-serif;
                display: flex;
                align-items: center;
                gap: 12px;
                border-bottom: 1px solid rgba(6, 182, 212, 0.2);
                padding-bottom: 12px;
            `;

            // 文本框 - 极简代码风
            const textarea = document.createElement('textarea');
            textarea.value = info;
            textarea.readOnly = true;
            textarea.className = 'tk-input-modern tk-modal-scroll';
            textarea.style.cssText = `
                width: 100%;
                height: 420px;
                font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
                font-size: 13px;
                line-height: 1.6;
                padding: 16px;
                background: rgba(2, 6, 23, 0.8);
                border: 1px solid rgba(6, 182, 212, 0.3);
                border-radius: 8px;
                resize: vertical;
                box-sizing: border-box;
                color: #06b6d4;
                transition: all 0.3s ease;
                text-shadow: 0 0 5px rgba(6, 182, 212, 0.3);
            `;

            // 按钮容器
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'margin-top: 24px; display: flex; gap: 12px; justify-content: flex-end;';

            buttonContainer.appendChild(
                this.createButton('📋 COPY_ALL', COLORS.primary, () => {
                    textarea.select();
                    textarea.setSelectionRange(0, textarea.value.length);
                })
            );

            const closeBtn = this.createButton('✕ CLOSE', COLORS.neutral, null);
            buttonContainer.appendChild(closeBtn);

            modal.append(title, textarea, buttonContainer);
            const overlay = this.createOverlay(modal);

            closeBtn.onclick = () => overlay.remove();
            setTimeout(() => textarea.select(), 100);
        },

        /**
         * 格式化调试信息
         */
        formatDebugInfo(debugInfo) {
            return `>> SYSTEM DIAGNOSTICS: JAVDB MODULE
============================================================

[+] BASIC_INFO
    |- CODE: ${debugInfo.code}
    |- TIMESTAMP: ${debugInfo.timestamp}

[+] NETWORK_REQUEST
    |- URL: ${debugInfo.fetchUrl}
    |- STATUS: ${debugInfo.fetchStatus}

[+] SEARCH_RESULTS
    |- MATCH_FOUND: ${debugInfo.foundResult ? '[ OK ]' : '[ FAIL ]'}
    |- JAVDB_LINK: ${debugInfo.javdbUrl || 'N/A'}
    |- COVER_ID: ${debugInfo.coverId || 'N/A'}

[+] ASSET_LOAD
    |- URL: ${debugInfo.coverUrl || 'N/A'}
    |- LOAD_SUCCESS: ${debugInfo.imageLoadSuccess !== undefined ? (debugInfo.imageLoadSuccess ? '[ OK ]' : '[ FAIL ]') : '[ PENDING ]'}
    |- DIMENSIONS: ${debugInfo.imageSize || 'UNKNOWN'}
    |- ERRORS: ${debugInfo.imageError || 'NONE'}

[!] EXCEPTIONS
    |- ${debugInfo.errorMessage || 'NONE_DETECTED'}

============================================================
>> EOF`;
        },

        /**
         * 显示设置面板
         */
        showSettings() {
            const panel = document.createElement('div');
            panel.className = 'tk-modal-scroll';
            panel.style.cssText = StyleUtils.modal({ maxWidth: '520px', padding: '36px' });
            panel.style.background = 'linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(2, 6, 23, 0.98))';
            panel.style.border = '1px solid rgba(236, 72, 153, 0.3)';
            panel.style.boxShadow = '0 30px 60px rgba(0, 0, 0, 0.6), 0 0 30px rgba(236, 72, 153, 0.2)';

            panel.innerHTML = `
                <h2 style="
                    margin: 0 0 28px 0; 
                    font-size: 22px;
                    font-weight: 700;
                    font-family: 'JetBrains Mono', 'Inter', sans-serif;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    border-bottom: 1px solid rgba(236, 72, 153, 0.2);
                    padding-bottom: 16px;
                    letter-spacing: 2px;
                    text-transform: uppercase;
                ">
                    <span style="font-size: 24px; text-shadow: 0 0 10px rgba(236, 72, 153, 0.8);">⚙️</span>
                    <span style="background: linear-gradient(135deg, #ec4899, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">System_Config</span>
                </h2>

                <div style="
                    background: rgba(2, 6, 23, 0.6);
                    border-radius: 12px;
                    padding: 24px;
                    margin-bottom: 30px;
                    border: 1px solid rgba(6, 182, 212, 0.2);
                    box-shadow: inset 0 0 20px rgba(0,0,0,0.5);
                ">
                    <div style="margin-bottom: 32px;">
                        <label style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 16px; 
                            color: #94a3b8; 
                            font-size: 14px;
                            font-weight: 600;
                            font-family: 'JetBrains Mono', 'Inter', sans-serif;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                        ">
                            <span style="display: flex; align-items: center; gap: 8px;">
                                <span style="color: #06b6d4;">[W]</span> X_AXIS_WIDTH
                            </span>
                            <span style="
                                background: rgba(6, 182, 212, 0.15);
                                color: #06b6d4;
                                padding: 4px 12px;
                                border-radius: 4px;
                                font-size: 13px;
                                font-weight: 700;
                                border: 1px solid rgba(6, 182, 212, 0.4);
                                box-shadow: 0 0 10px rgba(6, 182, 212, 0.2);
                            "><span id="width-value">${state.settings.coverWidth}</span> PX</span>
                        </label>
                        <input type="range" id="width-slider" class="tk-slider" min="100" max="800" 
                               value="${state.settings.coverWidth}" style="--progress: ${((state.settings.coverWidth - 100) / 700) * 100}%;">
                    </div>

                    <div>
                        <label style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 16px; 
                            color: #94a3b8; 
                            font-size: 14px;
                            font-weight: 600;
                            font-family: 'JetBrains Mono', 'Inter', sans-serif;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                        ">
                            <span style="display: flex; align-items: center; gap: 8px;">
                                <span style="color: #ec4899;">[H]</span> Y_AXIS_HEIGHT
                            </span>
                            <span style="
                                background: rgba(236, 72, 153, 0.15);
                                color: #ec4899;
                                padding: 4px 12px;
                                border-radius: 4px;
                                font-size: 13px;
                                font-weight: 700;
                                border: 1px solid rgba(236, 72, 153, 0.4);
                                box-shadow: 0 0 10px rgba(236, 72, 153, 0.2);
                            "><span id="height-value">${state.settings.coverHeight}</span> PX</span>
                        </label>
                        <input type="range" id="height-slider" class="tk-slider" min="100" max="600" 
                               value="${state.settings.coverHeight}" style="--progress: ${((state.settings.coverHeight - 100) / 500) * 100}%;">
                    </div>
                </div>

                <div id="settings-buttons" style="display: flex; gap: 12px; justify-content: flex-end;"></div>
            `;

            const overlay = this.createOverlay(panel);
            this.initSettingsPanel(panel, overlay);
        },

        /**
         * 初始化设置面板事件
         */
        initSettingsPanel(panel, overlay) {
            const widthSlider = panel.querySelector('#width-slider');
            const heightSlider = panel.querySelector('#height-slider');
            const widthValue = panel.querySelector('#width-value');
            const heightValue = panel.querySelector('#height-value');
            const buttonsContainer = panel.querySelector('#settings-buttons');

            // 滑块事件 - 同步更新自定义属性用于进度条颜色填充
            widthSlider.oninput = () => {
                widthValue.textContent = widthSlider.value;
                widthSlider.style.setProperty('--progress', `${((widthSlider.value - 100) / 700) * 100}%`);
            };
            heightSlider.oninput = () => {
                heightValue.textContent = heightSlider.value;
                heightSlider.style.setProperty('--progress', `${((heightSlider.value - 100) / 500) * 100}%`);
            };

            // 重置按钮
            buttonsContainer.appendChild(
                this.createButton('RESET_DEF', COLORS.warning, () => {
                    widthSlider.value = CONFIG.defaults.coverWidth;
                    heightSlider.value = CONFIG.defaults.coverHeight;
                    widthSlider.oninput();
                    heightSlider.oninput();
                })
            );

            // 保存按钮
            buttonsContainer.appendChild(
                this.createButton('SAVE_SYS', COLORS.primary, () => {
                    state.settings.coverWidth = parseInt(widthSlider.value);
                    state.settings.coverHeight = parseInt(heightSlider.value);
                    SettingsManager.save();
                    UIUpdater.updateAllCovers();
                    overlay.remove();
                })
            );

            // 取消按钮
            buttonsContainer.appendChild(
                this.createButton('ABORT', COLORS.neutral, () => overlay.remove())
            );
        }
    };

    // ==================== 按钮工厂 ====================
    const ButtonFactory = {
        /**
         * 创建现代化链接按钮
         */
        createLinkButton(text, href, color, className) {
            const btn = document.createElement('a');
            btn.href = href;
            btn.target = '_blank';
            btn.innerText = text;
            btn.className = `${className} tk-btn-hover`;
            btn.style.cssText = StyleUtils.buttonBase(color, { margin: '0 0 0 8px' });

            return btn;
        },

        /**
         * 创建现代化设置悬浮按钮 (FAB)
         */
        createSettingsButton() {
            const btn = document.createElement('div');
            btn.className = 'tk-settings-fab';
            btn.innerHTML = '⚙️';
            btn.style.cssText = `
                position: fixed;
                bottom: 32px;
                right: 32px;
                width: 60px;
                height: 60px;
                background: ${COLORS.settingsGradient};
                color: white;
                border-radius: 50%;
                display: flex;
                justify-content: center;
                align-items: center;
                cursor: pointer;
                font-size: 28px;
                box-shadow: 0 8px 32px rgba(102, 126, 234, 0.5),
                            0 4px 12px rgba(0,0,0,0.15),
                            inset 0 2px 0 rgba(255,255,255,0.2);
                z-index: 10000;
                transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                border: 2px solid rgba(255,255,255,0.2);
            `;

            btn.onclick = () => ModalManager.showSettings();

            document.body.appendChild(btn);
        }
    };

    // ==================== 排除关键字管理器 ====================
    const ExclusionManager = {
        init() {
            this.renderUI();
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
            // 重新过滤，排除被标记的数据
            if (typeof App !== 'undefined') {
                App.processRows();
                // 排除后可能不足 8 个，触发一次补充加载
                App.checkPaginationAndDispatch();
            }
        },
        renderUI() {
            const container = document.createElement('div');
            container.id = 'tk-exclusion-panel';
            container.style.cssText = `
                position: fixed;
                bottom: 100px;
                right: 32px;
                background: linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(2, 6, 23, 0.98));
                border: 1px solid rgba(236, 72, 153, 0.4);
                border-radius: 12px;
                padding: 16px;
                width: 280px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 15px rgba(236, 72, 153, 0.2);
                backdrop-filter: blur(10px);
                z-index: 9999;
                color: #f8fafc;
                font-family: 'JetBrains Mono', 'Inter', sans-serif;
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            `;
            const header = document.createElement('div');
            header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; cursor: pointer; border-bottom: 1px solid rgba(236, 72, 153, 0.2); padding-bottom: 8px;';
            header.innerHTML = `<span style="font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #ec4899; text-shadow: 0 0 5px rgba(236, 72, 153, 0.5);">🛡️ FILTER_RULES</span><span id="tk-exc-toggle" style="font-size: 12px; color: #ec4899;">▼</span>`;
            
            const body = document.createElement('div');
            body.id = 'tk-exc-body';
            
            const inputArea = document.createElement('div');
            inputArea.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px;';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'INPUT_KEYWORD...';
            input.className = 'tk-input-modern';
            input.style.cssText = `
                flex: 1;
                background: rgba(2, 6, 23, 0.6);
                border: 1px solid rgba(6, 182, 212, 0.3);
                color: #06b6d4;
                border-radius: 6px;
                padding: 8px 10px;
                font-size: 12px;
                outline: none;
                font-family: 'JetBrains Mono', monospace;
                transition: all 0.3s ease;
            `;
            
            const btn = document.createElement('button');
            btn.innerText = 'ADD';
            btn.className = 'tk-btn-hover';
            btn.style.cssText = StyleUtils.buttonBase(COLORS.primary, { padding: '8px 12px', fontSize: '12px', margin: '0' });
            btn.style.fontFamily = "'JetBrains Mono', sans-serif";
            btn.style.fontWeight = "bold";
            
            btn.onclick = () => {
                if (input.value) {
                    this.addKeyword(input.value);
                    input.value = '';
                }
            };
            input.onkeypress = (e) => {
                if (e.key === 'Enter') btn.onclick();
            };
            
            inputArea.appendChild(input);
            inputArea.appendChild(btn);
            body.appendChild(inputArea);
            
            const listArea = document.createElement('div');
            listArea.id = 'tk-exc-list';
            listArea.className = 'tk-modal-scroll';
            listArea.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; max-height: 150px; overflow-y: auto; padding-right: 4px;';
            
            body.appendChild(listArea);
            container.appendChild(header);
            container.appendChild(body);
            
            // 默认折叠以防遮挡
            let isCollapsed = true;
            body.style.display = 'none';
            header.querySelector('#tk-exc-toggle').innerText = '▲';
            
            header.onclick = () => {
                isCollapsed = !isCollapsed;
                body.style.display = isCollapsed ? 'none' : 'block';
                header.querySelector('#tk-exc-toggle').innerText = isCollapsed ? '▲' : '▼';
            };
            
            document.body.appendChild(container);
            this.updateList();
        },
        updateList() {
            const listArea = document.getElementById('tk-exc-list');
            if (!listArea) return;
            listArea.innerHTML = '';
            state.excludeKeywords.forEach(kw => {
                const tag = document.createElement('span');
                tag.style.cssText = `
                    background: rgba(244, 63, 94, 0.15);
                    border: 1px solid rgba(244, 63, 94, 0.4);
                    color: #fda4af;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    box-shadow: 0 0 10px rgba(244, 63, 94, 0.1);
                `;
                tag.innerText = kw;
                
                const del = document.createElement('span');
                del.innerText = '×';
                del.style.cssText = 'cursor: pointer; font-weight: bold; font-size: 14px; transition: color 0.2s; color: #f43f5e;';
                del.onmouseover = () => del.style.color = '#fff';
                del.onmouseout = () => del.style.color = '#f43f5e';
                del.onclick = () => this.removeKeyword(kw);
                
                tag.appendChild(del);
                listArea.appendChild(tag);
            });
        }
    };

    // ==================== 原站按钮美化 ====================
    const OriginalButtonStyler = {
        // 按钮类型映射
        buttonTypes: [
            { keywords: ['Detail', '详情'], color: COLORS.info, newText: 'DETAILS' },
            { keywords: ['Open', '打开'], color: COLORS.success, newText: 'OPEN_LINK' },
            { keywords: ['Download', '下载'], color: COLORS.danger, newText: 'DOWNLOAD_MAGNET' }
        ],

        /**
         * 美化原站按钮
         */
        style() {
            const buttons = document.querySelectorAll('a:not(.tk-styled), input[type="button"]:not(.tk-styled), input[type="submit"]:not(.tk-styled)');

            buttons.forEach(btn => {
                const text = btn.innerText || btn.value || '';

                for (const type of this.buttonTypes) {
                    if (type.keywords.some(keyword => text.includes(keyword))) {
                        btn.classList.add('tk-styled', 'tk-btn-hover');
                        btn.style.cssText = StyleUtils.buttonBase(type.color);
                        btn.style.fontFamily = "'JetBrains Mono', monospace";
                        btn.style.fontWeight = "bold";
                        btn.style.letterSpacing = "1px";
                        if (btn.tagName === 'INPUT') {
                            btn.value = type.newText;
                        } else {
                            btn.innerText = type.newText;
                        }
                        break;
                    }
                }
            });
        }
    };

    // ==================== 主逻辑 ====================
    const App = {
        /**
         * 辅助方法：统一查找结果表格 (优化 #15)
         */
        _findResultTable(doc = document) {
            return doc.querySelector('table#archiveResult') || doc.querySelector('table.results') || doc.querySelector('.search-results table');
        },

        /**
         * 获取精准搜索结果行
         */
        getResultRows(doc = document) {
            const table = this._findResultTable(doc);
            if (table) {
                return Array.from(table.querySelectorAll('tr')).slice(1); // 过滤掉表头
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

        /**
         * 获取结果表格容器 (用于追加新行)
         */
        getResultsTable() {
            const table = this._findResultTable(document);
            if (table) {
                return table.querySelector('tbody') || table;
            }
            const firstRow = this.getResultRows()[0];
            return firstRow ? firstRow.parentNode : null;
        },

        /**
         * 获取当前 URL 的页码
         */
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

        /**
         * 构造指定页码的下一页 URL
         */
        getNextPageUrl(pageNum) {
            const url = new URL(window.location.href);
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts[0] === 'search' && pathParts[1]) {
                return `${url.origin}/search/${pathParts[1]}/${pageNum}`;
            }
            const paginationLinks = document.querySelectorAll('.pagination a, .pages a');
            for (let link of paginationLinks) {
                const href = link.getAttribute('href');
                // 采用精准的边界正则匹配，防止页码 /2 误匹配成 /20 (修复 #9)
                const regex = new RegExp(`\\/${pageNum}(?:$|\\/|\\?|#)`);
                if (href && regex.test(href)) {
                    return new URL(href, window.location.origin).href;
                }
            }
            return null;
        },

        /**
         * 处理表格行：只做DOM标记，先凑齐再统一排队
         */
        processRows() {
            const resultRows = this.getResultRows();

            resultRows.forEach(row => {
                try {
                    const rowText = row.innerText;
                    
                    // --- 检查是否包含排除关键字 ---
                    const isExcluded = state.excludeKeywords.some(kw => kw && rowText.includes(kw));
                    if (isExcluded) {
                        row.style.display = 'none';
                        row.dataset.excluded = 'true'; // 添加排除标记 (修复 #10)
                        delete row.dataset.validCode; // 彻底切断该行参与排队的可能
                        // 同时也从请求队列中移除已排队的当前行任务 (修复 #4)
                        state.requestQueue = state.requestQueue.filter(task => task.row !== row);
                        return;
                    }
                    
                    // 恢复显示（先前因排除关键字被隐藏的行）(修复 #10)
                    if (row.dataset.excluded === 'true') {
                        row.style.display = '';
                        delete row.dataset.excluded;
                    }

                    // 如果已经打上了标记，说明已经匹配过番号，直接跳过
                    if (row.dataset.validCode) return;
                    const match = rowText.match(CONFIG.codeRegex);

                    if (match) {
                        // 提取匹配的番号 (match[1]: 标准番号, match[2]: 东热番号)
                        let code = (match[1] || match[2]).toUpperCase();
                        // 格式化番号：将 CLA314 转换为 CLA-314（东热番号 N1234 不插入连字符）
                        if (!code.includes('-') && /^[A-Z]{2,}/.test(code)) {
                            // 找到字母和数字的分界点，插入连字符
                            code = code.replace(/([A-Z]+)(\d+)/, '$1-$2');
                        }
                        // 仅做标记，不立即处理和加入排队
                        row.dataset.validCode = code;
                    } else {
                        // 如果不匹配番号正则，说明非JAV视频，直接隐藏
                        row.style.display = 'none';
                    }
                } catch (e) {
                    console.error('[TorrentKitty] 处理行时出错:', e, row);
                }
            });

            // 触发翻页与分发队列的检查逻辑
            this.checkPaginationAndDispatch();

            // 美化原站按钮
            OriginalButtonStyler.style();
        },

        /**
         * 增强单行
         */
        enhanceRow(row, code) {
            // 查找目标按钮
            let targetBtn = Array.from(row.querySelectorAll('a, input, button')).find(el =>
                (el.innerText?.includes('Download')) || el.value === 'Download'
            );

            if (!targetBtn) {
                targetBtn = row.querySelector('a[href^="magnet:"]');
            }

            if (!targetBtn) return;

            const parent = targetBtn.parentNode;

            // 创建 MissAV 按钮
            const missavBtn = ButtonFactory.createLinkButton(
                '▶ MISS_AV',
                `https://missav.ws/cn/${code}`,
                COLORS.pink,
                'missav-btn'
            );
            missavBtn.style.fontFamily = "'JetBrains Mono', sans-serif";
            missavBtn.style.letterSpacing = "1px";
            parent.insertBefore(missavBtn, targetBtn.nextSibling);

            // 创建 JavDB 按钮
            const javdbBtn = ButtonFactory.createLinkButton(
                '⏳ DATALINK_INIT...',
                '#',
                COLORS.neutral,
                'javdb-btn'
            );
            javdbBtn.style.fontFamily = "'JetBrains Mono', sans-serif";
            javdbBtn.style.letterSpacing = "1px";
            parent.insertBefore(javdbBtn, missavBtn.nextSibling);

            // 创建封面容器
            const coverContainer = document.createElement('div');
            coverContainer.className = 'javdb-cover-container';
            coverContainer.style.cssText = `
                margin-top: 12px; 
                font-size: 12px; 
                color: #94a3b8;
                font-family: 'JetBrains Mono', 'Inter', sans-serif;
                padding: 14px 18px;
                background: linear-gradient(145deg, rgba(15, 23, 42, 0.8), rgba(2, 6, 23, 0.9));
                border-radius: 8px;
                border: 1px solid rgba(6, 182, 212, 0.2);
                display: inline-block;
                box-shadow: 0 10px 20px rgba(0,0,0,0.5), inset 0 0 15px rgba(6, 182, 212, 0.05);
                position: relative;
                overflow: hidden;
            `;

            // 添加扫描线特效元素
            const scanline = document.createElement('div');
            scanline.style.cssText = `
                position: absolute;
                top: 0; left: 0; right: 0;
                height: 2px;
                background: linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.8), transparent);
                animation: scan 2s linear infinite;
                opacity: 0.5;
            `;
            
            // 为了扫描线动画注入一条临时关键帧，放在 StyleUtils 更合适，但这里直接写也行，其实在全局样式加更稳妥。
            // 这里我们依赖前面注入的 style，但为了确保生效可以内联一些简单的动画或者直接添加全局。
            // 稍后可以补充这个 `@keyframes scan`。为求稳妥，我们在全局再加一次，或者不加这个扫描线而是用纯 CSS 发光。
            // 简单处理，移除 scanline 动画，改用内部的霓虹脉冲发光
            coverContainer.innerHTML = `
                <span style="display: inline-flex; align-items: center; gap: 10px;">
                    <span style="display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(6, 182, 212, 0.2); border-top-color: #06b6d4; border-radius: 50%; animation: spin 1s linear infinite, neonPulse 2s infinite;"></span>
                    <span style="color: #06b6d4; text-transform: uppercase; letter-spacing: 1px; text-shadow: 0 0 5px rgba(6, 182, 212, 0.5);">INITIALIZING DATALINK...</span>
                </span>
            `;
            parent.appendChild(coverContainer);

            // 移除 spin 动画的重复注入逻辑，已合并到 StyleUtils.injectGlobalStyles 中 (修复 #13)

            // 标记该行已经完成了 enhance，防止重复加入队列
            row.dataset.enhanced = 'true';

            // ⚡ 关键优化：先检查缓存，命中则直接显示，无需排队
            const cached = CacheManager.get(code);
            if (cached) {
                // 缓存命中，直接更新UI
                console.log(`[TorrentKitty] ⚡ 缓存命中，秒加载: ${code}`);
                UIUpdater.updateRow(row, code, cached.debugInfo || {});
                return; // 不需要加入队列
            }

            // 缓存未命中，加入请求队列
            QueueManager.add({ code, row });
        },

        /**
         * 获取当前页面拥有的“具有有效番号的行数”
         */
        getValidRowsCount() {
            return document.querySelectorAll('tr[data-valid-code]').length;
        },

        /**
         * 显示底部加载状态横幅
         */
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
                    background: linear-gradient(135deg, rgba(2, 6, 23, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%);
                    color: #06b6d4;
                    border: 1px solid rgba(6, 182, 212, 0.4);
                    border-radius: 8px;
                    text-align: center;
                    font-family: 'JetBrains Mono', 'Inter', sans-serif;
                    font-weight: 700;
                    font-size: 13px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.8), 0 0 15px rgba(6, 182, 212, 0.2);
                    backdrop-filter: blur(10px);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    z-index: 9998;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                `;
                const resultsTable = this.getResultsTable();
                if (resultsTable && resultsTable.parentNode) {
                    resultsTable.parentNode.insertBefore(banner, resultsTable.nextSibling);
                } else {
                    document.body.appendChild(banner);
                }
            }

            // 改为安全的文本写入，规避 XSS 风险 (优化 #14)
            banner.innerHTML = '';
            const textSpan = document.createElement('span');
            textSpan.textContent = text;
            textSpan.style.textShadow = '0 0 5px rgba(6, 182, 212, 0.5)';
            banner.appendChild(textSpan);
            
            if (showContinueBtn) {
                const btn = document.createElement('button');
                btn.innerText = '>> PROCEED_NEXT';
                btn.style.cssText = `
                    margin-left: 15px;
                    padding: 6px 14px;
                    background: rgba(6, 182, 212, 0.1);
                    border: 1px solid rgba(6, 182, 212, 0.5);
                    border-radius: 4px;
                    color: #06b6d4;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: bold;
                    font-family: 'JetBrains Mono', sans-serif;
                    box-shadow: inset 0 0 10px rgba(6, 182, 212, 0.1);
                    transition: all 0.2s;
                `;
                btn.onmouseover = () => {
                    btn.style.background = 'rgba(6, 182, 212, 0.2)';
                    btn.style.boxShadow = '0 0 10px rgba(6, 182, 212, 0.4), inset 0 0 10px rgba(6, 182, 212, 0.2)';
                    btn.style.color = '#fff';
                };
                btn.onmouseout = () => {
                    btn.style.background = 'rgba(6, 182, 212, 0.1)';
                    btn.style.boxShadow = 'inset 0 0 10px rgba(6, 182, 212, 0.1)';
                    btn.style.color = '#06b6d4';
                };
                btn.onclick = () => {
                    state.targetValidCount += 8;
                    this.showStatusBanner('INITIATING_SEARCH...', false);
                    this.checkPaginationAndDispatch();
                };
                banner.appendChild(btn);
            }

            banner.style.display = 'block';
            banner.style.opacity = '1';
        },

        /**
         * 隐藏加载状态横幅
         */
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

        /**
         * 检查翻页是否足够，如果够了就分发队列
         */
        checkPaginationAndDispatch() {
            // 如果正在请求下一页 HTML 阶段，防抖返回
            if (state.isFetchingPage) return;

            const validCount = this.getValidRowsCount();
            console.log(`[TorrentKitty] 页面当前带有番号的项目: ${validCount}/${state.targetValidCount}`);

            if (validCount < state.targetValidCount) {
                if (state.fetchPageNum - state.currentPageNum >= (CONFIG.maxPagesToFetch || 10)) {
                    console.log('[TorrentKitty] 已达到最大翻页限制，停止寻找。');
                    this.showStatusBanner(`已到达最大页数限制。当前带番号的项目: ${validCount} 个`, true);
                    this.dispatchQueue();
                    return;
                }
                
                state.fetchPageNum++;
                this.loadNextPage(state.fetchPageNum);
            } else {
                console.log('[TorrentKitty] 已收集到足够的番号项目，开始排队获取详情...');
                this.showStatusBanner(`当前共有 ${validCount} 个带番号的项目，正在排队加载封面...`, true);
                this.dispatchQueue();
            }
        },

        /**
         * 统一对收集到的行派发 `enhanceRow` 任务加入队列
         */
        dispatchQueue() {
            const validRows = document.querySelectorAll('tr[data-valid-code]:not([data-enhanced="true"])');
            validRows.forEach(row => {
                const code = row.dataset.validCode;
                if (code) {
                    this.enhanceRow(row, code);
                }
            });
        },

        /**
         * 拉取并拼接下一页
         */
        loadNextPage(pageNum) {
            const nextUrl = this.getNextPageUrl(pageNum);
            if (!nextUrl) {
                console.log('[TorrentKitty] 无法构造下一页 URL，停止加载。');
                this.showStatusBanner(`已到达最后一页或无法获取下一页。当前带有番号的项目: ${this.getValidRowsCount()} 个`, true);
                this.dispatchQueue();
                return;
            }

            this.showStatusBanner(`正在加载第 ${pageNum} 页以补充项目... (当前带有番号的项目: ${this.getValidRowsCount()}/${state.targetValidCount})`);
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
                    console.error('[TorrentKitty] 未找到结果表格容器');
                    state.isFetchingPage = false; // 异常退出前重置状态 (修复 #17)
                    return;
                }

                let lastValidRow = null;
                nextRows.forEach(row => {
                    const rowText = row.innerText;
                    if (rowText.match(CONFIG.codeRegex)) {
                        // 提前对包含排除关键字的行进行拦截 (修复 #5)
                        const isExcluded = state.excludeKeywords.some(kw => kw && rowText.includes(kw));
                        if (isExcluded) {
                            return; // 直接跳过，不插入 DOM
                        }
                        const importedRow = document.importNode(row, true);
                        resultsTable.appendChild(importedRow);
                        lastValidRow = importedRow;
                    }
                });

                // --- 插入页码标记（直接追加在最后一个条目的名称旁边） ---
                if (lastValidRow) {
                    const nameCell = lastValidRow.querySelector('.name') || lastValidRow.cells[0];
                    if (nameCell) {
                        const badge = document.createElement('span');
                        badge.className = 'tk-page-marker'; // 添加特定的类名以便 Observer 过滤 (修复 #7)
                        badge.style.cssText = 'margin-left: 10px; padding: 2px 8px; background: rgba(236, 72, 153, 0.15); color: #ec4899; border-radius: 4px; font-size: 11px; font-weight: bold; border: 1px solid rgba(236, 72, 153, 0.4); text-shadow: 0 0 5px rgba(236, 72, 153, 0.5); font-family: "JetBrains Mono", sans-serif;';
                        badge.innerText = `[PAGE_${pageNum}]`;
                        nameCell.appendChild(badge);
                    }
                }
                // --------------------

                state.isFetchingPage = false;
                let addedAny = !!lastValidRow;
                if (!addedAny) {
                    console.log(`[TorrentKitty] 第 ${pageNum} 页未找到任何可能的番号项目。`);
                    state.consecutiveEmptyPages++;
                    if (state.consecutiveEmptyPages > 5) {
                        this.showStatusBanner('连续 5 页未找到任何带番号项目，停止自动加载。', true);
                        this.dispatchQueue();
                        return;
                    }
                    // 继续下一页
                    setTimeout(() => this.checkPaginationAndDispatch(), 1000);
                } else {
                    state.consecutiveEmptyPages = 0;
                    // 通过调用 processRows 手动触发一次
                    this.processRows();
                }
            }).catch(error => {
                state.isFetchingPage = false;
                console.error('[TorrentKitty] 加载下一页失败:', error);
                this.showStatusBanner(`加载第 ${pageNum} 页失败，将在 3 秒后重试...`);
                setTimeout(() => {
                    state.fetchPageNum--; // 回退以便重试
                    this.checkPaginationAndDispatch();
                }, 3000);
            });
        },

        /**
         * 初始化
         */
        init() {
            // 注入全局CSS样式
            StyleUtils.injectGlobalStyles();

            // 加载设置
            SettingsManager.load();

            // 初始化缓存 (从 GM 存储加载)
            CacheManager.init();

            // 初始化页码记录
            state.currentPageNum = this.getCurrentPageNum();
            state.fetchPageNum = state.currentPageNum;

            // 输出版本信息
            console.log(
                `%c [TK_ENHANCED] %c VER_${VERSION} %c SYSTEM_ONLINE `,
                'background: #ec4899; color: #fff; font-weight: bold; border-radius: 4px 0 0 4px; padding: 2px 0;',
                'background: #0f172a; color: #06b6d4; border: 1px solid #06b6d4; border-left: none; border-right: none; padding: 1px 4px; font-family: monospace;',
                'background: #06b6d4; color: #fff; font-weight: bold; border-radius: 0 4px 4px 0; padding: 2px 0; text-shadow: 0 0 5px rgba(255,255,255,0.5);'
            );

            // 页面加载完成后执行（保存引用以便 cleanup 时移除）
            state.loadHandler = () => {
                ExclusionManager.init();
                this.processRows();
                ButtonFactory.createSettingsButton();
            };
            window.addEventListener('load', state.loadHandler);

            // 使用 MutationObserver 监听 DOM 变化（替代 setInterval 轮询）
            let debounceTimer = null;
            state.observer = new MutationObserver((mutations) => {
                // 过滤掉脚本自身的 DOM 修改，避免死循环 (修复 #7 - 补全状态横幅、排除面板和页码标记的拦截)
                const hasRelevantChanges = mutations.some(m =>
                    !m.target.closest?.('.javdb-cover-container') &&
                    !m.target.closest?.('.javdb-btn') &&
                    !m.target.closest?.('.missav-btn') &&
                    !m.target.closest?.('.tk-settings-fab') &&
                    !m.target.closest?.('#tk-status-banner') &&
                    !m.target.closest?.('#tk-exclusion-panel') &&
                    !m.target.closest?.('.tk-page-marker') &&
                    !m.target.classList?.contains('tk-styled')
                );
                if (hasRelevantChanges) {
                    // 防抖：300ms 内多次 DOM 变化只触发一次处理
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => this.processRows(), 300);
                }
            });

            // 等待 body 存在后开始观察
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

        /**
         * 清理（可选，用于脚本卸载）
         */
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

    // ==================== 启动 ====================
    App.init();

    // 页面卸载时自动清理
    window.addEventListener('beforeunload', () => App.cleanup());

})();