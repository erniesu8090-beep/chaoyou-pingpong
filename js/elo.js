/**
 * 朝友桌球分級小程式 - 雙打 Elo 計分引擎與時間軸重算模組
 */
(function (global) {
    "use strict";

    function getStateModule() {
        if (typeof module !== "undefined" && module.exports) {
            return require("./state.js");
        }
        return global.ChaoyouState;
    }

    function getLevelInfo(rating, customLevels) {
        const { state, DEFAULT_LEVELS } = getStateModule();
        const levels = customLevels || (state.settings && state.settings.ratingLevels) || DEFAULT_LEVELS;
        const sortedByMin = [...levels].sort((a, b) => a.min - b.min);
        for (const lvl of sortedByMin) {
            if (rating >= lvl.min && rating <= lvl.max) {
                return lvl;
            }
        }
        if (rating < sortedByMin[0].min) return sortedByMin[0];
        return sortedByMin[sortedByMin.length - 1];
    }

    function getAvatarStyle(hueValue) {
        const hue = parseInt(hueValue, 10) || 175;
        return `background: linear-gradient(135deg, hsl(${hue}, 68%, 44%) 0%, hsl(${(hue + 28) % 360}, 72%, 34%) 100%);`;
    }

    function getRatingFromLevelStr(levelStr) {
        if (!levelStr) return null;
        const match = String(levelStr).match(/\d+/);
        if (!match) return null;
        const lvlNum = parseInt(match[0], 10);
        if (lvlNum >= 1 && lvlNum <= 10) {
            const { state, DEFAULT_LEVELS } = getStateModule();
            const levels = (state.settings && state.settings.ratingLevels) || DEFAULT_LEVELS;
            const lvlObj = levels.find(l => l.level === lvlNum);
            if (lvlObj) {
                if (lvlNum === 10) return 700;
                return lvlObj.min;
            }
        }
        return null;
    }

    function calculateDoublesElo(rA, rB, rC, rD, winner, customSettings) {
        const { state } = getStateModule();
        const settings = customSettings || state.settings;
        const K = Number(settings.kFactor) || 32;
        const mode = settings.eloMode || "weight";

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
        const { state } = getStateModule();
        const pA = state.members.find(m => m.id === idA);
        const pB = state.members.find(m => m.id === idB);
        const pC = state.members.find(m => m.id === idC);
        const pD = state.members.find(m => m.id === idD);

        if (!pA || !pB || !pC || !pD) return null;

        const win1 = calculateDoublesElo(pA.rating, pB.rating, pC.rating, pD.rating, 1);
        const win2 = calculateDoublesElo(pA.rating, pB.rating, pC.rating, pD.rating, 2);

        return {
            ifTeam1Win: {
                A: { change: win1.playerA, nextRating: Math.max(0, pA.rating + win1.playerA) },
                B: { change: win1.playerB, nextRating: Math.max(0, pB.rating + win1.playerB) },
                C: { change: win1.playerC, nextRating: Math.max(0, pC.rating + win1.playerC) },
                D: { change: win1.playerD, nextRating: Math.max(0, pD.rating + win1.playerD) }
            },
            ifTeam2Win: {
                A: { change: win2.playerA, nextRating: Math.max(0, pA.rating + win2.playerA) },
                B: { change: win2.playerB, nextRating: Math.max(0, pB.rating + win2.playerB) },
                C: { change: win2.playerC, nextRating: Math.max(0, pC.rating + win2.playerC) },
                D: { change: win2.playerD, nextRating: Math.max(0, pD.rating + win2.playerD) }
            }
        };
    }

    function recalculatePlayerStats(member) {
        const { state } = getStateModule();
        const playerMatches = state.matches
            .filter(m => m.team1.includes(member.id) || m.team2.includes(member.id))
            .sort((a, b) => a.date - b.date);

        member.matchesPlayed = playerMatches.length;
        let wins = 0;
        let losses = 0;
        let streak = 0;

        playerMatches.forEach(m => {
            const isTeam1 = m.team1.includes(member.id);
            const isWinner = (isTeam1 && m.winner === 1) || (!isTeam1 && m.winner === 2);
            if (isWinner) {
                wins++;
                streak = streak >= 0 ? streak + 1 : 1;
            } else {
                losses++;
                streak = streak <= 0 ? streak - 1 : -1;
            }
        });

        member.wins = wins;
        member.losses = losses;
        member.streak = streak;
    }

    function recalculateAllMemberStats() {
        const { state } = getStateModule();
        state.members.forEach(m => recalculatePlayerStats(m));
    }

    function recalculatePlayerStreak(member) {
        recalculatePlayerStats(member);
    }

    /**
     * 時間軸重算引擎：從 pivotTime 開始依時間序重演賽事與手動調分錨點
     * - 完整保留 pivotTime 之前的既有紀錄
     * - 完整保留 manual_edit_* / csv_import / init 等非比賽錨點
     */
    function rebuildFromTimestamp(pivotTime) {
        const { state } = getStateModule();
        const validMatchIds = new Set(state.matches.map(m => m.id));
        const events = [];

        state.members.forEach(member => {
            const hist = Array.isArray(member.ratingHistory) ? member.ratingHistory : [];
            const initEntry = hist.find(h => h.matchId === "init");

            const beforeEntries = [];
            const afterAnchors = [];

            hist.forEach(h => {
                const isMatchEntry = String(h.matchId).startsWith("match_");
                if (h.date < pivotTime) {
                    if (!isMatchEntry || validMatchIds.has(h.matchId)) {
                        beforeEntries.push(h);
                    }
                } else {
                    if (!isMatchEntry) {
                        afterAnchors.push(h);
                    }
                }
            });

            if (beforeEntries.length > 0) {
                member.rating = beforeEntries[beforeEntries.length - 1].rating;
                member.ratingHistory = beforeEntries;
            } else {
                member.rating = initEntry ? initEntry.rating : (member.initialRating || 1200);
                member.ratingHistory = [];
            }

            afterAnchors.forEach((anchor, idx) => {
                events.push({
                    type: "anchor",
                    date: anchor.date,
                    order: anchor.matchId === "init" ? 0 : 1,
                    subOrder: idx,
                    member: member,
                    entry: anchor
                });
            });
        });

        state.matches.forEach((m, idx) => {
            if (m.date >= pivotTime) {
                events.push({
                    type: "match",
                    date: m.date,
                    order: 2,
                    subOrder: idx,
                    match: m
                });
            }
        });

        events.sort((a, b) => {
            if (a.date !== b.date) return a.date - b.date;
            if (a.order !== b.order) return a.order - b.order;
            return a.subOrder - b.subOrder;
        });

        events.forEach(ev => {
            if (ev.type === "anchor") {
                ev.member.rating = ev.entry.rating;
                ev.member.ratingHistory.push({
                    date: ev.entry.date,
                    rating: ev.entry.rating,
                    matchId: ev.entry.matchId
                });
            } else if (ev.type === "match") {
                const m = ev.match;
                const pA = state.members.find(p => p.id === m.team1[0]);
                const pB = state.members.find(p => p.id === m.team1[1]);
                const pC = state.members.find(p => p.id === m.team2[0]);
                const pD = state.members.find(p => p.id === m.team2[1]);

                if (!pA || !pB || !pC || !pD) return;

                const changes = calculateDoublesElo(pA.rating, pB.rating, pC.rating, pD.rating, m.winner);
                const nextA = Math.max(0, pA.rating + changes.playerA);
                const nextB = Math.max(0, pB.rating + changes.playerB);
                const nextC = Math.max(0, pC.rating + changes.playerC);
                const nextD = Math.max(0, pD.rating + changes.playerD);

                m.ratingChanges = {
                    [pA.id]: { prev: pA.rating, change: changes.playerA, next: nextA },
                    [pB.id]: { prev: pB.rating, change: changes.playerB, next: nextB },
                    [pC.id]: { prev: pC.rating, change: changes.playerC, next: nextC },
                    [pD.id]: { prev: pD.rating, change: changes.playerD, next: nextD }
                };

                [
                    { member: pA, next: nextA },
                    { member: pB, next: nextB },
                    { member: pC, next: nextC },
                    { member: pD, next: nextD }
                ].forEach(({ member, next }) => {
                    member.rating = next;
                    member.ratingHistory.push({
                        date: m.date,
                        rating: next,
                        matchId: m.id
                    });
                });
            }
        });

        recalculateAllMemberStats();
    }

    function recordMatch(idA, idB, idC, idD, score1, score2, setScores = [], options = {}) {
        const { state, saveToStorage } = getStateModule();
        const uniqueIds = new Set([idA, idB, idC, idD]);
        if (uniqueIds.size !== 4) {
            return { success: false, reason: "同一場比賽不可有重複的球員" };
        }
        if (score1 === score2 || isNaN(score1) || isNaN(score2)) {
            return { success: false, reason: "比分不可為平手或無效數值" };
        }

        const pA = state.members.find(m => m.id === idA);
        const pB = state.members.find(m => m.id === idB);
        const pC = state.members.find(m => m.id === idC);
        const pD = state.members.find(m => m.id === idD);
        if (!pA || !pB || !pC || !pD) {
            return { success: false, reason: "找不到指定的球員資料" };
        }

        const matchDate = options.matchDate ? Number(options.matchDate) : Date.now();
        const matchId = "match_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        const winner = score1 > score2 ? 1 : 2;

        const latestExistingDate = state.matches.length > 0
            ? Math.max(...state.matches.map(m => m.date))
            : 0;
        const hasLaterEvents = matchDate < latestExistingDate || state.members.some(m =>
            (m.ratingHistory || []).some(h => h.date > matchDate)
        );

        const beforeLevels = new Map();
        [pA, pB, pC, pD].forEach(p => beforeLevels.set(p.id, getLevelInfo(p.rating)));

        const newMatch = {
            id: matchId,
            date: matchDate,
            team1: [idA, idB],
            team2: [idC, idD],
            score: { team1: score1, team2: score2 },
            setScores: Array.isArray(setScores) ? setScores : [],
            winner: winner,
            ratingChanges: {}
        };

        if (!hasLaterEvents) {
            const changes = calculateDoublesElo(pA.rating, pB.rating, pC.rating, pD.rating, winner);
            const nextA = Math.max(0, pA.rating + changes.playerA);
            const nextB = Math.max(0, pB.rating + changes.playerB);
            const nextC = Math.max(0, pC.rating + changes.playerC);
            const nextD = Math.max(0, pD.rating + changes.playerD);

            newMatch.ratingChanges = {
                [idA]: { prev: pA.rating, change: changes.playerA, next: nextA },
                [idB]: { prev: pB.rating, change: changes.playerB, next: nextB },
                [idC]: { prev: pC.rating, change: changes.playerC, next: nextC },
                [idD]: { prev: pD.rating, change: changes.playerD, next: nextD }
            };

            state.matches.push(newMatch);

            [
                { member: pA, next: nextA, isWinner: winner === 1 },
                { member: pB, next: nextB, isWinner: winner === 1 },
                { member: pC, next: nextC, isWinner: winner === 2 },
                { member: pD, next: nextD, isWinner: winner === 2 }
            ].forEach(({ member, next, isWinner }) => {
                member.rating = next;
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
                    rating: next,
                    matchId: matchId
                });
            });
        } else {
            state.matches.push(newMatch);
            rebuildFromTimestamp(matchDate);
        }

        const levelChanges = [];
        [pA, pB, pC, pD].forEach(p => {
            const oldLvl = beforeLevels.get(p.id);
            const newLvl = getLevelInfo(p.rating);
            if (oldLvl.level !== newLvl.level) {
                levelChanges.push({
                    playerName: p.name,
                    oldLvl: oldLvl,
                    newLvl: newLvl,
                    direction: newLvl.level < oldLvl.level ? "up" : "down"
                });
            }
        });

        if (!options.skipSave) {
            saveToStorage();
        }
        return { success: true, levelChanges: levelChanges, match: newMatch };
    }

    function rollbackMatch(matchId, options = {}) {
        const { state, saveToStorage } = getStateModule();
        const matchIndex = state.matches.findIndex(m => m.id === matchId);
        if (matchIndex === -1) return false;

        const match = state.matches[matchIndex];
        state.matches.splice(matchIndex, 1);

        rebuildFromTimestamp(match.date);

        if (!options.skipSave) {
            saveToStorage();
        }
        return true;
    }

    function addMember(name, initialRating, hueValue, options = {}) {
        const { state, saveToStorage } = getStateModule();
        const trimmed = String(name || "").trim();
        if (!trimmed) return null;

        const id = "member_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        const parsedRating = parseInt(initialRating, 10);
        const rating = isNaN(parsedRating) ? 1200 : parsedRating;
        const createdAt = options.createdAt ? Number(options.createdAt) : Date.now();
        const hue = (hueValue !== undefined && hueValue !== null) ? String(hueValue) : String(Math.floor(Math.random() * 360));

        const newMember = {
            id: id,
            name: trimmed,
            rating: rating,
            avatarColor: hue,
            initialRating: rating,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            streak: 0,
            ratingHistory: [
                { date: createdAt, rating: rating, matchId: "init" }
            ]
        };

        state.members.push(newMember);
        if (!options.skipSave) {
            saveToStorage();
        }
        return newMember;
    }

    function deleteMember(memberId) {
        const { state, saveToStorage } = getStateModule();
        const hasMatches = state.matches.some(m =>
            m.team1.includes(memberId) || m.team2.includes(memberId)
        );

        if (hasMatches) {
            return {
                success: false,
                reason: "該會員已有參賽紀錄，無法直接刪除。若要移除，請先於「歷史賽事」將其相關比賽刪除回滾。"
            };
        }

        state.members = state.members.filter(m => m.id !== memberId);
        saveToStorage();
        return { success: true };
    }

    const exported = {
        getLevelInfo,
        getAvatarStyle,
        getRatingFromLevelStr,
        calculateDoublesElo,
        predictMatchElo,
        recalculatePlayerStats,
        recalculateAllMemberStats,
        recalculatePlayerStreak,
        rebuildFromTimestamp,
        recordMatch,
        rollbackMatch,
        addMember,
        deleteMember
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    } else {
        global.ChaoyouElo = exported;
    }
})(typeof window !== "undefined" ? window : globalThis);
