import { SceneManager } from './scene/SceneManager.js';
import { STLFileLoader } from './loaders/STLFileLoader.js';
import { GCodeFileLoader } from './loaders/GCodeFileLoader.js';
import { Toolbar } from './ui/Toolbar.js';
import { MeasurementTool } from './measurement/MeasurementTool.js';
import { OrthographicViews } from './views/OrthographicViews.js';
import { ToolpathRenderer } from './cnc/ToolpathRenderer.js';
import { StockSimulator } from './cnc/StockSimulator.js';
import { SimulationController } from './cnc/SimulationController.js';
import { SimulationPanel } from './ui/SimulationPanel.js';
import { SelectionManager } from './selection/SelectionManager.js';
import { ObjectPanel } from './ui/ObjectPanel.js';

const viewport = document.getElementById('viewport');
const statusBar = document.getElementById('status-bar');
const toolbarEl = document.getElementById('toolbar');

// Core systems
const sceneManager = new SceneManager(viewport);
const stlLoader = new STLFileLoader(sceneManager, statusBar);
const gcodeLoader = new GCodeFileLoader(sceneManager, statusBar);
const toolbar = new Toolbar(toolbarEl);
const measureTool = new MeasurementTool(sceneManager);
const orthoViews = new OrthographicViews(sceneManager, viewport);

// Selection & Object Panel
const selectionManager = new SelectionManager(sceneManager);
const objectPanel = new ObjectPanel(viewport);

// Wire sceneManager model events
sceneManager.onModelAdded = (mesh) => {
  objectPanel.addItem(mesh.userData.modelId, mesh.userData.modelName, mesh.userData.modelColor);
};

sceneManager.onModelRemoved = (modelId) => {
  objectPanel.removeItem(modelId);
};

// Wire object panel callbacks
objectPanel.onSelect = (modelId) => {
  selectionManager.selectById(modelId);
};

objectPanel.onDelete = (modelId) => {
  if (selectionManager.selectedModel && selectionManager.selectedModel.userData.modelId === modelId) {
    selectionManager.deselect();
  }
  sceneManager.removeModel(modelId);
};

objectPanel.onToggleVisibility = (modelId) => {
  const mesh = sceneManager.getModelById(modelId);
  if (mesh) mesh.visible = !mesh.visible;
};

// Wire selection changed to panel
selectionManager.onSelectionChanged = (modelId) => {
  objectPanel.setSelected(modelId);
};

// Init selection manager once renderer is ready
const initSelection = () => {
  if (sceneManager.ready) {
    selectionManager.init();
  } else {
    requestAnimationFrame(initSelection);
  }
};
initSelection();

// CNC systems
const viewportContainer = document.getElementById('viewport-container');
const toolpathRenderer = new ToolpathRenderer(sceneManager.scene);
const stockSimulator = new StockSimulator(sceneManager.scene);
const simController = new SimulationController(toolpathRenderer, stockSimulator);
const simPanel = new SimulationPanel(viewportContainer);
simPanel.setController(simController);

// CNC state
let rapidsVisible = true;
let stockVisible = true;

// G-code loaded callback
gcodeLoader.onGCodeLoaded = (result, filename) => {
  // Clear previous CNC data
  toolpathRenderer.clear();
  stockSimulator.clear();
  simController.stop();

  // Load toolpath lines
  toolpathRenderer.loadToolpath(result.moves, result.metadata.feedRange);
  toolpathRenderer.setRapidsVisible(rapidsVisible);
  toolpathRenderer.showAll();

  // Initialize stock
  stockSimulator.initFromToolpath(result.moves, result.bounds);
  stockSimulator.setVisible(stockVisible);

  // Initialize simulation controller
  simController.init(result.moves);

  // Fit camera to toolpath extents (gcodeToThree: X->X, Z->Y, Y->-Z)
  if (sceneManager.controls) {
    const b = result.bounds;
    const cx = (b.min.x + b.max.x) / 2;
    const cy = (b.min.z + b.max.z) / 2;
    const cz = -(b.min.y + b.max.y) / 2;
    const sx = b.max.x - b.min.x;
    const sy = b.max.z - b.min.z;
    const sz = b.max.y - b.min.y;
    const maxDim = Math.max(sx, sy, sz) || 50;
    sceneManager.controls.target.set(cx, cy, cz);
    const dist = maxDim * 2;
    sceneManager.perspectiveCamera.position.set(cx + dist * 0.6, cy + dist * 0.5, cz + dist * 0.8);
    sceneManager.perspectiveCamera.lookAt(cx, cy, cz);
    sceneManager.controls.update();
  }
};

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
  if (active) {
    selectionManager.setEnabled(false);
    toolbar.buttons.move && toolbar.buttons.move.classList.remove('active');
    toolbar.buttons.rotate && toolbar.buttons.rotate.classList.remove('active');
  }
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

// Assembly toolbar buttons
toolbar.on('move', () => {
  measureTool.setEnabled(false);
  toolbar.buttons.measure.classList.remove('active');
  selectionManager.setMode('translate');
  selectionManager.setEnabled(true);
  toolbar.buttons.move.classList.add('active');
  toolbar.buttons.rotate.classList.remove('active');
  statusBar.textContent = 'Move mode: click a model to select, drag gizmo to move (T=translate, R=rotate, Esc=deselect)';
});

toolbar.on('rotate', () => {
  measureTool.setEnabled(false);
  toolbar.buttons.measure.classList.remove('active');
  selectionManager.setMode('rotate');
  selectionManager.setEnabled(true);
  toolbar.buttons.rotate.classList.add('active');
  toolbar.buttons.move.classList.remove('active');
  statusBar.textContent = 'Rotate mode: click a model to select, drag gizmo to rotate (T=translate, R=rotate, Esc=deselect)';
});

toolbar.on('objects', () => {
  const visible = objectPanel.toggle();
  if (visible) {
    toolbar.buttons.objects.classList.add('active');
  } else {
    toolbar.buttons.objects.classList.remove('active');
  }
});

// CNC toolbar buttons
toolbar.on('openGcode', () => gcodeLoader.openFilePicker());

toolbar.on('rapids', () => {
  rapidsVisible = !rapidsVisible;
  toolpathRenderer.setRapidsVisible(rapidsVisible);
  if (rapidsVisible) {
    toolbar.buttons.rapids.classList.add('active');
  } else {
    toolbar.buttons.rapids.classList.remove('active');
  }
});

toolbar.on('stock', () => {
  stockVisible = !stockVisible;
  stockSimulator.setVisible(stockVisible);
  if (stockVisible) {
    toolbar.buttons.stock.classList.add('active');
  } else {
    toolbar.buttons.stock.classList.remove('active');
  }
});

toolbar.on('simulate', () => {
  const visible = simPanel.toggle();
  if (visible) {
    toolbar.buttons.simulate.classList.add('active');
  } else {
    toolbar.buttons.simulate.classList.remove('active');
  }
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
