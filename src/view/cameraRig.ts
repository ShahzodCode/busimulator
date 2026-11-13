import * as THREE from 'three';

/**
 * Top-down diorama camera: fixed pitch/yaw, drag to pan, wheel or pinch to zoom.
 * Movement is smoothed so everything glides.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private target = new THREE.Vector3(0, 0, 2);
  private goal = this.target.clone();
  private dist = 330;
  private goalDist = 250;
  private readonly pitch = THREE.MathUtils.degToRad(52);
  private yaw = THREE.MathUtils.degToRad(-20);
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchStart = 0;
  private pinchDist = 0;
  minDist = 30;
  maxDist = 320;
  /** how far the focus point may be dragged from the map centre */
  boundsX = 30;
  boundsZ = 30;
  private centreX = 0;
  private mapHalf: { x: number; z: number } | null = null;
  /** the player has chosen their own zoom */
  private zoomed = false;
  private framed = false;
  private centreZ = 0;

  constructor(private readonly el: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 1200);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    // portrait phones: turn the view so the loop's long side runs up the screen
    const portrait = w < h;
    this.camera.fov = portrait ? 46 : 32;
    this.yaw = THREE.MathUtils.degToRad(portrait ? -72 : -20);
    this.camera.updateProjectionMatrix();
    this.frame();
  }

  /** Frame a map of the given centre and half-size: start on all of it, allow panning to its edges. */
  fit(centre: { x: number; z: number }, half: { x: number; z: number }): void {
    this.centreX = centre.x;
    this.centreZ = centre.z;
    this.boundsX = half.x * 0.85;
    this.boundsZ = half.z * 0.85;
    this.goal.set(centre.x, 0, centre.z + 2);
    this.target.copy(this.goal);
    this.mapHalf = half;
    this.frame();
  }

  /** Set the zoom limits for the map; until the player zooms, keep the whole map in view. */
  private frame(): void {
    const half = this.mapHalf;
    const aspect = this.camera.aspect;
    if (!half || !(aspect > 0) || !Number.isFinite(aspect)) return;
    // the long side of the map runs along the long side of the screen (see resize)
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const long = Math.max(half.x, half.z) * 2;
    const short = Math.min(half.x, half.z) * 2;
    const across = (aspect >= 1 ? long : short) / (2 * tan * aspect);
    const upDown = ((aspect >= 1 ? short : long) * Math.sin(this.pitch)) / (2 * tan);
    const whole = Math.max(across, upDown) * 1.08;
    this.maxDist = whole * 1.1;
    if (!this.zoomed) {
      this.goalDist = whole;
      if (!this.framed) this.dist = whole * 1.3;
      this.framed = true;
    }
    this.goalDist = Math.min(this.goalDist, this.maxDist);
  }

  /** where the camera is looking, and from how far (for shadows that follow the view) */
  get focus(): THREE.Vector3 {
    return this.target;
  }

  get distance(): number {
    return this.dist;
  }

  /** world units per screen pixel at the focus point, for 1:1 dragging */
  private unitsPerPixel(): number {
    const h = 2 * this.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return h / this.el.clientHeight;
  }

  private onDown = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      this.pinchStart = this.pinchSpan();
      this.pinchDist = this.goalDist;
    }
  };

  private pinchSpan(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const span = this.pinchSpan();
      this.zoomed = true;
      if (this.pinchStart > 0) this.goalDist = THREE.MathUtils.clamp((this.pinchDist * this.pinchStart) / span, this.minDist, this.maxDist);
      return;
    }
    const u = this.unitsPerPixel();
    // screen axes projected onto the ground, accounting for yaw
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const gx = -dx * u;
    const gz = (-dy * u) / Math.sin(this.pitch);
    this.goal.x += gx * cos - gz * sin;
    this.goal.z += gx * sin + gz * cos;
    this.goal.x = THREE.MathUtils.clamp(this.goal.x, this.centreX - this.boundsX, this.centreX + this.boundsX);
    this.goal.z = THREE.MathUtils.clamp(this.goal.z, this.centreZ - this.boundsZ, this.centreZ + this.boundsZ);
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.pinchStart = 0;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomed = true;
    this.goalDist = THREE.MathUtils.clamp(this.goalDist * Math.exp(e.deltaY * 0.0012), this.minDist, this.maxDist);
  };

  update(dt: number): void {
    const f = 1 - Math.exp(-dt * 8);
    this.target.lerp(this.goal, f);
    this.dist += (this.goalDist - this.dist) * (1 - Math.exp(-dt * 4));
    const horiz = this.dist * Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x - Math.sin(this.yaw) * horiz,
      this.target.y + this.dist * Math.sin(this.pitch),
      this.target.z + Math.cos(this.yaw) * horiz,
    );
    this.camera.lookAt(this.target);
  }
}
