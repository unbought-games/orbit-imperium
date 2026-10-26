# Location preview fonts

IBM Plex Sans is bundled for deterministic location-preview typography on hosts
without system fonts. Source: https://github.com/google/fonts/tree/main/ofl/ibmplexsans
License: SIL Open Font License 1.1 (`OFL.txt`). The runtime distribution also
serves that license at `/licenses/IBM-Plex-Sans-OFL.txt`.

Noto Emoji provides monochrome outline fallback for emoji missing from IBM Plex
Sans, including medal names, flags, skin tones and joined emoji. The renderer
uses only these bundled fonts, keeping existing Latin, Greek and Cyrillic text
in IBM Plex Sans. This is finite font coverage, not a promise to support every
Unicode script or future emoji. Naming and metadata continue to accept Unicode.

The unmodified font is `ofl/notoemoji/NotoEmoji[wght].ttf` from Google Fonts
commit `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`, renamed `NotoEmoji.ttf`:
https://github.com/google/fonts/tree/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notoemoji
SHA-256: `de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551`.
Copyright 2013 Google LLC; SIL Open Font License 1.1 (`Noto-Emoji-OFL.txt`),
also distributed at `/licenses/Noto-Emoji-OFL.txt`. Retain these notices when
redistributing the embedded font or server binary.

Canonical asset provenance and copies are maintained in the umbrella brand
workspace at `assets/orbit-imperium/location-preview-fonts/`; this repository
contains all required build/runtime files and has no dependency on that workspace.

Run `make test-location-previews`. Set `ORBIT_PREVIEW_OUTPUT` to an absolute
scratch directory to inspect the normal, emoji, mixed, Unicode and long-name PNGs.
