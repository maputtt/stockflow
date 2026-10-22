-- Create Tables
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products (id),
    type TEXT NOT NULL CHECK (type IN ('in', 'out')),
    qty INTEGER NOT NULL CHECK (qty > 0),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_orders (
    id SERIAL PRIMARY KEY,
    customer TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'CANCELLED')),
    total INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES sales_orders(id),
    sku TEXT NOT NULL REFERENCES products(sku),
    qty INTEGER NOT NULL CHECK (qty > 0),
    unit_price INTEGER NOT NULL
);

-- Seed Initial Products (12+ items)
INSERT INTO products (sku, name, price, stock) VALUES
('SKU-1001', 'Logitech Wireless Mouse M170', 150000, 25),
('SKU-1002', 'Keychron K2 Mechanical Keyboard', 1200000, 10),
('SKU-1003', 'Dell UltraSharp 24 Monitor', 3500000, 5),
('SKU-1004', 'USB-C Hub Multiport Adapter', 250000, 15),
('SKU-1005', 'Kingston SSD NVMe 1TB', 950000, 8),
('SKU-1006', 'Corsair Vengeance RAM 16GB', 800000, 12),
('SKU-1007', 'Sony WH-1000XM5 Headphones', 4500000, 4),
('SKU-1008', 'Anker PowerBank 20000mAh', 450000, 20),
('SKU-1009', 'Baseus Desk Lamp LED', 200000, 30),
('SKU-1010', 'Ergonomis Office Chair', 1800000, 3),
('SKU-1011', 'Webcam Full HD 1080p', 350000, 7),
('SKU-1012', 'Standing Desk Converter', 2200000, 2)
ON CONFLICT (sku) DO NOTHING;