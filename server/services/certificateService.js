const forge = require('node-forge');

// Server's master key pair for signing certificates
let serverKeyPair = null;

/**
 * Initialize or retrieve the server's master key pair
 */
function getServerKeyPair() {
  if (!serverKeyPair) {
    // In production, this should be loaded from secure storage
    // For now, we generate it on startup (will be regenerated on restart)
    console.log('Generating server master key pair...');
    serverKeyPair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
    console.log('Server master key pair generated');
  }
  return serverKeyPair;
}

/**
 * Create a certificate linking a Google account to a public key
 * @param {string} userId - User's email/ID from Google
 * @param {string} userName - User's display name
 * @param {string} publicKeyPem - User's public key in PEM format
 * @returns {string} JSON string containing the certificate
 */
async function createCertificate(userId, userName, publicKeyPem) {
  const keyPair = getServerKeyPair();
  const timestamp = Date.now();

  // Create certificate data
  const certificateData = {
    userId: userId,
    userName: userName,
    publicKey: publicKeyPem,
    issuedAt: timestamp,
    issuedBy: 'RallyRound-Server',
    version: '1.0'
  };

  // Sign the certificate data
  const dataToSign = JSON.stringify(certificateData);
  const md = forge.md.sha256.create();
  md.update(dataToSign, 'utf8');

  const signature = keyPair.privateKey.sign(md);
  const signatureBase64 = forge.util.encode64(signature);

  // Create the complete certificate
  const certificate = {
    ...certificateData,
    signature: signatureBase64,
    serverPublicKey: forge.pki.publicKeyToPem(keyPair.publicKey)
  };

  return JSON.stringify(certificate);
}

/**
 * Verify a certificate's authenticity
 * @param {string} certificateJson - JSON string containing the certificate
 * @returns {boolean} True if certificate is valid
 */
function verifyCertificate(certificateJson) {
  try {
    const certificate = JSON.parse(certificateJson);

    // Extract signature and recreate the original data
    const { signature, serverPublicKey, ...certificateData } = certificate;
    const dataToVerify = JSON.stringify(certificateData);

    // Verify the signature
    const publicKey = forge.pki.publicKeyFromPem(serverPublicKey);
    const signatureBytes = forge.util.decode64(signature);
    const md = forge.md.sha256.create();
    md.update(dataToVerify, 'utf8');

    const isValid = publicKey.verify(md.digest().bytes(), signatureBytes);

    // Additional checks
    const isNotExpired = true; // Could add expiration logic here
    const hasRequiredFields = certificate.userId && certificate.publicKey && certificate.issuedAt;

    return isValid && isNotExpired && hasRequiredFields;
  } catch (error) {
    console.error('Certificate verification failed:', error);
    return false;
  }
}

/**
 * Get the server's public key for distribution
 * @returns {string} Server public key in PEM format
 */
function getServerPublicKey() {
  const keyPair = getServerKeyPair();
  return forge.pki.publicKeyToPem(keyPair.publicKey);
}

module.exports = {
  createCertificate,
  verifyCertificate,
  getServerPublicKey
};
