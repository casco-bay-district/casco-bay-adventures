# Handoff guide

Written so the next volunteer can keep this running without asking the person who built it.

## Who owns what

| Piece | Where it lives | Owned by |
|---|---|---|
| Public website code | This GitHub repository (organization account) | At least two GitHub organization **Owners** |
| Google Site (the page people visit) | District chair's Google Workspace account | The district chair role account |
| Google Sheet (the data) and its Apps Script | Same Google account | The district chair role account |
| Apps Script web app "Execute as" identity | Same Google account | The district chair role account |

The Google pieces live under the district chair account on purpose: that role is nearly always filled. It only
works if that account is treated as a **role account that passes from chair to chair**, not as one person's
account. Checklist:

- [ ] Sign-in details are stored in the district's password manager, not in one person's head.
- [ ] Recovery phone and recovery email are district-controlled, and two people can complete a recovery.
- [ ] At least two people know who administers the Google Workspace (an admin can suspend the account).
- [ ] The Sheet's Editor list is short. Editors can open the script and read the passphrase and signing secret.

## Chores

**Each chair change:** pass the account's credentials and recovery details to the new chair; add them as a GitHub
organization Owner; rotate the passphrase (below).

**Rotate the passphrase:** Google Sheet -> Extensions -> Apps Script -> Project Settings -> Script Properties ->
change `ADMIN_PASSCODE` (12+ characters). Tell active volunteers. To sign everyone out immediately, also change
`SESSION_SECRET` (20+ characters, random).

**Change the backend code:** edit `apps-script/Code.gs` in this repo, paste it into the Apps Script editor, then
**Deploy -> Manage deployments -> pencil -> Version: New version -> Deploy.** Do not choose *New deployment*;
that creates a different URL and the site stops working until `gasUrl` in `js/config.js` is updated.

**Check data health:** in the Apps Script editor choose the function `checkSetup`, click Run, then View -> Logs.
It lists rows with missing coordinates or towns. Also glance at the latest *Refresh location snapshot* run
under the repo's Actions tab.

**Restore a removed location:** Google Sheet -> data tab -> clear that row's **Status** cell. (The Change Log tab
shows the row number.) Public changes appear within 5 minutes.

**Undo a bad edit:** Google Sheet -> File -> Version history, or find the old values in the Change Log tab.

## If the Actions tab says the workflow is disabled

GitHub may pause scheduled workflows in a repository with no activity for about 60 days. Open Actions, click
the workflow, and choose **Enable workflow**. The site keeps working without it (it just has an older saved copy).

## If the Apps Script stops working

Symptoms: orange "Saved copy" label; admin can't sign in. Check, in order: the Apps Script deployment is still
active (Deploy -> Manage deployments); the Google account hasn't been suspended or lost its Workspace license;
Script Properties still exist; Google's service status. The saved copy keeps the public site usable meanwhile.
