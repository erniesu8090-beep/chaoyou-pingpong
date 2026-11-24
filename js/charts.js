/**
 * 朝友桌球分級小程式 - SVG 圖表與升級慶祝特效模組 (暖米白主題高對比配色)
 */
(function (global) {
    "use strict";

    function generateLevelChartSVG(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { state, DEFAULT_LEVELS } = global.ChaoyouState;
        const { getLevelInfo } = global.ChaoyouElo;

        const levels = (state.settings && state.settings.ratingLevels) || DEFAULT_LEVELS;
        const counts = Array(levels.length).fill(0);

        state.members.forEach(m => {
            const info = getLevelInfo(m.rating);
            const idx = levels.findIndex(l => l.level === info.level);
            if (idx !== -1) counts[idx]++;
        });

        const maxCount = Math.max(...counts, 4);
        const width = Math.max(container.clientWidth || 520, 320);
        const height = 190;
        const paddingLeft = 34;
        const paddingRight = 10;
        const paddingTop = 18;
        const paddingBottom = 26;

        const chartWidth = width - paddingLeft - paddingRight;
        const chartHeight = height - paddingTop - paddingBottom;
        const slotWidth = chartWidth / levels.length;
        const barWidth = Math.max(12, slotWidth - 8);

        let svgContent = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">`;

        for (let i = 0; i <= 4; i++) {
            const val = Math.round((maxCount / 4) * i);
            const y = height - paddingBottom - (chartHeight / 4) * i;
            svgContent += `
                <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="#E5E0D5" stroke-dasharray="3,3" />
                <text x="${paddingLeft - 8}" y="${y + 4}" fill="#78716C" font-size="10" text-anchor="end">${val}</text>
            `;
        }

        levels.forEach((lvl, idx) => {
            const count = counts[idx];
            const barHeight = (count / maxCount) * chartHeight;
            const x = paddingLeft + idx * slotWidth + (slotWidth - barWidth) / 2;
            const y = height - paddingBottom - barHeight;

            if (count > 0) {
                svgContent += `
                    <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="${lvl.color}" fill-opacity="0.88">
                        <title>L${lvl.level} ${lvl.name}: ${count}人</title>
                    </rect>
                    <text x="${x + barWidth / 2}" y="${y - 5}" fill="#1E2022" font-size="11" font-weight="700" text-anchor="middle">${count}</text>
                `;
            } else {
                svgContent += `
                    <circle cx="${x + barWidth / 2}" cy="${height - paddingBottom - 4}" r="2.2" fill="#D6D0C4" />
                `;
            }

            svgContent += `
                <text x="${x + barWidth / 2}" y="${height - 8}" fill="#57534E" font-size="10" font-weight="700" text-anchor="middle">L${lvl.level}</text>
            `;
        });

        svgContent += `
            <line x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" stroke="#D6D0C4" stroke-width="1.5" />
            </svg>
        `;

        container.innerHTML = svgContent;
    }

    function generateTrendChartSVG(containerId, history) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!history || history.length === 0) {
            container.innerHTML = `<div class="empty-inline">尚無積分變動數據</div>`;
            return;
        }

        const recentHistory = history.slice(-10);
        const ratings = recentHistory.map(h => h.rating);
        if (ratings.length === 1) {
            ratings.unshift(ratings[0]);
        }

        const minRating = Math.max(0, Math.min(...ratings) - 40);
        const maxRating = Math.max(...ratings) + 40;
        const ratingRange = Math.max(1, maxRating - minRating);

        const width = Math.max(container.clientWidth || 380, 300);
        const height = 155;
        const paddingLeft = 36;
        const paddingRight = 16;
        const paddingTop = 18;
        const paddingBottom = 22;

        const chartWidth = width - paddingLeft - paddingRight;
        const chartHeight = height - paddingTop - paddingBottom;

        let svgContent = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">`;

        svgContent += `
            <defs>
                <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#0F766E" stop-opacity="0.20"/>
                    <stop offset="100%" stop-color="#0F766E" stop-opacity="0.0"/>
                </linearGradient>
            </defs>
        `;

        const gridCount = 3;
        for (let i = 0; i <= gridCount; i++) {
            const val = Math.round(minRating + (ratingRange / gridCount) * i);
            const y = height - paddingBottom - (chartHeight / gridCount) * i;
            svgContent += `
                <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="#E5E0D5" stroke-dasharray="2,2" />
                <text x="${paddingLeft - 6}" y="${y + 4}" fill="#78716C" font-size="9.5" text-anchor="end">${val}</text>
            `;
        }

        const points = ratings.map((r, idx) => {
            const x = paddingLeft + (idx / (ratings.length - 1)) * chartWidth;
            const y = height - paddingBottom - ((r - minRating) / ratingRange) * chartHeight;
            return { x, y, rating: r };
        });

        let pathD = `M ${points[0].x} ${points[0].y}`;
        let areaD = `M ${points[0].x} ${height - paddingBottom} L ${points[0].x} ${points[0].y}`;

        for (let i = 1; i < points.length; i++) {
            pathD += ` L ${points[i].x} ${points[i].y}`;
            areaD += ` L ${points[i].x} ${points[i].y}`;
        }
        areaD += ` L ${points[points.length - 1].x} ${height - paddingBottom} Z`;

        svgContent += `<path d="${areaD}" fill="url(#trendAreaGrad)" />`;
        svgContent += `<path d="${pathD}" fill="none" stroke="#0F766E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;

        points.forEach((pt, idx) => {
            const showDot = ratings.length < 10 || idx === 0 || idx === points.length - 1 || idx % 2 === 0;
            if (showDot) {
                svgContent += `
                    <circle cx="${pt.x}" cy="${pt.y}" r="3.8" fill="#FFFDF9" stroke="#0F766E" stroke-width="2.2" />
                    <text x="${pt.x}" y="${pt.y - 8}" fill="#1E2022" font-size="9.5" font-weight="700" text-anchor="middle">${pt.rating}</text>
                `;
            }

            const labelText = idx === 0 ? "起點" : `${idx}`;
            svgContent += `
                <text x="${pt.x}" y="${height - 4}" fill="#78716C" font-size="9" text-anchor="middle">${labelText}</text>
            `;
        });

        svgContent += `</svg>`;
        container.innerHTML = svgContent;
    }

    function generateWinRatePieSVG(containerId, wins, losses) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const total = wins + losses;
        const rate = total > 0 ? Math.round((wins / total) * 100) : 0;

        const size = 108;
        const strokeWidth = 10;
        const radius = (size - strokeWidth) / 2;
        const circumference = radius * 2 * Math.PI;
        const strokeDashoffset = circumference - (rate / 100) * circumference;

        container.innerHTML = `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
                <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="#E5E0D5" stroke-width="${strokeWidth}" />
                <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="#0F766E" stroke-width="${strokeWidth}"
                        stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round"
                        transform="rotate(-90 ${size / 2} ${size / 2})" style="transition: stroke-dashoffset 0.7s ease-out;" />
                <text x="${size / 2}" y="${size / 2 + 5}" fill="#1E2022" font-size="20" font-weight="800" text-anchor="middle">${rate}%</text>
                <text x="${size / 2}" y="${size / 2 + 19}" fill="#78716C" font-size="9" font-weight="600" text-anchor="middle">勝率</text>
            </svg>
        `;
    }

    function startConfetti() {
        const canvas = document.getElementById("confetti-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const pieces = [];
        const colors = ["#0F766E", "#15803D", "#B45309", "#C2410C", "#1D4ED8", "#D97706"];

        for (let i = 0; i < 80; i++) {
            pieces.push({
                x: Math.random() * canvas.width,
                y: Math.random() * -canvas.height,
                w: Math.random() * 9 + 4,
                h: Math.random() * 5 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                speedY: Math.random() * 3 + 2,
                speedX: (Math.random() - 0.5) * 2,
                angle: Math.random() * 360,
                spin: (Math.random() - 0.5) * 8
            });
        }

        let frameId;
        let frames = 0;

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            pieces.forEach(p => {
                p.y += p.speedY;
                p.x += p.speedX;
                p.angle += p.spin;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.angle * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            });

            frames++;
            if (frames < 150) {
                frameId = requestAnimationFrame(animate);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                cancelAnimationFrame(frameId);
            }
        }

        animate();
    }

    global.ChaoyouCharts = {
        generateLevelChartSVG,
        generateTrendChartSVG,
        generateWinRatePieSVG,
        startConfetti
    };
})(typeof window !== "undefined" ? window : globalThis);
