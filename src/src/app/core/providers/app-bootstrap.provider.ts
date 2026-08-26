import { inject, provideAppInitializer } from '@angular/core';
import { AppStateService } from '../services/app-state.service';
import { KeyboardNavigationService } from '../keyboard/keyboard-navigation.service';
import { NotesVimEditorService } from '../keyboard/notes-vim-editor.service';
import { ObsidianConflictService } from '../services/obsidian-conflict.service';

export function provideAppBootstrap() {
  return provideAppInitializer(async () => {
    const state = inject(AppStateService);
    const keyboard = inject(KeyboardNavigationService);
    const vimEditor = inject(NotesVimEditorService);
    const conflicts = inject(ObsidianConflictService);
    await state.bootstrap();
    conflicts.attachKeys();
    vimEditor.attach();
    keyboard.attach();
  });
}
