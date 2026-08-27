import { inject, provideAppInitializer } from '@angular/core';
import { AppStateService } from '../services/app-state.service';
import { KeyboardNavigationService } from '../keyboard/keyboard-navigation.service';
import { NotesVimEditorService } from '../keyboard/notes-vim-editor.service';
import { GuidedTourService } from '../services/guided-tour.service';
import { FocusModeService } from '../services/focus-mode.service';
import { ObsidianConflictService } from '../services/obsidian-conflict.service';

export function provideAppBootstrap() {
  return provideAppInitializer(async () => {
    const state = inject(AppStateService);
    const keyboard = inject(KeyboardNavigationService);
    const vimEditor = inject(NotesVimEditorService);
    const conflicts = inject(ObsidianConflictService);
    const tour = inject(GuidedTourService);
    const focus = inject(FocusModeService);
    await state.bootstrap();
    conflicts.attachKeys();
    tour.attachKeys();
    focus.attachKeys();
    vimEditor.attach();
    keyboard.attach();
  });
}
