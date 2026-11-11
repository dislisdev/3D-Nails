import { useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, MouseEvent } from "react";
import { AlertCircle, Check, MapPin, Plus, Trash2 } from "lucide-react";
import { api } from "./types";
import type { ImageRecord, Session } from "./types";
import "./ResearchTools.css";

const browserRuntime = import.meta.env.VITE_RUNTIME === "browser";

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
type ResearchSession = Session & {
  experiment?: Experiment | null;
  annotations?: Annotation[];
  capture_attempts?: { outcome: string }[];
  generation_failures?: unknown[];
};
const emptyExperiment: Experiment = {
  reference_length_mm: null,
  reference_width_mm: null,
  reference_source: "",
  repeat_group: "",
  effort_seconds: null,
  notes: "",
};
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Could not save the research record.";
const signed = (value: number) =>
  `${value > 0 ? "+" : ""}${value.toFixed(3)} mm`;

export function ExperimentPanel({
  session,
  onUpdated,
}: {
  session: Session;
  onUpdated: () => Promise<void>;
}) {
  const current = (session as ResearchSession).experiment ?? emptyExperiment;
  const [length, setLength] = useState(
    current.reference_length_mm?.toString() ?? "",
  );
  const [width, setWidth] = useState(
    current.reference_width_mm?.toString() ?? "",
  );
  const [source, setSource] = useState(current.reference_source);
  const [group, setGroup] = useState(current.repeat_group);
  const [effort, setEffort] = useState(
    current.effort_seconds?.toString() ?? "",
  );
  const [notes, setNotes] = useState(current.notes);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaved(false);
    if ((length || width) && !source.trim()) {
      setError(
        "Describe the independent reference and the instrument used before recording reference dimensions.",
      );
      return;
    }
    setBusy(true);
    try {
      await api("/sessions/" + session.id, {
        method: "PATCH",
        body: JSON.stringify({
          experiment: {
            reference_length_mm: length ? Number(length) : null,
            reference_width_mm: width ? Number(width) : null,
            reference_source: source.trim(),
            repeat_group: group.trim(),
            effort_seconds: effort ? Number(effort) : null,
            notes: notes.trim(),
          },
        }),
      });
      await onUpdated();
      setSaved(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="experiment-panel">
      <div className="section-intro">
        <div>
          <div className="eyebrow">INDEPENDENT EVIDENCE</div>
          <h3>A reference, beyond the model.</h3>
        </div>
        <p>
          Optional research observations. Use a separately characterized
          non-human reference. A generated CAD model is not independent ground
          truth.
        </p>
      </div>
      <form onSubmit={save} onChange={() => setSaved(false)}>
        <div className="evidence-fields">
          <label>
            Reference projected length{" "}
            <span className="number-input">
              <input
                aria-label="Reference projected length"
                type="number"
                min="0.01"
                max="100"
                step="any"
                value={length}
                onChange={(e) => setLength(e.target.value)}
              />
              <span>mm</span>
            </span>
          </label>
          <label>
            Reference projected width{" "}
            <span className="number-input">
              <input
                aria-label="Reference projected width"
                type="number"
                min="0.01"
                max="100"
                step="any"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
              <span>mm</span>
            </span>
          </label>
          <label>
            Repeated-reference group
            <input
              maxLength={100}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="e.g. reference-A / setup-1"
            />
          </label>
          <label>
            Observed completion effort{" "}
            <span className="number-input">
              <input
                aria-label="Observed completion effort"
                type="number"
                min="0"
                max="86400"
                step="any"
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
              />
              <span>sec</span>
            </span>
          </label>
        </div>
        <label className="evidence-wide">
          Independent reference & instrument
          <input
            maxLength={500}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Reference identifier, instrument, date, operator, and uncertainty if known"
          />
        </label>
        <label className="evidence-wide">
          Experiment notes
          <textarea
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Capture conditions, repeated protocol, deviations, or rejected trials"
          />
        </label>
        <p className="fine-print">
          References are operator-reported, not independently verified by the
          app. Compare the same projected quantity. Only group captures of the
          same object, method, and setup. Effort is entered by the observer, not
          inferred.
        </p>
        {error && (
          <div className="error-notice" role="alert">
            <AlertCircle size={17} />
            {error}
          </div>
        )}
        <button className="button secondary" disabled={busy} type="submit">
          {busy ? (
            "Saving…"
          ) : saved ? (
            <>
              <Check size={16} />
              Evidence saved
            </>
          ) : (
            "Save reference observations"
          )}
        </button>
        <div aria-live="polite" className="fine-print">
          {saved ? "Reference observations are saved in this session." : ""}
        </div>
      </form>
    </section>
  );
}

export function PhotoAnnotations({
  session,
  image,
  onUpdated,
}: {
  session: Session;
  image: ImageRecord;
  onUpdated: () => Promise<void>;
}) {
  const annotations = (session as ResearchSession).annotations ?? [];
  const visible = annotations.filter((note) => note.image_id === image.id);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  function place(x = 0.5, y = 0.5) {
    setPosition({ x, y });
    setError("");
    requestAnimationFrame(() => input.current?.focus());
  }
  function click(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(
      rect.width / image.width,
      rect.height / image.height,
    );
    const x =
      (event.clientX - rect.left - (rect.width - image.width * scale) / 2) /
      (image.width * scale);
    const y =
      (event.clientY - rect.top - (rect.height - image.height * scale) / 2) /
      (image.height * scale);
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) place(x, y);
  }
  function keyboard(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      place();
    }
  }
  async function persist(next: Annotation[]) {
    setBusy(true);
    setError("");
    try {
      await api("/sessions/" + session.id, {
        method: "PATCH",
        body: JSON.stringify({ annotations: next }),
      });
      await onUpdated();
      setPosition(null);
      setNote("");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!position || !note.trim()) return;
    void persist([
      ...annotations,
      {
        id: crypto.randomUUID(),
        image_id: image.id,
        ...position,
        note: note.trim(),
      },
    ]);
  }
  const radius = Math.max(image.width, image.height) * 0.021;
  return (
    <div className="photo-annotations">
      <svg
        viewBox={`0 0 ${image.width} ${image.height}`}
        role="button"
        tabIndex={0}
        aria-label="Annotate this research photograph. Click a location or press Enter to add a note."
        onClick={click}
        onKeyDown={keyboard}
      >
        <image href={image.url} width={image.width} height={image.height} />
        {visible.map((item, index) => (
          <g key={item.id} pointerEvents="none">
            <circle
              cx={item.x * image.width}
              cy={item.y * image.height}
              r={radius}
              fill="#242127"
              stroke="#faf8f5"
              strokeWidth={radius * 0.12}
            />
            <text
              x={item.x * image.width}
              y={item.y * image.height + radius * 0.35}
              textAnchor="middle"
              fill="#fff"
              fontSize={radius * 1.1}
            >
              {index + 1}
            </text>
          </g>
        ))}
        {position && (
          <circle
            cx={position.x * image.width}
            cy={position.y * image.height}
            r={radius}
            fill="#9a5868"
            stroke="#fff"
            strokeWidth={radius * 0.12}
          />
        )}
      </svg>
      <div className="annotation-controls">
        <span>
          <MapPin size={14} />
          Photo observations
        </span>
        <button className="text-button" onClick={() => place()}>
          <Plus size={14} />
          Add note
        </button>
      </div>
      {position && (
        <form onSubmit={submit} className="annotation-form">
          <label>
            Observation at this point
            <textarea
              ref={input}
              rows={2}
              maxLength={1000}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="annotation-position">
            {(["x", "y"] as const).map((axis) => (
              <label key={axis}>
                {axis.toUpperCase()} position (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={Number((position[axis] * 100).toFixed(1))}
                  onChange={(e) =>
                    setPosition({
                      ...position,
                      [axis]: Math.max(
                        0,
                        Math.min(1, e.target.valueAsNumber / 100 || 0),
                      ),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <div className="annotation-actions">
            <button
              className="button secondary small"
              type="submit"
              disabled={busy}
            >
              {busy ? "Saving…" : "Save photo note"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setPosition(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <div role="alert" className="error-notice">
          {error}
        </div>
      )}
      {visible.length > 0 && (
        <ol className="annotation-notes">
          {visible.map((item, index) => (
            <li key={item.id}>
              <span>
                {index + 1}. {item.note}
              </span>
              <button
                className="icon-button"
                disabled={busy}
                aria-label={`Delete photo note ${index + 1}`}
                onClick={() =>
                  void persist(
                    annotations.filter((note) => note.id !== item.id),
                  )
                }
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ResearchEvidence({ sessions }: { sessions: Session[] }) {
  const studies = sessions as ResearchSession[];
  const comparisons = studies.filter(
    (s) =>
      s.measurement &&
      s.experiment &&
      (s.experiment.reference_length_mm != null ||
        s.experiment.reference_width_mm != null),
  );
  const groups = new Map<string, ResearchSession[]>();
  for (const study of studies) {
    if (!study.measurement || !study.experiment?.repeat_group) continue;
    const key = study.experiment.repeat_group;
    groups.set(key, [...(groups.get(key) ?? []), study]);
  }
  const repeats = [...groups.entries()].filter(
    ([, group]) => group.length >= 2,
  );
  const attempts = studies.flatMap((s) => s.capture_attempts ?? []);
  const failures = studies.reduce(
    (n, s) => n + (s.generation_failures?.length ?? 0),
    0,
  );
  const efforts = studies.flatMap((s) =>
    s.experiment?.effort_seconds != null ? [s.experiment.effort_seconds] : [],
  );
  const spread = (
    items: ResearchSession[],
    field: "length_mm" | "width_mm",
  ) => {
    const values = items.map((s) => s.measurement![field]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const sd = Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        (values.length - 1),
    );
    return `SD ${sd.toFixed(3)} / range ${(Math.max(...values) - Math.min(...values)).toFixed(3)} mm`;
  };
  return (
    <section className="research-evidence">
      <div className="section-intro">
        <div>
          <div className="eyebrow">OBSERVATIONS, NOT ASSUMPTIONS</div>
          <h3>Evidence across iterations.</h3>
        </div>
        <p>
          Operator-entered references and repeated-session groups. No physical
          accuracy has been established by these descriptive comparisons.
        </p>
      </div>
      <div className="evidence-counters">
        <span>
          <strong>
            {attempts.filter((a) => a.outcome === "accepted").length}
          </strong>{" "}
          decoded uploads
        </span>
        <span>
          <strong>
            {attempts.filter((a) => a.outcome === "rejected").length}
          </strong>{" "}
          rejected uploads
        </span>
        <span>
          <strong>{failures}</strong> CAD generation failures
        </span>
        <span>
          <strong>
            {efforts.length
              ? (efforts.reduce((a, b) => a + b, 0) / efforts.length).toFixed(
                  0,
                ) + " s"
              : "—"}
          </strong>{" "}
          mean reported effort (n={efforts.length})
        </span>
      </div>
      <p className="fine-print">
        Decoded uploads are not approved captures. Rejected uploads and CAD
        failures count {browserRuntime ? "browser-recorded" : "server-recorded"}{" "}
        attempts; camera-permission failures are not included.
      </p>
      <h4>System projection versus independent reference</h4>
      {comparisons.length ? (
        <div
          className="evidence-table-scroll"
          role="region"
          aria-label="Independent reference comparisons"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Study</th>
                <th>Length / reference / error</th>
                <th>Width / reference / error</th>
                <th>Reported reference</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((s) => (
                <tr key={s.id}>
                  <th>{s.name}</th>
                  {(["length_mm", "width_mm"] as const).map((field) => {
                    const reference =
                      s.experiment![
                        field === "length_mm"
                          ? "reference_length_mm"
                          : "reference_width_mm"
                      ];
                    return (
                      <td key={field}>
                        {reference == null
                          ? "Unavailable"
                          : `${s.measurement![field].toFixed(3)} / ${reference.toFixed(3)} / ${signed(s.measurement![field] - reference)}`}
                      </td>
                    );
                  })}
                  <td>{s.experiment!.reference_source || "Not specified"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="evidence-empty">
          No independent references recorded. Add observations in a session’s
          Professional review.
        </p>
      )}
      <h4>Repeated-reference spread</h4>
      {repeats.length ? (
        <div
          className="evidence-table-scroll"
          role="region"
          aria-label="Repeated reference spread"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Operator-defined group</th>
                <th>n</th>
                <th>Length spread</th>
                <th>Width spread</th>
              </tr>
            </thead>
            <tbody>
              {repeats.map(([name, items]) => (
                <tr key={name}>
                  <th>{name}</th>
                  <td>{items.length}</td>
                  <td>{spread(items, "length_mm")}</td>
                  <td>{spread(items, "width_mm")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="evidence-empty">
          At least two measured sessions with the same reference-group label are
          needed. No repeatability statistics are simulated.
        </p>
      )}
      <p className="fine-print">
        SD is sample standard deviation. These summaries do not separate
        operator, pose, calibration, and lighting effects or establish an
        acceptable fit tolerance.
      </p>
    </section>
  );
}
