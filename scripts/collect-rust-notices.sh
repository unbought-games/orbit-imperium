#!/bin/sh
set -eu
cd "${1:?Pass the Cargo registry source directory}"
# Some crates use LICENSE-MIT; others use LICENSES/MIT.txt. Keep nested
# notices too, including those belonging to bundled native libraries.
find . -type f \( \
  -iname 'license*' -o -iname 'copying*' -o -iname 'copyright*' -o \
  -iname 'notice*' -o -ipath '*/licenses/*' \
\) -exec sh -c 'for file do printf "\n%s\n\n" "$file"; cat "$file"; done' sh {} +
