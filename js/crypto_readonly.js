/**
 * 朝友桌球分級小程式 - 線上幹部唯讀版 AES-256-GCM 加解密模組
 * 支援瀏覽器 Web Crypto API（HTTPS / localhost）與 Node.js 18+ 雙環境共用。
 */
(function (global) {
    "use strict";

    const DEFAULT_ITERATIONS = 250000;
    const SALT_BYTES = 16;
    const IV_BYTES = 12;

    function getCryptoObj() {
        if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle) {
            return globalThis.crypto;
        }
        if (typeof require === "function") {
            try {
                const nodeCrypto = require("crypto");
                if (nodeCrypto && nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) {
                    return nodeCrypto.webcrypto;
                }
            } catch (_) {
                // ignore
            }
        }
        return null;
    }

    function isWebCryptoAvailable() {
        return Boolean(getCryptoObj());
    }

    function uint8ToBase64(bytes) {
        if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
            return Buffer.from(bytes).toString("base64");
        }
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const slice = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, slice);
        }
        return btoa(binary);
    }

    function base64ToUint8(b64) {
        if (typeof b64 !== "string" || !b64) {
            throw new Error("無效的 Base64 編碼資料");
        }
        if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
            return new Uint8Array(Buffer.from(b64, "base64"));
        }
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function utf8Encode(str) {
        if (typeof TextEncoder !== "undefined") {
            return new TextEncoder().encode(str);
        }
        return new Uint8Array(Buffer.from(str, "utf8"));
    }

    function utf8Decode(bytes) {
        if (typeof TextDecoder !== "undefined") {
            return new TextDecoder("utf-8").decode(bytes);
        }
        return Buffer.from(bytes).toString("utf8");
    }

    function isEncryptedBundle(obj) {
        return Boolean(
            obj &&
            typeof obj === "object" &&
            obj.version === 1 &&
            obj.alg === "AES-256-GCM" &&
            obj.kdf === "PBKDF2-SHA256" &&
            typeof obj.iterations === "number" &&
            obj.iterations >= 10000 &&
            typeof obj.salt === "string" &&
            typeof obj.iv === "string" &&
            typeof obj.ciphertext === "string"
        );
    }

    async function deriveAesKey(cryptoObj, password, saltBytes, iterations, usages) {
        const keyMaterial = await cryptoObj.subtle.importKey(
            "raw",
            utf8Encode(password),
            "PBKDF2",
            false,
            ["deriveKey"]
        );
        return cryptoObj.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: saltBytes,
                iterations: iterations,
                hash: "SHA-256"
            },
            keyMaterial,
            {
                name: "AES-GCM",
                length: 256
            },
            false,
            usages
        );
    }

    function formatLocalDateLabel(dateObj) {
        const d = dateObj || new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    async function encryptJson(payloadObj, password, meta) {
        if (typeof password !== "string" || password.length < 8) {
            throw new Error("幹部密碼長度至少須 8 個字元以上");
        }
        const cryptoObj = getCryptoObj();
        if (!cryptoObj) {
            throw new Error("目前執行環境不支援 Web Crypto API（需 HTTPS 或 Node 18+）");
        }

        const saltBytes = new Uint8Array(SALT_BYTES);
        const ivBytes = new Uint8Array(IV_BYTES);
        cryptoObj.getRandomValues(saltBytes);
        cryptoObj.getRandomValues(ivBytes);

        const aesKey = await deriveAesKey(cryptoObj, password, saltBytes, DEFAULT_ITERATIONS, ["encrypt"]);
        const plainBytes = utf8Encode(JSON.stringify(payloadObj));

        const cipherBuf = await cryptoObj.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: ivBytes
            },
            aesKey,
            plainBytes
        );

        const now = new Date();
        return {
            version: 1,
            alg: "AES-256-GCM",
            kdf: "PBKDF2-SHA256",
            iterations: DEFAULT_ITERATIONS,
            publishedAt: (meta && meta.publishedAt) || now.toISOString(),
            publishedDate: (meta && meta.publishedDate) || formatLocalDateLabel(now),
            salt: uint8ToBase64(saltBytes),
            iv: uint8ToBase64(ivBytes),
            ciphertext: uint8ToBase64(new Uint8Array(cipherBuf))
        };
    }

    async function decryptJson(bundleObj, password) {
        if (!isEncryptedBundle(bundleObj)) {
            throw new Error("加密資料格式不符或已損毀");
        }
        if (typeof password !== "string" || !password) {
            throw new Error("請輸入幹部密碼");
        }
        const cryptoObj = getCryptoObj();
        if (!cryptoObj) {
            throw new Error("目前瀏覽器環境不支援加密解密（請確認使用 HTTPS 連線）");
        }

        const saltBytes = base64ToUint8(bundleObj.salt);
        const ivBytes = base64ToUint8(bundleObj.iv);
        const cipherBytes = base64ToUint8(bundleObj.ciphertext);

        const aesKey = await deriveAesKey(cryptoObj, password, saltBytes, bundleObj.iterations, ["decrypt"]);

        let plainBuf;
        try {
            plainBuf = await cryptoObj.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: ivBytes
                },
                aesKey,
                cipherBytes
            );
        } catch (_) {
            throw new Error("密碼錯誤或資料已被竄改，無法解鎖");
        }

        try {
            return JSON.parse(utf8Decode(new Uint8Array(plainBuf)));
        } catch (_) {
            throw new Error("解密後的資料格式無法解析");
        }
    }

    const exported = {
        DEFAULT_ITERATIONS,
        isWebCryptoAvailable,
        isEncryptedBundle,
        encryptJson,
        decryptJson
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exported;
    } else {
        global.ChaoyouCrypto = exported;
    }
})(typeof window !== "undefined" ? window : globalThis);
