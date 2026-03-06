export class Toolbar {
  constructor(container) {
    this.container = container;
    this.buttons = {};
    this._build();
  }

  _build() {
    this.container.innerHTML = '';

    // App title
    const title = document.createElement('span');
    title.className = 'toolbar-title';
    title.textContent = 'Instrument Component CAD Viewer';
    this.container.appendChild(title);

    // Separator
    this.container.appendChild(this._separator());

    // File group
    this._addButton('open', 'Open STL', 'file-group');
    this._addButton('openGcode', 'Open G-code', 'file-group');

    this.container.appendChild(this._separator());

    // View group
    this._addButton('perspective', 'Perspective', 'view-group', true);
    this._addButton('front', 'Front', 'view-group');
    this._addButton('top', 'Top', 'view-group');
    this._addButton('right', 'Right', 'view-group');
    this._addButton('quad', 'Quad View', 'view-group');

    this.container.appendChild(this._separator());

    // Measure group
    this._addButton('measure', 'Measure', 'measure-group');
    this._addButton('clearMeasure', 'Clear', 'measure-group');

    this.container.appendChild(this._separator());

    // Assembly group
    this._addButton('move', 'Move', 'assembly-group');
    this._addButton('rotate', 'Rotate', 'assembly-group');
    this._addButton('objects', 'Objects', 'assembly-group');

    this.container.appendChild(this._separator());

    // Units toggle
    this._addButton('units', 'mm', 'units-group');

    this.container.appendChild(this._separator());

    // CNC group
    this._addButton('rapids', 'Rapids', 'cnc-group');
    this._addButton('stock', 'Stock', 'cnc-group');
    this._addButton('simulate', 'Simulate', 'cnc-group');

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.container.appendChild(spacer);

    // OpenSCAD group (right side)
    this._addButton('openScad', 'Open .scad', 'scad-group');
  }

  _addButton(id, label, group, active = false) {
    const btn = document.createElement('button');
    btn.className = 'toolbar-btn' + (active ? ' active' : '');
    btn.textContent = label;
    btn.dataset.id = id;
    this.buttons[id] = btn;
    this.container.appendChild(btn);
    return btn;
  }

  _separator() {
    const sep = document.createElement('div');
    sep.className = 'toolbar-separator';
    return sep;
  }

  on(buttonId, callback) {
    const btn = this.buttons[buttonId];
    if (btn) {
      btn.addEventListener('click', () => callback(btn));
    }
  }

  setActive(buttonId) {
    // Deactivate view group buttons
    ['perspective', 'front', 'top', 'right', 'quad'].forEach((id) => {
      if (this.buttons[id]) this.buttons[id].classList.remove('active');
    });
    if (this.buttons[buttonId]) {
      this.buttons[buttonId].classList.add('active');
    }
  }

  toggleActive(buttonId) {
    const btn = this.buttons[buttonId];
    if (btn) {
      btn.classList.toggle('active');
      return btn.classList.contains('active');
    }
    return false;
  }

  setLabel(buttonId, text) {
    if (this.buttons[buttonId]) {
      this.buttons[buttonId].textContent = text;
    }
  }
}
