package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/vinicius-francozo/sezzle-calculator/backend/internal/calculator"
)

// Machine-readable error codes of the API contract (see docs/api.md). They are
// stable: clients branch on the code, never on the message.
const (
	codeInvalidJSON          = "INVALID_JSON"
	codeValidationError      = "VALIDATION_ERROR"
	codeUnsupportedOperation = "UNSUPPORTED_OPERATION"
	codeDivisionByZero       = "DIVISION_BY_ZERO"
	codeUndefinedResult      = "UNDEFINED_RESULT"
	codeOverflow             = "OVERFLOW"
	codeNotFound             = "NOT_FOUND"
	codeMethodNotAllowed     = "METHOD_NOT_ALLOWED"
	codeInternalError        = "INTERNAL_ERROR"
)

// errorEnvelope is the body of every non-2xx response.
type errorEnvelope struct {
	Error errorBody `json:"error"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// apiError is an error that already knows how it must be reported to the
// client: an HTTP status, a stable code and a message safe to display as-is.
type apiError struct {
	status  int
	code    string
	message string
}

func (e *apiError) Error() string { return e.message }

// newAPIError is a shorthand for the error values built by the transport layer.
func newAPIError(status int, code, message string) *apiError {
	return &apiError{status: status, code: code, message: message}
}

// describeError is the single translation point between errors and HTTP. Every
// error leaving a handler goes through it, and any error it does not recognise
// becomes a 500 with no internal detail leaked to the client.
func describeError(err error) *apiError {
	var (
		apiErr      *apiError
		unsupported *calculator.UnsupportedOperationError
		count       *calculator.OperandCountError
	)

	switch {
	case errors.As(err, &apiErr):
		return apiErr
	case errors.As(err, &unsupported):
		return newAPIError(http.StatusBadRequest, codeUnsupportedOperation,
			fmt.Sprintf("Unsupported operation %q", unsupported.Operation))
	case errors.As(err, &count):
		return newAPIError(http.StatusBadRequest, codeValidationError,
			fmt.Sprintf("Operation %q requires %d operands, got %d", count.Operation, count.Want, count.Got))
	case errors.Is(err, calculator.ErrDivisionByZero):
		return newAPIError(http.StatusBadRequest, codeDivisionByZero, "Division by zero is undefined")
	case errors.Is(err, calculator.ErrUndefinedResult):
		// The sentinel is general, but sqrt of a negative number is its only
		// producer, so the message names it instead of staying vague.
		return newAPIError(http.StatusBadRequest, codeUndefinedResult,
			"Square root of a negative number is undefined")
	case errors.Is(err, calculator.ErrOverflow):
		return newAPIError(http.StatusBadRequest, codeOverflow, "Overflow: the result could not be calculated")
	default:
		// Catch-all for the genuinely unexpected only. Every new domain error
		// must get a case above: the contract reports domain failures as 400,
		// and falling through to here would turn one into the generic 500
		// that CLAUDE.md §2.3 forbids — silently, since it still compiles.
		return errInternal()
	}
}

func errInternal() *apiError {
	return newAPIError(http.StatusInternalServerError, codeInternalError, "Unexpected internal error")
}

// writeError renders err as the contract's error envelope.
func writeError(w http.ResponseWriter, err *apiError) {
	writeJSON(w, err.status, errorEnvelope{Error: errorBody{Code: err.code, Message: err.message}})
}

// writeJSON writes v as the JSON body of the response.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// The response types are plain structs, so encoding cannot fail for
	// reasons other than a broken connection, which is not actionable here.
	_ = json.NewEncoder(w).Encode(v)
}
