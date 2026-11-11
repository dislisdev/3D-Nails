import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Check,
  Camera,
  Upload,
  ShieldCheck,
  Microscope,
  MoveUpRight,
  Plus,
  X,
  Image as ImageIcon,
  AlertCircle,
  Trash2,
  SwitchCamera,
  CheckCircle2,
  Download,
  SlidersHorizontal,
  ScanLine,
  Layers,
  Clock3,
  Menu,
  ExternalLink,
} from "lucide-react";
import { api, date, states } from "./types";
import { t, useLanguage, LanguageSwitcher, formatNumber } from "./i18n";
import type {
  Session,
  ImageRecord,
  CaptureView,
  Generation,
  GeometryParameters,
  Feedback,
} from "./types";
const LazyViewer = lazy(() => import("./Viewer"));
function Viewer(props: { model?: Generation; comparison?: Generation }) {
  return (
    <Suspense
      fallback={
        <div className="viewer viewer-loading" role="status">
          {t("Preparing the 3D workspace…")}
        </div>
      }
    >
      <LazyViewer {...props} />
    </Suspense>
  );
}
import ContourEditor from "./ContourEditor";
import {
  ExperimentPanel,
  PhotoAnnotations,
  ResearchEvidence,
} from "./ResearchTools";

const browserRuntime = import.meta.env.VITE_RUNTIME === "browser";

const views: CaptureView[] = ["top", "front", "side", "oblique"];
const viewInfo: Record<CaptureView, { title: string; description: string }> = {
  top: {
    title: "From above",
    description:
      "Keep the nail facing the camera. Include the entire cuticle and free edge, with a known-size reference beside the nail in the same plane.",
  },
  front: {
    title: "From the free edge",
    description:
      "Point the camera towards the end of the finger. Make the transverse curve visible without bending or pressing the nail.",
  },
  side: {
    title: "From the side",
    description:
      "Photograph the profile at nail height. Keep the camera steady and the whole nail in view.",
  },
  oblique: {
    title: "An extra perspective",
    description:
      "An optional angled photograph can help a professional understand the shape. It does not independently establish 3D dimensions.",
  },
};
const emptyFeedback: Feedback = {
  notes: "",
  issues: [],
  contour_accepted: false,
  geometry_accepted: false,
};
function captureViewLabel(view: CaptureView) {
  return t(
    { top: "Top", front: "Free edge", side: "Side", oblique: "Oblique" }[view],
  );
}
function translatedError(text: string) {
  const prefixes = [
    "This browser could not open the local research workspace.",
    "The local research service is unavailable.",
  ];
  for (const prefix of prefixes) {
    if (text.startsWith(prefix))
      return `${t(prefix)} ${t(text.slice(prefix.length).trim())}`;
  }
  return t(text);
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function ErrorNotice({
  text,
  onClose,
}: {
  text: string;
  onClose?: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={18} />
      <span>{translatedError(text)}</span>
      {onClose && (
        <button aria-label={t("Dismiss error")} onClick={onClose}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
function ResearchNotice() {
  return (
    <div className="research-notice">
      <Microscope size={16} />
      <span>
        {t(
          "Research prototype. Generated objects are for laboratory references only, not for wear or contact testing.",
        )}
      </span>
    </div>
  );
}

function ShellIllustration() {
  return (
    <svg
      viewBox="0 0 560 610"
      className="shell-illustration"
      role="img"
      aria-label={t("Illustrative parametric nail shell, not a measured nail")}
    >
      <defs>
        <linearGradient id="shell" x1="0" x2="1">
          <stop stopColor="#b17882" />
          <stop offset=".28" stopColor="#dfb7b9" />
          <stop offset=".57" stopColor="#f1d6d4" />
          <stop offset=".8" stopColor="#c88f9a" />
          <stop offset="1" stopColor="#a76f7d" />
        </linearGradient>
        <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff" stopOpacity=".8" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="shadow" x="-100%" y="-50%" width="300%" height="250%">
          <feGaussianBlur stdDeviation="15" />
        </filter>
        <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
          <path
            d="M 36 0 L 0 0 0 36"
            fill="none"
            stroke="#b3a7a0"
            strokeWidth=".5"
            opacity=".24"
          />
        </pattern>
      </defs>
      <rect width="560" height="610" fill="url(#grid)" />
      <ellipse
        cx="291"
        cy="516"
        rx="119"
        ry="29"
        fill="#7f5a62"
        opacity=".13"
        filter="url(#shadow)"
      />
      <g transform="translate(282 297) rotate(24) translate(-282 -297)">
        <path
          d="M178 163C180 87 222 64 281 64C344 64 383 87 386 163L392 410C392 451 353 493 284 505C218 494 175 454 174 411Z"
          fill="#b27f88"
          transform="translate(-11 12)"
        />
        <path
          d="M178 163C180 87 222 64 281 64C344 64 383 87 386 163L392 410C392 451 353 493 284 505C218 494 175 454 174 411Z"
          fill="url(#shell)"
          stroke="#986671"
          strokeWidth="1"
        />
        <path
          d="M200 161C205 105 230 88 262 86C235 149 237 365 251 468C208 448 199 414 200 380Z"
          fill="url(#sheen)"
          opacity=".6"
        />
        <g fill="none" stroke="#825d67" opacity=".44" strokeWidth=".8">
          <path d="M181 150Q280 73 383 150M177 199Q280 122 387 199M176 249Q280 172 388 249M175 299Q280 222 390 299M175 349Q280 272 391 349M175 399Q280 322 391 399M185 444Q280 367 381 444M212 477Q280 411 355 478" />
          <path d="M218 87Q189 280 218 472M250 68Q227 280 251 495M281 65Q269 280 284 504M314 69Q319 280 317 495M347 84Q369 280 350 478" />
        </g>
        <path
          d="M178 163C180 87 222 64 281 64C344 64 383 87 386 163"
          fill="none"
          stroke="#fff6ee"
          strokeWidth="2"
          opacity=".7"
        />
      </g>
      <g fill="none" stroke="#8e7a79" strokeWidth=".75">
        <path d="M89 178H146L181 204" />
        <path d="M394 425L432 456H490" />
        <circle cx="181" cy="204" r="3" fill="#faf8f5" />
        <circle cx="394" cy="425" r="3" fill="#faf8f5" />
      </g>
      <g
        fontFamily="Arial,sans-serif"
        fontSize="9"
        letterSpacing="2"
        fill="#746565"
      >
        <text x="38" y="166">
          {t("SURFACE STUDY")}
        </text>
        <text x="431" y="477">
          {t("FORM / 01")}
        </text>
      </g>
    </svg>
  );
}

export default function App() {
  useLanguage();
  const [page, setPage] = useState<"home" | "lab" | "research">("home"),
    [step, setStep] = useState(0),
    [sessions, setSessions] = useState<Session[]>([]),
    [session, setSession] = useState<Session | null>(null),
    [newOpen, setNewOpen] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [health, setHealth] = useState<boolean | null>(null),
    [baseline, setBaseline] = useState<Generation>();
  const reload = useCallback(async () => {
    const items = await api<Session[]>("/sessions");
    setSessions(items);
    return items;
  }, []);
  useEffect(() => {
    api<{ status: string; cad_available: boolean }>("/health")
      .then((h) => setHealth(h.cad_available))
      .catch((e) =>
        setError(
          (browserRuntime
            ? "This browser could not open the local research workspace. "
            : "The local research service is unavailable. ") + message(e),
        ),
      );
    reload().catch((e) => setError(message(e)));
  }, [reload]);
  useEffect(() => {
    if (session?.id) localStorage.setItem("nailform:last-session", session.id);
  }, [session?.id]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page, step]);
  async function openSession(id: string, targetStep?: number) {
    setLoading(true);
    setError("");
    try {
      const s = await api<Session>("/sessions/" + id);
      setSession(s);
      setBaseline(undefined);
      setPage("lab");
      setStep(targetStep ?? (s.measurement ? 2 : 0));
      setMenuOpen(false);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  async function updateSession() {
    if (!session) return;
    const s = await api<Session>("/sessions/" + session.id);
    setSession(s);
    await reload();
  }
  async function deleteSession(id: string) {
    if (
      !window.confirm(
        t(
          "Delete this session, its private photographs, measurements, and model files? This cannot be undone.",
        ),
      )
    )
      return;
    try {
      await api("/sessions/" + id, { method: "DELETE" });
      if (session?.id === id) {
        setSession(null);
        setPage("research");
        localStorage.removeItem("nailform:last-session");
      }
      await reload();
    } catch (e) {
      setError(message(e));
    }
  }
  function navigate(target: "home" | "research") {
    setPage(target);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }
  return (
    <>
      <a className="skip-link" href="#main">
        {t("Skip to content")}
      </a>
      <header className="site-header">
        <button
          className="brand"
          onClick={() => navigate("home")}
          aria-label={t("NAILFORM LAB home")}
        >
          <span className="brand-symbol">n</span>
          <span>
            NAILFORM<span className="brand-lab">LAB</span>
          </span>
        </button>
        <nav
          className={menuOpen ? "open" : ""}
          aria-label={t("Main navigation")}
        >
          <button
            className={page === "home" ? "selected" : ""}
            onClick={() => navigate("home")}
          >
            {t("The approach")}
          </button>
          <button
            className={page === "lab" ? "selected" : ""}
            onClick={() =>
              session ? (setPage("lab"), setMenuOpen(false)) : setNewOpen(true)
            }
          >
            {t("Measurement lab")}
          </button>
          <button
            className={page === "research" ? "selected" : ""}
            onClick={() => navigate("research")}
          >
            {t("Research journal")}
          </button>
        </nav>
        <button className="header-cta" onClick={() => setNewOpen(true)}>
          {t("Start a session")}
          <ArrowUpRight size={16} />
        </button>
        <LanguageSwitcher />
        <button
          className="mobile-menu icon-button"
          aria-label={t("Toggle navigation")}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Menu size={23} />
        </button>
      </header>
      {error && (
        <div className="global-notice">
          <ErrorNotice text={error} onClose={() => setError("")} />
        </div>
      )}
      <main id="main" tabIndex={-1}>
        {page === "home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> {t("BEAUTY, MEASURED DIFFERENTLY")}
                </div>
                <h1>
                  {t("Designed for")}
                  <br />
                  {t("your nails.")}
                  <br />
                  <em>{t("Your shape.")}</em>
                </h1>
                <p className="hero-description">
                  {t(
                    "A study in individual form. Discover a more considered approach to artificial nails, beginning with the geometry that makes yours unique.",
                  )}
                </p>
                <button
                  className="button primary large"
                  onClick={() => setNewOpen(true)}
                >
                  {t("Start measurement")}
                  <ArrowUpRight size={20} />
                </button>
                <div className="hero-note">
                  <span className="status-dot" /> {t("RESEARCH EDITION · V1")}{" "}
                  <span className="hero-note-line" />{" "}
                  {t("Thoughtfully experimental.")}
                </div>
              </div>
              <div className="hero-art">
                <div className="art-topline">
                  <span>{t("THE ANATOMY OF INDIVIDUALITY")}</span>
                  <span>{t("001 — FORM STUDIES")}</span>
                </div>
                <ShellIllustration />
                <div className="art-bottomline">
                  <span>{t("PARAMETRIC SHELL EXPLORATION")}</span>
                  <span>{t("ILLUSTRATION / NOT A MEASUREMENT")}</span>
                </div>
                <div className="art-floating-note">
                  <span>
                    {t("Every curve,")}
                    <br />
                    {t("a new question.")}
                  </span>
                  <ArrowUpRight size={20} />
                </div>
              </div>
            </section>
            <div className="approach-strip">
              <span>{t("INDIVIDUAL BY NATURE.")}</span>
              <p>
                {t(
                  "Measured with care. Modeled with intention. Reviewed by people.",
                )}
              </p>
              <span>{t("NAILFORM / RESEARCH LAB")}</span>
            </div>
            <section className="approach-section">
              <div className="section-intro">
                <div>
                  <div className="eyebrow">{t("FROM OBSERVATION TO FORM")}</div>
                  <h2>
                    {t("A little guidance.")}
                    <br />
                    <em>{t("A closer understanding.")}</em>
                  </h2>
                </div>
                <p>
                  {t(
                    "No assumptions about a perfect fit. We bring photographs, calibrated measurements, and human judgment together, one nail at a time.",
                  )}
                </p>
              </div>
              <div className="approach-grid">
                {[
                  {
                    n: "01",
                    icon: <Camera />,
                    title: "Capture your perspective",
                    text: "Photograph one natural nail with gentle guidance. Add a known-size reference beside it.",
                  },
                  {
                    n: "02",
                    icon: <ScanLine />,
                    title: "Trace what is there",
                    text: "Calibrate the photograph and review its outline. See what is measured and what remains unknown.",
                  },
                  {
                    n: "03",
                    icon: <Layers />,
                    title: "Explore the form",
                    text: "Inspect a parametric 3D shell, adjust explicit research inputs, and export a laboratory prototype.",
                  },
                ].map((item) => (
                  <article key={item.n}>
                    <div className="approach-top">
                      <span>{item.n}</span>
                      {item.icon}
                    </div>
                    <h3>{t(item.title)}</h3>
                    <p>{t(item.text)}</p>
                  </article>
                ))}
              </div>
            </section>
            <section className="honesty-section">
              <div className="honesty-mark">
                <Microscope size={30} strokeWidth={1} />
              </div>
              <div>
                <div className="eyebrow">
                  {t("SCIENCE WITH ITS LIMITS IN VIEW")}
                </div>
                <h2>
                  {t("Beautiful possibilities.")}
                  <br />
                  <em>{t("Honest beginnings.")}</em>
                </h2>
                <p>
                  {t(
                    "This is a research instrument, not a promise of verified fit. Photographs provide calibrated 2D projections; curvature is manually specified in this edition. Every result keeps its provenance.",
                  )}
                </p>
                <ResearchNotice />
              </div>
              <button
                className="text-button"
                onClick={() => navigate("research")}
              >
                {t("Open the research journal")}
                <ArrowUpRight size={18} />
              </button>
            </section>
          </>
        )}
        {page === "lab" && session && (
          <div className="workspace">
            <div className="workspace-heading">
              <div>
                <button
                  className="back-link"
                  onClick={() => navigate("research")}
                >
                  <ChevronLeft size={15} />
                  {t("All sessions")}
                </button>
                <h1>{session.name}</h1>
                <div className="session-meta">
                  <Badge>{t(states[session.state] ?? session.state)}</Badge>
                  <span>
                    {browserRuntime
                      ? t("SAVED ON THIS DEVICE")
                      : t("PRIVATE WORKSPACE")}
                  </span>
                  <span>{date(session.updated_at)}</span>
                </div>
              </div>
              <button
                className="button subtle small"
                onClick={() => setNewOpen(true)}
              >
                <Plus size={16} />
                {t("New session")}
              </button>
            </div>
            <div className="workflow-nav" aria-label={t("Measurement steps")}>
              {[
                "Capture",
                "Calibrate & trace",
                "Geometry",
                "Professional review",
              ].map((title, index) => (
                <button
                  key={title}
                  aria-current={step === index ? "step" : undefined}
                  className={
                    step === index ? "current" : step > index ? "completed" : ""
                  }
                  onClick={() => setStep(index)}
                >
                  <span>
                    {step > index ? (
                      <Check size={13} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>{t(title)}</span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
            {step === 0 && (
              <Capture
                session={session}
                onUpdated={updateSession}
                onNext={() => setStep(1)}
              />
            )}
            {step === 1 && (
              <ContourEditor
                key={session.id}
                session={session}
                onMeasured={async () => {
                  await updateSession();
                  setStep(2);
                }}
              />
            )}
            {step === 2 && (
              <Geometry
                session={session}
                baseline={baseline}
                onGenerated={async () => {
                  if (session.latest_model) setBaseline(session.latest_model);
                  await updateSession();
                }}
                onBack={() => setStep(1)}
                onReview={() => setStep(3)}
                cadAvailable={health}
              />
            )}
            {step === 3 && (
              <Review
                session={session}
                onUpdated={updateSession}
                onDelete={() => deleteSession(session.id)}
              />
            )}
            <ResearchNotice />
          </div>
        )}
        {page === "research" && (
          <Research
            sessions={sessions}
            onOpen={openSession}
            onNew={() => setNewOpen(true)}
            onDelete={deleteSession}
            loading={loading}
          />
        )}
      </main>
      <footer className="site-footer">
        <div className="footer-brand">
          NAILFORM <span>LAB</span>
        </div>
        <span>{t("A RESEARCH PRACTICE IN INDIVIDUAL FORM.")}</span>
        <span>
          {browserRuntime
            ? t("Stored in this browser. No cloud sync.")
            : t("Private by default. Made for exploration.")}
        </span>
      </footer>
      {newOpen && (
        <NewSession
          onClose={() => setNewOpen(false)}
          onCreated={async (s) => {
            setSession(s);
            setStep(0);
            setPage("lab");
            setNewOpen(false);
            setBaseline(undefined);
            await reload();
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </>
  );
}

function NewSession({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (s: Session) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(() => t("My first nail study")),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const session = await api<Session>("/sessions", {
        method: "POST",
        body: JSON.stringify({ name, consent }),
      });
      onCreated(session);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="session-dialog"
      aria-labelledby="new-session-title"
      onCancel={onClose}
    >
      <button
        className="modal-close icon-button"
        onClick={onClose}
        aria-label={t("Close new session")}
      >
        <X />
      </button>
      <div className="eyebrow">{t("ONE NAIL. A CLOSER LOOK.")}</div>
      <h2 id="new-session-title">
        {t("Begin your")}
        <br />
        <em>{t("form study.")}</em>
      </h2>
      <p>
        {t(
          "Set aside a few minutes, soft light, and a reference of known size. We’ll guide you through each step.",
        )}
      </p>
      <form onSubmit={submit}>
        <label className="field-label" htmlFor="session-name">
          {t("Session name")}
        </label>
        <input
          id="session-name"
          autoFocus
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <div className="privacy-note">
          <ShieldCheck size={21} />
          <p>
            {browserRuntime
              ? t(
                  "Photographs and studies are stored in this browser’s IndexedDB on this device. They are not sent to GitHub. There is no cloud sync or backup; clearing site data removes them. You can delete a session and its stored files at any time.",
                )
              : t(
                  "Photographs and measurements stay in this local research workspace. No analytics or third-party image processing. You can delete a session and its files at any time.",
                )}
          </p>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          <span>
            {browserRuntime
              ? t(
                  "I agree to store photographs and measurements in this browser on this device for this experimental research session.",
                )
              : t(
                  "I agree to save photographs and measurements for this experimental research session.",
                )}{" "}
            {t(
              "I understand that generated objects are non-wearable laboratory prototypes.",
            )}
          </span>
        </label>
        {error && <ErrorNotice text={error} />}
        <button
          className="button primary full"
          type="submit"
          disabled={!consent || busy}
        >
          {busy ? t("Creating session…") : t("Enter the measurement lab")}
          <ArrowRight size={18} />
        </button>
      </form>
    </dialog>
  );
}

function Capture({
  session,
  onUpdated,
  onNext,
}: {
  session: Session;
  onUpdated: () => Promise<void>;
  onNext: () => void;
}) {
  const [view, setView] = useState<CaptureView>("top"),
    [cameraOpen, setCameraOpen] = useState(false),
    [facing, setFacing] = useState<"environment" | "user">("environment"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    input = useRef<HTMLInputElement>(null);
  const image = session.images?.filter((i) => i.view === view).at(-1),
    hasTop = session.images?.some((i) => i.view === "top");
  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!cameraOpen) return;
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Camera access needs a secure browser context (HTTPS or localhost). Please upload photographs instead.",
          );
        stream.current?.getTracks().forEach((t) => t.stop());
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
        }
      } catch (e) {
        if (!cancelled) {
          const name = e instanceof DOMException ? e.name : "";
          setError(
            name === "NotAllowedError"
              ? "Camera access was denied. Allow it in your browser settings, or upload a photograph below."
              : name === "NotFoundError"
                ? "No camera was found. You can upload an existing photograph."
                : message(e),
          );
          setCameraOpen(false);
        }
      }
    }
    start();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [cameraOpen, facing]);
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      await api<ImageRecord>(
        "/sessions/" + session.id + "/images?view=" + view,
        { method: "POST", body: data },
      );
      setCameraOpen(false);
      await onUpdated();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  function capture() {
    if (!video.current?.videoWidth) {
      setError("The camera is not ready yet. Wait for the live preview.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    canvas.getContext("2d")!.drawImage(video.current, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob)
          upload(new File([blob], view + ".jpg", { type: "image/jpeg" }));
        else
          setError(
            "The photograph could not be captured. Try uploading an image.",
          );
      },
      "image/jpeg",
      0.95,
    );
  }
  async function remove() {
    if (!image) return;
    setBusy(true);
    try {
      await api("/sessions/" + session.id + "/images/" + image.id, {
        method: "DELETE",
      });
      await onUpdated();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="step-intro">
        <div>
          <div className="eyebrow">{t("01 / OBSERVE")}</div>
          <h2>
            {t("A new perspective")}
            <br />
            <em>{t("on your natural shape.")}</em>
          </h2>
        </div>
        <p>
          {t(
            "Begin with the top view. Front and side views give your reviewer context; this edition does not reconstruct 3D curvature from photographs.",
          )}
        </p>
      </div>
      <div className="capture-layout">
        <div className="capture-main">
          <div className="capture-tabs">
            {views.map((v) => (
              <button
                key={v}
                className={view === v ? "active" : ""}
                onClick={() => {
                  setView(v);
                  setCameraOpen(false);
                  setError("");
                }}
              >
                <span>
                  {v === "top"
                    ? "01"
                    : v === "front"
                      ? "02"
                      : v === "side"
                        ? "03"
                        : "04"}
                </span>
                {captureViewLabel(v)}
                {session.images?.some((i) => i.view === v) && (
                  <CheckCircle2 size={14} />
                )}
              </button>
            ))}
          </div>
          <div className={`capture-stage ${cameraOpen ? "live" : ""}`}>
            {cameraOpen ? (
              <>
                <video ref={video} autoPlay playsInline muted />
                <div className="capture-overlay">
                  <div className={"finger-guide " + view} />
                  <span>{t("Keep the whole nail within the guide")}</span>
                </div>
                <span className="live-badge">
                  <span />
                  {t("LIVE PREVIEW")}
                </span>
              </>
            ) : image ? (
              <>
                <img
                  src={image.url}
                  alt={t("{view} view, privately captured for this session", {
                    view: captureViewLabel(view),
                  })}
                />
                <span className="image-badge">
                  {t("{width} × {height} px · {view}", {
                    width: image.width,
                    height: image.height,
                    view: captureViewLabel(view),
                  })}
                </span>
              </>
            ) : (
              <div className="capture-empty">
                <div className={"finger-guide " + view} />
                <div>
                  <span className="small-caps">{t(viewInfo[view].title)}</span>
                  <h3>
                    {t("A clear image.")}
                    <br />
                    {t("A careful beginning.")}
                  </h3>
                  <p>
                    {browserRuntime
                      ? t(
                          "Your photograph stays in this browser on this device.",
                        )
                      : t("Your photograph stays private in this workspace.")}
                  </p>
                </div>
              </div>
            )}
            {busy && (
              <div className="stage-loading" role="status">
                <span className="spinner" />
                {t("Saving your photograph…")}
              </div>
            )}
          </div>
          <div className="capture-actions">
            {cameraOpen ? (
              <>
                <button
                  className="button primary"
                  onClick={capture}
                  disabled={busy}
                >
                  <Camera size={18} />
                  {t("Capture photograph")}
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Switch camera")}
                  onClick={() =>
                    setFacing(facing === "environment" ? "user" : "environment")
                  }
                >
                  <SwitchCamera size={21} />
                </button>
                <button
                  className="button subtle"
                  onClick={() => setCameraOpen(false)}
                >
                  {t("Close camera")}
                </button>
              </>
            ) : (
              <>
                <button
                  className="button primary"
                  onClick={() => {
                    setError("");
                    setCameraOpen(true);
                  }}
                  disabled={busy}
                >
                  <Camera size={18} />
                  {image ? t("Retake photograph") : t("Open camera")}
                </button>
                <button
                  className="button secondary"
                  onClick={() => input.current?.click()}
                  disabled={busy}
                >
                  <Upload size={17} />
                  {image ? t("Replace image") : t("Upload a photo")}
                </button>
                {image && (
                  <button
                    className="icon-button danger"
                    aria-label={t("Delete this photograph")}
                    onClick={remove}
                    disabled={busy}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </>
            )}
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="visually-hidden"
              aria-label={t("Upload nail photograph")}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />
          </div>
          {error && <ErrorNotice text={error} />}
        </div>
        <aside className="capture-guide">
          <div className="eyebrow">{t("A FEW SMALL DETAILS")}</div>
          <h3>{t(viewInfo[view].title)}</h3>
          <p>{t(viewInfo[view].description)}</p>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>{t("Soft, even light")}</strong>
                <p>
                  {t(
                    "Near a window is ideal. Avoid glare, flash, and deep shadows.",
                  )}
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>{t("Steady and in focus")}</strong>
                <p>
                  {t(
                    "Support your hand. Keep polish and objects from obscuring the nail boundary.",
                  )}
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>{t("A meaningful reference")}</strong>
                <p>
                  {t(
                    "Place a flat ruler or known-size marker beside the nail, not above or behind it.",
                  )}
                </p>
              </div>
            </li>
          </ol>
          <div className="soft-note">
            <ScanLine size={18} />
            <p>
              {t(
                "A scale reference does not recover a curved surface from one photograph.",
              )}
            </p>
          </div>
        </aside>
      </div>
      {image && (
        <div className="quality-strip">
          <div>
            <span className="eyebrow">{t("IMAGE QUALITY INDICATORS")}</span>
            <strong>
              {image.quality?.warnings?.length
                ? t("Review this capture")
                : t("No basic quality flags")}
            </strong>
          </div>
          <div>
            <span>{t("Focus indicator")}</span>
            <strong>
              {image.quality?.blur_score != null
                ? formatNumber(image.quality.blur_score, 1)
                : "—"}
            </strong>
          </div>
          <div>
            <span>{t("Mean brightness / 255")}</span>
            <strong>
              {image.quality?.mean_brightness != null
                ? formatNumber(image.quality.mean_brightness, 0)
                : "—"}
            </strong>
          </div>
          <p>
            {image.quality?.warnings?.length
              ? image.quality.warnings.map((warning) => t(warning)).join(" · ")
              : t(
                  "Heuristic checks only. They do not establish accurate framing, calibration, or measurement.",
                )}
          </p>
        </div>
      )}
      <div className="step-bottom">
        <p>
          {t(
            "Saved views: {count}. A top photograph is required to continue.",
            { count: session.images?.length ?? 0 },
          )}
        </p>
        <button
          className="button primary"
          disabled={!hasTop || busy}
          onClick={onNext}
        >
          {t("Calibrate & trace")}
          <ArrowRight size={18} />
        </button>
      </div>
    </>
  );
}

const parameterLabels: {
  key: keyof Omit<GeometryParameters, "tip_shape">;
  label: string;
  min: number;
  max: number;
  step: number;
  help: string;
}[] = [
  {
    key: "length_mm",
    label: "Nail bed length",
    min: 4,
    max: 40,
    step: 0.1,
    help: "Starts from the calibrated 2D projection.",
  },
  {
    key: "width_mm",
    label: "Maximum width",
    min: 3,
    max: 30,
    step: 0.1,
    help: "Starts from the calibrated 2D projection.",
  },
  {
    key: "transverse_rise_mm",
    label: "Transverse rise",
    min: 0,
    max: 6,
    step: 0.1,
    help: "Manual curvature input. Not reconstructed.",
  },
  {
    key: "longitudinal_rise_mm",
    label: "Longitudinal rise",
    min: 0,
    max: 4,
    step: 0.1,
    help: "Manual curvature input. Not reconstructed.",
  },
  {
    key: "thickness_mm",
    label: "Nominal normal thickness",
    min: 0.25,
    max: 1.5,
    step: 0.05,
    help: "Approximate surface-normal offset; sampled checks do not establish global minimum thickness.",
  },
  {
    key: "extension_mm",
    label: "Free-edge extension",
    min: 0,
    max: 15,
    step: 0.5,
    help: "Added beyond the measured nail bed.",
  },
  {
    key: "asymmetry_mm",
    label: "Lateral asymmetry",
    min: -2,
    max: 2,
    step: 0.1,
    help: "Manual lateral offset; does not infer anatomy.",
  },
];
function Geometry({
  session,
  onGenerated,
  onBack,
  onReview,
  cadAvailable,
  baseline,
}: {
  session: Session;
  onGenerated: () => Promise<void>;
  onBack: () => void;
  onReview: () => void;
  cadAvailable: boolean | null;
  baseline?: Generation;
}) {
  const measurement = session.measurement;
  const initial: GeometryParameters = session.latest_model?.parameters ?? {
    length_mm: measurement?.length_mm ?? 14,
    width_mm: measurement?.width_mm ?? 11,
    transverse_rise_mm: 1.2,
    longitudinal_rise_mm: 0.4,
    thickness_mm: 0.5,
    extension_mm: 2,
    tip_shape: "oval",
    asymmetry_mm: 0,
  };
  const [parameters, setParameters] = useState(initial),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showReport, setShowReport] = useState(false);
  useEffect(() => {
    if (measurement && !session.latest_model) {
      setParameters((p) => ({
        ...p,
        length_mm: measurement.length_mm,
        width_mm: measurement.width_mm,
      }));
      setConfirmed(false);
    }
  }, [measurement, session.latest_model]);
  async function generate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api<Generation>("/sessions/" + session.id + "/generate", {
        method: "POST",
        body: JSON.stringify({ parameters, review_confirmed: confirmed }),
      });
      await onGenerated();
      setConfirmed(false);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const dirty =
    session.latest_model &&
    Object.entries(parameters).some(
      ([key, value]) =>
        value !==
        session.latest_model!.parameters[key as keyof GeometryParameters],
    );
  const facetedGeometry =
    session.latest_model?.metadata.geometry_kind === "faceted_parametric_shell";
  const geometryEngine = session.latest_model?.metadata.engine;
  if (!measurement)
    return (
      <div className="empty-state">
        <ScanLine size={38} strokeWidth={1} />
        <h2>{t("First, establish a scale.")}</h2>
        <p>
          {t(
            "Trace the nail and calibrate its photograph before generating geometry. No physical dimensions will be invented.",
          )}
        </p>
        <button className="button primary" onClick={onBack}>
          {t("Open calibration")}
          <ArrowRight size={18} />
        </button>
      </div>
    );
  return (
    <>
      <div className="step-intro">
        <div>
          <div className="eyebrow">{t("03 / UNDERSTAND & EXPLORE")}</div>
          <h2>
            {t("From a measured outline")}
            <br />
            <em>{t("to a considered form.")}</em>
          </h2>
        </div>
        <p>
          {t(
            "A calibrated projection is the beginning. Inspect the measured values, specify the missing geometry, then generate a laboratory shell.",
          )}
        </p>
      </div>
      <div className="measurement-results">
        <MeasurementCard
          title={t("Projected length")}
          value={measurement.length_mm}
          label={t("Calibrated 2D")}
        />
        <MeasurementCard
          title={t("Maximum projected width")}
          value={measurement.width_mm}
          label={t("Calibrated 2D")}
        />
        <div className="result-card unknown">
          <span>{t("Surface curvature")}</span>
          <strong>{t("Unknown")}</strong>
          <Badge>{t("Manual input required")}</Badge>
        </div>
        <div className="result-card status">
          <span>{t("Measurement status")}</span>
          <strong>
            {session.feedback?.contour_accepted
              ? t("Contour reviewed")
              : t("Review needed")}
          </strong>
          <span className="fine-print">
            {t("Physical fit has not been validated.")}
          </span>
        </div>
      </div>
      <div className="measurement-caveat">
        <AlertCircle size={17} />
        <p>
          {t(
            measurement.uncertainty ||
              "The reference and nail are assumed coplanar. Perspective and curved-surface error are not quantified.",
          )}{" "}
          {measurement.warnings?.map((warning) => t(warning)).join(" ")}
        </p>
      </div>
      <div className="geometry-layout">
        <div className="model-column">
          <Viewer model={session.latest_model} comparison={baseline} />
          {dirty && (
            <div className="model-stale">
              <AlertCircle size={16} />
              {t(
                "Parameters have changed. Generate again to update the displayed mesh and downloads.",
              )}
            </div>
          )}
          <div className="model-caption">
            <div>
              <span className="eyebrow">
                {session.latest_model
                  ? t("GENERATED LABORATORY SHELL")
                  : t("PARAMETRIC RESEARCH GEOMETRY")}
              </span>
              <p>
                {t(
                  "Approximation from dimensions and explicit design inputs. Not a reconstructed nail surface or verified fit.",
                )}
              </p>
            </div>
            <Badge tone="rose">{t("EXPERIMENTAL")}</Badge>
          </div>
          {session.latest_model && (
            <div className="export-panel">
              <div>
                <h3>{t("Take the geometry further.")}</h3>
                <p>
                  {t(
                    "Exported from the same generated geometry shown above. Millimeters throughout.",
                  )}
                </p>
              </div>
              <div className="export-engine-note">
                <span className="eyebrow">
                  {facetedGeometry
                    ? t("BROWSER GEOMETRY · FACETED SURFACES")
                    : t("PYTHON CAD · SMOOTH SURFACES")}
                </span>
                <p>
                  {facetedGeometry
                    ? t(
                        "STL and STEP use the same triangular mesh. STEP contains planar faces, not smooth spline surfaces. Browser mesh checks do not replace CAD-kernel validation. The local Python workflow retains the smooth CadQuery model.",
                      )
                    : t(
                        "STEP preserves the smooth CadQuery surface model; STL and this viewer use its tessellated mesh. Automated checks are recorded in the validation report.",
                      )}
                </p>
                {typeof geometryEngine === "string" && (
                  <span className="fine-print">
                    {t("Engine:")} {t(geometryEngine)}
                  </span>
                )}
              </div>
              <div className="download-buttons">
                {(["stl", "step"] as const).map((format) => (
                  <a
                    key={format}
                    className="button secondary"
                    href={session.latest_model?.downloads[format]}
                    download={`nailform-lab-model.${format}`}
                  >
                    <Download size={16} />
                    {format.toUpperCase()}
                  </a>
                ))}
              </div>
              <div className="export-small">
                <a
                  href={session.latest_model.downloads.parameters}
                  download="nailform-lab-parameters.json"
                >
                  {t("Parameters JSON")}
                  <ExternalLink size={12} />
                </a>
                <a
                  href={session.latest_model.downloads.report}
                  download="nailform-lab-validation.json"
                >
                  {t("Validation report")}
                  <ExternalLink size={12} />
                </a>
                <button onClick={() => setShowReport(!showReport)}>
                  {t(showReport ? "Hide checks" : "Inspect checks")}
                </button>
              </div>
              {showReport && (
                <pre className="validation-report">
                  {JSON.stringify(
                    {
                      metadata: session.latest_model.metadata,
                      validation: session.latest_model.validation,
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>
          )}
        </div>
        <form className="parameter-panel" onSubmit={generate}>
          <div className="panel-header">
            <SlidersHorizontal size={18} />
            <h3>{t("Define the form")}</h3>
          </div>
          <p className="panel-description">
            {t(
              "Values below are research inputs. Curvature is not measured by this workflow.",
            )}
          </p>
          {parameterLabels.map((field) => (
            <div className="parameter-field" key={field.key}>
              <label htmlFor={field.key}>
                {t(field.label)}
                <Badge
                  tone={
                    (field.key === "length_mm" &&
                      parameters.length_mm === measurement.length_mm) ||
                    (field.key === "width_mm" &&
                      parameters.width_mm === measurement.width_mm)
                      ? "green"
                      : "neutral"
                  }
                >
                  {(field.key === "length_mm" &&
                    parameters.length_mm === measurement.length_mm) ||
                  (field.key === "width_mm" &&
                    parameters.width_mm === measurement.width_mm)
                    ? t("2D measured")
                    : t("Manual")}
                </Badge>
              </label>
              <div className="number-input">
                <input
                  id={field.key}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={
                    field.key === "length_mm" || field.key === "width_mm"
                      ? "any"
                      : field.step
                  }
                  value={
                    Number.isFinite(parameters[field.key])
                      ? parameters[field.key]
                      : ""
                  }
                  required
                  onChange={(e) => {
                    setParameters({
                      ...parameters,
                      [field.key]: e.target.valueAsNumber,
                    });
                    setConfirmed(false);
                  }}
                />
                <span>mm</span>
              </div>
              <span className="field-help">{t(field.help)}</span>
            </div>
          ))}
          <div className="parameter-field">
            <label htmlFor="tip-shape">
              {t("Extension shape")}
              <Badge>{t("Manual")}</Badge>
            </label>
            <select
              id="tip-shape"
              value={parameters.tip_shape}
              onChange={(e) => {
                setParameters({
                  ...parameters,
                  tip_shape: e.target.value as GeometryParameters["tip_shape"],
                });
                setConfirmed(false);
              }}
            >
              <option value="oval">{t("Soft oval")}</option>
              <option value="squoval">{t("Squoval")}</option>
              <option value="almond">{t("Almond")}</option>
            </select>
          </div>
          <label className="checkbox-label review-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            <span>
              {t(
                "I have reviewed the 2D measurements and manual inputs. This is an unvalidated laboratory prototype.",
              )}
            </span>
          </label>
          {error && <ErrorNotice text={error} />}
          <button
            className="button primary full"
            type="submit"
            disabled={!confirmed || busy || cadAvailable === false}
          >
            {busy ? (
              <>
                <span className="spinner" />
                {t("Generating CAD…")}
              </>
            ) : (
              <>
                {t("Generate laboratory model")}
                <MoveUpRight size={17} />
              </>
            )}
          </button>
          {cadAvailable === false && (
            <p className="field-help error-text">
              {browserRuntime
                ? t("Geometry generation is unavailable in this browser.")
                : t("The CAD dependency is unavailable on the local service.")}
            </p>
          )}
          <p className="fine-print">
            {t(
              "A new version is saved with each generation. Generation can take a few seconds.",
            )}
          </p>
        </form>
      </div>
      <div className="step-bottom">
        <button className="text-button" onClick={onBack}>
          <ChevronLeft size={16} />
          {t("Review the contour")}
        </button>
        <button className="button primary" onClick={onReview}>
          {t("Professional review")}
          <ArrowRight size={17} />
        </button>
      </div>
    </>
  );
}
function MeasurementCard({
  title,
  value,
  label,
}: {
  title: string;
  value: number;
  label: string;
}) {
  return (
    <div className="result-card">
      <span>{t(title)}</span>
      <strong>
        {formatNumber(value, 2)}
        <small> mm</small>
      </strong>
      <Badge tone="green">{t(label)}</Badge>
    </div>
  );
}

function Review({
  session,
  onUpdated,
  onDelete,
}: {
  session: Session;
  onUpdated: () => Promise<void>;
  onDelete: () => void;
}) {
  const [feedback, setFeedback] = useState<Feedback>(
      session.feedback ?? emptyFeedback,
    ),
    [state, setState] = useState(session.state),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [selectedPhoto, setSelectedPhoto] = useState(
      session.measurement?.image_id ??
        session.images?.filter((i) => i.view === "top").at(-1)?.id ??
        session.images?.at(-1)?.id,
    ),
    [compareModel, setCompareModel] = useState<Generation>();
  useEffect(() => {
    setFeedback(session.feedback ?? emptyFeedback);
    setState(session.state);
  }, [session.id, session.updated_at]);
  const issues = [
    "Excessive transverse curvature",
    "Excessive longitudinal curvature",
    "Width mismatch",
    "Uneven sidewalls",
    "Cuticle contour mismatch",
    "Thickness concern",
    "Other geometric issue",
  ];
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/sessions/" + session.id, {
        method: "PATCH",
        body: JSON.stringify({ feedback, state }),
      });
      await onUpdated();
      setSaved(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function compare(id: string) {
    try {
      const m = await api<Generation>(
        "/sessions/" + session.id + "/models/" + id,
      );
      setCompareModel(m);
    } catch (e) {
      setError(message(e));
    }
  }
  const photo = session.images?.find((i) => i.id === selectedPhoto);
  const modelVersions =
    session.versions?.filter(
      (v) => v.model_id && v.model_id !== session.latest_model?.id,
    ) ?? [];
  return (
    <>
      <div className="step-intro">
        <div>
          <div className="eyebrow">{t("04 / HUMAN JUDGMENT")}</div>
          <h2>
            {t("A closer review.")}
            <br />
            <em>{t("A better next iteration.")}</em>
          </h2>
        </div>
        <p>
          {t(
            "Record what the photographs and geometry support. A technically valid CAD solid is different from a design evaluated against an independent reference.",
          )}
        </p>
      </div>
      <div className="review-layout">
        <div>
          <div className="review-photo">
            <div className="panel-header">
              <ImageIcon size={18} />
              <h3>{t("Capture evidence")}</h3>
            </div>
            {photo ? (
              <PhotoAnnotations
                key={photo.id}
                session={session}
                image={photo}
                onUpdated={onUpdated}
              />
            ) : (
              <div className="compact-empty">
                {t("No photographs in this session.")}
              </div>
            )}
            <div className="photo-thumbnails">
              {session.images?.map((i) => (
                <button
                  className={i.id === selectedPhoto ? "active" : ""}
                  key={i.id}
                  onClick={() => setSelectedPhoto(i.id)}
                >
                  <img src={i.url} alt="" />
                  {captureViewLabel(i.view)}
                </button>
              ))}
            </div>
          </div>
          <div className="review-provenance">
            <h3>{t("What do we actually know?")}</h3>
            <dl>
              <div>
                <dt>{t("Projected length")}</dt>
                <dd>
                  {session.measurement
                    ? formatNumber(session.measurement.length_mm, 2) + " mm"
                    : t("Unknown")}
                  <Badge tone="green">
                    {session.measurement
                      ? t("Calibrated 2D")
                      : t("Unavailable")}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>{t("Projected width")}</dt>
                <dd>
                  {session.measurement
                    ? formatNumber(session.measurement.width_mm, 2) + " mm"
                    : t("Unknown")}
                  <Badge tone="green">
                    {session.measurement
                      ? t("Calibrated 2D")
                      : t("Unavailable")}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>{t("Transverse curvature")}</dt>
                <dd>
                  {t("Not measured")}
                  <Badge>{t("Manual CAD input")}</Badge>
                </dd>
              </div>
              <div>
                <dt>{t("Surface reconstruction")}</dt>
                <dd>{t("Unavailable")}</dd>
              </div>
              <div>
                <dt>{t("Physical fit")}</dt>
                <dd>{t("Not validated")}</dd>
              </div>
            </dl>
          </div>
        </div>
        <form className="review-form" onSubmit={save}>
          <div className="panel-header">
            <Microscope size={18} />
            <h3>{t("Professional observations")}</h3>
          </div>
          <label className="field-label" htmlFor="review-state">
            {t("Research state")}
          </label>
          <select
            id="review-state"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setSaved(false);
            }}
          >
            {Object.entries(states).map(([key, label]) => (
              <option key={key} value={key}>
                {t(label)}
              </option>
            ))}
          </select>
          <p className="field-help">
            {t(
              "These states record research progress, never permission for human wear.",
            )}
          </p>
          <div className="review-checks">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={feedback.contour_accepted}
                onChange={(e) => {
                  setFeedback({
                    ...feedback,
                    contour_accepted: e.target.checked,
                  });
                  setSaved(false);
                }}
              />
              <span>
                {t("The manually reviewed contour appears appropriate.")}
              </span>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={feedback.geometry_accepted}
                onChange={(e) => {
                  setFeedback({
                    ...feedback,
                    geometry_accepted: e.target.checked,
                  });
                  setSaved(false);
                }}
              />
              <span>
                {t(
                  "The model geometry has been inspected, with limitations recorded below.",
                )}
              </span>
            </label>
          </div>
          <fieldset className="issues-list">
            <legend>{t("Geometric observations")}</legend>
            {issues.map((issue) => (
              <label className="checkbox-label" key={issue}>
                <input
                  type="checkbox"
                  checked={feedback.issues.includes(issue)}
                  onChange={(e) => {
                    setFeedback({
                      ...feedback,
                      issues: e.target.checked
                        ? [...feedback.issues, issue]
                        : feedback.issues.filter((x) => x !== issue),
                    });
                    setSaved(false);
                  }}
                />
                <span>{t(issue)}</span>
              </label>
            ))}
          </fieldset>
          <label className="field-label" htmlFor="review-notes">
            {t("Notes & reference observations")}
          </label>
          <textarea
            id="review-notes"
            rows={5}
            maxLength={10000}
            value={feedback.notes}
            onChange={(e) => {
              setFeedback({ ...feedback, notes: e.target.value });
              setSaved(false);
            }}
            placeholder={t(
              "Describe the observed geometry, independent reference used, and next adjustment…",
            )}
          />
          {error && <ErrorNotice text={error} />}
          <button className="button primary full" disabled={busy} type="submit">
            {busy ? (
              t("Saving…")
            ) : saved ? (
              <>
                <Check size={17} />
                {t("Review saved")}
              </>
            ) : (
              <>
                {t("Save professional review")}
                <Check size={17} />
              </>
            )}
          </button>
        </form>
      </div>
      <ExperimentPanel
        key={session.id}
        session={session}
        onUpdated={onUpdated}
      />
      {session.latest_model && (
        <section className="review-model">
          <div className="section-intro">
            <div>
              <div className="eyebrow">{t("GEOMETRY EVIDENCE")}</div>
              <h3>{t("The latest form.")}</h3>
            </div>
            {modelVersions.length > 0 && (
              <select
                aria-label={t("Compare a prior model version")}
                onChange={(e) =>
                  e.target.value
                    ? compare(e.target.value)
                    : setCompareModel(undefined)
                }
                defaultValue=""
              >
                <option value="">{t("Choose a baseline version")}</option>
                {modelVersions.map((v, i) => (
                  <option key={v.id} value={v.model_id}>
                    {i + 1} · {date(v.created_at)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <Viewer model={session.latest_model} comparison={compareModel} />
        </section>
      )}
      <section className="version-section">
        <div className="panel-header">
          <Clock3 size={18} />
          <h3>{t("Research history")}</h3>
        </div>
        {session.versions?.length ? (
          <ol>
            {[...session.versions].reverse().map((v) => (
              <li key={v.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>{t(v.summary || v.kind.replaceAll("_", " "))}</strong>
                  <span>
                    {date(v.created_at)} · {t(v.kind.replaceAll("_", " "))}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p>
            {t(
              "No saved revisions yet. Calibration, generation, and review will appear here.",
            )}
          </p>
        )}
      </section>
      <div className="delete-section">
        <div>
          <h3>{t("Your data, your decision.")}</h3>
          <p>
            {t(
              "Remove this session, its photographs, measurements, and exported models.",
            )}
          </p>
        </div>
        <button className="button secondary danger" onClick={onDelete}>
          <Trash2 size={16} />
          {t("Delete session")}
        </button>
      </div>
    </>
  );
}

function representativePhoto(session: Session) {
  return (
    session.images.find(
      (image) => image.id === session.measurement?.image_id,
    ) ??
    session.images.filter((image) => image.view === "top").at(-1) ??
    session.images.at(-1)
  );
}

function Research({
  sessions,
  onOpen,
  onNew,
  onDelete,
  loading,
}: {
  sessions: Session[];
  onOpen: (id: string, step?: number) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  const measured = sessions.filter((s) => s.measurement),
    models = sessions.filter((s) => s.latest_model),
    images = sessions.reduce((a, s) => a + (s.images?.length ?? 0), 0),
    qualityFlags = sessions.reduce(
      (a, s) =>
        a + (s.images?.filter((i) => i.quality?.warnings?.length).length ?? 0),
      0,
    );
  return (
    <div className="workspace research-workspace">
      <div className="research-heading">
        <div>
          <div className="eyebrow">{t("THE RESEARCH JOURNAL")}</div>
          <h1>
            {t("Small observations.")}
            <br />
            <em>{t("Meaningful progress.")}</em>
          </h1>
          <p>
            {browserRuntime
              ? t(
                  "A record saved in this browser on this device. Every number below comes from saved sessions, not simulated customer data.",
                )
              : t(
                  "A private record of this workspace. Every number below comes from saved sessions, not simulated customer data.",
                )}
          </p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={17} />
          {t("New form study")}
        </button>
      </div>
      {browserRuntime && (
        <div className="storage-notice">
          <ShieldCheck size={18} />
          <p>
            {t(
              "Studies and photographs are saved in this browser’s IndexedDB on this device. Photos are not sent to GitHub. There is no cloud sync or backup; clearing site data removes these studies. Delete a session below to remove its stored data.",
            )}
          </p>
        </div>
      )}
      <div className="research-metrics">
        {[
          {
            label: "Saved sessions",
            value: sessions.length,
            note: "One nail at a time",
          },
          {
            label: "Calibrated studies",
            value: measured.length,
            note: "2D photographic method",
          },
          {
            label: "Photographs saved",
            value: images,
            note: t("Quality flags: {count}", { count: qualityFlags }),
          },
          {
            label: "Sessions with CAD",
            value: models.length,
            note: "Experimental laboratory geometry",
          },
        ].map((m) => (
          <div key={m.label}>
            <span>{t(m.label)}</span>
            <strong>{m.value.toString().padStart(2, "0")}</strong>
            <p>{t(m.note)}</p>
          </div>
        ))}
      </div>
      <ResearchEvidence sessions={sessions} />
      <div className="session-list-heading">
        <h2>
          {t("Your form studies")}{" "}
          <span>{sessions.length.toString().padStart(2, "0")}</span>
        </h2>
        <Badge>
          {browserRuntime
            ? t("THIS BROWSER · THIS DEVICE")
            : t("PRIVATE · THIS BROWSER WORKSPACE")}
        </Badge>
      </div>
      {sessions.length ? (
        <div className="session-list">
          {[...sessions]
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .map((s) => (
              <article className="session-row" key={s.id}>
                <button
                  className="session-open"
                  onClick={() => onOpen(s.id)}
                  disabled={loading}
                >
                  <div className="session-thumb">
                    {representativePhoto(s) ? (
                      <img src={representativePhoto(s)?.url} alt="" />
                    ) : (
                      <ScanLine size={26} strokeWidth={1} />
                    )}
                  </div>
                  <div className="session-details">
                    <h3>{s.name}</h3>
                    <span>
                      {date(s.updated_at)} ·{" "}
                      {t("Views: {count}", { count: s.images?.length ?? 0 })}
                    </span>
                  </div>
                  <Badge>{t(states[s.state] ?? s.state)}</Badge>
                  <span className="session-summary">
                    {s.measurement
                      ? formatNumber(s.measurement.length_mm, 2) +
                        " × " +
                        formatNumber(s.measurement.width_mm, 2) +
                        " mm"
                      : t("Awaiting calibration")}
                    <small>
                      {s.measurement
                        ? t("Calibrated 2D projection")
                        : t("No measurements inferred")}
                    </small>
                  </span>
                  <ArrowUpRight size={22} />
                </button>
                <button
                  className="icon-button danger"
                  onClick={() => onDelete(s.id)}
                  aria-label={t("Delete session {name}", { name: s.name })}
                >
                  <Trash2 size={17} />
                </button>
              </article>
            ))}
        </div>
      ) : (
        <div className="journal-empty">
          <div className="journal-empty-icon">
            <ScanLine size={38} strokeWidth={1} />
          </div>
          <span className="eyebrow">{t("A CLEAN PAGE")}</span>
          <h2>
            {t("Every study begins")}
            <br />
            <em>{t("with a closer look.")}</em>
          </h2>
          <p>
            {t(
              "Your photographs, measurements, geometry revisions, and professional notes will live here.",
            )}
          </p>
          <button className="button primary" onClick={onNew}>
            {t("Start your first study")}
            <ArrowUpRight size={18} />
          </button>
        </div>
      )}
      <div className="research-methods">
        <div>
          <div className="eyebrow">{t("METHOD REGISTER")}</div>
          <h3>{t("What this edition can establish.")}</h3>
          <p>
            {t(
              "Future experiments should compare independently measured references and repeated captures. No accuracy or repeatability claims are established here.",
            )}
          </p>
        </div>
        <div className="method-list">
          <div>
            <span>A</span>
            <div>
              <strong>{t("Calibrated photographs")}</strong>
              <p>
                {t(
                  "2D projected length, width, and sectional widths. Reference coplanarity is assumed.",
                )}
              </p>
            </div>
            <Badge tone="green">{t("Implemented")}</Badge>
          </div>
          <div>
            <span>B</span>
            <div>
              <strong>{t("Touch & slide")}</strong>
              <p>
                {t(
                  "Not validated or enabled. Display pixels do not establish physical millimeters.",
                )}
              </p>
            </div>
            <Badge>{t("Research only")}</Badge>
          </div>
          <div>
            <span>C</span>
            <div>
              <strong>{t("Multi-view recovery")}</strong>
              <p>
                {t(
                  "Complementary images are saved for review. Automatic 3D recovery is not implemented.",
                )}
              </p>
            </div>
            <Badge>{t("Research only")}</Badge>
          </div>
        </div>
      </div>
      <ResearchNotice />
    </div>
  );
}
