# Privacy

Step Guide Recorder has no server and collects nothing. This page says
exactly what the extension stores and where it can go, so it can also serve
as the privacy policy for a store listing.

## What is stored, and where

Only while you are making a guide, and only on the tab you are explaining:

- **Pictures of the visible part of the page** at each click, and for a click
  that sets something moving, a few more over the next two to three seconds.
- **What was clicked**: the control's name as shown on the page (its label or
  its own words, at most 80 characters), its kind (button, link, tab...), and
  where it sits.
- **The page's title and address**, without the query string or fragment.

All of it is kept in the extension's own storage in your browser
(IndexedDB). Your settings are kept in the extension's settings storage.

## What is never stored

- Anything you type. The extension listens to no keys and reads no field's
  contents into the guide.
- Passwords, one-time codes and card numbers: those fields are painted over
  before every picture. No clip picture is taken while a field has the
  cursor or while a password field is on screen.

**Pictures show what is on screen**, so text already typed into ordinary
fields, names and other details on the page can appear in them. Look through
a guide before you share it.

## Where it can go

Nowhere, unless you choose. A guide leaves your browser only when:

- you download it (as a web page or JSON), or
- you set a destination under **Settings**, and the guide is sent there. Saving
  that setting asks Chrome for permission to reach that one address.

There are no analytics, no tracking and no third-party scripts.

## Deleting

Delete a guide from its page. Removing the extension deletes everything it
stored.

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Work on the tab where you pressed the icon. |
| `scripting` | Put the guide's panel on that tab. |
| `storage`, `unlimitedStorage` | Keep guides and their pictures in your browser. |
| `alarms` | Try a failed send again later. |
| All sites (optional, asked once) | Let a guide follow you to other tabs. You can say no. |
| One address (optional, asked in Settings) | Send guides to the destination you chose. |
