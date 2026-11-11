"""Local, browser-owned research API; intentionally no public production service."""

import hashlib
from copy import deepcopy
import importlib.util
import io
import json
import logging
from math import hypot
import os
import re
import secrets
import shutil
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError

from .measurement import image_quality, measure_polygon
from .schemas import ContourProposalRequest, GenerationRequest, MeasurementRequest, SessionCreate, SessionPatch
from .storage import Store

LOGGER = logging.getLogger(__name__)
COOKIE_NAME = "nailform_workspace"
MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


def now():
    return datetime.now(timezone.utc).isoformat()


def version(session: dict, kind: str, summary: str, **extra):
    session["versions"].append({"id": uuid4().hex, "created_at": now(), "kind": kind, "summary": summary, **extra})
    session["updated_at"] = now()


def validate_proposal_points(points: list[dict], width: int, height: int):
    """Validate image-space topology only; this does not validate nail detection."""
    from .measurement import _segments_intersect

    if any(point["x"] >= width or point["y"] >= height for point in points):
        raise ValueError("Automatic contour proposal points must be finite and inside the original image.")
    coordinates = [(point["x"], point["y"]) for point in points]
    if len(set(coordinates)) != 12:
        raise ValueError("Automatic contour proposal points must be distinct.")
    area2 = sum(coordinates[i][0] * coordinates[(i + 1) % 12][1] - coordinates[(i + 1) % 12][0] * coordinates[i][1] for i in range(12))
    if abs(area2) < 8:
        raise ValueError("The automatic contour proposal has no usable area.")
    for i in range(12):
        for j in range(i + 1, 12):
            if j == i + 1 or (i == 0 and j == 11):
                continue
            if _segments_intersect(coordinates[i], coordinates[(i + 1) % 12], coordinates[j], coordinates[(j + 1) % 12]):
                raise ValueError("Automatic contour proposal edges cross or touch. Retake the photograph or use manual mode.")
    proximal, distal = coordinates[0], coordinates[6]
    length = hypot(distal[0] - proximal[0], distal[1] - proximal[1])
    if length < 5:
        raise ValueError("Automatic contour proposal landmarks do not define a usable cuticle-to-distal axis.")
    along = ((distal[0] - proximal[0]) / length, (distal[1] - proximal[1]) / length)
    local = [((x - proximal[0]) * along[1] - (y - proximal[1]) * along[0],
              (x - proximal[0]) * along[0] + (y - proximal[1]) * along[1]) for x, y in coordinates]
    if local[3][0] <= 1 or local[9][0] >= -1:
        raise ValueError("Automatic contour proposal sidewall landmarks are inconsistent. Use manual mode or retake the photograph.")
    if min(y for _, y in local) < -length * .1 or max(y for _, y in local) > length * 1.1:
        raise ValueError("Automatic contour proposal cuticle and distal landmarks do not span the outline.")


def create_app(data_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="NAILFORM LAB Research API", version="0.1.0")
    store = Store(data_dir or Path(os.environ.get("NAILFORM_DATA_DIR", Path(__file__).resolve().parents[2] / ".data")))
    app.state.store = store

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, error: RequestValidationError):
        # Do not echo arbitrary research input. In particular, NaN/Infinity in
        # malformed JSON cannot be serialized by Starlette's default handler.
        return JSONResponse(status_code=422, content={"detail": [
            {"loc": entry["loc"], "msg": entry["msg"], "type": entry["type"]}
            for entry in error.errors()
        ]})

    @app.middleware("http")
    async def workspace_owner(request: Request, call_next):
        token = request.cookies.get(COOKIE_NAME, "")
        fresh = not bool(re.fullmatch(r"[A-Za-z0-9_-]{43}", token))
        if fresh:
            token = secrets.token_urlsafe(32)
        request.state.owner = hashlib.sha256(token.encode()).hexdigest()
        response = await call_next(request)
        if fresh:
            response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="strict", max_age=60 * 60 * 24 * 365, secure=False)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    def require_session(request: Request, session_id: str):
        value = store.get(request.state.owner, session_id)
        if value is None:
            raise HTTPException(404, "Research session not found in this browser workspace.")
        value.setdefault("contour_proposals", [])
        previous_parameters = (value.get("latest_model") or {}).get("parameters", {})
        value.setdefault("design", {"tip_shape": previous_parameters.get("tip_shape", "oval"),
                                     "extension_mm": previous_parameters.get("extension_mm", 2)})
        return value

    def session_dir(session_id: str):
        return store.directory / "sessions" / session_id

    def require_image(session: dict, image_id: str):
        image = next((value for value in session["images"] if value["id"] == image_id), None)
        if not image:
            raise HTTPException(404, "Image not found in this session.")
        return image

    def invalidate_review(session: dict):
        session["state"] = "measurement_review_needed"
        session["feedback"]["contour_accepted"] = False
        session["feedback"]["geometry_accepted"] = False
        session["latest_model"] = None

    @app.get("/api/health")
    def health():
        return {"status": "ok", "cad_available": importlib.util.find_spec("cadquery") is not None,
                "mode": "local_research", "units": "mm", "wear_assessed": False}

    @app.get("/api/sessions")
    def list_sessions(request: Request):
        return store.list(request.state.owner)

    @app.post("/api/sessions", status_code=201)
    def create_session(payload: SessionCreate, request: Request):
        if not payload.name.strip():
            raise HTTPException(422, "Give the research session a name.")
        stamp = now()
        session = {"id": uuid4().hex, "name": payload.name.strip(), "created_at": stamp, "updated_at": stamp,
                   "state": "draft", "consent": True, "consent_recorded_at": stamp, "images": [],
                   "contour": None, "calibration": None, "measurement": None, "latest_model": None,
                   "feedback": {"notes": "", "issues": [], "contour_accepted": False, "geometry_accepted": False},
                   "versions": [], "model_ids": [], "capture_attempts": [], "generation_failures": [],
                   "annotations": [], "contour_proposals": [], "design": {"tip_shape": "oval", "extension_mm": 2},
                   "experiment": {"reference_length_mm": None, "reference_width_mm": None,
                       "reference_source": "", "repeat_group": "", "effort_seconds": None, "notes": ""}}
        version(session, "created", "Research storage consent recorded; session created.")
        store.put(request.state.owner, session)
        return session

    @app.get("/api/sessions/{session_id}")
    def read_session(session_id: str, request: Request):
        return require_session(request, session_id)

    @app.patch("/api/sessions/{session_id}")
    def update_session(session_id: str, payload: SessionPatch, request: Request):
        with store.lock:
            session = require_session(request, session_id)
            if payload.name is not None:
                if not payload.name.strip():
                    raise HTTPException(422, "Give the research session a name.")
                session["name"] = payload.name.strip()
            if payload.feedback is not None:
                if payload.feedback.contour_accepted and not session["measurement"]:
                    raise HTTPException(422, "Measure and review a contour before accepting it.")
                if payload.feedback.geometry_accepted and not session["latest_model"]:
                    raise HTTPException(422, "Generate and inspect a model before accepting its geometry.")
                if payload.feedback.geometry_accepted and not payload.feedback.contour_accepted:
                    raise HTTPException(422, "Geometric review also requires acceptance of the source contour.")
                session["feedback"] = payload.feedback.model_dump()
                if not payload.feedback.geometry_accepted and session["state"] in ("geometrically_reviewed", "lab_print_requested", "printed", "evaluated_on_reference_model"):
                    session["state"] = "measurement_review_needed"
            if payload.state is not None:
                if payload.state in ("geometrically_reviewed", "lab_print_requested", "printed", "evaluated_on_reference_model"):
                    if not session["latest_model"] or not session["feedback"]["geometry_accepted"]:
                        raise HTTPException(422, "This state requires a current generated model and recorded geometric review.")
                session["state"] = payload.state
            if payload.design is not None:
                design = payload.design.model_dump()
                if design != session.get("design") and session["latest_model"]:
                    # Keep the previous model available as a stale comparison;
                    # the confirmed source photograph/calibration stay intact.
                    session["feedback"]["geometry_accepted"] = False
                    session["state"] = "measurement_review_needed"
                session["design"] = design
                version(session, "design", "External extension design preferences saved.", design=deepcopy(design))
            if payload.annotations is not None:
                annotation_ids = [annotation.id for annotation in payload.annotations]
                if len(annotation_ids) != len(set(annotation_ids)):
                    raise HTTPException(422, "Annotation identifiers must be unique within the session.")
                for annotation in payload.annotations:
                    require_image(session, annotation.image_id)
                session["annotations"] = [annotation.model_dump() for annotation in payload.annotations]
                version(session, "annotation", "Professional image annotations updated.")
            if payload.experiment is not None:
                session["experiment"] = payload.experiment.model_dump()
                version(session, "experiment", "Declared independent reference observations and repeat group updated.", experiment=session["experiment"].copy())
            if payload.name is not None or payload.state is not None or payload.feedback is not None:
                version(session, "review", "Professional notes, research state, or session name updated.", feedback=session["feedback"].copy(), state=session["state"])
            store.put(request.state.owner, session)
            return session

    @app.delete("/api/sessions/{session_id}", status_code=204)
    def delete_session(session_id: str, request: Request):
        with store.lock:
            require_session(request, session_id)
            shutil.rmtree(session_dir(session_id), ignore_errors=True)
            store.delete(request.state.owner, session_id)
        return Response(status_code=204)

    @app.post("/api/sessions/{session_id}/images", status_code=201)
    async def upload_image(session_id: str, request: Request,
                           view: Literal["top", "front", "side", "oblique"] = "top", file: UploadFile = File(...)):
        # Ownership checked before reading potentially large/untrusted multipart data.
        require_session(request, session_id)
        content = bytearray()
        try:
            while chunk := await file.read(1024 * 1024):
                content.extend(chunk)
                if len(content) > MAX_UPLOAD_BYTES:
                    raise ValueError("Image exceeds the 12 MB upload limit.")
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(content)) as source:
                    if source.format not in ("JPEG", "PNG", "WEBP"):
                        raise ValueError("Use a JPEG, PNG, or WebP photograph. Export HEIC images to JPEG first.")
                    if source.width * source.height > MAX_IMAGE_PIXELS:
                        raise ValueError("Image exceeds the 20 megapixel limit. Resize it before uploading.")
                    if min(source.size) < 64:
                        raise ValueError("Image dimensions must each be at least 64 pixels.")
                    normalized = ImageOps.exif_transpose(source).convert("RGB")
                    normalized.load()
            quality = image_quality(np.asarray(normalized))
        except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
            message = str(error) if isinstance(error, ValueError) else "The image could not be decoded. Choose a valid JPEG, PNG, or WebP file."
            with store.lock:
                session = require_session(request, session_id)
                session["capture_attempts"].append({"created_at": now(), "view": view, "outcome": "rejected", "reason": message})
                session["updated_at"] = now()
                store.put(request.state.owner, session)
            raise HTTPException(422, message) from error
        finally:
            await file.close()
        with store.lock:
            session = require_session(request, session_id)
            image_id = uuid4().hex
            image_path = session_dir(session_id) / "images" / f"{image_id}.png"
            image_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            # Strip EXIF/location metadata and normalize orientation; never publish originals.
            normalized.save(image_path, format="PNG")
            image = {"id": image_id, "view": view, "width": normalized.width, "height": normalized.height,
                     "url": f"/api/sessions/{session_id}/images/{image_id}", "quality": quality,
                     "created_at": now(), "storage": "private_local_workspace", "metadata_stripped": True}
            session["images"].append(image)
            session["capture_attempts"].append({"created_at": now(), "view": view, "outcome": "accepted", "image_id": image_id})
            if view == "top":
                # Previous photos/versions remain available; new top-view work needs review.
                session["measurement"] = None
                session["contour"] = None
                session["calibration"] = None
                invalidate_review(session)
            else:
                session["feedback"]["geometry_accepted"] = False
                session["state"] = "measurement_review_needed"
            version(session, "capture", f"{view.capitalize()} photograph stored; image quality requires human review.")
            store.put(request.state.owner, session)
            return image

    @app.get("/api/sessions/{session_id}/images/{image_id}")
    def get_image(session_id: str, image_id: str, request: Request):
        session = require_session(request, session_id)
        require_image(session, image_id)
        path = session_dir(session_id) / "images" / f"{image_id}.png"
        if not path.is_file():
            raise HTTPException(404, "Stored image is unavailable.")
        return FileResponse(path, media_type="image/png")

    @app.post("/api/sessions/{session_id}/contour-proposals", status_code=201)
    def store_contour_proposal(session_id: str, payload: ContourProposalRequest, request: Request):
        with store.lock:
            session = require_session(request, session_id)
            image = require_image(session, payload.image_id)
            if image["view"] != "top":
                raise HTTPException(422, "Only top-view photographs support an automatic contour proposal.")
            points = [point.model_dump() for point in payload.points]
            try:
                validate_proposal_points(points, image["width"], image["height"])
            except ValueError as error:
                raise HTTPException(422, str(error)) from error
            proposal = {"id": uuid4().hex, "image_id": payload.image_id, "points": points,
                        "method": payload.method, "source": payload.source, "tip_direction": payload.tip_direction,
                        "created_at": now(), "review_required": True}
            session["contour_proposals"].append(proposal)
            image["contour_proposal"] = deepcopy(proposal)
            # An unconfirmed proposal does not replace approved measurements or CAD.
            version(session, "contour_proposal", "Experimental image-derived contour proposal stored; manual review and calibration remain required.",
                    image_id=payload.image_id, proposal=deepcopy(proposal))
            store.put(request.state.owner, session)
            return proposal

    @app.delete("/api/sessions/{session_id}/images/{image_id}", status_code=204)
    def delete_image(session_id: str, image_id: str, request: Request):
        with store.lock:
            session = require_session(request, session_id)
            require_image(session, image_id)
            session["images"] = [image for image in session["images"] if image["id"] != image_id]
            session["annotations"] = [annotation for annotation in session.get("annotations", []) if annotation["image_id"] != image_id]
            session["contour_proposals"] = [proposal for proposal in session.get("contour_proposals", []) if proposal["image_id"] != image_id]
            (session_dir(session_id) / "images" / f"{image_id}.png").unlink(missing_ok=True)
            # Delete every model that depended on this image, including historical outputs.
            keep_models = []
            for model_id in session["model_ids"]:
                model_dir = session_dir(session_id) / "models" / model_id
                model_json = model_dir / "generation.json"
                model = json.loads(model_json.read_text()) if model_json.exists() else {}
                if model.get("source_image_id") == image_id:
                    shutil.rmtree(model_dir, ignore_errors=True)
                else:
                    keep_models.append(model_id)
            session["model_ids"] = keep_models
            # Remove sensitive contour snapshots/provenance relating to this photo.
            session["versions"] = [v for v in session["versions"] if v.get("image_id") != image_id and (not v.get("model_id") or v["model_id"] in keep_models)]
            session["capture_attempts"] = [a for a in session["capture_attempts"] if a.get("image_id") != image_id]
            if session["measurement"] and session["measurement"]["image_id"] == image_id:
                session["measurement"] = None
                session["contour"] = None
                session["calibration"] = None
                invalidate_review(session)
            if session["latest_model"] and session["latest_model"].get("source_image_id") == image_id:
                invalidate_review(session)
            session["feedback"]["geometry_accepted"] = False
            session["state"] = "measurement_review_needed"
            version(session, "deletion", "Image and dependent measurements/model exports removed.")
            store.put(request.state.owner, session)
        return Response(status_code=204)

    @app.post("/api/sessions/{session_id}/measure")
    def measure(session_id: str, payload: MeasurementRequest, request: Request):
        with store.lock:
            session = require_session(request, session_id)
            image = require_image(session, payload.image_id)
            if image["view"] != "top":
                raise HTTPException(422, "The calibrated 2D method currently uses the top-view image only.")
            proposal = None
            if payload.proposal_id is not None:
                proposal = next((entry for entry in session.get("contour_proposals", [])
                                 if entry["id"] == payload.proposal_id and entry["image_id"] == payload.image_id), None)
                if proposal is None:
                    raise HTTPException(422, "Contour proposal not found for this image in this research session.")
            try:
                result = measure_polygon(payload, image["width"], image["height"])
            except ValueError as error:
                raise HTTPException(422, str(error)) from error
            result["created_at"] = now()
            result["id"] = uuid4().hex
            result["warnings"].extend(image["quality"]["warnings"])
            summary = "Calibrated projected 2D dimensions recorded from manually placed contour."
            if proposal is not None:
                unchanged = all(hypot(point["x"] - original["x"], point["y"] - original["y"]) <= .01 + 1e-9
                                for point, original in zip(result["contour"], proposal["points"]))
                result["contour_source"] = "automatic_human_reviewed" if unchanged else "automatic_human_adjusted"
                result["contour_proposal_id"] = proposal["id"]
                result["contour_proposal"] = deepcopy(proposal)
                result["warnings"].append("Automatic contour is an experimental image-derived proposal; human review does not establish validated segmentation accuracy or physical fit.")
                summary = ("Calibrated projected 2D dimensions recorded from a human-reviewed automatic contour proposal." if unchanged else
                           "Calibrated projected 2D dimensions recorded from a human-adjusted automatic contour proposal.")
            session["measurement"] = result
            session["contour"] = result["contour"]
            session["calibration"] = result["calibration"]
            invalidate_review(session)
            version(session, "measurement", summary,
                    image_id=payload.image_id, measurement=result)
            store.put(request.state.owner, session)
            return result

    @app.post("/api/sessions/{session_id}/generate", status_code=201)
    def generate(session_id: str, payload: GenerationRequest, request: Request):
        # CAD kernel and JSON updates are serialized in this single-process local service.
        with store.lock:
            session = require_session(request, session_id)
            if not session["measurement"]:
                raise HTTPException(422, "Complete calibration and contour measurement before generating research CAD.")
            model_id = uuid4().hex
            output_dir = session_dir(session_id) / "models" / model_id
            output_dir.mkdir(parents=True, mode=0o700)
            try:
                from .geometry import generate_geometry
                result = generate_geometry(payload.parameters.model_dump(), output_dir)
            except Exception as error:
                shutil.rmtree(output_dir, ignore_errors=True)
                message = str(error) if isinstance(error, ValueError) else "CAD generation failed. Inspect the server log and adjust the experimental parameters."
                session["generation_failures"].append({"created_at": now(), "reason": message})
                version(session, "cad_failure", message)
                store.put(request.state.owner, session)
                if not isinstance(error, ValueError):
                    LOGGER.exception("CAD generation failed for a local research session")
                raise HTTPException(422 if isinstance(error, ValueError) else 500, message) from error
            if not result.get("validation", {}).get("passed"):
                shutil.rmtree(output_dir, ignore_errors=True)
                session["generation_failures"].append({"created_at": now(), "reason": "CAD validation did not pass."})
                version(session, "cad_failure", "CAD validation did not pass; export withheld.")
                store.put(request.state.owner, session)
                raise HTTPException(422, "CAD validation did not pass. Exports were withheld; adjust the parameters.")
            measured = session["measurement"]
            provenance = {key: ("measured" if key in ("length_mm", "width_mm") and abs(value - measured[key]) < 1e-4 else "manually_adjusted")
                          for key, value in payload.parameters.model_dump().items()}
            generation = {**result, "id": model_id, "created_at": now(), "source_image_id": measured["image_id"],
                          "measurement_id": measured["id"], "review_confirmed": True,
                          "parameter_provenance": provenance,
                          "downloads": {kind: f"/api/sessions/{session_id}/models/{model_id}/{kind}" for kind in ("stl", "step", "parameters", "report")}}
            generation["metadata"]["measurement_limitations"] = measured["uncertainty"]
            generation["metadata"]["contour_reconstruction"] = "Parametric length/width approximation; photographed contour is not reconstructed as an exact CAD boundary."
            generation["metadata"]["parameter_provenance"] = provenance
            generation["metadata"]["wear_status"] = "Non-wearable laboratory prototype. Material and product safety have not been assessed."
            # Export provenance alongside the actual parameters, not just in API state.
            (output_dir / "parameters.json").write_text(json.dumps({"units": "mm", "parameters": generation["parameters"],
                "parameter_provenance": provenance, "source_measurement": measured,
                "metadata": generation["metadata"]}, allow_nan=False, indent=2))
            (output_dir / "validation.json").write_text(json.dumps({**generation["validation"],
                "parameter_provenance": provenance, "measurement_uncertainty": measured["uncertainty"],
                "wear_status": generation["metadata"]["wear_status"]}, allow_nan=False, indent=2))
            (output_dir / "generation.json").write_text(json.dumps(generation, allow_nan=False))
            session["latest_model"] = generation
            session["model_ids"].append(model_id)
            session["feedback"]["geometry_accepted"] = False
            session["state"] = "measurement_review_needed"
            version(session, "cad", "Experimental shell generated from projected dimensions and explicit manual parameters.", model_id=model_id, image_id=measured["image_id"])
            store.put(request.state.owner, session)
            return generation

    @app.get("/api/sessions/{session_id}/models/{model_id}")
    def read_model(session_id: str, model_id: str, request: Request):
        session = require_session(request, session_id)
        if model_id not in session["model_ids"]:
            raise HTTPException(404, "Model not found in this session.")
        path = session_dir(session_id) / "models" / model_id / "generation.json"
        if not path.is_file():
            raise HTTPException(404, "Stored model is unavailable.")
        return json.loads(path.read_text())

    @app.get("/api/sessions/{session_id}/models/{model_id}/{format}")
    def download_model(session_id: str, model_id: str, format: Literal["stl", "step", "parameters", "report"], request: Request):
        session = require_session(request, session_id)
        if model_id not in session["model_ids"]:
            raise HTTPException(404, "Model not found in this session.")
        filename, mime = {"stl": ("model.stl", "model/stl"), "step": ("model.step", "application/step"),
                          "parameters": ("parameters.json", "application/json"), "report": ("validation.json", "application/json")}[format]
        path = session_dir(session_id) / "models" / model_id / filename
        if not path.is_file():
            raise HTTPException(404, "Stored export is unavailable.")
        return FileResponse(path, filename=f"nailform-{model_id[:8]}-{filename}", media_type=mime)

    return app


app = create_app()
