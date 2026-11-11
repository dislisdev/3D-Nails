"""Typed public request contracts; all CAD dimensions are millimeters."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Point(StrictModel):
    x: float = Field(ge=0)
    y: float = Field(ge=0)


class Calibration(StrictModel):
    a: Point
    b: Point
    reference_mm: float = Field(gt=0, le=200)


class MeasurementRequest(StrictModel):
    image_id: str
    contour: list[Point] = Field(min_length=12, max_length=12)
    calibration: Calibration
    method: Literal["calibrated_photo"] = "calibrated_photo"
    proposal_id: str | None = Field(default=None, min_length=1, max_length=100)


class ProposalPoint(Point):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, strict=True)


class ContourProposalRequest(StrictModel):
    image_id: str = Field(min_length=1, max_length=100)
    points: list[ProposalPoint] = Field(min_length=12, max_length=12)
    method: Literal["contrast_outline_v1"]
    source: Literal["live_camera", "photo"]
    tip_direction: Literal["up", "down"]


class SessionCreate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    consent: Literal[True]


class Feedback(StrictModel):
    notes: str = Field(default="", max_length=10000)
    issues: list[str] = Field(default_factory=list, max_length=30)
    contour_accepted: bool = False
    geometry_accepted: bool = False


class Experiment(StrictModel):
    reference_length_mm: float | None = Field(default=None, gt=0, le=100)
    reference_width_mm: float | None = Field(default=None, gt=0, le=100)
    reference_source: str = Field(default="", max_length=500)
    repeat_group: str = Field(default="", max_length=100)
    effort_seconds: float | None = Field(default=None, ge=0, le=86400)
    notes: str = Field(default="", max_length=2000)


class Annotation(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    image_id: str = Field(min_length=1, max_length=100)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    note: str = Field(min_length=1, max_length=1000)


class DesignPreference(StrictModel):
    tip_shape: Literal["oval", "squoval", "almond"]
    extension_mm: float = Field(ge=0, le=15, strict=True)


State = Literal[
    "draft", "measurement_review_needed", "geometrically_reviewed",
    "lab_print_requested", "printed", "evaluated_on_reference_model",
]


class SessionPatch(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    state: State | None = None
    feedback: Feedback | None = None
    experiment: Experiment | None = None
    annotations: list[Annotation] | None = Field(default=None, max_length=100)
    design: DesignPreference | None = None


class GeometryParameters(StrictModel):
    length_mm: float = Field(ge=4, le=40)
    width_mm: float = Field(ge=3, le=30)
    transverse_rise_mm: float = Field(ge=0, le=6)
    longitudinal_rise_mm: float = Field(ge=0, le=4)
    thickness_mm: float = Field(ge=0.25, le=1.5)
    extension_mm: float = Field(ge=0, le=15)
    tip_shape: Literal["oval", "squoval", "almond"] = "oval"
    asymmetry_mm: float = 0

    @model_validator(mode="after")
    def compatible_shape(self):
        if self.transverse_rise_mm > self.width_mm * 0.45:
            raise ValueError("Transverse rise must not exceed 45% of width.")
        if abs(self.asymmetry_mm) > min(2, self.width_mm * 0.15):
            raise ValueError("Asymmetry exceeds this width's experimental geometry limits.")
        return self


class GenerationRequest(StrictModel):
    parameters: GeometryParameters
    review_confirmed: Literal[True]
