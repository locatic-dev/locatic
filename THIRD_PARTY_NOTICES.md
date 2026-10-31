# Third-party notices

Locatic source uses the [MIT License](LICENSE). Dependencies, fonts, datasets, and remote member content retain their own licenses and rights.

| Material                                         | Attribution and terms                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geist and Geist Mono                             | The Geist Project Authors, SIL Open Font License 1.1. Retain [the full OFL](public/fonts/OFL.txt) with redistributed font files. Generated brand images use these fonts.                                                                                         |
| Natural Earth land data                          | [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), public domain, packaged through `world-atlas`. `scripts/generate-land-dots.mjs` derives the globe grid reused by brand images.                                                            |
| City catalog                                     | [GeoNames](https://www.geonames.org/), CC BY 4.0. Generation normalizes names, deduplicates/ranks places, adds aliases/regions, and transforms coordinates. Retain attribution and transformation details from [the archived snapshot](data/geonames/README.md). |
| Lucide icons                                     | [Lucide](https://lucide.dev/license), ISC with upstream notices from the installed `lucide-react` package.                                                                                                                                                       |
| GitHub avatars, README/media, and member content | Respective authors and providers. Remote content is not relicensed by Locatic's MIT license.                                                                                                                                                                     |

The [asset manifest](docs/oss-asset-inventory.json) records tracked public assets and their source generators. It identifies bytes, not authorship or trademark permission. The source license does not grant additional rights to third-party marks or uploaded content.

Vite emits bundled dependency notices at `dist/client/.vite/license.md` and `dist/server/.vite/license.md`. Retain both with redistributed artifacts. Builds complete missing texts from [version-pinned, hash-checked upstream supplements](data/licenses/README.md) and fail on unknown missing or mismatched texts.

The historical copyright text for `react-remove-scroll-bar@2.3.8` remains unconfirmed because its published gitHead is unavailable. Its supplement records the pinned upstream MIT notice and this provenance limit; confirm the historical notice before claiming complete built-distribution clearance.

Review the actual source, binary, or container inventory before redistribution. Test/build-only and optional native packages need their own notice review if you distribute development tools, containers, or `node_modules`.
