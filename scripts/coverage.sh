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

# Runs a report command with its output going to the terminal and to a file at
# once. Both halves matter: a failing suite must not be silent, and it must not
# replace a committed report with its own FAIL output, so the file is written
# aside and only promoted after the command has succeeded. POSIX sh has no
# PIPESTATUS, hence the marker file to carry the status out of the pipeline.
report_to() {
    report=$1
    shift
    partial="$report.partial"
    failed="$report.failed"

    rm -f "$partial" "$failed"
    { "$@" || : >"$failed"; } | tee "$partial"

    if [ -f "$failed" ]; then
        rm -f "$partial" "$failed"
        echo "the suite failed; $report was left unchanged" >&2
        return 1
    fi

    mv "$partial" "$report"
}

echo "==> Backend tests and coverage ($GO_IMAGE)"
report_to "$out_dir/backend.txt" \
    docker_run \
        --volume "$repo_root/backend:/work" \
        --env GOCACHE=/tmp/go-build \
        --env GOMODCACHE=/tmp/go-mod \
        --env GOFLAGS=-buildvcs=false \
        "$GO_IMAGE" \
        sh -c 'go test ./... -coverprofile=/tmp/coverage.out && go tool cover -func=/tmp/coverage.out'

echo "==> Frontend dependencies ($NODE_IMAGE)"
docker_run \
    --volume "$repo_root/frontend:/work" \
    --env npm_config_cache=/tmp/npm \
    "$NODE_IMAGE" \
    npm ci --no-audit --no-fund

# NO_COLOR is what keeps the report readable: Vitest colours its output even
# when stdout is a pipe, and the escape sequences survive into the committed
# file. The whole run is captured, not just the per-file table, because at 100%
# coverage the interesting numbers are in the summary the table is followed by.
echo "==> Frontend tests and coverage ($NODE_IMAGE)"
report_to "$out_dir/frontend.txt" \
    docker_run \
        --volume "$repo_root/frontend:/work" \
        --env npm_config_cache=/tmp/npm \
        --env NO_COLOR=1 \
        "$NODE_IMAGE" \
        npx vitest run --coverage

echo "==> Reports written to docs/coverage/"
