import { describe, expect, it } from 'vitest';
import {
  mergePriorityRibbonEnvelopeFromDb,
  readPriorityRibbonSettings,
  AI_PRIORITY_RIBBON_ENABLED_KEY,
  AI_PRIORITY_RIBBON_LIMIT_KEY,
} from './ai-settings.util';

describe('ai-settings.util', () => {
  it('readPriorityRibbonSettings uses DB values when present', () => {
    const settings = readPriorityRibbonSettings(
      (key) =>
        ({
          [AI_PRIORITY_RIBBON_ENABLED_KEY]: '1',
          [AI_PRIORITY_RIBBON_LIMIT_KEY]: '10',
        })[key] ?? null,
      { pr: false, prl: 3 }
    );
    expect(settings).toEqual({ enabled: true, limit: 10 });
  });

  it('readPriorityRibbonSettings falls back to envelope when DB keys are missing', () => {
    const settings = readPriorityRibbonSettings(() => null, { pr: true, prl: 3 });
    expect(settings).toEqual({ enabled: true, limit: 3 });
  });

  it('readPriorityRibbonSettings defaults legacy imports to disabled and top 5', () => {
    const settings = readPriorityRibbonSettings(() => null, undefined);
    expect(settings).toEqual({ enabled: false, limit: 5 });
  });

  it('mergePriorityRibbonEnvelopeFromDb removes ribbon fields when legacy DB lacks keys', () => {
    const ai = mergePriorityRibbonEnvelopeFromDb(() => null, { u: 'x', pr: true, prl: 10 });
    expect(ai).toEqual({ u: 'x' });
  });

  it('mergePriorityRibbonEnvelopeFromDb copies ribbon fields from DB on import', () => {
    const ai = mergePriorityRibbonEnvelopeFromDb(
      (key) =>
        ({
          [AI_PRIORITY_RIBBON_ENABLED_KEY]: '1',
          [AI_PRIORITY_RIBBON_LIMIT_KEY]: '3',
        })[key] ?? null,
      { u: 'x', pr: false, prl: 10 }
    );
    expect(ai).toEqual({ u: 'x', pr: true, prl: 3 });
  });
});
