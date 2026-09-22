# Build stage: pinned Go toolchain, statically linked binary.
FROM golang:1.26-alpine AS build

WORKDIR /src

# Dependencies first, so the module cache layer survives source changes.
# The glob also matches go.sum, which does not exist while the module is
# standard-library only.
COPY go.* ./
RUN go mod download

COPY . .

# CGO off and a trimmed build produce a self-contained binary that runs on an
# image with no libc and no shell.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /server ./cmd/server

# Runtime stage: distroless, no shell, no package manager, non-root by default.
FROM gcr.io/distroless/static-debian12:nonroot AS runtime

# A distroless image has no HTTP client, so the Compose healthcheck would have
# nothing to run. A single static busybox binary is the smallest way to give it
# one without giving up the distroless base for the application itself.
COPY --from=busybox:1.37-uclibc /bin/busybox /usr/bin/busybox

COPY --from=build /server /usr/local/bin/server

# The server reads PORT and defaults to 8080.
ENV PORT=8080
EXPOSE 8080

USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/server"]
