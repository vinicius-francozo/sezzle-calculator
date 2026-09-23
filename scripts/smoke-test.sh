#!/bin/sh
set -eu

base_url=${BASE_URL:-http://localhost:3000}

if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required to check the response bodies" >&2
    exit 1
fi

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
headers="$work_dir/headers"
body="$work_dir/body"

failures=0

open_check=
broken=

fail() {
    broken="$broken      - $1
"
}

close_check() {
    [ -n "$open_check" ] || return 0

    if [ -z "$broken" ]; then
        echo "ok    $open_check"
    else
        failures=$((failures + 1))
        echo "FAIL  $open_check"
        printf '%s' "$broken"
        echo "----- response -----"
        cat "$headers" "$body"
        echo
        echo "--------------------"
    fi

    open_check=
    broken=
}

check() {
    close_check
    open_check=$1
    expected_status=$2
    predicate=$3
    shift 3

    : >"$headers"
    : >"$body"
    status=$(curl --silent --show-error --dump-header "$headers" --output "$body" \
        --write-out '%{http_code}' "$@") || status=000

    if [ "$status" != "$expected_status" ]; then
        fail "expected HTTP $expected_status, got $status"
        return 0
    fi
    if [ -n "$predicate" ] && ! jq --exit-status "$predicate" "$body" >/dev/null; then
        fail "body does not satisfy: $predicate"
    fi
}

check_header() {
    [ -z "$broken" ] || return 0
    grep -i -q "^$1:.*$2" "$headers" || fail "expected header '$1: $2'"
}

check_body_contains() {
    [ -z "$broken" ] || return 0
    grep -q -- "$1" "$body" || fail "body does not contain '$1'"
}

calculate="$base_url/api/v1/calculate"
json='Content-Type: application/json'

check "the SPA is served" 200 '' "$base_url/"
check_body_contains '<div id="root">'

check "health probe answers" 200 '.status == "ok"' \
    "$base_url/api/v1/health"

check "addition is computed" 200 '.operation == "add" and .operands == [2, 3] and .result == 5' \
    --header "$json" --data '{"operation":"add","operands":[2,3]}' "$calculate"

check "division by zero is refused" 400 '.error.code == "DIVISION_BY_ZERO"' \
    --header "$json" --data '{"operation":"divide","operands":[12,0]}' "$calculate"

check "an unknown API route is refused" 404 \
    '.error.code == "NOT_FOUND" and (.error.message | type) == "string"' \
    "$base_url/api/v1/no-such-route"

check "a wrong method is refused" 405 '.error.code == "METHOD_NOT_ALLOWED"' \
    --request GET "$calculate"
check_header 'Allow' 'POST'

close_check

if [ "$failures" -ne 0 ]; then
    echo "$failures check(s) failed against $base_url" >&2
    exit 1
fi

echo "all checks passed against $base_url"
