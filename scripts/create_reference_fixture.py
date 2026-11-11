"""Independent planar reference, not a customer photo or CAD-derived ground truth."""

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tests" / "fixtures"
OUTPUT.mkdir(parents=True, exist_ok=True)

# Polygon and scale are specified analytically in image pixels. The label's
# millimeters are simulated fixture ground truth, never a physical validation.
contour = [
    (400, 210), (450, 230), (485, 280), (500, 350),
    (490, 430), (455, 500), (400, 530), (345, 500),
    (310, 430), (300, 350), (315, 280), (350, 230),
]
image = Image.new("RGB", (800, 800), "#efeae4")
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((45, 40, 755, 760), radius=20, fill="#faf8f5", outline="#d6b69a", width=2)
draw.text((85, 75), "SYNTHETIC PLANAR REFERENCE / NOT A HAND PHOTO", fill="#242127", font_size=20)
draw.text((85, 110), "Independent 2D fixture. No physical accuracy or 3D fit claim.", fill="#5b5255", font_size=17)
draw.polygon(contour, fill="#c88f9a", outline="#242127", width=3)
draw.line((160, 250, 160, 350), fill="#242127", width=3)
for y in (250, 350):
    draw.line((148, y, 172, y), fill="#242127", width=3)
draw.text((75, 375), "5 mm", fill="#242127", font_size=20)
draw.text((335, 560), "12-point silhouette", fill="#5b5255", font_size=18)
draw.text((85, 665), "Expected projected length: 16 mm / maximum width: 10 mm", fill="#242127", font_size=18)
draw.text((85, 700), "Reference span: 100 px = 5 mm (scale = 0.05 mm/px)", fill="#5b5255", font_size=18)
image.save(OUTPUT / "planar-reference.png")
(OUTPUT / "planar-reference.json").write_text(json.dumps({
    "label": "Synthetic independent 2D reference; not physical validation",
    "image_width": 800, "image_height": 800,
    "contour": [{"x": x, "y": y} for x, y in contour],
    "calibration": {"a": {"x": 160, "y": 250}, "b": {"x": 160, "y": 350}, "reference_mm": 5},
    "expected_length_mm": 16, "expected_width_mm": 10,
}, indent=2) + "\n")
print(OUTPUT)
