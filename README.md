# StockFlow — Mini Inventory & Order Management

Application built for managing warehouse inventory, processing stock adjustments, and recording sales orders. The application ensures atomic transactions to prevent stock overselling during concurrent order requests.

Built with **Go (Golang)**, **PostgreSQL**, and **React (TypeScript + Vite)**, fully orchestrated using **Docker Compose**.

---

## 🛠️ Tech Stack & Key Design Decisions

### Backend (Go)
- **Standard Library Choice:** Built using Go's native `net/http` and `database/sql` without external web frameworks to keep the runtime lightweight, predictable, and easy to maintain.
- **Atomic Transactions & Race Condition Guard:** Stock decrements during order creation and manual stock adjustments are wrapped inside PostgreSQL database transactions (`BEGIN ... COMMIT`) utilizing `FOR UPDATE` row locking. This guarantees stock levels never drop below zero under concurrent write requests.
- **Cross-Stack Error Envelopes:** Returns consistent JSON error structures. For stock shortages, it yields an HTTP `409 Conflict` containing the failing SKU and available stock quantity (`{"error":{"code":"INSUFFICIENT_STOCK", "sku":"...", "available": n}}`).

### Database (PostgreSQL 15)
- **Data Safety:** Uses DB-level check constraints (`price >= 0`, `stock >= 0`, `qty > 0`) as a secondary safety net.
- **Auto Bootstrapping:** Schema migrations and 12+ initial product seeds are automatically applied on container startup via `init.sql`.

### Frontend (React 18 + TypeScript + Vite)
- **Centralized API Layer:** Fetch calls and error response parsing are kept within a single module.
- **Inline Error Feedback:** Intercepts backend HTTP `409` conflict responses and presents inline notifications directly within the UI forms and modals instead of logging silently to the browser console.

---

## 🚀 Quick Setup

Prerequisites: [Docker Desktop](https://www.docker.com/products/docker-desktop/) must be running.

1. **Clone the repository:**
   ```
   git clone <YOUR_REPOSITORY_URL>
   cd stockflow
Start the containers:


docker compose up -d --build
Access endpoints:

Web Dashboard: http://localhost:3000

REST API: http://localhost:8080/api

Database: localhost:5432 (User: user, Pass: password, DB: stockflow)

## 🧪 API Usage (curl Snippets)
- **Fetch Products (Supports search query)**

curl -X GET "http://localhost:8080/api/products?search=Keyboard&page=1&limit=10"

- **Add New Product**

curl -X POST "http://localhost:8080/api/products" \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "SKU-2001",
    "name": "Logitech MX Master 3S",
    "price": 1450000
  }'

- **Adjust Stock (In / Out)**

curl -X POST "http://localhost:8080/api/products/1/stock" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "in",
    "qty": 10,
    "note": "Restock from primary supplier"
  }'

- **Create Sales Order**

curl -X POST "http://localhost:8080/api/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": "PT Usaha Jaya",
    "items": [
      {"sku": "SKU-1001", "qty": 2},
      {"sku": "SKU-1002", "qty": 1}
    ]
  }'

- **Cancel Order (Stock Auto-Restored)**

curl -X POST "http://localhost:8080/api/orders/1/cancel"

## 📁 Repository Layout

stockflow/
├── backend/
│   ├── main.go          # HTTP routing, handlers, and DB transaction logic
│   └── Dockerfile       # Go Alpine build stage
├── frontend/
│   ├── src/             # React TS UI components & API client
│   └── Dockerfile       # Node.js Vite container
├── docker-compose.yml   # Multi-container orchestrator
├── init.sql             # DB migrations & initial seed data
└── README.md            # Technical overview

## ⏱️ Development Notes & Next Steps
Development Time: ~6 hours total focused effort.

Potential Enhancements:

Add Idempotency-Key header support for POST /api/orders to guard against duplicate submissions during network retries.

Implement automated concurrency test suites using go test -race.

Add server-side pagination UI controls for handling larger product catalogs.