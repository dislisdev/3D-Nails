import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, RotateCcw, Layers, Move3D, MapPin } from "lucide-react";
import type { Generation } from "./types";
import { t } from "./i18n";

type Props = { model?: Generation; comparison?: Generation };
export default function Viewer({ model, comparison }: Props) {
  const element = useRef<HTMLDivElement>(null),
    controls = useRef<OrbitControls | null>(null),
    camera = useRef<THREE.PerspectiveCamera | null>(null),
    size = useRef(20);
  const [landmarks, setLandmarks] = useState(false),
    [axes, setAxes] = useState(false),
    [wireframe, setWireframe] = useState(false),
    [compare, setCompare] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!element.current || !model?.mesh?.vertices?.length) return;
    const container = element.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      setError(
        "WebGL is unavailable. CAD downloads and the validation report remain available.",
      );
      return;
    }
    setError("");
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0xf1ece7, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(
      35,
      container.clientWidth / container.clientHeight,
      0.01,
      10000,
    );
    camera.current = cam;
    const orbit = new OrbitControls(cam, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    controls.current = orbit;
    const objects: THREE.Mesh[] = [];
    const makeMesh = (generation: Generation, ghost = false) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(generation.mesh.vertices.flat(), 3),
      );
      geometry.setIndex(generation.mesh.faces.flat());
      geometry.computeVertexNormals();
      const material = new THREE.MeshPhysicalMaterial({
        color: ghost ? 0x686f69 : 0xc88f9a,
        roughness: 0.27,
        metalness: 0.08,
        clearcoat: 0.7,
        clearcoatRoughness: 0.25,
        side: THREE.DoubleSide,
        wireframe: ghost || wireframe,
        transparent: ghost,
        opacity: ghost ? 0.45 : 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      objects.push(mesh);
      scene.add(mesh);
      return mesh;
    };
    const mesh = makeMesh(model);
    const bounds = new THREE.Box3().setFromObject(mesh),
      center = bounds.getCenter(new THREE.Vector3()),
      extent = bounds.getSize(new THREE.Vector3());
    size.current = Math.max(extent.x, extent.y, extent.z);
    const d = size.current;
    cam.up.set(0, 0, 1);
    cam.position.set(
      center.x + d * 1.3,
      center.y - d * 1.35,
      center.z + d * 1.3,
    );
    cam.lookAt(center);
    orbit.target.copy(center);
    orbit.minDistance = d * 0.2;
    orbit.maxDistance = d * 8;
    orbit.update();
    if (compare && comparison?.mesh?.vertices) makeMesh(comparison, true);
    scene.add(new THREE.HemisphereLight(0xfffaf5, 0x74666b, 3));
    const key = new THREE.DirectionalLight(0xfff6e9, 4);
    key.position.set(d, -d, d * 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 2);
    fill.position.set(-d, d, d);
    scene.add(fill);
    if (landmarks && model.metadata.landmarks_mm) {
      const locations = model.metadata.landmarks_mm as Record<string, number[]>;
      Object.entries(locations).forEach(([name, point], i) => {
        if (!Array.isArray(point) || point.length !== 3) return;
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(d * 0.014, 12, 8),
          new THREE.MeshBasicMaterial({
            color: i === 0 ? 0x8e4b63 : i === 1 ? 0xd1a67b : 0x5d6f64,
            depthTest: false,
          }),
        );
        marker.name = name;
        marker.position.set(...(point as [number, number, number]));
        marker.renderOrder = 10;
        objects.push(marker);
        scene.add(marker);
      });
    }
    if (axes) {
      const helper = new THREE.AxesHelper(d * 0.65);
      helper.position.copy(center);
      scene.add(helper);
    }
    const observer = new ResizeObserver(() => {
      if (!container.clientWidth) return;
      cam.aspect = container.clientWidth / container.clientHeight;
      cam.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    observer.observe(container);
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      orbit.update();
      renderer.render(scene, cam);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      orbit.dispose();
      objects.forEach((o) => {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [model, comparison, axes, wireframe, compare, landmarks]);
  function view(direction: string) {
    if (!camera.current || !controls.current) return;
    const target = controls.current.target,
      d = size.current;
    const positions: Record<string, number[]> = {
      top: [0, 0, d * 2.4],
      below: [0, 0, -d * 2.4],
      front: [0, -d * 2.4, 0],
      side: [d * 2.4, 0, 0],
      perspective: [d * 1.3, -d * 1.35, d * 1.3],
    };
    const p = positions[direction];
    camera.current.position.set(
      target.x + p[0],
      target.y + p[1],
      target.z + p[2],
    );
    camera.current.up.set(0, 0, 1);
    if (direction === "top" || direction === "below")
      camera.current.up.set(0, 1, 0);
    controls.current.update();
  }
  return (
    <div className="viewer">
      <div className="viewer-label">
        <span className="status-dot" />{" "}
        {t(model ? "ACTUAL EXPORTED GEOMETRY" : "YOUR MODEL, AFTER REVIEW")}
      </div>
      <div
        ref={element}
        className="viewer-canvas"
        role="img"
        aria-label={t(
          model?.metadata.geometry_kind === "faceted_parametric_shell"
            ? "Interactive three dimensional nail shell, showing the same faceted mesh used for STL and STEP export. Drag to rotate, pinch or scroll to zoom; right drag to pan."
            : "Interactive three dimensional nail shell. Drag to rotate, pinch or scroll to zoom; right drag to pan.",
        )}
      />
      {!model && (
        <div className="viewer-empty">
          <Box size={44} strokeWidth={1} />
          <h3>{t("A form of your own.")}</h3>
          <p>
            {t(
              "Complete calibration and review your parameters to generate an inspectable laboratory model.",
            )}
          </p>
        </div>
      )}
      {error && (
        <div className="viewer-empty">
          <p>{t(error)}</p>
        </div>
      )}
      {model && (
        <>
          <div className="viewer-views">
            {["top", "below", "front", "side"].map((v) => (
              <button key={v} onClick={() => view(v)}>
                {t(v)}
              </button>
            ))}
            <button
              aria-label={t("Reset 3D view")}
              onClick={() => view("perspective")}
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div className="viewer-tools">
            <button
              className={landmarks ? "active" : ""}
              aria-pressed={landmarks}
              onClick={() => setLandmarks(!landmarks)}
            >
              <MapPin size={16} />
              {t("Landmarks")}
            </button>
            <button
              className={axes ? "active" : ""}
              aria-pressed={axes}
              onClick={() => setAxes(!axes)}
              title={t("Reference axes")}
            >
              <Move3D size={17} />
              {t("Axes")}
            </button>
            <button
              className={wireframe ? "active" : ""}
              aria-pressed={wireframe}
              onClick={() => setWireframe(!wireframe)}
            >
              <Layers size={17} />
              {t("Mesh")}
            </button>
            {comparison && (
              <button
                aria-pressed={compare}
                onClick={() => setCompare(!compare)}
              >
                {t(compare ? "Hide baseline" : "Compare baseline")}
              </button>
            )}
          </div>
          <span className="viewer-hint">
            {t(
              landmarks
                ? "Landmarks are parametric model locations · not recovered anatomy"
                : axes
                  ? "Axes: X transverse · Y length · Z height · units mm"
                  : "Drag to orbit · scroll to zoom · right-drag to pan",
            )}
          </span>
        </>
      )}
    </div>
  );
}
