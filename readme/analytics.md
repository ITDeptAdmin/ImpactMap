# Impact Map Tracking Documentation

Tracking Method:
GTM Data Layer Push Events

All events include:
- ram_feature: impact_map
- filter_country
- filter_state
- filter_year

---

# Events Tracked

ram_map_load  
ram_map_filter_change  
ram_map_filters_reset  
ram_map_reset_view  
ram_map_search  
ram_map_search_no_results  
ram_map_city_expand  
ram_map_expedition_select  
ram_map_popup_open  
ram_map_cluster_click  
ram_map_marker_click  
ram_map_back_to_top  

---

# Key Parameters

place_label  
place_city  
place_state  
place_country  
expedition_key  
group_key  
results_count  
click_source  
sum_clinics  

---

# Where To View

GTM Preview Mode – verify events  
GA4 DebugView – validate parameters  
GA4 Explore – create reports  

---

# Do Not

• Rename event names
• Remove dataLayer pushes
• Delete GTM variables without checking impact

---

# Impact Map Update Center — Analytics Note

The public Impact Map uses GTM/GA4 `ram_map_*` events described above.

The **Impact Map Update Center** (`docs/geocode-review/`) is a staff data-maintenance tool. It is separate from the public map and does not currently fire any analytics events.

If dashboard tracking is added in the future, use separate event names such as `ram_impact_update_center_*` so staff actions do not mix with public map engagement data in GA4 reports.

Do not rename or remove existing `ram_map_*` dataLayer events without first checking GA4 and GTM for active tags, triggers, and reports that depend on them.
