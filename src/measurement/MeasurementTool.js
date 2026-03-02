import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class MeasurementTool {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.enabled = false;
    this.units = 'mm';
    this.measurements = [];
    this.pendingPoint = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Temp marker for first click
    this.markerGeom = new THREE.SphereGeometry(0.5, 16, 16);
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xff4466 });
    this.tempMarker = null;

    this._onClick = this._onClick.bind(this);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    const canvas = this.sceneManager.renderer.domElement;
    if (enabled) {
      canvas.addEventListener('click', this._onClick);
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.removeEventListener('click', this._onClick);
      canvas.style.cursor = '';
      this._removeTempMarker();
      this.pendingPoint = null;
    }
  }

  setUnits(units) {
    this.units = units;
    // Update existing labels
    this.measurements.forEach((m) => {
      const dist = this.units === 'mm' ? m.distance : m.distance / 25.4;
      const suffix = this.units;
      m.labelDiv.textContent = `${dist.toFixed(2)} ${suffix}`;
    });
  }

  clearAll() {
    this.measurements.forEach((m) => {
      this.sceneManager.scene.remove(m.line);
      this.sceneManager.scene.remove(m.label);
      this.sceneManager.scene.remove(m.markerA);
      this.sceneManager.scene.remove(m.markerB);
      m.line.geometry.dispose();
      m.line.material.dispose();
    });
    this.measurements = [];
    this._removeTempMarker();
    this.pendingPoint = null;
  }

  _onClick(event) {
    if (!this.enabled || !this.sceneManager.currentModel) return;

    const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.sceneManager.activeCamera);
    const intersects = this.raycaster.intersectObject(this.sceneManager.currentModel);

    if (intersects.length === 0) return;

    const point = intersects[0].point.clone();

    if (!this.pendingPoint) {
      // First point
      this.pendingPoint = point;
      this._showTempMarker(point);
    } else {
      // Second point - create measurement
      this._createMeasurement(this.pendingPoint, point);
      this._removeTempMarker();
      this.pendingPoint = null;
    }
  }

  _showTempMarker(point) {
    this._removeTempMarker();
    this.tempMarker = new THREE.Mesh(this.markerGeom, this.markerMat);
    this.tempMarker.position.copy(point);
    this.sceneManager.scene.add(this.tempMarker);
  }

  _removeTempMarker() {
    if (this.tempMarker) {
      this.sceneManager.scene.remove(this.tempMarker);
      this.tempMarker = null;
    }
  }

  _createMeasurement(pointA, pointB) {
    const distance = pointA.distanceTo(pointB);

    // Line
    const lineGeom = new THREE.BufferGeometry().setFromPoints([pointA, pointB]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff4466, linewidth: 2 });
    const line = new THREE.Line(lineGeom, lineMat);
    this.sceneManager.scene.add(line);

    // End markers
    const markerA = new THREE.Mesh(this.markerGeom, this.markerMat);
    markerA.position.copy(pointA);
    this.sceneManager.scene.add(markerA);

    const markerB = new THREE.Mesh(this.markerGeom, this.markerMat);
    markerB.position.copy(pointB);
    this.sceneManager.scene.add(markerB);

    // CSS2D label at midpoint
    const mid = pointA.clone().add(pointB).multiplyScalar(0.5);
    const dist = this.units === 'mm' ? distance : distance / 25.4;
    const labelDiv = document.createElement('div');
    labelDiv.className = 'measurement-label';
    labelDiv.textContent = `${dist.toFixed(2)} ${this.units}`;

    const label = new CSS2DObject(labelDiv);
    label.position.copy(mid);
    this.sceneManager.scene.add(label);

    this.measurements.push({ line, label, labelDiv, markerA, markerB, distance, pointA, pointB });
  }
}
