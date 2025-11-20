const forge = require('node-forge');
const crypto = require('crypto');

/**
 * Generate an RSA key pair for a user
 * @returns {Promise<{publicKey: string, privateKey: string}>}
 */
async function generateKeyPair() {
  return new Promise((resolve, reject) => {
    forge.pki.rsa.generateKeyPair({ bits: 2048, workers: 2 }, (err, keyPair) => {
      if (err) {
        return reject(err);
      }

      const publicKey = forge.pki.publicKeyToPem(keyPair.publicKey);
      const privateKey = forge.pki.privateKeyToPem(keyPair.privateKey);

      resolve({ publicKey, privateKey });
    });
  });
}

/**
 * Enforce the rolling window key limit (max 100 keys per user)
 * @param {Object} publicKeys - GunDB public keys reference
 * @param {string} userId - User identifier
 * @param {number} maxKeys - Maximum number of keys allowed (default: 100)
 */
async function enforceKeyLimit(publicKeys, userId, maxKeys = 100) {
  return new Promise((resolve) => {
    const userKeys = publicKeys.get(userId).get('keys');

    // Get all keys for this user
    const keys = [];
    userKeys.map().once((data, keyId) => {
      if (data && data.timestamp) {
        keys.push({ keyId, timestamp: data.timestamp });
      }
    });

    // Wait a bit for all keys to be collected
    setTimeout(() => {
      // Sort by timestamp (oldest first)
      keys.sort((a, b) => a.timestamp - b.timestamp);

      // If we have more than maxKeys, remove the oldest ones
      if (keys.length > maxKeys) {
        const keysToRemove = keys.slice(0, keys.length - maxKeys);

        keysToRemove.forEach(key => {
          userKeys.get(key.keyId).put(null); // Remove from GunDB
          console.log(`Removed old key ${key.keyId} for user ${userId}`);
        });
      }

      resolve();
    }, 1000);
  });
}

/**
 * Sign data with a private key
 * @param {string} data - Data to sign
 * @param {string} privateKeyPem - Private key in PEM format
 * @returns {string} Base64 encoded signature
 */
function signData(data, privateKeyPem) {
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const md = forge.md.sha256.create();
  md.update(data, 'utf8');

  const signature = privateKey.sign(md);
  return forge.util.encode64(signature);
}

/**
 * Verify a signature
 * @param {string} data - Original data
 * @param {string} signatureBase64 - Base64 encoded signature
 * @param {string} publicKeyPem - Public key in PEM format
 * @returns {boolean} True if signature is valid
 */
function verifySignature(data, signatureBase64, publicKeyPem) {
  try {
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const signature = forge.util.decode64(signatureBase64);
    const md = forge.md.sha256.create();
    md.update(data, 'utf8');

    return publicKey.verify(md.digest().bytes(), signature);
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Generate a random session identifier
 * @returns {string} Random hex string
 */
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  generateKeyPair,
  enforceKeyLimit,
  signData,
  verifySignature,
  generateSessionId
};
