import io
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
