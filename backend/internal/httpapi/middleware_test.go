package httpapi

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRecoverTurnsPanicIntoStructuredError(t *testing.T) {
	var logs bytes.Buffer
	panicking := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	})

	recorder := httptest.NewRecorder()
	handler := Recover(slog.New(slog.NewTextHandler(&logs, nil)), panicking)
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, pathCalculate, nil))

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}

	got := decodeBody[errorEnvelope](t, recorder)
	if got.Error.Code != codeInternalError {
		t.Errorf("code = %q, want %q", got.Error.Code, codeInternalError)
	}
	if strings.Contains(recorder.Body.String(), "boom") || strings.Contains(recorder.Body.String(), "goroutine") {
		t.Errorf("response body leaks internals: %s", recorder.Body)
	}
	if !strings.Contains(logs.String(), "boom") {
		t.Errorf("the panic was not logged: %s", logs.String())
	}
}

// TestHandlerChainRecoversPanics pins Recover into the assembled chain.
// Exercising Recover on its own, as the test above does, would keep passing if
// the wiring were dropped from withMiddleware, and a panic would then escape
// to net/http, which closes the connection instead of answering the contract's
// envelope.
func TestHandlerChainRecoversPanics(t *testing.T) {
	var logs bytes.Buffer
	panicking := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	})

	recorder := httptest.NewRecorder()
	handler := withMiddleware(slog.New(slog.NewTextHandler(&logs, nil)), panicking)
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, pathCalculate, nil))

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	got := decodeBody[errorEnvelope](t, recorder)
	if got.Error.Code != codeInternalError {
		t.Errorf("code = %q, want %q", got.Error.Code, codeInternalError)
	}
	if got.Error.Message == "" {
		t.Error("message is empty, want human-readable text")
	}
	if strings.Contains(recorder.Body.String(), "boom") || strings.Contains(recorder.Body.String(), "goroutine") {
		t.Errorf("response body leaks internals: %s", recorder.Body)
	}
	if !strings.Contains(logs.String(), "status=500") {
		t.Errorf("the recovered panic was not logged as a 500: %s", logs.String())
	}
}

func TestRequestLogRecordsTheOutcome(t *testing.T) {
	var logs bytes.Buffer
	handler := RequestLog(slog.New(slog.NewTextHandler(&logs, nil)), http.HandlerFunc(handleNotFound))

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/v1/nope", nil))

	for _, want := range []string{"method=GET", "path=/api/v1/nope", "status=404"} {
		if !strings.Contains(logs.String(), want) {
			t.Errorf("log line %q does not contain %q", logs.String(), want)
		}
	}
}
