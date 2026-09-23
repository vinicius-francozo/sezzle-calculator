package calculator

import "math"

type operation struct {
	arity int
	apply func(operands []float64) (float64, error)
}

var registry = map[Operation]operation{
	OpAdd:      {arity: 2, apply: func(o []float64) (float64, error) { return Add(o[0], o[1]), nil }},
	OpSubtract: {arity: 2, apply: func(o []float64) (float64, error) { return Subtract(o[0], o[1]), nil }},
	OpMultiply: {arity: 2, apply: func(o []float64) (float64, error) { return Multiply(o[0], o[1]), nil }},
	OpDivide:   {arity: 2, apply: func(o []float64) (float64, error) { return Divide(o[0], o[1]) }},
	OpPower:    {arity: 2, apply: func(o []float64) (float64, error) { return Power(o[0], o[1]), nil }},
	OpSqrt:     {arity: 1, apply: func(o []float64) (float64, error) { return Sqrt(o[0]) }},
	OpPercent:  {arity: 2, apply: func(o []float64) (float64, error) { return Percent(o[0], o[1]), nil }},
}

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

	if math.IsInf(result, 0) || math.IsNaN(result) {
		return 0, ErrOverflow
	}
	return result, nil
}
