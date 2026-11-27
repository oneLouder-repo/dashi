# Canada base map (Place)

`canada.json` is a GeoJSON FeatureCollection for Place's offline "drawn" base map of Canada:
the 13 provinces and territories (`layer: province`, `id` = postal code, `ct` = label point),
the neighbouring land (`layer: neighbour`: the United States and Greenland) and the large lakes (`layer: lake`).

- Source: Natural Earth 1:50m cultural and physical vectors (public domain, naturalearthdata.com),
  as packaged in `sane-topojson` 4.0.0 (MIT, north-america_50m.json).
- Made with a one-off script: TopoJSON decoded, Douglas–Peucker simplified at 0.04°, small islands
  (under 0.02 sq°) and lakes (under 0.4 sq°) dropped, coordinates rounded to 0.01°. About 120 KB.
