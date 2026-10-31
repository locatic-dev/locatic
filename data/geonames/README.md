# GeoNames contributor catalog snapshot

This directory contains the official GeoNames `cities15000.zip`, region lookup and extract README retrieved over HTTPS on October 23, 2026. The snapshot archive is about 3.3 MB; it is optional contributor data and is not imported into the browser/Worker build or a database automatically.

Data credit: **GeoNames**, [geonames.org](https://www.geonames.org/), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The provider's full extract README/license statement is retained in `2026-10-23/README.geonames.txt`. The input URLs, retrieval time and SHA-256 hashes are recorded in `2026-10-23/manifest.json`.

Locatic's generator filters supported populated-place feature codes, folds names, adds region/country labels and aliases, deduplicates same-slug places, ranks by population and transforms coordinates/storage shape. These are changes to the original dataset. The output is not a complete list of every locality worldwide; it covers the supported/deduplicated entries in this GeoNames snapshot. The data is supplied without a guarantee of accuracy or completeness.

Run `pnpm cities:catalog --check` to verify the archived inputs, extracted city text, generated row count and output hash. It requires Node 24 and the standard `unzip` program (available on macOS and the CI Ubuntu image). The manifest records the exact Node/ICU-generating version. To produce a reviewed JSONL artifact, pass `--output /tmp/locatic-cities.jsonl`; existing output files are refused. This command does not contact a deployment or import data.

New snapshots must be deliberate updates: archive the official inputs and README, review source/license and place/slug changes, regenerate the fixed-timestamp output, then update hashes and row count together. Keep existing city IDs and references intact when planning any later deployment import; replacement/deletion needs its own authorization and migration.
