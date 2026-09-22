#!/bin/sh
# Regenerates the coverage reports for both layers.
#
#   ./scripts/coverage.sh
#
# Everything runs inside pinned containers, so no local Go or Node toolchain is
# required (DESIGN.md D13). Reports are written to docs/coverage/.
set -eu

GO_IMAGE="golang:1.26-alpine"
NODE_IMAGE="node:22-alpine"

repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
out_dir="$repo_root/docs/coverage"

if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required to run the test suites" >&2
    exit 1
fi

mkdir -p "$out_dir"

# Containers run as the invoking user so that generated files are owned by that
# user rather than by root. That user has no entry in the image's /etc/passwd,
# so HOME is redirected to a writable path and each toolchain's cache follows.
docker_run() {
    docker run --rm \
        --user "$(id -u):$(id -g)" \
        --env HOME=/tmp \
        --workdir /work \
        "$@"
}

echo "==> Backend tests and coverage ($GO_IMAGE)"
docker_run \
    --volume "$repo_root/backend:/work" \
    --env GOCACHE=/tmp/go-build \
    --env GOMODCACHE=/tmp/go-mod \
    --env GOFLAGS=-buildvcs=false \
    "$GO_IMAGE" \
    sh -c 'go test ./... -coverprofile=/tmp/coverage.out && go tool cover -func=/tmp/coverage.out' \
    >"$out_dir/backend.txt"
cat "$out_dir/backend.txt"

echo "==> Frontend dependencies ($NODE_IMAGE)"
docker_run \
    --volume "$repo_root/frontend:/work" \
    --env npm_config_cache=/tmp/npm \
    "$NODE_IMAGE" \
    npm ci --no-audit --no-fund

echo "==> Frontend tests and coverage ($NODE_IMAGE)"
docker_run \
    --volume "$repo_root/frontend:/work" \
    --env npm_config_cache=/tmp/npm \
    "$NODE_IMAGE" \
    npx vitest run --coverage \
    >"$out_dir/frontend.txt"
cat "$out_dir/frontend.txt"

echo "==> Reports written to docs/coverage/"
