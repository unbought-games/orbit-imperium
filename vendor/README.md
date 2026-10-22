# Analytics dependency

`unbought-analytics-0.1.1.tgz` is the npm package used by the lockfile. It includes
its MIT license. `analytics-source-610996d.tar.gz` contains the corresponding
source at analytics commit `610996d`; extract it, run `npm ci && npm run build`,
then `npm pack --ignore-scripts --workspace ./packages/browser` to reproduce the
package. Both archives are included in Orbit's downloadable source offer.
Repository: https://github.com/unbought-games/analytics
