# SignalMap 3D experimental snapshot

This directory preserves the latest **recoverable standalone** SignalMap 3D source artifact from the project work (saved 2026-11-03).

## Included
- RF Digital Twin / empirical propagation simulation with tunable site parameters.
- Local terrain renderer and real-terrain MapLibre extension with visual caveats.
- CSV all-cell inventory, optional site coordinates and 2D/3D overlays.
- Optional bounded OpenStreetMap/Overpass public antenna discovery. Public mapping is incomplete and the application must not infer physical antenna locations from drive-test centroids.
- Original coverage/report workflow retained in this standalone snapshot.

## Deployment status
- **Experimental source only.** The production app is still `/index.html` with external `/app.js`, hosted dependencies and a strict Content-Security-Policy.
- This standalone HTML contains inline scripts and dynamically loads third-party resources; those scripts are not permitted by the production Vercel CSP as written.
- Do **not** make this the production entrypoint or relax the global CSP without first splitting code into locally hosted modules, pinning/hosting dependencies, configuring narrow network permissions, and running browser regression/security tests.
- Open the file locally or use a development web server for exploratory tests, acknowledging that network maps/DEM/OSM fetches need third-party service availability.

## Validation performed
- All 9 inline JavaScript blocks passed Node.js `--check` syntax validation.
- No real browser/visual confirmation was possible in the validation environment because Chromium was not installed.
- This is not a verified deployment-ready build.

## Source provenance
Source snapshot: `OCP_SignalMap_Real_Terrain_3D_Public_Antennas.html`. Work after this snapshot (including a later V13 build reported in chat) was not accessible as a complete source archive here, so these changes should not be misrepresented as that later build.
