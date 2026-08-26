import type { StorageEnvelope } from '../models/envelope.model';
import {
  DEFAULT_PRIORITY_RIBBON_LIMIT,
  parsePriorityRibbonLimit,
  PriorityRibbonLimit,
} from '../models/priority-ribbon.model';

export const AI_PRIORITY_RIBBON_ENABLED_KEY = 'ai.priorityRibbonEnabled';
export const AI_PRIORITY_RIBBON_LIMIT_KEY = 'ai.priorityRibbonLimit';

export const AI_RIBBON_SETTING_KEYS = [
  AI_PRIORITY_RIBBON_ENABLED_KEY,
  AI_PRIORITY_RIBBON_LIMIT_KEY,
] as const;

export interface PriorityRibbonSettings {
  enabled: boolean;
  limit: PriorityRibbonLimit;
}

/** Read ribbon settings: DB wins when keys exist; envelope is fallback; legacy defaults to off / top 5. */
export function readPriorityRibbonSettings(
  getSetting: (key: string) => string | null,
  envelopeAi?: StorageEnvelope['ai']
): PriorityRibbonSettings {
  const enabledRaw = getSetting(AI_PRIORITY_RIBBON_ENABLED_KEY);
  const limitRaw = getSetting(AI_PRIORITY_RIBBON_LIMIT_KEY);

  const enabled =
    enabledRaw != null ? enabledRaw === '1' : envelopeAi?.pr === true;
  const limit =
    limitRaw != null
      ? parsePriorityRibbonLimit(limitRaw)
      : envelopeAi?.prl != null
        ? parsePriorityRibbonLimit(envelopeAi.prl)
        : DEFAULT_PRIORITY_RIBBON_LIMIT;

  return { enabled, limit };
}

/** Merge ribbon fields into envelope ai only for keys present in imported DB (legacy-safe). */
export function mergePriorityRibbonEnvelopeFromDb(
  getSetting: (key: string) => string | null,
  currentAi?: StorageEnvelope['ai']
): StorageEnvelope['ai'] | undefined {
  const enabledRaw = getSetting(AI_PRIORITY_RIBBON_ENABLED_KEY);
  const limitRaw = getSetting(AI_PRIORITY_RIBBON_LIMIT_KEY);
  if (enabledRaw == null && limitRaw == null) {
    if (!currentAi?.pr && currentAi?.prl == null) return undefined;
    const ai = { ...currentAi };
    delete ai.pr;
    delete ai.prl;
    return ai;
  }

  const ai = { ...currentAi };
  if (enabledRaw != null) {
    ai.pr = enabledRaw === '1';
  } else {
    delete ai.pr;
  }
  if (limitRaw != null) {
    ai.prl = parsePriorityRibbonLimit(limitRaw);
  } else {
    delete ai.prl;
  }
  return ai;
}
