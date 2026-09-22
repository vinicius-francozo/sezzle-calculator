package calculator

import (
	"errors"
	"fmt"
)

// Sentinel errors returned by the domain. Callers identify a failure with
// errors.Is, never by comparing error strings.
var (
	// ErrDivisionByZero is returned when a division has a zero divisor.
	ErrDivisionByZero = errors.New("division by zero")
	// ErrUndefinedResult is returned when an operation has no result for the
	// operands it was given, such as the square root of a negative number.
	ErrUndefinedResult = errors.New("undefined result")
	// ErrUnsupportedOperation is returned for an operation the registry does not know.
	ErrUnsupportedOperation = errors.New("unsupported operation")
	// ErrInvalidOperandCount is returned when the operand count does not match the arity.
	ErrInvalidOperandCount = errors.New("invalid operand count")
	// ErrOverflow is returned when a result is not a finite number.
	ErrOverflow = errors.New("result is not a finite number")
)

// UnsupportedOperationError reports the operation that was asked for. It
// unwraps to ErrUnsupportedOperation, so errors.Is still matches.
type UnsupportedOperationError struct {
	Operation Operation
}

func (e *UnsupportedOperationError) Error() string {
	return fmt.Sprintf("unsupported operation %q", e.Operation)
}

func (e *UnsupportedOperationError) Unwrap() error { return ErrUnsupportedOperation }

// OperandCountError reports how many operands an operation needs and how many
// it received. It unwraps to ErrInvalidOperandCount.
type OperandCountError struct {
	Operation Operation
	Want      int
	Got       int
}

func (e *OperandCountError) Error() string {
	return fmt.Sprintf("operation %q requires %d operands, got %d", e.Operation, e.Want, e.Got)
}

func (e *OperandCountError) Unwrap() error { return ErrInvalidOperandCount }
