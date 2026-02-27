# Disaster Recovery

If map is completely blank:

1. Clear cache in CloudFlare and Siteground
2. Test GeoJSON URL directly in browser.  
3. Open DevTools → Console for errors.
4. Check:
   - 404 errors
   - CORS errors
   - Invalid token
5. Revert to last working commit in GitHub.

If Mapbox tiles fail:
Check Mapbox token in ram-impact-map.php.

If filters stop working:
Check JavaScript console for syntax errors.
