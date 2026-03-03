import * as THREE from 'three';
import { gcodeToThree } from './GCodeParser.js';

const RESOLUTION = 0.5;   // mm per cell
const MARGIN = 5;          // mm margin around toolpath
const TOOL_DIAMETER = 3.175; // 1/8" endmill default

export class StockSimulator {
  constructor(scene) {
    this.scene = scene;
    this.heightmap = null;
    this.gridW = 0;
    this.gridH = 0;
    this.stockMinX = 0;
    this.stockMinY = 0;
    this.stockTopZ = 0;
    this.stockBottomZ = 0;
    this.mesh = null;
    this.toolRadius = TOOL_DIAMETER / 2;
    this.visible = true;
    this.moves = null;
  }

  /**
   * Initialize stock from toolpath bounds.
   * @param {Array} moves - Parsed moves from GCodeParser
   * @param {{ min, max }} bounds - Toolpath bounds in G-code coords
   */
  initFromToolpath(moves, bounds) {
    this.clear();
    this.moves = moves;

    // Stock extents in G-code XY plane, with margin
    this.stockMinX = bounds.min.x - MARGIN;
    this.stockMinY = bounds.min.y - MARGIN;
    const stockMaxX = bounds.max.x + MARGIN;
    const stockMaxY = bounds.max.y + MARGIN;

    // Stock Z: top at max Z (surface), bottom at min Z
    this.stockTopZ = bounds.max.z;
    this.stockBottomZ = bounds.min.z - 1; // slight extra below

    const widthMM = stockMaxX - this.stockMinX;
    const depthMM = stockMaxY - this.stockMinY;

    this.gridW = Math.ceil(widthMM / RESOLUTION) + 1;
    this.gridH = Math.ceil(depthMM / RESOLUTION) + 1;

    // Initialize heightmap to stock top Z
    this.heightmap = new Float32Array(this.gridW * this.gridH);
    this.heightmap.fill(this.stockTopZ);

    this._buildMesh(widthMM, depthMM);
  }

  /**
   * Build Three.js mesh for stock visualization.
   */
  _buildMesh(widthMM, depthMM) {
    // Top surface geometry
    const geom = new THREE.PlaneGeometry(
      widthMM, depthMM,
      this.gridW - 1, this.gridH - 1
    );

    // Rotate plane to be horizontal (XZ in Three.js space)
    // PlaneGeometry is in XY by default, we need it in XZ
    const posAttr = geom.attributes.position;
    const topCenter = gcodeToThree(
      this.stockMinX + widthMM / 2,
      this.stockMinY + depthMM / 2,
      this.stockTopZ
    );

    // Map vertices: PlaneGeometry vertex (px, py, 0) →
    //   G-code (stockMinX + gridCol*res, stockMinY + gridRow*res, heightmap[row][col])
    //   → Three.js coords
    for (let i = 0; i < posAttr.count; i++) {
      // PlaneGeometry with (gridW-1, gridH-1) segments creates gridW x gridH vertices
      const col = i % this.gridW;
      const row = Math.floor(i / this.gridW);

      const gcX = this.stockMinX + col * RESOLUTION;
      const gcY = this.stockMinY + row * RESOLUTION;
      const gcZ = this.heightmap[row * this.gridW + col];

      const p = gcodeToThree(gcX, gcY, gcZ);
      posAttr.setXYZ(i, p.x, p.y, p.z);
    }

    geom.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
      color: 0x8B7355,
      specular: 0x222222,
      shininess: 20,
      side: THREE.DoubleSide,
      flatShading: true,
    });

    this.mesh = new THREE.Mesh(geom, material);
    this.mesh.visible = this.visible;
    this.scene.add(this.mesh);

    // Build side walls
    this._buildSideWalls(widthMM, depthMM);
  }

  /**
   * Build side and bottom walls for the stock block.
   */
  _buildSideWalls(widthMM, depthMM) {
    const minP = gcodeToThree(this.stockMinX, this.stockMinY, this.stockBottomZ);
    const maxP = gcodeToThree(
      this.stockMinX + widthMM,
      this.stockMinY + depthMM,
      this.stockTopZ
    );

    // Box dimensions in Three.js space
    const cx = (minP.x + maxP.x) / 2;
    const cy = (minP.y + maxP.y) / 2;
    const cz = (minP.z + maxP.z) / 2;
    const sx = Math.abs(maxP.x - minP.x);
    const sy = Math.abs(maxP.y - minP.y);
    const sz = Math.abs(maxP.z - minP.z);

    // Use a box for sides/bottom (we'll make top face invisible via clipping or just use EdgesGeometry)
    const boxGeom = new THREE.BoxGeometry(sx, sy, sz);
    const wallMat = new THREE.MeshPhongMaterial({
      color: 0x6B5335,
      specular: 0x111111,
      shininess: 10,
      side: THREE.BackSide, // Only render inside faces (visible as walls)
      transparent: true,
      opacity: 0.6,
    });

    this.wallMesh = new THREE.Mesh(boxGeom, wallMat);
    this.wallMesh.position.set(cx, cy, cz);
    this.wallMesh.visible = this.visible;
    this.scene.add(this.wallMesh);

    // Wire outline
    const edges = new THREE.EdgesGeometry(boxGeom);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x997755, linewidth: 1 });
    this.wireframe = new THREE.LineSegments(edges, lineMat);
    this.wireframe.position.set(cx, cy, cz);
    this.wireframe.visible = this.visible;
    this.scene.add(this.wireframe);
  }

  /**
   * Process a single move, stamping tool footprint onto heightmap.
   * @param {number} index - Move index
   */
  processMoveAt(index) {
    if (!this.moves || !this.heightmap) return;
    const move = this.moves[index];
    if (!move || move.type === 'rapid') return;

    this._stampMove(move);
  }

  /**
   * Process all moves up to and including the given index.
   */
  processUpToMove(index) {
    if (!this.moves || !this.heightmap) return;
    for (let i = 0; i <= Math.min(index, this.moves.length - 1); i++) {
      const move = this.moves[i];
      if (move.type === 'rapid') continue;
      this._stampMove(move);
    }
    this._updateMesh();
  }

  /**
   * Stamp tool along a cutting move path.
   */
  _stampMove(move) {
    const dx = move.to.x - move.from.x;
    const dy = move.to.y - move.from.y;
    const dz = move.to.z - move.from.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = Math.max(1, Math.ceil(dist / (RESOLUTION / 2)));

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = move.from.x + dx * t;
      const py = move.from.y + dy * t;
      const pz = move.from.z + dz * t;

      this._stampCircle(px, py, pz);
    }
  }

  /**
   * Stamp circular tool footprint at a point.
   */
  _stampCircle(cx, cy, z) {
    const rCells = Math.ceil(this.toolRadius / RESOLUTION);
    const colCenter = (cx - this.stockMinX) / RESOLUTION;
    const rowCenter = (cy - this.stockMinY) / RESOLUTION;

    const colMin = Math.max(0, Math.floor(colCenter - rCells));
    const colMax = Math.min(this.gridW - 1, Math.ceil(colCenter + rCells));
    const rowMin = Math.max(0, Math.floor(rowCenter - rCells));
    const rowMax = Math.min(this.gridH - 1, Math.ceil(rowCenter + rCells));

    const rSq = this.toolRadius * this.toolRadius;

    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        const cellX = this.stockMinX + col * RESOLUTION;
        const cellY = this.stockMinY + row * RESOLUTION;
        const dx = cellX - cx;
        const dy = cellY - cy;
        if (dx * dx + dy * dy <= rSq) {
          const idx = row * this.gridW + col;
          this.heightmap[idx] = Math.min(this.heightmap[idx], z);
        }
      }
    }
  }

  /**
   * Update mesh vertices from heightmap.
   */
  _updateMesh() {
    if (!this.mesh) return;
    const posAttr = this.mesh.geometry.attributes.position;

    for (let i = 0; i < posAttr.count; i++) {
      const col = i % this.gridW;
      const row = Math.floor(i / this.gridW);
      const gcX = this.stockMinX + col * RESOLUTION;
      const gcY = this.stockMinY + row * RESOLUTION;
      const gcZ = this.heightmap[row * this.gridW + col];
      const p = gcodeToThree(gcX, gcY, gcZ);
      posAttr.setXYZ(i, p.x, p.y, p.z);
    }

    posAttr.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  /**
   * Reset heightmap to original stock height.
   */
  reset() {
    if (this.heightmap) {
      this.heightmap.fill(this.stockTopZ);
      this._updateMesh();
    }
  }

  /**
   * Set stock visibility.
   */
  setVisible(visible) {
    this.visible = visible;
    if (this.mesh) this.mesh.visible = visible;
    if (this.wallMesh) this.wallMesh.visible = visible;
    if (this.wireframe) this.wireframe.visible = visible;
  }

  /**
   * Remove all stock geometry from scene.
   */
  clear() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    if (this.wallMesh) {
      this.scene.remove(this.wallMesh);
      this.wallMesh.geometry.dispose();
      this.wallMesh.material.dispose();
      this.wallMesh = null;
    }
    if (this.wireframe) {
      this.scene.remove(this.wireframe);
      this.wireframe.geometry.dispose();
      this.wireframe.material.dispose();
      this.wireframe = null;
    }
    this.heightmap = null;
    this.moves = null;
  }
}
