# Mix n Match Padel

App served at https://mixnmatchpadel.reeldemiercoles.com

## Deploy

Every push to `main` uploads the repo to the subdomain's document root via GitHub Actions (FTPS).

Repo secrets needed:

| Secret | Value |
| --- | --- |
| `FTP_SERVER` | `ftp.reeldemiercoles.com` |
| `FTP_USERNAME` | FTP account scoped to `/home/reeldemi/mixnmatchpadel.reeldemiercoles.com` |
| `FTP_PASSWORD` | its password |

If the app later gets a build step (Vite, etc.), add a build job before the upload and point `local-dir` at the build output.
