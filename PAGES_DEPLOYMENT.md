# GitHub Pages deployment

Target repository: `dislisdev/3D-Nails`.
Expected project URL once Pages is enabled and deployment succeeds: `https://dislisdev.github.io/3D-Nails/`.

## What is published

Only `frontend/dist` is uploaded as the Pages artifact. It contains application code, bundled local fonts and build assets. The deployment excludes `.data`, private photographs, SQLite databases, local test artifacts, virtual environments and dependency caches. No credential or backend endpoint is embedded in the Pages build.

`frontend/.env.pages` selects `VITE_RUNTIME=browser`; this is a public build flag, not a secret. Vite uses relative asset paths so the application works under the project subdirectory. Ordinary `npm --prefix frontend run build` retains the Python API runtime for local development.

## Automatic workflow

`.github/workflows/pages.yml` builds on pushes to `main` and can also be run manually. It uses pinned official GitHub Actions, installs locked npm dependencies, runs the Pages build and static browser smoke test, then deploys the tested static artifact. The deploy job has only Pages-write and OpenID-token permissions; the build has repository-read permission.

Enable **Settings → Pages → Build and deployment → Source: GitHub Actions** for the repository. A repository administrator can also use the REST API to create/update the Pages site with `build_type: workflow`. GitHub Pages availability depends on repository visibility and the account's plan; do not change repository visibility without the owner's authorization.

After deployment, verify the actual HTTPS site, assets at `/3D-Nails/`, camera/upload, IndexedDB reload, calibrated measurements, actual geometry exports and deletion. The same smoke script can target the public site by setting `NAILFORM_PAGES_URL`; it uses clearly synthetic test data stored only in its temporary browser profile.

## Browser storage and CAD

Camera access uses HTTPS on Pages. Photographs, sessions, annotations, models and reviews stay in IndexedDB for that browser and device. Blob download URLs are recreated after reload. Session/image deletion also removes dependent models and revokes in-memory URLs. There is no server, professional account service or cross-device sharing in this edition.

The browser mesh is a triangulated approximation, with explicitly manual curvature inputs. STEP is a genuine faceted boundary representation, not a smooth B-spline STEP or a renamed STL. Runtime validation checks the implemented mesh properties and leaves independent kernel validity, global self-intersection and global minimum-thickness checks explicitly unverified. Use the Python engine for the original server-side B-spline workflow.

## Development and independent checks

```bash
npm --prefix frontend run build:pages
node scripts/pages_smoke.cjs
node scripts/test_browser_geometry.mjs /tmp/nailform-browser-cad
/workspace/.venvs/nailform/bin/python scripts/verify_browser_cad.py /tmp/nailform-browser-cad
```

The last command independently loads generated STL/STEP with Trimesh and CadQuery/OpenCascade; Python is needed only for that development verification, not for the hosted browser workflow.
