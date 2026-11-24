/**
 * 朝友桌球分級小程式 - 主應用渲染與事件控制模組 (v2.0.0)
 */
(function (global) {
    "use strict";

    const { escapeHtml, getLocalDateStr, getLocalTimeDisplay, dateInputToTimestamp, showToast, showConfirm, showAlert, downloadTextFile } = global.ChaoyouUtils;
    const { APP_VERSION, APP_UPDATED, DEFAULT_LEVELS, state, cloneDefaultSettings, initStorage, saveToStorage, manualSync, exportBackup, importBackup, isReadonlyMode, getReadonlyMeta, unlockReadonly, lockReadonly } = global.ChaoyouState;
    const { getLevelInfo, getAvatarStyle, getRatingFromLevelStr, predictMatchElo, recordMatch, rollbackMatch, addMember, deleteMember } = global.ChaoyouElo;
    const { handleParseBatch, handleSubmitBatch, clearBatchState } = global.ChaoyouBatch;
    const { generateLevelChartSVG, generateTrendChartSVG, generateWinRatePieSVG, startConfetti } = global.ChaoyouCharts;
    const { generateDailyReport, exportDailyReportCsv } = global.ChaoyouReport;

    const PLAYER_SELECTORS = ["mr-t1p1", "mr-t1p2", "mr-t2p1", "mr-t2p2"];
    let historyPage = 1;
    const historyLimit = 15;
    let activeAddMode = "single";

    function openModal(modalId) {
        const el = document.getElementById(modalId);
        if (el) el.classList.add("active");
    }

    function closeModal(modalId) {
        const el = document.getElementById(modalId);
        if (el) el.classList.remove("active");
    }

    function loadDemoData() {
        const now = Date.now();
        const day = 86400000;
        const demoPlayers = [
            { name: "陳志強", rating: 2450, hue: 38 },
            { name: "林美玲", rating: 2260, hue: 175 },
            { name: "張哲瑋", rating: 2040, hue: 215 },
            { name: "王怡君", rating: 1850, hue: 280 },
            { name: "李建宏", rating: 1680, hue: 15 },
            { name: "吳雅婷", rating: 1490, hue: 145 },
            { name: "劉冠宇", rating: 1320, hue: 195 },
            { name: "黃詩涵", rating: 1180, hue: 330 },
            { name: "蔡明哲", rating: 960, hue: 85 },
            { name: "鄭家豪", rating: 780, hue: 250 }
        ];

        state.members = [];
        state.matches = [];
        state.settings = cloneDefaultSettings();

        const created = demoPlayers.map((p, i) =>
            addMember(p.name, p.rating, p.hue, { skipSave: true, createdAt: now - 10 * day + i * 1000 })
        );

        const sampleMatches = [
            [0, 3, 1, 2, 3, 1, -4 * day],
            [4, 5, 6, 7, 3, 2, -3 * day],
            [0, 6, 1, 4, 2, 3, -2 * day],
            [2, 7, 3, 5, 3, 0, -1 * day],
            [1, 8, 2, 9, 3, 1, now - 3600000],
            [0, 5, 3, 4, 3, 2, now - 1800000]
        ];

        sampleMatches.forEach(([a, b, c, d, s1, s2, ts]) => {
            recordMatch(created[a].id, created[b].id, created[c].id, created[d].id, s1, s2, [], {
                matchDate: ts,
                skipSave: true
            });
        });

        saveToStorage();
    }

    function clearAllData() {
        state.members = [];
        state.matches = [];
        state.settings = cloneDefaultSettings();
        saveToStorage();
    }

    // === 視圖切換 ===
    function switchView(viewName) {
        if (isReadonlyMode() && (viewName === "match-recorder" || viewName === "settings")) {
            viewName = "dashboard";
        }
        document.querySelectorAll(".view-panel").forEach(panel => panel.classList.remove("active"));
        document.querySelectorAll("header .nav-btn").forEach(btn => btn.classList.remove("active"));

        const targetPanel = document.getElementById(`view-${viewName}`);
        const targetBtn = document.getElementById(`nav-${viewName}`);
        if (targetPanel) targetPanel.classList.add("active");
        if (targetBtn) targetBtn.classList.add("active");

        if (viewName === "dashboard") renderDashboard();
        else if (viewName === "members") renderMembers();
        else if (viewName === "match-recorder") renderMatchRecorder();
        else if (viewName === "match-history") renderMatchHistory();
        else if (viewName === "settings") renderSettings();
    }

    function refreshCurrentView() {
        const views = ["dashboard", "members", "match-recorder", "match-history", "settings"];
        for (const view of views) {
            const btn = document.getElementById(`nav-${view}`);
            if (btn && btn.classList.contains("active")) {
                switchView(view);
                break;
            }
        }
    }

    // === 1. 控制面板 Dashboard ===
    function renderDashboard() {
        document.getElementById("db-stat-members").textContent = state.members.length;
        document.getElementById("db-stat-matches").textContent = state.matches.length;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const matchesToday = state.matches.filter(m => m.date >= todayStart.getTime()).length;
        document.getElementById("db-stat-today-matches").textContent = matchesToday;

        const avgRating = state.members.length > 0
            ? Math.round(state.members.reduce((acc, m) => acc + m.rating, 0) / state.members.length)
            : 1200;
        document.getElementById("db-stat-avg-rating").textContent = avgRating;

        const sortedMembers = [...state.members].sort((a, b) => b.rating - a.rating);
        const lbContainer = document.getElementById("db-leaderboard-list");
        lbContainer.innerHTML = "";

        if (sortedMembers.length === 0) {
            lbContainer.innerHTML = `<div class="empty-state">尚無球員資料。請至「系統設定」載入示範數據，或於「會員管理」新增球員。</div>`;
        } else {
            const top10 = sortedMembers.slice(0, 10);
            top10.forEach((member, index) => {
                const rank = index + 1;
                const lvlInfo = getLevelInfo(member.rating);

                let streakTag = "";
                if (member.streak >= 3) {
                    streakTag = `<span class="streak-tag streak-win">${member.streak} 連勝</span>`;
                } else if (member.streak <= -3) {
                    streakTag = `<span class="streak-tag streak-loss">${Math.abs(member.streak)} 連敗</span>`;
                }

                const winRate = member.matchesPlayed > 0 ? Math.round((member.wins / member.matchesPlayed) * 100) : 0;

                const itemHTML = `
                    <div class="leaderboard-item rank-${rank}" data-member-id="${escapeHtml(member.id)}">
                        <div class="rank-badge">${rank}</div>
                        <div class="avatar" style="${getAvatarStyle(member.avatarColor)}">${escapeHtml(member.name.charAt(0))}</div>
                        <div class="player-info">
                            <div class="player-name-row">
                                <span class="player-name">${escapeHtml(member.name)}</span>
                                ${streakTag}
                            </div>
                            <div class="player-sub">出賽 ${member.matchesPlayed} 場 · 勝率 ${winRate}%</div>
                        </div>
                        <div class="player-rating-cell">
                            <div class="rating-val">${member.rating}</div>
                            <div class="level-tag" style="background:${lvlInfo.color}18; color:${lvlInfo.color}; border:1px solid ${lvlInfo.color}40;">
                                L${lvlInfo.level} ${escapeHtml(lvlInfo.name.split(" ")[0])}
                            </div>
                        </div>
                    </div>
                `;
                lbContainer.insertAdjacentHTML("beforeend", itemHTML);
            });

            lbContainer.querySelectorAll(".leaderboard-item").forEach(el => {
                el.addEventListener("click", () => openMemberDetailModal(el.dataset.memberId));
            });
        }

        generateLevelChartSVG("db-level-chart-container");

        const recentMatches = [...state.matches].sort((a, b) => b.date - a.date).slice(0, 5);
        const tmContainer = document.getElementById("db-recent-matches-timeline");
        tmContainer.innerHTML = "";

        if (recentMatches.length === 0) {
            tmContainer.innerHTML = `<div class="empty-state">尚無比賽紀錄</div>`;
        } else {
            recentMatches.forEach(m => {
                const t1p1 = state.members.find(p => p.id === m.team1[0])?.name || "未知球員";
                const t1p2 = state.members.find(p => p.id === m.team1[1])?.name || "未知球員";
                const t2p1 = state.members.find(p => p.id === m.team2[0])?.name || "未知球員";
                const t2p2 = state.members.find(p => p.id === m.team2[1])?.name || "未知球員";

                const changeInfoHtml = (pid) => {
                    const change = (m.ratingChanges && m.ratingChanges[pid] && m.ratingChanges[pid].change) || 0;
                    const sign = change >= 0 ? "+" : "";
                    const colorClass = change >= 0 ? "change-up" : "change-down";
                    return `<span class="member-rating-change ${colorClass}">${sign}${change}</span>`;
                };

                const dateStr = getLocalTimeDisplay(m.date);
                const setDetailText = m.setScores && m.setScores.length > 0 ? m.setScores.join(", ") : "";

                const timelineHTML = `
                    <div class="timeline-item">
                        <div class="team-display">
                            <div class="team-member ${m.winner === 1 ? "is-winner" : ""}">
                                <span>${escapeHtml(t1p1)}</span> ${changeInfoHtml(m.team1[0])}
                            </div>
                            <div class="team-member ${m.winner === 1 ? "is-winner" : ""}">
                                <span>${escapeHtml(t1p2)}</span> ${changeInfoHtml(m.team1[1])}
                            </div>
                        </div>
                        <div class="vs-score-box">
                            <div class="score-display">
                                <span class="${m.winner === 1 ? "score-win" : ""}">${m.score.team1}</span>
                                <span class="score-colon">:</span>
                                <span class="${m.winner === 2 ? "score-win" : ""}">${m.score.team2}</span>
                            </div>
                            ${setDetailText ? `<div class="sets-detail">${escapeHtml(setDetailText)}</div>` : ""}
                            <div class="match-date-badge">${escapeHtml(dateStr)}</div>
                        </div>
                        <div class="team-display right">
                            <div class="team-member ${m.winner === 2 ? "is-winner" : ""}">
                                <span>${escapeHtml(t2p1)}</span> ${changeInfoHtml(m.team2[0])}
                            </div>
                            <div class="team-member ${m.winner === 2 ? "is-winner" : ""}">
                                <span>${escapeHtml(t2p2)}</span> ${changeInfoHtml(m.team2[1])}
                            </div>
                        </div>
                    </div>
                `;
                tmContainer.insertAdjacentHTML("beforeend", timelineHTML);
            });
        }
    }

    // === 2. 會員管理 Members ===
    function renderMembers() {
        const searchVal = (document.getElementById("member-search").value || "").trim().toLowerCase();
        const levelFilter = document.getElementById("member-level-filter").value;
        const sortBy = document.getElementById("member-sort-select").value;

        let filtered = state.members.filter(m => {
            const matchName = !searchVal || m.name.toLowerCase().includes(searchVal);
            if (!matchName) return false;
            if (levelFilter && levelFilter !== "all") {
                const lvlInfo = getLevelInfo(m.rating);
                if (String(lvlInfo.level) !== levelFilter) return false;
            }
            return true;
        });

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

        const countLabel = document.getElementById("member-filter-count");
        if (countLabel) {
            countLabel.textContent = `顯示 ${filtered.length} / ${state.members.length} 位`;
        }

        const grid = document.getElementById("members-cards-grid");
        grid.innerHTML = "";

        if (filtered.length === 0) {
            grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">查無符合條件的會員，可調整篩選或點選「新增會員」。</div>`;
            return;
        }

        filtered.forEach(member => {
            const lvlInfo = getLevelInfo(member.rating);
            const winRate = member.matchesPlayed > 0 ? Math.round((member.wins / member.matchesPlayed) * 100) : 0;

            let streakTag = "";
            if (member.streak >= 3) {
                streakTag = `<span class="streak-tag streak-win">${member.streak} 連勝</span>`;
            } else if (member.streak <= -3) {
                streakTag = `<span class="streak-tag streak-loss">${Math.abs(member.streak)} 連敗</span>`;
            }

            const cardHTML = `
                <div class="surface-card member-card" data-member-id="${escapeHtml(member.id)}">
                    <div class="member-card-header">
                        <div class="avatar" style="${getAvatarStyle(member.avatarColor)}">${escapeHtml(member.name.charAt(0))}</div>
                        <div class="member-card-title">
                            <div class="player-name">${escapeHtml(member.name)}</div>
                            ${streakTag}
                        </div>
                        <div class="player-rating-cell">
                            <div class="rating-val">${member.rating}</div>
                            <div class="level-tag" style="background:${lvlInfo.color}18; color:${lvlInfo.color}; border:1px solid ${lvlInfo.color}40;">
                                L${lvlInfo.level} ${escapeHtml(lvlInfo.name.split(" ")[0])}
                            </div>
                        </div>
                    </div>
                    <div class="member-card-details">
                        <div>
                            <div class="member-detail-label">總場次</div>
                            <div class="member-detail-val">${member.matchesPlayed}</div>
                        </div>
                        <div>
                            <div class="member-detail-label">勝 / 敗場</div>
                            <div class="member-detail-val">${member.wins} / ${member.losses}</div>
                        </div>
                        <div>
                            <div class="member-detail-label">勝率</div>
                            <div class="member-detail-val winrate-val">${winRate}%</div>
                        </div>
                    </div>
                </div>
            `;
            grid.insertAdjacentHTML("beforeend", cardHTML);
        });

        grid.querySelectorAll(".member-card").forEach(el => {
            el.addEventListener("click", () => openMemberDetailModal(el.dataset.memberId));
        });
    }

    // === 3. 可搜尋球員選擇器與賽事登錄 ===
    function getSelectedPlayerIds() {
        return PLAYER_SELECTORS.map(id => {
            const hidden = document.getElementById(id);
            return hidden ? hidden.value : "";
        });
    }

    function syncComboboxDisplay(selId) {
        const hidden = document.getElementById(selId);
        const searchInput = document.getElementById(selId + "-search");
        const clearBtn = document.getElementById(selId + "-clear");
        if (!hidden || !searchInput) return;

        const member = state.members.find(m => m.id === hidden.value);
        if (member) {
            const lvl = getLevelInfo(member.rating);
            searchInput.value = `${member.name} (${member.rating} · L${lvl.level})`;
            searchInput.classList.add("has-selection");
            if (clearBtn) clearBtn.style.display = "flex";
        } else {
            if (document.activeElement !== searchInput) {
                searchInput.value = "";
            }
            searchInput.classList.remove("has-selection");
            if (clearBtn) clearBtn.style.display = "none";
        }
    }

    function renderComboboxDropdown(selId, keyword) {
        const dropdown = document.getElementById(selId + "-dropdown");
        const hidden = document.getElementById(selId);
        if (!dropdown || !hidden) return;

        const selectedValues = getSelectedPlayerIds();
        const currentIdx = PLAYER_SELECTORS.indexOf(selId);
        const q = (keyword || "").trim().toLowerCase();

        const sortedMembers = [...state.members].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
        const available = sortedMembers.filter(m => {
            const chosenElsewhere = selectedValues.some((val, idx) => idx !== currentIdx && val === m.id);
            if (chosenElsewhere) return false;
            if (!q) return true;
            const lvl = getLevelInfo(m.rating);
            return m.name.toLowerCase().includes(q) || `l${lvl.level}`.includes(q) || String(m.rating).includes(q);
        });

        if (available.length === 0) {
            dropdown.innerHTML = `<div class="combobox-empty">查無可選球員</div>`;
        } else {
            dropdown.innerHTML = available.map(m => {
                const lvl = getLevelInfo(m.rating);
                const isSelected = hidden.value === m.id;
                return `
                    <div class="combobox-option ${isSelected ? "selected" : ""}" data-id="${escapeHtml(m.id)}">
                        <span class="cb-opt-name">${escapeHtml(m.name)}</span>
                        <span class="cb-opt-meta">${m.rating} 分 · L${lvl.level}</span>
                    </div>
                `;
            }).join("");

            dropdown.querySelectorAll(".combobox-option").forEach(opt => {
                opt.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    selectComboboxPlayer(selId, opt.dataset.id);
                });
            });
        }
        dropdown.classList.add("open");
    }

    function selectComboboxPlayer(selId, memberId) {
        const hidden = document.getElementById(selId);
        const dropdown = document.getElementById(selId + "-dropdown");
        if (hidden) hidden.value = memberId || "";
        if (dropdown) dropdown.classList.remove("open");
        syncComboboxDisplay(selId);
        updateLivePredictor();
    }

    function initPlayerComboboxes() {
        PLAYER_SELECTORS.forEach(selId => {
            const searchInput = document.getElementById(selId + "-search");
            const dropdown = document.getElementById(selId + "-dropdown");
            const clearBtn = document.getElementById(selId + "-clear");
            const hidden = document.getElementById(selId);
            if (!searchInput || !dropdown || !hidden) return;

            searchInput.addEventListener("focus", () => {
                if (hidden.value) {
                    searchInput.value = "";
                }
                renderComboboxDropdown(selId, searchInput.value);
            });

            searchInput.addEventListener("input", () => {
                if (hidden.value) {
                    hidden.value = "";
                    updateLivePredictor();
                }
                renderComboboxDropdown(selId, searchInput.value);
            });

            searchInput.addEventListener("blur", () => {
                setTimeout(() => {
                    dropdown.classList.remove("open");
                    syncComboboxDisplay(selId);
                }, 140);
            });

            searchInput.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    dropdown.classList.remove("open");
                    searchInput.blur();
                } else if (e.key === "Enter") {
                    const firstOpt = dropdown.querySelector(".combobox-option");
                    if (firstOpt) {
                        e.preventDefault();
                        selectComboboxPlayer(selId, firstOpt.dataset.id);
                        searchInput.blur();
                    }
                }
            });

            if (clearBtn) {
                clearBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    selectComboboxPlayer(selId, "");
                    searchInput.focus();
                });
            }
        });
    }

    function renderMatchRecorder() {
        PLAYER_SELECTORS.forEach(selId => {
            const hidden = document.getElementById(selId);
            if (hidden && hidden.value && !state.members.some(m => m.id === hidden.value)) {
                hidden.value = "";
            }
            syncComboboxDisplay(selId);
        });

        const singleDate = document.getElementById("mr-match-date");
        if (singleDate && !singleDate.value) {
            singleDate.value = getLocalDateStr(new Date());
        }
        const batchDate = document.getElementById("batch-match-date");
        if (batchDate && !batchDate.value) {
            batchDate.value = getLocalDateStr(new Date());
        }

        updateLivePredictor();
    }

    function updateLivePredictor() {
        const [idA, idB, idC, idD] = getSelectedPlayerIds();
        const container = document.getElementById("mr-predictor-panel");
        if (!container) return;

        if (!idA || !idB || !idC || !idD) {
            container.style.display = "none";
            return;
        }

        const prediction = predictMatchElo(idA, idB, idC, idD);
        if (!prediction) {
            container.style.display = "none";
            return;
        }

        container.style.display = "block";

        const pA = state.members.find(m => m.id === idA);
        const pB = state.members.find(m => m.id === idB);
        const pC = state.members.find(m => m.id === idC);
        const pD = state.members.find(m => m.id === idD);

        const renderChangeHtml = (change, next) => {
            const sign = change >= 0 ? "+" : "";
            const cls = change >= 0 ? "change-up" : "change-down";
            const oldLvl = getLevelInfo(next - change);
            const newLvl = getLevelInfo(next);
            let levelTag = "";

            if (oldLvl.level > newLvl.level) {
                levelTag = ` <span class="pred-lvl-up">▲ 升 L${newLvl.level}</span>`;
            } else if (oldLvl.level < newLvl.level) {
                levelTag = ` <span class="pred-lvl-down">▼ 降 L${newLvl.level}</span>`;
            }

            return `<span class="predict-rating-change ${cls}">${sign}${change} 分 (→ ${next})${levelTag}</span>`;
        };

        document.getElementById("pred-t1-win-pA").innerHTML = `${escapeHtml(pA.name)} ${renderChangeHtml(prediction.ifTeam1Win.A.change, prediction.ifTeam1Win.A.nextRating)}`;
        document.getElementById("pred-t1-win-pB").innerHTML = `${escapeHtml(pB.name)} ${renderChangeHtml(prediction.ifTeam1Win.B.change, prediction.ifTeam1Win.B.nextRating)}`;
        document.getElementById("pred-t1-win-pC").innerHTML = `${escapeHtml(pC.name)} ${renderChangeHtml(prediction.ifTeam1Win.C.change, prediction.ifTeam1Win.C.nextRating)}`;
        document.getElementById("pred-t1-win-pD").innerHTML = `${escapeHtml(pD.name)} ${renderChangeHtml(prediction.ifTeam1Win.D.change, prediction.ifTeam1Win.D.nextRating)}`;

        document.getElementById("pred-t2-win-pA").innerHTML = `${escapeHtml(pA.name)} ${renderChangeHtml(prediction.ifTeam2Win.A.change, prediction.ifTeam2Win.A.nextRating)}`;
        document.getElementById("pred-t2-win-pB").innerHTML = `${escapeHtml(pB.name)} ${renderChangeHtml(prediction.ifTeam2Win.B.change, prediction.ifTeam2Win.B.nextRating)}`;
        document.getElementById("pred-t2-win-pC").innerHTML = `${escapeHtml(pC.name)} ${renderChangeHtml(prediction.ifTeam2Win.C.change, prediction.ifTeam2Win.C.nextRating)}`;
        document.getElementById("pred-t2-win-pD").innerHTML = `${escapeHtml(pD.name)} ${renderChangeHtml(prediction.ifTeam2Win.D.change, prediction.ifTeam2Win.D.nextRating)}`;
    }

    // === 4. 歷史賽事 Match History ===
    function renderMatchHistory() {
        const container = document.getElementById("history-table-tbody");
        container.innerHTML = "";

        const searchVal = (document.getElementById("history-search").value || "").trim().toLowerCase();
        const dateFilter = document.getElementById("history-date-filter").value;

        let filteredMatches = state.matches.filter(m => {
            if (dateFilter && getLocalDateStr(m.date) !== dateFilter) {
                return false;
            }
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

        filteredMatches.sort((a, b) => b.date - a.date);

        const totalMatches = filteredMatches.length;
        const totalPages = Math.max(1, Math.ceil(totalMatches / historyLimit));
        if (historyPage > totalPages) historyPage = totalPages;

        const startIdx = (historyPage - 1) * historyLimit;
        const paginatedMatches = filteredMatches.slice(startIdx, startIdx + historyLimit);

        document.getElementById("history-page-info").textContent = `${historyPage} / ${totalPages} 頁（共 ${totalMatches} 筆）`;
        document.getElementById("history-prev-btn").disabled = historyPage === 1;
        document.getElementById("history-next-btn").disabled = historyPage === totalPages;

        if (paginatedMatches.length === 0) {
            container.innerHTML = `<tr><td colspan="5" class="empty-state">查無符合條件的歷史賽事紀錄</td></tr>`;
            return;
        }

        paginatedMatches.forEach(m => {
            const t1p1 = state.members.find(p => p.id === m.team1[0])?.name || "未知球員";
            const t1p2 = state.members.find(p => p.id === m.team1[1])?.name || "未知球員";
            const t2p1 = state.members.find(p => p.id === m.team2[0])?.name || "未知球員";
            const t2p2 = state.members.find(p => p.id === m.team2[1])?.name || "未知球員";

            const renderChangeSpan = (pid) => {
                const ch = m.ratingChanges && m.ratingChanges[pid];
                if (!ch) return "";
                const sign = ch.change >= 0 ? "+" : "";
                const cls = ch.change >= 0 ? "change-up" : "change-down";
                return `<span class="hist-change ${cls}">${sign}${ch.change} (${ch.prev}→${ch.next})</span>`;
            };

            const dateStr = getLocalTimeDisplay(m.date);
            const setDetail = m.setScores && m.setScores.length > 0 ? m.setScores.join(", ") : "-";

            const trHTML = `
                <tr>
                    <td class="hist-date-cell">${escapeHtml(dateStr)}</td>
                    <td>
                        <div class="hist-team-cell ${m.winner === 1 ? "is-winner" : ""}">
                            <div>${escapeHtml(t1p1)} ${renderChangeSpan(m.team1[0])}</div>
                            <div>${escapeHtml(t1p2)} ${renderChangeSpan(m.team1[1])}</div>
                        </div>
                    </td>
                    <td class="hist-score-cell">
                        <div class="hist-score-main">
                            <span class="${m.winner === 1 ? "score-win" : ""}">${m.score.team1}</span>
                            <span class="score-colon">:</span>
                            <span class="${m.winner === 2 ? "score-win" : ""}">${m.score.team2}</span>
                        </div>
                        <div class="hist-sets">${escapeHtml(setDetail)}</div>
                    </td>
                    <td>
                        <div class="hist-team-cell ${m.winner === 2 ? "is-winner" : ""}">
                            <div>${escapeHtml(t2p1)} ${renderChangeSpan(m.team2[0])}</div>
                            <div>${escapeHtml(t2p2)} ${renderChangeSpan(m.team2[1])}</div>
                        </div>
                    </td>
                    <td>
                        <button class="btn-delete-match" data-match-id="${escapeHtml(m.id)}">刪除回滾</button>
                    </td>
                </tr>
            `;
            container.insertAdjacentHTML("beforeend", trHTML);
        });

        container.querySelectorAll(".btn-delete-match").forEach(btn => {
            btn.addEventListener("click", () => triggerRollbackMatch(btn.dataset.matchId));
        });
    }

    async function triggerRollbackMatch(matchId) {
        if (isReadonlyMode()) return;
        const confirmed = await showConfirm({
            title: "刪除並重算積分",
            message: "確定要刪除這場比賽嗎？系統將移除該場紀錄並依時間軸自動重算此場之後的相關球員積分。",
            confirmText: "確定刪除回滾",
            danger: true
        });
        if (!confirmed) return;

        const success = rollbackMatch(matchId);
        if (success) {
            showToast("比賽已刪除，相關球員積分已重算回滾", "success");
            renderMatchHistory();
        } else {
            showToast("刪除失敗，找不到該筆賽事資料", "error");
        }
    }

    // === 5. 系統設定 Settings ===
    function renderSettings() {
        document.getElementById("set-elo-mode").value = state.settings.eloMode || "weight";
        document.getElementById("set-k-factor").value = state.settings.kFactor || 32;

        const levels = state.settings.ratingLevels || DEFAULT_LEVELS;
        const sortedLevels = [...levels].sort((a, b) => a.level - b.level);
        const list = document.getElementById("settings-levels-list");
        list.innerHTML = "";

        sortedLevels.forEach(lvl => {
            const rowHTML = `
                <div class="level-config-row">
                    <div class="level-config-badge" style="color:${lvl.color}">L${lvl.level}</div>
                    <input type="text" class="form-control compact" id="cfg-lvl-name-${lvl.level}" value="${escapeHtml(lvl.name)}">
                    <input type="number" class="form-control compact" id="cfg-lvl-min-${lvl.level}" value="${lvl.min}">
                    <input type="number" class="form-control compact" id="cfg-lvl-max-${lvl.level}" value="${lvl.max}">
                </div>
            `;
            list.insertAdjacentHTML("beforeend", rowHTML);
        });

        const backupArea = document.getElementById("set-backup-area");
        if (backupArea) {
            backupArea.value = exportBackup();
        }
    }

    function saveSystemSettings() {
        state.settings.eloMode = document.getElementById("set-elo-mode").value;
        const kVal = parseInt(document.getElementById("set-k-factor").value, 10);
        state.settings.kFactor = isNaN(kVal) ? 32 : Math.max(4, Math.min(128, kVal));

        const levels = state.settings.ratingLevels || DEFAULT_LEVELS;
        levels.forEach(lvl => {
            const nameInput = document.getElementById(`cfg-lvl-name-${lvl.level}`);
            const minInput = document.getElementById(`cfg-lvl-min-${lvl.level}`);
            const maxInput = document.getElementById(`cfg-lvl-max-${lvl.level}`);
            if (nameInput) lvl.name = nameInput.value.trim() || lvl.name;
            if (minInput) lvl.min = parseInt(minInput.value, 10) || 0;
            if (maxInput) lvl.max = parseInt(maxInput.value, 10) || 9999;
        });

        saveToStorage();
        showToast("系統公式與等級設定已保存", "success");
        renderSettings();
    }

    // === 6. 會員詳細檔案 Modal ===
    function openMemberDetailModal(memberId) {
        const member = state.members.find(m => m.id === memberId);
        if (!member) return;

        const avatarEl = document.getElementById("md-avatar");
        avatarEl.textContent = member.name.charAt(0);
        avatarEl.style.cssText = getAvatarStyle(member.avatarColor);
        document.getElementById("md-name").textContent = member.name;

        const lvlInfo = getLevelInfo(member.rating);
        document.getElementById("md-rating").textContent = `${member.rating} 分`;
        const badgeEl = document.getElementById("md-level-badge");
        badgeEl.textContent = `L${lvlInfo.level} - ${lvlInfo.name}`;
        badgeEl.style.cssText = `background:${lvlInfo.color}18; color:${lvlInfo.color}; border:1px solid ${lvlInfo.color}40;`;

        document.getElementById("md-stat-played").textContent = member.matchesPlayed;
        document.getElementById("md-stat-wins").textContent = member.wins;
        document.getElementById("md-stat-losses").textContent = member.losses;

        generateWinRatePieSVG("md-win-rate-pie", member.wins, member.losses);
        generateTrendChartSVG("md-trend-chart", member.ratingHistory);

        const partnerWins = {};
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

        let bestPartnerName = "尚無搭檔勝場紀錄";
        let maxWins = 0;
        for (const pid in partnerWins) {
            if (partnerWins[pid] > maxWins) {
                maxWins = partnerWins[pid];
                bestPartnerName = state.members.find(p => p.id === pid)?.name || "未知球員";
            }
        }

        const bestPartnerEl = document.getElementById("md-best-partner");
        if (maxWins > 0) {
            bestPartnerEl.textContent = `${bestPartnerName}（攜手勝 ${maxWins} 場）`;
            bestPartnerEl.style.color = "var(--accent-teal)";
        } else {
            bestPartnerEl.textContent = bestPartnerName;
            bestPartnerEl.style.color = "var(--text-muted)";
        }

        const nameDisplayBox = document.getElementById("md-name-display-box");
        const nameEditBox = document.getElementById("md-name-edit-box");
        const nameInput = document.getElementById("md-name-input");
        nameDisplayBox.style.display = "flex";
        nameEditBox.style.display = "none";
        nameInput.value = member.name;

        document.getElementById("md-edit-name-btn").onclick = (e) => {
            e.stopPropagation();
            if (isReadonlyMode()) return;
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
                showToast("請輸入有效的會員姓名", "warning");
                return;
            }
            const oldName = member.name;
            if (newName === oldName) {
                nameDisplayBox.style.display = "flex";
                nameEditBox.style.display = "none";
                return;
            }
            const isDuplicate = state.members.some(m => m.id !== member.id && m.name.toLowerCase() === newName.toLowerCase());
            if (isDuplicate) {
                showToast("已存在相同姓名的會員，請改用其他姓名", "warning");
                return;
            }

            member.name = newName;
            saveToStorage();
            document.getElementById("md-name").textContent = newName;
            avatarEl.textContent = newName.charAt(0);
            nameDisplayBox.style.display = "flex";
            nameEditBox.style.display = "none";

            renderDashboard();
            renderMembers();
            showToast(`已將姓名「${oldName}」修改為「${newName}」`, "success");
        };

        const displayBox = document.getElementById("md-rating-display-box");
        const editBox = document.getElementById("md-rating-edit-box");
        const ratingInput = document.getElementById("md-rating-input");
        displayBox.style.display = "flex";
        editBox.style.display = "none";
        ratingInput.value = member.rating;

        document.getElementById("md-edit-rating-btn").onclick = (e) => {
            e.stopPropagation();
            if (isReadonlyMode()) return;
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
            const newRating = parseInt(ratingInput.value, 10);
            if (isNaN(newRating) || newRating < 0 || newRating > 9999) {
                showToast("請輸入有效的積分數值 (0 ~ 9999)", "warning");
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

            document.getElementById("md-rating").textContent = `${newRating} 分`;
            const newLvlInfo = getLevelInfo(newRating);
            badgeEl.textContent = `L${newLvlInfo.level} - ${newLvlInfo.name}`;
            badgeEl.style.cssText = `background:${newLvlInfo.color}18; color:${newLvlInfo.color}; border:1px solid ${newLvlInfo.color}40;`;

            generateTrendChartSVG("md-trend-chart", member.ratingHistory);
            displayBox.style.display = "flex";
            editBox.style.display = "none";

            renderDashboard();
            renderMembers();
            showToast(`已將「${member.name}」積分從 ${oldRating} 調整為 ${newRating}`, "success");
        };

        document.getElementById("md-delete-btn").onclick = async () => {
            if (isReadonlyMode()) return;
            const confirmed = await showConfirm({
                title: "刪除會員確認",
                message: `確定要刪除會員「${member.name}」嗎？若已有參賽紀錄，需先回滾相關比賽才能刪除。`,
                confirmText: "確定刪除",
                danger: true
            });
            if (!confirmed) return;

            const res = deleteMember(member.id);
            if (res.success) {
                showToast(`會員「${member.name}」已刪除`, "success");
                closeModal("member-detail-modal");
                renderMembers();
            } else {
                await showAlert(res.reason, "無法刪除會員");
            }
        };

        openModal("member-detail-modal");
    }

    function openLevelChangeAlert(changes) {
        if (!changes || changes.length === 0) return;

        const overlay = document.getElementById("level-alert-overlay");
        const card = document.getElementById("level-alert-card");
        const c = changes[0];

        document.getElementById("alert-pname").textContent = c.playerName;
        document.getElementById("alert-title").textContent = c.direction === "up" ? "恭喜升級" : "等級調整提醒";
        document.getElementById("alert-desc").textContent = c.direction === "up"
            ? "實力突破積分門檻，順利晉升至更高一級。"
            : "本次賽事積分跨越等級邊界，調整狀態後再戰回來。";

        const badgeOld = document.getElementById("alert-badge-old");
        const badgeNew = document.getElementById("alert-badge-new");

        badgeOld.textContent = `L${c.oldLvl.level} ${c.oldLvl.name.split(" ")[0]}`;
        badgeOld.style.cssText = `background:${c.oldLvl.color}18; color:${c.oldLvl.color}; border:1px solid ${c.oldLvl.color}40;`;

        badgeNew.textContent = `L${c.newLvl.level} ${c.newLvl.name.split(" ")[0]}`;
        badgeNew.style.cssText = `background:${c.newLvl.color}18; color:${c.newLvl.color}; border:1px solid ${c.newLvl.color}40;`;

        card.className = "glow-alert-card " + c.direction;

        document.getElementById("alert-close-btn").onclick = () => {
            overlay.classList.remove("active");
            if (changes.length > 1) {
                setTimeout(() => openLevelChangeAlert(changes.slice(1)), 350);
            }
        };

        overlay.classList.add("active");
    }

    function applyReadonlyUI() {
        if (!isReadonlyMode()) return;
        document.body.classList.add("readonly-mode");

        const navMembers = document.getElementById("nav-members");
        if (navMembers) navMembers.textContent = "會員名冊";

        const historySub = document.querySelector("#view-match-history .page-subtitle");
        if (historySub) historySub.textContent = "支援依球員或日期篩選查詢，並可產生單日積分表";

        const syncEl = document.getElementById("sync-status");
        if (syncEl) syncEl.title = "點擊重新載入最新線上榜單";

        const meta = getReadonlyMeta();
        const updEl = document.getElementById("app-updated-label");
        if (updEl && meta.publishedDate) {
            updEl.textContent = meta.publishedDate;
        }
    }

    function showReadonlyLockScreen(errorMsg) {
        document.body.classList.add("readonly-locked");
        const overlay = document.getElementById("readonly-lock-overlay");
        const updatedEl = document.getElementById("readonly-lock-updated");
        const errorEl = document.getElementById("readonly-lock-error");
        const pwInput = document.getElementById("readonly-password-input");
        const meta = getReadonlyMeta();

        if (updatedEl) {
            updatedEl.textContent = meta.publishedDate
                ? `榜單更新：${meta.publishedDate}`
                : "線上加密榜單";
        }
        if (errorEl) {
            if (errorMsg) {
                errorEl.textContent = errorMsg;
                errorEl.style.display = "block";
            } else {
                errorEl.textContent = "";
                errorEl.style.display = "none";
            }
        }
        if (overlay) {
            overlay.style.display = "flex";
        }
        if (pwInput) {
            pwInput.value = "";
            setTimeout(() => pwInput.focus(), 50);
        }
    }

    function hideReadonlyLockScreen() {
        document.body.classList.remove("readonly-locked");
        const overlay = document.getElementById("readonly-lock-overlay");
        const errorEl = document.getElementById("readonly-lock-error");
        if (errorEl) {
            errorEl.textContent = "";
            errorEl.style.display = "none";
        }
        if (overlay) {
            overlay.style.display = "none";
        }
    }

    // === 7. 初始化綁定 ===
    document.addEventListener("DOMContentLoaded", async () => {
        if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
            navigator.serviceWorker.register("./sw.js")
                .catch(err => console.warn("PWA Service Worker 註冊失敗:", err));
        }

        const verEl = document.getElementById("app-version-label");
        const updEl = document.getElementById("app-updated-label");
        if (verEl) verEl.textContent = `v${APP_VERSION}`;
        if (updEl) updEl.textContent = APP_UPDATED;

        const initRes = await initStorage();

        const syncStatusEl = document.getElementById("sync-status");
        if (syncStatusEl) {
            syncStatusEl.addEventListener("click", () => manualSync(refreshCurrentView));
        }

        const views = ["dashboard", "members", "match-recorder", "match-history", "settings"];
        views.forEach(v => {
            const btn = document.getElementById(`nav-${v}`);
            if (btn) btn.addEventListener("click", () => switchView(v));
        });

        initPlayerComboboxes();

        // 線上幹部唯讀版：密碼鎖表單與上鎖鈕事件
        const readonlyForm = document.getElementById("readonly-unlock-form");
        const readonlyPwInput = document.getElementById("readonly-password-input");
        const readonlyToggleBtn = document.getElementById("btn-toggle-readonly-pw");
        const readonlyRememberEl = document.getElementById("readonly-remember-checkbox");
        const readonlyLockBtn = document.getElementById("btn-readonly-lock");
        const readonlyErrorEl = document.getElementById("readonly-lock-error");
        const readonlySubmitBtn = document.getElementById("btn-readonly-unlock");

        if (readonlyToggleBtn && readonlyPwInput) {
            readonlyToggleBtn.addEventListener("click", () => {
                const isPw = readonlyPwInput.type === "password";
                readonlyPwInput.type = isPw ? "text" : "password";
                readonlyToggleBtn.textContent = isPw ? "隱藏" : "顯示";
            });
        }

        if (readonlyForm) {
            readonlyForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const pw = readonlyPwInput ? readonlyPwInput.value : "";
                if (!pw) {
                    if (readonlyErrorEl) {
                        readonlyErrorEl.textContent = "請輸入幹部查詢密碼";
                        readonlyErrorEl.style.display = "block";
                    }
                    return;
                }
                if (readonlySubmitBtn) {
                    readonlySubmitBtn.disabled = true;
                    readonlySubmitBtn.textContent = "解密驗證中...";
                }
                try {
                    const remember = Boolean(readonlyRememberEl && readonlyRememberEl.checked);
                    await unlockReadonly(pw, remember);
                    applyReadonlyUI();
                    hideReadonlyLockScreen();
                    switchView("dashboard");
                    showToast("已解鎖幹部唯讀版", "success");
                } catch (err) {
                    if (readonlyErrorEl) {
                        readonlyErrorEl.textContent = err.message || "密碼錯誤，請重新輸入";
                        readonlyErrorEl.style.display = "block";
                    }
                } finally {
                    if (readonlySubmitBtn) {
                        readonlySubmitBtn.disabled = false;
                        readonlySubmitBtn.textContent = "解鎖查看積分";
                    }
                }
            });
        }

        if (readonlyLockBtn) {
            readonlyLockBtn.addEventListener("click", () => {
                lockReadonly();
                switchView("dashboard");
                showReadonlyLockScreen();
                showToast("已上鎖並清除本機記憶密碼", "info");
            });
        }

        if (isReadonlyMode()) {
            applyReadonlyUI();
            if (initRes && initRes.unlocked) {
                hideReadonlyLockScreen();
                switchView("dashboard");
            } else {
                const loadErr = initRes && initRes.loadError
                    ? `無法載入線上資料：${initRes.loadError}`
                    : "";
                showReadonlyLockScreen(loadErr);
            }
        } else {
            switchView("dashboard");
        }

        // 會員搜尋、等級篩選、排序
        document.getElementById("member-search").addEventListener("input", renderMembers);
        document.getElementById("member-level-filter").addEventListener("change", renderMembers);
        document.getElementById("member-sort-select").addEventListener("change", renderMembers);

        // 快速比分按鈕
        document.querySelectorAll(".quick-score-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.getElementById("mr-score-t1").value = btn.dataset.s1;
                document.getElementById("mr-score-t2").value = btn.dataset.s2;
            });
        });

        // 單場賽事提交
        document.getElementById("mr-submit-btn").addEventListener("click", () => {
            if (isReadonlyMode()) return;
            const [idA, idB, idC, idD] = getSelectedPlayerIds();
            const s1 = parseInt(document.getElementById("mr-score-t1").value, 10);
            const s2 = parseInt(document.getElementById("mr-score-t2").value, 10);
            const dateStr = document.getElementById("mr-match-date").value;

            if (!idA || !idB || !idC || !idD) {
                showToast("請選擇所有四位球員", "warning");
                return;
            }
            if (isNaN(s1) || isNaN(s2) || s1 === s2) {
                showToast("請輸入有效的局數比數，且比數不可平手", "warning");
                return;
            }

            const matchDate = dateInputToTimestamp(dateStr, state.matches);
            const res = recordMatch(idA, idB, idC, idD, s1, s2, [], { matchDate });

            if (res && res.success) {
                startConfetti();
                PLAYER_SELECTORS.forEach(selId => {
                    document.getElementById(selId).value = "";
                    syncComboboxDisplay(selId);
                });
                document.getElementById("mr-score-t1").value = "";
                document.getElementById("mr-score-t2").value = "";
                showToast("賽事已登錄並完成積分更新", "success");
                switchView("dashboard");

                if (res.levelChanges.length > 0) {
                    setTimeout(() => openLevelChangeAlert(res.levelChanges), 900);
                }
            } else {
                showToast((res && res.reason) || "比賽錄入失敗", "error");
            }
        });

        // 歷史賽事篩選與分頁
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
        document.getElementById("history-date-filter").addEventListener("change", () => {
            historyPage = 1;
            renderMatchHistory();
        });
        document.getElementById("btn-clear-history-date").addEventListener("click", () => {
            document.getElementById("history-date-filter").value = "";
            historyPage = 1;
            renderMatchHistory();
        });

        // 新增會員 Modal
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
            if (isReadonlyMode()) return;
            document.getElementById("add-mname").value = "";
            document.getElementById("add-mbulk-names").value = "";
            document.getElementById("add-mrating").value = 1200;
            document.getElementById("add-mhue").value = 175;
            setAddMode("single");
            const previewEl = document.getElementById("add-preview-avatar");
            previewEl.textContent = "新";
            previewEl.style.cssText = getAvatarStyle(175);
            openModal("add-member-modal");
        });

        document.getElementById("add-mhue").addEventListener("input", (e) => {
            const name = document.getElementById("add-mname").value || "新";
            const previewEl = document.getElementById("add-preview-avatar");
            previewEl.textContent = name.charAt(0);
            previewEl.style.cssText = getAvatarStyle(e.target.value);
        });

        document.getElementById("add-mname").addEventListener("input", (e) => {
            const val = e.target.value || "新";
            document.getElementById("add-preview-avatar").textContent = val.charAt(0);
        });

        document.getElementById("btn-submit-add-member").addEventListener("click", async () => {
            if (isReadonlyMode()) return;
            const rating = parseInt(document.getElementById("add-mrating").value, 10) || 1200;
            if (activeAddMode === "single") {
                const name = document.getElementById("add-mname").value.trim();
                const hue = document.getElementById("add-mhue").value;
                if (!name) {
                    showToast("請輸入會員姓名", "warning");
                    return;
                }
                const dup = state.members.some(m => m.name.toLowerCase() === name.toLowerCase());
                if (dup) {
                    showToast("已存在同名會員", "warning");
                    return;
                }
                const newM = addMember(name, rating, hue);
                if (newM) {
                    showToast(`已建立會員「${newM.name}」(${newM.rating}分)`, "success");
                    closeModal("add-member-modal");
                    renderMembers();
                }
            } else {
                const bulkText = document.getElementById("add-mbulk-names").value;
                const names = bulkText.split("\n").map(n => n.trim()).filter(Boolean);
                if (names.length === 0) {
                    showToast("請輸入至少一位會員姓名", "warning");
                    return;
                }
                let successCount = 0;
                names.forEach(name => {
                    const dup = state.members.some(m => m.name.toLowerCase() === name.toLowerCase());
                    if (!dup) {
                        const randomHue = Math.floor(Math.random() * 360);
                        if (addMember(name, rating, randomHue, { skipSave: true })) {
                            successCount++;
                        }
                    }
                });
                await saveToStorage();
                showToast(`已批次建立 ${successCount} 位新會員`, "success");
                closeModal("add-member-modal");
                renderMembers();
            }
        });

        // 設定與備份
        document.getElementById("btn-save-settings").addEventListener("click", () => {
            if (isReadonlyMode()) return;
            saveSystemSettings();
        });

        document.getElementById("btn-load-demo").addEventListener("click", async () => {
            const confirmed = await showConfirm({
                title: "載入示範數據",
                message: "這將載入 10 名虛擬會員及 6 場雙打示範賽，並會覆蓋您目前的資料。確定繼續嗎？",
                confirmText: "確定載入",
                danger: true
            });
            if (!confirmed) return;
            loadDemoData();
            showToast("示範數據已載入", "success");
            switchView("dashboard");
        });

        document.getElementById("btn-reset-db").addEventListener("click", async () => {
            const confirmed = await showConfirm({
                title: "清空並重置所有資料",
                message: "此操作將清空所有會員與歷史對戰資料（伺服器端仍會保留自動備份檔）。確定要重置嗎？",
                confirmText: "確定清空重置",
                danger: true
            });
            if (!confirmed) return;
            clearAllData();
            showToast("系統資料庫已清空重置", "success");
            switchView("dashboard");
        });

        document.getElementById("btn-download-backup-json").addEventListener("click", () => {
            const dStr = getLocalDateStr(new Date()).replace(/-/g, "");
            downloadTextFile(exportBackup(), `朝友桌球資料庫備份_${dStr}.json`, "application/json;charset=utf-8;");
            showToast("JSON 備份檔已下載", "success");
        });

        const jsonRestoreInput = document.getElementById("json-restore-file-input");
        document.getElementById("btn-trigger-json-restore").addEventListener("click", () => {
            jsonRestoreInput.value = "";
            jsonRestoreInput.click();
        });
        jsonRestoreInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const confirmed = await showConfirm({
                title: "還原 JSON 備份檔",
                message: `確定要使用「${file.name}」覆蓋還原目前的資料庫嗎？`,
                confirmText: "確定還原",
                danger: true
            });
            if (!confirmed) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                const res = importBackup(evt.target.result);
                if (res.success) {
                    showToast("JSON 備份還原成功", "success");
                    switchView("dashboard");
                } else {
                    showAlert(res.reason, "還原失敗");
                }
            };
            reader.readAsText(file, "UTF-8");
        });

        document.getElementById("btn-import-backup").addEventListener("click", async () => {
            const json = document.getElementById("set-backup-area").value;
            const confirmed = await showConfirm({
                title: "從文字區還原備份",
                message: "確定要將上方貼上的 JSON 內容還原並覆蓋目前資料嗎？",
                confirmText: "確定還原",
                danger: true
            });
            if (!confirmed) return;
            const res = importBackup(json);
            if (res.success) {
                showToast("備份資料導入成功", "success");
                switchView("dashboard");
            } else {
                showAlert(res.reason, "導入失敗");
            }
        });

        // 會員 CSV 匯出/匯入
        document.getElementById("btn-export-csv").addEventListener("click", () => {
            if (state.members.length === 0) {
                showToast("目前尚無會員資料可供匯出", "warning");
                return;
            }
            const header = "姓名,積分,等級\r\n";
            const rows = state.members.map(m => {
                const safeName = m.name.replace(/"/g, '""');
                const lvlInfo = getLevelInfo(m.rating);
                const lvlDisplay = `L${lvlInfo.level} ${lvlInfo.name.split(" ")[0]}`;
                return `"${safeName}",${m.rating},"${lvlDisplay}"`;
            }).join("\r\n");

            const dStr = getLocalDateStr(new Date()).replace(/-/g, "");
            downloadTextFile("\uFEFF" + header + rows, `朝友桌球會員名單_${dStr}.csv`, "text/csv;charset=utf-8;");
            showToast("會員名單 CSV 已匯出", "success");
        });

        const csvFileInput = document.getElementById("csv-import-input");
        document.getElementById("btn-trigger-csv-import").addEventListener("click", () => {
            csvFileInput.value = "";
            csvFileInput.click();
        });
        csvFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (evt) {
                try {
                    const lines = evt.target.result.split(/\r?\n/);
                    let successCount = 0, updateCount = 0, newCount = 0;

                    lines.forEach((line, index) => {
                        const cleanLine = line.trim();
                        if (!cleanLine) return;
                        const parts = cleanLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                        if (parts.length < 2) return;

                        const name = parts[0].replace(/^["']|["']$/g, "").trim();
                        const ratingStr = parts[1] ? parts[1].replace(/^["']|["']$/g, "").trim() : "";
                        const levelStr = parts[2] ? parts[2].replace(/^["']|["']$/g, "").trim() : "";
                        if (index === 0 && (name.includes("姓名") || name.toLowerCase().includes("name"))) return;
                        if (!name) return;

                        let ratingVal = parseInt(ratingStr, 10);
                        if (isNaN(ratingVal)) {
                            const fromCol2 = getRatingFromLevelStr(ratingStr);
                            const fromCol3 = getRatingFromLevelStr(levelStr);
                            ratingVal = fromCol2 !== null ? fromCol2 : (fromCol3 !== null ? fromCol3 : 1200);
                        }

                        const existing = state.members.find(m => m.name.toLowerCase() === name.toLowerCase());
                        if (existing) {
                            existing.rating = ratingVal;
                            existing.ratingHistory.push({
                                date: Date.now() + index,
                                rating: ratingVal,
                                matchId: "csv_import"
                            });
                            updateCount++;
                        } else {
                            addMember(name, ratingVal, Math.floor(Math.random() * 360), {
                                skipSave: true,
                                createdAt: Date.now() + index
                            });
                            newCount++;
                        }
                        successCount++;
                    });

                    if (successCount > 0) {
                        saveToStorage();
                        switchView("dashboard");
                        startConfetti();
                        showAlert(`新增 ${newCount} 位新會員，更新 ${updateCount} 位既有會員（共 ${successCount} 筆）。`, "會員 CSV 匯入成功");
                    } else {
                        showToast("找不到有效的「姓名,積分」或「姓名,等級」格式列", "error");
                    }
                } catch (err) {
                    showAlert("解析 CSV 檔案失敗：" + err.message, "匯入錯誤");
                }
            };
            reader.readAsText(file, "UTF-8");
        });

        // 等級規則 CSV 匯出/匯入（修正漏寫 readAsText）
        document.getElementById("btn-export-levels-csv").addEventListener("click", () => {
            const levels = state.settings.ratingLevels || DEFAULT_LEVELS;
            const sortedLevels = [...levels].sort((a, b) => a.level - b.level);
            const header = "等級,等級名稱,積分下限,積分上限\r\n";
            const rows = sortedLevels.map(lvl => `${lvl.level},"${lvl.name.replace(/"/g, '""')}",${lvl.min},${lvl.max}`).join("\r\n");
            const dStr = getLocalDateStr(new Date()).replace(/-/g, "");
            downloadTextFile("\uFEFF" + header + rows, `朝友桌球等級分數規則_${dStr}.csv`, "text/csv;charset=utf-8;");
            showToast("等級規則 CSV 已匯出", "success");
        });

        const levelsFileInput = document.getElementById("levels-csv-import-input");
        document.getElementById("btn-trigger-levels-csv-import").addEventListener("click", () => {
            levelsFileInput.value = "";
            levelsFileInput.click();
        });
        levelsFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (evt) {
                try {
                    const lines = evt.target.result.split(/\r?\n/);
                    const newLevels = [];
                    lines.forEach((line, index) => {
                        const cleanLine = line.trim();
                        if (!cleanLine) return;
                        const parts = cleanLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                        if (parts.length < 4) return;
                        const levelStr = parts[0].replace(/^["']|["']$/g, "").trim();
                        const name = parts[1].replace(/^["']|["']$/g, "").trim();
                        const minStr = parts[2].replace(/^["']|["']$/g, "").trim();
                        const maxStr = parts[3].replace(/^["']|["']$/g, "").trim();
                        if (index === 0 && (name.includes("名稱") || name.toLowerCase().includes("name") || levelStr.includes("等級"))) return;

                        const lvlVal = parseInt(levelStr, 10);
                        const minVal = parseInt(minStr, 10);
                        const maxVal = parseInt(maxStr, 10);
                        if (!isNaN(lvlVal) && name && !isNaN(minVal) && !isNaN(maxVal)) {
                            const oldLvl = (state.settings.ratingLevels || DEFAULT_LEVELS).find(l => l.level === lvlVal);
                            newLevels.push({
                                level: lvlVal,
                                name: name,
                                min: minVal,
                                max: maxVal,
                                color: oldLvl ? oldLvl.color : "#64748b"
                            });
                        }
                    });

                    if (newLevels.length > 0) {
                        newLevels.sort((a, b) => a.min - b.min);
                        state.settings.ratingLevels = newLevels;
                        saveToStorage();
                        renderSettings();
                        renderDashboard();
                        renderMembers();
                        showToast(`已匯入 ${newLevels.length} 個等級區間規則`, "success");
                    } else {
                        showToast("檔案內找不到有效的等級規則格式", "error");
                    }
                } catch (err) {
                    showAlert("解析等級 CSV 失敗：" + err.message, "匯入錯誤");
                }
            };
            reader.readAsText(file, "UTF-8");
        });

        // 單場 / 批次頁籤切換與批次事件
        const btnMatchSingleTab = document.getElementById("btn-match-single-tab");
        const btnMatchBatchTab = document.getElementById("btn-match-batch-tab");
        const matchSingleContainer = document.getElementById("match-single-container");
        const matchBatchContainer = document.getElementById("match-batch-container");

        function setMatchMode(mode) {
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
        btnMatchSingleTab.addEventListener("click", () => setMatchMode("single"));
        btnMatchBatchTab.addEventListener("click", () => setMatchMode("bulk"));

        document.getElementById("btn-parse-batch").addEventListener("click", handleParseBatch);
        document.getElementById("btn-clear-batch").addEventListener("click", () => {
            document.getElementById("batch-matches-input").value = "";
            document.getElementById("batch-preview-container").innerHTML = "";
            document.getElementById("batch-preview-area").style.display = "none";
            clearBatchState();
        });

        document.getElementById("btn-submit-batch").addEventListener("click", () => {
            if (isReadonlyMode()) return;
            handleSubmitBatch((importedCount, aggregatedLevelChanges) => {
                startConfetti();
                switchView("dashboard");
                showToast(`成功批次匯入 ${importedCount} 場賽事`, "success");
                if (aggregatedLevelChanges.length > 0) {
                    setTimeout(() => openLevelChangeAlert(aggregatedLevelChanges), 900);
                }
            });
        });

        // 修正批次 CSV 匯入漏寫 readAsText
        const batchCsvFileInput = document.getElementById("batch-csv-file-input");
        document.getElementById("btn-trigger-batch-csv").addEventListener("click", () => {
            batchCsvFileInput.value = "";
            batchCsvFileInput.click();
        });
        batchCsvFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (evt) {
                document.getElementById("batch-matches-input").value = evt.target.result;
                handleParseBatch();
            };
            reader.readAsText(file, "UTF-8");
        });

        // 單日積分報表
        document.getElementById("btn-open-daily-report").addEventListener("click", () => {
            const dates = Array.from(new Set(state.matches.map(m => getLocalDateStr(m.date)))).sort().reverse();
            if (dates.length === 0) {
                dates.push(getLocalDateStr(new Date()));
            }
            const repSelect = document.getElementById("rep-date-select");
            repSelect.innerHTML = dates.map(dt => `<option value="${escapeHtml(dt)}">${escapeHtml(dt)}</option>`).join("");
            generateDailyReport(dates[0]);
            openModal("daily-report-modal");
        });

        document.getElementById("rep-date-select").addEventListener("change", (e) => {
            generateDailyReport(e.target.value);
        });
        document.getElementById("btn-print-report").addEventListener("click", () => window.print());
        document.getElementById("btn-export-report-csv").addEventListener("click", () => {
            exportDailyReportCsv(document.getElementById("rep-date-select").value);
        });
    });

    global.openModal = openModal;
    global.closeModal = closeModal;
    global.openMemberDetailModal = openMemberDetailModal;
    global.triggerRollbackMatch = triggerRollbackMatch;
})(window);
