// ==UserScript==
// @name         TorrentKitty to MissAV & JavDB with Cover + Settings
// @namespace    http://tampermonkey.net/
// @version      2.8
// @description  TorrentKitty 增强：现代化UI、封面展示、智能速率限制、localStorage持久化缓存
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
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

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
        // 轮询间隔
        pollInterval: 10000,
        // 正则表达式 - 支持多种番号格式
        // 格式1: ABC-123 (带连字符)
        // 格式2: ABC123 (不带连字符)
        codeRegex: /([a-zA-Z]{2,6}-?\d{3,5})/i,
        // 存储键名
        storageKey: 'torrentkitty_settings'
    };

    // ==================== 现代化颜色主题 ====================
    const COLORS = {
        // 主题色 - 使用高级渐变色系
        primary: {
            bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            bgSolid: '#667eea',
            border: 'rgba(102, 126, 234, 0.3)',
            hover: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
            shadow: 'rgba(102, 126, 234, 0.4)'
        },
        success: {
            bg: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
            bgSolid: '#11998e',
            border: 'rgba(17, 153, 142, 0.3)',
            hover: 'linear-gradient(135deg, #38ef7d 0%, #11998e 100%)',
            shadow: 'rgba(56, 239, 125, 0.4)'
        },
        warning: {
            bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            bgSolid: '#f093fb',
            border: 'rgba(240, 147, 251, 0.3)',
            hover: 'linear-gradient(135deg, #f5576c 0%, #f093fb 100%)',
            shadow: 'rgba(245, 87, 108, 0.4)'
        },
        danger: {
            bg: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
            bgSolid: '#ff416c',
            border: 'rgba(255, 65, 108, 0.3)',
            hover: 'linear-gradient(135deg, #ff4b2b 0%, #ff416c 100%)',
            shadow: 'rgba(255, 75, 43, 0.4)'
        },
        info: {
            bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            bgSolid: '#4facfe',
            border: 'rgba(79, 172, 254, 0.3)',
            hover: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
            shadow: 'rgba(0, 242, 254, 0.4)'
        },
        pink: {
            bg: 'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)',
            bgSolid: '#f857a6',
            border: 'rgba(248, 87, 166, 0.3)',
            hover: 'linear-gradient(135deg, #ff5858 0%, #f857a6 100%)',
            shadow: 'rgba(255, 88, 88, 0.4)'
        },
        neutral: {
            bg: 'linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)',
            bgSolid: '#7f8c8d',
            border: 'rgba(127, 140, 141, 0.3)',
            hover: 'linear-gradient(135deg, #2c3e50 0%, #bdc3c7 100%)',
            shadow: 'rgba(44, 62, 80, 0.4)'
        },

        // 错误/提示框 - 玻璃拟态风格
        error: {
            bg: 'rgba(255, 82, 82, 0.1)',
            border: 'rgba(255, 82, 82, 0.4)',
            text: '#ff5252',
            backdrop: 'blur(10px)'
        },
        noResult: {
            bg: 'rgba(255, 193, 7, 0.1)',
            border: 'rgba(255, 193, 7, 0.4)',
            text: '#ffc107',
            backdrop: 'blur(10px)'
        },

        // 设置按钮 - 流光渐变
        settingsGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f857a6 100%)',

        // 玻璃效果
        glass: {
            bg: 'rgba(255, 255, 255, 0.1)',
            border: 'rgba(255, 255, 255, 0.2)',
            blur: '20px'
        },

        // 深色模式基础
        dark: {
            bg: 'rgba(15, 23, 42, 0.95)',
            card: 'rgba(30, 41, 59, 0.9)',
            text: '#f1f5f9',
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
         * 注入全局CSS动画
         */
        injectGlobalStyles() {
            if (document.getElementById('tk-enhanced-styles')) return;

            const style = document.createElement('style');
            style.id = 'tk-enhanced-styles';
            style.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                @keyframes slideIn {
                    from { 
                        opacity: 0; 
                        transform: translateY(-20px) scale(0.95); 
                    }
                    to { 
                        opacity: 1; 
                        transform: translateY(0) scale(1); 
                    }
                }
                
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                
                @keyframes shimmer {
                    0% { background-position: -200% center; }
                    100% { background-position: 200% center; }
                }
                
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-5px); }
                }
                
                @keyframes glow {
                    0%, 100% { box-shadow: 0 0 20px rgba(102, 126, 234, 0.4); }
                    50% { box-shadow: 0 0 30px rgba(248, 87, 166, 0.6); }
                }
                
                .tk-btn-hover:hover {
                    transform: translateY(-2px) scale(1.02);
                    filter: brightness(1.1);
                }
                
                .tk-btn-hover:active {
                    transform: translateY(0) scale(0.98);
                }
                
                .tk-cover-hover:hover {
                    transform: translateY(-8px) scale(1.03) rotate(1deg);
                    box-shadow: 0 20px 60px rgba(0,0,0,0.4),
                                0 8px 20px rgba(0,0,0,0.2);
                }
                
                .tk-info-hover:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 16px -2px rgba(0, 0, 0, 0.15);
                }
                
                .tk-settings-fab {
                    animation: float 3s ease-in-out infinite, glow 2s ease-in-out infinite;
                }
                
                .tk-settings-fab:hover {
                    animation: none;
                    transform: scale(1.15) rotate(180deg) !important;
                }
                
                /* 滚动条美化 */
                .tk-modal-scroll::-webkit-scrollbar {
                    width: 8px;
                }
                
                .tk-modal-scroll::-webkit-scrollbar-track {
                    background: rgba(0,0,0,0.05);
                    border-radius: 4px;
                }
                
                .tk-modal-scroll::-webkit-scrollbar-thumb {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    border-radius: 4px;
                }
                
                .tk-modal-scroll::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(135deg, #764ba2, #667eea);
                }
                
                /* 输入框聚焦效果 */
                .tk-input-modern:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
                }
                
                /* 滑块美化 */
                .tk-slider {
                    -webkit-appearance: none;
                    width: 100%;
                    height: 8px;
                    border-radius: 4px;
                    background: linear-gradient(90deg, #667eea, #764ba2);
                    outline: none;
                    cursor: pointer;
                }
                
                .tk-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: white;
                    border: 2px solid #667eea;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .tk-slider::-webkit-slider-thumb:hover {
                    transform: scale(1.2);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
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
        settings: { ...CONFIG.defaults },
        intervalId: null,
        // 速率限制追踪
        requestTimestamps: [],  // 记录最近的请求时间戳
        currentBackoff: 0,      // 当前退避时间
        consecutiveErrors: 0    // 连续错误计数
    };

    // ==================== 设置管理 ====================
    const SettingsManager = {
        load() {
            const saved = localStorage.getItem(CONFIG.storageKey);
            if (saved) {
                try {
                    state.settings = { ...CONFIG.defaults, ...JSON.parse(saved) };
                } catch (e) {
                    console.error('[TorrentKitty] 加载设置失败:', e);
                }
            }
        },

        save() {
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.settings));
        },

        reset() {
            state.settings = { ...CONFIG.defaults };
            this.save();
        }
    };

    // ==================== 缓存管理器 ====================
    // 实现 LRU 缓存，使用 localStorage 持久化存储
    // 限制最大条数为 CONFIG.cache.maxSize (默认80条)
    const CacheManager = {
        // 存储键名
        STORAGE_KEY: 'tk_javdb_cache',
        ORDER_KEY: 'tk_cache_order',
        // 缓存过期时间 (24小时)
        EXPIRY_TIME: 24 * 60 * 60 * 1000,

        /**
         * 初始化 - 从 localStorage 加载缓存
         */
        init() {
            try {
                // 加载缓存顺序
                const orderData = localStorage.getItem(this.ORDER_KEY);
                if (orderData) {
                    const parsed = JSON.parse(orderData);
                    // 过滤掉过期的
                    const now = Date.now();
                    state.cacheOrder = parsed.filter(item => {
                        if (now - item.timestamp < this.EXPIRY_TIME) {
                            return true;
                        }
                        // 过期的也从缓存中删除
                        localStorage.removeItem(this.STORAGE_KEY + '_' + item.code);
                        return false;
                    });
                } else {
                    state.cacheOrder = [];
                }

                // 加载缓存数据到内存
                state.cacheOrder.forEach(item => {
                    const cached = localStorage.getItem(this.STORAGE_KEY + '_' + item.code);
                    if (cached) {
                        try {
                            state.javdbCache[item.code] = JSON.parse(cached);
                        } catch (e) {
                            // 解析失败则删除
                            localStorage.removeItem(this.STORAGE_KEY + '_' + item.code);
                        }
                    }
                });

                console.log(`[TorrentKitty] 从 localStorage 加载了 ${state.cacheOrder.length} 条缓存`);
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
                this._updateOrder(code);
                return state.javdbCache[code];
            }

            // 再从 localStorage 获取
            try {
                const cached = localStorage.getItem(this.STORAGE_KEY + '_' + code);
                if (cached) {
                    const data = JSON.parse(cached);
                    // 写入内存
                    state.javdbCache[code] = data;
                    this._updateOrder(code);
                    console.log(`[TorrentKitty] 从 localStorage 恢复缓存: ${code}`);
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

            // 写入 localStorage
            try {
                localStorage.setItem(this.STORAGE_KEY + '_' + code, JSON.stringify(data));
            } catch (e) {
                console.error('[TorrentKitty] 缓存写入失败:', e);
                // 如果存储满了，清理一些旧的
                if (e.name === 'QuotaExceededError') {
                    this._clearOldest(10);
                    try {
                        localStorage.setItem(this.STORAGE_KEY + '_' + code, JSON.stringify(data));
                    } catch (e2) {
                        console.error('[TorrentKitty] 重试写入仍失败:', e2);
                    }
                }
            }

            // 更新访问顺序
            this._updateOrder(code);

            // 持久化顺序
            this._persistOrder();

            console.log(`[TorrentKitty] 缓存更新: ${code} (当前缓存: ${state.cacheOrder.length}/${CONFIG.cache.maxSize})`);
        },

        /**
         * 更新访问顺序
         */
        _updateOrder(code) {
            const now = Date.now();
            // 移除旧位置
            state.cacheOrder = state.cacheOrder.filter(item => item.code !== code);
            // 添加到末尾 (最近访问)
            state.cacheOrder.push({ code, timestamp: now });
        },

        /**
         * 持久化顺序到 localStorage
         */
        _persistOrder() {
            try {
                localStorage.setItem(this.ORDER_KEY, JSON.stringify(state.cacheOrder));
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
                    // 从 localStorage 删除
                    localStorage.removeItem(this.STORAGE_KEY + '_' + oldest.code);
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
            if (state.isProcessing || state.requestQueue.length === 0) return;

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

                const response = await fetch(searchUrl);
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
                CacheManager.set(code, { url: null, coverId: null, debugInfo });

                // 仅对速率限制相关错误重新抛出，触发退避机制
                if (['RATE_LIMITED', 'IP_BANNED', 'CAPTCHA_DETECTED'].includes(error.message)) {
                    throw error;
                }
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
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            const firstResult = tempDiv.querySelector('.movie-list a.box');
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

            // 更新封面
            this.updateCover(coverContainer, coverId, debugInfo);
        },

        /**
         * 更新 JavDB 按钮状态
         */
        updateJavDBButton(btn, url) {
            if (!btn) return;

            if (url) {
                btn.href = url;
                btn.innerText = '🎬 JavDB';
                btn.style.background = COLORS.primary.bg;
                btn.style.boxShadow = `0 4px 15px ${COLORS.primary.shadow}`;
            } else {
                btn.innerText = '❌ 无结果';
                btn.style.background = COLORS.neutral.bg;
                btn.style.boxShadow = `0 4px 15px ${COLORS.neutral.shadow}`;
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
                this.showNoResultMessage(container, debugInfo);
            }
        },

        /**
         * 显示封面图片
         */
        showCoverImage(container, coverId, debugInfo) {
            const coverUrl = JavDBService.getCoverUrl(coverId);
            const img = document.createElement('img');

            img.src = coverUrl;
            img.className = 'javdb-cover-img tk-cover-hover';
            img.style.cssText = StyleUtils.coverImage(
                state.settings.coverWidth,
                state.settings.coverHeight
            );

            // 加载成功
            img.onload = () => {
                debugInfo.imageLoadSuccess = true;
                debugInfo.imageSize = `${img.naturalWidth}x${img.naturalHeight}`;
                container.dataset.debugInfo = JSON.stringify(debugInfo);
            };

            // 加载失败
            img.onerror = () => {
                debugInfo.imageLoadSuccess = false;
                debugInfo.imageError = '图片 HTTP 请求失败（404 或网络错误）';
                container.dataset.debugInfo = JSON.stringify(debugInfo);
                this.showErrorMessage(container, debugInfo);
            };

            container.innerHTML = '';
            container.appendChild(img);

            // 点击查看调试信息
            img.onclick = () => ModalManager.showDebugInfo(debugInfo);
        },

        /**
         * 显示错误消息
         */
        showErrorMessage(container, debugInfo) {
            container.innerHTML = '';
            const errorDiv = document.createElement('div');
            errorDiv.className = 'tk-info-hover';
            errorDiv.style.cssText = StyleUtils.infoBox(COLORS.error, state.settings.coverWidth);
            errorDiv.innerHTML = '⚠️ 封面加载失败<br><small style="opacity: 0.8;">点击查看 Debug 信息</small>';
            errorDiv.onclick = () => ModalManager.showDebugInfo(debugInfo);
            container.appendChild(errorDiv);
        },

        /**
         * 显示无结果消息
         */
        showNoResultMessage(container, debugInfo) {
            container.innerHTML = '';
            const infoDiv = document.createElement('div');
            infoDiv.className = 'tk-info-hover';
            infoDiv.style.cssText = StyleUtils.infoBox(COLORS.noResult, state.settings.coverWidth);
            infoDiv.innerHTML = 'ℹ️ 未找到封面信息<br><small style="opacity: 0.8;">点击查看 Debug 信息</small>';
            infoDiv.onclick = () => ModalManager.showDebugInfo(debugInfo);
            container.appendChild(infoDiv);
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
            modal.style.cssText = StyleUtils.modal();

            // 标题 - 渐变效果
            const title = document.createElement('h3');
            title.innerHTML = '🔍 <span style="background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Debug 信息</span>';
            title.style.cssText = `
                margin: 0 0 20px 0; 
                color: #1e293b; 
                font-size: 22px;
                font-weight: 700;
                font-family: 'Inter', 'Segoe UI', -apple-system, sans-serif;
                display: flex;
                align-items: center;
                gap: 8px;
            `;

            // 文本框 - 现代化样式
            const textarea = document.createElement('textarea');
            textarea.value = info;
            textarea.readOnly = true;
            textarea.className = 'tk-input-modern';
            textarea.style.cssText = `
                width: 100%;
                height: 420px;
                font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
                font-size: 13px;
                line-height: 1.6;
                padding: 16px;
                background: linear-gradient(145deg, #f8fafc, #f1f5f9);
                border: 1px solid rgba(102, 126, 234, 0.2);
                border-radius: 12px;
                resize: vertical;
                box-sizing: border-box;
                color: #334155;
                transition: all 0.3s ease;
            `;

            // 按钮容器
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'margin-top: 20px; display: flex; gap: 12px; justify-content: flex-end;';

            buttonContainer.appendChild(
                this.createButton('📋 全选', COLORS.success, () => {
                    textarea.select();
                    textarea.setSelectionRange(0, textarea.value.length);
                })
            );

            const closeBtn = this.createButton('✕ 关闭', COLORS.primary, null);
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
            return `╔══════════════════════════════════════════════════════╗
║         JavDB 封面加载 Debug 信息                    ║
╚══════════════════════════════════════════════════════╝

┌─── 📋 基本信息 ───────────────────────────────────────
│ 番号: ${debugInfo.code}
│ 时间: ${debugInfo.timestamp}
└───────────────────────────────────────────────────────

┌─── 🔍 搜索请求 ───────────────────────────────────────
│ URL: ${debugInfo.fetchUrl}
│ 状态: ${debugInfo.fetchStatus}
└───────────────────────────────────────────────────────

┌─── 📊 搜索结果 ───────────────────────────────────────
│ 找到结果: ${debugInfo.foundResult ? '✅ 是' : '❌ 否'}
│ JavDB 页面: ${debugInfo.javdbUrl || '无'}
│ 封面 ID: ${debugInfo.coverId || '无'}
└───────────────────────────────────────────────────────

┌─── 🖼️ 封面图片 ───────────────────────────────────────
│ URL: ${debugInfo.coverUrl || '无'}
│ 加载成功: ${debugInfo.imageLoadSuccess !== undefined ? (debugInfo.imageLoadSuccess ? '✅ 是' : '❌ 否') : '⏳ 未尝试'}
│ 图片尺寸: ${debugInfo.imageSize || '未知'}
│ 图片错误: ${debugInfo.imageError || '无'}
└───────────────────────────────────────────────────────

┌─── ⚠️ 错误信息 ───────────────────────────────────────
│ ${debugInfo.errorMessage || '无'}
└───────────────────────────────────────────────────────

💡 提示：可以全选复制此文本框内容进行反馈`;
        },

        /**
         * 显示设置面板
         */
        showSettings() {
            const panel = document.createElement('div');
            panel.className = 'tk-modal-scroll';
            panel.style.cssText = StyleUtils.modal({ maxWidth: '480px', padding: '36px' });

            panel.innerHTML = `
                <h2 style="
                    margin: 0 0 28px 0; 
                    font-size: 24px;
                    font-weight: 700;
                    font-family: 'Inter', 'Segoe UI', -apple-system, sans-serif;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                ">
                    <span style="font-size: 28px;">⚙️</span>
                    <span style="background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">封面尺寸设置</span>
                </h2>

                <div style="
                    background: linear-gradient(145deg, #f8fafc, #f1f5f9);
                    border-radius: 16px;
                    padding: 24px;
                    margin-bottom: 24px;
                    border: 1px solid rgba(102, 126, 234, 0.1);
                ">
                    <div style="margin-bottom: 28px;">
                        <label style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 12px; 
                            color: #475569; 
                            font-size: 15px;
                            font-weight: 600;
                            font-family: 'Inter', 'Segoe UI', -apple-system, sans-serif;
                        ">
                            <span>📐 宽度</span>
                            <span style="
                                background: linear-gradient(135deg, #667eea, #764ba2);
                                color: white;
                                padding: 4px 12px;
                                border-radius: 20px;
                                font-size: 13px;
                                font-weight: 700;
                            "><span id="width-value">${state.settings.coverWidth}</span>px</span>
                        </label>
                        <input type="range" id="width-slider" class="tk-slider" min="100" max="800" 
                               value="${state.settings.coverWidth}">
                    </div>

                    <div>
                        <label style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 12px; 
                            color: #475569; 
                            font-size: 15px;
                            font-weight: 600;
                            font-family: 'Inter', 'Segoe UI', -apple-system, sans-serif;
                        ">
                            <span>📏 高度</span>
                            <span style="
                                background: linear-gradient(135deg, #667eea, #764ba2);
                                color: white;
                                padding: 4px 12px;
                                border-radius: 20px;
                                font-size: 13px;
                                font-weight: 700;
                            "><span id="height-value">${state.settings.coverHeight}</span>px</span>
                        </label>
                        <input type="range" id="height-slider" class="tk-slider" min="100" max="600" 
                               value="${state.settings.coverHeight}">
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

            // 滑块事件
            widthSlider.oninput = () => widthValue.textContent = widthSlider.value;
            heightSlider.oninput = () => heightValue.textContent = heightSlider.value;

            // 重置按钮
            buttonsContainer.appendChild(
                this.createButton('🔄 重置', COLORS.warning, () => {
                    widthSlider.value = CONFIG.defaults.coverWidth;
                    heightSlider.value = CONFIG.defaults.coverHeight;
                    widthValue.textContent = CONFIG.defaults.coverWidth;
                    heightValue.textContent = CONFIG.defaults.coverHeight;
                })
            );

            // 保存按钮
            buttonsContainer.appendChild(
                this.createButton('✓ 保存', COLORS.success, () => {
                    state.settings.coverWidth = parseInt(widthSlider.value);
                    state.settings.coverHeight = parseInt(heightSlider.value);
                    SettingsManager.save();
                    UIUpdater.updateAllCovers();
                    overlay.remove();
                })
            );

            // 取消按钮
            buttonsContainer.appendChild(
                this.createButton('✕ 取消', COLORS.neutral, () => overlay.remove())
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
                z-index: 9999;
                transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                border: 2px solid rgba(255,255,255,0.2);
            `;

            btn.onclick = () => ModalManager.showSettings();

            document.body.appendChild(btn);
        }
    };

    // ==================== 原站按钮美化 ====================
    const OriginalButtonStyler = {
        // 按钮类型映射
        buttonTypes: [
            { keywords: ['Detail', '详情'], color: COLORS.info },
            { keywords: ['Open', '打开'], color: COLORS.success },
            { keywords: ['Download', '下载'], color: COLORS.danger }
        ],

        /**
         * 美化原站按钮
         */
        style() {
            const buttons = document.querySelectorAll('a, input[type="button"], input[type="submit"]');

            buttons.forEach(btn => {
                const text = btn.innerText || btn.value || '';

                for (const type of this.buttonTypes) {
                    if (type.keywords.some(keyword => text.includes(keyword))) {
                        btn.style.cssText = StyleUtils.buttonBase(type.color);
                        break;
                    }
                }
            });
        }
    };

    // ==================== 主逻辑 ====================
    const App = {
        /**
         * 处理表格行
         */
        processRows() {
            const rows = document.querySelectorAll('tr');

            rows.forEach(row => {
                // 跳过已处理的行
                if (row.querySelector('.missav-btn, .javdb-btn')) return;

                const rowText = row.innerText;
                const match = rowText.match(CONFIG.codeRegex);

                if (match) {
                    // 格式化番号：将 CLA314 转换为 CLA-314
                    let code = match[1].toUpperCase();
                    if (!code.includes('-')) {
                        // 找到字母和数字的分界点，插入连字符
                        code = code.replace(/([A-Z]+)(\d+)/, '$1-$2');
                    }
                    this.enhanceRow(row, code);
                }
            });

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
                'MissAV',
                `https://missav.ws/cn/${code}`,
                COLORS.pink,
                'missav-btn'
            );
            parent.insertBefore(missavBtn, targetBtn.nextSibling);

            // 创建 JavDB 按钮
            const javdbBtn = ButtonFactory.createLinkButton(
                '⏳ 加载中',
                '#',
                COLORS.neutral,
                'javdb-btn'
            );
            parent.insertBefore(javdbBtn, missavBtn.nextSibling);

            // 创建封面容器
            const coverContainer = document.createElement('div');
            coverContainer.className = 'javdb-cover-container';
            coverContainer.style.cssText = `
                margin-top: 10px; 
                font-size: 13px; 
                color: #64748b;
                font-family: 'Inter', 'Segoe UI', -apple-system, sans-serif;
                padding: 12px 16px;
                background: linear-gradient(145deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.05));
                border-radius: 10px;
                border: 1px solid rgba(102, 126, 234, 0.15);
                display: inline-block;
            `;
            coverContainer.innerHTML = `
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(102, 126, 234, 0.3); border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></span>
                    <span>封面加载中...</span>
                </span>
            `;
            parent.appendChild(coverContainer);

            // 注入旋转动画（如果未注入）
            if (!document.getElementById('tk-spin-animation')) {
                const spinStyle = document.createElement('style');
                spinStyle.id = 'tk-spin-animation';
                spinStyle.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
                document.head.appendChild(spinStyle);
            }

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
         * 初始化
         */
        init() {
            // 注入全局CSS样式
            StyleUtils.injectGlobalStyles();

            // 加载设置
            SettingsManager.load();

            // 初始化缓存 (从 localStorage 加载)
            CacheManager.init();

            // 输出版本信息
            console.log(
                '%c✨ TorrentKitty Enhanced v2.8 %c已加载',
                'background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 4px 8px; border-radius: 4px 0 0 4px; font-weight: bold;',
                'background: #38ef7d; color: #1e293b; padding: 4px 8px; border-radius: 0 4px 4px 0; font-weight: bold;'
            );

            // 页面加载完成后执行
            window.addEventListener('load', () => {
                this.processRows();
                ButtonFactory.createSettingsButton();
            });

            // 定时轮询（处理动态加载的内容）
            state.intervalId = setInterval(() => {
                this.processRows();
            }, CONFIG.pollInterval);
        },

        /**
         * 清理（可选，用于脚本卸载）
         */
        cleanup() {
            if (state.intervalId) {
                clearInterval(state.intervalId);
                state.intervalId = null;
            }
        }
    };

    // ==================== 启动 ====================
    App.init();

})();