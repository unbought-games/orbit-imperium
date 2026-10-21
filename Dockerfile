FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
# Package source and build both halves from this same snapshot. Never omit the
# backend, build scripts or lockfiles from the source offered to players.
COPY .config .config
COPY .github .github
COPY apps apps
COPY contracts contracts
COPY crates crates
COPY deploy deploy
COPY docs docs
COPY fixtures fixtures
COPY rules rules
COPY scripts scripts
COPY .dockerignore .env.example .gitignore .node-version .prettierignore .prettierrc.json AGENTS.md Cargo.lock Cargo.toml Dockerfile LICENSE Makefile README.md compose.yaml eslint.config.js playwright.config.ts rust-toolchain.toml ./
RUN npm run build

FROM rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6 AS rust
WORKDIR /build
COPY --from=web /build/Cargo.toml /build/Cargo.lock /build/rust-toolchain.toml ./
COPY --from=web /build/crates crates
COPY --from=web /build/rules rules
COPY --from=web /build/scripts/collect-rust-notices.sh scripts/collect-rust-notices.sh
# Build and retain a distinct bridge image with --build-arg ORBIT_CARGO_FEATURES=universe-config-bridge.
ARG ORBIT_CARGO_FEATURES=""
RUN cargo build --locked --release -p orbit-server --features "$ORBIT_CARGO_FEATURES"
# Preserve upstream notices for the downloaded Rust dependency sources,
# including notices for bundled native code.
RUN sh scripts/collect-rust-notices.sh /usr/local/cargo/registry/src > /tmp/rust-notices.txt

FROM debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home orbit
WORKDIR /app
COPY --from=rust /build/target/release/orbit /usr/local/bin/orbit
COPY --from=web /build/apps/web/dist /app/web
COPY --from=rust /tmp/rust-notices.txt /app/web/rust-notices.txt
USER orbit
ENV ORBIT_BIND=0.0.0.0:8080 ORBIT_ASSETS=/app/web
EXPOSE 8080
ENTRYPOINT ["orbit"]
CMD ["serve"]
