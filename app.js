/**
 * 朝友桌球分級小程式 - 核心應用邏輯與 UI 渲染引擎
 * 採用純 Vanilla JS 實作，包含：
 * 1. 狀態管理 (LocalStorage 持久化)
 * 2. 雙打專屬 Elo 核心引擎 (個人期望值權重制/隊伍平均平分制)
 * 3. 實時預測器 (Live Predictor)
 * 4. SVG 動態圖表生成器 (折線圖、圓餅圖、柱狀圖)
 * 5. 七彩紙花特效與升降級通知
 * 6. 資料備份、恢復與示範數據種子
 * 7. 完整 DOM 渲染與事件綁定機制 (SPA 路由)
 */

// === 1. 預設系統配置與等級對照表 ===
const DEFAULT_LEVELS = [
    { level: 10, name: "初級二階 (Novice II)", min: 0, max: 799, color: "#94a3b8" },
    { level: 9, name: "初級一階 (Novice I)", min: 800, max: 999, color: "#84cc16" },
    { level: 8, name: "中級二階 (Intermediate II)", min: 1000, max: 1199, color: "#10b981" },
    { level: 7, name: "中級一階 (Intermediate I)", min: 1200, max: 1399, color: "#06b6d4" },
    { level: 6, name: "中高級二階 (High-Int II)", min: 1400, max: 1599, color: "#3b82f6" },
    { level: 5, name: "中高級一階 (High-Int I)", min: 1600, max: 1799, color: "#6366f1" },
    { level: 4, name: "高級二階 (Advanced II)", min: 1800, max: 1999, color: "#8b5cf6" },
    { level: 3, name: "高級一階 (Advanced I)", min: 2000, max: 2199, color: "#ec4899" },
    { level: 2, name: "頂級二階 (Elite II)", min: 2200, max: 2399, color: "#f43f5e" },
    { level: 1, name: "頂級一階 (Elite I)", min: 2400, max: 9999, color: "#f59e0b" }
];

const DEFAULT_SETTINGS = {
    eloMode: "weight", // "weight" (個人期望值權重制) 或 "equal" (隊伍平均值平分制)
    kFactor: 32,
    ratingLevels: DEFAULT_LEVELS
};

// === 2. 狀態管理 (State Management) ===
let state = {
    members: [],
    matches: [],
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
};

// 遷移舊的等級設定
function migrateSettingsIfNeeded() {
    if (state.settings && state.settings.ratingLevels) {
        const levels = state.settings.ratingLevels;
        
        // 檢查是否有舊的中文名稱
        const hasOldNames = levels.some(l => 
            l.name.includes("啟蒙") || 
            l.name.includes("新手") || 
            l.name.includes("進階") || 
            l.name.includes("傳奇") || 
            l.name.includes("精英")
        );
        
        const lvl1 = levels.find(l => l.level === 1);
        const needsReversing = lvl1 && lvl1.min < 1000;
        
        if (hasOldNames || needsReversing) {
            state.settings.ratingLevels = JSON.parse(JSON.stringify(DEFAULT_LEVELS));
            saveToStorage();
        }
    }
}

// 初始化 LocalStorage 數據
function initStorage() {
    const savedMembers = localStorage.getItem("cy_members");
    const savedMatches = localStorage.getItem("cy_matches");
    const savedSettings = localStorage.getItem("cy_settings");

    if (savedMembers) state.members = JSON.parse(savedMembers);
    if (savedMatches) state.matches = JSON.parse(savedMatches);
    if (savedSettings) state.settings = JSON.parse(savedSettings);

    migrateSettingsIfNeeded();
}

function saveToStorage() {
    localStorage.setItem("cy_members", JSON.stringify(state.members));
    localStorage.setItem("cy_matches", JSON.stringify(state.matches));
    localStorage.setItem("cy_settings", JSON.stringify(state.settings));
}

// 根據積分取得等級資訊
function getLevelInfo(rating) {
    const levels = state.settings.ratingLevels || DEFAULT_LEVELS;
    for (const lvl of levels) {
        if (rating >= lvl.min && rating <= lvl.max) {
            return lvl;
        }
    }
    if (rating < levels[0].min) return levels[0];
    return levels[levels.length - 1];
}

// 獲取會員頭像樣式
function getAvatarStyle(hueValue) {
    return `background: linear-gradient(135deg, hsl(${hueValue}, 85%, 60%) 0%, hsl(${(parseInt(hueValue) + 40) % 360}, 90%, 45%) 100%); box-shadow: 0 4px 14px -3px hsla(${hueValue}, 80%, 50%, 0.5);`;
}

// === 3. 雙打 Elo 核心計分引擎 ===
function calculateDoublesElo(rA, rB, rC, rD, winner) {
    const K = state.settings.kFactor;
    const mode = state.settings.eloMode;

    const rTeam1 = (rA + rB) / 2;
    const rTeam2 = (rC + rD) / 2;

    const sTeam1 = winner === 1 ? 1 : 0;
    const sTeam2 = winner === 2 ? 1 : 0;

    let changeA = 0, changeB = 0, changeC = 0, changeD = 0;

    if (mode === "weight") {
        const eA = 1 / (1 + Math.pow(10, (rTeam2 - rA) / 400));
        const eB = 1 / (1 + Math.pow(10, (rTeam2 - rB) / 400));
        const eC = 1 / (1 + Math.pow(10, (rTeam1 - rC) / 400));
        const eD = 1 / (1 + Math.pow(10, (rTeam1 - rD) / 400));

        changeA = Math.round(K * (sTeam1 - eA));
        changeB = Math.round(K * (sTeam1 - eB));
        changeC = Math.round(K * (sTeam2 - eC));
        changeD = Math.round(K * (sTeam2 - eD));
    } else {
        const eTeam1 = 1 / (1 + Math.pow(10, (rTeam2 - rTeam1) / 400));
        const changeTeam1 = Math.round(K * (sTeam1 - eTeam1));
        
        changeA = changeTeam1;
        changeB = changeTeam1;
        changeC = -changeTeam1;
        changeD = -changeTeam1;
    }

    return {
        playerA: changeA,
        playerB: changeB,
        playerC: changeC,
        playerD: changeD
    };
}

function predictMatchElo(idA, idB, idC, idD) {
    const pA = state.members.find(m => m.id === idA);
    const pB = state.members.find(m => m.id === idB);
    const pC = state.members.find(m => m.id === idC);
    const pD = state.members.find(m => m.id === idD);

    if (!pA || !pB || !pC || !pD) return null;

    const rA = pA.rating;
    const rB = pB.rating;
    const rC = pC.rating;
    const rD = pD.rating;

    const win1 = calculateDoublesElo(rA, rB, rC, rD, 1);
    const win2 = calculateDoublesElo(rA, rB, rC, rD, 2);

    return {
        ifTeam1Win: {
            A: { change: win1.playerA, nextRating: Math.max(0, rA + win1.playerA) },
            B: { change: win1.playerB, nextRating: Math.max(0, rB + win1.playerB) },
            C: { change: win1.playerC, nextRating: Math.max(0, rC + win1.playerC) },
            D: { change: win1.playerD, nextRating: Math.max(0, rD + win1.playerD) }
        },
        ifTeam2Win: {
            A: { change: win2.playerA, nextRating: Math.max(0, rA + win2.playerA) },
            B: { change: win2.playerB, nextRating: Math.max(0, rB + win2.playerB) },
            C: { change: win2.playerC, nextRating: Math.max(0, rC + win2.playerC) },
            D: { change: win2.playerD, nextRating: Math.max(0, rD + win2.playerD) }
        }
    };
}

// === 4. 新增與回滾比賽 ===
function recordMatch(idA, idB, idC, idD, score1, score2, setScores = []) {
    const pA = state.members.find(m => m.id === idA);
    const pB = state.members.find(m => m.id === idB);
    const pC = state.members.find(m => m.id === idC);
    const pD = state.members.find(m => m.id === idD);

    if (!pA || !pB || !pC || !pD) return false;

    const winner = score1 > score2 ? 1 : 2;
    const changes = calculateDoublesElo(pA.rating, pB.rating, pC.rating, pD.rating, winner);

    const matchId = "match_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    const matchDate = Date.now();

    const newMatch = {
        id: matchId,
        date: matchDate,
        team1: [idA, idB],
        team2: [idC, idD],
        score: { team1: score1, team2: score2 },
        setScores: setScores,
        winner: winner,
        ratingChanges: {
            [idA]: { prev: pA.rating, change: changes.playerA, next: Math.max(0, pA.rating + changes.playerA) },
            [idB]: { prev: pB.rating, change: changes.playerB, next: Math.max(0, pB.rating + changes.playerB) },
            [idC]: { prev: pC.rating, change: changes.playerC, next: Math.max(0, pC.rating + changes.playerC) },
            [idD]: { prev: pD.rating, change: changes.playerD, next: Math.max(0, pD.rating + changes.playerD) }
        }
    };

    state.matches.push(newMatch);

    const players = [
        { member: pA, change: changes.playerA, isWinner: winner === 1 },
        { member: pB, change: changes.playerB, isWinner: winner === 1 },
        { member: pC, change: changes.playerC, isWinner: winner === 2 },
        { member: pD, change: changes.playerD, isWinner: winner === 2 }
    ];

    let levelChanges = [];

    players.forEach(({ member, change, isWinner }) => {
        const oldRating = member.rating;
        const newRating = Math.max(0, oldRating + change);

        const oldLvl = getLevelInfo(oldRating);
        const newLvl = getLevelInfo(newRating);

        if (oldLvl.level !== newLvl.level) {
            levelChanges.push({
                playerName: member.name,
                oldLvl: oldLvl,
                newLvl: newLvl,
                direction: newLvl.level < oldLvl.level ? "up" : "down"
            });
        }

        member.rating = newRating;
        member.matchesPlayed += 1;
        if (isWinner) {
            member.wins += 1;
            member.streak = member.streak >= 0 ? member.streak + 1 : 1;
        } else {
            member.losses += 1;
            member.streak = member.streak <= 0 ? member.streak - 1 : -1;
        }

        member.ratingHistory.push({
            date: matchDate,
            rating: newRating,
            matchId: matchId
        });
    });

    saveToStorage();
    return { success: true, levelChanges: levelChanges, match: newMatch };
}

function rollbackMatch(matchId) {
    const matchIndex = state.matches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return false;

    const match = state.matches[matchIndex];
    const { team1, team2, winner, ratingChanges } = match;
    const allPlayerIds = [...team1, ...team2];

    allPlayerIds.forEach(pid => {
        const member = state.members.find(m => m.id === pid);
        if (!member) return;

        const changeInfo = ratingChanges[pid];
        if (!changeInfo) return;

        member.rating = changeInfo.prev;
        member.matchesPlayed = Math.max(0, member.matchesPlayed - 1);
        const isWinner = (team1.includes(pid) && winner === 1) || (team2.includes(pid) && winner === 2);
        if (isWinner) {
            member.wins = Math.max(0, member.wins - 1);
        } else {
            member.losses = Math.max(0, member.losses - 1);
        }

        member.ratingHistory = member.ratingHistory.filter(h => h.matchId !== matchId);
        recalculatePlayerStreak(member);
    });

    state.matches.splice(matchIndex, 1);
    saveToStorage();
    return true;
}

function recalculatePlayerStreak(member) {
    const playerMatches = state.matches
        .filter(m => m.team1.includes(member.id) || m.team2.includes(member.id))
        .sort((a, b) => a.date - b.date);

    if (playerMatches.length === 0) {
        member.streak = 0;
        return;
    }

    let streak = 0;
    playerMatches.forEach(m => {
        const isTeam1 = m.team1.includes(member.id);
        const isWinner = (isTeam1 && m.winner === 1) || (!isTeam1 && m.winner === 2);

        if (isWinner) {
            streak = streak >= 0 ? streak + 1 : 1;
        } else {
            streak = streak <= 0 ? streak - 1 : -1;
        }
    });

    member.streak = streak;
}

// === 5. 會員管理 ===
function addMember(name, initialRating, hueValue) {
    if (!name.trim()) return null;
    const id = "member_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    const rating = parseInt(initialRating) || 1200;
    
    const newMember = {
        id: id,
        name: name.trim(),
        rating: rating,
        avatarColor: hueValue.toString(),
        initialRating: rating,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        ratingHistory: [
            { date: Date.now(), rating: rating, matchId: "init" }
        ]
    };

    state.members.push(newMember);
    saveToStorage();
    return newMember;
}

function deleteMember(memberId) {
    const hasMatches = state.matches.some(m => 
        m.team1.includes(memberId) || m.team2.includes(memberId)
    );
    
    if (hasMatches) {
        return { success: false, reason: "該會員已有參賽紀錄，無法刪除！若要刪除，請先將其相關比賽刪除回滾。" };
    }

    state.members = state.members.filter(m => m.id !== memberId);
    saveToStorage();
    return { success: true };
}

// === 6. SVG 圖表生成 ===
function generateLevelChartSVG(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const levels = state.settings.ratingLevels || DEFAULT_LEVELS;
    const counts = Array(levels.length).fill(0);

    state.members.forEach(m => {
        const info = getLevelInfo(m.rating);
        const idx = levels.findIndex(l => l.level === info.level);
        if (idx !== -1) counts[idx]++;
    });

    const maxCount = Math.max(...counts, 4);
    const width = container.clientWidth || 500;
    const height = 180;
    const paddingLeft = 35;
    const paddingRight = 10;
    const paddingTop = 15;
    const paddingBottom = 25;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    const barWidth = chartWidth / levels.length - 6;

    let svgContent = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">`;
    
    for (let i = 0; i <= 4; i++) {
        const val = Math.round((maxCount / 4) * i);
        const y = height - paddingBottom - (chartHeight / 4) * i;
        svgContent += `
            <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
            <text x="${paddingLeft - 8}" y="${y + 4}" fill="rgba(255,255,255,0.4)" font-size="10" text-anchor="end">${val}</text>
        `;
    }

    levels.forEach((lvl, idx) => {
        const count = counts[idx];
        const barHeight = (count / maxCount) * chartHeight;
        const x = paddingLeft + idx * (chartWidth / levels.length) + 3;
        const y = height - paddingBottom - barHeight;

        const gradId = `barGrad_${lvl.level}`;
        svgContent += `
            <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${lvl.color}" stop-opacity="0.95"/>
                    <stop offset="100%" stop-color="${lvl.color}" stop-opacity="0.2"/>
                </linearGradient>
            </defs>
        `;

        if (count > 0) {
            svgContent += `
                <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="url(#${gradId})" filter="drop-shadow(0 2px 5px ${lvl.color}33)">
                    <title>${lvl.name}: ${count}人</title>
                </rect>
                <text x="${x + barWidth / 2}" y="${y - 4}" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">${count}</text>
            `;
        } else {
            svgContent += `
                <circle cx="${x + barWidth / 2}" cy="${height - paddingBottom - 3}" r="2" fill="rgba(255,255,255,0.15)" />
            `;
        }

        svgContent += `
            <text x="${x + barWidth / 2}" y="${height - 8}" fill="rgba(255,255,255,0.5)" font-size="10" font-weight="bold" text-anchor="middle">L${lvl.level}</text>
        `;
    });

    svgContent += `
        <line x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" stroke="rgba(255,255,255,0.15)" />
        </svg>
    `;

    container.innerHTML = svgContent;
}

function generateTrendChartSVG(containerId, history) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!history || history.length === 0) {
        container.innerHTML = `<div class="text-white/30 text-xs text-center py-8">尚無積分變動數據</div>`;
        return;
    }

    const recentHistory = history.slice(-10);
    const ratings = recentHistory.map(h => h.rating);
    
    if (ratings.length === 1) {
        ratings.unshift(ratings[0]);
    }

    const minRating = Math.max(0, Math.min(...ratings) - 40);
    const maxRating = Math.max(...ratings) + 40;
    const ratingRange = maxRating - minRating;

    const width = container.clientWidth || 380;
    const height = 150;
    const paddingLeft = 32;
    const paddingRight = 15;
    const paddingTop = 15;
    const paddingBottom = 20;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    let svgContent = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">`;
    
    svgContent += `
        <defs>
            <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
            </linearGradient>
            <linearGradient id="trendLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#34d399"/>
                <stop offset="100%" stop-color="#60a5fa"/>
            </linearGradient>
        </defs>
    `;

    const gridCount = 3;
    for (let i = 0; i <= gridCount; i++) {
        const val = Math.round(minRating + (ratingRange / gridCount) * i);
        const y = height - paddingBottom - (chartHeight / gridCount) * i;
        svgContent += `
            <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255,255,255,0.06)" />
            <text x="${paddingLeft - 6}" y="${y + 4}" fill="rgba(255,255,255,0.4)" font-size="9" text-anchor="end">${val}</text>
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
    svgContent += `<path d="${pathD}" fill="none" stroke="url(#trendLineGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" filter="drop-shadow(0 2px 4px rgba(16,185,129,0.3))" />`;

    points.forEach((pt, idx) => {
        const showDot = ratings.length < 10 || idx === 0 || idx === points.length - 1 || idx % 2 === 0;
        if (showDot) {
            svgContent += `
                <circle cx="${pt.x}" cy="${pt.y}" r="4" fill="#1f2937" stroke="#34d399" stroke-width="2" />
                <text x="${pt.x}" y="${pt.y - 8}" fill="#ffffff" font-size="9" font-weight="bold" text-anchor="middle">${pt.rating}</text>
            `;
        }
        
        const labelText = idx === 0 ? "初始" : `${idx}`;
        svgContent += `
            <text x="${pt.x}" y="${height - 4}" fill="rgba(255,255,255,0.3)" font-size="9" text-anchor="middle">${labelText}</text>
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

    const size = 100;
    const strokeWidth = 10;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (rate / 100) * circumference;

    let svgContent = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="pieGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#10b981"/>
                    <stop offset="100%" stop-color="#3b82f6"/>
                </linearGradient>
            </defs>
            <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${strokeWidth}" />
            <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="url(#pieGrad)" stroke-width="${strokeWidth}" 
                    stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round"
                    transform="rotate(-90 ${size/2} ${size/2})" style="transition: stroke-dashoffset 0.8s ease-out;" />
            <text x="${size/2}" y="${size/2 + 5}" fill="#ffffff" font-size="20" font-weight="800" text-anchor="middle">${rate}%</text>
            <text x="${size/2}" y="${size/2 + 18}" fill="rgba(255,255,255,0.4)" font-size="8" text-anchor="middle">勝率</text>
        </svg>
    `;
    
    container.innerHTML = svgContent;
}

// === 7. 載入與清除數據 ===
function loadDemoData() {
    const demoPlayers = [
        { id: "demo_1", name: "戴資穎", rating: 2240, avatarColor: "45", initialRating: 1200, matchesPlayed: 28, wins: 22, losses: 6, streak: 5 },
        { id: "demo_2", name: "莊智淵", rating: 2180, avatarColor: "15", initialRating: 1200, matchesPlayed: 24, wins: 18, losses: 6, streak: 2 },
        { id: "demo_3", name: "盧彥勳", rating: 1950, avatarColor: "160", initialRating: 1200, matchesPlayed: 20, wins: 14, losses: 6, streak: 3 },
        { id: "demo_4", name: "林志傑", rating: 1720, avatarColor: "120", initialRating: 1200, matchesPlayed: 18, wins: 11, losses: 7, streak: -1 },
        { id: "demo_5", name: "王建民", rating: 1530, avatarColor: "200", initialRating: 1200, matchesPlayed: 16, wins: 9, losses: 7, streak: 1 },
        { id: "demo_6", name: "郭台銘", rating: 1380, avatarColor: "240", initialRating: 1200, matchesPlayed: 14, wins: 7, losses: 7, streak: -2 },
        { id: "demo_7", name: "周杰倫", rating: 1180, avatarColor: "280", initialRating: 1200, matchesPlayed: 12, wins: 5, losses: 7, streak: -1 },
        { id: "demo_8", name: "柯文哲", rating: 1080, avatarColor: "300", initialRating: 1200, matchesPlayed: 10, wins: 4, losses: 6, streak: 1 },
        { id: "demo_9", name: "蔡英文", rating: 920, avatarColor: "340", initialRating: 1200, matchesPlayed: 8, wins: 2, losses: 6, streak: -3 },
        { id: "demo_10", name: "侯友宜", rating: 850, avatarColor: "80", initialRating: 1200, matchesPlayed: 6, wins: 1, losses: 5, streak: -4 }
    ];

    demoPlayers.forEach(p => {
        p.ratingHistory = [
            { date: Date.now() - 30 * 86400000, rating: p.initialRating, matchId: "init" }
        ];
        
        let currentRating = p.initialRating;
        const totalMatches = p.matchesPlayed;

        for (let i = 1; i <= totalMatches; i++) {
            const timeOffset = Date.now() - (totalMatches - i) * 1.5 * 86400000;
            const isWin = i <= p.wins;
            const variance = Math.round(15 + Math.random() * 15);
            currentRating += isWin ? variance : -variance;
            
            p.ratingHistory.push({
                date: timeOffset,
                rating: currentRating,
                matchId: `demo_match_point_${i}`
            });
        }
        p.rating = currentRating;
    });

    const demoMatches = [
        {
            id: "dmatch_1",
            date: Date.now() - 10 * 86400000,
            team1: ["demo_1", "demo_5"],
            team2: ["demo_2", "demo_6"],
            score: { team1: 3, team2: 1 },
            setScores: ["11-9", "11-8", "7-11", "11-6"],
            winner: 1,
            ratingChanges: {
                "demo_1": { prev: 2228, change: 12, next: 2240 },
                "demo_5": { prev: 1515, change: 15, next: 1530 },
                "demo_2": { prev: 2192, change: -12, next: 2180 },
                "demo_6": { prev: 1395, change: -15, next: 1380 }
            }
        },
        {
            id: "dmatch_2",
            date: Date.now() - 8 * 86400000,
            team1: ["demo_3", "demo_7"],
            team2: ["demo_4", "demo_8"],
            score: { team1: 3, team2: 2 },
            setScores: ["11-7", "9-11", "11-5", "8-11", "11-9"],
            winner: 1,
            ratingChanges: {
                "demo_3": { prev: 1934, change: 16, next: 1950 },
                "demo_7": { prev: 1162, change: 18, next: 1180 },
                "demo_4": { prev: 1736, change: -16, next: 1720 },
                "demo_8": { prev: 1098, change: -18, next: 1080 }
            }
        },
        {
            id: "dmatch_3",
            date: Date.now() - 6 * 86400000,
            team1: ["demo_9", "demo_10"],
            team2: ["demo_5", "demo_6"],
            score: { team1: 1, team2: 3 },
            setScores: ["5-11", "11-9", "6-11", "8-11"],
            winner: 2,
            ratingChanges: {
                "demo_9": { prev: 928, change: -8, next: 920 },
                "demo_10": { prev: 858, change: -8, next: 850 },
                "demo_5": { prev: 1518, change: 12, next: 1530 },
                "demo_6": { prev: 1368, change: 12, next: 1380 }
            }
        },
        {
            id: "dmatch_4",
            date: Date.now() - 4 * 86400000,
            team1: ["demo_1", "demo_3"],
            team2: ["demo_2", "demo_4"],
            score: { team1: 3, team2: 0 },
            setScores: ["11-8", "11-9", "12-10"],
            winner: 1,
            ratingChanges: {
                "demo_1": { prev: 2226, change: 14, next: 2240 },
                "demo_3": { prev: 1935, change: 15, next: 1950 },
                "demo_2": { prev: 2194, change: -14, next: 2180 },
                "demo_4": { prev: 1735, change: -15, next: 1720 }
            }
        },
        {
            id: "dmatch_5",
            date: Date.now() - 2 * 86400000,
            team1: ["demo_7", "demo_9"],
            team2: ["demo_8", "demo_10"],
            score: { team1: 3, team2: 1 },
            setScores: ["11-6", "11-8", "9-11", "11-7"],
            winner: 1,
            ratingChanges: {
                "demo_7": { prev: 1164, change: 16, next: 1180 },
                "demo_9": { prev: 902, change: 18, next: 920 },
                "demo_8": { prev: 1096, change: -16, next: 1080 },
                "demo_10": { prev: 868, change: -18, next: 850 }
            }
        }
    ];

    state.members = demoPlayers;
    state.matches = demoMatches;
    state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    saveToStorage();
}

function clearAllData() {
    state.members = [];
    state.matches = [];
    state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    saveToStorage();
}

// === 8. Confetti 特效 ===
function startConfetti() {
    const canvas = document.getElementById("confetti-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const colors = ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444", "#06b6d4"];
    const confettiParticles = [];

    class Confetti {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height - height;
            this.size = Math.random() * 8 + 6;
            this.color = colors[Math.floor(Math.random() * colors.length)];
            this.speedX = Math.random() * 3 - 1.5;
            this.speedY = Math.random() * 4 + 4;
            this.rotation = Math.random() * 360;
            this.rotationSpeed = Math.random() * 10 - 5;
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            this.rotation += this.rotationSpeed;
            if (this.y > height) {
                this.y = -20;
                this.x = Math.random() * width;
            }
        }

        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate((this.rotation * Math.PI) / 180);
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
            ctx.restore();
        }
    }

    for (let i = 0; i < 120; i++) {
        confettiParticles.push(new Confetti());
    }

    let startTime = Date.now();
    function animate() {
        ctx.clearRect(0, 0, width, height);

        confettiParticles.forEach(p => {
            p.update();
            p.draw();
        });

        if (Date.now() - startTime < 4000) {
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, width, height);
        }
    }
    animate();
}

function exportBackup() {
    return JSON.stringify({
        members: state.members,
        matches: state.matches,
        settings: state.settings,
        version: "1.1.0",
        exportDate: Date.now()
    }, null, 2);
}

function importBackup(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        if (!data.members || !data.matches || !data.settings) {
            return { success: false, reason: "無效的備份格式！" };
        }
        state.members = data.members;
        state.matches = data.matches;
        state.settings = data.settings;
        saveToStorage();
        return { success: true };
    } catch (e) {
        return { success: false, reason: "JSON 解析出錯！" };
    }
}

// === 9. DOM UI 綁定與渲染模組 ===

// 全域視圖切換
function switchView(viewName) {
    document.querySelectorAll(".view-panel").forEach(panel => {
        panel.classList.remove("active");
    });
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.classList.remove("active");
    });

    const targetPanel = document.getElementById(`view-${viewName}`);
    const targetBtn = document.getElementById(`nav-${viewName}`);

    if (targetPanel && targetBtn) {
        targetPanel.classList.add("active");
        targetBtn.classList.add("active");
    }

    // 視圖特有渲染
    if (viewName === "dashboard") {
        renderDashboard();
    } else if (viewName === "members") {
        renderMembers();
    } else if (viewName === "match-recorder") {
        renderMatchRecorder();
    } else if (viewName === "match-history") {
        renderMatchHistory();
    } else if (viewName === "settings") {
        renderSettings();
    }
}

// A. 渲染控制面板 Dashboard
function renderDashboard() {
    // 1. 頂部數據卡片
    document.getElementById("db-stat-members").innerText = state.members.length;
    document.getElementById("db-stat-matches").innerText = state.matches.length;

    // 計算今日新增比賽數
    const today = new Date().setHours(0, 0, 0, 0);
    const matchesToday = state.matches.filter(m => m.date >= today).length;
    document.getElementById("db-stat-today-matches").innerText = matchesToday;

    // 計算全會平均積分
    const avgRating = state.members.length > 0 
        ? Math.round(state.members.reduce((acc, m) => acc + m.rating, 0) / state.members.length)
        : 1200;
    document.getElementById("db-stat-avg-rating").innerText = avgRating;

    // 2. 排行榜 (Leaderboard) - 前 10 名
    const sortedMembers = [...state.members].sort((a, b) => b.rating - a.rating);
    const lbContainer = document.getElementById("db-leaderboard-list");
    lbContainer.innerHTML = "";

    if (sortedMembers.length === 0) {
        lbContainer.innerHTML = `<div class="text-white/30 text-sm text-center py-10">尚無球員資料。請至「系統設定」載入示範數據，或於「會員管理」新增球員！</div>`;
    } else {
        const top10 = sortedMembers.slice(0, 10);
        top10.forEach((member, index) => {
            const rank = index + 1;
            const lvlInfo = getLevelInfo(member.rating);
            
            // 連勝 Tag
            let streakTag = "";
            if (member.streak >= 3) {
                streakTag = `<span class="streak-tag streak-win">🔥 ${member.streak} 連勝</span>`;
            } else if (member.streak <= -3) {
                streakTag = `<span class="streak-tag streak-loss">❄️ ${Math.abs(member.streak)} 連敗</span>`;
            }

            const winRate = member.matchesPlayed > 0 ? Math.round((member.wins / member.matchesPlayed) * 100) : 0;

            const itemHTML = `
                <div class="leaderboard-item rank-${rank}" onclick="openMemberDetailModal('${member.id}')" style="cursor:pointer;">
                    <div class="rank-badge">${rank}</div>
                    <div class="avatar" style="${getAvatarStyle(member.avatarColor)}">${member.name.charAt(0)}</div>
                    <div class="player-info">
                        <div style="display:flex; align-items:center;">
                            <span class="player-name">${member.name}</span>
                            ${streakTag}
                        </div>
                        <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
                            出賽 ${member.matchesPlayed} 場 | 勝率 ${winRate}%
                        </div>
                    </div>
                    <div class="player-rating-cell">
                        <div class="rating-val">${member.rating}</div>
                        <div class="level-tag" style="background:${lvlInfo.color}22; color:${lvlInfo.color}; border:1px solid ${lvlInfo.color}33;">
                            L${lvlInfo.level} ${lvlInfo.name.split(" ")[0]}
                        </div>
                    </div>
                </div>
            `;
            lbContainer.insertAdjacentHTML("beforeend", itemHTML);
        });
    }

    // 3. SVG 等級柱狀圖
    generateLevelChartSVG("db-level-chart-container");

    // 4. 最近 5 場賽事動態
    const recentMatches = [...state.matches].sort((a, b) => b.date - a.date).slice(0, 5);
    const tmContainer = document.getElementById("db-recent-matches-timeline");
    tmContainer.innerHTML = "";

    if (recentMatches.length === 0) {
        tmContainer.innerHTML = `<div class="text-white/30 text-sm text-center py-10">尚無比賽紀錄</div>`;
    } else {
        recentMatches.forEach(m => {
            const t1p1 = state.members.find(p => p.id === m.team1[0])?.name || "未知球員";
            const t1p2 = state.members.find(p => p.id === m.team1[1])?.name || "未知球員";
            const t2p1 = state.members.find(p => p.id === m.team2[0])?.name || "未知球員";
            const t2p2 = state.members.find(p => p.id === m.team2[1])?.name || "未知球員";

            const changeInfoHtml = (pid) => {
                const change = m.ratingChanges[pid]?.change || 0;
                const sign = change >= 0 ? "+" : "";
                const colorClass = change >= 0 ? "change-up" : "change-down";
                return `<span class="member-rating-change ${colorClass}">${sign}${change}</span>`;
            };

            const dateStr = new Date(m.date).toLocaleDateString("zh-TW", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

            const setDetailText = m.setScores && m.setScores.length > 0 ? m.setScores.join(", ") : "無詳細局分";

            const timelineHTML = `
                <div class="timeline-item">
                    <!-- Team 1 -->
                    <div class="team-display">
                        <div class="team-member" style="font-weight:${m.winner === 1 ? '700' : '400'}">
                            <span>${t1p1}</span> ${changeInfoHtml(m.team1[0])}
                        </div>
                        <div class="team-member" style="font-weight:${m.winner === 1 ? '700' : '400'}">
                            <span>${t1p2}</span> ${changeInfoHtml(m.team1[1])}
                        </div>
                    </div>

                    <!-- 比分 VS -->
                    <div class="vs-score-box">
                        <div class="score-display">
                            <span style="color:${m.winner === 1 ? 'var(--accent-emerald)' : 'inherit'}">${m.score.team1}</span>
                            <span style="color:var(--text-muted)">:</span>
                            <span style="color:${m.winner === 2 ? 'var(--accent-emerald)' : 'inherit'}">${m.score.team2}</span>
                        </div>
                        <div class="sets-detail">${setDetailText}</div>
                        <div class="match-date-badge">${dateStr}</div>
                    </div>

                    <!-- Team 2 -->
                    <div class="team-display right">
                        <div class="team-member" style="font-weight:${m.winner === 2 ? '700' : '400'}">
                            <span>${t2p1}</span> ${changeInfoHtml(m.team2[0])}
                        </div>
                        <div class="team-member" style="font-weight:${m.winner === 2 ? '700' : '400'}">
                            <span>${t2p2}</span> ${changeInfoHtml(m.team2[1])}
                        </div>
                    </div>
                </div>
            `;
            tmContainer.insertAdjacentHTML("beforeend", timelineHTML);
        });
    }
}

// B. 渲染會員管理 Members
function renderMembers() {
    const searchVal = document.getElementById("member-search").value.toLowerCase();
    const sortBy = document.getElementById("member-sort-select").value;

    let filtered = state.members.filter(m => 
        m.name.toLowerCase().includes(searchVal)
    );

    // 排序
    if (sortBy === "rating-desc") {
        filtered.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === "rating-asc") {
        filtered.sort((a, b) => a.rating - b.rating);
    } else if (sortBy === "winrate-desc") {
        filtered.sort((a, b) => {
            const wrA = a.matchesPlayed > 0 ? a.wins / a.matchesPlayed : 0;
            const wrB = b.matchesPlayed > 0 ? b.wins / b.matchesPlayed : 0;
            return wrB - wrA;
        });
    } else if (sortBy === "matches-desc") {
        filtered.sort((a, b) => b.matchesPlayed - a.matchesPlayed);
    }

    const grid = document.getElementById("members-cards-grid");
    grid.innerHTML = "";

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="text-white/30 text-sm text-center py-10" style="grid-column: 1/-1;">查無會員資料，點選右上角「新增會員」建立球員吧！</div>`;
        return;
    }

    filtered.forEach(member => {
        const lvlInfo = getLevelInfo(member.rating);
        const winRate = member.matchesPlayed > 0 ? Math.round((member.wins / member.matchesPlayed) * 100) : 0;

        let streakTag = "";
        if (member.streak >= 3) {
            streakTag = `<span class="streak-tag streak-win" style="margin-left:0; margin-top:4px; display:inline-block;">🔥 ${member.streak} 連勝</span>`;
        } else if (member.streak <= -3) {
            streakTag = `<span class="streak-tag streak-loss" style="margin-left:0; margin-top:4px; display:inline-block;">❄️ ${Math.abs(member.streak)} 連敗</span>`;
        }

        const cardHTML = `
            <div class="glass-panel member-card" onclick="openMemberDetailModal('${member.id}')">
                <div class="member-card-header">
                    <div class="avatar" style="${getAvatarStyle(member.avatarColor)}">${member.name.charAt(0)}</div>
                    <div>
                        <div class="player-name" style="font-size:16px;">${member.name}</div>
                        ${streakTag}
                    </div>
                    <div class="player-rating-cell" style="margin-left:auto;">
                        <div class="rating-val" style="font-size:18px;">${member.rating}</div>
                        <div class="level-tag" style="background:${lvlInfo.color}22; color:${lvlInfo.color}; border:1px solid ${lvlInfo.color}33;">
                            L${lvlInfo.level} ${lvlInfo.name.split(" ")[0]}
                        </div>
                    </div>
                </div>
                <div class="member-card-details">
                    <div>
                        <div class="member-detail-label">總場次</div>
                        <div class="member-detail-val">${member.matchesPlayed}</div>
                    </div>
                    <div>
                        <div class="member-detail-label">勝場/敗場</div>
                        <div class="member-detail-val">${member.wins} / ${member.losses}</div>
                    </div>
                    <div style="grid-column: span 2;">
                        <div class="member-detail-label">勝率</div>
                        <div class="member-detail-val" style="color:var(--accent-emerald)">${winRate}%</div>
                    </div>
                </div>
            </div>
        `;
        grid.insertAdjacentHTML("beforeend", cardHTML);
    });
}

// C. 渲染雙打賽事登錄 Match Recorder
function renderMatchRecorder() {
    const selectors = ["mr-t1p1", "mr-t1p2", "mr-t2p1", "mr-t2p2"];
    const selectedValues = selectors.map(s => document.getElementById(s).value);

    // 排列有積分的球員
    const sortedMembers = [...state.members].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

    selectors.forEach((selId, index) => {
        const select = document.getElementById(selId);
        const prevValue = selectedValues[index];
        
        select.innerHTML = `<option value="">-- 選擇球員 --</option>`;
        
        sortedMembers.forEach(m => {
            // 下拉互斥：已被其他下拉選單選擇的球員不在此顯示 (除非是當前選單本身已選的)
            const isChosenElsewhere = selectedValues.some((val, idx) => idx !== index && val === m.id);
            
            if (!isChosenElsewhere) {
                const selectedAttr = prevValue === m.id ? "selected" : "";
                const lvlInfo = getLevelInfo(m.rating);
                select.insertAdjacentHTML("beforeend", `
                    <option value="${m.id}" ${selectedAttr}>${m.name} (${m.rating} - L${lvlInfo.level})</option>
                `);
            }
        });
    });

    updateLivePredictor();
}

// 更新即時積分預測 Live Predictor
function updateLivePredictor() {
    const idA = document.getElementById("mr-t1p1").value;
    const idB = document.getElementById("mr-t1p2").value;
    const idC = document.getElementById("mr-t2p1").value;
    const idD = document.getElementById("mr-t2p2").value;

    const container = document.getElementById("mr-predictor-panel");

    if (!idA || !idB || !idC || !idD) {
        container.style.display = "none";
        return;
    }

    container.style.display = "block";
    const prediction = predictMatchElo(idA, idB, idC, idD);

    if (!prediction) return;

    const pA = state.members.find(m => m.id === idA);
    const pB = state.members.find(m => m.id === idB);
    const pC = state.members.find(m => m.id === idC);
    const pD = state.members.find(m => m.id === idD);

    const renderChangeHtml = (change, next) => {
        const sign = change >= 0 ? "+" : "";
        const color = change >= 0 ? "var(--accent-emerald)" : "var(--accent-crimson)";
        const oldLvl = getLevelInfo(next - change); // 還原
        const newLvl = getLevelInfo(next);
        let levelUpGlow = "";
        
        if (oldLvl.level > newLvl.level) {
            levelUpGlow = ` <span style="color:var(--accent-gold); font-weight:900; animation: alertPulseUp 1s infinite alternate;">▲ 升級 L${newLvl.level}!</span>`;
        } else if (oldLvl.level < newLvl.level) {
            levelUpGlow = ` <span style="color:var(--accent-crimson); font-weight:700;">▼ 降級 L${newLvl.level}</span>`;
        }

        return `<span class="predict-rating-change" style="color:${color}">${sign}${change} 分 (➔ ${next})${levelUpGlow}</span>`;
    };

    // 情境一：Team 1 獲勝
    document.getElementById("pred-t1-win-pA").innerHTML = `${pA.name}: ${renderChangeHtml(prediction.ifTeam1Win.A.change, prediction.ifTeam1Win.A.nextRating)}`;
    document.getElementById("pred-t1-win-pB").innerHTML = `${pB.name}: ${renderChangeHtml(prediction.ifTeam1Win.B.change, prediction.ifTeam1Win.B.nextRating)}`;
    document.getElementById("pred-t1-win-pC").innerHTML = `${pC.name}: ${renderChangeHtml(prediction.ifTeam1Win.C.change, prediction.ifTeam1Win.C.nextRating)}`;
    document.getElementById("pred-t1-win-pD").innerHTML = `${pD.name}: ${renderChangeHtml(prediction.ifTeam1Win.D.change, prediction.ifTeam1Win.D.nextRating)}`;

    // 情境二：Team 2 獲勝
    document.getElementById("pred-t2-win-pA").innerHTML = `${pA.name}: ${renderChangeHtml(prediction.ifTeam2Win.A.change, prediction.ifTeam2Win.A.nextRating)}`;
    document.getElementById("pred-t2-win-pB").innerHTML = `${pB.name}: ${renderChangeHtml(prediction.ifTeam2Win.B.change, prediction.ifTeam2Win.B.nextRating)}`;
    document.getElementById("pred-t2-win-pC").innerHTML = `${pC.name}: ${renderChangeHtml(prediction.ifTeam2Win.C.change, prediction.ifTeam2Win.C.nextRating)}`;
    document.getElementById("pred-t2-win-pD").innerHTML = `${pD.name}: ${renderChangeHtml(prediction.ifTeam2Win.D.change, prediction.ifTeam2Win.D.nextRating)}`;
}


// D. 渲染歷史賽事 Match History
let historyPage = 1;
const historyLimit = 15;

function renderMatchHistory() {
    const container = document.getElementById("history-table-tbody");
    container.innerHTML = "";

    const searchVal = document.getElementById("history-search").value.toLowerCase();
    
    let filteredMatches = state.matches.filter(m => {
        if (!searchVal) return true;
        const pA = state.members.find(p => p.id === m.team1[0])?.name || "";
        const pB = state.members.find(p => p.id === m.team1[1])?.name || "";
        const pC = state.members.find(p => p.id === m.team2[0])?.name || "";
        const pD = state.members.find(p => p.id === m.team2[1])?.name || "";
        return pA.toLowerCase().includes(searchVal) || 
               pB.toLowerCase().includes(searchVal) || 
               pC.toLowerCase().includes(searchVal) || 
               pD.toLowerCase().includes(searchVal);
    });

    // 依時間倒序
    filteredMatches.sort((a, b) => b.date - a.date);

    // 分頁
    const totalMatches = filteredMatches.length;
    const totalPages = Math.max(1, Math.ceil(totalMatches / historyLimit));
    if (historyPage > totalPages) historyPage = totalPages;

    const startIdx = (historyPage - 1) * historyLimit;
    const paginatedMatches = filteredMatches.slice(startIdx, startIdx + historyLimit);

    document.getElementById("history-page-info").innerText = `${historyPage} / ${totalPages} 頁 (共 ${totalMatches} 筆)`;
    document.getElementById("history-prev-btn").disabled = historyPage === 1;
    document.getElementById("history-next-btn").disabled = historyPage === totalPages;

    if (paginatedMatches.length === 0) {
        container.innerHTML = `<tr><td colspan="5" class="text-white/30 text-center py-10">尚無歷史賽事紀錄</td></tr>`;
        return;
    }

    paginatedMatches.forEach(m => {
        const t1p1 = state.members.find(p => p.id === m.team1[0])?.name || "未知球員";
        const t1p2 = state.members.find(p => p.id === m.team1[1])?.name || "未知球員";
        const t2p1 = state.members.find(p => p.id === m.team2[0])?.name || "未知球員";
        const t2p2 = state.members.find(p => p.id === m.team2[1])?.name || "未知球員";

        const renderChangeSpan = (pid) => {
            const ch = m.ratingChanges[pid];
            if (!ch) return "";
            const sign = ch.change >= 0 ? "+" : "";
            const color = ch.change >= 0 ? "var(--accent-emerald)" : "var(--accent-crimson)";
            return `<div style="font-size:10px; color:${color}; font-weight:700;">${sign}${ch.change} (${ch.prev}➔${ch.next})</div>`;
        };

        const dateStr = new Date(m.date).toLocaleString("zh-TW", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        const setDetail = m.setScores && m.setScores.length > 0 ? m.setScores.join(", ") : "-";

        const trHTML = `
            <tr>
                <td style="color:var(--text-secondary);">${dateStr}</td>
                <td>
                    <div style="font-weight:${m.winner === 1 ? '800' : '400'}; display:flex; flex-direction:column; gap:4px;">
                        <div>${t1p1} ${renderChangeSpan(m.team1[0])}</div>
                        <div>${t1p2} ${renderChangeSpan(m.team1[1])}</div>
                    </div>
                </td>
                <td style="font-size:16px; font-weight:900; text-align:center;">
                    <span style="color:${m.winner === 1 ? 'var(--accent-emerald)' : 'inherit'}">${m.score.team1}</span>
                    <span style="color:var(--text-muted)">:</span>
                    <span style="color:${m.winner === 2 ? 'var(--accent-emerald)' : 'inherit'}">${m.score.team2}</span>
                    <div style="font-size:10px; color:var(--text-muted); font-weight:normal; margin-top:2px;">${setDetail}</div>
                </td>
                <td>
                    <div style="font-weight:${m.winner === 2 ? '800' : '400'}; display:flex; flex-direction:column; gap:4px;">
                        <div>${t2p1} ${renderChangeSpan(m.team2[0])}</div>
                        <div>${t2p2} ${renderChangeSpan(m.team2[1])}</div>
                    </div>
                </td>
                <td>
                    <button class="btn-delete-match" onclick="triggerRollbackMatch('${m.id}')">刪除回滾</button>
                </td>
            </tr>
        `;
        container.insertAdjacentHTML("beforeend", trHTML);
    });
}

function triggerRollbackMatch(matchId) {
    if (confirm("⚠️ 您確定要刪除這場比賽嗎？刪除後將「自動扣回/加回」四位球員的積分並還原等級狀態！此操作不可逆！")) {
        const success = rollbackMatch(matchId);
        if (success) {
            alert("比賽已成功刪除，球員積分已成功回退！");
            renderMatchHistory();
            saveToStorage();
        } else {
            alert("刪除失敗，找不到該筆賽事資料。");
        }
    }
}

// E. 渲染系統設定 Settings
function renderSettings() {
    document.getElementById("set-elo-mode").value = state.settings.eloMode || "weight";
    document.getElementById("set-k-factor").value = state.settings.kFactor || 32;

    const levels = state.settings.ratingLevels || DEFAULT_LEVELS;
    const sortedLevels = [...levels].sort((a, b) => a.level - b.level);
    const list = document.getElementById("settings-levels-list");
    list.innerHTML = "";

    sortedLevels.forEach((lvl, idx) => {
        const rowHTML = `
            <div class="level-config-row">
                <div class="level-config-badge" style="color:${lvl.color}">L${lvl.level}</div>
                <input type="text" class="form-control" id="cfg-lvl-name-${lvl.level}" value="${lvl.name}" style="height:32px; font-size:12px;">
                <input type="number" class="form-control" id="cfg-lvl-min-${lvl.level}" value="${lvl.min}" style="height:32px; font-size:12px;">
                <input type="number" class="form-control" id="cfg-lvl-max-${lvl.level}" value="${lvl.max}" style="height:32px; font-size:12px;">
            </div>
        `;
        list.insertAdjacentHTML("beforeend", rowHTML);
    });

    // 匯出備份區
    document.getElementById("set-backup-area").value = exportBackup();
}

// 保存系統設定
function saveSystemSettings() {
    state.settings.eloMode = document.getElementById("set-elo-mode").value;
    state.settings.kFactor = parseInt(document.getElementById("set-k-factor").value) || 32;

    const levels = state.settings.ratingLevels || DEFAULT_LEVELS;
    
    levels.forEach(lvl => {
        lvl.name = document.getElementById(`cfg-lvl-name-${lvl.level}`).value;
        lvl.min = parseInt(document.getElementById(`cfg-lvl-min-${lvl.level}`).value) || 0;
        lvl.max = parseInt(document.getElementById(`cfg-lvl-max-${lvl.level}`).value) || 9999;
    });

    saveToStorage();
    alert("系統設定保存成功！");
    renderSettings();
}

// === 10. 會員檔案 Modal 彈窗機制 ===
function openMemberDetailModal(memberId) {
    const member = state.members.find(m => m.id === memberId);
    if (!member) return;

    // 塞入資料
    document.getElementById("md-avatar").innerText = member.name.charAt(0);
    document.getElementById("md-avatar").style.cssText = getAvatarStyle(member.avatarColor);
    document.getElementById("md-name").innerText = member.name;

    const lvlInfo = getLevelInfo(member.rating);
    document.getElementById("md-rating").innerText = `${member.rating}分`;
    document.getElementById("md-level-badge").innerText = `L${lvlInfo.level} - ${lvlInfo.name}`;
    document.getElementById("md-level-badge").style.cssText = `background:${lvlInfo.color}22; color:${lvlInfo.color}; border:1px solid ${lvlInfo.color}33;`;

    document.getElementById("md-stat-played").innerText = member.matchesPlayed;
    document.getElementById("md-stat-wins").innerText = member.wins;
    document.getElementById("md-stat-losses").innerText = member.losses;

    // 1. 勝率圓餅圖 SVG
    generateWinRatePieSVG("md-win-rate-pie", member.wins, member.losses);

    // 2. 積分趨勢折線圖 SVG
    generateTrendChartSVG("md-trend-chart", member.ratingHistory);

    // 3. 計算最佳拍檔 (統計該隊員雙打打贏的場次中，誰是他的搭檔次數最多)
    let partnerWins = {};
    state.matches.forEach(m => {
        const isTeam1 = m.team1.includes(member.id);
        const isWinner = (isTeam1 && m.winner === 1) || (!isTeam1 && m.winner === 2);
        
        if (isWinner) {
            const team = isTeam1 ? m.team1 : m.team2;
            const partnerId = team.find(id => id !== member.id);
            if (partnerId) {
                partnerWins[partnerId] = (partnerWins[partnerId] || 0) + 1;
            }
        }
    });

    let bestPartnerName = "尚無最佳拍檔";
    let maxWins = 0;
    for (let pid in partnerWins) {
        if (partnerWins[pid] > maxWins) {
            maxWins = partnerWins[pid];
            bestPartnerName = state.members.find(p => p.id === pid)?.name || "未知球員";
        }
    }
    
    if (maxWins > 0) {
        document.getElementById("md-best-partner").innerText = `${bestPartnerName} (攜手勝 ${maxWins} 場)`;
        document.getElementById("md-best-partner").style.color = "var(--accent-emerald)";
    } else {
        document.getElementById("md-best-partner").innerText = bestPartnerName;
        document.getElementById("md-best-partner").style.color = "var(--text-muted)";
    }

    // 3.2. 設定姓名修改編輯器
    const nameDisplayBox = document.getElementById("md-name-display-box");
    const nameEditBox = document.getElementById("md-name-edit-box");
    const nameInput = document.getElementById("md-name-input");
    
    nameDisplayBox.style.display = "flex";
    nameEditBox.style.display = "none";
    nameInput.value = member.name;

    document.getElementById("md-edit-name-btn").onclick = (e) => {
        e.stopPropagation();
        nameDisplayBox.style.display = "none";
        nameEditBox.style.display = "flex";
        nameInput.focus();
        nameInput.select();
    };

    document.getElementById("md-cancel-name-btn").onclick = (e) => {
        e.stopPropagation();
        nameDisplayBox.style.display = "flex";
        nameEditBox.style.display = "none";
    };

    document.getElementById("md-save-name-btn").onclick = (e) => {
        e.stopPropagation();
        const newName = nameInput.value.trim();
        if (!newName) {
            alert("請輸入有效的會員姓名！");
            return;
        }

        const oldName = member.name;
        if (newName === oldName) {
            nameDisplayBox.style.display = "flex";
            nameEditBox.style.display = "none";
            return;
        }

        // 檢查是否有同名會員
        const isDuplicate = state.members.some(m => m.id !== member.id && m.name.toLowerCase() === newName.toLowerCase());
        if (isDuplicate) {
            alert("已存在相同姓名的會員，請使用其他姓名！");
            return;
        }

        // 更新姓名
        member.name = newName;
        saveToStorage();

        // 更新 Modal 內的文字與頭像字首
        document.getElementById("md-name").innerText = newName;
        document.getElementById("md-avatar").innerText = newName.charAt(0);

        nameDisplayBox.style.display = "flex";
        nameEditBox.style.display = "none";

        // 重新整理視圖
        renderDashboard();
        renderMembers();

        alert(`已成功將姓名「${oldName}」修改為「${newName}」！`);
    };

    // 3.5. 設定積分修改編輯器
    const displayBox = document.getElementById("md-rating-display-box");
    const editBox = document.getElementById("md-rating-edit-box");
    const ratingInput = document.getElementById("md-rating-input");
    
    displayBox.style.display = "flex";
    editBox.style.display = "none";
    ratingInput.value = member.rating;

    document.getElementById("md-edit-rating-btn").onclick = (e) => {
        e.stopPropagation();
        displayBox.style.display = "none";
        editBox.style.display = "flex";
        ratingInput.focus();
        ratingInput.select();
    };

    document.getElementById("md-cancel-rating-btn").onclick = (e) => {
        e.stopPropagation();
        displayBox.style.display = "flex";
        editBox.style.display = "none";
    };

    document.getElementById("md-save-rating-btn").onclick = (e) => {
        e.stopPropagation();
        const newRating = parseInt(ratingInput.value);
        if (isNaN(newRating) || newRating < 0 || newRating > 9999) {
            alert("請輸入有效的積分數值 (0 ~ 9999)！");
            return;
        }

        const oldRating = member.rating;
        if (newRating === oldRating) {
            displayBox.style.display = "flex";
            editBox.style.display = "none";
            return;
        }

        member.rating = newRating;
        member.ratingHistory.push({
            date: Date.now(),
            rating: newRating,
            matchId: "manual_edit_" + Date.now()
        });

        saveToStorage();

        document.getElementById("md-rating").innerText = `${newRating}分`;
        const newLvlInfo = getLevelInfo(newRating);
        document.getElementById("md-level-badge").innerText = `L${newLvlInfo.level} - ${newLvlInfo.name}`;
        document.getElementById("md-level-badge").style.cssText = `background:${newLvlInfo.color}22; color:${newLvlInfo.color}; border:1px solid ${newLvlInfo.color}33;`;

        generateTrendChartSVG("md-trend-chart", member.ratingHistory);

        displayBox.style.display = "flex";
        editBox.style.display = "none";

        renderDashboard();
        renderMembers();

        alert(`已成功將「${member.name}」的積分從 ${oldRating}分 修改為 ${newRating}分！`);
    };

    // 4. 設定刪除按鈕關聯
    const deleteBtn = document.getElementById("md-delete-btn");
    deleteBtn.onclick = () => {
        if (confirm(`⚠️ 您確定要刪除會員「${member.name}」嗎？若已有參賽紀錄，請先將其比賽全部回滾刪除後方可移除此會員。`)) {
            const res = deleteMember(member.id);
            if (res.success) {
                alert("該會員已成功刪除！");
                closeModal("member-detail-modal");
                renderMembers();
            } else {
                alert(res.reason);
            }
        }
    };

    openModal("member-detail-modal");
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add("active");
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove("active");
}

// === 11. 等級升降通知華麗彈出 ===
function openLevelChangeAlert(changes) {
    if (!changes || changes.length === 0) return;
    
    const overlay = document.getElementById("level-alert-overlay");
    const card = document.getElementById("level-alert-card");

    // 播放第一個升降級球員
    const c = changes[0];

    document.getElementById("alert-pname").innerText = c.playerName;
    
    const title = c.direction === "up" ? "🎉 恭喜升級啦！" : "💪 不要灰心！下次贏回來！";
    document.getElementById("alert-title").innerText = title;
    
    const desc = c.direction === "up" 
        ? `太棒了！您的實力獲得了跨越式提升，順利突破積分關卡，登上了更高的桌球殿堂！` 
        : `本次賽事發揮稍有波動，積分跨越了等級邊界。重新調整戰術，下次一定升回來！`;
    document.getElementById("alert-desc").innerText = desc;

    // 徽章樣式
    const badgeOld = document.getElementById("alert-badge-old");
    const badgeNew = document.getElementById("alert-badge-new");

    badgeOld.innerText = `L${c.oldLvl.level} ${c.oldLvl.name.split(" ")[0]}`;
    badgeOld.style.cssText = `background:${c.oldLvl.color}22; color:${c.oldLvl.color}; border:1px solid ${c.oldLvl.color}33;`;

    badgeNew.innerText = `L${c.newLvl.level} ${c.newLvl.name.split(" ")[0]}`;
    badgeNew.style.cssText = `background:${c.newLvl.color}22; color:${c.newLvl.color}; border:1px solid ${c.newLvl.color}33;`;

    card.className = "glow-alert-card " + c.direction;

    // 點擊關閉
    const btn = document.getElementById("alert-close-btn");
    btn.onclick = () => {
        overlay.classList.remove("active");
        
        // 如果還有其他會員升降級，排程播放
        if (changes.length > 1) {
            setTimeout(() => {
                openLevelChangeAlert(changes.slice(1));
            }, 500);
        }
    };

    overlay.classList.add("active");
}

// === 12. 應用程式入口與事件初始化 ===
document.addEventListener("DOMContentLoaded", () => {
    // 註冊 PWA Service Worker 離線快取（支援跨平台與離線使用）
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js")
            .then(reg => console.log("PWA Service Worker 註冊成功，運行網域範圍:", reg.scope))
            .catch(err => console.error("PWA Service Worker 註冊失敗:", err));
    }

    // A. 載入 LocalStorage
    initStorage();

    // B. 若是新系統，先載入預設示範數據
    if (state.members.length === 0) {
        loadDemoData();
    }

    // C. 綁定導航欄切換
    const views = ["dashboard", "members", "match-recorder", "match-history", "settings"];
    views.forEach(v => {
        document.getElementById(`nav-${v}`).addEventListener("click", () => switchView(v));
    });

    // 預設進入 Dashboard 視圖
    switchView("dashboard");

    // D. 綁定會員管理搜尋與排序
    document.getElementById("member-search").addEventListener("input", renderMembers);
    document.getElementById("member-sort-select").addEventListener("change", renderMembers);

    // E. 綁定雙打球員選擇器 (即時預測與下拉互斥)
    const mrSelectors = ["mr-t1p1", "mr-t1p2", "mr-t2p1", "mr-t2p2"];
    mrSelectors.forEach(selId => {
        document.getElementById(selId).addEventListener("change", () => {
            renderMatchRecorder(); // 自動互斥，更新下拉項
        });
    });

    // G. 綁定提交比賽紀錄按鈕
    document.getElementById("mr-submit-btn").addEventListener("click", () => {
        const idA = document.getElementById("mr-t1p1").value;
        const idB = document.getElementById("mr-t1p2").value;
        const idC = document.getElementById("mr-t2p1").value;
        const idD = document.getElementById("mr-t2p2").value;

        const s1 = parseInt(document.getElementById("mr-score-t1").value);
        const s2 = parseInt(document.getElementById("mr-score-t2").value);

        if (!idA || !idB || !idC || !idD) {
            alert("請選擇所有四名球員！");
            return;
        }

        if (isNaN(s1) || isNaN(s2) || s1 === s2) {
            alert("請輸入有效的局數比數，且比數不能平手！");
            return;
        }

        // 執行錄入比賽 (無小分，傳入空陣列)
        const res = recordMatch(idA, idB, idC, idD, s1, s2, []);

        if (res && res.success) {
            // 1. 播放彩紙
            startConfetti();

            // 2. 清空表單
            mrSelectors.forEach(s => document.getElementById(s).value = "");
            document.getElementById("mr-score-t1").value = "";
            document.getElementById("mr-score-t2").value = "";

            // 3. 跳轉至 Dashboard
            switchView("dashboard");

            // 4. 等 1.2 秒播放升降級彈窗
            if (res.levelChanges.length > 0) {
                setTimeout(() => {
                    openLevelChangeAlert(res.levelChanges);
                }, 1200);
            }
        } else {
            alert("比賽錄入失敗，請檢查資料是否正確！");
        }
    });

    // H. 歷史分頁
    document.getElementById("history-prev-btn").addEventListener("click", () => {
        if (historyPage > 1) {
            historyPage--;
            renderMatchHistory();
        }
    });
    document.getElementById("history-next-btn").addEventListener("click", () => {
        historyPage++;
        renderMatchHistory();
    });
    document.getElementById("history-search").addEventListener("input", () => {
        historyPage = 1;
        renderMatchHistory();
    });

    // I. 新增會員彈窗互動
    let activeAddMode = "single";

    const btnSingleTab = document.getElementById("btn-add-single-tab");
    const btnBulkTab = document.getElementById("btn-add-bulk-tab");
    const singleContainer = document.getElementById("add-single-mode-container");
    const bulkContainer = document.getElementById("add-bulk-mode-container");

    function setAddMode(mode) {
        activeAddMode = mode;
        if (mode === "single") {
            btnSingleTab.classList.add("active");
            btnBulkTab.classList.remove("active");
            singleContainer.style.display = "block";
            bulkContainer.style.display = "none";
        } else {
            btnSingleTab.classList.remove("active");
            btnBulkTab.classList.add("active");
            singleContainer.style.display = "none";
            bulkContainer.style.display = "block";
        }
    }

    btnSingleTab.addEventListener("click", () => setAddMode("single"));
    btnBulkTab.addEventListener("click", () => setAddMode("bulk"));

    document.getElementById("btn-open-add-member").addEventListener("click", () => {
        // 重設表單
        document.getElementById("add-mname").value = "";
        document.getElementById("add-mbulk-names").value = "";
        document.getElementById("add-mrating").value = 1200;
        document.getElementById("add-mhue").value = 180;
        
        // 設定預設為單個新增模式
        setAddMode("single");

        // 更新預覽
        document.getElementById("add-preview-avatar").innerText = "新";
        document.getElementById("add-preview-avatar").style.cssText = getAvatarStyle(180);

        openModal("add-member-modal");
    });

    // 頭像顏色拉條監聽
    document.getElementById("add-mhue").addEventListener("input", (e) => {
        const val = e.target.value;
        const name = document.getElementById("add-mname").value || "新";
        document.getElementById("add-preview-avatar").innerText = name.charAt(0);
        document.getElementById("add-preview-avatar").style.cssText = getAvatarStyle(val);
    });

    document.getElementById("add-mname").addEventListener("input", (e) => {
        const val = e.target.value || "新";
        const hue = document.getElementById("add-mhue").value;
        document.getElementById("add-preview-avatar").innerText = val.charAt(0);
    });

    document.getElementById("btn-submit-add-member").addEventListener("click", () => {
        const rating = parseInt(document.getElementById("add-mrating").value) || 1200;

        if (activeAddMode === "single") {
            const name = document.getElementById("add-mname").value;
            const hue = document.getElementById("add-mhue").value;

            if (!name.trim()) {
                alert("請輸入會員姓名！");
                return;
            }

            const newM = addMember(name, rating, hue);
            if (newM) {
                alert(`已成功建立新會員「${newM.name}」，初始積分為 ${newM.rating}分！`);
                closeModal("add-member-modal");
                renderMembers();
            } else {
                alert("建立失敗。");
            }
        } else {
            const bulkText = document.getElementById("add-mbulk-names").value;
            // 依行拆分並過濾空行
            const names = bulkText
                .split("\n")
                .map(n => n.trim())
                .filter(n => n.length > 0);

            if (names.length === 0) {
                alert("請輸入或貼上至少一個會員姓名！");
                return;
            }

            let successCount = 0;
            names.forEach(name => {
                // 為批次新增的球員生成 0~359 之間的隨機 HSL 色相
                const randomHue = Math.floor(Math.random() * 360);
                const newM = addMember(name, rating, randomHue);
                if (newM) successCount++;
            });

            alert(`🎉 已成功批次建立 ${successCount} 位會員，初始積分皆為 ${rating}分！`);
            closeModal("add-member-modal");
            renderMembers();
        }
    });

    // J. 備份匯出匯入
    document.getElementById("btn-save-settings").addEventListener("click", saveSystemSettings);

    document.getElementById("btn-load-demo").addEventListener("click", () => {
        if (confirm("⚠️ 這將載入 10 名虛擬會員及多場雙打對戰紀錄！會覆蓋您目前的資料。確定繼續嗎？")) {
            loadDemoData();
            alert("示範數據種子載入成功！");
            switchView("dashboard");
        }
    });

    document.getElementById("btn-reset-db").addEventListener("click", () => {
        if (confirm("❌ 警告：這將徹底清除所有會員與對戰歷史數據！確定要重置嗎？")) {
            clearAllData();
            alert("數據庫已成功重置！");
            switchView("dashboard");
        }
    });

    document.getElementById("btn-import-backup").addEventListener("click", () => {
        const json = document.getElementById("set-backup-area").value;
        const res = importBackup(json);
        if (res.success) {
            alert("備份資料導入成功！");
            switchView("dashboard");
        } else {
            alert("導入失敗：" + res.reason);
        }
    });

    // 輔助函式：從等級字串（如 L5, Level 5, 5）推導預設初始積分
    function getRatingFromLevelStr(levelStr) {
        if (!levelStr) return null;
        const match = levelStr.match(/\d+/);
        if (!match) return null;
        const lvlNum = parseInt(match[0]);
        if (lvlNum >= 1 && lvlNum <= 10) {
            const levels = state.settings.ratingLevels || DEFAULT_LEVELS;
            const lvlObj = levels.find(l => l.level === lvlNum);
            if (lvlObj) {
                if (lvlNum === 10) return 700; // L10 設為 700
                return lvlObj.min; // 其餘等級使用下限值，例如 L7 得到 1200
            }
        }
        return null;
    }

    // K. CSV 會員資料匯出與匯入事件綁定
    document.getElementById("btn-export-csv").addEventListener("click", () => {
        if (state.members.length === 0) {
            alert("目前尚無會員資料可供匯出！");
            return;
        }

        try {
            // 加入 UTF-8 BOM (\uFEFF) 確保 Windows Excel 中文不亂碼
            const header = "姓名,積分,等級\r\n";
            const rows = state.members.map(m => {
                const safeName = m.name.replace(/"/g, '""');
                const lvlInfo = getLevelInfo(m.rating);
                const lvlDisplay = `L${lvlInfo.level} ${lvlInfo.name.split(" ")[0]}`;
                return `"${safeName}",${m.rating},"${lvlDisplay}"`;
            }).join("\r\n");

            const csvContent = "\uFEFF" + header + rows;
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);

            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, "0");
            const day = String(now.getDate()).padStart(2, "0");
            link.setAttribute("download", `朝友桌球會員名單_${year}${month}${day}.csv`);
            link.style.visibility = "hidden";
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            alert("匯出 CSV 發生錯誤：" + err.message);
        }
    });

    const csvFileInput = document.getElementById("csv-import-input");
    document.getElementById("btn-trigger-csv-import").addEventListener("click", () => {
        csvFileInput.value = ""; // 重設上傳狀態
        csvFileInput.click();
    });

    csvFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const text = evt.target.result;
                const lines = text.split(/\r?\n/);

                let successCount = 0;
                let updateCount = 0;
                let newCount = 0;

                lines.forEach((line, index) => {
                    const cleanLine = line.trim();
                    if (!cleanLine) return; // 跳過空行

                    // 使用逗號分割，防範引號
                    const parts = cleanLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                    if (parts.length >= 2) {
                        let name = parts[0].replace(/^["']|["']$/g, "").trim();
                        let ratingStr = parts[1] ? parts[1].replace(/^["']|["']$/g, "").trim() : "";
                        let levelStr = parts[2] ? parts[2].replace(/^["']|["']$/g, "").trim() : "";

                        // 跳過標頭行 (如 姓名,積分,等級 或 Name,Rating,Level)
                        if (index === 0 && (name.includes("姓名") || name.toLowerCase().includes("name"))) {
                            return;
                        }

                        if (name) {
                            let ratingVal = parseInt(ratingStr);
                            if (isNaN(ratingVal)) {
                                // 嘗試從 ratingStr 解析等級 (適用於 2 欄位只有等級的情況，例如: 王大明,L4)
                                let parsedRating = getRatingFromLevelStr(ratingStr);
                                if (parsedRating !== null) {
                                    ratingVal = parsedRating;
                                } else {
                                    // 嘗試從 levelStr 解析等級 (適用於 3 欄位且第二欄不是數字的情況，例如: 王大明,,L4)
                                    parsedRating = getRatingFromLevelStr(levelStr);
                                    if (parsedRating !== null) {
                                        ratingVal = parsedRating;
                                    } else {
                                        ratingVal = 1200; // 預設積分值
                                    }
                                }
                            }

                            // 檢查會員是否存在
                            let existing = state.members.find(m => m.name.toLowerCase() === name.toLowerCase());
                            if (existing) {
                                // 增量更新評分，並追加積分走勢點
                                existing.rating = ratingVal;
                                existing.ratingHistory.push({
                                    date: Date.now() + index, // 微小偏移以防走勢圖鍵值衝突
                                    rating: ratingVal,
                                    matchId: "csv_import"
                                });
                                updateCount++;
                            } else {
                                // 建立全新會員
                                const randomHue = Math.floor(Math.random() * 360);
                                const newId = "member_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5) + "_" + index;
                                const newMember = {
                                    id: newId,
                                    name: name,
                                    rating: ratingVal,
                                    avatarColor: randomHue.toString(),
                                    initialRating: ratingVal,
                                    matchesPlayed: 0,
                                    wins: 0,
                                    losses: 0,
                                    streak: 0,
                                    ratingHistory: [
                                        { date: Date.now() + index, rating: ratingVal, matchId: "init" }
                                    ]
                                };
                                state.members.push(newMember);
                                newCount++;
                            }
                            successCount++;
                        }
                    }
                });

                if (successCount > 0) {
                    saveToStorage();
                    switchView("dashboard");
                    startConfetti();
                    alert(`🎉 會員名單 CSV 匯入成功！\n\n🔹 新增註冊：${newCount} 位新會員\n🔹 積分更新：${updateCount} 位舊會員\n🔹 總計處理：${successCount} 筆球員資料。`);
                } else {
                    alert("❌ 匯入失敗：檔案內沒有找到有效的「姓名,積分」或「姓名,等級」格式列。");
                }
            } catch (err) {
                alert("❌ 解析 CSV 檔案時發生錯誤：" + err.message);
            }
        };
        reader.readAsText(file, "UTF-8");
    });

    // L. 等級規則 CSV 匯出與匯入
    document.getElementById("btn-export-levels-csv").addEventListener("click", () => {
        const levels = state.settings.ratingLevels || DEFAULT_LEVELS;
        const sortedLevels = [...levels].sort((a, b) => a.level - b.level);
        
        try {
            // 加入 UTF-8 BOM (\uFEFF) 確保 Windows Excel 中文不亂碼
            const header = "等級,等級名稱,積分下限,積分上限\r\n";
            const rows = sortedLevels.map(lvl => {
                const safeName = lvl.name.replace(/"/g, '""');
                return `${lvl.level},"${safeName}",${lvl.min},${lvl.max}`;
            }).join("\r\n");

            const csvContent = "\uFEFF" + header + rows;
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);

            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, "0");
            const day = String(now.getDate()).padStart(2, "0");
            link.setAttribute("download", `朝友桌球等級分數規則_${year}${month}${day}.csv`);
            link.style.visibility = "hidden";
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            alert("匯出等級規則 CSV 發生錯誤：" + err.message);
        }
    });

    const levelsFileInput = document.getElementById("levels-csv-import-input");
    document.getElementById("btn-trigger-levels-csv-import").addEventListener("click", () => {
        levelsFileInput.value = ""; // 重設上傳狀態
        levelsFileInput.click();
    });

    levelsFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const text = evt.target.result;
                const lines = text.split(/\r?\n/);

                let newLevels = [];
                let successCount = 0;

                lines.forEach((line, index) => {
                    const cleanLine = line.trim();
                    if (!cleanLine) return; // 跳過空行

                    // 使用逗號分割，防範引號
                    const parts = cleanLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                    if (parts.length >= 4) {
                        let levelStr = parts[0].replace(/^["']|["']$/g, "").trim();
                        let name = parts[1].replace(/^["']|["']$/g, "").trim();
                        let minStr = parts[2].replace(/^["']|["']$/g, "").trim();
                        let maxStr = parts[3].replace(/^["']|["']$/g, "").trim();

                        // 跳過標頭行
                        if (index === 0 && (name.includes("名稱") || name.toLowerCase().includes("name") || levelStr.includes("等級"))) {
                            return;
                        }

                        let lvlVal = parseInt(levelStr);
                        let minVal = parseInt(minStr);
                        let maxVal = parseInt(maxStr);

                        if (!isNaN(lvlVal) && name && !isNaN(minVal) && !isNaN(maxVal)) {
                            const oldLvl = (state.settings.ratingLevels || DEFAULT_LEVELS).find(l => l.level === lvlVal);
                            const color = oldLvl ? oldLvl.color : "#94a3b8";

                            newLevels.push({
                                level: lvlVal,
                                name: name,
                                min: minVal,
                                max: maxVal,
                                color: color
                            });
                            successCount++;
                        }
                    }
                });

                if (successCount > 0) {
                    newLevels.sort((a, b) => a.min - b.min);
                    state.settings.ratingLevels = newLevels;
                    saveToStorage();
                    
                    renderSettings();
                    renderDashboard();
                    renderMembers();
                    
                    startConfetti();
                    alert(`🎉 等級分數規則 CSV 匯入成功！共導入 ${successCount} 個等級區間。`);
                } else {
                    alert("❌ 匯入失敗：檔案內沒有找到有效的「等級,等級名稱,積分下限,積分上限」格式列。");
                }
            } catch (err) {
                alert("❌ 解析 CSV 檔案時發生錯誤：" + err.message);
            }
        };
        reader.readAsText(file, "UTF-8");
    });
});
