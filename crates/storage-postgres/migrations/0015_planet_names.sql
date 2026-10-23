-- NULL retains the unnamed fallback and the wire shape of historical bodies.
ALTER TABLE bodies ADD COLUMN name text;
ALTER TABLE bodies ADD CONSTRAINT planet_name_valid CHECK (
    name IS NULL OR (
        kind = 'Planet' AND char_length(name) BETWEEN 1 AND 40
        AND name = btrim(name) AND name !~ '[[:cntrl:]]'
    )
);
