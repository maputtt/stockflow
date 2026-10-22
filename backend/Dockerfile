FROM golang:1.22-alpine

WORKDIR /app

# Copy semua file source code
COPY . .

# Inisialisasi modul Go & download dependency langsung di dalam Docker
RUN go mod init stockflow/backend || true
RUN go get github.com/lib/pq && go get github.com/rs/cors

# Build aplikasi Go
RUN go build -o main .

EXPOSE 8080

CMD ["./main"]