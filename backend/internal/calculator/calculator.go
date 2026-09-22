// Package calculator holds the arithmetic domain of the service.
//
// It knows nothing about HTTP, JSON or logging: every operation is a plain
// function over float64 values, and every failure is an error value that
// callers compare with errors.Is or errors.As.
package calculator

// Operation identifies an arithmetic operation. Its values are exactly the
// strings accepted by the API contract (see docs/api.md).
type Operation string

// The operations supported by the service.
const (
	OpAdd      Operation = "add"
	OpSubtract Operation = "subtract"
	OpMultiply Operation = "multiply"
	OpDivide   Operation = "divide"
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
