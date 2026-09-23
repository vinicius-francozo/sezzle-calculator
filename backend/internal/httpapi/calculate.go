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

const maxRequestBodyBytes = 4 << 10

type calculateRequest struct {
	Operation calculator.Operation `json:"operation"`
	Operands  []float64            `json:"operands"`
}

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

func decodeCalculateRequest(w http.ResponseWriter, r *http.Request) (calculateRequest, error) {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBodyBytes))
	decoder.DisallowUnknownFields()

	var req calculateRequest
	if err := decoder.Decode(&req); err != nil {
		return req, decodeError(err)
	}

	if err := decoder.Decode(new(json.RawMessage)); !errors.Is(err, io.EOF) {
		var maxBytes *http.MaxBytesError
		if errors.As(err, &maxBytes) {
			return req, decodeError(err)
		}
		return req, newAPIError(http.StatusBadRequest, codeInvalidJSON, "Request body must contain a single JSON object")
	}
	return req, validateCalculateRequest(req)
}

func validateCalculateRequest(req calculateRequest) error {
	if req.Operation == "" {
		return newAPIError(http.StatusBadRequest, codeValidationError, `Field "operation" is required`)
	}
	if req.Operands == nil {
		return newAPIError(http.StatusBadRequest, codeValidationError, `Field "operands" is required`)
	}

	for i, operand := range req.Operands {
		if math.IsInf(operand, 0) || math.IsNaN(operand) {
			return newAPIError(http.StatusBadRequest, codeValidationError,
				fmt.Sprintf("Operand %d is not a finite number", i+1))
		}
	}
	return nil
}

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

		return newAPIError(http.StatusBadRequest, codeInvalidJSON,
			"Request body must be a JSON object")
	default:

		return newAPIError(http.StatusBadRequest, codeInvalidJSON, "Request body is not valid JSON")
	}
}
