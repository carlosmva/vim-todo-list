import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface AboutFeature {
  title: string;
  body: string;
}

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
})
export class AboutComponent {
  readonly iconUrl = 'icons/icon128.png';

  readonly tags = ['Chrome extension', 'Keyboard-first', 'Local SQLite'];

  readonly features: AboutFeature[] = [
    {
      title: 'Vim-style navigation',
      body: 'Move through boards, cards, and notes with Alt-modified keys and slash search.',
    },
    {
      title: 'Boards & priorities',
      body: 'Organize pending work by board, priority ribbon, due dates, and kanban columns.',
    },
    {
      title: 'Notes that stay local',
      body: 'Markdown notes, links, and SQLite storage—no cloud account required.',
    },
  ];
}
