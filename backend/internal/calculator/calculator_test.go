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

func TestPower(t *testing.T) {
	tests := []struct {
		name string
		a, b float64
		want float64
	}{
		{name: "positive exponent", a: 2, b: 10, want: 1024},
		{name: "negative base with an integer exponent", a: -2, b: 3, want: -8},
		{name: "negative exponent", a: 2, b: -2, want: 0.25},
		{name: "fractional exponent is a root", a: 9, b: 0.5, want: 3},
		{name: "zero exponent", a: 7, b: 0, want: 1},
		// IEEE 754 defines 0**0 as 1, which is also what a desktop calculator shows.
		{name: "zero to the zero", a: 0, b: 0, want: 1},
		{name: "identity", a: 7, b: 1, want: 7},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := calculator.Power(test.a, test.b); got != test.want {
				t.Errorf("Power(%v, %v) = %v, want %v", test.a, test.b, got, test.want)
			}
		})
	}
}

func TestSqrt(t *testing.T) {
	tests := []struct {
		name    string
		a       float64
		want    float64
		wantErr error
	}{
		{name: "perfect square", a: 9, want: 3},
		{name: "irrational result", a: 2, want: math.Sqrt2},
		{name: "fraction", a: 0.25, want: 0.5},
		{name: "zero", a: 0, want: 0},
		// sqrt(MaxFloat64), about 1.34e154: the largest finite result Sqrt
		// can return, since squaring anything larger leaves float64.
		{name: "largest float64", a: math.MaxFloat64, want: 1.3407807929942596e+154},
		{name: "negative operand", a: -9, wantErr: calculator.ErrNegativeSqrt},
		{name: "negative fraction", a: -0.25, wantErr: calculator.ErrNegativeSqrt},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := calculator.Sqrt(test.a)

			if !errors.Is(err, test.wantErr) {
				t.Fatalf("Sqrt(%v) error = %v, want %v", test.a, err, test.wantErr)
			}
			if test.wantErr == nil && got != test.want {
				t.Errorf("Sqrt(%v) = %v, want %v", test.a, got, test.want)
			}
		})
	}
}

// Negative zero is not a negative number, and IEEE 754 defines its square root
// as itself, so it is answered rather than rejected. A plain comparison cannot
// tell -0 from 0, hence the sign check.
func TestSqrtOfNegativeZero(t *testing.T) {
	negativeZero := math.Copysign(0, -1)

	got, err := calculator.Sqrt(negativeZero)

	if err != nil {
		t.Fatalf("Sqrt(-0) returned unexpected error: %v", err)
	}
	if got != 0 || !math.Signbit(got) {
		t.Errorf("Sqrt(-0) = %v, want -0", got)
	}
}

func TestPercent(t *testing.T) {
	tests := []struct {
		name string
		a, b float64
		want float64
	}{
		{name: "percentage of a whole", a: 15, b: 200, want: 30},
		{name: "the whole itself", a: 100, b: 42, want: 42},
		{name: "more than the whole", a: 250, b: 40, want: 100},
		{name: "negative percentage", a: -10, b: 200, want: -20},
		{name: "nothing of something", a: 0, b: 200, want: 0},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := calculator.Percent(test.a, test.b); got != test.want {
				t.Errorf("Percent(%v, %v) = %v, want %v", test.a, test.b, got, test.want)
			}
		})
	}
}

// The percentage is taken before the multiplication, not after: a * b would
// overflow here, while 2% of 1e308 is perfectly representable.
func TestPercentDividesBeforeMultiplying(t *testing.T) {
	if got := calculator.Percent(2, 1e308); got != 2e306 {
		t.Errorf("Percent(2, 1e308) = %v, want %v", got, 2e306)
	}
}

// Pure functions do not guard against non-finite results: that check belongs
// to Evaluate (see docs/DESIGN.md D5).
func TestMultiplyDoesNotGuardAgainstOverflow(t *testing.T) {
	if got := calculator.Multiply(1e308, 10); !math.IsInf(got, 1) {
		t.Errorf("Multiply(1e308, 10) = %v, want +Inf", got)
	}
}

// Power is the first operation that can produce NaN, and it does not guard
// against that either: both non-finite outcomes belong to Evaluate.
func TestPowerDoesNotGuardAgainstNonFiniteResults(t *testing.T) {
	if got := calculator.Power(0, -1); !math.IsInf(got, 1) {
		t.Errorf("Power(0, -1) = %v, want +Inf", got)
	}
	if got := calculator.Power(-8, 1.0/3); !math.IsNaN(got) {
		t.Errorf("Power(-8, 1.0/3) = %v, want NaN", got)
	}
}
