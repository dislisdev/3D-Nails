import { Check } from "lucide-react";
import { t, useLanguage } from "./i18n";
import "./NailShapeSelector.css";

type NailShape = "oval" | "squoval" | "almond";
type Props = {
  value: NailShape;
  onChange: (value: NailShape) => void;
  disabled?: boolean;
};
const shapes: { value: NailShape; label: string; edge: string }[] = [
  {
    value: "oval",
    label: "Oval",
    edge: "M17 37V28C17 15 23 7 32 7S47 15 47 28V37",
  },
  {
    value: "almond",
    label: "Almond",
    edge: "M17 37C17 23 22 13 32 5C42 13 47 23 47 37",
  },
  {
    value: "squoval",
    label: "Squoval",
    edge: "M17 37V16Q17 9 24 9H40Q47 9 47 16V37",
  },
];

/** A design preference for the added free edge, separate from measured anatomy. */
export default function NailShapeSelector({
  value,
  onChange,
  disabled = false,
}: Props) {
  useLanguage();
  return (
    <div
      className="nail-shape-selector"
      role="group"
      aria-label={t("Free-edge shape")}
    >
      {shapes.map((shape) => (
        <button
          key={shape.value}
          type="button"
          disabled={disabled}
          aria-pressed={value === shape.value}
          aria-label={t("{shape} free-edge shape", { shape: t(shape.label) })}
          onClick={() => onChange(shape.value)}
        >
          <span className="nail-shape-art" aria-hidden="true">
            <svg viewBox="0 0 64 68" focusable="false">
              <path
                className="nail-shape-bed"
                d="M17 37V52C17 60 23 64 32 64S47 60 47 52V37"
              />
              <path className="nail-shape-extension" d={shape.edge} />
              <path className="nail-shape-join" d="M18 37Q32 31 46 37" />
            </svg>
            {value === shape.value && (
              <Check className="nail-shape-check" size={14} />
            )}
          </span>
          <span>{t(shape.label)}</span>
        </button>
      ))}
    </div>
  );
}
