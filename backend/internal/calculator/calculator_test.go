package calculator_test

import (
	"errors"
	"math"
	"testing"

	"github.com/vinicius-francozo/sezzle-calculator/backend/internal/calculator"
)

func TestAdd(t *testing.T) {
	tests := []struct {
		name string
		a, b float64
		want float64
	}{
		{name: "positive operands", a: 2, b: 3, want: 5},
		{name: "negative operand", a: 2, b: -3, want: -1},
		// Binary floating point noise is a property of float64, hidden by the
		// frontend formatting rather than by the domain (see docs/DESIGN.md D6).
		{name: "decimals", a: 0.1, b: 0.2, want: 0.30000000000000004},
		{name: "identity", a: 7, b: 0, want: 7},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := calculator.Add(test.a, test.b); got != test.want {
				t.Errorf("Add(%v, %v) = %v, want %v", test.a, test.b, got, test.want)
			}
		})
	}
}

func TestSubtract(t *testing.T) {
	tests := []struct {
		name string
		a, b float64
		want float64
	}{
		{name: "positive result", a: 5, b: 3, want: 2},
		{name: "negative result", a: 3, b: 5, want: -2},
		{name: "double negative", a: -3, b: -5, want: 2},
		{name: "identity", a: 7, b: 0, want: 7},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := calculator.Subtract(test.a, test.b); got != test.want {
				t.Errorf("Subtract(%v, %v) = %v, want %v", test.a, test.b, got, test.want)
			}
		})
	}
}

func TestMultiply(t *testing.T) {
	tests := []struct {
		name string
		a, b float64
		want float64
	}{
		{name: "positive operands", a: 4, b: 2.5, want: 10},
		{name: "sign flip", a: -4, b: 2, want: -8},
		{name: "absorbing zero", a: 1234, b: 0, want: 0},
		{name: "identity", a: 7, b: 1, want: 7},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := calculator.Multiply(test.a, test.b); got != test.want {
				t.Errorf("Multiply(%v, %v) = %v, want %v", test.a, test.b, got, test.want)
			}
		})
	}
}

func TestDivide(t *testing.T) {
	tests := []struct {
		name    string
		a, b    float64
		want    float64
		wantErr error
	}{
		{name: "exact division", a: 12, b: 4, want: 3},
		{name: "fractional result", a: 1, b: 8, want: 0.125},
		{name: "negative divisor", a: 9, b: -3, want: -3},
		{name: "zero divisor", a: 12, b: 0, wantErr: calculator.ErrDivisionByZero},
		{name: "zero numerator and divisor", a: 0, b: 0, wantErr: calculator.ErrDivisionByZero},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := calculator.Divide(test.a, test.b)

			if !errors.Is(err, test.wantErr) {
				t.Fatalf("Divide(%v, %v) error = %v, want %v", test.a, test.b, err, test.wantErr)
			}
			if test.wantErr == nil && got != test.want {
				t.Errorf("Divide(%v, %v) = %v, want %v", test.a, test.b, got, test.want)
			}
		})
	}
}

// Pure functions do not guard against non-finite results: that check belongs
// to Evaluate (see docs/DESIGN.md D5).
func TestMultiplyDoesNotGuardAgainstOverflow(t *testing.T) {
	if got := calculator.Multiply(1e308, 10); !math.IsInf(got, 1) {
		t.Errorf("Multiply(1e308, 10) = %v, want +Inf", got)
	}
}
