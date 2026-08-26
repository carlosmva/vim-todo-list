import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppStateService } from '../../core/services/app-state.service';
import {
  getFocusNewNoteKey,
  getNavKeys,
  getNotesCheckboxKey,
  modKeyLabel,
  useNavMacModifier,
} from '../../core/keyboard/keyboard.model';

@Component({
  selector: 'app-instructions',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="view" id="instructionsView" aria-label="Instructions">
      <div class="instructionsHeader">
        <h2 class="instructionsTitle">Instructions</h2>
        <a routerLink="/" class="monoLinkButton">Close</a>
      </div>
      <div class="instructionsContent">
        <div class="instructionsLead" tabindex="0" aria-label="Keyboard-first workflow">
          <h3 class="instructionsLead__title">Keyboard-first workflow</h3>
          <p class="instructionsLead__body">
            Current layout: <b>{{ layoutLabel() }}</b>.
            @if (isMacNav()) {
              On the <b>Mac</b> profile, use <b>Control (⌃)</b> with the keys below — not Command (⌘).
            } @else {
              On the <b>Windows / Linux</b> profile, use <b>Alt</b> with the keys below.
            }
            Change layout and modifier in <b>Settings &gt; Keyboard</b>.
          </p>
        </div>

        <div class="instructionsGrid">
          <section class="instructionsSection" tabindex="0" aria-label="Core Navigation">
            <h3>Core Navigation</h3>
            <div class="instructionsKeyList">
              @for (row of navRows(); track row.keys) {
                <div class="instructionsKeyRow">
                  <div class="instructionsKeyRow__keys" [innerHTML]="row.keys"></div>
                  <div class="instructionsKeyRow__desc">{{ row.desc }}</div>
                </div>
              }
            </div>
          </section>

          <section class="instructionsSection" tabindex="0" aria-label="Notes Editor">
            <h3>Notes Editor</h3>
            <div class="instructionsKeyList">
              <div class="instructionsKeyRow">
                <div class="instructionsKeyRow__keys"><kbd>Esc</kbd></div>
                <div class="instructionsKeyRow__desc">Insert → normal, visual → normal, normal → close notes.</div>
              </div>
              <div class="instructionsKeyRow">
                <div class="instructionsKeyRow__keys"><kbd>{{ mod() }}</kbd><span class="keycapSep">+</span><kbd>{{ checkboxKey() }}</kbd></div>
                <div class="instructionsKeyRow__desc">Toggle strikethrough for the current line.</div>
              </div>
              <div class="instructionsKeyRow">
                <div class="instructionsKeyRow__keys"><kbd>u</kbd></div>
                <div class="instructionsKeyRow__desc">Undo last change in normal mode.</div>
              </div>
              <div class="instructionsKeyRow">
                <div class="instructionsKeyRow__keys"><kbd>v</kbd></div>
                <div class="instructionsKeyRow__desc">Enter visual selection mode.</div>
              </div>
              <div class="instructionsKeyRow">
                <div class="instructionsKeyRow__keys"><kbd>:x</kbd></div>
                <div class="instructionsKeyRow__desc">Close notes editor or flipped links panel.</div>
              </div>
            </div>
          </section>
        </div>

        <ul>
          <li>Type a note and click + (or {{ mod() }}+{{ addKey() }}) to create a task.</li>
          <li>Use Priority, Links, Notes, Complete, and Delete on each card.</li>
          <li>Reorder pending cards with ↑ / ↓.</li>
          <li>Open Calendar from the view bar to see due dates.</li>
        </ul>
        <p><a routerLink="/" class="monoLinkButton">Back to notes</a></p>
      </div>
    </div>
  `,
})
export class InstructionsComponent {
  readonly state = inject(AppStateService);

  readonly layoutLabel = computed(() =>
    this.state.keyLayout() === 'dvorak' ? 'DVORAK' : 'QWERTY'
  );

  readonly mod = computed(() => modKeyLabel(this.state.keyboardNavPlatform()));
  readonly isMacNav = computed(() => useNavMacModifier(this.state.keyboardNavPlatform()));

  readonly addKey = computed(() =>
    getFocusNewNoteKey(this.state.keyLayout()).toUpperCase()
  );

  readonly checkboxKey = computed(() =>
    getNotesCheckboxKey(this.state.keyLayout()).toUpperCase()
  );

  readonly navRows = computed(() => {
    const nav = getNavKeys(this.state.keyLayout());
    const mod = this.mod();
    const fmt = (k: string) => k.toUpperCase();
    const combo = (...keys: string[]) => keys.map((k) => `<kbd>${k}</kbd>`).join('<span class="keycapSep">+</span>');
    return [
      { keys: combo(mod, fmt(nav.down)), desc: 'Move down through the current area.' },
      { keys: combo(mod, fmt(nav.up)), desc: 'Move up through the current area.' },
      { keys: combo(mod, fmt(nav.left)), desc: 'Move left or to the previous control.' },
      { keys: combo(mod, fmt(nav.right)), desc: 'Move right or to the next control.' },
      { keys: combo(mod, fmt(getFocusNewNoteKey(this.state.keyLayout()))), desc: 'Open the new note form.' },
      { keys: '<kbd>/</kbd>', desc: 'Focus the card filter.' },
      { keys: '<kbd>F2</kbd>', desc: 'Rename the focused card.' },
      { keys: combo(mod, '1') + ' … ' + combo(mod, '9'), desc: 'Switch boards (1–9 without modifier when not typing).' },
    ];
  });
}
