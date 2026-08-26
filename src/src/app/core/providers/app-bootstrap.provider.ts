import { inject, provideAppInitializer } from '@angular/core';
import { AppStateService } from '../services/app-state.service';
import { KeyboardNavigationService } from '../keyboard/keyboard-navigation.service';
import { NotesVimEditorService } from '../keyboard/notes-vim-editor.service';

export function provideAppBootstrap() {
  return provideAppInitializer(async () => {
    const state = inject(AppStateService);
    const keyboard = inject(KeyboardNavigationService);
    const vimEditor = inject(NotesVimEditorService);
    await state.bootstrap();
    vimEditor.attach();
    keyboard.attach();
  });
}
