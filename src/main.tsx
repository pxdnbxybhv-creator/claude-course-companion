import { render } from 'preact';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app/App';
// the homestead and its animals' notebook travel in backups even before the walk is first opened
import './app/home';
import './views/walk/features/home/life/book';
import { registerSW } from './app/pwa';

render(<App />, document.getElementById('app')!);
registerSW();
