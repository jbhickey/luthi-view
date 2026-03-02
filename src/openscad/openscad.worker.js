import { createOpenSCAD } from 'openscad-wasm';

let instance = null;

async function init() {
  if (instance) return instance;

  const logs = [];
  const errors = [];

  instance = await createOpenSCAD({
    noInitialRun: true,
    print: (text) => logs.push(text),
    printErr: (text) => errors.push(text),
  });

  return instance;
}

self.onmessage = async (e) => {
  const { id, type, code } = e.data;

  if (type === 'render') {
    try {
      const scad = await init();
      const stlString = await scad.renderToStl(code);
      self.postMessage({ id, type: 'result', stl: stlString });
    } catch (err) {
      self.postMessage({ id, type: 'error', error: err.message || String(err) });
    }
  }
};
