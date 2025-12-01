/**
 * Tests for CacheDigest (Cuckoo filter implementation)
 *
 * These tests use cross-language test vectors to ensure compatibility
 * with the PHP, Python, and Ruby implementations.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CacheDigest,
  fnv1a,
  fingerprint,
  computeAlternateBucket,
  FINGERPRINT_BITS,
  BUCKET_SIZE
} from '../src/cache-digest.js'

// This digest was created by the JavaScript implementation with these assets:
// - src/css/critical.css:B20ictSB
// - src/css/main.css:DfFbFQk_
// - src/js/app.js:DW873Fox
// - skybolt-launcher:ptJmv_9y
const VALID_DIGEST = 'AQAEAAQAAAAAAAAAAAXNB-UAAAAACT4NhgAAAAAAAAAAAAAAAA'

describe('fnv1a', () => {
  it('matches cross-language test vectors', () => {
    // Test vectors verified against PHP, Python, and Ruby implementations
    const testCases = [
      ['src/css/critical.css:abc123', 821208812],
      ['src/css/main.css:def456', 26790494],
      ['skybolt-launcher:xyz789', 452074441],
      ['123', 1916298011],
      ['', 2166136261], // Empty string returns offset basis
      ['a', 3826002220],
      ['test', 2949673445]
    ]

    for (const [input, expected] of testCases) {
      assert.equal(fnv1a(input), expected, `FNV-1a hash mismatch for '${input}'`)
    }
  })
})

describe('fingerprint', () => {
  it('returns values in valid range [1, 4095]', () => {
    const testCases = [
      'src/css/critical.css:abc123',
      'src/css/main.css:def456',
      'skybolt-launcher:xyz789'
    ]

    for (const input of testCases) {
      const fp = fingerprint(input)
      assert.ok(fp >= 1, `Fingerprint should be >= 1 for '${input}'`)
      assert.ok(fp <= 4095, `Fingerprint should be <= 4095 for '${input}'`)
    }
  })

  it('never returns 0', () => {
    for (let i = 0; i < 1000; i++) {
      const fp = fingerprint(`test-${i}`)
      assert.notEqual(fp, 0, 'Fingerprint should never be 0')
    }
  })
})

describe('computeAlternateBucket', () => {
  it('is reversible', () => {
    const numBuckets = 16 // Power of 2

    for (let bucket = 0; bucket < numBuckets; bucket++) {
      for (let fp = 1; fp <= 100; fp++) {
        const alt = computeAlternateBucket(bucket, fp, numBuckets)
        const original = computeAlternateBucket(alt, fp, numBuckets)

        assert.equal(
          bucket,
          original,
          `Alternate bucket should be reversible: bucket=${bucket}, fp=${fp}`
        )
      }
    }
  })
})

describe('CacheDigest', () => {
  it('parses valid digest from JavaScript client', () => {
    const cd = CacheDigest.fromBase64(VALID_DIGEST)

    assert.ok(cd.isValid())

    // These should be found
    assert.ok(cd.lookup('src/css/critical.css:B20ictSB'))
    assert.ok(cd.lookup('src/css/main.css:DfFbFQk_'))
    assert.ok(cd.lookup('src/js/app.js:DW873Fox'))
    assert.ok(cd.lookup('skybolt-launcher:ptJmv_9y'))

    // These should NOT be found (different hashes)
    assert.ok(!cd.lookup('src/css/critical.css:DIFFERENT'))
    assert.ok(!cd.lookup('src/css/main.css:DIFFERENT'))
    assert.ok(!cd.lookup('nonexistent:asset'))
  })

  it('handles empty digest', () => {
    const cd = CacheDigest.fromBase64('')
    assert.ok(!cd.isValid())
    assert.ok(!cd.lookup('anything'))
  })

  it('handles invalid base64', () => {
    const cd = CacheDigest.fromBase64('not-valid-base64!!!')
    assert.ok(!cd.isValid())
  })

  it('rejects wrong version', () => {
    // Version 2 header (invalid)
    const cd = CacheDigest.fromBase64(Buffer.from('\x02\x00\x04\x00\x00').toString('base64'))
    assert.ok(!cd.isValid())
  })

  it('handles truncated digest', () => {
    // Too short
    const cd = CacheDigest.fromBase64(Buffer.from('\x01\x00').toString('base64'))
    assert.ok(!cd.isValid())
  })

  it('handles URL-safe base64', () => {
    // Same digest with URL-safe characters (- instead of +, _ instead of /)
    const cd = CacheDigest.fromBase64(VALID_DIGEST)

    assert.ok(cd.isValid())
    assert.ok(cd.lookup('src/css/critical.css:B20ictSB'))
  })
})

describe('constants', () => {
  it('has correct fingerprint bits', () => {
    assert.equal(FINGERPRINT_BITS, 12)
  })

  it('has correct bucket size', () => {
    assert.equal(BUCKET_SIZE, 4)
  })
})
