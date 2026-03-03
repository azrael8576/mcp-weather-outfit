DROP TABLE IF EXISTS cities;
CREATE TABLE cities (id INTEGER PRIMARY KEY, name TEXT, country TEXT, lon REAL, lat REAL);
CREATE INDEX idx_name ON cities(name);
