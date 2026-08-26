import { Component, inject } from '@angular/core';
import { AppStateService } from '../../core/services/app-state.service';
import { ObsidianConflict } from '../../core/services/obsidian.service';
import { ObsidianConflictService } from '../../core/services/obsidian-conflict.service';
import {
  buildObsidianConflictDiff,
  buildObsidianConflictHint,
  type ObsidianConflictDiff,
} from '../../core/utils/obsidian-conflict-diff.util';
import { getNavKeys, modKeyLabel } from '../../core/keyboard/keyboard.model';

@Component({
  selector: 'app-obsidian-conflict-modal',
  standalone: true,
  templateUrl: './obsidian-conflict-modal.component.html',
  styleUrl: './obsidian-conflict-modal.component.scss',
})
export class ObsidianConflictModalComponent {
  readonly conflict = inject(ObsidianConflictService).conflict;
  private readonly conflicts = inject(ObsidianConflictService);
  private readonly state = inject(AppStateService);

  diff(conflict: ObsidianConflict): ObsidianConflictDiff {
    return buildObsidianConflictDiff(conflict.appMarkdown, conflict.vaultMarkdown);
  }

  hint(conflict: ObsidianConflict): string {
    const nav = getNavKeys(this.state.keyLayout());
    const mod = modKeyLabel(this.state.keyboardNavPlatform());
    const move = `${nav.left.toUpperCase()}${nav.down.toUpperCase()}${nav.up.toUpperCase()}${nav.right.toUpperCase()}`;
    return buildObsidianConflictHint({
      vaultFileTime: conflict.vaultUpdatedAt,
      appUpdatedAt: conflict.appUpdatedAt,
      vaultNewerByClock: conflict.vaultNewerByClock,
      appNewerByClock: conflict.appNewerByClock,
      keys: `Keys: 1 keep card · 2 keep vault · Enter confirm · Esc cancel · arrows or ${move} (${mod}+ also).`,
    });
  }

  close(): void {
    this.conflicts.close();
  }

  resolve(choice: 'app' | 'vault'): void {
    void this.conflicts.resolve(choice);
  }
}
