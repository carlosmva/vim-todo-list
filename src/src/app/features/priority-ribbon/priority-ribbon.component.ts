import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { formatDueDate, formatPriorityLabel } from '../../core/models/note.model';
import { PriorityRibbonService } from '../../core/services/priority-ribbon.service';

@Component({
  selector: 'app-priority-ribbon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './priority-ribbon.component.html',
  styleUrl: './priority-ribbon.component.scss',
})
export class PriorityRibbonComponent {
  private readonly ribbon = inject(PriorityRibbonService);

  readonly items = this.ribbon.items;
  formatDue = formatDueDate;
  formatPriority = formatPriorityLabel;

  previewText(text: string): string {
    const line = String(text || '')
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find(Boolean);
    return line || '(empty)';
  }
}
