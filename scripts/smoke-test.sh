#!/bin/sh
# Exercises the composed stack through the nginx proxy, the way a user reaches
# it: every request goes to the published frontend port, never to the backend
# container directly (DESIGN.md D14). What it asserts is the frozen contract in
# docs/api.md, so a drift between the two layers fails here.
#
#   docker compose up --build --detach --wait
#   ./scripts/smoke-test.sh
#
# BASE_URL overrides the default stack address.
set -eu

base_url=${BASE_URL:-http://localhost:3000}

# Every body assertion is a jq predicate, so without jq each of them would come
# back false and the run would read as a wall of application failures. Say what
# is actually missing instead.
if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required to check the response bodies" >&2
    exit 1
fi

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
headers="$work_dir/headers"
body="$work_dir/body"

failures=0
response_ok=yes

# Records one failed expectation together with the whole response. A CI log that
# says only "exit 1" cannot be read from a browser tab a week later, so the
# status line, the headers and the body are all printed at the point of failure.
fail() {
    failures=$((failures + 1))
    response_ok=no
    echo "FAIL  $description: $1"
    echo "----- response -----"
    cat "$headers"
    cat "$body"
    echo
    echo "--------------------"
}

# check DESCRIPTION EXPECTED_STATUS JQ_PREDICATE [curl arguments...]
#
# The predicate is a jq boolean over the response body; an empty one skips the
# body check, for responses that are not JSON. jq keeps its stderr: it is silent
# about a predicate that is merely false, so anything it does say is a fault in
# the predicate itself, and swallowing it would blame the application for a
# broken assertion.
check() {
    description=$1
    expected_status=$2
    predicate=$3
    shift 3

    response_ok=yes
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
        return 0
    fi
    echo "ok    $description"
}

# The two assertions below read the response of the most recent check, which is
# why they follow it immediately -- and why they stay quiet when that check has
# already printed the response.
check_header() {
    [ "$response_ok" = yes ] || return 0
    grep -i -q "^$1:.*$2" "$headers" || fail "expected header '$1: $2'"
}

check_body_contains() {
    [ "$response_ok" = yes ] || return 0
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

check "a wrong method is refused" 405 '.error.code == "METHOD_NOT_ALLOWED"' \
    --request GET "$calculate"
check_header 'Allow' 'POST'

if [ "$failures" -ne 0 ]; then
    echo "$failures check(s) failed against $base_url" >&2
    exit 1
fi

echo "all checks passed against $base_url"
