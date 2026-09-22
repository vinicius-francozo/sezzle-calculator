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
