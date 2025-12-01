/**
 * Cache Digest - Cuckoo Filter implementation for Skybolt
 *
 * This is a read-only parser for digests created by the JavaScript client.
 * It's used to determine which assets the client already has cached.
 *
 * @module cache-digest
 */

export const FINGERPRINT_BITS = 12
export const BUCKET_SIZE = 4

/**
 * Compute FNV-1a hash of a string (32-bit).
 *
 * Uses BigInt for precise integer arithmetic to ensure cross-language
 * compatibility with PHP, Python, and Ruby implementations.
 *
 * @param {string} str - Input string
 * @returns {number} 32-bit hash value
 */
export function fnv1a(str) {
  let hash = 2166136261n
  const prime = 16777619n
  const mask = 0xFFFFFFFFn

  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i))
    hash = (hash * prime) & mask
  }

  return Number(hash)
}

/**
 * Compute fingerprint for Cuckoo filter.
 *
 * @param {string} str - Input string
 * @returns {number} Fingerprint in range [1, 4095]
 */
export function fingerprint(str) {
  const hash = fnv1a(str)
  return (hash & ((1 << FINGERPRINT_BITS) - 1)) || 1
}

/**
 * Compute primary bucket index for Cuckoo filter.
 *
 * @param {string} str - Input string
 * @param {number} numBuckets - Total number of buckets
 * @returns {number} Bucket index
 */
export function primaryBucket(str, numBuckets) {
  return fnv1a(str) % numBuckets
}

/**
 * Compute alternate bucket index for Cuckoo filter.
 *
 * @param {number} bucket - Current bucket index
 * @param {number} fp - Fingerprint value
 * @param {number} numBuckets - Total number of buckets
 * @returns {number} Alternate bucket index
 */
export function computeAlternateBucket(bucket, fp, numBuckets) {
  const fpHash = fnv1a(String(fp))
  const bucketMask = numBuckets - 1
  const offset = (fpHash | 1) & bucketMask
  return (bucket ^ offset) & bucketMask
}

/**
 * Cache Digest class for server-side lookup.
 *
 * Parses a base64-encoded Cuckoo filter digest from the sb_digest cookie
 * and provides lookup functionality.
 */
export class CacheDigest {
  #numBuckets = 0
  #buckets = null
  #valid = false

  /**
   * Create a CacheDigest from a base64-encoded string.
   *
   * @param {string} digest - URL-safe base64-encoded digest
   * @returns {CacheDigest} A CacheDigest instance
   */
  static fromBase64(digest) {
    return new CacheDigest(digest)
  }

  /**
   * @param {string} digest - Base64-encoded digest string
   */
  constructor(digest) {
    this.#parseDigest(digest)
  }

  /**
   * Check if this is a valid digest.
   *
   * @returns {boolean} True if the digest was parsed successfully
   */
  isValid() {
    return this.#valid
  }

  /**
   * Check if an item exists in the digest.
   *
   * @param {string} item - Item to look up (e.g., "src/css/main.css:hash123")
   * @returns {boolean} True if item might be in the filter (may have false positives)
   */
  lookup(item) {
    if (!this.#valid) return false

    const fp = fingerprint(item)
    const i1 = primaryBucket(item, this.#numBuckets)
    const i2 = computeAlternateBucket(i1, fp, this.#numBuckets)
    return this.#bucketContains(i1, fp) || this.#bucketContains(i2, fp)
  }

  /**
   * Parse a base64-encoded digest.
   *
   * @param {string} digest - Base64-encoded digest
   */
  #parseDigest(digest) {
    if (!digest) return

    try {
      // Handle URL-safe base64
      let normalized = digest.replace(/-/g, '+').replace(/_/g, '/')
      while (normalized.length % 4) normalized += '='

      const bytes = Buffer.from(normalized, 'base64')
      if (bytes.length < 5) return

      // Check version (must be 1)
      if (bytes[0] !== 1) return

      this.#numBuckets = (bytes[1] << 8) | bytes[2]
      const numFingerprints = this.#numBuckets * BUCKET_SIZE
      this.#buckets = new Uint16Array(numFingerprints)

      for (let i = 0; i < numFingerprints; i++) {
        const offset = 5 + i * 2
        if (offset + 1 < bytes.length) {
          this.#buckets[i] = (bytes[offset] << 8) | bytes[offset + 1]
        }
      }

      this.#valid = true
    } catch {
      // Invalid digest, leave as invalid
    }
  }

  /**
   * Check if a bucket contains a fingerprint.
   *
   * @param {number} bucketIndex - Bucket index
   * @param {number} fp - Fingerprint to search for
   * @returns {boolean} True if found
   */
  #bucketContains(bucketIndex, fp) {
    const offset = bucketIndex * BUCKET_SIZE
    for (let i = 0; i < BUCKET_SIZE; i++) {
      if (this.#buckets[offset + i] === fp) return true
    }
    return false
  }
}

export default CacheDigest
