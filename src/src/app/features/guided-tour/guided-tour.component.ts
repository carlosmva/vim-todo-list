import { Component, inject } from '@angular/core';
import { GuidedTourService } from '../../core/services/guided-tour.service';

@Component({
  selector: 'app-guided-tour',
  standalone: true,
  templateUrl: './guided-tour.component.html',
})
export class GuidedTourComponent {
  readonly tour = inject(GuidedTourService);

  skip(): void {
    void this.tour.close({ restoreFocus: true });
  }

  back(): void {
    void this.tour.back();
  }

  next(): void {
    void this.tour.next();
  }
}
