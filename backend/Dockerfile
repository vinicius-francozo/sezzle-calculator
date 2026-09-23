FROM golang:1.26-alpine AS build

WORKDIR /src

COPY go.* ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /server ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

COPY --from=busybox:1.37-uclibc /bin/busybox /usr/bin/busybox

COPY --from=build /server /usr/local/bin/server

ENV PORT=8080
EXPOSE 8080

USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/server"]
