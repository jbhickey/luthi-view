import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.currentModel = null;
    this.onModelLoaded = null;

    this._initScene();
    this._initRenderer();
    this._initCSS2DRenderer();
    this._initCamera();
    this._initControls();
    this._initLights();
    this._initHelpers();
    this._animate();

    window.addEventListener('resize', () => this._onResize());
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);
  }

  _initCSS2DRenderer() {
    this.css2dRenderer = new CSS2DRenderer();
    this.css2dRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.css2dRenderer.domElement.style.position = 'absolute';
    this.css2dRenderer.domElement.style.top = '0';
    this.css2dRenderer.domElement.style.left = '0';
    this.css2dRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.css2dRenderer.domElement);
  }

  _initCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.perspectiveCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 10000);
    this.perspectiveCamera.position.set(50, 50, 80);

    this.orthoCamera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 10000);
    this.orthoCamera.position.set(0, 0, 100);

    this.activeCamera = this.perspectiveCamera;
  }

  _initControls() {
    this.controls = new OrbitControls(this.activeCamera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.target.set(0, 0, 0);
  }

  _initLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(50, 80, 60);
    dir1.castShadow = true;
    this.scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-30, -20, -40);
    this.scene.add(dir2);
  }

  _initHelpers() {
    this.gridHelper = new THREE.GridHelper(200, 40, 0x444466, 0x333355);
    this.scene.add(this.gridHelper);

    this.axesHelper = new THREE.AxesHelper(30);
    this.scene.add(this.axesHelper);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.activeCamera);
    this.css2dRenderer.render(this.scene, this.activeCamera);
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    this.perspectiveCamera.aspect = w / h;
    this.perspectiveCamera.updateProjectionMatrix();

    this._updateOrthoFrustum();

    this.renderer.setSize(w, h);
    this.css2dRenderer.setSize(w, h);
  }

  _updateOrthoFrustum() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    const frustumSize = this.orthoCamera.userData.frustumSize || 100;
    this.orthoCamera.left = -frustumSize * aspect / 2;
    this.orthoCamera.right = frustumSize * aspect / 2;
    this.orthoCamera.top = frustumSize / 2;
    this.orthoCamera.bottom = -frustumSize / 2;
    this.orthoCamera.updateProjectionMatrix();
  }

  addModel(geometry) {
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      this.currentModel.geometry.dispose();
      this.currentModel.material.dispose();
    }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshPhongMaterial({
      color: 0xc4a265,
      specular: 0x333333,
      shininess: 40,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.currentModel = mesh;

    this._fitCameraToModel(mesh);

    if (this.onModelLoaded) {
      this.onModelLoaded(mesh);
    }

    return mesh;
  }

  _fitCameraToModel(mesh) {
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Center the model
    this.controls.target.copy(center);

    // Position perspective camera
    const dist = maxDim * 2;
    this.perspectiveCamera.position.set(
      center.x + dist * 0.6,
      center.y + dist * 0.5,
      center.z + dist * 0.8
    );
    this.perspectiveCamera.lookAt(center);

    // Set ortho frustum
    const frustumSize = maxDim * 1.5;
    this.orthoCamera.userData.frustumSize = frustumSize;
    this._updateOrthoFrustum();
    this.orthoCamera.position.set(center.x, center.y, center.z + dist);
    this.orthoCamera.lookAt(center);

    this.controls.update();
  }

  setCamera(type) {
    if (type === 'orthographic') {
      this.activeCamera = this.orthoCamera;
    } else {
      this.activeCamera = this.perspectiveCamera;
    }
    this.controls.object = this.activeCamera;
    this.controls.update();
  }

  setOrthoView(direction) {
    if (!this.currentModel) return;

    this.setCamera('orthographic');
    const box = new THREE.Box3().setFromObject(this.currentModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2;

    const positions = {
      front:  [center.x, center.y, center.z + dist],
      back:   [center.x, center.y, center.z - dist],
      left:   [center.x - dist, center.y, center.z],
      right:  [center.x + dist, center.y, center.z],
      top:    [center.x, center.y + dist, center.z],
      bottom: [center.x, center.y - dist, center.z],
    };

    const ups = {
      front:  [0, 1, 0],
      back:   [0, 1, 0],
      left:   [0, 1, 0],
      right:  [0, 1, 0],
      top:    [0, 0, -1],
      bottom: [0, 0, 1],
    };

    const pos = positions[direction];
    const up = ups[direction];
    if (!pos) return;

    this.orthoCamera.position.set(...pos);
    this.orthoCamera.up.set(...up);
    this.controls.target.copy(center);
    this.orthoCamera.lookAt(center);
    this.controls.update();
  }

  getModelBoundingBox() {
    if (!this.currentModel) return null;
    return new THREE.Box3().setFromObject(this.currentModel);
  }
}
