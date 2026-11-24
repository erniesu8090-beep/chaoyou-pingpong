/**
 * 朝友桌球分級小程式 - 狀態管理與雙向同步模組
 */
(function (global) {
    "use strict";

    const APP_VERSION = "2.1.0";
    const APP_UPDATED = "2026-11-24";
    const READONLY_PASS_KEY = "cy_readonly_pass";

    const DEFAULT_LEVELS = [
        { level: 10, name: "初級二階 (Novice II)", min: 0, max: 799, color: "#64748b" },
        { level: 9, name: "初級一階 (Novice I)", min: 800, max: 999, color: "#4d7c0f" },
        { level: 8, name: "中級二階 (Intermediate II)", min: 1000, max: 1199, color: "#15803d" },
        { level: 7, name: "中級一階 (Intermediate I)", min: 1200, max: 1399, color: "#0f766e" },
        { level: 6, name: "中高級二階 (High-Int II)", min: 1400, max: 1599, color: "#1d4ed8" },
        { level: 5, name: "中高級一階 (High-Int I)", min: 1600, max: 1799, color: "#4338ca" },
        { level: 4, name: "高級二階 (Advanced II)", min: 1800, max: 1999, color: "#7e22ce" },
        { level: 3, name: "高級一階 (Advanced I)", min: 2000, max: 2199, color: "#be185d" },
        { level: 2, name: "頂級二階 (Elite II)", min: 2200, max: 2399, color: "#c2410c" },
        { level: 1, name: "頂級一階 (Elite I)", min: 2400, max: 9999, color: "#b45309" }
    ];

    const DEFAULT_SETTINGS = {
        eloMode: "weight",
        kFactor: 32,
        ratingLevels: JSON.parse(JSON.stringify(DEFAULT_LEVELS))
    };

    const state = {
        members: [],
        matches: [],
        settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    };

    let syncInProgress = false;
    let pendingSync = false;
    let readonlyMode = false;
    let readonlyBundle = null;
    let readonlyPassword = "";
    let readonlyPublishedAt = "";
    let readonlyPublishedDate = "";

    function detectReadonlyBundleMode() {
        if (typeof document !== "undefined" && document.documentElement) {
            if (document.documentElement.getAttribute("data-readonly-bundle") === "true") {
                return true;
            }
        }
        if (typeof window !== "undefined" && window.location && window.location.search) {
            const params = new URLSearchParams(window.location.search);
            if (params.get("readonly") === "1") {
                return true;
            }
        }
        return false;
    }

    function isReadonlyMode() {
        return readonlyMode;
    }

    function getSavedReadonlyPassword() {
        if (typeof localStorage === "undefined") return "";
        try {
            return localStorage.getItem(READONLY_PASS_KEY) || "";
        } catch (_) {
            return "";
        }
    }

    function setSavedReadonlyPassword(pw) {
        if (typeof localStorage === "undefined") return;
        try {
            if (pw) {
                localStorage.setItem(READONLY_PASS_KEY, pw);
            } else {
                localStorage.removeItem(READONLY_PASS_KEY);
            }
        } catch (_) {
            // ignore storage errors
        }
    }

    function getReadonlyMeta() {
        return {
            publishedAt: readonlyPublishedAt,
            publishedDate: readonlyPublishedDate,
            hasSavedPassword: Boolean(getSavedReadonlyPassword()),
            unlocked: Boolean(readonlyMode && readonlyPassword)
        };
    }

    function cloneDefaultSettings() {
        return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }

    function migrateSettingsIfNeeded() {
        if (!state.settings || !Array.isArray(state.settings.ratingLevels) || state.settings.ratingLevels.length === 0) {
            state.settings = cloneDefaultSettings();
            return;
        }
        const levels = state.settings.ratingLevels;
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
            if (!readonlyMode) {
                saveToStorage();
            }
        }
    }

    function loadFromLocalStorage() {
        if (typeof localStorage === "undefined") return;
        try {
            const savedMembers = localStorage.getItem("cy_members");
            const savedMatches = localStorage.getItem("cy_matches");
            const savedSettings = localStorage.getItem("cy_settings");

            if (savedMembers) state.members = JSON.parse(savedMembers);
            if (savedMatches) state.matches = JSON.parse(savedMatches);
            if (savedSettings) state.settings = JSON.parse(savedSettings);
        } catch (err) {
            console.error("讀取 LocalStorage 失敗:", err);
        }
    }

    function persistLocalOnly() {
        if (readonlyMode || typeof localStorage === "undefined") return;
        localStorage.setItem("cy_members", JSON.stringify(state.members));
        localStorage.setItem("cy_matches", JSON.stringify(state.matches));
        localStorage.setItem("cy_settings", JSON.stringify(state.settings));
    }

    function updateSyncStatus(status, text) {
        if (typeof document === "undefined") return;
        const el = document.getElementById("sync-status");
        if (!el) return;
        el.className = "sync-badge " + status;
        el.textContent = text;
    }

    async function flushServerSync() {
        if (syncInProgress) {
            pendingSync = true;
            return;
        }
        syncInProgress = true;
        try {
            do {
                pendingSync = false;
                const dbPayload = {
                    members: state.members,
                    matches: state.matches,
                    settings: state.settings
                };
                const res = await fetch("/api/db", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(dbPayload)
                });
                if (!res.ok) throw new Error("HTTP Status " + res.status);
                updateSyncStatus("online", "區網同步中");
            } while (pendingSync);
        } catch (err) {
            console.error("同步儲存至伺服器失敗:", err);
            updateSyncStatus("error", "同步失敗 (點擊重試)");
        } finally {
            syncInProgress = false;
        }
    }

    async function fetchReadonlyBundle() {
        const res = await fetch("./data.enc.json?t=" + Date.now(), {
            method: "GET",
            cache: "no-store"
        });
        if (!res.ok) {
            throw new Error("無法載入線上加密資料庫 (HTTP " + res.status + ")");
        }
        const bundle = await res.json();
        const cryptoMod = global.ChaoyouCrypto;
        if (!cryptoMod || !cryptoMod.isEncryptedBundle(bundle)) {
            throw new Error("線上資料庫格式不符，請聯繫管理員重新發佈");
        }
        readonlyBundle = bundle;
        readonlyPublishedAt = bundle.publishedAt || "";
        readonlyPublishedDate = bundle.publishedDate || (readonlyPublishedAt ? readonlyPublishedAt.slice(0, 10) : "");
        return bundle;
    }

    async function unlockReadonly(password, remember) {
        if (!readonlyMode) {
            throw new Error("目前並非線上唯讀模式");
        }
        if (!readonlyBundle) {
            await fetchReadonlyBundle();
        }
        const cryptoMod = global.ChaoyouCrypto;
        if (!cryptoMod) {
            throw new Error("缺少加解密模組 ChaoyouCrypto");
        }

        const decrypted = await cryptoMod.decryptJson(readonlyBundle, password);
        if (!decrypted || !Array.isArray(decrypted.members) || !Array.isArray(decrypted.matches)) {
            throw new Error("解密後的資料結構不完整");
        }

        state.members = decrypted.members;
        state.matches = decrypted.matches;
        state.settings = decrypted.settings || cloneDefaultSettings();
        migrateSettingsIfNeeded();

        readonlyPassword = password;
        if (remember) {
            setSavedReadonlyPassword(password);
        } else {
            setSavedReadonlyPassword("");
        }

        const label = readonlyPublishedDate ? `唯讀版 · ${readonlyPublishedDate}` : "線上唯讀版";
        updateSyncStatus("online", label);
        return getReadonlyMeta();
    }

    function lockReadonly() {
        if (!readonlyMode) return;
        state.members = [];
        state.matches = [];
        state.settings = cloneDefaultSettings();
        readonlyPassword = "";
        setSavedReadonlyPassword("");
        updateSyncStatus("offline", "已上鎖");
    }

    async function initStorage() {
        readonlyMode = detectReadonlyBundleMode();

        if (readonlyMode) {
            updateSyncStatus("loading", "載入加密資料...");
            try {
                await fetchReadonlyBundle();
            } catch (err) {
                console.error("讀取線上唯讀資料庫失敗:", err);
                updateSyncStatus("error", "載入失敗 (點擊重試)");
                return { mode: "readonly", unlocked: false, loadError: err.message };
            }

            const savedPw = getSavedReadonlyPassword();
            if (savedPw) {
                try {
                    await unlockReadonly(savedPw, true);
                    return { mode: "readonly", unlocked: true };
                } catch (err) {
                    console.warn("已記住的密碼驗證失敗，需重新輸入:", err);
                    setSavedReadonlyPassword("");
                }
            }

            updateSyncStatus("offline", "待解鎖");
            return { mode: "readonly", unlocked: false };
        }

        const isHttp = typeof window !== "undefined" && window.location && window.location.protocol.startsWith("http");

        if (isHttp) {
            try {
                updateSyncStatus("loading", "同步中...");
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
                    loadFromLocalStorage();
                    updateSyncStatus("online", "區網同步中");
                    if (state.members.length > 0) {
                        await saveToStorage();
                    }
                } else {
                    if (Array.isArray(dbData.members)) state.members = dbData.members;
                    if (Array.isArray(dbData.matches)) state.matches = dbData.matches;
                    if (dbData.settings) state.settings = dbData.settings;
                    persistLocalOnly();
                    updateSyncStatus("online", "區網同步中");
                }
            } catch (err) {
                console.warn("連線至伺服器同步失敗，降級為本地單機模式:", err);
                loadFromLocalStorage();
                updateSyncStatus("error", "同步失敗 (點擊重試)");
            }
        } else {
            loadFromLocalStorage();
            updateSyncStatus("offline", "單機模式");
        }

        migrateSettingsIfNeeded();
        return { mode: isHttp ? "server" : "local", unlocked: true };
    }

    async function saveToStorage() {
        if (readonlyMode) return;
        persistLocalOnly();
        const isHttp = typeof window !== "undefined" && window.location && window.location.protocol.startsWith("http");
        if (isHttp) {
            await flushServerSync();
        }
    }

    async function manualSync(onRefreshed) {
        const toast = (global.ChaoyouUtils && global.ChaoyouUtils.showToast) || function () {};

        if (readonlyMode) {
            if (!readonlyPassword) {
                toast("請先輸入幹部密碼解鎖", "warning");
                return;
            }
            updateSyncStatus("loading", "更新榜單中...");
            try {
                await fetchReadonlyBundle();
                await unlockReadonly(readonlyPassword, Boolean(getSavedReadonlyPassword()));
                if (typeof onRefreshed === "function") onRefreshed();
                toast("已重新載入最新榜單", "success");
            } catch (err) {
                console.error("重新載入線上榜單失敗:", err);
                updateSyncStatus("error", "載入失敗 (點擊重試)");
                toast("載入失敗：" + err.message, "error");
            }
            return;
        }

        const isHttp = typeof window !== "undefined" && window.location && window.location.protocol.startsWith("http");
        if (!isHttp) {
            toast("目前處於單機模式，資料已自動保存在本機瀏覽器", "info");
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
                    await saveToStorage();
                    toast("伺服器資料為空，已將本機資料上傳同步", "success");
                } else {
                    updateSyncStatus("online", "區網同步中");
                    toast("伺服器與本機目前皆無資料", "info");
                }
            } else {
                if (Array.isArray(dbData.members)) state.members = dbData.members;
                if (Array.isArray(dbData.matches)) state.matches = dbData.matches;
                if (dbData.settings) state.settings = dbData.settings;
                persistLocalOnly();
                if (typeof onRefreshed === "function") onRefreshed();
                updateSyncStatus("online", "區網同步中");
                toast("同步成功，已載入最新數據", "success");
            }
        } catch (err) {
            console.error("手動同步失敗:", err);
            updateSyncStatus("error", "同步失敗 (點擊重試)");
            toast("同步失敗，請確認電腦端伺服器是否開啟", "error");
        }
    }

    function exportBackup() {
        return JSON.stringify({
            members: state.members,
            matches: state.matches,
            settings: state.settings
        }, null, 2);
    }

    function importBackup(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (!data || !Array.isArray(data.members) || !Array.isArray(data.matches)) {
                return { success: false, reason: "JSON 格式不符：缺少 members 或 matches 陣列。" };
            }
            state.members = data.members;
            state.matches = data.matches;
            state.settings = data.settings || cloneDefaultSettings();
            migrateSettingsIfNeeded();
            saveToStorage();
            return { success: true };
        } catch (err) {
            return { success: false, reason: "JSON 解析失敗：" + err.message };
        }
    }

    const exported = {
        APP_VERSION,
        APP_UPDATED,
        DEFAULT_LEVELS,
        DEFAULT_SETTINGS,
        state,
        cloneDefaultSettings,
        migrateSettingsIfNeeded,
        loadFromLocalStorage,
        persistLocalOnly,
        updateSyncStatus,
        initStorage,
        saveToStorage,
        manualSync,
        exportBackup,
        importBackup,
        isReadonlyMode,
        getReadonlyMeta,
        fetchReadonlyBundle,
        unlockReadonly,
        lockReadonly,
        getSavedReadonlyPassword
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    } else {
        global.ChaoyouState = exported;
    }
})(typeof window !== "undefined" ? window : globalThis);
