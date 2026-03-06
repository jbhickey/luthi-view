import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

export class SelectionManager {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.selectedModel = null;
    this.enabled = false;
    this.mode = 'translate';
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.onSelectionChanged = null;

    this._originalEmissive = null;
    this._onClick = this._onClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  init() {
    const camera = this.sceneManager.activeCamera;
    const renderer = this.sceneManager.renderer;

    this.transformControls = new TransformControls(camera, renderer.domElement);
    this.transformControls.setSize(0.8);
    this.sceneManager.scene.add(this.transformControls.getHelper());

    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.sceneManager.controls.enabled = !event.value;
    });

    // Keep transform controls in sync with active camera
    const originalSetCamera = this.sceneManager.setCamera.bind(this.sceneManager);
    this.sceneManager.setCamera = (type) => {
      originalSetCamera(type);
      this.transformControls.camera = this.sceneManager.activeCamera;
    };
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    const canvas = this.sceneManager.renderer.domElement;
    if (enabled) {
      canvas.addEventListener('click', this._onClick);
      window.addEventListener('keydown', this._onKeyDown);
    } else {
      canvas.removeEventListener('click', this._onClick);
      window.removeEventListener('keydown', this._onKeyDown);
      this.deselect();
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (this.transformControls) {
      this.transformControls.setMode(mode);
    }
  }

  select(mesh) {
    if (this.selectedModel === mesh) return;
    this.deselect();

    this.selectedModel = mesh;
    this._originalEmissive = mesh.material.emissive.getHex();
    mesh.material.emissive.set(0x444444);

    this.transformControls.attach(mesh);
    this.transformControls.setMode(this.mode);

    if (this.onSelectionChanged) {
      this.onSelectionChanged(mesh.userData.modelId);
    }
  }

  deselect() {
    if (!this.selectedModel) return;

    this.selectedModel.material.emissive.setHex(this._originalEmissive || 0x000000);
    this._originalEmissive = null;
    this.transformControls.detach();

    const oldId = this.selectedModel.userData.modelId;
    this.selectedModel = null;

    if (this.onSelectionChanged) {
      this.onSelectionChanged(null);
    }
  }

  selectById(modelId) {
    const mesh = this.sceneManager.getModelById(modelId);
    if (mesh) this.select(mesh);
  }

  _onClick(event) {
    if (!this.enabled) return;

    // Don't interfere with transform controls dragging
    if (this.transformControls.dragging) return;

    const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.sceneManager.activeCamera);
    const models = this.sceneManager.getAllModels();
    const intersects = this.raycaster.intersectObjects(models);

    if (intersects.length > 0) {
      this.select(intersects[0].object);
    } else {
      this.deselect();
    }
  }

  _onKeyDown(event) {
    if (!this.enabled) return;

    switch (event.key) {
      case 't':
      case 'T':
        this.setMode('translate');
        break;
      case 'r':
      case 'R':
        this.setMode('rotate');
        break;
      case 'Escape':
        this.deselect();
        break;
      case 'Delete':
        if (this.selectedModel) {
          const id = this.selectedModel.userData.modelId;
          this.deselect();
          this.sceneManager.removeModel(id);
        }
        break;
    }
  }
}
