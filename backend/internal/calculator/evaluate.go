package calculator

import "math"

// operation is a registry entry: the arity of an operation and an adapter that
// applies the corresponding pure function to a slice of operands.
type operation struct {
	arity int
	apply func(operands []float64) (float64, error)
}

// registry is the single point of extension of the domain: an operation exists
// for the service if, and only if, it has an entry here.
//
// An entry whose pure function can fail with a new kind of domain error also
// needs a case in the transport's describeError; without one the failure is
// reported as a 500 instead of the 400 the contract defines for it.
var registry = map[Operation]operation{
	OpAdd:      {arity: 2, apply: func(o []float64) (float64, error) { return Add(o[0], o[1]), nil }},
	OpSubtract: {arity: 2, apply: func(o []float64) (float64, error) { return Subtract(o[0], o[1]), nil }},
	OpMultiply: {arity: 2, apply: func(o []float64) (float64, error) { return Multiply(o[0], o[1]), nil }},
	OpDivide:   {arity: 2, apply: func(o []float64) (float64, error) { return Divide(o[0], o[1]) }},
}

// Evaluate resolves op in the registry, validates the operand count against its
// arity and delegates to the pure function behind it.
//
// The finiteness of the result is checked here, once, for every operation: the
// pure functions stay free of a guard that is identical in all of them.
func Evaluate(op Operation, operands []float64) (float64, error) {
	entry, ok := registry[op]
	if !ok {
		return 0, &UnsupportedOperationError{Operation: op}
	}
	if len(operands) != entry.arity {
		return 0, &OperandCountError{Operation: op, Want: entry.arity, Got: len(operands)}
	}

	result, err := entry.apply(operands)
	if err != nil {
		return 0, err
	}
	// The NaN half of this guard cannot fire today: with finite operands none
	// of the four operations produces NaN, because the only input that would,
	// 0/0, is already rejected as ErrDivisionByZero. It is kept for the
	// operations a future registry entry may add, such as Sqrt.
	if math.IsInf(result, 0) || math.IsNaN(result) {
		return 0, ErrOverflow
	}
	return result, nil
}
