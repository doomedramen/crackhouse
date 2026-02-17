import { describe, it, expect, vi } from 'vitest'
import { VirusScanner } from '../../src/lib/virus-scanner'

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}))

// Mock fs operations
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}))

// Mock logger
vi.mock('../../src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
  },
}))

// Mock monitoring
vi.mock('../../src/lib/monitoring', () => ({
  logSecurityEvent: vi.fn(),
  SecurityEventType: {
    MALICIOUS_FILE_DETECTED: 'MALICIOUS_FILE_DETECTED',
  },
}))

describe('VirusScanner', () => {
  it('should create ClamAV scanner', () => {
    const scanner = new VirusScanner({ engine: 'clamav' })
    expect(scanner).toBeInstanceOf(VirusScanner)
  })

  it('should create YARA scanner', () => {
    const scanner = new VirusScanner({ engine: 'yara' })
    expect(scanner).toBeInstanceOf(VirusScanner)
  })

  it('should throw for unsupported engine', () => {
    expect(() => {
      new VirusScanner({ engine: 'custom' as any })
    }).toThrow('Unsupported virus scanner engine: custom')
  })
})
