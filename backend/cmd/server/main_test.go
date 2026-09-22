package main

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestListenAddress(t *testing.T) {
	tests := []struct {
		name string
		port string
		want string
	}{
		{name: "default port", port: "", want: ":8080"},
		{name: "port from the environment", port: "9000", want: ":9000"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("PORT", test.port)

			if got := listenAddress(); got != test.want {
				t.Errorf("listenAddress() = %q, want %q", got, test.want)
			}
		})
	}
}

// The server serves the API and then shuts down cleanly when its context is
// cancelled, which is what the SIGTERM sent by Docker does in production.
func TestRunServesThenShutsDownOnContextCancellation(t *testing.T) {
	address := ephemeralAddress(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	stopped := make(chan error, 1)
	go func() {
		stopped <- run(ctx, slog.New(slog.DiscardHandler), address)
	}()

	waitUntilHealthy(t, address)
	cancel()

	select {
	case err := <-stopped:
		if err != nil {
			t.Fatalf("run() = %v, want nil after a clean shutdown", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("run() did not return after its context was cancelled")
	}
}

// A port that cannot be listened on is reported to the caller, which is what
// makes the process exit non-zero instead of pretending to serve.
func TestRunReportsAListenFailure(t *testing.T) {
	occupied, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserving a port: %v", err)
	}
	defer occupied.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := run(ctx, slog.New(slog.DiscardHandler), occupied.Addr().String()); err == nil {
		t.Error("run() = nil, want the error of a port already in use")
	}
}

// ephemeralAddress reserves a free port and releases it, so that the server
// under test can bind it without the test needing a fixed port.
func ephemeralAddress(t *testing.T) string {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserving a port: %v", err)
	}
	address := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatalf("releasing the reserved port: %v", err)
	}
	return address
}

func waitUntilHealthy(t *testing.T, address string) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		response, err := http.Get("http://" + address + "/api/v1/health")
		if err == nil {
			defer response.Body.Close()
			if response.StatusCode != http.StatusOK {
				t.Fatalf("health status = %d, want %d", response.StatusCode, http.StatusOK)
			}
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("the server did not start listening on %s", address)
}
