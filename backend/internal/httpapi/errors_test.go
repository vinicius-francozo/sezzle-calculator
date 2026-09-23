package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

// An error nobody mapped must still leave the service through the contract's
// envelope, without leaking what went wrong internally.
func TestDescribeErrorFallsBackToInternalError(t *testing.T) {
	got := describeError(errors.New("the database caught fire"))

	if got.status != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", got.status, http.StatusInternalServerError)
	}
	if got.code != codeInternalError {
		t.Errorf("code = %q, want %q", got.code, codeInternalError)
	}
	if strings.Contains(got.message, "database") {
		t.Errorf("message %q leaks the original error", got.message)
	}
}

// Transport errors already carry their own status, code and message, and
// survive being wrapped on the way out.
func TestDescribeErrorKeepsTransportErrors(t *testing.T) {
	want := newAPIError(http.StatusBadRequest, codeInvalidJSON, "Request body is not valid JSON")

	got := describeError(fmt.Errorf("decoding the body: %w", want))

	if got != want {
		t.Errorf("got %+v, want %+v", got, want)
	}
	if want.Error() != want.message {
		t.Errorf("Error() = %q, want %q", want.Error(), want.message)
	}
}

// The codes are the frozen half of the contract: the frontend branches on
// them, so a typo in one is a broken client rather than a reworded message.
// Everywhere else in the suite a response is compared against the constant
// itself, which pins the mapping but not the spelling; this is the one place
// that transcribes the literal strings of the contract, so that changing what
// a constant holds has to be a deliberate edit here as well.
func TestErrorCodesMatchTheContract(t *testing.T) {
	tests := []struct {
		got  string
		want string
	}{
		{codeInvalidJSON, "INVALID_JSON"},
		{codeValidationError, "VALIDATION_ERROR"},
		{codeUnsupportedOperation, "UNSUPPORTED_OPERATION"},
		{codeDivisionByZero, "DIVISION_BY_ZERO"},
		{codeUndefinedResult, "UNDEFINED_RESULT"},
		{codeOverflow, "OVERFLOW"},
		{codeNotFound, "NOT_FOUND"},
		{codeMethodNotAllowed, "METHOD_NOT_ALLOWED"},
		{codeInternalError, "INTERNAL_ERROR"},
	}

	pinned := make(map[string]bool, len(tests))
	for _, test := range tests {
		pinned[test.got] = true
		t.Run(test.want, func(t *testing.T) {
			if test.got != test.want {
				t.Errorf("code = %q, want %q", test.got, test.want)
			}
		})
	}

	// The rows pin the spelling of the codes they name, and nothing else: a
	// code added to the contract later would simply have no row. Walking
	// errorCodes, the declared set, closes that — every code has to be
	// transcribed here before the suite is green again.
	for _, code := range errorCodes {
		if !pinned[code] {
			t.Errorf("code %q has no row in this table: every code must be transcribed from the contract", code)
		}
	}
}
