-- Tags an Firmen: freie Schlagworte, durch Komma getrennt (z. B. „SEO-Lead, Gebiet Dortmund, Zahnarzt“).
-- Sie zeigen, welche Art Lead eine Firma ist und zu welchem Gebiet sie gehört; Firmenübersicht und Pipeline filtern danach.
ALTER TABLE firmen ADD COLUMN IF NOT EXISTS tags text;
