CREATE TABLE missile_flights (
    id uuid PRIMARY KEY,
    universe uuid NOT NULL REFERENCES universes(id),
    owner uuid NOT NULL REFERENCES players(id),
    data jsonb NOT NULL
);
CREATE INDEX missile_flights_owner ON missile_flights(universe,owner) WHERE data->>'status'='InFlight';
CREATE INDEX missile_flights_incoming ON missile_flights(universe,(data->'terms'->'intent'->'target'->>'expected_owner')) WHERE data->>'status'='InFlight';
