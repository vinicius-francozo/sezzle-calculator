package httpapi

import (
	"log/slog"
	"net/http"
)

const (
	pathCalculate = "/api/v1/calculate"
	pathHealth    = "/api/v1/health"
)

func NewHandler(logger *slog.Logger) http.Handler {
	return withMiddleware(logger, routes())
}

func routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST "+pathCalculate, handleCalculate)
	mux.HandleFunc(pathCalculate, methodNotAllowed("POST, OPTIONS"))
	mux.HandleFunc("GET "+pathHealth, handleHealth)
	mux.HandleFunc(pathHealth, methodNotAllowed("GET, OPTIONS"))
	mux.HandleFunc("/", handleNotFound)

	return mux
}

func withMiddleware(logger *slog.Logger, next http.Handler) http.Handler {
	handler := CORS(next)
	handler = Recover(logger, handler)
	handler = RequestLog(logger, handler)
	return handler
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}

func handleNotFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, newAPIError(http.StatusNotFound, codeNotFound, "Unknown route"))
}

func methodNotAllowed(allow string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Allow", allow)
		writeError(w, newAPIError(http.StatusMethodNotAllowed, codeMethodNotAllowed, "Method not allowed for this route"))
	}
}

type healthResponse struct {
	Status string `json:"status"`
}
