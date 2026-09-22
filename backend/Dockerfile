# Build stage: pinned Go toolchain, statically linked binary.
FROM golang:1.26-alpine AS build

WORKDIR /src

# Dependencies first, so the module cache layer survives source changes.
# The glob also matches go.sum, which does not exist while the module is
# standard-library only.
COPY go.* ./
RUN go mod download

COPY . .

# CGO off and a trimmed build produce a statically linked binary, so the
# runtime image needs no libc and no dynamic loader.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /server ./cmd/server

# Runtime stage: distroless — no package manager, no OS userland beyond what is
# copied in below, non-root by default.
FROM gcr.io/distroless/static-debian12:nonroot AS runtime

# Compose needs an HTTP client for the healthcheck and distroless ships none.
# A single static busybox is the smallest way to supply one, and it is worth
# being exact about what that costs: busybox is a multi-call binary, so this
# one file also puts sh, nc and the rest of its applets in the image, all
# runnable by the app user. The image is therefore not shell-free. The cleaner
# alternative is a -healthcheck flag on the server binary, which would keep the
# image down to a single executable at the price of putting probe logic in the
# application.
COPY --from=busybox:1.37-uclibc /bin/busybox /usr/bin/busybox

COPY --from=build /server /usr/local/bin/server

# The server reads PORT and defaults to 8080. This is the one place the port is
# declared; the Compose healthcheck reads it back out of the environment.
ENV PORT=8080
EXPOSE 8080

USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/server"]
