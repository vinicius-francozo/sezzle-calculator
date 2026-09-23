package calculator

import "math"

type Operation string

const (
	OpAdd      Operation = "add"
	OpSubtract Operation = "subtract"
	OpMultiply Operation = "multiply"
	OpDivide   Operation = "divide"
	OpPower    Operation = "power"
	OpSqrt     Operation = "sqrt"
	OpPercent  Operation = "percent"
)

func Add(a, b float64) float64 { return a + b }

func Subtract(a, b float64) float64 { return a - b }

func Multiply(a, b float64) float64 { return a * b }

func Divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, ErrDivisionByZero
	}
	return a / b, nil
}

func Power(a, b float64) float64 { return math.Pow(a, b) }

func Sqrt(a float64) (float64, error) {
	if a < 0 {
		return 0, ErrNegativeSqrt
	}
	return math.Sqrt(a), nil
}

func Percent(a, b float64) float64 { return a / 100 * b }
