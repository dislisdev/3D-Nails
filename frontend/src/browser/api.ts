/** Static-host runtime. Research records and Blob assets stay in IndexedDB.
 * This module never fetches photographs or measurements from a remote service.
 * Server-mode FastAPI/OpenCV/CadQuery remain separate implementations.
 */
import type {
  CaptureView,
  Feedback,
  Generation,
  GeometryParameters,
  ImageRecord,
  Measurement,
  Session,
} from "../types";
import { measurePolygon, validateMeasurementInput } from "./measurement";

type Experiment = {
  reference_length_mm: number | null;
  reference_width_mm: number | null;
  reference_source: string;
  repeat_group: string;
  effort_seconds: number | null;
  notes: string;
};
type Annotation = {
  id: string;
  image_id: string;
  x: number;
  y: number;
  note: string;
};
type BrowserMeasurement = Measurement & {
  id: string;
  created_at: string;
  units: "mm";
  contour_source: string;
};
type BrowserGeneration = Generation & {
  source_image_id: string;
  measurement_id: string;
  review_confirmed: true;
  parameter_provenance: Record<string, string>;
};
type BrowserImage = ImageRecord & {
  created_at: string;
  storage: string;
  metadata_stripped: boolean;
  quality: ImageRecord["quality"] & Record<string, unknown>;
};
type StoredSession = Omit<
  Session,
  "measurement" | "latest_model" | "images"
> & {
  measurement?: BrowserMeasurement;
  latest_model?: BrowserGeneration;
  images: BrowserImage[];
  revision: number;
  consent_recorded_at: string;
  model_ids: string[];
  annotations: Annotation[];
  experiment: Experiment;
  capture_attempts: {
    created_at: string;
    view: CaptureView;
    outcome: "accepted" | "rejected";
    image_id?: string;
    reason?: string;
  }[];
  generation_failures: { created_at: string; reason: string }[];
};
type ImageAsset = {
  key: string;
  session_id: string;
  image_id: string;
  blob: Blob;
};
type ModelAsset = {
  key: string;
  session_id: string;
  model_id: string;
  generation: BrowserGeneration;
  files: Record<"stl" | "step" | "parameters" | "report", Blob>;
};
type Change = {
  sessionId: string;
  expectedRevision: number;
  session?: StoredSession;
  deleteSession?: boolean;
  addImage?: ImageAsset;
  addModel?: ModelAsset;
  deleteImages?: string[];
  deleteModels?: string[];
};

const DB_NAME = "nailform-lab-browser-research-v1";
const STORE_NAMES = ["sessions", "images", "models"];
const STATE_NAMES = [
  "draft",
  "measurement_review_needed",
  "geometrically_reviewed",
  "lab_print_requested",
  "printed",
  "evaluated_on_reference_model",
];
const REVIEWED_STATES = STATE_NAMES.slice(2);
const VIEWS: CaptureView[] = ["top", "front", "side", "oblique"];
const FORMATS = ["stl", "step", "parameters", "report"] as const;
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;
let database: Promise<IDBDatabase> | undefined;
let writeTail: Promise<void> = Promise.resolve();
const blobUrls = new Map<string, string>();
let channel: BroadcastChannel | undefined;

function timestamp() {
  return new Date().toISOString();
}
function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
function storageError(error: unknown): Error {
  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError")
      return new Error(
        "Browser storage is full. Delete older local sessions or free storage and retry. No research data was uploaded.",
      );
    if (
      ["SecurityError", "InvalidStateError", "NotAllowedError"].includes(
        error.name,
      )
    )
      return new Error(
        "Private browser storage is unavailable. Allow site storage or use a normal browser window. Photos cannot be saved until storage works.",
      );
  }
  return error instanceof Error
    ? error
    : new Error(
        "The local research record could not be saved. Check browser storage and retry.",
      );
}
function db(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(
          new Error(
            "This browser does not support IndexedDB research storage. Use a current Safari, Chrome, Firefox, or Edge browser.",
          ),
        );
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        for (const name of STORE_NAMES) {
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name, {
              keyPath: name === "sessions" ? "id" : "key",
            });
        }
      };
      request.onblocked = () => {
        blocked = true;
        reject(
          new Error(
            "Local storage is locked by another NAILFORM LAB tab. Close that tab and reload this one.",
          ),
        );
      };
      request.onerror = () => reject(storageError(request.error));
      request.onsuccess = () => {
        if (blocked) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => {
          request.result.close();
          database = undefined;
        };
        resolve(request.result);
      };
    }).catch((error: unknown) => {
      database = undefined;
      throw storageError(error);
    });
  }
  return database;
}
async function readRecord<T>(
  store: string,
  key: string,
): Promise<T | undefined> {
  const connection = await db();
  return new Promise((resolve, reject) => {
    const request = connection
      .transaction(store, "readonly")
      .objectStore(store)
      .get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(storageError(request.error));
  });
}
async function allSessions(): Promise<StoredSession[]> {
  const connection = await db();
  return new Promise((resolve, reject) => {
    const request = connection
      .transaction("sessions", "readonly")
      .objectStore("sessions")
      .getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as StoredSession[]).sort((a, b) =>
          b.updated_at.localeCompare(a.updated_at),
        ),
      );
    request.onerror = () => reject(storageError(request.error));
  });
}

/** Atomic multi-store changes, with a revision guard for tabs without Web Locks. */
async function commit(change: Change) {
  const connection = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = connection.transaction(STORE_NAMES, "readwrite");
    let reason: Error | undefined;
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(reason ?? storageError(transaction.error));
    transaction.onerror = () => {
      /* onabort retains the underlying IDB error */
    };
    const sessions = transaction.objectStore("sessions");
    const request = sessions.get(change.sessionId);
    request.onsuccess = () => {
      const existing = request.result as StoredSession | undefined;
      if ((existing?.revision ?? -1) !== change.expectedRevision) {
        reason = new Error(
          "This session changed in another tab. Reopen the session and retry so those changes are preserved.",
        );
        transaction.abort();
        return;
      }
      if (change.deleteSession) sessions.delete(change.sessionId);
      if (change.session) {
        change.session.revision = change.expectedRevision + 1;
        sessions.put(change.session);
      }
      if (change.addImage)
        transaction.objectStore("images").put(change.addImage);
      if (change.addModel)
        transaction.objectStore("models").put(change.addModel);
      for (const key of change.deleteImages ?? [])
        transaction.objectStore("images").delete(key);
      for (const key of change.deleteModels ?? [])
        transaction.objectStore("models").delete(key);
    };
  });
}
async function saveSession(
  session: StoredSession,
  extras: Partial<Change> = {},
) {
  await commit({
    sessionId: session.id,
    expectedRevision: session.revision,
    session,
    ...extras,
  });
}
function withWrite<T>(operation: () => Promise<T>): Promise<T> {
  const run = async () => {
    if (typeof navigator !== "undefined" && navigator.locks?.request)
      return navigator.locks.request(DB_NAME + "-write", operation);
    return operation();
  };
  const result = writeTail.then(run, run);
  writeTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function getChannel() {
  if (
    !channel &&
    typeof window !== "undefined" &&
    typeof BroadcastChannel !== "undefined"
  ) {
    channel = new BroadcastChannel(DB_NAME + "-assets");
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (
        data &&
        typeof data === "object" &&
        "deleted" in data &&
        Array.isArray(data.deleted)
      )
        revokeUrls(
          data.deleted.filter((v): v is string => typeof v === "string"),
          false,
        );
    };
  }
  return channel;
}
function objectUrl(key: string, blob: Blob) {
  getChannel();
  let url = blobUrls.get(key);
  if (!url) {
    url = URL.createObjectURL(blob);
    blobUrls.set(key, url);
  }
  return url;
}
function revokeUrls(keys: string[], broadcast = true) {
  for (const key of keys) {
    const url = blobUrls.get(key);
    if (url) URL.revokeObjectURL(url);
    blobUrls.delete(key);
  }
  if (broadcast) getChannel()?.postMessage({ deleted: keys });
}
const imageKey = (sid: string, iid: string) => `${sid}/${iid}`;
const modelKey = (sid: string, mid: string) => `${sid}/${mid}`;
const imageUrlKey = (sid: string, iid: string) => `image:${imageKey(sid, iid)}`;
const modelUrlKeys = (sid: string, mid: string) =>
  FORMATS.map((kind) => `model:${modelKey(sid, mid)}:${kind}`);

async function requireSession(id: string) {
  const session = await readRecord<StoredSession>("sessions", id);
  if (!session)
    throw new Error(
      "Research session not found in this browser. Sessions do not sync across devices or browsers.",
    );
  return session;
}
function requireImage(session: StoredSession, id: string) {
  const image = session.images.find((entry) => entry.id === id);
  if (!image) throw new Error("Image not found in this research session.");
  return image;
}
async function requireModel(session: StoredSession, id: string) {
  if (!session.model_ids.includes(id))
    throw new Error("Model not found in this research session.");
  const model = await readRecord<ModelAsset>(
    "models",
    modelKey(session.id, id),
  );
  if (!model)
    throw new Error(
      "The model is unavailable in browser storage. Generate it again from the saved measurement.",
    );
  return model;
}
function materializeModel(asset: ModelAsset): BrowserGeneration {
  const generation = structuredClone(asset.generation);
  for (const kind of FORMATS)
    generation.downloads[kind] = objectUrl(
      `model:${asset.key}:${kind}`,
      asset.files[kind],
    );
  return generation;
}
async function materializeSession(
  stored: StoredSession,
): Promise<StoredSession> {
  const session = structuredClone(stored);
  session.images = await Promise.all(
    session.images.map(async (image) => {
      const asset = await readRecord<ImageAsset>(
        "images",
        imageKey(session.id, image.id),
      );
      return {
        ...image,
        url: asset
          ? objectUrl(imageUrlKey(session.id, image.id), asset.blob)
          : "",
      };
    }),
  );
  if (session.latest_model)
    session.latest_model = materializeModel(
      await requireModel(session, session.latest_model.id),
    );
  return session;
}
function version(
  session: StoredSession,
  kind: string,
  summary: string,
  extras: Record<string, unknown> = {},
) {
  session.versions.push({
    id: uuid(),
    created_at: timestamp(),
    kind,
    summary,
    ...extras,
  });
  session.updated_at = timestamp();
}
function invalidateReview(session: StoredSession) {
  session.state = "measurement_review_needed";
  session.feedback.contour_accepted = false;
  session.feedback.geometry_accepted = false;
  delete session.latest_model;
}

function object(value: unknown, label = "Request"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("The request contains an unsupported field.");
}
function string(value: unknown, label: string, max: number, min = 0): string {
  if (typeof value !== "string" || value.length < min || value.length > max)
    throw new Error(
      `${label} must contain ${min ? `${min}–` : "at most "}${max} characters.`,
    );
  return value;
}
function finite(value: unknown, label: string, low: number, high: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < low ||
    value > high
  )
    throw new Error(
      `${label} must be a finite number between ${low} and ${high}.`,
    );
  return value;
}
function boolean(value: unknown, label: string, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean")
    throw new Error(`${label} must be true or false.`);
  return value;
}
function jsonBody(options: RequestInit) {
  if (typeof options.body !== "string")
    throw new Error("A JSON request body is required.");
  try {
    return object(JSON.parse(options.body));
  } catch (error) {
    throw error instanceof SyntaxError
      ? new Error("The request body is not valid JSON.")
      : error;
  }
}
function feedback(value: unknown): Feedback {
  const data = object(value, "Feedback");
  onlyKeys(data, ["notes", "issues", "contour_accepted", "geometry_accepted"]);
  const issues = data.issues ?? [];
  if (!Array.isArray(issues) || issues.length > 30)
    throw new Error("Feedback supports at most thirty issues.");
  return {
    notes: string(data.notes ?? "", "Review notes", 10000),
    issues: issues.map((entry) => string(entry, "Issue", 1000)),
    contour_accepted: boolean(data.contour_accepted, "Contour acceptance"),
    geometry_accepted: boolean(data.geometry_accepted, "Geometry acceptance"),
  };
}
function experiment(value: unknown): Experiment {
  const data = object(value, "Experiment observations");
  onlyKeys(data, [
    "reference_length_mm",
    "reference_width_mm",
    "reference_source",
    "repeat_group",
    "effort_seconds",
    "notes",
  ]);
  const dimension = (v: unknown, label: string) =>
    v == null ? null : finite(v, label, Number.MIN_VALUE, 100);
  return {
    reference_length_mm: dimension(
      data.reference_length_mm,
      "Reference length",
    ),
    reference_width_mm: dimension(data.reference_width_mm, "Reference width"),
    reference_source: string(
      data.reference_source ?? "",
      "Reference description",
      500,
    ),
    repeat_group: string(
      data.repeat_group ?? "",
      "Repeated-reference group",
      100,
    ),
    effort_seconds:
      data.effort_seconds == null
        ? null
        : finite(data.effort_seconds, "Observed effort", 0, 86400),
    notes: string(data.notes ?? "", "Experiment notes", 2000),
  };
}
function annotations(value: unknown, session: StoredSession): Annotation[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error(
      "A session supports at most one hundred photo annotations.",
    );
  const result = value.map((entry) => {
    const a = object(entry, "Annotation");
    onlyKeys(a, ["id", "image_id", "x", "y", "note"]);
    const imageId = string(a.image_id, "Annotation image identifier", 100, 1);
    requireImage(session, imageId);
    return {
      id: string(a.id, "Annotation identifier", 100, 1),
      image_id: imageId,
      x: finite(a.x, "Annotation x", 0, 1),
      y: finite(a.y, "Annotation y", 0, 1),
      note: string(a.note, "Photo note", 1000, 1),
    };
  });
  if (new Set(result.map((a) => a.id)).size !== result.length)
    throw new Error(
      "Annotation identifiers must be unique within the session.",
    );
  return result;
}

/** Check encoded dimensions before decoding an image to bound memory use. */
function imageHeader(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    ascii(1, 3) === "PNG" &&
    ascii(12, 4) === "IHDR"
  ) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      ) {
        return {
          height: view.getUint16(offset + 3),
          width: view.getUint16(offset + 5),
        };
      }
      offset += length;
    }
  }
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = ascii(offset, 4),
        size = view.getUint32(offset + 4, true),
        data = offset + 8;
      if (size > bytes.length - data) break;
      if (kind === "VP8X" && size >= 10)
        return {
          width:
            1 +
            bytes[data + 4] +
            (bytes[data + 5] << 8) +
            (bytes[data + 6] << 16),
          height:
            1 +
            bytes[data + 7] +
            (bytes[data + 8] << 8) +
            (bytes[data + 9] << 16),
        };
      if (kind === "VP8L" && size >= 5 && bytes[data] === 47)
        return {
          width: 1 + ((bytes[data + 1] | (bytes[data + 2] << 8)) & 16383),
          height:
            1 +
            (((bytes[data + 2] >> 6) |
              (bytes[data + 3] << 2) |
              (bytes[data + 4] << 10)) &
              16383),
        };
      if (
        kind === "VP8 " &&
        size >= 10 &&
        bytes[data + 3] === 157 &&
        bytes[data + 4] === 1 &&
        bytes[data + 5] === 42
      )
        return {
          width: view.getUint16(data + 6, true) & 16383,
          height: view.getUint16(data + 8, true) & 16383,
        };
      offset = data + size + (size % 2);
    }
  }
  throw new Error(
    "Choose a valid JPEG, PNG, or WebP photograph. Export HEIC images to JPEG first.",
  );
}

async function decodedImage(
  file: Blob,
): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file),
    image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("The photograph could not be decoded."));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
function imageQuality(
  source: CanvasImageSource,
  width: number,
  height: number,
): BrowserImage["quality"] {
  const scale = Math.min(1, 1024 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error(
      "Image processing is unavailable in this browser. Reload or use another browser.",
    );
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const count = canvas.width * canvas.height,
    gray = new Float64Array(count);
  let brightness = 0,
    glare = 0;
  for (let i = 0; i < count; i++) {
    gray[i] =
      data[4 * i] * 0.299 + data[4 * i + 1] * 0.587 + data[4 * i + 2] * 0.114;
    brightness += gray[i];
    if (data[4 * i] >= 245 && data[4 * i + 1] >= 245 && data[4 * i + 2] >= 245)
      glare++;
  }
  let laplaceSum = 0,
    laplaceSquares = 0,
    interior = 0;
  for (let y = 1; y < canvas.height - 1; y++)
    for (let x = 1; x < canvas.width - 1; x++) {
      const i = y * canvas.width + x;
      const value =
        gray[i - 1] +
        gray[i + 1] +
        gray[i - canvas.width] +
        gray[i + canvas.width] -
        4 * gray[i];
      laplaceSum += value;
      laplaceSquares += value * value;
      interior++;
    }
  const blur = interior
    ? Math.max(0, laplaceSquares / interior - (laplaceSum / interior) ** 2)
    : 0;
  brightness /= count;
  const glareFraction = glare / count,
    warnings: string[] = [];
  if (blur < 60)
    warnings.push(
      "Low edge detail: the photo may be blurred or lack texture. Review before measuring.",
    );
  if (brightness < 45)
    warnings.push(
      "Low overall lighting. Retake with soft, even illumination if boundaries are unclear.",
    );
  if (brightness > 225)
    warnings.push(
      "High overall brightness. Check that the nail boundary is still visible.",
    );
  if (glareFraction > 0.12)
    warnings.push(
      "Many near-white pixels: inspect for glare or overexposure; a white background can also trigger this.",
    );
  const analysisDimensions = [canvas.width, canvas.height];
  canvas.width = 0;
  canvas.height = 0;
  return {
    blur_score: Math.round(blur * 1000) / 1000,
    mean_brightness: Math.round(brightness * 1000) / 1000,
    glare_fraction: Math.round(glareFraction * 1e6) / 1e6,
    warnings,
    status: "heuristic_only",
    framing: "manual_review_required",
    engine: "browser_canvas_laplacian_v1",
    analysis_dimensions: analysisDimensions,
    limitations:
      "Browser canvas heuristics on a maximum 1024-pixel analysis image. Scores are not interchangeable with server OpenCV scores and do not establish boundaries, framing, scale, or accuracy.",
  };
}
async function normalizePhoto(file: Blob) {
  if (file.size > MAX_BYTES)
    throw new Error("Image exceeds the 12 MB upload limit.");
  const header = imageHeader(new Uint8Array(await file.arrayBuffer()));
  if (header.width * header.height > MAX_PIXELS)
    throw new Error(
      "Image exceeds the 20 megapixel limit. Resize it before uploading.",
    );
  if (Math.min(header.width, header.height) < 64)
    throw new Error("Image dimensions must each be at least 64 pixels.");
  let decoded: Awaited<ReturnType<typeof decodedImage>>;
  try {
    decoded = await decodedImage(file);
  } catch {
    throw new Error(
      "The image could not be decoded. Choose a valid JPEG, PNG, or WebP photograph.",
    );
  }
  try {
    if (
      decoded.width * decoded.height > MAX_PIXELS ||
      Math.min(decoded.width, decoded.height) < 64
    )
      throw new Error(
        "Image dimensions must be at least 64 pixels per side and no more than 20 megapixels.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    try {
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Image processing is unavailable in this browser.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0);
      const quality = imageQuality(canvas, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(
                  new Error(
                    "This photograph is too large for the browser canvas. Resize it and retry.",
                  ),
                ),
          "image/png",
        ),
      );
      return { blob, width: decoded.width, height: decoded.height, quality };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    decoded.close();
  }
}

async function route(path: string, options: RequestInit): Promise<unknown> {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Only local research routes are supported.");
  const url = new URL(path, "https://nailform.local"),
    parts = url.pathname.split("/").filter(Boolean);
  const method = (options.method ?? "GET").toUpperCase();
  if (parts.some((part) => !/^[a-zA-Z0-9_-]{1,100}$/.test(part)))
    throw new Error("The research route is invalid.");
  if (parts[0] === "health" && parts.length === 1 && method === "GET") {
    const geometry = await import("./geometry");
    return {
      status: "ok",
      cad_available: typeof geometry.generateBrowserGeometry === "function",
      mode: "browser_local_research",
      units: "mm",
      wear_assessed: false,
      geometry_engine: "browser_faceted_mesh",
      measurement_engine: "browser_projected_polygon_v1",
    };
  }
  if (parts[0] !== "sessions")
    throw new Error("This research operation is unavailable.");
  if (parts.length === 1) {
    if (method === "GET")
      return Promise.all((await allSessions()).map(materializeSession));
    if (method === "POST") {
      const data = jsonBody(options);
      onlyKeys(data, ["name", "consent"]);
      if (data.consent !== true)
        throw new Error(
          "Consent to storing research photographs on this device is required.",
        );
      const name = string(data.name, "Session name", 120, 1).trim();
      if (!name) throw new Error("Give the research session a name.");
      const now = timestamp();
      const session: StoredSession = {
        id: uuid(),
        name,
        created_at: now,
        updated_at: now,
        state: "draft",
        consent: true,
        consent_recorded_at: now,
        revision: 0,
        images: [],
        feedback: {
          notes: "",
          issues: [],
          contour_accepted: false,
          geometry_accepted: false,
        },
        versions: [],
        model_ids: [],
        capture_attempts: [],
        generation_failures: [],
        annotations: [],
        experiment: experiment({}),
      };
      version(
        session,
        "created",
        "Consent recorded for private browser research storage; session created.",
      );
      await commit({ sessionId: session.id, expectedRevision: -1, session });
      return materializeSession(session);
    }
    throw new Error("This research operation is unavailable.");
  }
  const session = await requireSession(parts[1]);
  if (parts.length === 2) {
    if (method === "GET") return materializeSession(session);
    if (method === "DELETE") {
      await commit({
        sessionId: session.id,
        expectedRevision: session.revision,
        deleteSession: true,
        deleteImages: session.images.map((i) => imageKey(session.id, i.id)),
        deleteModels: session.model_ids.map((mid) => modelKey(session.id, mid)),
      });
      revokeUrls([
        ...session.images.map((i) => imageUrlKey(session.id, i.id)),
        ...session.model_ids.flatMap((mid) => modelUrlKeys(session.id, mid)),
      ]);
      return undefined;
    }
    if (method === "PATCH") {
      const data = jsonBody(options);
      onlyKeys(data, [
        "name",
        "state",
        "feedback",
        "experiment",
        "annotations",
      ]);
      if (data.name != null) {
        session.name = string(data.name, "Session name", 120, 1).trim();
        if (!session.name) throw new Error("Give the research session a name.");
      }
      if (data.feedback != null) {
        const review = feedback(data.feedback);
        if (review.contour_accepted && !session.measurement)
          throw new Error("Measure and review a contour before accepting it.");
        if (review.geometry_accepted && !session.latest_model)
          throw new Error(
            "Generate and inspect a model before accepting its geometry.",
          );
        if (review.geometry_accepted && !review.contour_accepted)
          throw new Error(
            "Geometric review also requires acceptance of the source contour.",
          );
        session.feedback = review;
        if (
          !review.geometry_accepted &&
          REVIEWED_STATES.includes(session.state)
        )
          session.state = "measurement_review_needed";
      }
      if (data.state != null) {
        const state = string(data.state, "Research state", 100, 1);
        if (!STATE_NAMES.includes(state))
          throw new Error("The selected research state is unsupported.");
        if (
          REVIEWED_STATES.includes(state) &&
          (!session.latest_model || !session.feedback.geometry_accepted)
        )
          throw new Error(
            "This state requires a current generated model and recorded geometric review.",
          );
        session.state = state;
      }
      if (data.annotations != null) {
        session.annotations = annotations(data.annotations, session);
        version(
          session,
          "annotation",
          "Professional image annotations updated.",
        );
      }
      if (data.experiment != null) {
        session.experiment = experiment(data.experiment);
        version(
          session,
          "experiment",
          "Declared independent reference observations and repeat group updated.",
          { experiment: session.experiment },
        );
      }
      if (data.name != null || data.state != null || data.feedback != null)
        version(
          session,
          "review",
          "Professional notes, research state, or session name updated.",
          { feedback: session.feedback, state: session.state },
        );
      await saveSession(session);
      return materializeSession(session);
    }
  }
  if (parts[2] === "images" && parts.length === 3 && method === "POST") {
    const view = (url.searchParams.get("view") ?? "top") as CaptureView;
    if (!VIEWS.includes(view))
      throw new Error("Choose top, front, side, or oblique capture view.");
    let normalized: Awaited<ReturnType<typeof normalizePhoto>>;
    try {
      if (!(options.body instanceof FormData))
        throw new Error("Choose an image file to upload.");
      const file = options.body.get("file");
      if (!(file instanceof Blob))
        throw new Error("Choose an image file to upload.");
      normalized = await normalizePhoto(file);
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "The photograph could not be processed.";
      session.capture_attempts.push({
        created_at: timestamp(),
        view,
        outcome: "rejected",
        reason,
      });
      session.updated_at = timestamp();
      await saveSession(session);
      throw new Error(reason);
    }
    const imageId = uuid();
    const image: BrowserImage = {
      id: imageId,
      view,
      width: normalized.width,
      height: normalized.height,
      url: "",
      quality: normalized.quality,
      created_at: timestamp(),
      storage: "private_browser_indexeddb",
      metadata_stripped: true,
    };
    session.images.push(image);
    session.capture_attempts.push({
      created_at: timestamp(),
      view,
      outcome: "accepted",
      image_id: imageId,
    });
    if (view === "top") {
      delete session.measurement;
      delete session.contour;
      delete session.calibration;
      invalidateReview(session);
    } else {
      session.feedback.geometry_accepted = false;
      session.state = "measurement_review_needed";
    }
    version(
      session,
      "capture",
      `${view[0].toUpperCase() + view.slice(1)} photograph stored on this device; quality requires human review.`,
    );
    await saveSession(session, {
      addImage: {
        key: imageKey(session.id, imageId),
        session_id: session.id,
        image_id: imageId,
        blob: normalized.blob,
      },
    });
    return {
      ...image,
      url: objectUrl(imageUrlKey(session.id, imageId), normalized.blob),
    };
  }
  if (parts[2] === "images" && parts.length === 4) {
    const imageId = parts[3];
    requireImage(session, imageId);
    if (method === "GET") {
      const image = await readRecord<ImageAsset>(
        "images",
        imageKey(session.id, imageId),
      );
      if (!image) throw new Error("Stored image is unavailable.");
      return image.blob;
    }
    if (method === "DELETE") {
      const deleteModels: string[] = [],
        keepModels: string[] = [];
      for (const mid of session.model_ids) {
        const model = await requireModel(session, mid);
        (model.generation.source_image_id === imageId
          ? deleteModels
          : keepModels
        ).push(mid);
      }
      session.images = session.images.filter((image) => image.id !== imageId);
      session.annotations = session.annotations.filter(
        (annotation) => annotation.image_id !== imageId,
      );
      session.model_ids = keepModels;
      session.versions = session.versions.filter(
        (v) =>
          (v as typeof v & { image_id?: string }).image_id !== imageId &&
          (!v.model_id || keepModels.includes(v.model_id)),
      );
      session.capture_attempts = session.capture_attempts.filter(
        (attempt) => attempt.image_id !== imageId,
      );
      if (session.measurement?.image_id === imageId) {
        delete session.measurement;
        delete session.contour;
        delete session.calibration;
        invalidateReview(session);
      }
      if (session.latest_model?.source_image_id === imageId)
        invalidateReview(session);
      session.feedback.geometry_accepted = false;
      session.state = "measurement_review_needed";
      version(
        session,
        "deletion",
        "Image and dependent measurements/model exports removed from browser storage.",
      );
      await saveSession(session, {
        deleteImages: [imageKey(session.id, imageId)],
        deleteModels: deleteModels.map((mid) => modelKey(session.id, mid)),
      });
      revokeUrls([
        imageUrlKey(session.id, imageId),
        ...deleteModels.flatMap((mid) => modelUrlKeys(session.id, mid)),
      ]);
      return undefined;
    }
  }
  if (parts[2] === "measure" && parts.length === 3 && method === "POST") {
    const input = validateMeasurementInput(jsonBody(options)),
      image = requireImage(session, input.image_id);
    if (image.view !== "top")
      throw new Error(
        "The calibrated 2D method currently uses the top-view image only.",
      );
    const measured: BrowserMeasurement = {
      ...measurePolygon(input, image.width, image.height),
      id: uuid(),
      created_at: timestamp(),
      units: "mm",
      contour_source: "manual_control_points",
    };
    measured.warnings.push(...image.quality.warnings);
    session.measurement = measured;
    session.contour = measured.contour;
    session.calibration = measured.calibration;
    invalidateReview(session);
    version(
      session,
      "measurement",
      "Calibrated projected 2D dimensions recorded from manually placed contour.",
      { image_id: image.id, measurement: measured },
    );
    await saveSession(session);
    return measured;
  }
  if (parts[2] === "generate" && parts.length === 3 && method === "POST") {
    const data = jsonBody(options);
    onlyKeys(data, ["parameters", "review_confirmed"]);
    if (data.review_confirmed !== true)
      throw new Error(
        "Review the projected dimensions and explicit manual inputs before generating research CAD.",
      );
    if (!session.measurement)
      throw new Error(
        "Complete calibration and contour measurement before generating research CAD.",
      );
    const parameterData = object(data.parameters, "Geometry parameters");
    onlyKeys(parameterData, [
      "length_mm",
      "width_mm",
      "transverse_rise_mm",
      "longitudinal_rise_mm",
      "thickness_mm",
      "extension_mm",
      "tip_shape",
      "asymmetry_mm",
    ]);
    const requestedParameters = parameterData as unknown as GeometryParameters;
    const mid = uuid();
    let generated: ReturnType<
      (typeof import("./geometry"))["generateBrowserGeometry"]
    >;
    try {
      const { generateBrowserGeometry } = await import("./geometry");
      generated = generateBrowserGeometry(requestedParameters);
      if (generated.validation.passed !== true)
        throw new Error(
          "Browser mesh validation did not pass. Exports were withheld; adjust the experimental parameters.",
        );
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "Browser geometry generation failed. Adjust the experimental parameters.";
      session.generation_failures.push({ created_at: timestamp(), reason });
      version(session, "cad_failure", reason);
      await saveSession(session);
      throw new Error(reason);
    }
    const measured = session.measurement;
    const provenance: Record<string, string> = {};
    for (const [key, value] of Object.entries(generated.parameters))
      provenance[key] =
        (key === "length_mm" || key === "width_mm") &&
        Math.abs(Number(value) - measured[key]) < 1e-4
          ? "measured"
          : "manually_adjusted";
    const metadata = {
      ...generated.metadata,
      measurement_limitations: measured.uncertainty,
      contour_reconstruction:
        "Parametric length/width approximation; photographed contour is not reconstructed as an exact CAD boundary.",
      parameter_provenance: provenance,
      wear_status:
        "Non-wearable laboratory prototype. Material and product safety have not been assessed.",
      storage: "private_browser_indexeddb",
    };
    const generation: BrowserGeneration = {
      id: mid,
      created_at: timestamp(),
      parameters: generated.parameters,
      metadata,
      validation: generated.validation,
      mesh: generated.mesh,
      downloads: { stl: "", step: "", parameters: "", report: "" },
      source_image_id: measured.image_id,
      measurement_id: measured.id,
      review_confirmed: true,
      parameter_provenance: provenance,
    };
    const jsonBlob = (value: unknown) =>
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const asset: ModelAsset = {
      key: modelKey(session.id, mid),
      session_id: session.id,
      model_id: mid,
      generation,
      files: {
        stl: generated.stl,
        step: generated.step,
        parameters: jsonBlob({
          units: "mm",
          parameters: generation.parameters,
          parameter_provenance: provenance,
          source_measurement: measured,
          metadata,
        }),
        report: jsonBlob({
          ...generation.validation,
          parameter_provenance: provenance,
          measurement_uncertainty: measured.uncertainty,
          wear_status: metadata.wear_status,
        }),
      },
    };
    session.latest_model = generation;
    session.model_ids.push(mid);
    session.feedback.geometry_accepted = false;
    session.state = "measurement_review_needed";
    version(
      session,
      "cad",
      "Experimental faceted shell generated in the browser from projected dimensions and explicit manual inputs.",
      { model_id: mid, image_id: measured.image_id },
    );
    await saveSession(session, { addModel: asset });
    return materializeModel(asset);
  }
  if (
    parts[2] === "models" &&
    (parts.length === 4 || parts.length === 5) &&
    method === "GET"
  ) {
    const asset = await requireModel(session, parts[3]);
    if (parts.length === 4) return materializeModel(asset);
    const format = parts[4] as (typeof FORMATS)[number];
    if (!FORMATS.includes(format))
      throw new Error(
        "Choose an STL, STEP, parameter JSON, or validation report export.",
      );
    return asset.files[format];
  }
  throw new Error("This research operation is unavailable.");
}

export async function browserApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (options.signal?.aborted)
    throw new DOMException("The request was cancelled.", "AbortError");
  try {
    if ((options.method ?? "GET").toUpperCase() === "GET") {
      await writeTail;
      return (await route(path, options)) as T;
    }
    return (await withWrite(() => route(path, options))) as T;
  } catch (error) {
    throw storageError(error);
  }
}
