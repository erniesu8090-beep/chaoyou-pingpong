/**
 * 朝友桌球分級小程式 - 通用工具與站內對話框模組
 */
(function (global) {
    "use strict";

    let toastTimer = null;

    function escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getLocalDateStr(tsOrDate) {
        const d = tsOrDate instanceof Date ? tsOrDate : new Date(tsOrDate || Date.now());
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function getLocalTimeDisplay(ts) {
        const d = new Date(ts);
        return d.toLocaleString("zh-TW", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function dateInputToTimestamp(dateStr, matchesList) {
        if (!dateStr) return Date.now();
        const todayStr = getLocalDateStr(new Date());
        if (dateStr === todayStr) {
            return Date.now();
        }
        const dayStart = new Date(dateStr + "T00:00:00").getTime();
        const dayEnd = new Date(dateStr + "T23:59:59.999").getTime();
        const existingSameDay = (matchesList || []).filter(m => m.date >= dayStart && m.date <= dayEnd);
        if (existingSameDay.length > 0) {
            const maxTs = Math.max(...existingSameDay.map(m => m.date));
            return Math.min(dayEnd - 1000, maxTs + 1000);
        }
        return new Date(dateStr + "T12:00:00").getTime();
    }

    function showToast(message, type = "success") {
        if (typeof document === "undefined") return;
        let toast = document.getElementById("sync-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "sync-toast";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");
            document.body.appendChild(toast);
        }

        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }

        toast.className = "app-toast " + type;
        toast.textContent = message;

        requestAnimationFrame(() => {
            toast.classList.add("show");
        });

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
            toastTimer = null;
        }, 3000);
    }

    function openDialogModal({ title, message, confirmText, cancelText, danger, showCancel }) {
        if (typeof document === "undefined") {
            return Promise.resolve(true);
        }
        const overlay = document.getElementById("app-dialog-modal");
        if (!overlay) {
            return Promise.resolve(true);
        }

        return new Promise((resolve) => {
            const titleEl = document.getElementById("app-dialog-title");
            const msgEl = document.getElementById("app-dialog-message");
            const confirmBtn = document.getElementById("app-dialog-confirm");
            const cancelBtn = document.getElementById("app-dialog-cancel");
            const closeBtn = document.getElementById("app-dialog-close");

            titleEl.textContent = title || "系統提示";
            msgEl.textContent = message || "";
            confirmBtn.textContent = confirmText || "確定";
            cancelBtn.textContent = cancelText || "取消";
            cancelBtn.style.display = showCancel ? "inline-flex" : "none";

            confirmBtn.className = danger ? "btn btn-danger" : "btn btn-primary";

            const cleanup = (result) => {
                overlay.classList.remove("active");
                document.removeEventListener("keydown", onKeyDown);
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                closeBtn.onclick = null;
                overlay.onclick = null;
                resolve(result);
            };

            const onKeyDown = (e) => {
                if (e.key === "Escape") {
                    cleanup(false);
                } else if (e.key === "Enter" && !showCancel) {
                    cleanup(true);
                }
            };

            confirmBtn.onclick = () => cleanup(true);
            cancelBtn.onclick = () => cleanup(false);
            closeBtn.onclick = () => cleanup(false);
            overlay.onclick = (e) => {
                if (e.target === overlay) cleanup(false);
            };

            document.addEventListener("keydown", onKeyDown);
            overlay.classList.add("active");
            setTimeout(() => confirmBtn.focus(), 50);
        });
    }

    function showConfirm(optionsOrMessage, title) {
        if (typeof optionsOrMessage === "string") {
            return openDialogModal({
                title: title || "請確認操作",
                message: optionsOrMessage,
                confirmText: "確定",
                cancelText: "取消",
                danger: false,
                showCancel: true
            });
        }
        return openDialogModal({
            title: optionsOrMessage.title || "請確認操作",
            message: optionsOrMessage.message || "",
            confirmText: optionsOrMessage.confirmText || "確定",
            cancelText: optionsOrMessage.cancelText || "取消",
            danger: !!optionsOrMessage.danger,
            showCancel: true
        });
    }

    function showAlert(message, title) {
        return openDialogModal({
            title: title || "系統提示",
            message: message,
            confirmText: "我知道了",
            danger: false,
            showCancel: false
        });
    }

    function downloadTextFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const exported = {
        escapeHtml,
        getLocalDateStr,
        getLocalTimeDisplay,
        dateInputToTimestamp,
        showToast,
        showConfirm,
        showAlert,
        downloadTextFile
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    } else {
        global.ChaoyouUtils = exported;
    }
})(typeof window !== "undefined" ? window : globalThis);
