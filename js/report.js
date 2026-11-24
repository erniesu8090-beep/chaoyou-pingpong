/**
 * 朝友桌球分級小程式 - 單日積分日報表與 CSV 匯出模組
 */
(function (global) {
    "use strict";

    function getDeps() {
        if (typeof module !== "undefined" && module.exports) {
            return {
                utils: require("./utils.js"),
                stateMod: require("./state.js")
            };
        }
        return {
            utils: global.ChaoyouUtils,
            stateMod: global.ChaoyouState
        };
    }

    function buildDailyReportData(dateStr) {
        const { stateMod } = getDeps();
        const { state } = stateMod;

        const dateStart = new Date(dateStr + "T00:00:00").getTime();
        const dateEnd = new Date(dateStr + "T23:59:59.999").getTime();

        const reportData = [];
        state.members.forEach(member => {
            const hist = Array.isArray(member.ratingHistory) ? member.ratingHistory : [];
            const initEntry = hist.find(h => h.matchId === "init");
            const creationTime = initEntry ? initEntry.date : 0;
            if (creationTime > dateEnd) return;

            let startingRating = member.initialRating;
            const historyBefore = hist.filter(h => h.date < dateStart);
            if (historyBefore.length > 0) {
                startingRating = historyBefore[historyBefore.length - 1].rating;
            } else if (initEntry) {
                startingRating = initEntry.rating;
            }

            let currentRating = startingRating;
            const historyBeforeOrOn = hist.filter(h => h.date <= dateEnd);
            if (historyBeforeOrOn.length > 0) {
                currentRating = historyBeforeOrOn[historyBeforeOrOn.length - 1].rating;
            }

            reportData.push({
                name: member.name,
                startingRating: startingRating,
                change: currentRating - startingRating,
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

        const byCurrent = [...reportData].sort((a, b) => {
            if (b.currentRating !== a.currentRating) {
                return b.currentRating - a.currentRating;
            }
            return a.name.localeCompare(b.name, "zh-Hant");
        });

        const currentRankMap = new Map();
        byCurrent.forEach((p, idx) => {
            currentRankMap.set(p.name, idx + 1);
        });

        reportData.forEach(p => {
            p.newRank = currentRankMap.get(p.name);
        });

        return reportData;
    }

    function generateDailyReport(dateStr) {
        const { utils, stateMod } = getDeps();
        const { escapeHtml } = utils;
        const { state, DEFAULT_LEVELS } = stateMod;

        const printArea = document.getElementById("print-report-area");
        if (!printArea) return;

        const reportData = buildDailyReportData(dateStr);
        const totalCount = reportData.length;
        const rowsPerSide = Math.ceil(totalCount / 2);

        const dateObj = new Date(dateStr + "T00:00:00");
        const m = dateObj.getMonth() + 1;
        const d = dateObj.getDate();
        const formattedDateHeader = `${m}/${d}比賽結果`;

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
                <tr style="height: 30px;">
                    <td style="font-weight:bold; width: 3.5%;">${leftPlayer.originalRank}</td>
                    <td style="width: 4.5%;">${renderNewRankHtml(leftPlayer.originalRank, leftPlayer.newRank)}</td>
                    <td style="width: 11.5%;">${escapeHtml(leftPlayer.name)}</td>
                    <td style="width: 9%;">${leftPlayer.startingRating}</td>
                    <td class="daily-report-highlight-col" style="width: 12%; ${leftChangeStyle}">${leftChangeText}</td>
                    <td style="width: 9%;">${leftPlayer.currentRating}</td>
                    <td style="border:none; width: 3%; background:#ffffff;"></td>
                    ${rightPlayer ? `
                    <td style="font-weight:bold; width: 3.5%;">${rightPlayer.originalRank}</td>
                    <td style="width: 4.5%;">${renderNewRankHtml(rightPlayer.originalRank, rightPlayer.newRank)}</td>
                    <td style="width: 11.5%;">${escapeHtml(rightPlayer.name)}</td>
                    <td style="width: 9%;">${rightPlayer.startingRating}</td>
                    <td class="daily-report-highlight-col" style="width: 12%; ${rightChangeStyle}">${rightChangeText}</td>
                    <td style="width: 9%;">${rightPlayer.currentRating}</td>
                    ` : `
                    <td style="width: 3.5%;"></td>
                    <td style="width: 4.5%;"></td>
                    <td style="width: 11.5%;"></td>
                    <td style="width: 9%;"></td>
                    <td class="daily-report-highlight-col" style="width: 12%;"></td>
                    <td style="width: 9%;"></td>
                    `}
                </tr>
            `;
        }

        const levels = (state.settings && state.settings.ratingLevels) || DEFAULT_LEVELS;
        const sortedLevels = [...levels].sort((a, b) => a.level - b.level);

        const renderLevelRows = (startIdx, endIdx) => {
            let rows = "";
            for (let i = startIdx; i <= endIdx && i < sortedLevels.length; i++) {
                const lvl = sortedLevels[i];
                if (i === startIdx) {
                    rows += `
                        <tr style="height: 26px;">
                            <td rowspan="5" style="width: 30%; background: #e5e7eb; font-weight: bold; border: 1px solid #4b5563; text-align: center; color: #000; font-size:12px;">等級名稱</td>
                            <td style="width: 25%; font-weight: bold; border: 1px solid #4b5563; padding: 3px; color: #000; font-size:12px;">L${lvl.level}</td>
                            <td style="border: 1px solid #4b5563; padding: 3px; color: #000; font-size:12px;">${lvl.min}~${lvl.max}</td>
                        </tr>
                    `;
                } else {
                    rows += `
                        <tr style="height: 26px;">
                            <td style="font-weight: bold; border: 1px solid #4b5563; padding: 3px; color: #000; font-size:12px;">L${lvl.level}</td>
                            <td style="border: 1px solid #4b5563; padding: 3px; color: #000; font-size:12px;">${lvl.min}~${lvl.max}</td>
                        </tr>
                    `;
                }
            }
            return rows;
        };

        const formattedTitleDate = dateStr.replace(/-/g, ".");

        printArea.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:12px; border-bottom:3px double #000; padding-bottom:6px;">
                <div style="font-size:22px; font-weight:900; color:#000; letter-spacing:1px;">新朝友分級積分表</div>
                <div style="font-size:16px; font-weight:bold; color:#000; font-family:monospace; margin-bottom:2px;">${escapeHtml(formattedTitleDate)}</div>
            </div>
            <table class="daily-report-table">
                <thead>
                    <tr style="height: 32px;">
                        <th>原排</th>
                        <th>新排</th>
                        <th>姓名</th>
                        <th>起始積分</th>
                        <th style="background-color:#dbeafe !important;">${escapeHtml(formattedDateHeader)}</th>
                        <th>目前積分</th>
                        <th style="border:none; background:#ffffff;"></th>
                        <th>原排</th>
                        <th>新排</th>
                        <th>姓名</th>
                        <th>起始積分</th>
                        <th style="background-color:#dbeafe !important;">${escapeHtml(formattedDateHeader)}</th>
                        <th>目前積分</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
            </table>
            <div style="margin-top:18px; display:flex; justify-content:space-between;">
                <div style="width:48%;">
                    <table style="width:100%; border-collapse:collapse; border:1px solid #4b5563; text-align:center;">
                        <tbody>${renderLevelRows(0, 4)}</tbody>
                    </table>
                </div>
                <div style="width:48%;">
                    <table style="width:100%; border-collapse:collapse; border:1px solid #4b5563; text-align:center;">
                        <tbody>${renderLevelRows(5, 9)}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function exportDailyReportCsv(dateStr) {
        const { utils } = getDeps();
        const { downloadTextFile, showToast } = utils;

        const reportData = buildDailyReportData(dateStr);
        const csvRows = [];
        csvRows.push("\uFEFF" + `原排,新排,姓名,起始積分,${dateStr.replace(/-/g, "/")}比賽結果,目前積分`);

        reportData.forEach(p => {
            const changeStr = p.change > 0 ? `+${p.change}` : p.change.toString();
            csvRows.push(`${p.originalRank},${p.newRank},"${p.name.replace(/"/g, '""')}",${p.startingRating},${changeStr},${p.currentRating}`);
        });

        try {
            downloadTextFile(
                csvRows.join("\r\n"),
                `朝友桌球單日分級積分表_${dateStr.replace(/-/g, "")}.csv`,
                "text/csv;charset=utf-8;"
            );
            showToast("單日積分報表 CSV 已匯出", "success");
        } catch (err) {
            showToast("匯出 CSV 失敗：" + err.message, "error");
        }
    }

    const exported = {
        buildDailyReportData,
        generateDailyReport,
        exportDailyReportCsv
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    } else {
        global.ChaoyouReport = exported;
    }
})(typeof window !== "undefined" ? window : globalThis);
