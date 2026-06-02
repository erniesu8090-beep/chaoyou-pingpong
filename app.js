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

// 輔助函式：從 LocalStorage 載入
function loadFromLocalStorage() {
    const savedMembers = localStorage.getItem("cy_members");
    const savedMatches = localStorage.getItem("cy_matches");
    const savedSettings = localStorage.getItem("cy_settings");

    if (savedMembers) state.members = JSON.parse(savedMembers);
    if (savedMatches) state.matches = JSON.parse(savedMatches);
    if (savedSettings) state.settings = JSON.parse(savedSettings);
}

// 更新同步狀態 UI 顯示
function updateSyncStatus(status, text) {
    const el = document.getElementById("sync-status");
    if (!el) return;
    el.className = "sync-badge " + status;
    el.textContent = text;
}

// 初始化 數據 (非同步：支援伺服器 Wifi 同步或 LocalStorage 降級)
async function initStorage() {
    const isHttp = window.location.protocol.startsWith("http");
    
    if (isHttp) {
        try {
            updateSyncStatus("loading", "同步中...");
            const res = await fetch("/api/db", {
                method: "GET",
                headers: { "Cache-Control": "no-cache" }
            });
            if (!res.ok) throw new Error("HTTP Status " + res.status);
            
            const dbData = await res.json();
            
            // 檢查伺服器回傳的是否為空資料庫 (例如剛啟動無 database.json)
            const isDbEmpty = !dbData || 
                              (!dbData.members && !dbData.matches && !dbData.settings) || 
                              (Array.isArray(dbData.members) && dbData.members.length === 0 && Array.isArray(dbData.matches) && dbData.matches.length === 0);
            
            if (isDbEmpty) {
                // 伺服器無資料，嘗試把當前客戶端的 LocalStorage 資料推上去 (無縫升級)
                loadFromLocalStorage();
                updateSyncStatus("online", "📶 區網同步中 🔄");
                
                // 如果 LocalStorage 也有資料，立即寫入伺服器
                if (state.members.length > 0) {
                    await saveToStorage();
                }
            } else {
                // 伺服器有資料，載入並同步更新本地 LocalStorage
                if (dbData.members) state.members = dbData.members;
                if (dbData.matches) state.matches = dbData.matches;
                if (dbData.settings) state.settings = dbData.settings;
                
                // 同時備份一份在 LocalStorage 中
                localStorage.setItem("cy_members", JSON.stringify(state.members));
                localStorage.setItem("cy_matches", JSON.stringify(state.matches));
                localStorage.setItem("cy_settings", JSON.stringify(state.settings));
                
                updateSyncStatus("online", "📶 區網同步中 🔄");
            }
        } catch (err) {
            console.warn("連線至伺服器同步失敗，降級為本地單機模式:", err);
            loadFromLocalStorage();
            updateSyncStatus("error", "⚠️ 同步失敗 (點擊重試) 🔄");
        }
    } else {
        // file:// 協定直接載入 LocalStorage
        loadFromLocalStorage();
        updateSyncStatus("offline", "💾 單機模式");
    }

    migrateSettingsIfNeeded();
}

async function saveToStorage() {
    // 1. 先儲存到本地 LocalStorage 確保萬無一失
    localStorage.setItem("cy_members", JSON.stringify(state.members));
    localStorage.setItem("cy_matches", JSON.stringify(state.matches));
    localStorage.setItem("cy_settings", JSON.stringify(state.settings));

    // 2. 若為 HTTP 模式，則非同步向伺服器同步寫入
    const isHttp = window.location.protocol.startsWith("http");
    if (isHttp) {
        try {
            const dbPayload = {
                members: state.members,
                matches: state.matches,
                settings: state.settings
            };
            const res = await fetch("/api/db", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(dbPayload)
            });
            if (!res.ok) throw new Error("HTTP Status " + res.status);
            updateSyncStatus("online", "📶 區網同步中 🔄");
        } catch (err) {
            console.error("同步儲存至伺服器失敗:", err);
            updateSyncStatus("error", "⚠️ 同步失敗 (點擊重試) 🔄");
        }
    }
}

// 吐司通知提示（頂級 UI 反饋）
function showToast(message) {
    let toast = document.getElementById("sync-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "sync-toast";
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: rgba(16, 185, 129, 0.95);
            color: #fff;
            padding: 12px 24px;
            border-radius: 50px;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
            opacity: 0;
            z-index: 9999;
            pointer-events: none;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    setTimeout(() => {
        toast.style.transform = "translateX(-50%) translateY(0)";
        toast.style.opacity = "1";
    }, 50);
    setTimeout(() => {
        toast.style.transform = "translateX(-50%) translateY(100px)";
        toast.style.opacity = "0";
    }, 2500);
}

// 重新整理當前視圖資料
function refreshCurrentView() {
    const views = ["dashboard", "members", "match-recorder", "match-history", "settings"];
    for (const view of views) {
        const btn = document.getElementById(`nav-${view}`);
        if (btn && btn.classList.contains("active")) {
            if (view === "dashboard") renderDashboard();
            else if (view === "members") renderMembers();
            else if (view === "match-recorder") renderMatchRecorder();
            else if (view === "match-history") renderMatchHistory();
            else if (view === "settings") renderSettings();
            break;
        }
    }
}

// 手動強制拉取伺服器最新資料
async function manualSync() {
    const isHttp = window.location.protocol.startsWith("http");
    if (!isHttp) {
        showToast("💾 目前處於單機模式，無須同步");
        return;
    }
    
    updateSyncStatus("loading", "同步中...");
    try {
        const res = await fetch("/api/db", {
            method: "GET",
            headers: { "Cache-Control": "no-cache" }
        });
        if (!res.ok) throw new Error("HTTP Status " + res.status);
        
        const dbData = await res.json();
        
        const isDbEmpty = !dbData || 
                          (!dbData.members && !dbData.matches && !dbData.settings) || 
                          (Array.isArray(dbData.members) && dbData.members.length === 0 && Array.isArray(dbData.matches) && dbData.matches.length === 0);
        
        if (isDbEmpty) {
            if (state.members.length > 0) {
                // 客戶端有資料但伺服器沒有，自動上傳
                await saveToStorage();
                showToast("📤 伺服器資料為空，已將本機資料上傳同步！");
            } else {
                updateSyncStatus("online", "📶 區網同步中 🔄");
                showToast("ℹ️ 伺服器資料為空，且本地也無資料");
            }
        } else {
            if (dbData.members) state.members = dbData.members;
            if (dbData.matches) state.matches = dbData.matches;
            if (dbData.settings) state.settings = dbData.settings;
            
            localStorage.setItem("cy_members", JSON.stringify(state.members));
            localStorage.setItem("cy_matches", JSON.stringify(state.matches));
            localStorage.setItem("cy_settings", JSON.stringify(state.settings));
            
            refreshCurrentView();
            updateSyncStatus("online", "📶 區網同步中 🔄");
            showToast("🎉 同步成功！已載入最新數據");
        }
    } catch (err) {
        console.error("手動同步失敗:", err);
        updateSyncStatus("error", "⚠️ 同步失敗 (點擊重試) 🔄");
        showToast("❌ 同步失敗，請檢查網路與伺服器");
    }
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
    document.querySelectorAll("header .nav-btn").forEach(btn => {
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
document.addEventListener("DOMContentLoaded", async () => {
    // 註冊 PWA Service Worker 離線快取（支援跨平台與離線使用）
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js")
            .then(reg => console.log("PWA Service Worker 註冊成功，運行網域範圍:", reg.scope))
            .catch(err => console.error("PWA Service Worker 註冊失敗:", err));
    }

    // A. 載入 數據 (可能為伺服器 API 同步，或 LocalStorage 降級)
    await initStorage();

    // 綁定手動同步按鈕
    const syncStatusEl = document.getElementById("sync-status");
    if (syncStatusEl) {
        syncStatusEl.addEventListener("click", manualSync);
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
    });

    // === 批次賽事登錄相關事件與變數 ===
    let activeMatchMode = "single";
    const btnMatchSingleTab = document.getElementById("btn-match-single-tab");
    const btnMatchBatchTab = document.getElementById("btn-match-batch-tab");
    const matchSingleContainer = document.getElementById("match-single-container");
    const matchBatchContainer = document.getElementById("match-batch-container");

    function setMatchMode(mode) {
        activeMatchMode = mode;
        if (mode === "single") {
            btnMatchSingleTab.classList.add("active");
            btnMatchBatchTab.classList.remove("active");
            matchSingleContainer.style.display = "block";
            matchBatchContainer.style.display = "none";
        } else {
            btnMatchSingleTab.classList.remove("active");
            btnMatchBatchTab.classList.add("active");
            matchSingleContainer.style.display = "none";
            matchBatchContainer.style.display = "block";
        }
    }

    if (btnMatchSingleTab && btnMatchBatchTab) {
        btnMatchSingleTab.addEventListener("click", () => setMatchMode("single"));
        btnMatchBatchTab.addEventListener("click", () => setMatchMode("bulk"));
    }

    const btnParseBatch = document.getElementById("btn-parse-batch");
    if (btnParseBatch) {
        btnParseBatch.addEventListener("click", handleParseBatch);
    }

    const btnClearBatch = document.getElementById("btn-clear-batch");
    if (btnClearBatch) {
        btnClearBatch.addEventListener("click", () => {
            document.getElementById("batch-matches-input").value = "";
            document.getElementById("batch-preview-container").innerHTML = "";
            document.getElementById("batch-preview-area").style.display = "none";
            lastParsedMatches = [];
        });
    }

    const btnSubmitBatch = document.getElementById("btn-submit-batch");
    if (btnSubmitBatch) {
        btnSubmitBatch.addEventListener("click", handleSubmitBatch);
    }

    const batchCsvFileInput = document.getElementById("batch-csv-file-input");
    const btnTriggerBatchCsv = document.getElementById("btn-trigger-batch-csv");
    if (btnTriggerBatchCsv && batchCsvFileInput) {
        btnTriggerBatchCsv.addEventListener("click", () => {
            batchCsvFileInput.value = ""; // 重設以利重複上傳同檔案
            batchCsvFileInput.click();
        });
        
        batchCsvFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const text = evt.target.result;
                    // 將 CSV 內容填入 Textarea
                    document.getElementById("batch-matches-input").value = text;
                    // 自動觸發解析與預覽
                    handleParseBatch();
                } catch (err) {
                    alert("❌ 讀取 CSV 檔案失敗：" + err.message);
                }
            };
        });
    }

    // === 單日積分報表相關事件 ===
    const btnOpenDailyReport = document.getElementById("btn-open-daily-report");
    if (btnOpenDailyReport) {
        btnOpenDailyReport.addEventListener("click", () => {
            // 從所有對戰紀錄中擷取不重複日期
            const dates = Array.from(new Set(state.matches.map(m => {
                const d = new Date(m.date);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }))).sort().reverse(); // 最新日期在前
            
            const repSelect = document.getElementById("rep-date-select");
            repSelect.innerHTML = "";
            
            if (dates.length === 0) {
                const d = new Date();
                const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                dates.push(todayStr);
            }
            
            dates.forEach(dt => {
                repSelect.insertAdjacentHTML("beforeend", `<option value="${dt}">${dt}</option>`);
            });
            
            // 預設生成最新一天的報表
            generateDailyReport(dates[0]);
            openModal("daily-report-modal");
        });
    }
    
    const repDateSelect = document.getElementById("rep-date-select");
    if (repDateSelect) {
        repDateSelect.addEventListener("change", (e) => {
            generateDailyReport(e.target.value);
        });
    }
    
    const btnPrintReport = document.getElementById("btn-print-report");
    if (btnPrintReport) {
        btnPrintReport.addEventListener("click", () => {
            window.print();
        });
    }
    
    const btnExportReportCsv = document.getElementById("btn-export-report-csv");
    if (btnExportReportCsv) {
        btnExportReportCsv.addEventListener("click", () => {
            const selectedDate = document.getElementById("rep-date-select").value;
            exportDailyReportCsv(selectedDate);
        });
    }
});

// === 批次賽事解析與登錄核心邏輯 ===
let lastParsedMatches = [];

function parseBatchMatches(text) {
    const lines = text.split(/\r?\n/);
    const parsed = [];
    
    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return; // 跳過空行
        
        // 1. 嘗試解析 CSV 逗號/Tab 分隔格式
        // 格式一: 隊伍1隊員1,隊伍1隊員2,隊伍2隊員1,隊伍2隊員2,比分1,比分2
        // 格式二: 隊伍1隊員1,隊伍1隊員2,比分1,比分2,隊伍2隊員1,隊伍2隊員2
        const csvParts = trimmed.split(/[,，\t]/).map(p => p.trim());
        if (csvParts.length === 6) {
            const num4 = parseInt(csvParts[4]);
            const num5 = parseInt(csvParts[5]);
            const num2 = parseInt(csvParts[2]);
            const num3 = parseInt(csvParts[3]);
            
            if (!isNaN(num4) && !isNaN(num5)) {
                parsed.push({
                    raw: trimmed,
                    lineNum: index + 1,
                    success: true,
                    team1: [csvParts[0], csvParts[1]],
                    team2: [csvParts[2], csvParts[3]],
                    score1: num4,
                    score2: num5
                });
                return;
            } else if (!isNaN(num2) && !isNaN(num3)) {
                parsed.push({
                    raw: trimmed,
                    lineNum: index + 1,
                    success: true,
                    team1: [csvParts[0], csvParts[1]],
                    team2: [csvParts[4], csvParts[5]],
                    score1: num2,
                    score2: num3
                });
                return;
            }
        }
        
        // 2. 嘗試解析自定義文字格式，搜尋比分分割，如 "3:1"、"3比1"、"3-1" 等
        const regex = /(\d+)\s*(?:[:：\-比]|vs\b|v\b|VS\b)\s*(\d+)/i;
        const match = trimmed.match(regex);
        
        if (!match) {
            parsed.push({
                raw: trimmed,
                lineNum: index + 1,
                success: false,
                error: "找不到有效的對戰大局比分（例如：3:1 或 3比2）"
            });
            return;
        }
        
        const score1 = parseInt(match[1]);
        const score2 = parseInt(match[2]);
        const scoreStr = match[0];
        
        const parts = trimmed.split(scoreStr);
        if (parts.length < 2) {
            parsed.push({
                raw: trimmed,
                lineNum: index + 1,
                success: false,
                error: "無法藉由比分正確分割左右隊伍"
            });
            return;
        }
        
        const leftText = parts[0].trim();
        const rightText = parts.slice(1).join(scoreStr).trim();
        
        // 分割隊員姓名
        const playerRegex = /[\/、\+&,\s]+/;
        const team1 = leftText.split(playerRegex).map(p => p.trim()).filter(p => p.length > 0);
        const team2 = rightText.split(playerRegex).map(p => p.trim()).filter(p => p.length > 0);
        
        if (team1.length !== 2) {
            parsed.push({
                raw: trimmed,
                lineNum: index + 1,
                success: false,
                error: `隊伍一解析出的人數不正確（${team1.length} 人：${team1.join(", ") || "無"}，應為 2 人）`
            });
            return;
        }
        if (team2.length !== 2) {
            parsed.push({
                raw: trimmed,
                lineNum: index + 1,
                success: false,
                error: `隊伍二解析出的人數不正確（${team2.length} 人：${team2.join(", ") || "無"}，應為 2 人）`
            });
            return;
        }
        
        parsed.push({
            raw: trimmed,
            lineNum: index + 1,
            success: true,
            team1: team1,
            team2: team2,
            score1: score1,
            score2: score2
        });
    });
    
    return parsed;
}

function handleParseBatch() {
    const inputText = document.getElementById("batch-matches-input").value;
    const autoRegister = document.getElementById("batch-auto-register").checked;
    const defaultRating = parseInt(document.getElementById("batch-default-rating").value) || 1200;
    
    if (!inputText.trim()) {
        alert("請先貼上賽事成績！");
        return;
    }
    
    const parsed = parseBatchMatches(inputText);
    lastParsedMatches = parsed;
    
    const container = document.getElementById("batch-preview-container");
    container.innerHTML = "";
    
    let successCount = 0;
    let errorCount = 0;
    let newPlayersSet = new Set();
    
    parsed.forEach(m => {
        if (!m.success) {
            errorCount++;
            container.insertAdjacentHTML("beforeend", `
                <div class="batch-preview-item error-row">
                    <div class="batch-preview-line-num">第 ${m.lineNum} 行</div>
                    <div class="batch-preview-teams" style="color:var(--accent-crimson); font-weight:600; font-size:12px;">
                        ⚠️ 解析失敗：${m.error}
                    </div>
                    <span class="batch-status-badge error">解析失敗</span>
                </div>
            `);
            return;
        }
        
        const p1 = state.members.find(p => p.name.toLowerCase() === m.team1[0].toLowerCase());
        const p2 = state.members.find(p => p.name.toLowerCase() === m.team1[1].toLowerCase());
        const p3 = state.members.find(p => p.name.toLowerCase() === m.team2[0].toLowerCase());
        const p4 = state.members.find(p => p.name.toLowerCase() === m.team2[1].toLowerCase());
        
        const team1Players = [
            { name: m.team1[0], exist: !!p1, rating: p1 ? p1.rating : null },
            { name: m.team1[1], exist: !!p2, rating: p2 ? p2.rating : null }
        ];
        const team2Players = [
            { name: m.team2[0], exist: !!p3, rating: p3 ? p3.rating : null },
            { name: m.team2[1], exist: !!p4, rating: p4 ? p4.rating : null }
        ];
        
        const missingPlayers = [];
        [...team1Players, ...team2Players].forEach(p => {
            if (!p.exist) {
                missingPlayers.push(p.name);
                newPlayersSet.add(p.name);
            }
        });
        
        let statusText = "準備就緒";
        let statusClass = "ready";
        let itemClass = "ready-row";
        
        if (missingPlayers.length > 0) {
            if (autoRegister) {
                statusText = `自動註冊 ${missingPlayers.length} 人`;
                statusClass = "new-players";
                itemClass = "new-players-row";
            } else {
                statusText = `球員未註冊: ${missingPlayers.join(", ")}`;
                statusClass = "error";
                itemClass = "error-row";
                m.hasUnregisteredError = true;
            }
        }
        
        if (m.hasUnregisteredError) {
            errorCount++;
        } else {
            successCount++;
        }
        
        const renderPlayerHtml = (p) => {
            if (p.exist) {
                return `<span class="batch-player-tag">${p.name} <span style="opacity:0.6; font-size:10px;">(${p.rating})</span></span>`;
            } else {
                return `<span class="batch-player-tag new-player" title="新球員，將自動註冊">${p.name} 🆕</span>`;
            }
        };
        
        const rowHtml = `
            <div class="batch-preview-item ${itemClass}">
                <div class="batch-preview-line-num">第 ${m.lineNum} 行</div>
                <div class="batch-preview-teams">
                    <div class="batch-team-names t1">
                        ${renderPlayerHtml(team1Players[0])}
                        <span style="color:var(--text-muted); font-size:10px;">+</span>
                        ${renderPlayerHtml(team1Players[1])}
                    </div>
                    <div class="batch-preview-vs-score">
                        <span>${m.score1}</span>
                        <span>:</span>
                        <span>${m.score2}</span>
                    </div>
                    <div class="batch-team-names t2">
                        ${renderPlayerHtml(team2Players[0])}
                        <span style="color:var(--text-muted); font-size:10px;">+</span>
                        ${renderPlayerHtml(team2Players[1])}
                    </div>
                </div>
                <span class="batch-status-badge ${statusClass}">${statusText}</span>
            </div>
        `;
        container.insertAdjacentHTML("beforeend", rowHtml);
    });
    
    const summaryText = `成功解析 ${successCount} 場 | 包含錯誤 ${errorCount} 場 | 新球員建檔 ${newPlayersSet.size} 人`;
    document.getElementById("batch-summary-badge").innerText = summaryText;
    document.getElementById("batch-preview-area").style.display = "block";
    
    const submitBtn = document.getElementById("btn-submit-batch");
    if (successCount > 0) {
        submitBtn.style.display = "block";
        submitBtn.disabled = false;
        submitBtn.innerText = `🚀 確認匯入並計算這 ${successCount} 場賽事`;
    } else {
        submitBtn.style.display = "none";
        submitBtn.disabled = true;
    }
}

function handleSubmitBatch() {
    if (!lastParsedMatches || lastParsedMatches.length === 0) return;
    
    const autoRegister = document.getElementById("batch-auto-register").checked;
    const defaultRating = parseInt(document.getElementById("batch-default-rating").value) || 1200;
    
    const validMatches = lastParsedMatches.filter(m => m.success && (!m.hasUnregisteredError || autoRegister));
    if (validMatches.length === 0) {
        alert("沒有可匯入的有效賽事！");
        return;
    }
    
    if (!confirm(`確定要批次匯入這 ${validMatches.length} 場賽事並計算 Elo 積分嗎？`)) {
        return;
    }
    
    // 記錄球員變動前積分
    const ratingsBefore = new Map();
    state.members.forEach(member => {
        ratingsBefore.set(member.name.toLowerCase(), {
            rating: member.rating,
            level: getLevelInfo(member.rating).level
        });
    });
    
    let importedCount = 0;
    
    // 執行循序匯入
    validMatches.forEach(m => {
        const getOrCreatePlayerId = (name) => {
            let player = state.members.find(p => p.name.toLowerCase() === name.toLowerCase());
            if (!player && autoRegister) {
                const randomHue = Math.floor(Math.random() * 360);
                player = addMember(name, defaultRating, randomHue);
            }
            return player ? player.id : null;
        };
        
        const idA = getOrCreatePlayerId(m.team1[0]);
        const idB = getOrCreatePlayerId(m.team1[1]);
        const idC = getOrCreatePlayerId(m.team2[0]);
        const idD = getOrCreatePlayerId(m.team2[1]);
        
        if (idA && idB && idC && idD) {
            const res = recordMatch(idA, idB, idC, idD, m.score1, m.score2, []);
            if (res && res.success) {
                importedCount++;
            }
        }
    });
    
    if (importedCount > 0) {
        // 比對批次前後等級變動
        const aggregatedLevelChanges = [];
        state.members.forEach(member => {
            const prevInfo = ratingsBefore.get(member.name.toLowerCase());
            const oldRating = prevInfo ? prevInfo.rating : defaultRating;
            const oldLvl = prevInfo ? getLevelInfo(oldRating) : getLevelInfo(defaultRating);
            const newRating = member.rating;
            const newLvl = getLevelInfo(newRating);
            
            if (oldLvl.level !== newLvl.level) {
                aggregatedLevelChanges.push({
                    playerName: member.name,
                    oldLvl: oldLvl,
                    newLvl: newLvl,
                    direction: newLvl.level < oldLvl.level ? "up" : "down"
                });
            }
        });
        
        saveToStorage();
        startConfetti();
        
        // 清空重設
        document.getElementById("batch-matches-input").value = "";
        document.getElementById("batch-preview-container").innerHTML = "";
        document.getElementById("batch-preview-area").style.display = "none";
        lastParsedMatches = [];
        
        switchView("dashboard");
        alert(`🎉 成功批次匯入 ${importedCount} 場賽事！`);
        
        if (aggregatedLevelChanges.length > 0) {
            setTimeout(() => {
                openLevelChangeAlert(aggregatedLevelChanges);
            }, 1200);
        }
    } else {
        alert("匯入失敗，請檢查資料是否正確。");
    }
}

// === 產生單日積分報表與 CSV 匯出邏輯 ===
function generateDailyReport(dateStr) {
    const printArea = document.getElementById("print-report-area");
    if (!printArea) return;
    
    const dateStart = new Date(dateStr + "T00:00:00").getTime();
    const dateEnd = new Date(dateStr + "T23:59:59.999").getTime();
    
    // 1. 蒐集球員當天起始積分與目前積分
    const reportData = [];
    state.members.forEach(member => {
        // 檢查球員是否在該日期結束後才建立
        const initEntry = member.ratingHistory.find(h => h.matchId === "init");
        const creationTime = initEntry ? initEntry.date : 0;
        if (creationTime > dateEnd) return; // 該日期之後才創立，不列入報表
        
        // 起始積分：該日之前的最後一次積分點
        let startingRating = member.initialRating;
        const historyBefore = member.ratingHistory.filter(h => h.date < dateStart);
        if (historyBefore.length > 0) {
            startingRating = historyBefore[historyBefore.length - 1].rating;
        } else if (initEntry) {
            startingRating = initEntry.rating;
        }
        
        // 目前積分：該日結束前的最後一次積分點
        let currentRating = startingRating;
        const historyBeforeOrOn = member.ratingHistory.filter(h => h.date <= dateEnd);
        if (historyBeforeOrOn.length > 0) {
            currentRating = historyBeforeOrOn[historyBeforeOrOn.length - 1].rating;
        }
        
        const change = currentRating - startingRating;
        
        reportData.push({
            name: member.name,
            startingRating: startingRating,
            change: change,
            currentRating: currentRating
        });
    });
    
    // 2. 排序並計算原始排名
    reportData.sort((a, b) => {
        if (b.startingRating !== a.startingRating) {
            return b.startingRating - a.startingRating;
        }
        return a.name.localeCompare(b.name, "zh-Hant");
    });
    
    reportData.forEach((p, idx) => {
        p.originalRank = idx + 1;
    });
    
    // 3. 計算新積分的排名
    const reportDataByCurrent = [...reportData].sort((a, b) => {
        if (b.currentRating !== a.currentRating) {
            return b.currentRating - a.currentRating;
        }
        return a.name.localeCompare(b.name, "zh-Hant");
    });
    
    const currentRankMap = new Map();
    reportDataByCurrent.forEach((p, idx) => {
        currentRankMap.set(p.name, idx + 1);
    });
    
    reportData.forEach(p => {
        p.newRank = currentRankMap.get(p.name);
    });
    
    // 4. 切割成雙欄（左右對稱）
    const totalCount = reportData.length;
    const rowsPerSide = Math.ceil(totalCount / 2);
    
    // 計算日期的 M/DD 格式用於表頭
    const dateObj = new Date(dateStr);
    const m = dateObj.getMonth() + 1;
    const d = dateObj.getDate();
    const formattedDateHeader = `${m}/${d}比賽結果`;
    
    // 輔助函式：渲染新排名標籤（有升降箭頭）
    const renderNewRankHtml = (originalRank, newRank) => {
        if (newRank < originalRank) {
            return `${newRank} <span style="color:#16a34a; font-size:10px; font-weight:900;">▲</span>`;
        } else if (newRank > originalRank) {
            return `${newRank} <span style="color:#dc2626; font-size:10px; font-weight:900;">▼</span>`;
        }
        return `${newRank}`;
    };
    
    let tableRowsHtml = "";
    for (let i = 0; i < rowsPerSide; i++) {
        const leftPlayer = reportData[i];
        const rightPlayer = reportData[i + rowsPerSide];
        
        const leftChangeText = leftPlayer.change > 0 ? `+${leftPlayer.change}` : leftPlayer.change.toString();
        const rightChangeText = rightPlayer ? (rightPlayer.change > 0 ? `+${rightPlayer.change}` : rightPlayer.change.toString()) : "";
        
        const leftChangeStyle = leftPlayer.change > 0 ? "color:#1d4ed8; font-weight:bold;" : (leftPlayer.change < 0 ? "color:#b91c1c; font-weight:bold;" : "color:#000;");
        const rightChangeStyle = rightPlayer ? (rightPlayer.change > 0 ? "color:#1d4ed8; font-weight:bold;" : (rightPlayer.change < 0 ? "color:#b91c1c; font-weight:bold;" : "color:#000;")) : "";
        
        tableRowsHtml += `
            <tr style="height: 32px;">
                <!-- 左半部 -->
                <td style="font-weight:bold; width: 3.5%;">${leftPlayer.originalRank}</td>
                <td style="width: 3.5%;">${renderNewRankHtml(leftPlayer.originalRank, leftPlayer.newRank)}</td>
                <td style="width: 12%;">${leftPlayer.name}</td>
                <td style="width: 9.5%;">${leftPlayer.startingRating}</td>
                <td class="daily-report-highlight-col" style="width: 12%; ${leftChangeStyle}">${leftChangeText}</td>
                <td style="width: 9.5%;">${leftPlayer.currentRating}</td>
                
                <!-- 欄位間隔間距 -->
                <td style="border:none; width: 4%; background:#ffffff;"></td>
                
                <!-- 右半部 -->
                ${rightPlayer ? `
                <td style="font-weight:bold; width: 3.5%;">${rightPlayer.originalRank}</td>
                <td style="width: 3.5%;">${renderNewRankHtml(rightPlayer.originalRank, rightPlayer.newRank)}</td>
                <td style="width: 12%;">${rightPlayer.name}</td>
                <td style="width: 9.5%;">${rightPlayer.startingRating}</td>
                <td class="daily-report-highlight-col" style="width: 12%; ${rightChangeStyle}">${rightChangeText}</td>
                <td style="width: 9.5%;">${rightPlayer.currentRating}</td>
                ` : `
                <td style="width: 3.5%;"></td>
                <td style="width: 3.5%;"></td>
                <td style="width: 12%;"></td>
                <td style="width: 9.5%;"></td>
                <td class="daily-report-highlight-col" style="width: 12%;"></td>
                <td style="width: 9.5%;"></td>
                `}
            </tr>
        `;
    }
    
    // 取得當前等級門檻設定以渲染底部對照表
    const levels = state.settings.ratingLevels || DEFAULT_LEVELS;
    const sortedLevels = [...levels].sort((a, b) => a.level - b.level);
    
    const renderLevelRows = (startIdx, endIdx) => {
        let rows = "";
        for (let i = startIdx; i <= endIdx; i++) {
            const lvl = sortedLevels[i];
            if (i === startIdx) {
                rows += `
                    <tr style="height: 28px;">
                        <td rowspan="5" style="width: 30%; background: #e5e7eb; font-weight: bold; border: 1px solid #4b5563; text-align: center; color: #000; font-size:12px;">等級名稱</td>
                        <td style="width: 25%; font-weight: bold; border: 1px solid #4b5563; padding: 4px; color: #000; font-size:12px;">L${lvl.level}</td>
                        <td style="border: 1px solid #4b5563; padding: 4px; color: #000; font-size:12px;">${lvl.min}~${lvl.max}</td>
                    </tr>
                `;
            } else {
                rows += `
                    <tr style="height: 28px;">
                        <td style="font-weight: bold; border: 1px solid #4b5563; padding: 4px; color: #000; font-size:12px;">L${lvl.level}</td>
                        <td style="border: 1px solid #4b5563; padding: 4px; color: #000; font-size:12px;">${lvl.min}~${lvl.max}</td>
                    </tr>
                `;
            }
        }
        return rows;
    };
    
    const levelsLeftHtml = renderLevelRows(0, 4);  // L1-L5
    const levelsRightHtml = renderLevelRows(5, 9); // L6-L10
    
    const formattedTitleDate = dateStr.replace(/-/g, '.');
    
    const htmlContent = `
        <!-- 表頭與日期 -->
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:12px; border-bottom:3px double #000; padding-bottom:6px;">
            <div style="font-size:22px; font-weight:900; color:#000; letter-spacing:1px; font-family:'Outfit', 'Noto Sans TC', sans-serif;">新朝友分級積分表</div>
            <div style="font-size:16px; font-weight:bold; color:#000; font-family:monospace; margin-bottom: 2px;">${formattedTitleDate}</div>
        </div>
        
        <!-- 主要成績雙欄表格 -->
        <table class="daily-report-table">
            <thead>
                <tr style="height: 32px;">
                    <!-- 左半表頭 -->
                    <th style="width:3.5%;">原排</th>
                    <th style="width:3.5%;">新排</th>
                    <th style="width:12%;">姓名</th>
                    <th style="width:9.5%;">起始積分</th>
                    <th style="width:12%; background-color:#dbeafe !important;">${formattedDateHeader}</th>
                    <th style="width:9.5%;">目前積分</th>
                    
                    <!-- 間隔空欄 -->
                    <th style="border:none; width:4%; background:#ffffff;"></th>
                    
                    <!-- 右半表頭 -->
                    <th style="width:3.5%;">原排</th>
                    <th style="width:3.5%;">新排</th>
                    <th style="width:12%;">姓名</th>
                    <th style="width:9.5%;">起始積分</th>
                    <th style="width:12%; background-color:#dbeafe !important;">${formattedDateHeader}</th>
                    <th style="width:9.5%;">目前積分</th>
                </tr>
            </thead>
            <tbody>
                ${tableRowsHtml}
            </tbody>
        </table>
        
        <!-- 底部對應等級區間對照表 -->
        <div style="margin-top:20px; display:flex; justify-content:space-between;">
            <!-- 左半等級 (L1-L5) -->
            <div style="width:48%;">
                <table style="width:100%; border-collapse:collapse; border:1px solid #4b5563; text-align:center;">
                    <tbody>
                        ${levelsLeftHtml}
                    </tbody>
                </table>
            </div>
            
            <!-- 右半等級 (L6-L10) -->
            <div style="width:48%;">
                <table style="width:100%; border-collapse:collapse; border:1px solid #4b5563; text-align:center;">
                    <tbody>
                        ${levelsRightHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    printArea.innerHTML = htmlContent;
}

function exportDailyReportCsv(dateStr) {
    const dateStart = new Date(dateStr + "T00:00:00").getTime();
    const dateEnd = new Date(dateStr + "T23:59:59.999").getTime();
    
    const csvRows = [];
    csvRows.push("\uFEFF" + `原排,新排,姓名,起始積分,${dateStr.replace(/-/g, "/")}比賽結果,目前積分`);
    
    const reportData = [];
    state.members.forEach(member => {
        const initEntry = member.ratingHistory.find(h => h.matchId === "init");
        const creationTime = initEntry ? initEntry.date : 0;
        if (creationTime > dateEnd) return;
        
        let startingRating = member.initialRating;
        const historyBefore = member.ratingHistory.filter(h => h.date < dateStart);
        if (historyBefore.length > 0) {
            startingRating = historyBefore[historyBefore.length - 1].rating;
        } else if (initEntry) {
            startingRating = initEntry.rating;
        }
        
        let currentRating = startingRating;
        const historyBeforeOrOn = member.ratingHistory.filter(h => h.date <= dateEnd);
        if (historyBeforeOrOn.length > 0) {
            currentRating = historyBeforeOrOn[historyBeforeOrOn.length - 1].rating;
        }
        
        const change = currentRating - startingRating;
        
        reportData.push({
            name: member.name,
            startingRating: startingRating,
            change: change,
            currentRating: currentRating
        });
    });
    
    reportData.sort((a, b) => {
        if (b.startingRating !== a.startingRating) {
            return b.startingRating - a.startingRating;
        }
        return a.name.localeCompare(b.name, "zh-Hant");
    });
    
    reportData.forEach((p, idx) => {
        p.originalRank = idx + 1;
    });
    
    const reportDataByCurrent = [...reportData].sort((a, b) => {
        if (b.currentRating !== a.currentRating) {
            return b.currentRating - a.currentRating;
        }
        return a.name.localeCompare(b.name, "zh-Hant");
    });
    
    const currentRankMap = new Map();
    reportDataByCurrent.forEach((p, idx) => {
        currentRankMap.set(p.name, idx + 1);
    });
    
    reportData.forEach(p => {
        p.newRank = currentRankMap.get(p.name);
    });
    
    reportData.forEach(p => {
        const changeStr = p.change > 0 ? `+${p.change}` : p.change.toString();
        csvRows.push(`${p.originalRank},${p.newRank},"${p.name.replace(/"/g, '""')}",${p.startingRating},${changeStr},${p.currentRating}`);
    });
    
    try {
        const csvContent = csvRows.join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `朝友桌球單日分級積分表_${dateStr.replace(/-/g, "")}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        alert("匯出 CSV 發生錯誤：" + err.message);
    }
}
