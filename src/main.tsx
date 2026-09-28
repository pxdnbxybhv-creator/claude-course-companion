import { render } from 'preact';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app/App';
// the homestead and its animals' notebook travel in backups even before the walk is first opened
import './app/home';
import './views/walk/features/home/life/book';
// the mirror's meta (unlocks, records, the paused run, coins owed) — types only, the game stays lazy
import './app/mirror';
import { registerSW } from './app/pwa';
import { initIntro } from './app/intro';

// 开篇: decided after every import (the demo flag has seeded or onboarded), before the first render,
// so the App's first render and effects already know whether the opening film is on.
initIntro();
render(<App />, document.getElementById('app')!);
registerSW();
