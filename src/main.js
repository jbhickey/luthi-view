import { SceneManager } from './scene/SceneManager.js';
import { STLFileLoader } from './loaders/STLFileLoader.js';
import { Toolbar } from './ui/Toolbar.js';
import { MeasurementTool } from './measurement/MeasurementTool.js';
import { OrthographicViews } from './views/OrthographicViews.js';

const viewport = document.getElementById('viewport');
const statusBar = document.getElementById('status-bar');
const toolbarEl = document.getElementById('toolbar');

// Core systems
const sceneManager = new SceneManager(viewport);
const stlLoader = new STLFileLoader(sceneManager, statusBar);
const toolbar = new Toolbar(toolbarEl);
const measureTool = new MeasurementTool(sceneManager);
const orthoViews = new OrthographicViews(sceneManager, viewport);

// Units state
let unitsMM = true;

// --- Toolbar wiring ---

// Open file
toolbar.on('open', () => stlLoader.openFilePicker());

// View buttons
toolbar.on('perspective', () => {
  orthoViews.disable();
  sceneManager.setCamera('perspective');
  toolbar.setActive('perspective');
});

toolbar.on('front', () => {
  orthoViews.disable();
  sceneManager.setOrthoView('front');
  toolbar.setActive('front');
});

toolbar.on('top', () => {
  orthoViews.disable();
  sceneManager.setOrthoView('top');
  toolbar.setActive('top');
});

toolbar.on('right', () => {
  orthoViews.disable();
  sceneManager.setOrthoView('right');
  toolbar.setActive('right');
});

toolbar.on('quad', () => {
  const active = toolbar.toggleActive('quad');
  if (active) {
    // Deactivate other view buttons
    ['perspective', 'front', 'top', 'right'].forEach((id) => {
      if (toolbar.buttons[id]) toolbar.buttons[id].classList.remove('active');
    });
    orthoViews.enable();
  } else {
    orthoViews.disable();
    sceneManager.setCamera('perspective');
    toolbar.setActive('perspective');
  }
});

// Measurement
toolbar.on('measure', () => {
  const active = toolbar.toggleActive('measure');
  measureTool.setEnabled(active);
  statusBar.textContent = active ? 'Measure mode: click two points on the model' : 'Ready';
});

toolbar.on('clearMeasure', () => {
  measureTool.clearAll();
  statusBar.textContent = 'Measurements cleared';
});

// Units toggle
toolbar.on('units', () => {
  unitsMM = !unitsMM;
  toolbar.setLabel('units', unitsMM ? 'mm' : 'in');
  measureTool.setUnits(unitsMM ? 'mm' : 'in');
});

// OpenSCAD editor toggle
toolbar.on('openScad', () => {
  import('./openscad/ScadEditor.js').then(({ ScadEditor }) => {
    if (!window._scadEditor) {
      window._scadEditor = new ScadEditor(sceneManager, statusBar);
    }
    window._scadEditor.toggle();
  });
});

// Load sample STL from public/models/ if present
const base = import.meta.env.BASE_URL;
const sampleModels = ['chanter.stl', 'sample.stl'];
for (const name of sampleModels) {
  fetch(`${base}models/${name}`, { method: 'HEAD' }).then((res) => {
    if (res.ok && res.status === 200) {
      stlLoader.loadFromURL(`${base}models/${name}`, name);
    }
  }).catch(() => {});
}
