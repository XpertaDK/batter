.PHONY: build run test dev db-up db-down clean

BINARY=batter
GO=go

build:
	$(GO) build -o bin/$(BINARY) ./cmd/batter

run: build
	./bin/$(BINARY)

test:
	$(GO) test ./... -v

dev:
	$(GO) run ./cmd/batter

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

db-reset: db-down
	docker volume rm batter_pgdata || true
	$(MAKE) db-up

clean:
	rm -rf bin/

lint:
	golangci-lint run ./...

tidy:
	$(GO) mod tidy
