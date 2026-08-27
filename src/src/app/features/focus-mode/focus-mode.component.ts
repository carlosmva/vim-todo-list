import { Component, inject } from '@angular/core';
import { FocusModeService } from '../../core/services/focus-mode.service';
import { formatFocusDue } from '../../core/utils/focus-mode.util';

@Component({
  selector: 'app-focus-mode',
  standalone: true,
  templateUrl: './focus-mode.component.html',
  styleUrl: './focus-mode.component.scss',
})
export class FocusModeComponent {
  readonly focus = inject(FocusModeService);
  readonly formatDue = formatFocusDue;

  complete(): void {
    this.focus.completeCurrent();
  }

  openNotes(): void {
    this.focus.openNotesCurrent();
  }

  dismiss(): void {
    this.focus.close({ restoreFocus: true });
  }
}
