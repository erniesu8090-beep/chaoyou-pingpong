/**
 * 朝友桌球分級小程式 - 批次賽事解析與匯入模組
 */
(function (global) {
    "use strict";

    function getDeps() {
        if (typeof module !== "undefined" && module.exports) {
            return {
                utils: require("./utils.js"),
                stateMod: require("./state.js"),
                elo: require("./elo.js")
            };
        }
        return {
            utils: global.ChaoyouUtils,
            stateMod: global.ChaoyouState,
            elo: global.ChaoyouElo
        };
    }

    let lastParsedMatches = [];

    function getLastParsedMatches() {
        return lastParsedMatches;
    }

    function clearBatchState() {
        lastParsedMatches = [];
    }

    function extractTrailingSetScores(line) {
        const parenMatch = line.match(/\s*[（(]([^()（）]+)[)）]\s*$/);
        if (!parenMatch) {
            return { coreText: line, setScores: [] };
        }
        const inner = parenMatch[1].trim();
        const tokens = inner.split(/[,，;\s]+/).map(t => t.trim()).filter(Boolean);
        const setScorePattern = /^\d+\s*[:：\-]\s*\d+$/;
        if (tokens.length > 0 && tokens.every(t => setScorePattern.test(t))) {
            const normalized = tokens.map(t => t.replace(/[：\-]/g, ":").replace(/\s+/g, ""));
            return {
                coreText: line.slice(0, parenMatch.index).trim(),
                setScores: normalized
            };
        }
        return { coreText: line, setScores: [] };
    }

    function validateMatchPlayersAndScore(team1, team2, score1, score2) {
        if (isNaN(score1) || isNaN(score2)) {
            return "無法解析有效的比分數字";
        }
        if (score1 === score2) {
            return `比分不可平手 (${score1}:${score2})`;
        }
        const allNames = [...team1, ...team2].map(n => n.trim().toLowerCase());
        const unique = new Set(allNames);
        if (unique.size !== 4) {
            return "同一場比賽不可出現重複球員姓名";
        }
        return null;
    }

    function parseBatchMatches(text) {
        const lines = String(text || "").split(/\r?\n/);
        const parsed = [];

        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return;

            const { coreText, setScores } = extractTrailingSetScores(trimmed);

            // 1. CSV 逗號/Tab 分隔格式
            const csvParts = coreText.split(/[,，\t]/).map(p => p.trim());
            if (csvParts.length === 6) {
                const num4 = parseInt(csvParts[4], 10);
                const num5 = parseInt(csvParts[5], 10);
                const num2 = parseInt(csvParts[2], 10);
                const num3 = parseInt(csvParts[3], 10);

                if (!isNaN(num4) && !isNaN(num5) && csvParts[0] && csvParts[1] && csvParts[2] && csvParts[3]) {
                    const team1 = [csvParts[0], csvParts[1]];
                    const team2 = [csvParts[2], csvParts[3]];
                    const err = validateMatchPlayersAndScore(team1, team2, num4, num5);
                    if (err) {
                        parsed.push({ raw: trimmed, lineNum: index + 1, success: false, error: err });
                    } else {
                        parsed.push({
                            raw: trimmed, lineNum: index + 1, success: true,
                            team1, team2, score1: num4, score2: num5, setScores
                        });
                    }
                    return;
                } else if (!isNaN(num2) && !isNaN(num3) && csvParts[0] && csvParts[1] && csvParts[4] && csvParts[5]) {
                    const team1 = [csvParts[0], csvParts[1]];
                    const team2 = [csvParts[4], csvParts[5]];
                    const err = validateMatchPlayersAndScore(team1, team2, num2, num3);
                    if (err) {
                        parsed.push({ raw: trimmed, lineNum: index + 1, success: false, error: err });
                    } else {
                        parsed.push({
                            raw: trimmed, lineNum: index + 1, success: true,
                            team1, team2, score1: num2, score2: num3, setScores
                        });
                    }
                    return;
                }
            }

            // 2. 文字分隔格式
            const regex = /(\d+)\s*(?:[:：\-比]|vs\b|v\b|VS\b)\s*(\d+)/i;
            const match = coreText.match(regex);
            if (!match) {
                parsed.push({
                    raw: trimmed,
                    lineNum: index + 1,
                    success: false,
                    error: "找不到有效的對戰大局比分（例如：3:1 或 3比2）"
                });
                return;
            }

            const score1 = parseInt(match[1], 10);
            const score2 = parseInt(match[2], 10);
            const scoreStr = match[0];
            const scoreIdx = match.index;

            const leftText = coreText.slice(0, scoreIdx).trim();
            const rightText = coreText.slice(scoreIdx + scoreStr.length).trim();

            if (!leftText || !rightText) {
                parsed.push({
                    raw: trimmed,
                    lineNum: index + 1,
                    success: false,
                    error: "無法藉由比分正確分割左右隊伍"
                });
                return;
            }

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

            const err = validateMatchPlayersAndScore(team1, team2, score1, score2);
            if (err) {
                parsed.push({ raw: trimmed, lineNum: index + 1, success: false, error: err });
                return;
            }

            parsed.push({
                raw: trimmed,
                lineNum: index + 1,
                success: true,
                team1,
                team2,
                score1,
                score2,
                setScores
            });
        });

        return parsed;
    }

    function handleParseBatch() {
        const { utils, stateMod } = getDeps();
        const { escapeHtml, showToast } = utils;
        const { state } = stateMod;

        const inputText = document.getElementById("batch-matches-input").value;
        const autoRegister = document.getElementById("batch-auto-register").checked;
        const defaultRating = parseInt(document.getElementById("batch-default-rating").value, 10) || 1200;

        if (!inputText.trim()) {
            showToast("請先貼上賽事成績", "warning");
            return;
        }

        const parsed = parseBatchMatches(inputText);
        lastParsedMatches = parsed;

        const container = document.getElementById("batch-preview-container");
        container.innerHTML = "";

        let successCount = 0;
        let errorCount = 0;
        const newPlayersSet = new Set();

        parsed.forEach(m => {
            if (!m.success) {
                errorCount++;
                container.insertAdjacentHTML("beforeend", `
                    <div class="batch-preview-item error-row">
                        <div class="batch-preview-line-num">第 ${m.lineNum} 行</div>
                        <div class="batch-preview-teams batch-error-msg">
                            解析失敗：${escapeHtml(m.error)}
                        </div>
                        <span class="batch-status-badge error">格式錯誤</span>
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
                    newPlayersSet.add(p.name.toLowerCase());
                }
            });

            const hasMissing = missingPlayers.length > 0;
            const cannotImport = hasMissing && !autoRegister;

            if (cannotImport) {
                errorCount++;
                m.hasUnregisteredError = true;
            } else {
                successCount++;
                m.hasUnregisteredError = false;
            }

            const renderPlayerTag = (p) => {
                const safeName = escapeHtml(p.name);
                if (p.exist) {
                    return `<span class="batch-player-tag">${safeName} <small>(${p.rating})</small></span>`;
                }
                return `<span class="batch-player-tag new-player">${safeName} <small>(新・${defaultRating})</small></span>`;
            };

            const rowClass = cannotImport ? "error-row" : (hasMissing ? "new-players-row" : "ready-row");
            const badgeClass = cannotImport ? "error" : (hasMissing ? "new-players" : "ready");
            const badgeText = cannotImport ? "含未註冊" : (hasMissing ? `含 ${missingPlayers.length} 位新人` : "就緒");
            const setScoreText = m.setScores && m.setScores.length > 0
                ? `<span class="batch-sets-pill">${escapeHtml(m.setScores.join(", "))}</span>`
                : "";

            container.insertAdjacentHTML("beforeend", `
                <div class="batch-preview-item ${rowClass}">
                    <div class="batch-preview-line-num">第 ${m.lineNum} 行</div>
                    <div class="batch-preview-teams">
                        <div class="batch-team-names t1">
                            ${renderPlayerTag(team1Players[0])}
                            ${renderPlayerTag(team1Players[1])}
                        </div>
                        <div class="batch-preview-vs-score">
                            <span class="${m.score1 > m.score2 ? "score-win" : ""}">${m.score1}</span>
                            <span>:</span>
                            <span class="${m.score2 > m.score1 ? "score-win" : ""}">${m.score2}</span>
                        </div>
                        <div class="batch-team-names t2">
                            ${renderPlayerTag(team2Players[0])}
                            ${renderPlayerTag(team2Players[1])}
                        </div>
                        ${setScoreText}
                    </div>
                    <span class="batch-status-badge ${badgeClass}">${badgeText}</span>
                </div>
            `);
        });

        const summaryBadge = document.getElementById("batch-summary-badge");
        let summaryText = `有效 ${successCount} 場`;
        if (errorCount > 0) summaryText += ` / 異常 ${errorCount} 場`;
        if (autoRegister && newPlayersSet.size > 0) {
            summaryText += `（將自動建檔 ${newPlayersSet.size} 位新球員）`;
        }
        summaryBadge.textContent = summaryText;

        document.getElementById("batch-preview-area").style.display = "block";
        document.getElementById("btn-submit-batch").disabled = successCount === 0;
    }

    async function handleSubmitBatch(onSuccess) {
        const { utils, stateMod, elo } = getDeps();
        const { showToast, showConfirm, dateInputToTimestamp } = utils;
        const { state, saveToStorage } = stateMod;
        const { addMember, recordMatch, getLevelInfo } = elo;

        if (!lastParsedMatches || lastParsedMatches.length === 0) return;

        const autoRegister = document.getElementById("batch-auto-register").checked;
        const defaultRating = parseInt(document.getElementById("batch-default-rating").value, 10) || 1200;
        const dateEl = document.getElementById("batch-match-date");
        const dateStr = dateEl ? dateEl.value : "";

        const validMatches = lastParsedMatches.filter(m => m.success && (!m.hasUnregisteredError || autoRegister));
        if (validMatches.length === 0) {
            showToast("沒有可匯入的有效賽事", "warning");
            return;
        }

        const confirmed = await showConfirm({
            title: "確認批次匯入賽事",
            message: `確定要批次匯入這 ${validMatches.length} 場賽事（日期：${dateStr || "今天"}）並計算 Elo 積分嗎？`,
            confirmText: "確認匯入"
        });
        if (!confirmed) return;

        const ratingsBefore = new Map();
        state.members.forEach(member => {
            ratingsBefore.set(member.name.toLowerCase(), {
                rating: member.rating,
                level: getLevelInfo(member.rating).level
            });
        });

        const baseMatchTs = dateInputToTimestamp(dateStr, state.matches);
        let importedCount = 0;

        validMatches.forEach((m, idx) => {
            const matchTs = baseMatchTs + idx * 1000;
            const getOrCreatePlayerId = (name) => {
                let player = state.members.find(p => p.name.toLowerCase() === name.toLowerCase());
                if (!player && autoRegister) {
                    const randomHue = Math.floor(Math.random() * 360);
                    player = addMember(name, defaultRating, randomHue, {
                        skipSave: true,
                        createdAt: baseMatchTs - 1000
                    });
                }
                return player ? player.id : null;
            };

            const idA = getOrCreatePlayerId(m.team1[0]);
            const idB = getOrCreatePlayerId(m.team1[1]);
            const idC = getOrCreatePlayerId(m.team2[0]);
            const idD = getOrCreatePlayerId(m.team2[1]);

            if (idA && idB && idC && idD) {
                const res = recordMatch(idA, idB, idC, idD, m.score1, m.score2, m.setScores || [], {
                    matchDate: matchTs,
                    skipSave: true
                });
                if (res && res.success) {
                    importedCount++;
                }
            }
        });

        if (importedCount > 0) {
            const aggregatedLevelChanges = [];
            state.members.forEach(member => {
                const prevInfo = ratingsBefore.get(member.name.toLowerCase());
                const oldRating = prevInfo ? prevInfo.rating : defaultRating;
                const oldLvl = getLevelInfo(oldRating);
                const newLvl = getLevelInfo(member.rating);

                if (oldLvl.level !== newLvl.level) {
                    aggregatedLevelChanges.push({
                        playerName: member.name,
                        oldLvl,
                        newLvl,
                        direction: newLvl.level < oldLvl.level ? "up" : "down"
                    });
                }
            });

            await saveToStorage();

            document.getElementById("batch-matches-input").value = "";
            document.getElementById("batch-preview-container").innerHTML = "";
            document.getElementById("batch-preview-area").style.display = "none";
            lastParsedMatches = [];

            if (typeof onSuccess === "function") {
                onSuccess(importedCount, aggregatedLevelChanges);
            }
        } else {
            showToast("匯入失敗，請檢查資料是否正確", "error");
        }
    }

    const exported = {
        parseBatchMatches,
        handleParseBatch,
        handleSubmitBatch,
        getLastParsedMatches,
        clearBatchState
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    } else {
        global.ChaoyouBatch = exported;
    }
})(typeof window !== "undefined" ? window : globalThis);
