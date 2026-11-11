export type Point = { x: number; y: number };
export type Calibration = { a: Point; b: Point; reference_mm: number };
export type CaptureView = "top" | "front" | "side" | "oblique";
export type ImageRecord = {
  id: string;
  view: CaptureView;
  width: number;
  height: number;
  url: string;
  quality: {
    blur_score: number;
    mean_brightness: number;
    glare_fraction: number;
    warnings: string[];
  };
};
export type Measurement = {
  length_mm: number;
  width_mm: number;
  sectional_widths_mm: { t: number; width_mm: number }[];
  scale_mm_per_px: number;
  method: string;
  provenance: Record<string, string>;
  uncertainty: string;
  warnings: string[];
  contour: Point[];
  calibration: Calibration;
  image_id: string;
};
export type GeometryParameters = {
  length_mm: number;
  width_mm: number;
  transverse_rise_mm: number;
  longitudinal_rise_mm: number;
  thickness_mm: number;
  extension_mm: number;
  tip_shape: "oval" | "squoval" | "almond";
  asymmetry_mm: number;
};
export type Generation = {
  id: string;
  created_at: string;
  parameters: GeometryParameters;
  metadata: Record<string, unknown>;
  validation: Record<string, unknown>;
  mesh: { vertices: number[][]; faces: number[][] };
  downloads: Record<"stl" | "step" | "parameters" | "report", string>;
};
export type Feedback = {
  notes: string;
  issues: string[];
  contour_accepted: boolean;
  geometry_accepted: boolean;
};
export type Session = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  state: string;
  consent: boolean;
  images: ImageRecord[];
  contour?: Point[];
  calibration?: Calibration;
  measurement?: Measurement;
  latest_model?: Generation;
  feedback: Feedback;
  versions: {
    id: string;
    created_at: string;
    kind: string;
    summary: string;
    model_id?: string;
  }[];
};
export const states: Record<string, string> = {
  draft: "Draft",
  measurement_review_needed: "Measurement review needed",
  geometrically_reviewed: "Geometrically reviewed",
  lab_print_requested: "Lab print requested",
  printed: "Printed",
  evaluated_on_reference_model: "Evaluated on reference model",
};
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (import.meta.env.VITE_RUNTIME === "browser") {
    const { browserApi } = await import("./browser/api");
    return browserApi<T>(path, options);
  }
  const response = await fetch("/api" + path, {
    credentials: "include",
    ...options,
    headers: {
      ...(!(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = "The request could not be completed.";
    try {
      const data = await response.json();
      message =
        typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail ?? data);
    } catch {
      message = response.statusText;
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
