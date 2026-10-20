# vendor/

Third-party libraries, copied in so the site does not depend on a CDN.

| Library | Version | License |
|---|---|---|
| Leaflet | 1.9.4 | BSD-2-Clause (`leaflet/LICENSE`) |
| Leaflet.markercluster | 1.5.3 | MIT (`leaflet.markercluster/LICENSE`) |

To upgrade: download the new release from npm (`npm pack leaflet@<version>`), replace the
files from its `dist/` folder, and test the public map and the admin map before merging.
