# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Before you start

- **Small fix?** Open a pull request straight away.
- **New feature or a bigger change?** Open an issue first so we can agree on
  the shape before you spend time on it.
- **Security problem?** Do not open a public issue. See [SECURITY.md](SECURITY.md).

## Set up

No build step: the extension is plain JavaScript, HTML and CSS.

1. Fork and clone the repository.
2. Open `chrome://extensions`, turn on **Developer mode**, press
   **Load unpacked** and pick the repository folder.
3. After a change, press the reload icon on the extension's card, then reload
   the page you are testing on.

## Run the tests

```sh
npm install
npx playwright install chromium
npm test
```

The test drives the real extension in Chromium against the demo site in
`test/site/`. Screenshots land in `test/out/` (ignored by git). Every pull
request runs it on GitHub as well. `test/examples.js` checks the example
webhook receiver in `examples/`.

To redraw the README pictures and the sample guide after a visible change:
`npm run docs` (needs Pillow). Commit the new pictures with the change.

## What we look for in a pull request

- **One change per pull request**, with a short description of what it does
  and how you checked it. Add screenshots for anything you can see.
- **The tests pass**, and a new behaviour gets a check in `test/e2e.js`.
- **Privacy holds.** Never read what is typed into fields, never keep a
  query string or fragment, keep password and card fields painted out of
  pictures and clips, and send nothing anywhere unless the user chose a
  destination. A change that weakens any of these will not be merged.
- **No new permissions** unless there is no other way, explained in the pull
  request. Prefer optional permissions asked at the moment they are needed.
- **Talking to another system goes through `src/destinations.js`** and only
  there. Add a destination rather than a `fetch` elsewhere.
- **The guide format is a contract.** A change to the JSON in `src/format.js`
  must stay backwards compatible, or bump `format` (`step-guide/2`) and say so
  in [CHANGELOG.md](CHANGELOG.md).

## Code style

- Plain ES5-style JavaScript, no dependencies, no build step. Keep it that way
  so anyone can read and load the source as is.
- Two-space indent, single quotes, semicolons (see `.editorconfig`).
- Comments explain *why*, not *what*.
- Words on screen are plain and in sentence case: "Finish guide", not
  "FINISH GUIDE" or "Finalize workflow".

## Releases

1. Update `version` in `manifest.json` and `package.json`.
2. Add a section to [CHANGELOG.md](CHANGELOG.md).
3. Tag the commit `vX.Y.Z` and create a GitHub release with a zip of the
   extension (`git archive --format=zip -o step-guide-recorder.zip HEAD`).

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE), and to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
