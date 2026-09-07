# coreDECK Web

coreDECK Web is a mobile-first, installable medical revision companion generated from the MedVenture repository. It approaches the curriculum condition-first rather than reproducing MedVenture's case-based game.

## Study modes

- **Core conditions** — browse all 337 curriculum entries, inspect the 240 authored condition cards, patient anchors and quick views, and see uncovered source entries without fabricated fill.
- **Presentations** — explore 137 authored presentation clusters, their core and must-not-miss conditions, cases and contrast sets.
- **Compare** — place two to four authored condition cards side by side across the quick-view dimensions already present in MedVenture.
- **Clinical images** — inspect the 74 registered media requirements: 72 visual attachments backed by 67 source PNGs and two intentionally text-only results.
- **Recall** — reveal repository-authored prompts and save lightweight confidence ratings locally on the device.

The interface retains MedVenture review status. Generated media is stylised educational artwork, not diagnostic source imaging, and all media and registry relationships currently require clinical review.

## Source sync

The committed site data is a deterministic projection of a sibling MedVenture checkout. The source folder is read-only to the sync process.

```sh
npm run sync:data -- --source /absolute/path/to/MedVenture
npm run check:sync
```

The pipeline:

1. loads the curriculum and presentation registries;
2. joins cases, encounters, patient cards, condition cards, catalogues, progression and media by stable IDs;
3. fails on missing required records or media references;
4. copies only referenced clinical-media assets and the existing app icon;
5. writes a minified, stable JSON snapshot with the source Git revision and a SHA-256 content fingerprint.

It does not infer, rewrite or supplement clinical material.

## Development

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Validation:

```sh
npm test
npm run lint
npm run build
```

## Deployment

`main` is tested and deployed to GitHub Pages by `.github/workflows/pages.yml`. The production build uses `/coredeck-web` as its Pages base path and then normalises vinext's nested asset output for GitHub's project-site routing; local and Sites builds remain rooted at `/`.

The application is a static PWA. Study bookmarks and recall confidence are device-local and are never sent to a server.

## Source snapshot

- MedVenture revision: `99656bdd35f45659431278713f696c0d8d938b9c`
- Snapshot fingerprint: see `public/data/coredeck.json`
- Curriculum entries: 337
- Playable conditions/cases: 240
- Unmapped and uncovered source entries: 97
- Presentation clusters: 137
- Registered media requirements: 74

## Clinical governance

This project presents the repository's educational content as supplied. It is not a clinical decision-support system and must not be used for patient care. Repository records marked `review_required` remain visibly marked in the website.
