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

# The check that is still open, and what it has broken so far. A check opens
# when its request is made and closes when the next one starts or the summary
# is reached, which is what lets the follow-up assertions below belong to it.
open_check=
broken=

# Records one broken expectation against the open check. Nothing is printed
# here: the verdict belongs to close_check, so that a check whose follow-up
# assertion fails cannot first announce itself as ok.
fail() {
    broken="$broken      - $1
"
}

# Prints the open check's one and only verdict. A CI log that says just "exit 1"
# cannot be read from a browser tab a week later, so a failure carries every
# expectation it broke and the whole response -- status line, headers and body,
# once for the check rather than once per broken expectation.
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

# check DESCRIPTION EXPECTED_STATUS JQ_PREDICATE [curl arguments...]
#
# The predicate is a jq boolean over the response body; an empty one skips the
# body check, for responses that are not JSON. jq keeps its stderr: it is silent
# about a predicate that is merely false, so anything it does say is a fault in
# the predicate itself, and swallowing it would blame the application for a
# broken assertion.
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

# The two assertions below read the response of the open check, which is why
# they follow it immediately -- and why they stay quiet once it has broken, when
# the response they would read is already known to be the wrong one.
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

# The one row of docs/api.md the proxy could plausibly swallow: an unknown path
# under /api/ must reach the backend and come back as the error envelope, not as
# the SPA that nginx falls back to everywhere else.
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
