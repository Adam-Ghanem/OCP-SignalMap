# OCP SignalMap

Professional 4G coverage map viewer and PDF reporting tool.

## What it does

OCP SignalMap is a static browser application for visualizing 4G coverage measurements from a CSV file. It reads latitude, longitude, and signal metrics such as RSRP, then shows:

- Interactive map points
- Weak / Good / Excellent signal classification
- Summary cards
- Priority weak zones table
- Basic PDF report export

## Files

- `index.html` — main application source code.
- `sample_data/test_4g_heatmap_sample.csv` — sample CSV for testing.

## How to run

1. Open `index.html` with Google Chrome.
2. Keep internet enabled because the app loads map tiles and browser libraries from CDNs.
3. Click **Upload CSV** or **Load sample**.
4. Choose:
   - Technology: `4G`
   - Metric: `RSRP`
5. Use **Download PDF Report** to export a basic report.

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
