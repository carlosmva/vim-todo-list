import { describe, expect, it } from 'vitest';
import {
  buildEnvelopeFromLegacy,
  deserializeEnvelope,
  serializeEnvelope,
} from './chrome-storage.service';
import { LEGACY_KEYS } from '../models/envelope.model';

describe('compact JSON envelope', () => {
  it('serializes without whitespace', () => {
    const raw = serializeEnvelope({ v: 2, t: 'dark', b: 'To Do', db: 'abc123' });
    expect(raw).toBe('{"v":2,"t":"dark","b":"To Do","db":"abc123"}');
    expect(raw).not.toContain('\n');
  });

  it('round-trips deserialize', () => {
    const env = { v: 2 as const, t: 'light', kl: 'qwerty' as const };
    const parsed = deserializeEnvelope(serializeEnvelope(env));
    expect(parsed).toEqual(env);
  });

  it('migrates legacy keys into envelope', () => {
    const env = buildEnvelopeFromLegacy({
      [LEGACY_KEYS.db]: 'YmFzZTY0',
      [LEGACY_KEYS.theme]: 'emacs',
      [LEGACY_KEYS.board]: 'Work',
      [LEGACY_KEYS.keyLayout]: 'dvorak',
    });
    expect(env.db).toBe('YmFzZTY0');
    expect(env.t).toBe('emacs');
    expect(env.b).toBe('Work');
    expect(env.kl).toBe('dvorak');
  });

  it('migration is idempotent when no legacy keys', () => {
    const first = buildEnvelopeFromLegacy({});
    const second = buildEnvelopeFromLegacy({});
    expect(first).toEqual(second);
  });
});
