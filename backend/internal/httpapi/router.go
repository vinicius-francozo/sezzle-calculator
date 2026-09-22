package httpapi

import (
	"log/slog"
	"net/http"
)

// API paths, kept together so the router and the tests read the same names.
const (
	pathCalculate = "/api/v1/calculate"
	pathHealth    = "/api/v1/health"
)

// NewHandler builds the HTTP handler of the service: the routes of the API
// contract wrapped in the middleware chain.
//
// A path is registered twice — once with its method and once without — so that
// a known route reached with the wrong method answers 405 in the contract's
// error envelope instead of net/http's plain-text default.
func NewHandler(logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST "+pathCalculate, handleCalculate)
	mux.HandleFunc(pathCalculate, handleMethodNotAllowed)
	mux.HandleFunc("GET "+pathHealth, handleHealth)
	mux.HandleFunc(pathHealth, handleMethodNotAllowed)
	mux.HandleFunc("/", handleNotFound)

	var handler http.Handler = mux
	handler = CORS(handler)
	handler = Recover(logger, handler)
	handler = RequestLog(logger, handler)
	return handler
}

// handleHealth is the liveness probe used by the Docker Compose healthcheck.
func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}

func handleNotFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, newAPIError(http.StatusNotFound, codeNotFound, "Unknown route"))
}

func handleMethodNotAllowed(w http.ResponseWriter, _ *http.Request) {
	writeError(w, newAPIError(http.StatusMethodNotAllowed, codeMethodNotAllowed, "Method not allowed for this route"))
}

// healthResponse is the body of GET /api/v1/health.
type healthResponse struct {
	Status string `json:"status"`
}
