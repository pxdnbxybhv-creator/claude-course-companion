// Visual test bench. Each scene is a module in ./scenes exporting
//   default (canvas: HTMLCanvasElement, params: URLSearchParams) => void | Promise<void>
// Open /lab.html?scene=<name>&…params. The canvas fills the viewport at devicePixelRatio;
// scenes may resize it. Sets window.__labReady when the scene has finished drawing.
import '../styles/fonts.css';

declare global { interface Window { __labReady?: boolean } }

const scenes = import.meta.glob('./scenes/*.ts');
const params = new URLSearchParams(location.search);
const name = params.get('scene') ?? 'index';
const canvas = document.getElementById('lab') as HTMLCanvasElement;
const dpr = window.devicePixelRatio || 1;
canvas.width = Math.round(innerWidth * dpr);
canvas.height = Math.round(innerHeight * dpr);
canvas.style.width = innerWidth + 'px';
canvas.style.height = innerHeight + 'px';

async function run() {
  const load = scenes[`./scenes/${name}.ts`];
  if (!load) {
    document.body.insertAdjacentHTML('beforeend', `<pre>Unknown scene "${name}". Available: ${Object.keys(scenes).map((k) => k.slice(9, -3)).join(', ')}</pre>`);
    window.__labReady = true;
    return;
  }
  const mod = (await load()) as { default: (c: HTMLCanvasElement, p: URLSearchParams) => void | Promise<void> };
  await document.fonts?.ready;
  await mod.default(canvas, params);
  window.__labReady = true;
}
run().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#b00">${String(e?.stack ?? e)}</pre>`);
  window.__labReady = true;
});
