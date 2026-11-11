import io
import copy
import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.main import create_app
from test_measurement import payload


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "private-data")) as value:
        yield value


def photograph():
    # Synthetic fixture with independently specified pixel distances, not a real nail.
    image = Image.new("RGB", (400, 400), "#d4c8b8")
    ImageDraw.Draw(image).rectangle((10, 10, 110, 16), fill="black")
    stream = io.BytesIO()
    image.save(stream, "PNG")
    return stream.getvalue()


def new_session(client):
    response = client.post("/api/sessions", json={"name": "Controlled fixture", "consent": True})
    assert response.status_code == 201, response.text
    return response.json()


def calibrated_session(client):
    session = new_session(client)
    image_response = client.post(f"/api/sessions/{session['id']}/images?view=top", files={"file": ("reference.png", photograph(), "image/png")})
    assert image_response.status_code == 201, image_response.text
    image = image_response.json()
    data = payload()
    data["image_id"] = image["id"]
    result = client.post(f"/api/sessions/{session['id']}/measure", json=data)
    assert result.status_code == 200, result.text
    return session, image, result.json()


def geometry_parameters():
    return {"length_mm": 20, "width_mm": 16, "transverse_rise_mm": 1.2,
            "longitudinal_rise_mm": .4, "thickness_mm": .5, "extension_mm": 2,
            "tip_shape": "oval", "asymmetry_mm": 0}


def proposal_request(image_id):
    return {"image_id": image_id, "points": payload()["contour"], "method": "contrast_outline_v1",
            "source": "photo", "tip_direction": "down"}


def test_proposals_preserve_measurement_until_review_and_track_original_snapshots(client):
    session, image, original_measurement = calibrated_session(client)
    base = f"/api/sessions/{session['id']}"
    assert client.get(base).json()["contour_proposals"] == []
    first = client.post(base + "/contour-proposals", json=proposal_request(image["id"]))
    assert first.status_code == 201, first.text
    first = first.json()
    assert first["review_required"] is True
    assert first["method"] == "contrast_outline_v1"
    pending = client.get(base).json()
    assert pending["measurement"] == original_measurement
    assert pending["images"][0]["contour_proposal"] == first
    assert pending["contour_proposals"] == [first]
    assert any(v["kind"] == "contour_proposal" and v["proposal"] == first for v in pending["versions"])
    # Replacing the current proposal must preserve the first audit snapshot.
    second_request = proposal_request(image["id"])
    second_request["points"][1]["x"] += 2
    second_request["source"] = "live_camera"
    second = client.post(base + "/contour-proposals", json=second_request).json()
    assert client.get(base).json()["images"][0]["contour_proposal"]["id"] == second["id"]
    measure_request = payload()
    measure_request.update(image_id=image["id"], proposal_id=first["id"])
    reviewed = client.post(base + "/measure", json=measure_request)
    assert reviewed.status_code == 200, reviewed.text
    reviewed = reviewed.json()
    assert reviewed["contour_source"] == "automatic_human_reviewed"
    assert reviewed["contour_proposal_id"] == first["id"]
    assert reviewed["contour_proposal"] == first
    assert reviewed["provenance"]["transverse_rise_mm"] == "unknown"
    assert reviewed["length_mm"] == 20
    # Coordinates within 0.01 image pixel are treated as unchanged despite float round-off.
    tolerance = copy.deepcopy(measure_request)
    tolerance["contour"][10]["x"] += .01
    assert client.post(base + "/measure", json=tolerance).json()["contour_source"] == "automatic_human_reviewed"
    changed = copy.deepcopy(measure_request)
    changed["contour"][1]["x"] += .02
    adjusted = client.post(base + "/measure", json=changed).json()
    assert adjusted["contour_source"] == "automatic_human_adjusted"
    assert adjusted["contour_proposal"] == first
    assert adjusted["contour"][1] != first["points"][1]
    # Explicit manual mode never inherits automatic origin from image metadata.
    del measure_request["proposal_id"]
    manual = client.post(base + "/measure", json=measure_request).json()
    assert manual["contour_source"] == "manual_control_points"
    assert "contour_proposal_id" not in manual
    assert "contour_proposal" not in manual


@pytest.mark.parametrize("problem", ["outside", "negative", "crossed", "duplicate", "short", "nonfinite", "boolean", "line", "wrong_side", "method", "source", "direction"])
def test_invalid_automatic_proposals_are_rejected_without_persisting(client, problem):
    session, image, measured = calibrated_session(client)
    base = f"/api/sessions/{session['id']}"
    data = proposal_request(image["id"])
    if problem == "outside":
        data["points"][2]["x"] = 400
    elif problem == "negative":
        data["points"][2]["x"] = -1
    elif problem == "crossed":
        data["points"][2], data["points"][8] = data["points"][8], data["points"][2]
    elif problem == "duplicate":
        data["points"][1] = data["points"][2].copy()
    elif problem == "short":
        data["points"].pop()
    elif problem == "nonfinite":
        data["points"][2]["x"] = float("nan")
    elif problem == "boolean":
        data["points"][2]["x"] = True
    elif problem == "line":
        data["points"] = [{"x": 100 + i, "y": 100} for i in range(12)]
    elif problem == "wrong_side":
        data["points"].reverse()
    elif problem == "method":
        data["method"] = "invented_model"
    elif problem == "source":
        data["source"] = "verified_scan"
    else:
        data["tip_direction"] = "left"
    response = client.post(base + "/contour-proposals", content=json.dumps(data), headers={"Content-Type": "application/json"})
    assert response.status_code == 422, response.text
    persisted = client.get(base).json()
    assert persisted["contour_proposals"] == []
    assert "contour_proposal" not in persisted["images"][0]
    assert persisted["measurement"] == measured


def test_proposals_enforce_workspace_and_source_image_and_support_legacy_records(client):
    session, image, _ = calibrated_session(client)
    base = f"/api/sessions/{session['id']}"
    isolated = TestClient(client.app)
    assert isolated.post(base + "/contour-proposals", json=proposal_request(image["id"])).status_code == 404
    other, other_image, _ = calibrated_session(client)
    assert client.post(base + "/contour-proposals", json=proposal_request(other_image["id"])).status_code == 404
    foreign = client.post(f"/api/sessions/{other['id']}/contour-proposals", json=proposal_request(other_image["id"])).json()
    second_other_image = client.post(f"/api/sessions/{other['id']}/images?view=top", files={"file": ("second.png", photograph(), "image/png")}).json()
    second_other_proposal = client.post(f"/api/sessions/{other['id']}/contour-proposals", json=proposal_request(second_other_image["id"])).json()
    wrong_image = payload()
    wrong_image.update(image_id=other_image["id"], proposal_id=second_other_proposal["id"])
    assert client.post(f"/api/sessions/{other['id']}/measure", json=wrong_image).status_code == 422
    measurement = payload()
    measurement.update(image_id=image["id"], proposal_id=foreign["id"])
    assert client.post(base + "/measure", json=measurement).status_code == 422
    measurement["proposal_id"] = "missing-proposal"
    assert client.post(base + "/measure", json=measurement).status_code == 422
    side = client.post(base + "/images?view=side", files={"file": ("side.png", photograph(), "image/png")}).json()
    assert client.post(base + "/contour-proposals", json=proposal_request(side["id"])).status_code == 422
    # No migration or field presence is required for older saved records.
    owner = hashlib.sha256(client.cookies.get("nailform_workspace").encode()).hexdigest()
    legacy = client.app.state.store.get(owner, session["id"])
    legacy.pop("contour_proposals", None)
    client.app.state.store.put(owner, legacy)
    proposal = client.post(base + "/contour-proposals", json=proposal_request(image["id"]))
    assert proposal.status_code == 201, proposal.text
    assert client.get(base).json()["contour_proposals"][0]["id"] == proposal.json()["id"]
    # User-specified upward orientation works without inventing anatomical classification.
    upward = proposal_request(image["id"])
    upward["points"] = [{"x": 399 - p["x"], "y": 399 - p["y"]} for p in upward["points"]]
    upward["tip_direction"] = "up"
    assert client.post(base + "/contour-proposals", json=upward).status_code == 201


@pytest.mark.skipif(not (Path(__file__).parents[1] / "app" / "geometry.py").is_file(), reason="CAD module is not yet available")
def test_proposal_audit_survives_model_export_and_is_removed_with_image(client):
    session, image, _ = calibrated_session(client)
    base = f"/api/sessions/{session['id']}"
    original_model = client.post(base + "/generate", json={"parameters": geometry_parameters(), "review_confirmed": True}).json()
    accepted = {"contour_accepted": True, "geometry_accepted": True, "notes": "Geometric review only", "issues": []}
    client.patch(base, json={"feedback": accepted, "state": "geometrically_reviewed"})
    proposal = client.post(base + "/contour-proposals", json=proposal_request(image["id"])).json()
    unconfirmed = client.get(base).json()
    assert unconfirmed["latest_model"]["id"] == original_model["id"]
    assert unconfirmed["state"] == "geometrically_reviewed"
    assert unconfirmed["feedback"]["geometry_accepted"] is True
    data = payload()
    data.update(image_id=image["id"], proposal_id=proposal["id"])
    client.post(base + "/measure", json=data)
    updated = client.get(base).json()
    assert updated["latest_model"] is None
    assert updated["feedback"]["geometry_accepted"] is False
    generated = client.post(base + "/generate", json={"parameters": geometry_parameters(), "review_confirmed": True})
    assert generated.status_code == 201, generated.text
    exported = client.get(generated.json()["downloads"]["parameters"]).json()
    assert exported["source_measurement"]["contour_source"] == "automatic_human_reviewed"
    assert exported["source_measurement"]["contour_proposal"] == proposal
    assert client.delete(image["url"]).status_code == 204
    deleted = client.get(base).json()
    assert deleted["contour_proposals"] == []
    assert not any(version["kind"] == "contour_proposal" for version in deleted["versions"])
    assert client.get(original_model["downloads"]["parameters"]).status_code == 404
    assert client.get(generated.json()["downloads"]["parameters"]).status_code == 404


def test_external_design_preferences_are_validated_persisted_and_invalidate_only_geometry_review(client):
    session, _, measured = calibrated_session(client)
    base = f"/api/sessions/{session['id']}"
    assert client.get(base).json()["design"] == {"tip_shape": "oval", "extension_mm": 2}
    for bad in [
        {"tip_shape": "square", "extension_mm": 2},
        {"tip_shape": "almond", "extension_mm": -1},
        {"tip_shape": "oval", "extension_mm": 16},
        {"tip_shape": "oval", "extension_mm": float("nan")},
        {"tip_shape": "oval", "extension_mm": True},
        {"tip_shape": "oval", "extension_mm": 2, "width_mm": 8},
    ]:
        assert client.patch(base, content=json.dumps({"design": bad}), headers={"Content-Type": "application/json"}).status_code == 422
    for shape, extension in [("oval", 0), ("squoval", 15), ("almond", 4)]:
        response = client.patch(base, json={"design": {"tip_shape": shape, "extension_mm": extension}})
        assert response.status_code == 200, response.text
        assert response.json()["design"] == {"tip_shape": shape, "extension_mm": extension}
        assert response.json()["measurement"] == measured
    parameters = {**geometry_parameters(), "tip_shape": "almond", "extension_mm": 4}
    generated = client.post(base + "/generate", json={"parameters": parameters, "review_confirmed": True})
    assert generated.status_code == 201, generated.text
    model_id = generated.json()["id"]
    accepted = {"contour_accepted": True, "geometry_accepted": True, "notes": "Geometric inspection only", "issues": []}
    client.patch(base, json={"feedback": accepted, "state": "geometrically_reviewed"})
    changed = client.patch(base, json={"design": {"tip_shape": "squoval", "extension_mm": 3}}).json()
    assert changed["design"] == {"tip_shape": "squoval", "extension_mm": 3}
    assert changed["latest_model"]["id"] == model_id
    assert changed["state"] == "measurement_review_needed"
    assert changed["feedback"]["geometry_accepted"] is False
    assert changed["feedback"]["contour_accepted"] is True
    assert changed["measurement"] == measured
    assert any(version["kind"] == "design" for version in changed["versions"])
    assert client.get(base).json()["design"] == {"tip_shape": "squoval", "extension_mm": 3}
    # Legacy records inherit their existing model's actual external design.
    owner = hashlib.sha256(client.cookies.get("nailform_workspace").encode()).hexdigest()
    legacy = client.app.state.store.get(owner, session["id"])
    del legacy["design"]
    client.app.state.store.put(owner, legacy)
    assert client.get(base).json()["design"] == {"tip_shape": "almond", "extension_mm": 4}


def test_consent_is_required_and_workspace_is_private(client, tmp_path):
    assert client.post("/api/sessions", json={"name": "No consent", "consent": False}).status_code == 422
    session, image, _ = calibrated_session(client)
    other = TestClient(client.app)
    assert other.get("/api/sessions").json() == []
    assert other.get(f"/api/sessions/{session['id']}").status_code == 404
    assert other.get(image["url"]).status_code == 404
    assert other.delete(f"/api/sessions/{session['id']}").status_code == 404
    cookie = client.cookies.get("nailform_workspace")
    assert cookie
    assert client.get(image["url"]).headers["cache-control"] == "no-store"
    # Disk persistence is independent of process/app instance.
    reloaded = TestClient(create_app(tmp_path / "private-data"))
    reloaded.cookies.set("nailform_workspace", cookie)
    assert reloaded.get(f"/api/sessions/{session['id']}").json()["measurement"]["length_mm"] == 20


def test_invalid_upload_is_recorded_without_file(client):
    session = new_session(client)
    response = client.post(f"/api/sessions/{session['id']}/images", files={"file": ("fake.png", b"not an image", "image/png")})
    assert response.status_code == 422
    state = client.get(f"/api/sessions/{session['id']}").json()
    assert state["images"] == []
    assert state["capture_attempts"][0]["outcome"] == "rejected"


def test_contour_measurement_versions_and_image_deletion(client):
    session, image, measured = calibrated_session(client)
    saved = client.get(f"/api/sessions/{session['id']}").json()
    assert saved["state"] == "measurement_review_needed"
    assert saved["contour"] == measured["contour"]
    assert any(v["kind"] == "measurement" for v in saved["versions"])
    assert client.delete(image["url"]).status_code == 204
    saved = client.get(f"/api/sessions/{session['id']}").json()
    assert saved["measurement"] is None
    assert saved["contour"] is None
    assert not any(v.get("image_id") == image["id"] for v in saved["versions"])
    assert client.get(image["url"]).status_code == 404


def test_invalid_geometry_review_and_unmeasured_generation_are_rejected(client):
    session = new_session(client)
    base = f"/api/sessions/{session['id']}"
    assert client.patch(base, json={"state": "printed"}).status_code == 422
    assert client.post(base + "/generate", json={"parameters": geometry_parameters(), "review_confirmed": True}).status_code == 422
    assert client.post(base + "/generate", json={"parameters": geometry_parameters(), "review_confirmed": False}).status_code == 422
    assert client.patch(base, json={"feedback": {"geometry_accepted": True}}).status_code == 422


def test_measurement_request_rejects_bad_scale_and_view(client):
    session, image, _ = calibrated_session(client)
    data = payload()
    data["image_id"] = image["id"]
    data["calibration"]["reference_mm"] = 0
    assert client.post(f"/api/sessions/{session['id']}/measure", json=data).status_code == 422
    side = client.post(f"/api/sessions/{session['id']}/images?view=side", files={"file": ("side.png", photograph(), "image/png")}).json()
    data = payload()
    data["image_id"] = side["id"]
    assert client.post(f"/api/sessions/{session['id']}/measure", json=data).status_code == 422


def test_session_deletion_removes_image_files_and_metadata(client):
    session, image, _ = calibrated_session(client)
    folder = client.app.state.store.directory / "sessions" / session["id"]
    assert folder.exists()
    assert client.delete(f"/api/sessions/{session['id']}").status_code == 204
    assert not folder.exists()
    assert client.get("/api/sessions").json() == []
    assert client.get(image["url"]).status_code == 404


def test_experiment_observations_are_persistent_and_do_not_change_measurements(client):
    session, _, measured = calibrated_session(client)
    base = f"/api/sessions/{session['id']}"
    observations = {"reference_length_mm": 19.7, "reference_width_mm": 16.1, "reference_source": "Independent caliper reading, fixture A",
                    "repeat_group": "fixture-A-lighting1", "effort_seconds": 63.5, "notes": "Reference uncertainty not yet characterized."}
    response = client.patch(base, json={"experiment": observations})
    assert response.status_code == 200
    result = client.get(base).json()
    assert result["experiment"] == observations
    assert result["measurement"] == measured
    assert any(value["kind"] == "experiment" for value in result["versions"])
    assert client.patch(base, json={"experiment": {"reference_length_mm": 0}}).status_code == 422
    assert client.patch(base, json={"experiment": {"effort_seconds": -1}}).status_code == 422
    assert client.patch(base, json={"experiment": {"notes": "x" * 2001}}).status_code == 422


def test_annotations_require_session_image_and_are_deleted_with_image(client):
    session, image, _ = calibrated_session(client)
    other_session, other_image, _ = calibrated_session(client)
    base = f"/api/sessions/{session['id']}"
    annotation = {"id": "pin-1", "image_id": image["id"], "x": .4, "y": .6, "note": "Inspect lateral boundary."}
    response = client.patch(base, json={"annotations": [annotation]})
    assert response.status_code == 200
    assert response.json()["annotations"] == [annotation]
    assert client.patch(base, json={"annotations": [{**annotation, "image_id": other_image["id"]}]}).status_code == 404
    assert client.patch(base, json={"annotations": [{**annotation, "x": 1.1}]}).status_code == 422
    assert client.patch(base, json={"annotations": [annotation, annotation]}).status_code == 422
    assert client.patch(base, json={"annotations": [{**annotation, "id": str(i)} for i in range(101)]}).status_code == 422
    assert client.get(base).json()["annotations"] == [annotation]
    client.delete(image["url"])
    assert client.get(base).json()["annotations"] == []
    assert client.get(f"/api/sessions/{other_session['id']}").status_code == 200


@pytest.mark.skipif(not (Path(__file__).parents[1] / "app" / "geometry.py").is_file(), reason="CAD module is not yet available")
def test_end_to_end_actual_cad_review_provenance_and_deletion(client):
    session, image, _ = calibrated_session(client)
    base = f"/api/sessions/{session['id']}"
    parameters = geometry_parameters()
    parameters["width_mm"] = 15
    generated = client.post(base + "/generate", json={"parameters": parameters, "review_confirmed": True})
    assert generated.status_code == 201, generated.text
    model = generated.json()
    assert model["validation"]["passed"] is True
    assert len(model["mesh"]["vertices"]) > 20
    assert model["parameter_provenance"]["length_mm"] == "measured"
    assert model["parameter_provenance"]["width_mm"] == "manually_adjusted"
    for format, url in model["downloads"].items():
        download = client.get(url)
        assert download.status_code == 200, (format, download.text)
        assert len(download.content) > 100
    export = client.get(model["downloads"]["parameters"]).json()
    assert export["parameter_provenance"]["width_mm"] == "manually_adjusted"
    assert export["source_measurement"]["provenance"]["transverse_rise_mm"] == "unknown"
    accepted = {"contour_accepted": True, "geometry_accepted": True, "notes": "Only geometric inspection, no wear.", "issues": []}
    assert client.patch(base, json={"feedback": accepted, "state": "geometrically_reviewed"}).status_code == 200
    accepted["geometry_accepted"] = False
    state = client.patch(base, json={"feedback": accepted}).json()
    assert state["state"] == "measurement_review_needed"
    accepted["geometry_accepted"] = True
    client.patch(base, json={"feedback": accepted, "state": "geometrically_reviewed"})
    client.post(base + "/images?view=side", files={"file": ("side.png", photograph(), "image/png")})
    state = client.get(base).json()
    assert state["state"] == "measurement_review_needed"
    assert state["feedback"]["geometry_accepted"] is False
    assert client.delete(image["url"]).status_code == 204
    for url in model["downloads"].values():
        assert client.get(url).status_code == 404
