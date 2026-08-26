import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="view" aria-label="About">
      <div class="instructionsHeader">
        <h2 class="instructionsTitle">About</h2>
        <a routerLink="/" class="monoLinkButton">Close</a>
      </div>
      <div class="instructionsContent aboutLanding">
        <section class="aboutHero" aria-labelledby="aboutHeadline">
          <p class="aboutEyebrow">Chrome extension · Keyboard-first · Local SQLite</p>
          <p class="aboutBrandName">vim-todo-list</p>
          <p class="aboutHeadline" id="aboutHeadline">
            Capture todos at keyboard speed—stored locally, no account.
          </p>
          <p class="aboutSubhead">
            Boards, priorities, links, and notes in local SQLite—no cloud account.
          </p>
          <p class="aboutByLine">
            <span class="aboutBy">by</span>
            <a
              class="aboutByLink"
              href="https://northeasternsoftware.com/"
              target="_blank"
              rel="noopener noreferrer"
              >Northeastern Software Services LLC</a
            >
          </p>
        </section>
        <p>
          <a href="https://github.com/carlosmva/vim-todo-list" target="_blank" rel="noreferrer" class="monoLinkButton"
            >GitHub</a
          >
        </p>
        <p><a routerLink="/" class="monoLinkButton">Back to notes</a></p>
      </div>
    </div>
  `,
})
export class AboutComponent {}
