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
import { ThemeSelectKeyboardService, type ArmedSelectHandlers } from './theme-select-keyboard.service';

@Directive({
  selector: 'select[appArmedSelectKeyboard]',
  standalone: true,
})
export class ArmedSelectKeyboardDirective implements OnInit {
  private readonly el = inject(ElementRef<HTMLSelectElement>);
  private readonly armedSelect = inject(ThemeSelectKeyboardService);
  private readonly destroyRef = inject(DestroyRef);

  readonly armedSelectOrder = input.required<readonly string[]>();
  readonly armedSelectValue = input.required<string>();
  readonly armedSelectChange = output<string>();
  readonly armedSelectSubject = input('Option');
  readonly armedSelectLabel = input<(value: string) => string>((value) => value || 'Option');

  ngOnInit(): void {
    const select = this.el.nativeElement;
    const handlers: ArmedSelectHandlers = {
      order: this.armedSelectOrder(),
      getValue: () => this.armedSelectValue(),
      onCommit: (value) => this.armedSelectChange.emit(value),
      labelFor: (value) => this.armedSelectLabel()(value),
      subject: this.armedSelectSubject(),
    };

    this.armedSelect.register(select, handlers);

    effect(() => {
      this.armedSelectValue();
      this.armedSelectOrder();
      this.armedSelect.refreshSelect(select);
    });

    this.destroyRef.onDestroy(() => {
      this.armedSelect.unregister(select);
    });
  }
}
