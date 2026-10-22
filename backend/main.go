package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"

	_ "github.com/lib/pq"
	"github.com/rs/cors"
)

type Product struct {
	ID             int     `json:"id"`
	SKU            string  `json:"sku"`
	Name           string  `json:"name"`
	Price          int     `json:"price"`
	Stock          int     `json:"stock"`
	IsActive       bool    `json:"is_active"`
	CreatedAt      string  `json:"created_at"`
	LastMovementAt *string `json:"last_movement_at"`
}

type StockMovement struct {
	ID        int    `json:"id"`
	ProductID int    `json:"product_id"`
	Type      string `json:"type"`
	Qty       int    `json:"qty"`
	Note      string `json:"note"`
	CreatedAt string `json:"created_at"`
}

type SalesOrderItem struct {
	SKU       string `json:"sku"`
	Qty       int    `json:"qty"`
	UnitPrice int    `json:"unit_price,omitempty"`
}

type SalesOrder struct {
	ID          int              `json:"id"`
	Customer    string           `json:"customer"`
	Status      string           `json:"status"`
	Total       int              `json:"total"`
	CreatedAt   string           `json:"created_at"`
	CancelledAt *string          `json:"cancelled_at,omitempty"`
	Items       []SalesOrderItem `json:"items,omitempty"`
}

var db *sql.DB

func main() {
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "user")
	dbPass := getEnv("DB_PASSWORD", "password")
	dbName := getEnv("DB_NAME", "stockflow")

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPass, dbName)

	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal("Database ping failed:", err)
	}

	mux := http.NewServeMux()

	// Routes
	mux.HandleFunc("/api/products", handleProducts)
	mux.HandleFunc("/api/products/", handleProductDetail)
	mux.HandleFunc("/api/orders", handleOrders)
	mux.HandleFunc("/api/orders/", handleOrderDetail)

	handler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}).Handler(mux)

	port := getEnv("PORT", "8080")
	fmt.Printf("Server running on http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return fallback
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, code string, message string, extra map[string]interface{}) {
	errPayload := map[string]interface{}{
		"code":    code,
		"message": message,
	}
	for k, v := range extra {
		errPayload[k] = v
	}
	writeJSON(w, status, map[string]interface{}{
		"error": errPayload,
	})
}

// Handler: GET & POST /api/products
func handleProducts(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		search := r.URL.Query().Get("search")
		pageStr := r.URL.Query().Get("page")
		limitStr := r.URL.Query().Get("limit")

		page := 1
		limit := 10
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
		offset := (page - 1) * limit

		query := `
			SELECT p.id, p.sku, p.name, p.price, p.stock, p.is_active, p.created_at,
			       (SELECT created_at::text FROM stock_movements WHERE product_id = p.id ORDER BY created_at DESC LIMIT 1) as last_movement_at,
				   COUNT(*) OVER() as total_count
			FROM products p
			WHERE ($1 = '' OR LOWER(p.sku) LIKE LOWER($1) OR LOWER(p.name) LIKE LOWER($1))
			ORDER BY p.id DESC
			LIMIT $2 OFFSET $3
		`
		searchParam := "%" + search + "%"
		rows, err := db.Query(query, searchParam, limit, offset)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "DB_ERROR", err.Error(), nil)
			return
		}
		defer rows.Close()

		var products []Product
		total := 0
		for rows.Next() {
			var p Product
			var lastMov sql.NullString
			if err := rows.Scan(&p.ID, &p.SKU, &p.Name, &p.Price, &p.Stock, &p.IsActive, &p.CreatedAt, &lastMov, &total); err != nil {
				writeError(w, http.StatusInternalServerError, "SCAN_ERROR", err.Error(), nil)
				return
			}
			if lastMov.Valid {
				p.LastMovementAt = &lastMov.String
			}
			products = append(products, p)
		}

		if products == nil {
			products = []Product{}
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"data":  products,
			"page":  page,
			"limit": limit,
			"total": total,
		})
		return
	}

	if r.Method == http.MethodPost {
		var req struct {
			SKU   string `json:"sku"`
			Name  string `json:"name"`
			Price int    `json:"price"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SKU == "" || req.Name == "" || req.Price < 0 {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "SKU, Name required, Price >= 0", nil)
			return
		}

		var id int
		err := db.QueryRow("INSERT INTO products (sku, name, price) VALUES ($1, $2, $3) RETURNING id", req.SKU, req.Name, req.Price).Scan(&id)
		if err != nil {
			writeError(w, http.StatusConflict, "SKU_EXISTS", "SKU already exists", nil)
			return
		}

		var p Product
		db.QueryRow("SELECT id, sku, name, price, stock, is_active, created_at FROM products WHERE id = $1", id).Scan(
			&p.ID, &p.SKU, &p.Name, &p.Price, &p.Stock, &p.IsActive, &p.CreatedAt,
		)

		writeJSON(w, http.StatusCreated, p)
		return
	}

	writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
}

// Handler: /api/products/{id}, /stock, /movements
func handleProductDetail(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path[len("/api/products/"):]
	
	// Check sub-routes: /stock or /movements
	var idStr string
	var action string

	for i, c := range path {
		if c == '/' {
			idStr = path[:i]
			action = path[i+1:]
			break
		}
	}
	if idStr == "" {
		idStr = path
	}

	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid product ID", nil)
		return
	}

	if action == "stock" && r.Method == http.MethodPost {
		var req struct {
			Type string `json:"type"`
			Qty  int    `json:"qty"`
			Note string `json:"note"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.Type != "in" && req.Type != "out") || req.Qty <= 0 {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", "Type must be 'in' or 'out', qty > 0", nil)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "TX_ERROR", err.Error(), nil)
			return
		}
		defer tx.Rollback()

		var currentStock int
		err = tx.QueryRow("SELECT stock FROM products WHERE id = $1 FOR UPDATE", id).Scan(&currentStock)
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Product not found", nil)
			return
		}

		if req.Type == "out" && currentStock < req.Qty {
			writeError(w, http.StatusConflict, "INSUFFICIENT_STOCK", "Insufficient stock", map[string]interface{}{"available": currentStock})
			return
		}

		newStock := currentStock + req.Qty
		if req.Type == "out" {
			newStock = currentStock - req.Qty
		}

		_, err = tx.Exec("UPDATE products SET stock = $1 WHERE id = $2", newStock, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "UPDATE_ERROR", err.Error(), nil)
			return
		}

		_, err = tx.Exec("INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1, $2, $3, $4)", id, req.Type, req.Qty, req.Note)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "INSERT_ERROR", err.Error(), nil)
			return
		}

		tx.Commit()
		writeJSON(w, http.StatusOK, map[string]interface{}{"message": "Stock updated", "stock": newStock})
		return
	}

	if action == "movements" && r.Method == http.MethodGet {
		rows, err := db.Query("SELECT id, product_id, type, qty, COALESCE(note, ''), created_at FROM stock_movements WHERE product_id = $1 ORDER BY id DESC", id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "DB_ERROR", err.Error(), nil)
			return
		}
		defer rows.Close()

		var movements []StockMovement
		for rows.Next() {
			var m StockMovement
			rows.Scan(&m.ID, &m.ProductID, &m.Type, &m.Qty, &m.Note, &m.CreatedAt)
			movements = append(movements, m)
		}
		if movements == nil {
			movements = []StockMovement{}
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{"data": movements})
		return
	}

	if r.Method == http.MethodDelete {
		var count int
		db.QueryRow("SELECT COUNT(*) FROM stock_movements WHERE product_id = $1", id).Scan(&count)
		if count > 0 {
			writeError(w, http.StatusConflict, "PRODUCT_HAS_HISTORY", "Cannot delete product with stock movements", nil)
			return
		}

		res, err := db.Exec("DELETE FROM products WHERE id = $1", id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "DB_ERROR", err.Error(), nil)
			return
		}
		rowsAffected, _ := res.RowsAffected()
		if rowsAffected == 0 {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Product not found", nil)
			return
		}

		w.WriteHeader(http.StatusNoContent)
		return
	}
}

// Handler: POST /api/orders
func handleOrders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}

	var req struct {
		Customer string           `json:"customer"`
		Items    []SalesOrderItem `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Customer == "" || len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "Customer name and at least 1 item required", nil)
		return
	}

	// Validate items & duplicates
	skuMap := make(map[string]bool)
	for _, item := range req.Items {
		if item.Qty <= 0 {
			writeError(w, http.StatusBadRequest, "INVALID_QTY", "Quantity must be > 0", nil)
			return
		}
		if skuMap[item.SKU] {
			writeError(w, http.StatusBadRequest, "DUPLICATE_SKU", "Duplicate SKU in order items", nil)
			return
		}
		skuMap[item.SKU] = true
	}

	tx, err := db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "TX_ERROR", err.Error(), nil)
		return
	}
	defer tx.Rollback()

	totalOrder := 0
	var processedItems []SalesOrderItem

	for _, item := range req.Items {
		var pID int
		var price int
		var stock int

		err := tx.QueryRow("SELECT id, price, stock FROM products WHERE sku = $1 FOR UPDATE", item.SKU).Scan(&pID, &price, &stock)
		if err == sql.ErrNoRows {
			writeError(w, http.StatusBadRequest, "UNKNOWN_SKU", fmt.Sprintf("SKU %s not found", item.SKU), nil)
			return
		}

		if stock < item.Qty {
			writeError(w, http.StatusConflict, "INSUFFICIENT_STOCK", fmt.Sprintf("Insufficient stock for SKU %s", item.SKU), map[string]interface{}{
				"sku":       item.SKU,
				"available": stock,
			})
			return
		}

		// Deduct stock
		_, err = tx.Exec("UPDATE products SET stock = stock - $1 WHERE id = $2", item.Qty, pID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "UPDATE_ERROR", err.Error(), nil)
			return
		}

		// Record stock movement
		_, err = tx.Exec("INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1, 'out', $2, $3)", pID, item.Qty, "Sales Order")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "MOVEMENT_ERROR", err.Error(), nil)
			return
		}

		totalOrder += price * item.Qty
		item.UnitPrice = price
		processedItems = append(processedItems, item)
	}

	var orderID int
	err = tx.QueryRow("INSERT INTO sales_orders (customer, total) VALUES ($1, $2) RETURNING id", req.Customer, totalOrder).Scan(&orderID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "ORDER_INSERT_ERROR", err.Error(), nil)
		return
	}

	for _, item := range processedItems {
		_, err = tx.Exec("INSERT INTO sales_order_items (order_id, sku, qty, unit_price) VALUES ($1, $2, $3, $4)", orderID, item.SKU, item.Qty, item.UnitPrice)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "ITEM_INSERT_ERROR", err.Error(), nil)
			return
		}
	}

	tx.Commit()

	writeJSON(w, http.StatusCreated, SalesOrder{
		ID:        orderID,
		Customer:  req.Customer,
		Status:    "CREATED",
		Total:     totalOrder,
		CreatedAt: "now",
		Items:     processedItems,
	})
}

// Handler: /api/orders/{id} & /cancel
func handleOrderDetail(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path[len("/api/orders/"):]
	var idStr string
	var isCancel bool

	if len(path) > 7 && path[len(path)-7:] == "/cancel" {
		idStr = path[:len(path)-7]
		isCancel = true
	} else {
		idStr = path
	}

	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "Invalid order ID", nil)
		return
	}

	if isCancel && r.Method == http.MethodPost {
		tx, err := db.Begin()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "TX_ERROR", err.Error(), nil)
			return
		}
		defer tx.Rollback()

		var status string
		err = tx.QueryRow("SELECT status FROM sales_orders WHERE id = $1 FOR UPDATE", id).Scan(&status)
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Order not found", nil)
			return
		}

		if status == "CANCELLED" {
			writeError(w, http.StatusConflict, "ALREADY_CANCELLED", "Order is already cancelled", nil)
			return
		}

		// Restore stock
		rows, err := tx.Query("SELECT sku, qty FROM sales_order_items WHERE order_id = $1", id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "DB_ERROR", err.Error(), nil)
			return
		}
		defer rows.Close()

		type restoreItem struct {
			sku string
			qty int
		}
		var items []restoreItem
		for rows.Next() {
			var it restoreItem
			rows.Scan(&it.sku, &it.qty)
			items = append(items, it)
		}

		for _, it := range items {
			var pID int
			tx.QueryRow("SELECT id FROM products WHERE sku = $1", it.sku).Scan(&pID)
			tx.Exec("UPDATE products SET stock = stock + $1 WHERE id = $2", it.qty, pID)
			tx.Exec("INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1, 'in', $2, $3)", pID, it.qty, "Order Cancelled #"+idStr)
		}

		tx.Exec("UPDATE sales_orders SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1", id)
		tx.Commit()

		writeJSON(w, http.StatusOK, map[string]interface{}{"message": "Order cancelled & stock restored"})
		return
	}

	if r.Method == http.MethodGet {
		var o SalesOrder
		var cancelledAt sql.NullString
		err := db.QueryRow("SELECT id, customer, status, total, created_at, cancelled_at::text FROM sales_orders WHERE id = $1", id).Scan(
			&o.ID, &o.Customer, &o.Status, &o.Total, &o.CreatedAt, &cancelledAt,
		)
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Order not found", nil)
			return
		}
		if cancelledAt.Valid {
			o.CancelledAt = &cancelledAt.String
		}

		rows, _ := db.Query("SELECT sku, qty, unit_price FROM sales_order_items WHERE order_id = $1", id)
		defer rows.Close()
		for rows.Next() {
			var it SalesOrderItem
			rows.Scan(&it.SKU, &it.Qty, &it.UnitPrice)
			o.Items = append(o.Items, it)
		}

		writeJSON(w, http.StatusOK, o)
		return
	}
}