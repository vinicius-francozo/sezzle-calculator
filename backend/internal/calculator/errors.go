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
	// ErrNegativeSqrt is returned for the square root of a negative number,
	// which has no real result. The sentinel names its one operation on
	// purpose: the transport answers it with a message about square roots, so
	// another operation with no result for its operands — log, asin, acos —
	// must define a sentinel of its own rather than reuse this one. Until it
	// has a case in describeError, an unmapped sentinel is caught by the
	// catch-all there; a shared one would silently borrow this message.
	ErrNegativeSqrt = errors.New("square root of a negative number is undefined")
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
	return fmt.Sprintf("operation %q requires %s, got %d", e.Operation, e.Requirement(), e.Got)
}

// Requirement describes the arity in words that agree in number, so that a
// unary operation reads "requires 1 operand" and not "requires 1 operands".
// The transport builds its own sentence around the same phrase, which is why
// it lives with the count instead of being spelled out in both layers.
func (e *OperandCountError) Requirement() string {
	if e.Want == 1 {
		return "1 operand"
	}
	return fmt.Sprintf("%d operands", e.Want)
}

func (e *OperandCountError) Unwrap() error { return ErrInvalidOperandCount }
