package httpapi

import (
	"errors"
	"math"
	"testing"

	"github.com/vinicius-francozo/sezzle-calculator/backend/internal/calculator"
)

// Non-finite operands cannot be written as JSON literals, so the guard is
// exercised directly on the validation function.
func TestValidateCalculateRequest(t *testing.T) {
	tests := []struct {
		name     string
		request  calculateRequest
		wantCode string
	}{
		{
			name:    "valid request",
			request: calculateRequest{Operation: calculator.OpAdd, Operands: []float64{1, 2}},
		},
		{
			name:     "missing operation",
			request:  calculateRequest{Operands: []float64{1, 2}},
			wantCode: codeValidationError,
		},
		{
			name:     "missing operands",
			request:  calculateRequest{Operation: calculator.OpAdd},
			wantCode: codeValidationError,
		},
		{
			name:     "infinite operand",
			request:  calculateRequest{Operation: calculator.OpAdd, Operands: []float64{math.Inf(1), 2}},
			wantCode: codeValidationError,
		},
		{
			name:     "NaN operand",
			request:  calculateRequest{Operation: calculator.OpAdd, Operands: []float64{1, math.NaN()}},
			wantCode: codeValidationError,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateCalculateRequest(test.request)

			if test.wantCode == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}

			var apiErr *apiError
			if !errors.As(err, &apiErr) {
				t.Fatalf("error = %v, want an *apiError", err)
			}
			if apiErr.code != test.wantCode {
				t.Errorf("code = %q, want %q", apiErr.code, test.wantCode)
			}
		})
	}
}
