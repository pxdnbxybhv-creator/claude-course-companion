// /lab.html — lists scenes.
export default function (canvas: HTMLCanvasElement) {
  canvas.style.display = 'none';
  const scenes = Object.keys(import.meta.glob('./*.ts')).map((k) => k.slice(2, -3));
  document.body.insertAdjacentHTML('beforeend', `<ul style="font:16px system-ui;padding:24px">${scenes.map((s) => `<li><a href="?scene=${s}">${s}</a></li>`).join('')}</ul>`);
}
