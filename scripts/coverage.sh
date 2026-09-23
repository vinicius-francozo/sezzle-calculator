#!/bin/sh
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

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
trap 'rm -rf "$tmp_dir"; exit 130' INT
trap 'rm -rf "$tmp_dir"; exit 143' TERM

docker_run() {
    docker run --rm \
        --user "$(id -u):$(id -g)" \
        --env HOME=/tmp \
        --workdir /work \
        "$@"
}

whole_output() {
    cat
}

coverage_section() {
    sed -n '/Coverage report from/,$p'
}

report_to() {
    report=$1
    filter=$2
    shift 2
    capture="$tmp_dir/capture"
    promoted="$tmp_dir/promoted"
    failed="$tmp_dir/failed"

    rm -f "$capture" "$promoted" "$failed"
    { "$@" || : >"$failed"; } | tee "$capture"

    if [ -f "$failed" ]; then
        echo "the suite failed; $report was left unchanged" >&2
        return 1
    fi

    "$filter" <"$capture" >"$promoted"
    if [ ! -s "$promoted" ]; then
        echo "no report in the output; $report was left unchanged" >&2
        return 1
    fi

    mv "$promoted" "$report"
}

echo "==> Backend tests and coverage ($GO_IMAGE)"
report_to "$out_dir/backend.txt" whole_output \
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

echo "==> Frontend tests and coverage ($NODE_IMAGE)"
report_to "$out_dir/frontend.txt" coverage_section \
    docker_run \
        --volume "$repo_root/frontend:/work" \
        --env npm_config_cache=/tmp/npm \
        --env NO_COLOR=1 \
        "$NODE_IMAGE" \
        npx vitest run --coverage

echo "==> Reports written to docs/coverage/"
