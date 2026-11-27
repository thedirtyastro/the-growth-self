import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  Book,
  Highlight,
  ReaderAppearance,
  Rect,
} from '../../types/models';
import {
  getQualityScale,
  type PdfRenderQueue,
  type RenderedPageResult,
} from '../../lib/pdf/renderQueue';
import { useSettingsStore } from '../../store/settings';
import { useUiStore } from '../../store/ui';
import {
  getBookPatternVariant,
  type BookPatternVariant,
} from '../../lib/bookTextures';
import { HighlightLayer } from './HighlightLayer';
import { TextLayer } from './TextLayer';

interface BookSceneProps {
  book: Book;
  renderQueue: PdfRenderQueue;
  currentPage: number;
  totalPages: number;
  isFullscreen?: boolean;
  highlights: Highlight[];
  areaHighlightMode: boolean;
  closingSignal: boolean;
  onCloseComplete: () => void;
  onPageChangeRequest: (nextPage: number) => void;
  onTextLayerDetected: (hasText: boolean) => void;
  onWebglFailure: () => void;
  onTextSelected: (payload: {
    pageNumber: number;
    text: string;
    rects: Rect[];
    anchorRect: DOMRect;
  }) => void;
  onAreaSelected: (payload: {
    pageNumber: number;
    rects: Rect[];
    anchorRect: DOMRect;
  }) => void;
  onSelectHighlight: (highlight: Highlight, anchorRect: DOMRect) => void;
}

interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const PAPER_HEX: Record<ReaderAppearance, string> = {
  white: '#FFFFFF',
  warm: '#FFFDF8',
  cream: '#FAF3E3',
};

const PAGE_TURN_VERT = /* glsl */ `
  uniform float uProgress;
  uniform float uDirection; // 1.0 = forward (right->left), -1.0 = backward (left->right)
  uniform float uPageWidth;
  uniform float uHoverCurl;
  varying vec2 vUv;
  varying float vBend;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // uv.x goes 0 at spine -> 1 at outer edge
    float distFromSpine = 0.004 + uv.x * (uPageWidth - 0.004);
    float p = clamp(uProgress, 0.0, 1.0);

    // Subtle corner peel preview on hover before drag/turn starts
    float cornerFactor = pow(uv.x, 1.6) * pow(1.0 - uv.y, 1.8);
    float hoverLift = uHoverCurl * 0.06 * cornerFactor * (1.0 - p);

    // Cylindrical bend angle from 0 (right) to PI (left)
    float theta = p * 3.14159265;
    float bell = sin(theta);
    // Corner lag trails the direction of turn for realistic paper curl
    float lag = bell * (0.28 * uv.x + 0.14 * (1.0 - uv.y));
    float dirLag = uDirection > 0.0 ? -lag * (1.0 - p * 0.5) : lag * (0.5 + p * 0.5);
    float localTheta = clamp(theta + dirLag, 0.0, 3.14159265);

    // Cylindrical arc radius compression
    float radius = distFromSpine;
    float curledX = cos(localTheta) * radius;
    float curledZ = sin(localTheta) * radius + bell * 0.045 * sin(uv.x * 3.14159265) + hoverLift;

    pos.x = curledX;
    pos.z += curledZ;

    vBend = bell * (0.4 + 0.6 * uv.x);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const PAGE_TURN_FRAG = /* glsl */ `
  uniform sampler2D uFrontMap;
  uniform sampler2D uBackMap;
  uniform vec3 uPaperTint;
  uniform float uHasFront;
  uniform float uHasBack;
  varying vec2 vUv;
  varying float vBend;

  void main() {
    vec2 sampleUv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
    vec4 tex = gl_FrontFacing
      ? (uHasFront > 0.5 ? texture2D(uFrontMap, sampleUv) : vec4(uPaperTint, 1.0))
      : (uHasBack > 0.5 ? texture2D(uBackMap, sampleUv) : vec4(uPaperTint, 1.0));

    // Spine gutter (always vUv.x = 0) & cylindrical fold shading
    float gutter = smoothstep(0.0, 0.08, vUv.x);
    float foldShadow = 1.0 - vBend * 0.16 * (1.0 - vUv.x * 0.35);
    float edgeShade = mix(0.88, 1.0, gutter) * foldShadow;

    gl_FragColor = vec4(tex.rgb * uPaperTint * edgeShade, 1.0);
  }
`;

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createClothCanvasTextures(
  baseColor: string,
  variant: BookPatternVariant
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Woven bookcloth threads (pattern tailored to variant)
  const stepX = variant === 'ribbed-cloth' ? 4 : variant === 'atelier-grid' ? 8 : 3;
  const stepY = variant === 'ribbed-cloth' ? 3 : variant === 'atelier-grid' ? 8 : 3;

  for (let i = 0; i < size; i += stepX) {
    ctx.fillStyle = i % (stepX * 2) === 0 ? 'rgba(255,255,255,0.065)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(i, 0, 1, size);
    bctx.fillStyle = i % (stepX * 2) === 0 ? '#a8a8a8' : '#646464';
    bctx.fillRect(i, 0, 1, size);
  }
  for (let j = 0; j < size; j += stepY) {
    ctx.fillStyle = j % (stepY * 2) === 0 ? 'rgba(0,0,0,0.055)' : 'rgba(255,255,255,0.045)';
    ctx.fillRect(0, j, size, 1);
    bctx.fillStyle = j % (stepY * 2) === 0 ? '#5c5c5c' : '#9c9c9c';
    bctx.fillRect(0, j, size, 1);
  }

  if (variant === 'herringbone-arch') {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    bctx.strokeStyle = '#9e9e9e';
    ctx.lineWidth = 1;
    bctx.lineWidth = 1;
    for (let d = -size; d < size * 2; d += 12) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + size, size);
      ctx.stroke();
      bctx.beginPath();
      bctx.moveTo(d, 0);
      bctx.lineTo(d + size, size);
      bctx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(5, 7);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(5, 7);

  return { map, bumpMap };
}

function createPageEdgeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#EAE4D8';
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? 'rgba(130, 118, 102, 0.14)' : 'rgba(255, 253, 248, 0.25)';
    ctx.fillRect(0, y, 64, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 6);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 16, 128, 128, 124);
  grad.addColorStop(0, 'rgba(32, 31, 28, 0.36)');
  grad.addColorStop(0.55, 'rgba(32, 31, 28, 0.14)');
  grad.addColorStop(1, 'rgba(32, 31, 28, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

function makeCanvasTexture(
  sourceCanvas: HTMLCanvasElement,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(sourceCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function BookScene({
  book,
  renderQueue,
  currentPage,
  totalPages,
  isFullscreen = false,
  highlights,
  areaHighlightMode,
  closingSignal,
  onCloseComplete,
  onPageChangeRequest,
  onTextLayerDetected,
  onWebglFailure,
  onTextSelected,
  onAreaSelected,
  onSelectHighlight,
}: BookSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const settings = useSettingsStore((s) => s.settings);
  const openingTransition = useUiStore((s) => s.openingTransition);
  const setOpeningTransition = useUiStore((s) => s.setOpeningTransition);

  const leftPageNum = currentPage % 2 === 0 ? Math.max(1, currentPage - 1) : currentPage;
  const rightPageNum = leftPageNum + 1 <= totalPages ? leftPageNum + 1 : null;

  const [renderedPages, setRenderedPages] = useState<Record<number, RenderedPageResult>>({});
  const renderedPagesRef = useRef<Record<number, RenderedPageResult>>({});
  renderedPagesRef.current = renderedPages;

  const isFullscreenRef = useRef(isFullscreen);
  isFullscreenRef.current = isFullscreen;

  const [overlayBoxes, setOverlayBoxes] = useState<{
    left: ScreenBox | null;
    right: ScreenBox | null;
    atRest: boolean;
  }>({ left: null, right: null, atRest: false });

  // Latest callbacks & state in refs so WebGL scene never tears down
  const callbacksRef = useRef({
    onPageChangeRequest,
    onCloseComplete,
    onWebglFailure,
  });
  callbacksRef.current = {
    onPageChangeRequest,
    onCloseComplete,
    onWebglFailure,
  };

  const pageNumsRef = useRef({ leftPageNum, rightPageNum, totalPages });
  pageNumsRef.current = { leftPageNum, rightPageNum, totalPages };

  const sceneApiRef = useRef<{
    triggerTurn: (direction: 1 | -1) => void;
    beginEdgeDrag: (direction: 1 | -1, clientX: number) => void;
    moveEdgeDrag: (clientX: number) => void;
    endEdgeDrag: (clientX: number) => void;
    updatePageTextures: (pages: Record<number, RenderedPageResult>) => void;
    updatePaperColor: (hex: string) => void;
    updatePageThickness: (ratio: number) => void;
    updateFullscreenCamera: (full: boolean) => void;
    startClosing: () => void;
  } | null>(null);

  // Initialize Three.js WebGL scene ONCE
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const prefersReducedMotion =
      settings.animation !== 'full' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isSoftwareGl = detectSoftwareWebGL();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      callbacksRef.current.onWebglFailure();
      return;
    }

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      callbacksRef.current.onWebglFailure();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(34, width / Math.max(1, height), 0.1, 30);

    // Book dimensions: width 1.0, height 1.4 per page
    const pageW = 1.0;
    const pageH = 1.4;
    const coverMargin = 0.038;
    const coverThickness = 0.022;
    const bookThickness = Math.max(0.05, Math.min(0.16, 0.04 + totalPages * 0.00025));

    // Camera distance calibrated so open spread fills ~82% normally or ~96% in full screen
    const computeCameraZ = (aspect: number, full: boolean) => {
      const spreadWidth = pageW * 2 + coverMargin * 3;
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const fillW = full ? 0.96 : 0.82;
      const fillH = full ? 0.94 : 0.78;
      const fitW = spreadWidth / (fillW * 2 * Math.tan(vFov / 2) * aspect);
      const fitH = (pageH + coverMargin * 2) / (fillH * 2 * Math.tan(vFov / 2));
      return Math.max(full ? 2.35 : 2.9, fitW, fitH);
    };

    const targetCamZ = computeCameraZ(width / Math.max(1, height), isFullscreenRef.current);
    camera.position.set(0, isFullscreenRef.current ? -0.02 : -0.08, targetCamZ);
    camera.lookAt(0, 0, 0);

    // Lighting: warm directional key + cool hemisphere fill
    const hemi = new THREE.HemisphereLight(0xf6f8fc, 0xd8d2c6, 0.9);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5e4, 1.35);
    keyLight.position.set(1.8, 2.4, 3.2);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -2;
      keyLight.shadow.camera.right = 2;
      keyLight.shadow.camera.top = 2;
      keyLight.shadow.camera.bottom = -2;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    // Soft radial contact shadow plane behind/beneath book
    const shadowTex = createContactShadowTexture();
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.1),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    shadowPlane.position.set(0, -0.02, -0.09);
    scene.add(shadowPlane);

    // Composite Hardcover Book Group
    const bookGroup = new THREE.Group();
    scene.add(bookGroup);

    const patternVariant = getBookPatternVariant(book.id);
    const { map: clothTex, bumpMap: clothBumpTex } = createClothCanvasTextures(
      book.coverColor,
      patternVariant
    );
    const coverMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: clothTex,
      bumpMap: clothBumpTex,
      bumpScale: 0.014,
      roughness: 0.84,
      metalness: 0.05,
    });

    const pageEdgeTex = createPageEdgeTexture();
    const paperBlockMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#FAF6EE'),
      map: pageEdgeTex,
      roughness: 0.92,
      metalness: 0.0,
    });

    // Right cover board (stationary base)
    const boardGeo = new THREE.BoxGeometry(
      pageW + coverMargin,
      pageH + coverMargin * 2,
      coverThickness
    );
    const boardZ = -bookThickness - coverThickness / 2 + 0.012;
    const rightBoard = new THREE.Mesh(boardGeo, coverMaterial);
    rightBoard.position.set((pageW + coverMargin) / 2, 0, boardZ);
    rightBoard.receiveShadow = true;
    bookGroup.add(rightBoard);

    // Left cover hinge group (rotates around spine x = 0 from PI to 0 during opening!)
    const leftBoardPivot = new THREE.Group();
    leftBoardPivot.position.set(0, 0, 0);
    bookGroup.add(leftBoardPivot);

    const leftBoard = new THREE.Mesh(boardGeo, coverMaterial);
    leftBoard.position.set(-(pageW + coverMargin) / 2, 0, boardZ);
    leftBoard.receiveShadow = true;
    leftBoardPivot.add(leftBoard);

    // Rounded spine
    const spineGeo = new THREE.CylinderGeometry(
      bookThickness * 0.55,
      bookThickness * 0.55,
      pageH + coverMargin * 2,
      14,
      1,
      false,
      Math.PI / 2,
      Math.PI
    );
    const spineMesh = new THREE.Mesh(spineGeo, coverMaterial);
    spineMesh.rotation.y = Math.PI;
    spineMesh.position.set(0, 0, boardZ);
    bookGroup.add(spineMesh);

    // Page Blocks (left & right stacks)
    const blockGeo = new THREE.BoxGeometry(pageW, pageH, 1);
    const leftBlock = new THREE.Mesh(blockGeo, paperBlockMaterial);
    const rightBlock = new THREE.Mesh(blockGeo, paperBlockMaterial);
    bookGroup.add(leftBlock);
    bookGroup.add(rightBlock);

    // Resting Left & Right Page Planes (toneMapped = false for crisp ink!)
    const pageGeo = new THREE.PlaneGeometry(pageW, pageH, 1, 1);
    const leftPageMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PAPER_HEX[settings.appearance]),
      toneMapped: false,
    });
    const rightPageMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PAPER_HEX[settings.appearance]),
      toneMapped: false,
    });

    const leftPageMesh = new THREE.Mesh(pageGeo, leftPageMat);
    leftPageMesh.position.set(-pageW / 2 - 0.004, 0, 0.018);
    bookGroup.add(leftPageMesh);

    const rightPageMesh = new THREE.Mesh(pageGeo, rightPageMat);
    rightPageMesh.position.set(pageW / 2 + 0.004, 0, 0.018);
    bookGroup.add(rightPageMesh);

    // Subtle spine gutter shadow strips on resting pages for book crease depth
    const createGutterTexture = (direction: 'toRight' | 'toLeft') => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 8;
      const ctx = c.getContext('2d')!;
      const g =
        direction === 'toRight'
          ? ctx.createLinearGradient(0, 0, 64, 0)
          : ctx.createLinearGradient(64, 0, 0, 0);
      g.addColorStop(0, 'rgba(32, 31, 28, 0)');
      g.addColorStop(0.65, 'rgba(32, 31, 28, 0.04)');
      g.addColorStop(1, 'rgba(32, 31, 28, 0.16)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 8);
      return new THREE.CanvasTexture(c);
    };
    const leftGutterTex = createGutterTexture('toRight');
    const rightGutterTex = createGutterTexture('toLeft');
    const gutterGeo = new THREE.PlaneGeometry(0.11, pageH);
    const leftGutterMat = new THREE.MeshBasicMaterial({
      map: leftGutterTex,
      transparent: true,
      depthWrite: false,
    });
    const rightGutterMat = new THREE.MeshBasicMaterial({
      map: rightGutterTex,
      transparent: true,
      depthWrite: false,
    });
    const leftGutterMesh = new THREE.Mesh(gutterGeo, leftGutterMat);
    leftGutterMesh.position.set(-0.059, 0, 0.0195);
    bookGroup.add(leftGutterMesh);

    const rightGutterMesh = new THREE.Mesh(gutterGeo, rightGutterMat);
    rightGutterMesh.position.set(0.059, 0, 0.0195);
    bookGroup.add(rightGutterMesh);

    // Custom deformable PageTurnMesh (48 x 24 segments for diagonal corner curl, anchored at spine)
    const turnGeo = new THREE.PlaneGeometry(pageW, pageH, 48, 24);
    turnGeo.translate(pageW / 2 + 0.004, 0, 0); // x runs 0.004..pageW+0.004

    const turnMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uProgress: { value: 0 },
        uDirection: { value: 1 },
        uPageWidth: { value: pageW + 0.004 },
        uHoverCurl: { value: 0 },
        uFrontMap: { value: null },
        uBackMap: { value: null },
        uHasFront: { value: 0 },
        uHasBack: { value: 0 },
        uPaperTint: { value: new THREE.Color(PAPER_HEX[settings.appearance]) },
      },
      vertexShader: PAGE_TURN_VERT,
      fragmentShader: PAGE_TURN_FRAG,
    });

    const turnMesh = new THREE.Mesh(turnGeo, turnMat);
    turnMesh.position.set(0, 0, 0.022);
    turnMesh.visible = false;
    bookGroup.add(turnMesh);

    // Texture cache for Three.js CanvasTextures
    const threeTexCache = new Map<number, THREE.CanvasTexture>();

    const getOrCreateTex = (pageNum: number, pages: Record<number, RenderedPageResult>) => {
      const entry = pages[pageNum];
      if (!entry) return null;
      const existing = threeTexCache.get(pageNum);
      if (existing && existing.image === entry.canvas) {
        return existing;
      }
      if (existing) existing.dispose();
      const tex = makeCanvasTexture(entry.canvas, maxAniso);
      threeTexCache.set(pageNum, tex);
      return tex;
    };

    // Projection helper for hybrid DOM TextLayer alignment
    const _v = new THREE.Vector3();
    const projectMeshRect = (mesh: THREE.Mesh): ScreenBox | null => {
      mesh.updateWorldMatrix(true, false);
      const hw = pageW / 2;
      const hh = pageH / 2;
      const corners = [
        _v.set(-hw, hh, 0).clone().applyMatrix4(mesh.matrixWorld).project(camera),
        _v.set(hw, hh, 0).clone().applyMatrix4(mesh.matrixWorld).project(camera),
        _v.set(-hw, -hh, 0).clone().applyMatrix4(mesh.matrixWorld).project(camera),
        _v.set(hw, -hh, 0).clone().applyMatrix4(mesh.matrixWorld).project(camera),
      ];
      const rect = renderer.domElement.getBoundingClientRect();
      const xs = corners.map((c) => rect.left + ((c.x + 1) / 2) * rect.width);
      const ys = corners.map((c) => rect.top + ((1 - c.y) / 2) * rect.height);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const w = maxX - minX;
      const h = maxY - minY;
      if (w < 40 || h < 40) return null;
      return { left: minX, top: minY, width: w, height: h };
    };

    const syncOverlayBoxes = (atRest: boolean) => {
      if (!atRest) {
        setOverlayBoxes((prev) => (prev.atRest ? { ...prev, atRest: false } : prev));
        return;
      }
      const left = projectMeshRect(leftPageMesh);
      const right = pageNumsRef.current.rightPageNum
        ? projectMeshRect(rightPageMesh)
        : null;
      setOverlayBoxes({ left, right, atRest: true });
    };

    // Animation state machine: only animate cover opening when entering from shelf/detail transition
    const shouldAnimateOpen = Boolean(openingTransition) && !prefersReducedMotion;
    let animMode: 'opening' | 'idle' | 'turning' | 'dragging' | 'closing' =
      shouldAnimateOpen ? 'opening' : 'idle';
    let animStartMs = performance.now();
    const openDuration = openingTransition?.isFirstOpen ? 1.25 : 0.6;
    let turnProgress = 0;
    let turnTarget = 0;
    let turnDir: 1 | -1 = 1;
    let hoverCurl = 0;
    let hoverCurlTarget = 0;

    if (animMode === 'opening') {
      // Start closed and slightly angled
      leftBoardPivot.rotation.y = Math.PI * 0.96;
      leftPageMesh.visible = false;
      leftBlock.visible = false;
      leftGutterMesh.visible = false;
      bookGroup.rotation.y = -0.25;
      bookGroup.scale.setScalar(0.88);
    } else {
      leftBoardPivot.rotation.y = 0;
      bookGroup.rotation.y = 0;
      bookGroup.scale.setScalar(1);
      leftPageMesh.visible = true;
      leftBlock.visible = true;
      leftGutterMesh.visible = true;
      if (openingTransition) {
        setOpeningTransition(null);
      }
    }

    // Paced render scheduler (bounds CPU on SwiftShader without blocking on fenceSync)
    let rafId = 0;
    let timerId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();
    let disposed = false;

    const stepFrame = () => {
      if (disposed) return;
      renderDirty = false;
      const now = performance.now();
      const dt = Math.min(0.08, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      let keepAnimating = false;

      if (animMode === 'opening') {
        const elapsed = (now - animStartMs) / 1000;
        const t = Math.min(1, elapsed / openDuration);
        const eased = 1 - Math.pow(1 - t, 3);
        bookGroup.rotation.y = THREE.MathUtils.lerp(-0.25, 0, eased);
        bookGroup.scale.setScalar(THREE.MathUtils.lerp(0.88, 1, eased));
        const openT = THREE.MathUtils.clamp((t - 0.2) / 0.8, 0, 1);
        const openEase = 1 - Math.pow(1 - openT, 3);
        leftBoardPivot.rotation.y = Math.PI * (1 - openEase);
        if (openT > 0.45) {
          leftPageMesh.visible = true;
          leftBlock.visible = true;
          leftGutterMesh.visible = true;
        }
        if (t >= 1) {
          animMode = 'idle';
          leftBoardPivot.rotation.y = 0;
          bookGroup.rotation.y = 0;
          bookGroup.scale.setScalar(1);
          leftPageMesh.visible = true;
          leftBlock.visible = true;
          leftGutterMesh.visible = true;
          setOpeningTransition(null);
          syncOverlayBoxes(true);
        } else {
          keepAnimating = true;
        }
      } else if (animMode === 'closing') {
        const elapsed = (now - animStartMs) / 1000;
        const closeDur = prefersReducedMotion ? 0.15 : 0.75;
        const t = Math.min(1, elapsed / closeDur);
        const eased = 1 - Math.pow(1 - t, 3);
        leftBoardPivot.rotation.y = Math.PI * eased;
        if (t > 0.4) {
          leftPageMesh.visible = false;
          leftBlock.visible = false;
          leftGutterMesh.visible = false;
        }
        bookGroup.scale.setScalar(THREE.MathUtils.lerp(1, 0.88, eased));
        if (t >= 1) {
          callbacksRef.current.onCloseComplete();
          return;
        }
        keepAnimating = true;
      } else if (animMode === 'turning') {
        const speed = prefersReducedMotion ? 18 : isSoftwareGl ? 10 : 7.5;
        turnProgress = THREE.MathUtils.damp(turnProgress, turnTarget, speed, dt);
        turnMat.uniforms.uProgress.value = turnProgress;
        if (Math.abs(turnProgress - turnTarget) < 0.015) {
          const completedTurn =
            (turnTarget === 1 && turnDir === 1) || (turnTarget === 0 && turnDir === -1);
          animMode = 'idle';
          if (completedTurn) {
            const { leftPageNum: lp, totalPages: tp } = pageNumsRef.current;
            const next = turnDir === 1 ? Math.min(tp, lp + 2) : Math.max(1, lp - 2);
            const nextLeftNum = next % 2 === 0 ? Math.max(1, next - 1) : next;
            const nextRightNum = nextLeftNum + 1 <= tp ? nextLeftNum + 1 : null;
            const nlTex = getOrCreateTex(nextLeftNum, renderedPagesRef.current);
            if (nlTex) {
              leftPageMat.map = nlTex;
              leftPageMat.needsUpdate = true;
            }
            if (nextRightNum) {
              const nrTex = getOrCreateTex(nextRightNum, renderedPagesRef.current);
              if (nrTex) {
                rightPageMat.map = nrTex;
                rightPageMat.needsUpdate = true;
              }
              rightPageMesh.visible = true;
              rightGutterMesh.visible = true;
            } else {
              rightPageMesh.visible = false;
              rightGutterMesh.visible = false;
            }
            turnMesh.visible = false;
            callbacksRef.current.onPageChangeRequest(next);
          } else {
            // Cancelled drag-turn restored original pages
            const { leftPageNum: lp, rightPageNum: rp } = pageNumsRef.current;
            const lTex = getOrCreateTex(lp, renderedPagesRef.current);
            if (lTex) {
              leftPageMat.map = lTex;
              leftPageMat.needsUpdate = true;
            }
            if (rp) {
              const rTex = getOrCreateTex(rp, renderedPagesRef.current);
              if (rTex) {
                rightPageMat.map = rTex;
                rightPageMat.needsUpdate = true;
              }
            }
            turnMesh.visible = false;
          }
          syncOverlayBoxes(true);
        } else {
          keepAnimating = true;
        }
      } else if (animMode === 'dragging') {
        turnMat.uniforms.uProgress.value = turnProgress;
      } else {
        // Idle hover curl smoothing
        if (Math.abs(hoverCurl - hoverCurlTarget) > 0.005) {
          hoverCurl = THREE.MathUtils.damp(hoverCurl, hoverCurlTarget, 12, dt);
          turnMat.uniforms.uHoverCurl.value = hoverCurl;
          turnMesh.visible = hoverCurl > 0.01;
          keepAnimating = true;
        } else if (hoverCurlTarget === 0) {
          turnMesh.visible = false;
        }
      }

      renderer.render(scene, camera);

      const finish = () => {
        renderBusy = false;
        if (keepAnimating || renderDirty) {
          requestRender();
        }
      };

      if (isSoftwareGl && keepAnimating) {
        timerId = window.setTimeout(finish, 24);
      } else {
        finish();
      }
    };

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      rafId = requestAnimationFrame(stepFrame);
    }

    // Pointer interaction for dragging & clicking page edges
    let dragPointerId: number | null = null;
    let dragStartX = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (animMode !== 'idle') return;
      const rect = renderer.domElement.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
      // Right 22% starts forward drag turn
      if (relX > 0.78 && (pageNumsRef.current.rightPageNum ?? pageNumsRef.current.leftPageNum) < pageNumsRef.current.totalPages) {
        dragPointerId = e.pointerId;
        dragStartX = e.clientX;
        turnDir = 1;
        turnProgress = 0.02;
        turnMat.uniforms.uDirection.value = 1;
        turnMat.uniforms.uProgress.value = turnProgress;
        turnMat.uniforms.uFrontMap.value = rightPageMat.map;
        turnMat.uniforms.uHasFront.value = rightPageMat.map ? 1 : 0;
        turnMesh.visible = true;
        animMode = 'dragging';
        syncOverlayBoxes(false);
        renderer.domElement.setPointerCapture(e.pointerId);
        requestRender();
      } else if (relX < 0.22 && pageNumsRef.current.leftPageNum > 1) {
        // Left edge click/drag turns backward
        dragPointerId = e.pointerId;
        dragStartX = e.clientX;
        turnDir = -1;
        turnProgress = 0.98;
        turnMat.uniforms.uDirection.value = -1;
        turnMat.uniforms.uProgress.value = turnProgress;
        turnMat.uniforms.uBackMap.value = leftPageMat.map;
        turnMat.uniforms.uHasBack.value = leftPageMat.map ? 1 : 0;
        turnMesh.visible = true;
        animMode = 'dragging';
        syncOverlayBoxes(false);
        renderer.domElement.setPointerCapture(e.pointerId);
        requestRender();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
      const relY = (e.clientY - rect.top) / Math.max(1, rect.height);

      if (animMode === 'dragging' && dragPointerId === e.pointerId) {
        const span = Math.max(180, rect.width * 0.45);
        if (turnDir === 1) {
          turnProgress = THREE.MathUtils.clamp((dragStartX - e.clientX) / span, 0.02, 0.99);
        } else {
          turnProgress = THREE.MathUtils.clamp(1 - (e.clientX - dragStartX) / span, 0.01, 0.98);
        }
        requestRender();
        return;
      }

      if (animMode === 'idle') {
        const nearCorner = relX > 0.72 && relY > 0.65;
        const nextHover = nearCorner ? 1 : 0;
        if (nextHover !== hoverCurlTarget) {
          hoverCurlTarget = nextHover;
          if (nextHover === 1) {
            turnMat.uniforms.uFrontMap.value = rightPageMat.map;
            turnMat.uniforms.uHasFront.value = rightPageMat.map ? 1 : 0;
          }
          requestRender();
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (animMode !== 'dragging' || dragPointerId !== e.pointerId) return;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId);
      }
      dragPointerId = null;

      // Simple click (<12px movement) completes the turn; drag checks 45% threshold
      const moved = Math.abs(e.clientX - dragStartX);
      if (turnDir === 1) {
        turnTarget = moved < 12 || turnProgress >= 0.45 ? 1 : 0;
      } else {
        turnTarget = moved < 12 || turnProgress <= 0.55 ? 0 : 1;
      }
      animMode = 'turning';
      requestRender();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!mount || disposed) return;
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / Math.max(1, h);
      camera.position.z = computeCameraZ(camera.aspect, isFullscreenRef.current);
      camera.position.y = isFullscreenRef.current ? -0.02 : -0.08;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
      if (animMode === 'idle') {
        window.setTimeout(() => syncOverlayBoxes(true), 60);
      }
    };
    window.addEventListener('resize', onResize);

    const prepareTurnTextures = (direction: 1 | -1) => {
      const { leftPageNum: lp, rightPageNum: rp } = pageNumsRef.current;
      if (direction === 1) {
        turnMat.uniforms.uFrontMap.value = rightPageMat.map;
        turnMat.uniforms.uHasFront.value = rightPageMat.map ? 1 : 0;
        const backTex = getOrCreateTex(lp + 2, renderedPagesRef.current);
        turnMat.uniforms.uBackMap.value = backTex;
        turnMat.uniforms.uHasBack.value = backTex ? 1 : 0;
        if (rp) {
          const nextRight = getOrCreateTex(lp + 3, renderedPagesRef.current);
          if (nextRight) {
            rightPageMat.map = nextRight;
            rightPageMat.needsUpdate = true;
          }
        }
      } else {
        const frontTex = getOrCreateTex(lp - 1, renderedPagesRef.current);
        turnMat.uniforms.uFrontMap.value = frontTex;
        turnMat.uniforms.uHasFront.value = frontTex ? 1 : 0;
        turnMat.uniforms.uBackMap.value = leftPageMat.map;
        turnMat.uniforms.uHasBack.value = leftPageMat.map ? 1 : 0;
        const prevLeft = getOrCreateTex(Math.max(1, lp - 2), renderedPagesRef.current);
        if (prevLeft && lp > 2) {
          leftPageMat.map = prevLeft;
          leftPageMat.needsUpdate = true;
        }
      }
    };

    const startTurnInternal = (direction: 1 | -1) => {
      if (animMode === 'closing' || animMode === 'opening') return;
      if (animMode === 'turning') {
        // Snap pending turn to completion before chaining the next flip
        turnMesh.visible = false;
        const { leftPageNum: lp, totalPages: tp } = pageNumsRef.current;
        const committed = turnDir === 1 ? Math.min(tp, lp + 2) : Math.max(1, lp - 2);
        animMode = 'idle';
        callbacksRef.current.onPageChangeRequest(committed);
        return;
      }
      if (prefersReducedMotion || settings.animation === 'off') {
        const { leftPageNum: lp, totalPages: tp } = pageNumsRef.current;
        const next = direction === 1 ? Math.min(tp, lp + 2) : Math.max(1, lp - 2);
        callbacksRef.current.onPageChangeRequest(next);
        return;
      }
      turnDir = direction;
      if (direction === 1) {
        turnProgress = 0.02;
        turnTarget = 1;
      } else {
        turnProgress = 0.98;
        turnTarget = 0;
      }
      prepareTurnTextures(direction);
      turnMat.uniforms.uDirection.value = direction;
      turnMat.uniforms.uProgress.value = turnProgress;
      turnMat.uniforms.uHoverCurl.value = 0;
      hoverCurl = 0;
      hoverCurlTarget = 0;
      turnMesh.visible = true;
      animMode = 'turning';
      syncOverlayBoxes(false);
      requestRender();
    };

    let edgeDragStartX = 0;

    // Expose imperative controls for React props/events
    sceneApiRef.current = {
      triggerTurn: startTurnInternal,

      beginEdgeDrag: (direction: 1 | -1, clientX: number) => {
        if (animMode !== 'idle') return;
        if (prefersReducedMotion || settings.animation === 'off') {
          startTurnInternal(direction);
          return;
        }
        edgeDragStartX = clientX;
        turnDir = direction;
        turnProgress = direction === 1 ? 0.03 : 0.97;
        prepareTurnTextures(direction);
        turnMat.uniforms.uDirection.value = direction;
        turnMat.uniforms.uProgress.value = turnProgress;
        turnMesh.visible = true;
        animMode = 'dragging';
        syncOverlayBoxes(false);
        requestRender();

        const onWindowMove = (ev: PointerEvent) => {
          sceneApiRef.current?.moveEdgeDrag(ev.clientX);
        };
        const onWindowUp = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', onWindowMove);
          window.removeEventListener('pointerup', onWindowUp);
          window.removeEventListener('pointercancel', onWindowUp);
          sceneApiRef.current?.endEdgeDrag(ev.clientX);
        };
        window.addEventListener('pointermove', onWindowMove);
        window.addEventListener('pointerup', onWindowUp);
        window.addEventListener('pointercancel', onWindowUp);
      },

      moveEdgeDrag: (clientX: number) => {
        if (animMode !== 'dragging') return;
        const rect = renderer.domElement.getBoundingClientRect();
        const span = Math.max(180, rect.width * 0.42);
        if (turnDir === 1) {
          turnProgress = THREE.MathUtils.clamp((edgeDragStartX - clientX) / span, 0.03, 0.99);
        } else {
          turnProgress = THREE.MathUtils.clamp(1 - (clientX - edgeDragStartX) / span, 0.01, 0.97);
        }
        requestRender();
      },

      endEdgeDrag: (clientX: number) => {
        if (animMode !== 'dragging') return;
        const moved = Math.abs(clientX - edgeDragStartX);
        if (turnDir === 1) {
          turnTarget = moved < 14 || turnProgress >= 0.42 ? 1 : 0;
        } else {
          turnTarget = moved < 14 || turnProgress <= 0.58 ? 0 : 1;
        }
        animMode = 'turning';
        requestRender();
      },

      updatePageTextures: (pages) => {
        const { leftPageNum: lp, rightPageNum: rp } = pageNumsRef.current;
        const lTex = getOrCreateTex(lp, pages);
        if (lTex) {
          leftPageMat.map = lTex;
          leftPageMat.needsUpdate = true;
        }
        if (rp) {
          const rTex = getOrCreateTex(rp, pages);
          if (rTex) {
            rightPageMat.map = rTex;
            rightPageMat.needsUpdate = true;
          }
          rightPageMesh.visible = true;
          rightGutterMesh.visible = true;
        } else {
          rightPageMesh.visible = false;
          rightGutterMesh.visible = false;
        }
        requestRender();
        if (animMode === 'idle') {
          syncOverlayBoxes(true);
        }
      },

      updatePaperColor: (hex) => {
        const col = new THREE.Color(hex);
        leftPageMat.color.copy(col);
        rightPageMat.color.copy(col);
        turnMat.uniforms.uPaperTint.value.copy(col);
        requestRender();
      },

      updatePageThickness: (ratio) => {
        const leftDepth = Math.max(0.012, bookThickness * ratio);
        const rightDepth = Math.max(0.012, bookThickness * (1 - ratio * 0.85));
        leftBlock.scale.z = leftDepth;
        leftBlock.position.set(-pageW / 2 - 0.004, 0, -leftDepth / 2 + 0.016);
        leftPageMesh.position.z = 0.018;

        rightBlock.scale.z = rightDepth;
        rightBlock.position.set(pageW / 2 + 0.004, 0, -rightDepth / 2 + 0.016);
        rightPageMesh.position.z = 0.018;
        requestRender();
      },

      updateFullscreenCamera: (full: boolean) => {
        const w = mount.clientWidth || window.innerWidth;
        const h = mount.clientHeight || window.innerHeight;
        camera.aspect = w / Math.max(1, h);
        camera.position.z = computeCameraZ(camera.aspect, full);
        camera.position.y = full ? -0.02 : -0.08;
        camera.updateProjectionMatrix();
        requestRender();
        if (animMode === 'idle') {
          window.setTimeout(() => syncOverlayBoxes(true), 60);
        }
      },

      startClosing: () => {
        animMode = 'closing';
        animStartMs = performance.now();
        syncOverlayBoxes(false);
        requestRender();
      },
    };

    // Initial render & sync existing textures if scene recreated
    sceneApiRef.current.updatePageThickness(currentPage / Math.max(1, totalPages));
    if (Object.keys(renderedPagesRef.current).length > 0) {
      sceneApiRef.current.updatePageTextures(renderedPagesRef.current);
    }
    requestRender();
    if (animMode === 'idle') {
      syncOverlayBoxes(true);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);

      for (const tex of threeTexCache.values()) {
        tex.dispose();
      }
      threeTexCache.clear();
      clothTex.dispose();
      clothBumpTex.dispose();
      pageEdgeTex.dispose();
      shadowTex.dispose();
      leftGutterTex.dispose();
      rightGutterTex.dispose();
      envTex.dispose();

      boardGeo.dispose();
      spineGeo.dispose();
      blockGeo.dispose();
      pageGeo.dispose();
      gutterGeo.dispose();
      turnGeo.dispose();
      shadowPlane.geometry.dispose();
      (shadowPlane.material as THREE.Material).dispose();

      coverMaterial.dispose();
      paperBlockMaterial.dispose();
      leftPageMat.dispose();
      rightPageMat.dispose();
      leftGutterMat.dispose();
      rightGutterMat.dispose();
      turnMat.dispose();

      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      sceneApiRef.current = null;
    };
  }, [book.id, book.coverColor]);

  // Sync fullscreen camera framing, appearance & thickness updates
  useEffect(() => {
    sceneApiRef.current?.updateFullscreenCamera(isFullscreen);
  }, [isFullscreen]);

  useEffect(() => {
    sceneApiRef.current?.updatePaperColor(PAPER_HEX[settings.appearance]);
  }, [settings.appearance]);

  useEffect(() => {
    sceneApiRef.current?.updatePageThickness(currentPage / Math.max(1, totalPages));
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (closingSignal) {
      sceneApiRef.current?.startClosing();
    }
  }, [closingSignal]);

  // Keep WebGL textures synced cleanly outside state updaters
  useEffect(() => {
    if (renderedPages[leftPageNum] || (rightPageNum && renderedPages[rightPageNum])) {
      sceneApiRef.current?.updatePageTextures(renderedPages);
    }
  }, [renderedPages, leftPageNum, rightPageNum]);

  // Load PDF textures for active spread + preload neighbors so page flips show ink on both sides
  const targetScale = getQualityScale(settings.quality, 1);

  useEffect(() => {
    let active = true;
    const needed = new Set<number>([leftPageNum]);
    if (rightPageNum) needed.add(rightPageNum);
    renderQueue.cancelExcept(needed);

    const loadSpread = async () => {
      try {
        const tasks: Array<Promise<RenderedPageResult>> = [
          renderQueue.renderPage(leftPageNum, targetScale),
        ];
        if (rightPageNum) {
          tasks.push(renderQueue.renderPage(rightPageNum, targetScale));
        }
        const results = await Promise.all(tasks);
        if (!active) return;

        setRenderedPages((prev) => {
          const next = { ...prev };
          for (const r of results) next[r.pageNumber] = r;
          return next;
        });

        onTextLayerDetected(results.some((r) => r.hasTextLayer));

        // Preload adjacent spreads & store rendered canvases so flipping shows real ink immediately
        const neighbors = [
          leftPageNum - 1,
          leftPageNum - 2,
          (rightPageNum ?? leftPageNum) + 1,
          (rightPageNum ?? leftPageNum) + 2,
        ].filter((p) => p >= 1 && p <= totalPages);

        const neighborScale = Math.min(1.35, targetScale);
        for (const np of neighbors) {
          void renderQueue
            .renderPage(np, neighborScale, { skipText: true })
            .then((nRes) => {
              if (!active) return;
              setRenderedPages((prev) =>
                prev[nRes.pageNumber] ? prev : { ...prev, [nRes.pageNumber]: nRes }
              );
            })
            .catch(() => {});
        }
      } catch {
        // Ignore cancelled task
      }
    };

    void loadSpread();
    return () => {
      active = false;
    };
  }, [leftPageNum, rightPageNum, totalPages, targetScale, renderQueue, onTextLayerDetected]);

  // Keyboard arrow turns animate the 3D shader page turn when resting
  useEffect(() => {
    const onTurnEvent = (e: Event) => {
      const dir = (e as CustomEvent<{ dir: 1 | -1 }>).detail.dir;
      sceneApiRef.current?.triggerTurn(dir);
    };
    window.addEventListener('growth-shelf-3d-turn', onTurnEvent);
    return () => window.removeEventListener('growth-shelf-3d-turn', onTurnEvent);
  }, []);

  const leftHighlights = useMemo(
    () => highlights.filter((h) => h.pageNumber === leftPageNum),
    [highlights, leftPageNum]
  );
  const rightHighlights = useMemo(
    () => (rightPageNum ? highlights.filter((h) => h.pageNumber === rightPageNum) : []),
    [highlights, rightPageNum]
  );

  const zoomScale =
    settings.textZoom === 100
      ? 1
      : settings.textZoom === 125
        ? 1.08
        : settings.textZoom === 150
          ? 1.16
          : 1.24;

  return (
    <div
      data-testid="3d-book-scene"
      className="relative h-screen w-screen overflow-hidden"
    >
      {/* Dedicated isolated WebGL mount ref */}
      <div
        ref={mountRef}
        className="absolute inset-0 transition-transform duration-200"
        style={{ transform: `scale(${zoomScale})` }}
      />

      {/* Hybrid TextLayer + HighlightLayer aligned to projected page corners at rest */}
      {overlayBoxes.atRest && overlayBoxes.left && renderedPages[leftPageNum] && (
        <div
          style={{
            left: `${overlayBoxes.left.left}px`,
            top: `${overlayBoxes.left.top}px`,
            width: `${overlayBoxes.left.width}px`,
            height: `${overlayBoxes.left.height}px`,
            containerType: 'size',
          }}
          className="fixed z-10 overflow-hidden"
        >
          <HighlightLayer
            highlights={leftHighlights}
            onSelectHighlight={onSelectHighlight}
          />
          <TextLayer
            pageNumber={leftPageNum}
            textItems={renderedPages[leftPageNum].textItems}
            hasTextLayer={renderedPages[leftPageNum].hasTextLayer}
            areaMode={areaHighlightMode}
            onTextSelected={onTextSelected}
            onAreaSelected={onAreaSelected}
          />
        </div>
      )}

      {overlayBoxes.atRest &&
        overlayBoxes.right &&
        rightPageNum &&
        renderedPages[rightPageNum] && (
          <div
            style={{
              left: `${overlayBoxes.right.left}px`,
              top: `${overlayBoxes.right.top}px`,
              width: `${overlayBoxes.right.width}px`,
              height: `${overlayBoxes.right.height}px`,
              containerType: 'size',
            }}
            className="fixed z-10 overflow-hidden"
          >
            <HighlightLayer
              highlights={rightHighlights}
              onSelectHighlight={onSelectHighlight}
            />
            <TextLayer
              pageNumber={rightPageNum}
              textItems={renderedPages[rightPageNum].textItems}
              hasTextLayer={renderedPages[rightPageNum].hasTextLayer}
              areaMode={areaHighlightMode}
              onTextSelected={onTextSelected}
              onAreaSelected={onAreaSelected}
            />
          </div>
        )}

      {/* Outer edge click/drag flip zones over the book margins (never blocks reading text) */}
      {overlayBoxes.atRest && !areaHighlightMode && overlayBoxes.left && leftPageNum > 1 && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drag or click left margin to turn to previous page"
          onPointerDown={(e) => {
            e.preventDefault();
            sceneApiRef.current?.beginEdgeDrag(-1, e.clientX);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              sceneApiRef.current?.triggerTurn(-1);
            }
          }}
          style={{
            left: `${overlayBoxes.left.left}px`,
            top: `${overlayBoxes.left.top}px`,
            width: '44px',
            height: `${overlayBoxes.left.height}px`,
          }}
          className="fixed z-20 cursor-pointer opacity-0 hover:opacity-100 transition-opacity bg-gradient-to-r from-black/[0.04] to-transparent"
        />
      )}

      {overlayBoxes.atRest &&
        !areaHighlightMode &&
        overlayBoxes.right &&
        (rightPageNum ?? leftPageNum) < totalPages && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Drag or click right margin to turn to next page"
            onPointerDown={(e) => {
              e.preventDefault();
              sceneApiRef.current?.beginEdgeDrag(1, e.clientX);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                sceneApiRef.current?.triggerTurn(1);
              }
            }}
            style={{
              left: `${overlayBoxes.right.left + overlayBoxes.right.width - 48}px`,
              top: `${overlayBoxes.right.top}px`,
              width: '48px',
              height: `${overlayBoxes.right.height}px`,
            }}
            className="fixed z-20 cursor-pointer opacity-0 hover:opacity-100 transition-opacity bg-gradient-to-l from-black/[0.04] to-transparent"
          />
        )}
    </div>
  );
}
