import { Component, ElementRef, NgZone, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { formatDueDate, formatPriorityLabel } from '../../core/models/note.model';
import { PriorityRibbonService } from '../../core/services/priority-ribbon.service';

const RIBBON_STEP_MS = 32;
const RIBBON_PX_PER_SEC = 64;
const LENS_BASE_PX = 13;
const LENS_CENTER_SCALE = 1.72;
const LENS_TAIL_SCALE = 0.58;
const LENS_TAIL_OPACITY = 0.34;

interface RibbonChar {
  node: HTMLElement;
  x: number;
  w: number;
}

@Component({
  selector: 'app-priority-ribbon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './priority-ribbon.component.html',
  styleUrl: './priority-ribbon.component.scss',
})
export class PriorityRibbonComponent implements OnDestroy {
  private readonly ribbon = inject(PriorityRibbonService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);

  readonly items = this.ribbon.items;
  formatDue = formatDueDate;
  formatPriority = formatPriorityLabel;

  private timer: ReturnType<typeof setInterval> | null = null;
  private offset = 0;
  private naturalHalf = 0;
  private chars: RibbonChar[] = [];

  constructor() {
    effect((onCleanup) => {
      if (!this.items().length) return;
      this.zone.runOutsideAngular(() => this.start());
      onCleanup(() => this.stop());
    });
  }

  ngOnDestroy(): void {
    this.stop();
  }

  previewText(text: string): string {
    const line = String(text || '')
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find(Boolean);
    return line || '(empty)';
  }

  private start(): void {
    this.stop();
    this.offset = 0;
    this.timer = setInterval(() => this.advance(), RIBBON_STEP_MS);
    this.advance();
  }

  private stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.chars = [];
    this.naturalHalf = 0;
  }

  private advance(): void {
    const root = this.host.nativeElement;
    const track = root.querySelector('.priorityRibbon__track');
    const viewport = root.querySelector('.priorityRibbon__viewport');
    if (!(track instanceof HTMLElement) || !(viewport instanceof HTMLElement)) return;
    const chars = this.ensureChars(viewport, track);
    const half = this.naturalHalf;
    if (!chars.length || half <= 1) return;
    this.offset = (this.offset + (RIBBON_PX_PER_SEC * RIBBON_STEP_MS) / 1000) % half;
    track.style.transform = `translate3d(${-this.offset}px, 0, 0)`;
    this.applyLens(viewport, chars);
  }

  private applyLens(viewport: HTMLElement, chars: RibbonChar[]): void {
    const width = viewport.clientWidth;
    const mid = width / 2;
    const reach = Math.max(1, mid);
    const viewLeft = this.offset - 48;
    const viewRight = this.offset + width + 48;
    for (const { node, x, w } of chars) {
      if (x + w < viewLeft || x > viewRight) {
        if (node.dataset['tail'] === '1') continue;
        node.dataset['tail'] = '1';
        node.style.fontSize = `${(LENS_BASE_PX * LENS_TAIL_SCALE).toFixed(2)}px`;
        node.style.opacity = String(LENS_TAIL_OPACITY);
        continue;
      }
      node.dataset['tail'] = '';
      const t = Math.min(1, Math.abs(x + w / 2 - this.offset - mid) / reach);
      const scale = LENS_CENTER_SCALE - (LENS_CENTER_SCALE - LENS_TAIL_SCALE) * t;
      node.style.fontSize = `${(LENS_BASE_PX * scale).toFixed(2)}px`;
      node.style.opacity = String((1 - (1 - LENS_TAIL_OPACITY) * t).toFixed(3));
    }
  }

  private ensureChars(viewport: HTMLElement, track: HTMLElement): RibbonChar[] {
    if (this.chars.length && viewport.contains(this.chars[0].node)) return this.chars;
    const roots = viewport.querySelectorAll('.priorityRibbon__item, .priorityRibbon__taskSep');
    for (const root of roots) {
      if (!(root instanceof HTMLElement) || root.dataset['lensed'] === '1') continue;
      wrapTextNodes(root);
      root.dataset['lensed'] = '1';
    }
    const prev = track.style.transform;
    track.style.transform = 'none';
    const trackLeft = track.getBoundingClientRect().left;
    this.naturalHalf = track.scrollWidth / 2;
    this.chars = [...viewport.querySelectorAll<HTMLElement>('.priorityRibbon__char')].map((node) => {
      const box = node.getBoundingClientRect();
      return { node, x: box.left - trackLeft, w: box.width };
    });
    track.style.transform = prev;
    return this.chars;
  }
}

function wrapTextNodes(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const value = node.nodeValue ?? '';
    if (!value) continue;
    const frag = document.createDocumentFragment();
    for (const ch of value) {
      const span = document.createElement('span');
      span.className = 'priorityRibbon__char';
      span.textContent = ch === ' ' ? '\u00a0' : ch;
      frag.appendChild(span);
    }
    node.parentNode?.replaceChild(frag, node);
  }
}
