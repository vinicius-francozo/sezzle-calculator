package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/vinicius-francozo/sezzle-calculator/backend/internal/calculator"
)

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

var errorCodes = []string{
	codeInvalidJSON,
	codeValidationError,
	codeUnsupportedOperation,
	codeDivisionByZero,
	codeUndefinedResult,
	codeOverflow,
	codeNotFound,
	codeMethodNotAllowed,
	codeInternalError,
}

type errorEnvelope struct {
	Error errorBody `json:"error"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type apiError struct {
	status  int
	code    string
	message string
}

func (e *apiError) Error() string { return e.message }

func newAPIError(status int, code, message string) *apiError {
	return &apiError{status: status, code: code, message: message}
}

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
			fmt.Sprintf("Operation %q requires %s, got %d", count.Operation, count.Requirement(), count.Got))
	case errors.Is(err, calculator.ErrDivisionByZero):
		return newAPIError(http.StatusBadRequest, codeDivisionByZero, "Division by zero is undefined")
	case errors.Is(err, calculator.ErrNegativeSqrt):

		return newAPIError(http.StatusBadRequest, codeUndefinedResult,
			"Square root of a negative number is undefined")
	case errors.Is(err, calculator.ErrOverflow):
		return newAPIError(http.StatusBadRequest, codeOverflow, "Overflow: the result could not be calculated")
	default:

		return errInternal()
	}
}

func errInternal() *apiError {
	return newAPIError(http.StatusInternalServerError, codeInternalError, "Unexpected internal error")
}

func writeError(w http.ResponseWriter, err *apiError) {
	writeJSON(w, err.status, errorEnvelope{Error: errorBody{Code: err.code, Message: err.message}})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(v)
}
