// Command server runs the calculator HTTP microservice.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/vinicius-francozo/sezzle-calculator/backend/internal/httpapi"
)

const (
	defaultPort     = "8080"
	readTimeout     = 5 * time.Second
	writeTimeout    = 10 * time.Second
	idleTimeout     = 60 * time.Second
	shutdownTimeout = 10 * time.Second
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	if err := run(context.Background(), logger, listenAddress()); err != nil {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

// run owns the lifecycle of the server: it listens on address and serves
// until SIGINT or SIGTERM arrives, then drains in-flight requests before
// returning. The address is a parameter, and not read from the environment
// here, so that a test can run the whole lifecycle on an ephemeral port.
func run(ctx context.Context, logger *slog.Logger, address string) error {
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	server := &http.Server{
		Addr:              address,
		Handler:           httpapi.NewHandler(logger),
		ReadTimeout:       readTimeout,
		ReadHeaderTimeout: readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}

	serverErr := make(chan error, 1)
	go func() {
		logger.Info("server listening", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}

// listenAddress reads the port from the PORT environment variable, falling
// back to the documented default.
func listenAddress() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	return ":" + port
}
