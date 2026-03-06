export class ObjectPanel {
  constructor(container) {
    this.container = container;
    this.items = new Map();
    this.selectedId = null;
    this.visible = false;

    this.onSelect = null;
    this.onDelete = null;
    this.onToggleVisibility = null;
    this.onRotate = null;

    this._build();
  }

  _build() {
    this.panel = document.createElement('div');
    this.panel.className = 'object-panel hidden';

    const header = document.createElement('div');
    header.className = 'object-panel-header';
    header.textContent = 'Objects';
    this.panel.appendChild(header);

    this.list = document.createElement('div');
    this.list.className = 'object-panel-list';
    this.panel.appendChild(this.list);

    // Rotation controls section
    this.rotateSection = document.createElement('div');
    this.rotateSection.className = 'object-panel-rotate hidden';

    const rotateHeader = document.createElement('div');
    rotateHeader.className = 'object-panel-header';
    rotateHeader.textContent = 'Rotate Selected';
    this.rotateSection.appendChild(rotateHeader);

    const axes = ['X', 'Y', 'Z'];
    const angles = [90, 180, 270];

    axes.forEach((axis) => {
      const row = document.createElement('div');
      row.className = 'rotate-row';

      const label = document.createElement('span');
      label.className = 'rotate-axis-label';
      label.textContent = axis;
      row.appendChild(label);

      angles.forEach((deg) => {
        const btn = document.createElement('button');
        btn.className = 'rotate-btn';
        btn.textContent = `${deg}\u00B0`;
        btn.title = `Rotate ${deg}\u00B0 around ${axis}`;
        btn.addEventListener('click', () => {
          if (this.onRotate) this.onRotate(axis.toLowerCase(), deg);
        });
        row.appendChild(btn);
      });

      this.rotateSection.appendChild(row);
    });

    this.panel.appendChild(this.rotateSection);

    this.container.appendChild(this.panel);
  }

  addItem(modelId, name, color) {
    const row = document.createElement('div');
    row.className = 'object-panel-item';
    row.dataset.modelId = modelId;

    const swatch = document.createElement('span');
    swatch.className = 'object-swatch';
    swatch.style.backgroundColor = '#' + color.toString(16).padStart(6, '0');
    row.appendChild(swatch);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'object-name';
    nameSpan.textContent = name;
    row.appendChild(nameSpan);

    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    row.appendChild(spacer);

    const visBtn = document.createElement('button');
    visBtn.className = 'object-btn';
    visBtn.textContent = '\u{1F441}';
    visBtn.title = 'Toggle visibility';
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onToggleVisibility) this.onToggleVisibility(modelId);
    });
    row.appendChild(visBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'object-btn object-btn-delete';
    delBtn.textContent = '\u00D7';
    delBtn.title = 'Remove';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onDelete) this.onDelete(modelId);
    });
    row.appendChild(delBtn);

    row.addEventListener('click', () => {
      if (this.onSelect) this.onSelect(modelId);
    });

    this.list.appendChild(row);
    this.items.set(modelId, row);
  }

  removeItem(modelId) {
    const row = this.items.get(modelId);
    if (row) {
      row.remove();
      this.items.delete(modelId);
    }
    if (this.selectedId === modelId) {
      this.selectedId = null;
    }
  }

  setSelected(modelId) {
    this.selectedId = modelId;
    this.items.forEach((row, id) => {
      row.classList.toggle('selected', id === modelId);
    });
    this.rotateSection.classList.toggle('hidden', !modelId);
  }

  toggle() {
    this.visible = !this.visible;
    this.panel.classList.toggle('hidden', !this.visible);
    return this.visible;
  }

  show() {
    this.visible = true;
    this.panel.classList.remove('hidden');
  }

  hide() {
    this.visible = false;
    this.panel.classList.add('hidden');
  }
}
