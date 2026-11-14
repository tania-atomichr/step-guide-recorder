# Changelog

All notable changes are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `examples/sample-guide.html`: a finished guide to open without installing.
- `examples/webhook-server.js`: a receiver with no dependencies that saves
  each guide as a folder of pictures, JSON and a README, with its own test.
- `scripts/make-docs.py` and `npm run docs` redraw every README picture from
  the test; the README shows a clip playing and phone screenshots.

### Fixed

- On a phone, the menu at the top of the extension's pages stays on one line.

## [0.1.0] - 2026-11-13

### Added

- Make a guide by clicking through a task: each click is a step with a
  sentence and a picture, the clicked thing ringed.
- Panel on the page with the count and the last steps, Pause, Undo last step
  and Finish guide; drag it anywhere.
- The guide follows you across tabs (optional all-sites permission), or
  carries on when you press the icon on a new tab.
- A step that sets something moving (a menu, a scroll, a drag) gets a short
  clip, decided by the extension. A drag is one step.
- Guide page: edit the title and each sentence, take a step out, delete.
- Download as one self-contained web page or as JSON (`step-guide/1`).
- Destinations: keep in the browser, or send to a webhook with an optional
  bearer secret; failed sends are retried.
- Privacy: typing never recorded, password and card fields painted out,
  addresses kept without query or fragment.
