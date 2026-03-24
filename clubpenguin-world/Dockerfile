FROM golang:1.22-alpine AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /bin/clubpenguin-world ./main.go

FROM alpine:3.20

WORKDIR /app
RUN apk add --no-cache ca-certificates wget
COPY --from=build /bin/clubpenguin-world /app/clubpenguin-world
COPY public /app/public

ENV PORT=8081
ENV MAX_CLIENTS=300
ENV WS_ALLOWED_ORIGINS=
EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD sh -c "wget -q -T 2 -O - http://127.0.0.1:${PORT}/healthz > /dev/null || exit 1"

CMD ["/app/clubpenguin-world"]
