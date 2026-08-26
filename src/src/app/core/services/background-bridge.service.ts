import { Injectable } from '@angular/core';

export interface OllamaFetchResult {
  ok: boolean;
  status?: number;
  data?: unknown;
  text?: string;
  error?: string;
}

export interface OllamaProbeResult {
  ok: boolean;
  model?: string;
  models?: string[];
  error?: string;
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class BackgroundBridgeService {
  ollamaFetch(
    url: string,
    method = 'GET',
    body?: unknown,
    timeoutMs = 60000
  ): Promise<OllamaFetchResult> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'ollamaFetch', url, method, body, timeoutMs },
        (response) => resolve(response ?? { ok: false, error: 'no response' })
      );
    });
  }

  probeOllama(
    baseUrl: string,
    modelOverride = '',
    timeoutMs = 30000
  ): Promise<OllamaProbeResult> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'probeOllama', baseUrl, modelOverride, timeoutMs },
        (response) => resolve(response ?? { ok: false, error: 'no response' })
      );
    });
  }
}
