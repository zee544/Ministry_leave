/**
 * Hashes a password using SHA-256 via the Web Crypto API.
 * SHA-256 is deterministic — same input always produces the same output.
 * This ensures consistency between registration and login.
 *
 * IMPORTANT (for when a backend is added):
 * - Client-side SHA-256 is a first-pass obfuscation layer only.
 * - The server MUST still apply bcrypt (or Argon2) on the received hash
 *   before storing it in the database.
 * - During login: client sends SHA-256 hash → server compares against
 *   stored bcrypt hash of the original SHA-256 hash.
 *
 * @param {string} password - The plaintext password to hash
 * @returns {Promise<string>} The hex-encoded SHA-256 hash
 */
export async function hashPassword(password) {
  // Encode the password as a Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(password);

  // Compute SHA-256 hash using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert the hash buffer to a hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

