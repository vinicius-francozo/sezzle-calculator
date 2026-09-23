package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

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

	for _, code := range errorCodes {
		if !pinned[code] {
			t.Errorf("code %q has no row in this table: every code must be transcribed from the contract", code)
		}
	}
}
