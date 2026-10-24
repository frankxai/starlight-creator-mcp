import { describe, it, expect } from 'vitest'
import { canonicalize, sha256Hex, sha256CanonicalJson } from './hash.js'

describe('hash', () => {
  describe('canonicalize', () => {
    it('sorts object keys alphabetically', () => {
      const input = { b: 2, c: 3, a: 1 }
      const expected = JSON.stringify({ a: 1, b: 2, c: 3 })
      expect(canonicalize(input)).toBe(expected)
    })

    it('handles nested objects recursively', () => {
      const input = { foo: { z: 3, a: 1 }, bar: 2 }
      const expected = JSON.stringify({ bar: 2, foo: { a: 1, z: 3 } })
      expect(canonicalize(input)).toBe(expected)
    })

    it('leaves arrays in original order, but sorts objects inside them', () => {
      const input = [3, 1, { c: 3, a: 1 }, 2]
      const expected = JSON.stringify([3, 1, { a: 1, c: 3 }, 2])
      expect(canonicalize(input)).toBe(expected)
    })

    it('handles primitives correctly', () => {
      expect(canonicalize(null)).toBe('null')
      expect(canonicalize(123)).toBe('123')
      expect(canonicalize('hello')).toBe('"hello"')
      expect(canonicalize(true)).toBe('true')
    })

    it('omits undefined properties as JSON.stringify does, without errors', () => {
      const input = { a: 1, b: undefined, c: 3 }
      const expected = JSON.stringify({ a: 1, c: 3 })
      expect(canonicalize(input)).toBe(expected)
    })
  })

  describe('sha256Hex', () => {
    it('produces correct hex digest for a known string', () => {
      // echo -n "hello" | shasum -a 256
      const input = 'hello'
      const expected = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      expect(sha256Hex(input)).toBe(expected)
    })

    it('produces correct hex digest for a known Uint8Array', () => {
      const input = new Uint8Array([104, 101, 108, 108, 111]) // 'hello' in bytes
      const expected = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      expect(sha256Hex(input)).toBe(expected)
    })
  })

  describe('sha256CanonicalJson', () => {
    it('produces same hash for same content regardless of key order', () => {
      const input1 = { b: 2, c: 3, a: 1 }
      const input2 = { a: 1, c: 3, b: 2 }

      const expectedString = JSON.stringify({ a: 1, b: 2, c: 3 })
      const expectedHash = sha256Hex(expectedString)

      expect(sha256CanonicalJson(input1)).toBe(expectedHash)
      expect(sha256CanonicalJson(input2)).toBe(expectedHash)
      expect(sha256CanonicalJson(input1)).toBe(sha256CanonicalJson(input2))
    })
  })
})
