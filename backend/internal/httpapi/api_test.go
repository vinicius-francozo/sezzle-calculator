package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/vinicius-francozo/sezzle-calculator/backend/internal/calculator"
)

// request runs one request against the full handler, middleware included.
func request(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	NewHandler(slog.New(slog.DiscardHandler)).ServeHTTP(recorder, req)
	return recorder
}

func decodeBody[T any](t *testing.T, recorder *httptest.ResponseRecorder) T {
	t.Helper()

	var body T
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("response body %q is not valid JSON: %v", recorder.Body.String(), err)
	}
	return body
}

func TestCalculateSuccess(t *testing.T) {
	tests := []struct {
		name          string
		body          string
		wantOperation calculator.Operation
		wantOperands  []float64
		wantResult    float64
	}{
		{name: "add", body: `{"operation":"add","operands":[2,3]}`, wantOperation: calculator.OpAdd, wantOperands: []float64{2, 3}, wantResult: 5},
		{name: "subtract", body: `{"operation":"subtract","operands":[5,3]}`, wantOperation: calculator.OpSubtract, wantOperands: []float64{5, 3}, wantResult: 2},
		{name: "multiply", body: `{"operation":"multiply","operands":[4,2.5]}`, wantOperation: calculator.OpMultiply, wantOperands: []float64{4, 2.5}, wantResult: 10},
		{name: "divide", body: `{"operation":"divide","operands":[12,4]}`, wantOperation: calculator.OpDivide, wantOperands: []float64{12, 4}, wantResult: 3},
		{name: "negative operands", body: `{"operation":"add","operands":[-2,-3]}`, wantOperation: calculator.OpAdd, wantOperands: []float64{-2, -3}, wantResult: -5},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := request(t, http.MethodPost, pathCalculate, test.body)

			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d (body: %s)", recorder.Code, http.StatusOK, recorder.Body)
			}
			if contentType := recorder.Header().Get("Content-Type"); contentType != "application/json" {
				t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
			}

			got := decodeBody[calculateResponse](t, recorder)
			if got.Result != test.wantResult {
				t.Errorf("result = %v, want %v", got.Result, test.wantResult)
			}

			// The request is echoed back, so the response is self-describing.
			if got.Operation != test.wantOperation {
				t.Errorf("operation = %q, want %q", got.Operation, test.wantOperation)
			}
			if !slices.Equal(got.Operands, test.wantOperands) {
				t.Errorf("operands = %v, want %v", got.Operands, test.wantOperands)
			}
		})
	}
}

// Every row of the error catalogue in docs/api.md is reachable and answers
// with the documented status and code.
func TestErrorCatalogue(t *testing.T) {
	tests := []struct {
		name        string
		method      string
		path        string
		body        string
		wantStatus  int
		wantCode    string
		wantMessage string
	}{
		{
			name:       "malformed JSON",
			method:     http.MethodPost,
			path:       pathCalculate,
			body:       `{"operation":`,
			wantStatus: http.StatusBadRequest,
			wantCode:   codeInvalidJSON,
		},
		{
			name:       "empty body",
			method:     http.MethodPost,
			path:       pathCalculate,
			body:       "",
			wantStatus: http.StatusBadRequest,
			wantCode:   codeInvalidJSON,
		},
		{
			name:       "unknown field",
			method:     http.MethodPost,
			path:       pathCalculate,
			body:       `{"operation":"add","operands":[1,2],"precision":4}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   codeInvalidJSON,
		},
		{
			name:       "more than one JSON object",
			method:     http.MethodPost,
			path:       pathCalculate,
			body:       `{"operation":"add","operands":[1,2]}{"operation":"add","operands":[1,2]}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   codeInvalidJSON,
		},
		{
			name:       "body over the size limit",
			method:     http.MethodPost,
			path:       pathCalculate,
			body:       `{"operation":"add","operands":[` + strings.Repeat("1,", maxRequestBodyBytes) + `1]}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   codeInvalidJSON,
		},
		{
			name:        "missing operation",
			method:      http.MethodPost,
			path:        pathCalculate,
			body:        `{"operands":[1,2]}`,
			wantStatus:  http.StatusBadRequest,
			wantCode:    codeValidationError,
			wantMessage: `Field "operation" is required`,
		},
		{
			name:        "missing operands",
			method:      http.MethodPost,
			path:        pathCalculate,
			body:        `{"operation":"add"}`,
			wantStatus:  http.StatusBadRequest,
			wantCode:    codeValidationError,
			wantMessage: `Field "operands" is required`,
		},
		{
			name:        "non-numeric operand",
			method:      http.MethodPost,
			path:        pathCalculate,
			body:        `{"operation":"add","operands":["two",3]}`,
			wantStatus:  http.StatusBadRequest,
			wantCode:    codeValidationError,
			wantMessage: `Field "operands" has the wrong type`,
		},
		{
			name:        "wrong arity",
			method:      http.MethodPost,
			path:        pathCalculate,
			body:        `{"operation":"add","operands":[1]}`,
			wantStatus:  http.StatusBadRequest,
			wantCode:    codeValidationError,
			wantMessage: `Operation "add" requires 2 operands, got 1`,
		},
		{
			name:        "unsupported operation",
			method:      http.MethodPost,
			path:        pathCalculate,
			body:        `{"operation":"tangent","operands":[1]}`,
			wantStatus:  http.StatusBadRequest,
			wantCode:    codeUnsupportedOperation,
			wantMessage: `Unsupported operation "tangent"`,
		},
		{
			name:        "division by zero",
			method:      http.MethodPost,
			path:        pathCalculate,
			body:        `{"operation":"divide","operands":[12,0]}`,
			wantStatus:  http.StatusBadRequest,
			wantCode:    codeDivisionByZero,
			wantMessage: "Division by zero is undefined",
		},
		{
			name:        "overflow",
			method:      http.MethodPost,
			path:        pathCalculate,
			body:        `{"operation":"multiply","operands":[1e308,10]}`,
			wantStatus:  http.StatusBadRequest,
			wantCode:    codeOverflow,
			wantMessage: "Overflow: the result could not be calculated",
		},
		{
			name:       "unknown route",
			method:     http.MethodGet,
			path:       "/api/v1/nope",
			wantStatus: http.StatusNotFound,
			wantCode:   codeNotFound,
		},
		{
			name:       "wrong method on calculate",
			method:     http.MethodGet,
			path:       pathCalculate,
			wantStatus: http.StatusMethodNotAllowed,
			wantCode:   codeMethodNotAllowed,
		},
		{
			name:       "wrong method on health",
			method:     http.MethodPost,
			path:       pathHealth,
			wantStatus: http.StatusMethodNotAllowed,
			wantCode:   codeMethodNotAllowed,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := request(t, test.method, test.path, test.body)

			if recorder.Code != test.wantStatus {
				t.Errorf("status = %d, want %d", recorder.Code, test.wantStatus)
			}

			got := decodeBody[errorEnvelope](t, recorder)
			if got.Error.Code != test.wantCode {
				t.Errorf("code = %q, want %q", got.Error.Code, test.wantCode)
			}
			if got.Error.Message == "" {
				t.Error("message is empty, want human-readable text")
			}
			if test.wantMessage != "" && got.Error.Message != test.wantMessage {
				t.Errorf("message = %q, want %q", got.Error.Message, test.wantMessage)
			}
		})
	}
}

func TestHealth(t *testing.T) {
	recorder := request(t, http.MethodGet, pathHealth, "")

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if got := decodeBody[healthResponse](t, recorder); got.Status != "ok" {
		t.Errorf("status = %q, want %q", got.Status, "ok")
	}
}

func TestCORSPreflightIsAnswered(t *testing.T) {
	recorder := request(t, http.MethodOptions, pathCalculate, "")

	if recorder.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
	if origin := recorder.Header().Get("Access-Control-Allow-Origin"); origin != "*" {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", origin, "*")
	}
	if methods := recorder.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(methods, http.MethodPost) {
		t.Errorf("Access-Control-Allow-Methods = %q, want it to allow POST", methods)
	}
}
