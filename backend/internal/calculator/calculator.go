// Package calculator holds the arithmetic domain of the service.
//
// It knows nothing about HTTP, JSON or logging: every operation is a plain
// function over float64 values, and every failure is an error value that
// callers compare with errors.Is or errors.As.
package calculator

import "math"

// Operation identifies an arithmetic operation. Its values are exactly the
// strings accepted by the API contract (see docs/api.md).
type Operation string

// The operations supported by the service.
const (
	OpAdd      Operation = "add"
	OpSubtract Operation = "subtract"
	OpMultiply Operation = "multiply"
	OpDivide   Operation = "divide"
	OpPower    Operation = "power"
	OpSqrt     Operation = "sqrt"
	OpPercent  Operation = "percent"
)

// Add returns a + b.
func Add(a, b float64) float64 { return a + b }

// Subtract returns a - b.
func Subtract(a, b float64) float64 { return a - b }

// Multiply returns a * b.
func Multiply(a, b float64) float64 { return a * b }

// Divide returns a / b, or ErrDivisionByZero when b is zero.
//
// Division is the only binary operation with a rule of its own, so it is the
// only one that returns an error. Results that merely overflow the float64
// range are rejected once, by Evaluate.
func Divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, ErrDivisionByZero
	}
	return a / b, nil
}

// Power returns a raised to the power of b.
//
// Exponentiation has no rule of its own to enforce. The cases with no real
// answer — zero raised to a negative power, or a negative base raised to a
// fractional exponent — surface as ±Inf or NaN, and those are rejected once by
// Evaluate rather than by every operation that can produce them.
func Power(a, b float64) float64 { return math.Pow(a, b) }

// Sqrt returns the square root of a, or ErrNegativeSqrt when a is negative.
//
// Negativity is a rule the square root owns, so it is checked here, the way
// Divide owns its zero divisor. Negative zero is not negative, and IEEE 754
// defines its square root as itself, so it is answered rather than rejected.
func Sqrt(a float64) (float64, error) {
	if a < 0 {
		return 0, ErrNegativeSqrt
	}
	return math.Sqrt(a), nil
}

// Percent returns a percent of b, that is a / 100 * b.
//
// The order of the operations is the one the contract writes, and it is not
// interchangeable: a * b overflows for operands whose percentage is perfectly
// representable, such as 2% of 1e308.
func Percent(a, b float64) float64 { return a / 100 * b }
