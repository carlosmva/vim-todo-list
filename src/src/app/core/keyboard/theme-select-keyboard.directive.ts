import {
  Directive,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  OnInit,
  output,
} from '@angular/core';
import { THEME_LABELS, THEME_ORDER, ThemeId } from '../models/envelope.model';
import { ThemeSelectKeyboardService } from './theme-select-keyboard.service';

@Directive({
  selector: 'select[appThemeSelectKeyboard]',
  standalone: true,
})
export class ThemeSelectKeyboardDirective implements OnInit {
  private readonly el = inject(ElementRef<HTMLSelectElement>);
  private readonly armedSelect = inject(ThemeSelectKeyboardService);
  private readonly destroyRef = inject(DestroyRef);

  readonly themeSelectValue = input.required<ThemeId>();
  readonly themeSelectChange = output<ThemeId>();

  ngOnInit(): void {
    const select = this.el.nativeElement;
    this.armedSelect.register(select, {
      order: THEME_ORDER,
      getValue: () => this.themeSelectValue(),
      onCommit: (theme) => this.themeSelectChange.emit(theme as ThemeId),
      labelFor: (theme) => THEME_LABELS[theme as ThemeId] || theme,
      subject: 'Theme',
    });

    effect(() => {
      this.themeSelectValue();
      this.armedSelect.refreshSelect(select);
    });

    this.destroyRef.onDestroy(() => {
      this.armedSelect.unregister(select);
    });
  }
}
