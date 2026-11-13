# Analytics dependency

`unbought-analytics-0.1.2.tgz` is the npm package used by the lockfile. It includes
its MIT license. `analytics-source-c1ce8a2.tar.gz` contains the corresponding
source at analytics commit `c1ce8a2`; extract it, run `npm ci && npm run build`,
then `npm pack --ignore-scripts --workspace ./packages/browser` to reproduce the
package. Both archives are included in Orbit's downloadable source offer.
Repository: https://github.com/unbought-games/analytics
