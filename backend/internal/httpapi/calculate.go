package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"

	"github.com/vinicius-francozo/sezzle-calculator/backend/internal/calculator"
)

// maxRequestBodyBytes caps the request body. A calculation is a few dozen
// bytes, so anything larger is either a mistake or an attack.
const maxRequestBodyBytes = 4 << 10

// calculateRequest is the body of POST /api/v1/calculate.
type calculateRequest struct {
	Operation calculator.Operation `json:"operation"`
	Operands  []float64            `json:"operands"`
}

// calculateResponse echoes the request back beside the result, so a response
// is self-describing in logs and in the client's history.
type calculateResponse struct {
	Operation calculator.Operation `json:"operation"`
	Operands  []float64            `json:"operands"`
	Result    float64              `json:"result"`
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	req, err := decodeCalculateRequest(w, r)
	if err != nil {
		writeError(w, describeError(err))
		return
	}

	result, err := calculator.Evaluate(req.Operation, req.Operands)
	if err != nil {
		writeError(w, describeError(err))
		return
	}

	writeJSON(w, http.StatusOK, calculateResponse{
		Operation: req.Operation,
		Operands:  req.Operands,
		Result:    result,
	})
}

// decodeCalculateRequest reads the body under a size limit, decodes it
// strictly and validates it.
func decodeCalculateRequest(w http.ResponseWriter, r *http.Request) (calculateRequest, error) {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBodyBytes))
	decoder.DisallowUnknownFields()

	var req calculateRequest
	if err := decoder.Decode(&req); err != nil {
		return req, decodeError(err)
	}
	// A body must hold exactly one JSON object. What follows the object can
	// itself trip the size limit, and that has to keep being reported as a
	// size limit rather than as trailing content.
	if err := decoder.Decode(new(json.RawMessage)); !errors.Is(err, io.EOF) {
		var maxBytes *http.MaxBytesError
		if errors.As(err, &maxBytes) {
			return req, decodeError(err)
		}
		return req, newAPIError(http.StatusBadRequest, codeInvalidJSON, "Request body must contain a single JSON object")
	}
	return req, validateCalculateRequest(req)
}

// validateCalculateRequest checks what the domain cannot: that the fields are
// present and that the operands are finite numbers. Whether the operation
// exists, and whether the operand count matches its arity, belongs to the
// domain and is left to it.
func validateCalculateRequest(req calculateRequest) error {
	if req.Operation == "" {
		return newAPIError(http.StatusBadRequest, codeValidationError, `Field "operation" is required`)
	}
	if req.Operands == nil {
		return newAPIError(http.StatusBadRequest, codeValidationError, `Field "operands" is required`)
	}
	// Defence in depth for a future non-HTTP caller: over HTTP this loop
	// cannot fire, because JSON has no Inf or NaN literal and a number too
	// large for a float64, such as 1e999, is already rejected by the decoder.
	for i, operand := range req.Operands {
		if math.IsInf(operand, 0) || math.IsNaN(operand) {
			return newAPIError(http.StatusBadRequest, codeValidationError,
				fmt.Sprintf("Operand %d is not a finite number", i+1))
		}
	}
	return nil
}

// decodeError turns a JSON decoding failure into a client-facing error. Only
// the kind of failure is reported: decoder messages are implementation detail.
func decodeError(err error) *apiError {
	var (
		maxBytes  *http.MaxBytesError
		typeError *json.UnmarshalTypeError
	)

	switch {
	case errors.As(err, &maxBytes):
		return newAPIError(http.StatusBadRequest, codeInvalidJSON,
			fmt.Sprintf("Request body must not exceed %d bytes", maxRequestBodyBytes))
	case errors.As(err, &typeError) && typeError.Field != "":
		return newAPIError(http.StatusBadRequest, codeValidationError,
			fmt.Sprintf("Field %q has the wrong type", typeError.Field))
	case errors.As(err, &typeError):
		// An empty Field means the mismatch is the top-level value itself:
		// the body is valid JSON, it is just not an object.
		return newAPIError(http.StatusBadRequest, codeInvalidJSON,
			"Request body must be a JSON object")
	default:
		// Syntax errors, an empty body and unknown fields: under strict
		// decoding none of them is a body this endpoint can read.
		return newAPIError(http.StatusBadRequest, codeInvalidJSON, "Request body is not valid JSON")
	}
}
