// ==UserScript==
// @name         MissAV 移动端播放器增强
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  移动端视频手势控制：滑动调节进度/音量/亮度、双击快进快退、倍速播放、浮动控制面板
// @author       Gemini
// @match        https://missav.ws/*
// @match        https://missav.com/*
// @match        https://missav.ai/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=missav.ws
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        // 手势灵敏度
        seekSensitivity: 0.3,        // 左右滑动：每像素对应的秒数
        volumeSensitivity: 0.005,    // 上下滑动：每像素对应的音量变化
        brightnessSensitivity: 0.005, // 上下滑动：每像素对应的亮度变化

        // 双击设置
        doubleTapDelay: 300,         // 双击判定时间(ms)
        doubleTapSeek: 10,           // 双击快进/快退秒数

        // 最小滑动距离才触发
        minSwipeDistance: 10,

        // 倍速选项
        speedOptions: [0.5, 0.75, 1, 1.25, 1.5, 2, 3],

        // 控制面板自动隐藏时间
        panelAutoHide: 3000,

        // 提示显示时间
        tipDuration: 800
    };

    // ==================== 状态管理 ====================
    const State = {
        video: null,
        overlay: null,
        controlPanel: null,
        tipElement: null,

        // 手势状态
        isTouching: false,
        startX: 0,
        startY: 0,
        startTime: 0,
        startVolume: 0,
        startBrightness: 1,
        gestureType: null, // 'seek' | 'volume' | 'brightness' | null

        // 双击检测
        lastTapTime: 0,
        lastTapX: 0,

        // 亮度滤镜
        brightnessValue: 1,

        // 面板状态
        panelVisible: false,
        panelTimer: null,

        // 锁定状态
        isLocked: false
    };

    // ==================== 样式注入 ====================
    function injectStyles() {
        if (document.getElementById('mobile-player-styles')) return;

        const style = document.createElement('style');
        style.id = 'mobile-player-styles';
        style.textContent = `
            /* 手势覆盖层 */
            .mp-gesture-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 9999;
                touch-action: none;
                -webkit-touch-callout: none;
                -webkit-user-select: none;
                user-select: none;
            }
            
            /* 提示信息 */
            .mp-tip {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                color: white;
                padding: 12px 24px;
                border-radius: 12px;
                font-size: 18px;
                font-weight: 600;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s ease;
                z-index: 10001;
                text-align: center;
                min-width: 120px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .mp-tip.visible {
                opacity: 1;
            }
            
            .mp-tip-icon {
                font-size: 28px;
                display: block;
                margin-bottom: 6px;
            }
            
            .mp-tip-text {
                font-size: 14px;
                opacity: 0.9;
            }
            
            /* 浮动控制面板 */
            .mp-control-panel {
                position: fixed;
                bottom: 100px;
                right: 10px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                z-index: 10000;
                opacity: 0;
                transform: translateX(60px);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: none;
            }
            
            .mp-control-panel.visible {
                opacity: 1;
                transform: translateX(0);
                pointer-events: auto;
            }
            
            .mp-panel-btn {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: white;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
                -webkit-tap-highlight-color: transparent;
            }
            
            .mp-panel-btn:active {
                transform: scale(0.9);
                background: rgba(255, 255, 255, 0.2);
            }
            
            .mp-panel-btn.active {
                background: rgba(231, 76, 60, 0.8);
                border-color: rgba(231, 76, 60, 0.5);
            }
            
            /* 倍速选择器 */
            .mp-speed-selector {
                position: fixed;
                bottom: 100px;
                left: 50%;
                transform: translateX(-50%) translateY(20px);
                display: flex;
                gap: 8px;
                padding: 12px 16px;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(15px);
                -webkit-backdrop-filter: blur(15px);
                border-radius: 16px;
                z-index: 10002;
                opacity: 0;
                pointer-events: none;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .mp-speed-selector.visible {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
                pointer-events: auto;
            }
            
            .mp-speed-btn {
                padding: 10px 16px;
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                color: white;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                -webkit-tap-highlight-color: transparent;
            }
            
            .mp-speed-btn:active {
                transform: scale(0.95);
            }
            
            .mp-speed-btn.active {
                background: linear-gradient(135deg, #e74c3c, #c0392b);
                box-shadow: 0 2px 10px rgba(231, 76, 60, 0.4);
            }
            
            /* 锁定遮罩 */
            .mp-lock-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10003;
                display: none;
            }
            
            .mp-lock-overlay.visible {
                display: block;
            }
            
            .mp-unlock-btn {
                position: fixed;
                left: 50%;
                bottom: 50px;
                transform: translateX(-50%);
                padding: 12px 32px;
                background: rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(10px);
                border-radius: 25px;
                color: white;
                font-size: 16px;
                font-weight: 600;
                border: 1px solid rgba(255, 255, 255, 0.2);
                z-index: 10004;
                display: none;
            }
            
            .mp-unlock-btn.visible {
                display: block;
            }
            
            /* 进度条增强 - 更大的触摸区域 */
            .mp-progress-touch {
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                height: 40px;
                z-index: 9998;
            }
            
            /* 显示面板的触发按钮 */
            .mp-toggle-btn {
                position: fixed;
                bottom: 50%;
                right: 0;
                width: 24px;
                height: 60px;
                background: rgba(0, 0, 0, 0.4);
                border-radius: 12px 0 0 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 14px;
                z-index: 9999;
                cursor: pointer;
                transition: all 0.2s ease;
                -webkit-tap-highlight-color: transparent;
            }
            
            .mp-toggle-btn:active {
                background: rgba(0, 0, 0, 0.6);
            }
            
            /* 双击区域提示 */
            .mp-tap-effect {
                position: absolute;
                width: 80px;
                height: 80px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                transform: scale(0);
                pointer-events: none;
                z-index: 10000;
            }
            
            .mp-tap-effect.animate {
                animation: tapEffect 0.4s ease-out forwards;
            }
            
            @keyframes tapEffect {
                0% {
                    transform: scale(0);
                    opacity: 1;
                }
                100% {
                    transform: scale(2);
                    opacity: 0;
                }
            }
            
            /* 亮度调节滤镜 */
            .mp-brightness-filter {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: black;
                pointer-events: none;
                z-index: 9997;
                opacity: 0;
                transition: opacity 0.1s ease;
            }
        `;

        document.head.appendChild(style);
    }

    // ==================== 工具函数 ====================
    function formatTime(seconds) {
        const sign = seconds < 0 ? '-' : '+';
        const abs = Math.abs(Math.round(seconds));
        const min = Math.floor(abs / 60);
        const sec = abs % 60;
        return `${sign}${min}:${sec.toString().padStart(2, '0')}`;
    }

    function formatCurrentTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    // ==================== 提示显示 ====================
    function showTip(icon, text, subtext = '') {
        if (!State.tipElement) return;

        State.tipElement.innerHTML = `
            <span class="mp-tip-icon">${icon}</span>
            <div>${text}</div>
            ${subtext ? `<div class="mp-tip-text">${subtext}</div>` : ''}
        `;
        State.tipElement.classList.add('visible');

        clearTimeout(State.tipTimer);
        State.tipTimer = setTimeout(() => {
            State.tipElement.classList.remove('visible');
        }, CONFIG.tipDuration);
    }

    // ==================== 手势处理 ====================
    function handleTouchStart(e) {
        if (State.isLocked) return;
        if (!State.video) return;

        const touch = e.touches[0];
        State.isTouching = true;
        State.startX = touch.clientX;
        State.startY = touch.clientY;
        State.startTime = State.video.currentTime;
        State.startVolume = State.video.volume;
        State.startBrightness = State.brightnessValue;
        State.gestureType = null;
    }

    function handleTouchMove(e) {
        if (!State.isTouching || State.isLocked) return;
        if (!State.video) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - State.startX;
        const deltaY = touch.clientY - State.startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        // 确定手势类型（只在第一次移动时确定）
        if (!State.gestureType && (absX > CONFIG.minSwipeDistance || absY > CONFIG.minSwipeDistance)) {
            if (absX > absY) {
                State.gestureType = 'seek';
            } else {
                // 左半边调亮度，右半边调音量
                const screenWidth = window.innerWidth;
                State.gestureType = State.startX < screenWidth / 2 ? 'brightness' : 'volume';
            }
        }

        if (!State.gestureType) return;

        e.preventDefault();

        switch (State.gestureType) {
            case 'seek':
                const seekDelta = deltaX * CONFIG.seekSensitivity;
                const newTime = clamp(State.startTime + seekDelta, 0, State.video.duration);
                State.video.currentTime = newTime;
                showTip('⏱️', formatTime(seekDelta), formatCurrentTime(newTime));
                break;

            case 'volume':
                const volumeDelta = -deltaY * CONFIG.volumeSensitivity;
                const newVolume = clamp(State.startVolume + volumeDelta, 0, 1);
                State.video.volume = newVolume;
                const volumePercent = Math.round(newVolume * 100);
                const volumeIcon = volumePercent === 0 ? '🔇' : volumePercent < 50 ? '🔉' : '🔊';
                showTip(volumeIcon, `${volumePercent}%`, '音量');
                break;

            case 'brightness':
                const brightnessDelta = -deltaY * CONFIG.brightnessSensitivity;
                State.brightnessValue = clamp(State.startBrightness + brightnessDelta, 0.1, 1);
                updateBrightness();
                const brightnessPercent = Math.round(State.brightnessValue * 100);
                showTip('☀️', `${brightnessPercent}%`, '亮度');
                break;
        }
    }

    function handleTouchEnd(e) {
        // 检测双击
        const now = Date.now();
        const touch = e.changedTouches[0];

        if (!State.gestureType && State.isTouching) {
            // 没有滑动，可能是点击或双击
            if (now - State.lastTapTime < CONFIG.doubleTapDelay) {
                // 双击
                handleDoubleTap(touch.clientX, touch.clientY);
                State.lastTapTime = 0;
            } else {
                State.lastTapTime = now;
                State.lastTapX = touch.clientX;

                // 单击延迟处理（等待可能的双击）
                setTimeout(() => {
                    if (State.lastTapTime === now) {
                        // 确认是单击，切换控制面板
                        toggleControlPanel();
                    }
                }, CONFIG.doubleTapDelay);
            }
        }

        State.isTouching = false;
        State.gestureType = null;
    }

    function handleDoubleTap(x, y) {
        if (!State.video) return;

        const screenWidth = window.innerWidth;
        const third = screenWidth / 3;

        // 创建点击效果
        createTapEffect(x, y);

        if (x < third) {
            // 左侧：快退
            State.video.currentTime = Math.max(0, State.video.currentTime - CONFIG.doubleTapSeek);
            showTip('⏪', `-${CONFIG.doubleTapSeek}秒`);
        } else if (x > third * 2) {
            // 右侧：快进
            State.video.currentTime = Math.min(State.video.duration, State.video.currentTime + CONFIG.doubleTapSeek);
            showTip('⏩', `+${CONFIG.doubleTapSeek}秒`);
        } else {
            // 中间：播放/暂停
            if (State.video.paused) {
                State.video.play();
                showTip('▶️', '播放');
            } else {
                State.video.pause();
                showTip('⏸️', '暂停');
            }
        }
    }

    function createTapEffect(x, y) {
        const effect = document.createElement('div');
        effect.className = 'mp-tap-effect';
        effect.style.left = (x - 40) + 'px';
        effect.style.top = (y - 40) + 'px';
        document.body.appendChild(effect);

        requestAnimationFrame(() => {
            effect.classList.add('animate');
        });

        setTimeout(() => effect.remove(), 400);
    }

    // ==================== 亮度控制 ====================
    function updateBrightness() {
        let filter = document.querySelector('.mp-brightness-filter');
        if (!filter) {
            filter = document.createElement('div');
            filter.className = 'mp-brightness-filter';
            document.body.appendChild(filter);
        }
        // 亮度越低，黑色遮罩越不透明
        filter.style.opacity = 1 - State.brightnessValue;
    }

    // ==================== 控制面板 ====================
    function createControlPanel() {
        // 面板切换按钮
        const toggleBtn = document.createElement('div');
        toggleBtn.className = 'mp-toggle-btn';
        toggleBtn.innerHTML = '◀';
        toggleBtn.addEventListener('click', toggleControlPanel);
        document.body.appendChild(toggleBtn);

        // 控制面板
        const panel = document.createElement('div');
        panel.className = 'mp-control-panel';
        panel.innerHTML = `
            <div class="mp-panel-btn" data-action="speed" title="倍速">⚡</div>
            <div class="mp-panel-btn" data-action="backward" title="后退30秒">⏪</div>
            <div class="mp-panel-btn" data-action="play" title="播放/暂停">▶️</div>
            <div class="mp-panel-btn" data-action="forward" title="前进30秒">⏩</div>
            <div class="mp-panel-btn" data-action="pip" title="画中画">📱</div>
            <div class="mp-panel-btn" data-action="lock" title="锁定">🔓</div>
        `;

        panel.addEventListener('click', handlePanelClick);
        document.body.appendChild(panel);
        State.controlPanel = panel;

        // 倍速选择器
        createSpeedSelector();

        // 锁定相关
        createLockOverlay();
    }

    function handlePanelClick(e) {
        const btn = e.target.closest('.mp-panel-btn');
        if (!btn) return;

        const action = btn.dataset.action;

        switch (action) {
            case 'speed':
                toggleSpeedSelector();
                break;
            case 'backward':
                if (State.video) {
                    State.video.currentTime = Math.max(0, State.video.currentTime - 30);
                    showTip('⏪', '-30秒');
                }
                break;
            case 'play':
                if (State.video) {
                    if (State.video.paused) {
                        State.video.play();
                        btn.innerHTML = '⏸️';
                        showTip('▶️', '播放');
                    } else {
                        State.video.pause();
                        btn.innerHTML = '▶️';
                        showTip('⏸️', '暂停');
                    }
                }
                break;
            case 'forward':
                if (State.video) {
                    State.video.currentTime = Math.min(State.video.duration, State.video.currentTime + 30);
                    showTip('⏩', '+30秒');
                }
                break;
            case 'pip':
                togglePictureInPicture();
                break;
            case 'lock':
                toggleLock();
                break;
        }

        resetPanelTimer();
    }

    function toggleControlPanel() {
        State.panelVisible = !State.panelVisible;
        State.controlPanel?.classList.toggle('visible', State.panelVisible);

        if (State.panelVisible) {
            resetPanelTimer();
        }
    }

    function resetPanelTimer() {
        clearTimeout(State.panelTimer);
        State.panelTimer = setTimeout(() => {
            State.panelVisible = false;
            State.controlPanel?.classList.remove('visible');
            hideSpeedSelector();
        }, CONFIG.panelAutoHide);
    }

    // ==================== 倍速选择器 ====================
    function createSpeedSelector() {
        const selector = document.createElement('div');
        selector.className = 'mp-speed-selector';
        selector.id = 'mp-speed-selector';

        CONFIG.speedOptions.forEach(speed => {
            const btn = document.createElement('button');
            btn.className = `mp-speed-btn ${speed === 1 ? 'active' : ''}`;
            btn.textContent = speed + 'x';
            btn.dataset.speed = speed;
            btn.addEventListener('click', () => setPlaybackSpeed(speed));
            selector.appendChild(btn);
        });

        document.body.appendChild(selector);
    }

    function toggleSpeedSelector() {
        const selector = document.getElementById('mp-speed-selector');
        selector?.classList.toggle('visible');
    }

    function hideSpeedSelector() {
        const selector = document.getElementById('mp-speed-selector');
        selector?.classList.remove('visible');
    }

    function setPlaybackSpeed(speed) {
        if (!State.video) return;

        State.video.playbackRate = speed;

        // 更新按钮状态
        document.querySelectorAll('.mp-speed-btn').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
        });

        showTip('⚡', `${speed}x`, '播放速度');

        // 保存偏好
        GM_setValue('preferred_speed', speed);

        hideSpeedSelector();
    }

    // ==================== 画中画 ====================
    function togglePictureInPicture() {
        if (!State.video) return;

        if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
            showTip('📱', '退出画中画');
        } else if (document.pictureInPictureEnabled) {
            State.video.requestPictureInPicture();
            showTip('📱', '画中画模式');
        } else {
            showTip('❌', '不支持画中画');
        }
    }

    // ==================== 锁定功能 ====================
    function createLockOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'mp-lock-overlay';
        overlay.id = 'mp-lock-overlay';
        document.body.appendChild(overlay);

        const unlockBtn = document.createElement('button');
        unlockBtn.className = 'mp-unlock-btn';
        unlockBtn.id = 'mp-unlock-btn';
        unlockBtn.textContent = '🔓 点击解锁';
        unlockBtn.addEventListener('click', toggleLock);
        document.body.appendChild(unlockBtn);

        // 点击锁定遮罩显示解锁按钮
        overlay.addEventListener('click', () => {
            unlockBtn.classList.toggle('visible');
            setTimeout(() => {
                unlockBtn.classList.remove('visible');
            }, 3000);
        });
    }

    function toggleLock() {
        State.isLocked = !State.isLocked;

        const overlay = document.getElementById('mp-lock-overlay');
        const unlockBtn = document.getElementById('mp-unlock-btn');
        const lockBtn = State.controlPanel?.querySelector('[data-action="lock"]');

        if (State.isLocked) {
            overlay?.classList.add('visible');
            State.controlPanel?.classList.remove('visible');
            State.panelVisible = false;
            lockBtn && (lockBtn.innerHTML = '🔒');
            showTip('🔒', '屏幕已锁定', '点击屏幕后可解锁');
        } else {
            overlay?.classList.remove('visible');
            unlockBtn?.classList.remove('visible');
            lockBtn && (lockBtn.innerHTML = '🔓');
            showTip('🔓', '已解锁');
        }
    }

    // ==================== 视频检测与初始化 ====================
    function findAndInitVideo() {
        // 查找视频元素
        const video = document.querySelector('video');
        if (!video) {
            // 没找到，稍后重试
            setTimeout(findAndInitVideo, 1000);
            return;
        }

        if (State.video === video) return; // 已经初始化过

        State.video = video;
        console.log('[MissAV Mobile Player] 检测到视频元素');

        // 创建手势覆盖层
        createGestureOverlay(video);

        // 创建提示元素
        createTipElement();

        // 创建控制面板
        createControlPanel();

        // 恢复用户偏好
        const savedSpeed = GM_getValue('preferred_speed', 1);
        video.playbackRate = savedSpeed;

        // 更新播放按钮状态
        video.addEventListener('play', () => {
            const playBtn = State.controlPanel?.querySelector('[data-action="play"]');
            if (playBtn) playBtn.innerHTML = '⏸️';
        });

        video.addEventListener('pause', () => {
            const playBtn = State.controlPanel?.querySelector('[data-action="play"]');
            if (playBtn) playBtn.innerHTML = '▶️';
        });

        console.log('[MissAV Mobile Player] 初始化完成');
    }

    function createGestureOverlay(video) {
        // 找到视频容器
        const container = video.parentElement || document.body;

        // 确保容器是相对定位
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        // 创建手势层
        const overlay = document.createElement('div');
        overlay.className = 'mp-gesture-overlay';

        overlay.addEventListener('touchstart', handleTouchStart, { passive: true });
        overlay.addEventListener('touchmove', handleTouchMove, { passive: false });
        overlay.addEventListener('touchend', handleTouchEnd, { passive: true });

        container.appendChild(overlay);
        State.overlay = overlay;
    }

    function createTipElement() {
        const tip = document.createElement('div');
        tip.className = 'mp-tip';
        document.body.appendChild(tip);
        State.tipElement = tip;
    }

    // ==================== 检测移动端 ====================
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
    }

    // ==================== 主程序 ====================
    function init() {
        // 只在移动端启用（或可以强制启用）
        // if (!isMobileDevice()) {
        //     console.log('[MissAV Mobile Player] 非移动设备，脚本不启用');
        //     return;
        // }

        console.log(
            '%c📱 MissAV 移动端播放器增强 v1.0 %c已加载',
            'background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 4px 8px; border-radius: 4px 0 0 4px; font-weight: bold;',
            'background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; padding: 4px 8px; border-radius: 0 4px 4px 0; font-weight: bold;'
        );

        // 检测是否在视频页面
        const path = window.location.pathname;
        const isVideoPage = /^\/[a-z]{2}\/[a-zA-Z]+-?\d+/i.test(path) || path.includes('/video/');

        if (!isVideoPage) {
            console.log('[MissAV Mobile Player] 非视频页面，等待导航...');
            return;
        }

        // 注入样式
        injectStyles();

        // 查找并初始化视频
        findAndInitVideo();
    }

    // 启动
    init();

    // SPA 支持：监听 URL 变化
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            // URL 变化，重新初始化
            State.video = null;
            setTimeout(init, 500);
        }
    }).observe(document, { subtree: true, childList: true });

})();
