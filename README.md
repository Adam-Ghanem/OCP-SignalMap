# OCP SignalMap

Professional 4G coverage heatmap viewer and PDF reporting tool.

## Files

- `index.html` — main application source code.
- `assets/ocp_signalmap_icon.png` — square icon used in the interface.
- `assets/ocp_signalmap_brand_logo.png` — brand logo backup.
- `sample_data/test_4g_heatmap_sample.csv` — sample CSV for testing.

## How to run

1. Open `index.html` with Google Chrome.
2. Keep internet enabled because the app loads map tiles and browser libraries.
3. Click **Upload CSV**.
4. Select your network measurement CSV.
5. Choose:
   - Technology: `4G`
   - Metric: `RSRP`
6. Use:
   - **Download Map View** to export the current heatmap image.
   - **Download PDF Report** to export the professional report.

## Expected CSV columns

The app supports flexible column names, but these are recommended:

```csv
latitude,longitude,LA TECHNOLOGIE,RSRP,RSRQ,SINR,LA VITESSE,ALTITUDE,TEMPS,cell_id
```

Required:
- Latitude column: `latitude`, `lat`, `gps latitude`, or similar.
- Longitude column: `longitude`, `lon`, `lng`, or similar.
- Metric column: `RSRP` recommended.

Optional:
- `RSRQ`
- `SINR`
- `LA VITESSE`
- `ALTITUDE`
- `TEMPS`
- `cell_id`

## Signal thresholds

For RSRP:
- Weak: `< -105 dBm`
- Good: `-105 to -90 dBm`
- Excellent: `>= -90 dBm`

## Notes

This is a static browser application. No Python, Streamlit, or server is required.
Just open `index.html` in Chrome.
