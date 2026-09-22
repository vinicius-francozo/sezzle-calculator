package calculator_test

import (
	"errors"
	"testing"

	"github.com/vinicius-francozo/sezzle-calculator/backend/internal/calculator"
)

func TestEvaluate(t *testing.T) {
	tests := []struct {
		name     string
		op       calculator.Operation
		operands []float64
		want     float64
	}{
		{name: "add", op: calculator.OpAdd, operands: []float64{2, 3}, want: 5},
		{name: "subtract", op: calculator.OpSubtract, operands: []float64{5, 3}, want: 2},
		{name: "multiply", op: calculator.OpMultiply, operands: []float64{4, 2.5}, want: 10},
		{name: "divide", op: calculator.OpDivide, operands: []float64{12, 4}, want: 3},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := calculator.Evaluate(test.op, test.operands)

			if err != nil {
				t.Fatalf("Evaluate(%q, %v) returned unexpected error: %v", test.op, test.operands, err)
			}
			if got != test.want {
				t.Errorf("Evaluate(%q, %v) = %v, want %v", test.op, test.operands, got, test.want)
			}
		})
	}
}

func TestEvaluateErrors(t *testing.T) {
	tests := []struct {
		name     string
		op       calculator.Operation
		operands []float64
		wantErr  error
	}{
		{name: "unknown operation", op: "tangent", operands: []float64{1}, wantErr: calculator.ErrUnsupportedOperation},
		{name: "empty operation", op: "", operands: []float64{1, 2}, wantErr: calculator.ErrUnsupportedOperation},
		{name: "too few operands", op: calculator.OpAdd, operands: []float64{1}, wantErr: calculator.ErrInvalidOperandCount},
		{name: "too many operands", op: calculator.OpAdd, operands: []float64{1, 2, 3}, wantErr: calculator.ErrInvalidOperandCount},
		{name: "no operands", op: calculator.OpDivide, operands: nil, wantErr: calculator.ErrInvalidOperandCount},
		{name: "division by zero", op: calculator.OpDivide, operands: []float64{12, 0}, wantErr: calculator.ErrDivisionByZero},
		{name: "overflow to infinity", op: calculator.OpMultiply, operands: []float64{1e308, 10}, wantErr: calculator.ErrOverflow},
		{name: "overflow by addition", op: calculator.OpAdd, operands: []float64{1.7e308, 1.7e308}, wantErr: calculator.ErrOverflow},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := calculator.Evaluate(test.op, test.operands)

			if !errors.Is(err, test.wantErr) {
				t.Fatalf("Evaluate(%q, %v) error = %v, want %v", test.op, test.operands, err, test.wantErr)
			}
			if got != 0 {
				t.Errorf("Evaluate(%q, %v) = %v, want the zero value on failure", test.op, test.operands, got)
			}
		})
	}
}

// The typed errors carry the detail the HTTP layer needs to build its message.
func TestEvaluateErrorDetails(t *testing.T) {
	t.Run("unsupported operation", func(t *testing.T) {
		_, err := calculator.Evaluate("tangent", []float64{1})

		var unsupported *calculator.UnsupportedOperationError
		if !errors.As(err, &unsupported) {
			t.Fatalf("error = %v, want an *UnsupportedOperationError", err)
		}
		if unsupported.Operation != "tangent" {
			t.Errorf("Operation = %q, want %q", unsupported.Operation, "tangent")
		}
		if want := `unsupported operation "tangent"`; unsupported.Error() != want {
			t.Errorf("Error() = %q, want %q", unsupported.Error(), want)
		}
	})

	t.Run("operand count", func(t *testing.T) {
		_, err := calculator.Evaluate(calculator.OpAdd, []float64{1})

		var count *calculator.OperandCountError
		if !errors.As(err, &count) {
			t.Fatalf("error = %v, want an *OperandCountError", err)
		}
		if count.Operation != calculator.OpAdd || count.Want != 2 || count.Got != 1 {
			t.Errorf("got %+v, want {Operation:add Want:2 Got:1}", *count)
		}
		if want := `operation "add" requires 2 operands, got 1`; count.Error() != want {
			t.Errorf("Error() = %q, want %q", count.Error(), want)
		}
	})
}
