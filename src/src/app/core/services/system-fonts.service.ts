import { Injectable } from '@angular/core';
import {
  INTERFACE_FONT_ORDER,
  sanitizeFontFamilyName,
} from '../models/appearance-font.model';

interface LocalFontData {
  family: string;
}

@Injectable({ providedIn: 'root' })
export class SystemFontsService {
  private installed: string[] | null = null;

  async list(extra: readonly string[] = []): Promise<string[]> {
    const names = new Set<string>(INTERFACE_FONT_ORDER);
    for (const name of extra) {
      const clean = sanitizeFontFamilyName(name);
      if (clean) names.add(clean);
    }
    for (const name of await this.queryInstalled()) {
      names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  private async queryInstalled(): Promise<string[]> {
    if (this.installed) return this.installed;
    const found = await this.readLocalFonts();
    if (found.length) this.installed = found;
    return found;
  }

  private async readLocalFonts(): Promise<string[]> {
    const query = (window as Window & { queryLocalFonts?: () => Promise<LocalFontData[]> }).queryLocalFonts;
    if (typeof query !== 'function') return [];
    try {
      const fonts = await query.call(window);
      const families = new Set<string>();
      for (const font of fonts) {
        const name = sanitizeFontFamilyName(font.family);
        if (name) families.add(name);
      }
      return [...families];
    } catch {
      return [];
    }
  }
}
