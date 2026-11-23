ALTER TABLE bodies DROP CONSTRAINT planet_name_valid;
ALTER TABLE bodies ADD CONSTRAINT body_name_valid CHECK (
    name IS NULL OR (
        kind IN ('Planet', 'Moon') AND char_length(name) BETWEEN 1 AND 40
        AND name = btrim(name) AND name !~ '[[:cntrl:]]'
    )
);
