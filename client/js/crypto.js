/**
 * Client-side cryptography utilities using Web Crypto API
 * All private keys are generated and stored ONLY on the client
 */

/**
 * Generate an RSA key pair for the user
 * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>}
 */
export async function generateKeyPair() {
    try {
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: 'RSASSA-PKCS1-v1_5',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]), // 65537
                hash: 'SHA-256'
            },
            true, // extractable
            ['sign', 'verify']
        );

        return keyPair;
    } catch (error) {
        console.error('Error generating key pair:', error);
        throw error;
    }
}

/**
 * Export a public key to PEM format
 * @param {CryptoKey} publicKey
 * @returns {Promise<string>} PEM formatted public key
 */
export async function exportPublicKeyToPEM(publicKey) {
    const exported = await window.crypto.subtle.exportKey('spki', publicKey);
    const exportedAsString = arrayBufferToBase64(exported);
    const pemKey = `-----BEGIN PUBLIC KEY-----\n${exportedAsString}\n-----END PUBLIC KEY-----`;
    return pemKey;
}

/**
 * Export a private key to PEM format
 * @param {CryptoKey} privateKey
 * @returns {Promise<string>} PEM formatted private key
 */
export async function exportPrivateKeyToPEM(privateKey) {
    const exported = await window.crypto.subtle.exportKey('pkcs8', privateKey);
    const exportedAsString = arrayBufferToBase64(exported);
    const pemKey = `-----BEGIN PRIVATE KEY-----\n${exportedAsString}\n-----END PRIVATE KEY-----`;
    return pemKey;
}

/**
 * Import a private key from PEM format
 * @param {string} pemKey - PEM formatted private key
 * @returns {Promise<CryptoKey>}
 */
export async function importPrivateKeyFromPEM(pemKey) {
    const pemContents = pemKey
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');

    const binaryDer = base64ToArrayBuffer(pemContents);

    const key = await window.crypto.subtle.importKey(
        'pkcs8',
        binaryDer,
        {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-256'
        },
        true,
        ['sign']
    );

    return key;
}

/**
 * Sign data with a private key
 * @param {string} data - Data to sign
 * @param {CryptoKey} privateKey - Private key
 * @returns {Promise<string>} Base64 encoded signature
 */
export async function signData(data, privateKey) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    const signature = await window.crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        privateKey,
        dataBuffer
    );

    return arrayBufferToBase64(signature);
}

/**
 * Verify a signature (for testing purposes - normally server does this)
 * @param {string} data - Original data
 * @param {string} signatureBase64 - Base64 encoded signature
 * @param {CryptoKey} publicKey - Public key
 * @returns {Promise<boolean>}
 */
export async function verifySignature(data, signatureBase64, publicKey) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const signature = base64ToArrayBuffer(signatureBase64);

    const isValid = await window.crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        signature,
        dataBuffer
    );

    return isValid;
}

/**
 * Store private key in sessionStorage (cleared when browser closes)
 * WARNING: This is still vulnerable to XSS attacks. For production,
 * consider using IndexedDB with additional encryption or hardware tokens.
 * @param {string} privateKeyPEM - Private key in PEM format
 */
export function storePrivateKey(privateKeyPEM) {
    sessionStorage.setItem('rallyround_private_key', privateKeyPEM);
}

/**
 * Retrieve private key from sessionStorage
 * @returns {string|null} Private key PEM or null if not found
 */
export function getStoredPrivateKey() {
    return sessionStorage.getItem('rallyround_private_key');
}

/**
 * Clear stored private key
 */
export function clearPrivateKey() {
    sessionStorage.removeItem('rallyround_private_key');
}

/**
 * Convert ArrayBuffer to Base64 string
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}
