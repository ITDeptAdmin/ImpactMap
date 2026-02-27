# Technical Reference – RAM Impact Map

This document explains the architecture.

---

# Architecture Overview

WordPress Plugin (JS + PHP)
↓
Loads GeoJSON from GitHub
↓
Mapbox GL JS renders map
↓
GTM captures events
↓
GA4 stores engagement data

---

# Data Pipeline

Master CSV (data/)
↓
Python Script (scripts/)
↓
GeoJSON (output/)
↓
GitHub Raw URL
↓
WordPress Plugin Config
↓
Map loads dataset

---

# Important Configuration Location

File:
ram-impact-map.php

Contains:
- Mapbox token
- geojsonUrl
- dataset version

The critical line is the GeoJSON URL.

If repo name changes, this must be updated.

---

# JavaScript Responsibilities

ram-impact-map.js handles:

- Map initialization
- Filter logic
- Sidebar rendering
- Search
- Cluster handling
- Zoom behavior
- GA4 tracking events

---

# Data Requirements

GeoJSON must contain:

"type": "FeatureCollection"
"features": [...]

Each feature must contain:
- geometry.type = "Point"
- coordinates [lng, lat]
- required properties (city, state, country, expedition, etc.)

If geometry is invalid, it will not render.

---

# Map Behavior Notes

• Desktop only map initialization  
• Mobile shows list layout  
• Filters auto-zoom to selected region  
• Cluster click expands zoom  
• Marker click syncs with sidebar  

---

# Performance Notes

Dataset size ~1MB  
Loads from GitHub raw CDN  
If dataset exceeds ~5MB, performance may degrade
