FROM golang:1.22-alpine AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /bin/clubpenguin-world ./main.go

FROM alpine:3.20

WORKDIR /app
COPY --from=build /bin/clubpenguin-world /app/clubpenguin-world
COPY public /app/public

ENV PORT=8081
EXPOSE 8081

CMD ["/app/clubpenguin-world"]
