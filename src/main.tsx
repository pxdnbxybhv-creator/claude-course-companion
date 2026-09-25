import { render } from 'preact';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app/App';
import { registerSW } from './app/pwa';

render(<App />, document.getElementById('app')!);
registerSW();
