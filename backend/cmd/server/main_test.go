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

	requireNotServing(t, address)
}

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
		response, err := healthRequest(address)
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

func requireNotServing(t *testing.T, address string) {
	t.Helper()

	response, err := healthRequest(address)
	if err != nil {
		return
	}
	defer response.Body.Close()
	t.Fatalf("health status = %d after the shutdown, want a connection error", response.StatusCode)
}

func healthRequest(address string) (*http.Response, error) {
	client := &http.Client{
		Timeout:   2 * time.Second,
		Transport: &http.Transport{DisableKeepAlives: true},
	}
	defer client.CloseIdleConnections()

	return client.Get("http://" + address + "/api/v1/health")
}
