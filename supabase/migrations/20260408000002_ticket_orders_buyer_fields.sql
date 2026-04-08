ALTER TABLE ticket_orders
    ADD COLUMN buyer_birthdate DATE,
    ADD COLUMN buyer_country TEXT,
    ADD COLUMN buyer_zipcode TEXT,
    ADD COLUMN buyer_city TEXT;
