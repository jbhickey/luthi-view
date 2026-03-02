import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OpenSCADWorker } from './OpenSCADWorker.js';

const DEFAULT_SCAD = `// Instrument component example
// Customize parameters below

$fn = 64;

// Parameters
bore_diameter = 4.5;   // mm
outer_diameter = 12;    // mm
length = 50;            // mm

difference() {
    cylinder(h = length, d = outer_diameter, center = true);
    cylinder(h = length + 1, d = bore_diameter, center = true);
}
`;

export class ScadEditor {
  constructor(sceneManager, statusBar) {
    this.sceneManager = sceneManager;
    this.statusBar = statusBar;
    this.worker = null;
    this.visible = false;
    this.stlLoader = new STLLoader();

    this._buildUI();
    this._initFileInput();
  }

  _buildUI() {
    this.panel = document.getElementById('editor-panel');

    // Textarea
    this.textarea = document.createElement('textarea');
    this.textarea.id = 'scad-textarea';
    this.textarea.value = DEFAULT_SCAD;
    this.textarea.spellcheck = false;
    this.panel.appendChild(this.textarea);

    // Parameter sliders container
    this.paramContainer = document.createElement('div');
    this.paramContainer.id = 'scad-params';
    this.panel.appendChild(this.paramContainer);

    // Controls bar
    const controls = document.createElement('div');
    controls.id = 'scad-controls';

    const renderBtn = document.createElement('button');
    renderBtn.textContent = 'Render (F5)';
    renderBtn.addEventListener('click', () => this._render());
    controls.appendChild(renderBtn);

    const openBtn = document.createElement('button');
    openBtn.textContent = 'Open .scad';
    openBtn.addEventListener('click', () => this.scadFileInput.click());
    controls.appendChild(openBtn);

    this.scadStatus = document.createElement('span');
    this.scadStatus.id = 'scad-status';
    controls.appendChild(this.scadStatus);

    this.panel.appendChild(controls);

    // F5 shortcut
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'F5') {
        e.preventDefault();
        this._render();
      }
    });

    // Parse params on text change
    this.textarea.addEventListener('input', () => this._parseParams());
  }

  _initFileInput() {
    this.scadFileInput = document.createElement('input');
    this.scadFileInput.type = 'file';
    this.scadFileInput.accept = '.scad';
    this.scadFileInput.style.display = 'none';
    document.body.appendChild(this.scadFileInput);

    this.scadFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        this.textarea.value = ev.target.result;
        this._parseParams();
        this._setStatus(`Loaded ${file.name}`);
      };
      reader.readAsText(file);
    });
  }

  toggle() {
    this.visible = !this.visible;
    this.panel.classList.toggle('hidden', !this.visible);
    if (this.visible) {
      this._parseParams();
      // Trigger resize for viewport
      window.dispatchEvent(new Event('resize'));
    } else {
      window.dispatchEvent(new Event('resize'));
    }
  }

  _parseParams() {
    // Parse lines like: variable_name = value; // comment
    const code = this.textarea.value;
    const lines = code.split('\n');
    const params = [];

    for (const line of lines) {
      const match = line.match(
        /^(\w+)\s*=\s*([\d.]+)\s*;\s*(?:\/\/\s*(.*))?$/
      );
      if (match) {
        const [, name, value, comment] = match;
        const num = parseFloat(value);
        if (!isNaN(num) && name !== '$fn') {
          params.push({
            name,
            value: num,
            label: comment ? comment.trim() : name,
          });
        }
      }
    }

    this._buildParamSliders(params);
  }

  _buildParamSliders(params) {
    this.paramContainer.innerHTML = '';

    params.forEach((param) => {
      const row = document.createElement('div');
      row.className = 'param-row';

      const label = document.createElement('label');
      label.textContent = param.label;
      row.appendChild(label);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = Math.max(0, param.value * 0.1);
      slider.max = param.value * 3;
      slider.step = param.value > 10 ? 1 : 0.1;
      slider.value = param.value;
      row.appendChild(slider);

      const display = document.createElement('span');
      display.className = 'param-value';
      display.textContent = param.value;
      row.appendChild(display);

      slider.addEventListener('input', () => {
        display.textContent = parseFloat(slider.value).toFixed(1);
        this._updateParam(param.name, slider.value);
      });

      this.paramContainer.appendChild(row);
    });
  }

  _updateParam(name, value) {
    const code = this.textarea.value;
    const regex = new RegExp(`^(${name}\\s*=\\s*)([\\d.]+)(\\s*;.*)$`, 'm');
    this.textarea.value = code.replace(regex, `$1${value}$3`);
  }

  async _render() {
    if (!this.worker) {
      this.worker = new OpenSCADWorker();
    }

    const code = this.textarea.value;
    this.scadStatus.textContent = 'Rendering...';
    this._setStatus('OpenSCAD rendering...');

    try {
      const stlString = await this.worker.render(code);

      // Parse STL string to geometry
      const encoder = new TextEncoder();
      const buffer = encoder.encode(stlString);
      const geometry = this.stlLoader.parse(buffer.buffer);

      this.sceneManager.addModel(geometry);
      this.scadStatus.textContent = 'Done';
      this._setStatus('OpenSCAD render complete');
    } catch (err) {
      this.scadStatus.textContent = `Error: ${err.message}`;
      this._setStatus(`OpenSCAD error: ${err.message}`);
    }
  }

  _setStatus(text) {
    if (this.statusBar) {
      this.statusBar.textContent = text;
    }
  }
}
