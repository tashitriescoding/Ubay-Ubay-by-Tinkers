# 0009: A password-protected admin page on the site

- Status: Accepted
- Date: 2026-10-01
- Source: PRD §7 (amended), owner's choice in planning

## Context
Decision 0008 moved uploads and signed letters onto the website, stored in
the org's Google Drive, with a Google Sheet logging each signup and upload.
The PRD had ruled out an admin dashboard ("the Google Sheet is the record").
The owner asked for "the back of the website" where admins see signed copies
and uploads, and picked an admin page on the site over just using Drive.

## Options considered
- **Drive folder plus Sheet:** nothing to build or secure. Google handles
  login, and only people the folder is shared with can see it.
- **Admin page on the site (`admin.html`):** one view showing who signed,
  who uploaded, and who is missing designs, with links to each letter and
  folder. It feels like part of the website, and admins don't have to dig
  through Drive.

## Decision
Build `admin.html`. It isn't linked anywhere and is marked `noindex`. It asks
for a password, which is sent to the Apps Script and checked there against a
stored script property, so the password never appears in page code. Repeated
wrong tries are slowed down. The page shows a table built from the Sheet. File
links open in Drive, so actually opening a file still needs the org's Google
login or a share.

## Consequences
Admins get one status view per artist without learning Drive. **Given up:**
- Google's login. A single shared password is weaker, and it can't tell
  admins apart or be revoked for one person without changing it for all.
- Less to build. This is a third page plus an admin route in the script.
- Smaller exposure. Names, emails, and social handles (personal data under
  RA 10173, the Philippine Data Privacy Act) now leave Google's protection
  whenever the right password is typed. Before, they never left it.

## Generalizes to
**Admin view for a small project: a custom page behind a shared password vs
the storage tool's own interface.** A custom page is worth it when the admins
are non-technical, there are only a few of them, and the data is low-risk and
short-lived. It does NOT hold when admins need separate accounts or an audit
trail, the data is sensitive or kept long, or the storage tool's own view is
already good enough. In those cases, share the folder and Sheet and skip the
page.
