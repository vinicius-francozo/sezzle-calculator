package calculator

import (
	"errors"
	"fmt"
)

var (
	ErrDivisionByZero = errors.New("division by zero")

	ErrNegativeSqrt = errors.New("square root of a negative number is undefined")

	ErrUnsupportedOperation = errors.New("unsupported operation")

	ErrInvalidOperandCount = errors.New("invalid operand count")

	ErrOverflow = errors.New("result is not a finite number")
)

type UnsupportedOperationError struct {
	Operation Operation
}

func (e *UnsupportedOperationError) Error() string {
	return fmt.Sprintf("unsupported operation %q", e.Operation)
}

func (e *UnsupportedOperationError) Unwrap() error { return ErrUnsupportedOperation }

type OperandCountError struct {
	Operation Operation
	Want      int
	Got       int
}

func (e *OperandCountError) Error() string {
	return fmt.Sprintf("operation %q requires %s, got %d", e.Operation, e.Requirement(), e.Got)
}

func (e *OperandCountError) Requirement() string {
	if e.Want == 1 {
		return "1 operand"
	}
	return fmt.Sprintf("%d operands", e.Want)
}

func (e *OperandCountError) Unwrap() error { return ErrInvalidOperandCount }
