// ==UserScript==
// @name         TorrentKitty to MissAV & JavDB with Cover + Settings
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  TorrentKitty 增强：统一按钮风格、封面展示、可调节尺寸设置
// @author       Gemini
// @match        *://www.torrentkitty.tv/*
// @match        *://torrentkitty.tv/*
// @updateURL    https://github.com/wangxiangg1/my-youhou-js/raw/refs/heads/main/torrentkitty.user.js
// @downloadURL  https://github.com/wangxiangg1/my-youhou-js/raw/refs/heads/main/torrentkitty.user.js
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
        // 请求队列配置
        queue: {
            delay: 500,           // 请求间隔(ms)
            maxConcurrent: 1      // 最大并发数
        },
        // 轮询间隔
        pollInterval: 2000,
        // 正则表达式
        codeRegex: /([a-zA-Z]{2,5}-\d{3,5})/i,
        // 存储键名
        storageKey: 'torrentkitty_settings'
    };

    // ==================== 颜色主题 ====================
    const COLORS = {
        // 主要操作按钮
        primary: { bg: '#3b5998', border: '#2d4373', hover: '#4a6fb8' },      // JavDB
        success: { bg: '#4CAF50', border: '#388E3C', hover: '#66BB6A' },      // 保存/打开
        warning: { bg: '#ff9800', border: '#f57c00', hover: '#ffb74d' },      // 重置
        danger: { bg: '#FF5722', border: '#D84315', hover: '#ff7043' },       // 下载
        info: { bg: '#2196F3', border: '#1976D2', hover: '#42a5f5' },         // 详情
        pink: { bg: '#d81b60', border: '#ad1457', hover: '#c2185b' },         // MissAV
        neutral: { bg: '#666', border: '#444', hover: '#888' },               // 加载中/取消
        // 错误提示
        error: { bg: '#ffebee', border: '#f44336', text: '#c62828' },
        noResult: { bg: '#fff3e0', border: '#ff9800', text: '#e65100' },
        // 设置按钮渐变
        settingsGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    };

    // ==================== 样式工具函数 ====================
    const StyleUtils = {
        /**
         * 生成按钮基础样式
         */
        buttonBase(color, options = {}) {
            const {
                padding = '3px 10px',
                fontSize = '11px',
                margin = '0 3px',
                display = 'inline-block'
            } = options;

            return `
                display: ${display};
                padding: ${padding};
                background-color: ${color.bg};
                color: #fff;
                border-radius: 3px;
                text-decoration: none;
                font-size: ${fontSize};
                font-family: Arial, sans-serif;
                border: 1px solid ${color.border};
                cursor: pointer;
                margin: ${margin};
                transition: background-color 0.2s;
            `;
        },

        /**
         * 生成模态框遮罩层样式
         */
        overlay() {
            return `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                z-index: 99999;
                display: flex;
                justify-content: center;
                align-items: center;
            `;
        },

        /**
         * 生成模态框面板样式
         */
        modal(options = {}) {
            const {
                maxWidth = '700px',
                padding = '25px',
                maxHeight = '80vh'
            } = options;

            return `
                background: white;
                padding: ${padding};
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                max-width: ${maxWidth};
                width: 90%;
                max-height: ${maxHeight};
                overflow: auto;
            `;
        },

        /**
         * 生成错误/提示框样式
         */
        infoBox(color, maxWidth) {
            return `
                padding: 10px;
                background-color: ${color.bg};
                border: 1px solid ${color.border};
                border-radius: 4px;
                color: ${color.text};
                font-size: 12px;
                cursor: pointer;
                margin-top: 5px;
                max-width: ${maxWidth}px;
            `;
        },

        /**
         * 生成封面图片样式
         */
        coverImage(width, height) {
            return `
                max-width: ${width}px;
                max-height: ${height}px;
                border-radius: 4px;
                margin-top: 5px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                cursor: pointer;
                transition: transform 0.2s;
            `;
        }
    };

    // ==================== 状态管理 ====================
    const state = {
        javdbCache: {},
        requestQueue: [],
        isProcessing: false,
        settings: { ...CONFIG.defaults },
        intervalId: null
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

    // ==================== 请求队列管理 ====================
    const QueueManager = {
        add(task) {
            state.requestQueue.push(task);
            this.process();
        },

        async process() {
            if (state.isProcessing || state.requestQueue.length === 0) return;

            state.isProcessing = true;
            const task = state.requestQueue.shift();

            try {
                await JavDBService.fetchInfo(task.code, task.row);
            } catch (e) {
                console.error('[TorrentKitty] 队列处理错误:', e);
            }

            setTimeout(() => {
                state.isProcessing = false;
                this.process();
            }, CONFIG.queue.delay);
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
            if (state.javdbCache[code]) {
                UIUpdater.updateRow(row, code, state.javdbCache[code].debugInfo);
                return;
            }

            try {
                const searchUrl = `https://javdb.com/search?q=${encodeURIComponent(code)}&f=all`;
                debugInfo.fetchUrl = searchUrl;

                const response = await fetch(searchUrl);
                debugInfo.fetchStatus = `HTTP ${response.status} ${response.statusText}`;

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await response.text();
                const result = this.parseSearchResult(html);

                if (result) {
                    debugInfo.foundResult = true;
                    debugInfo.javdbUrl = result.url;
                    debugInfo.coverId = result.coverId;
                    debugInfo.coverUrl = this.getCoverUrl(result.coverId);

                    state.javdbCache[code] = { ...result, debugInfo };
                } else {
                    debugInfo.errorMessage = '搜索结果为空或未找到匹配项';
                    state.javdbCache[code] = { url: null, coverId: null, debugInfo };
                }
            } catch (error) {
                debugInfo.errorMessage = error.message || String(error);
                console.error('[TorrentKitty] JavDB 请求错误:', error);
                state.javdbCache[code] = { url: null, coverId: null, debugInfo };
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
            const cache = state.javdbCache[code];
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
                btn.innerText = 'JavDB';
                btn.style.backgroundColor = COLORS.primary.bg;
            } else {
                btn.innerText = '无结果';
                btn.style.backgroundColor = COLORS.neutral.bg;
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
            img.className = 'javdb-cover-img';
            img.style.cssText = StyleUtils.coverImage(
                state.settings.coverWidth,
                state.settings.coverHeight
            );

            // 悬停效果
            img.onmouseover = () => img.style.transform = 'scale(1.05)';
            img.onmouseout = () => img.style.transform = 'scale(1)';

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
            errorDiv.style.cssText = StyleUtils.infoBox(COLORS.error, state.settings.coverWidth);
            errorDiv.innerHTML = '⚠️ 封面加载失败<br><small>点击查看 Debug 信息</small>';
            errorDiv.onclick = () => ModalManager.showDebugInfo(debugInfo);
            container.appendChild(errorDiv);
        },

        /**
         * 显示无结果消息
         */
        showNoResultMessage(container, debugInfo) {
            container.innerHTML = '';
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = StyleUtils.infoBox(COLORS.noResult, state.settings.coverWidth);
            infoDiv.innerHTML = 'ℹ️ 未找到封面信息<br><small>点击查看 Debug 信息</small>';
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
            btn.style.cssText = StyleUtils.buttonBase(color, {
                padding: '8px 20px',
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
            modal.style.cssText = StyleUtils.modal();

            // 标题
            const title = document.createElement('h3');
            title.innerText = '🔍 Debug 信息';
            title.style.cssText = 'margin: 0 0 15px 0; color: #333; font-size: 18px;';

            // 文本框
            const textarea = document.createElement('textarea');
            textarea.value = info;
            textarea.readOnly = true;
            textarea.style.cssText = `
                width: 100%;
                height: 450px;
                font-family: 'Courier New', monospace;
                font-size: 13px;
                padding: 12px;
                border: 1px solid #ccc;
                border-radius: 4px;
                resize: vertical;
                box-sizing: border-box;
            `;

            // 按钮容器
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'margin-top: 15px; display: flex; gap: 10px; justify-content: flex-end;';

            buttonContainer.appendChild(
                this.createButton('全选', COLORS.success, () => {
                    textarea.select();
                    textarea.setSelectionRange(0, textarea.value.length);
                })
            );

            const closeBtn = this.createButton('关闭', COLORS.primary, null);
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
            return `=== JavDB 封面加载 Debug 信息 ===

【番号】${debugInfo.code}
【时间】${debugInfo.timestamp}

【搜索请求】
  URL: ${debugInfo.fetchUrl}
  状态: ${debugInfo.fetchStatus}

【搜索结果】
  找到结果: ${debugInfo.foundResult ? '是' : '否'}
  JavDB 页面: ${debugInfo.javdbUrl || '无'}
  封面 ID: ${debugInfo.coverId || '无'}

【封面图片】
  URL: ${debugInfo.coverUrl || '无'}
  加载成功: ${debugInfo.imageLoadSuccess !== undefined ? (debugInfo.imageLoadSuccess ? '是' : '否') : '未尝试'}
  图片尺寸: ${debugInfo.imageSize || '未知'}
  图片错误: ${debugInfo.imageError || '无'}

【错误信息】
  ${debugInfo.errorMessage || '无'}

=================================
提示：可以全选复制此文本框内容进行反馈`;
        },

        /**
         * 显示设置面板
         */
        showSettings() {
            const panel = document.createElement('div');
            panel.style.cssText = StyleUtils.modal({ maxWidth: '450px', padding: '30px' });

            panel.innerHTML = `
                <h2 style="margin: 0 0 20px 0; color: #333; font-size: 20px;">
                    ⚙️ 封面尺寸设置
                </h2>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: #555; font-size: 14px;">
                        宽度：<span id="width-value">${state.settings.coverWidth}</span>px
                    </label>
                    <input type="range" id="width-slider" min="100" max="800" 
                           value="${state.settings.coverWidth}" style="width: 100%; cursor: pointer;">
                </div>

                <div style="margin-bottom: 25px;">
                    <label style="display: block; margin-bottom: 8px; color: #555; font-size: 14px;">
                        高度：<span id="height-value">${state.settings.coverHeight}</span>px
                    </label>
                    <input type="range" id="height-slider" min="100" max="600" 
                           value="${state.settings.coverHeight}" style="width: 100%; cursor: pointer;">
                </div>

                <div id="settings-buttons" style="display: flex; gap: 10px; justify-content: flex-end;"></div>
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
                this.createButton('重置默认', COLORS.warning, () => {
                    widthSlider.value = CONFIG.defaults.coverWidth;
                    heightSlider.value = CONFIG.defaults.coverHeight;
                    widthValue.textContent = CONFIG.defaults.coverWidth;
                    heightValue.textContent = CONFIG.defaults.coverHeight;
                })
            );

            // 保存按钮
            buttonsContainer.appendChild(
                this.createButton('保存', COLORS.success, () => {
                    state.settings.coverWidth = parseInt(widthSlider.value);
                    state.settings.coverHeight = parseInt(heightSlider.value);
                    SettingsManager.save();
                    UIUpdater.updateAllCovers();
                    overlay.remove();
                })
            );

            // 取消按钮
            buttonsContainer.appendChild(
                this.createButton('取消', COLORS.neutral, () => overlay.remove())
            );
        }
    };

    // ==================== 按钮工厂 ====================
    const ButtonFactory = {
        /**
         * 创建带悬停效果的链接按钮
         */
        createLinkButton(text, href, color, className) {
            const btn = document.createElement('a');
            btn.href = href;
            btn.target = '_blank';
            btn.innerText = text;
            btn.className = className;
            btn.style.cssText = StyleUtils.buttonBase(color, { margin: '0 0 0 6px' });

            btn.onmouseover = () => btn.style.backgroundColor = color.hover;
            btn.onmouseout = () => btn.style.backgroundColor = color.bg;

            return btn;
        },

        /**
         * 创建设置悬浮按钮
         */
        createSettingsButton() {
            const btn = document.createElement('div');
            btn.innerHTML = '⚙️';
            btn.style.cssText = `
                position: fixed;
                bottom: 30px;
                right: 30px;
                width: 50px;
                height: 50px;
                background: ${COLORS.settingsGradient};
                color: white;
                border-radius: 50%;
                display: flex;
                justify-content: center;
                align-items: center;
                cursor: pointer;
                font-size: 24px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                z-index: 9999;
                transition: all 0.3s;
            `;

            btn.onmouseover = () => btn.style.transform = 'scale(1.1) rotate(90deg)';
            btn.onmouseout = () => btn.style.transform = 'scale(1) rotate(0deg)';
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
                    const code = match[1].toUpperCase();
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
                '加载中...',
                '#',
                COLORS.neutral,
                'javdb-btn'
            );
            parent.insertBefore(javdbBtn, missavBtn.nextSibling);

            // 创建封面容器
            const coverContainer = document.createElement('div');
            coverContainer.className = 'javdb-cover-container';
            coverContainer.style.cssText = 'margin-top: 5px; font-size: 10px; color: #999;';
            coverContainer.innerText = '封面加载中...';
            parent.appendChild(coverContainer);

            // 加入请求队列
            QueueManager.add({ code, row });
        },

        /**
         * 初始化
         */
        init() {
            // 加载设置
            SettingsManager.load();

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
