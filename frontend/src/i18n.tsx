import { useSyncExternalStore } from "react";
import { appEl } from "./locales/app.el";
import { labEl } from "./locales/lab.el";
import { engineEl } from "./locales/engine.el";

export type Language = "el" | "en";
type Values = Record<string, string | number>;
const storageKey = "nailform:language";
const listeners = new Set<() => void>();
const normalize = (source: string) => source.replace(/\s+/g, " ").trim();
const dictionary: Record<string, string> = Object.fromEntries(
  Object.entries({ ...appEl, ...labEl, ...engineEl }).map(([key, value]) => [
    normalize(key),
    value,
  ]),
);
let language: Language = "el";
try {
  if (globalThis.localStorage?.getItem(storageKey) === "en") language = "en";
} catch {
  /* Language changes still work when preference storage is unavailable. */
}

function applyDocumentLanguage() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.title =
    language === "el"
      ? "NAILFORM LAB — Το δικό σου σχήμα"
      : "NAILFORM LAB — A study in individual form";
  const description = document.querySelector('meta[name="description"]');
  description?.setAttribute(
    "content",
    language === "el"
      ? "NAILFORM LAB. Πειραματική μελέτη της γεωμετρίας των νυχιών, με βαθμονομημένες φωτογραφίες, σαφή προέλευση μετρήσεων και τρισδιάστατα εργαστηριακά πρωτότυπα."
      : "NAILFORM LAB. A careful, experimental approach to nail geometry. Calibrated photographs, transparent measurements, and inspectable 3D laboratory prototypes.",
  );
}
applyDocumentLanguage();

export function getLanguage(): Language {
  return language;
}
export function setLanguage(next: Language) {
  if (next === language) return;
  language = next;
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    /* Preference is optional. */
  }
  applyDocumentLanguage();
  listeners.forEach((listener) => listener());
}
export function useLanguage(): Language {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    getLanguage,
    () => "el",
  );
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) return;
    const next: Language = event.newValue === "en" ? "en" : "el";
    if (next !== language) {
      language = next;
      applyDocumentLanguage();
      listeners.forEach((listener) => listener());
    }
  });
}

const escapePattern = (source: string) =>
  source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(dictionary).flatMap(([source, target]) => {
  const keys: string[] = [];
  const pieces = source.split(/(\{[a-zA-Z_]\w*\})/g);
  if (
    pieces.length === 1 ||
    pieces.every((piece) => !piece || /^\{\w+\}$/.test(piece))
  )
    return [];
  const regex = pieces
    .map((piece) => {
      if (/^\{\w+\}$/.test(piece)) {
        keys.push(piece.slice(1, -1));
        return "(.+?)";
      }
      return escapePattern(piece);
    })
    .join("");
  return [{ regex: new RegExp("^" + regex + "$"), keys, target }];
});
function interpolate(source: string, values: Values) {
  return source.replace(/\{([a-zA-Z_]\w*)\}/g, (token, key: string) =>
    values[key] === undefined ? token : String(values[key]),
  );
}
function translate(source: string, values: Values, depth: number): string {
  const key = normalize(source);
  if (language === "en") return interpolate(source, values);
  if (dictionary[key] !== undefined)
    return interpolate(dictionary[key], values);
  for (const pattern of patterns) {
    const match = pattern.regex.exec(key);
    if (!match) continue;
    const captures: Values = {};
    pattern.keys.forEach((name, index) => {
      const value = match[index + 1];
      captures[name] =
        depth < 2
          ? value
              .split(", ")
              .map((part) => translate(part, {}, depth + 1))
              .join(", ")
          : value;
    });
    return interpolate(pattern.target, { ...captures, ...values });
  }
  return interpolate(source, values);
}
/** Translate UI-owned text only. User notes, names, measurements and export keys remain intact. */
export function t(
  source: string | number | null | undefined,
  values: Values = {},
): string {
  return translate(source == null ? "" : String(source), values, 0);
}
export function formatNumber(
  value: number,
  digitsOrOptions: number | Intl.NumberFormatOptions = 2,
): string {
  const options =
    typeof digitsOrOptions === "number"
      ? {
          minimumFractionDigits: digitsOrOptions,
          maximumFractionDigits: digitsOrOptions,
        }
      : digitsOrOptions;
  return new Intl.NumberFormat(
    language === "el" ? "el-GR" : "en-GB",
    options,
  ).format(value);
}
export function LanguageSwitcher() {
  const current = useLanguage();
  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={current === "el" ? "Γλώσσα" : "Language"}
    >
      <button
        type="button"
        aria-label="Ελληνικά"
        lang="el"
        aria-pressed={current === "el"}
        onClick={() => setLanguage("el")}
      >
        ΕΛ
      </button>
      <button
        type="button"
        aria-label="English"
        lang="en"
        aria-pressed={current === "en"}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
    </div>
  );
}
